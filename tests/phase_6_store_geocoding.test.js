const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  buildGeocodingCacheKey,
  buildGeocodingQueryText,
  createFakeGeocodingProvider,
  geocodeManualAddress,
  geocodeRetailerLocations,
  handleManualAddressGeocodeRequest,
  importDailySnapshotCsvStream,
} = require('../app/functions/src');
const { SOURCE_HEADERS } = require('../app/functions/src/phase1/constants');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createCsv(rows) {
  const header = [
    SOURCE_HEADERS.localityCode,
    SOURCE_HEADERS.storeNameRaw,
    SOURCE_HEADERS.productNameRaw,
    SOURCE_HEADERS.productCode,
    SOURCE_HEADERS.categoryCode,
    SOURCE_HEADERS.retailPrice,
    SOURCE_HEADERS.promoPrice,
  ].map((value) => `"${value}"`).join(',');

  return Readable.from([[header, ...rows].join('\n')]);
}

async function importRows({
  rows,
  sourceFileName = 'STORE_LOCATIONS_100.csv',
}) {
  const store = new InMemoryDataBackboneStore();
  await importDailySnapshotCsvStream({
    store,
    csvStream: createCsv(rows),
    snapshotDate: '2026-04-21',
    sourceFileName,
    ingestedAt: '2026-04-22T08:00:00.000Z',
    enableLlmEnrichment: false,
  });
  return store;
}

function matchedResult(overrides = {}) {
  return {
    results: [{
      provider_place_id: 'fake-place-1',
      formatted_address: 'ул. Капитан Райчо 32, Пловдив, България',
      latitude: 42.142,
      longitude: 24.749,
      confidence: 0.91,
      confidence_reason: 'fake_exact_address_match',
      ...overrides,
    }],
  };
}

test('geocoding matches Bulgarian street-marker addresses and preserves location raw fields', async () => {
  const store = await importRows({
    rows: [
      '"56784","Аптека Марешки / 637 / гр.Пловдив ул. Капитан Райчо 32","Aspirin 20 tablets","2001","99","3.50","0"',
    ],
  });
  const before = await store.load();
  const location = before.retailer_locations[0];
  const queryText = buildGeocodingQueryText(location);
  const provider = createFakeGeocodingProvider({
    provider: 'fake-bg-geocoder',
    defaultResponse: matchedResult(),
  });

  const result = await geocodeRetailerLocations({
    store,
    provider,
    geocodedAt: '2026-04-22T09:00:00.000Z',
  });
  const after = await store.load();
  const record = result.records[0];

  assert.equal(provider.calls.length, 1);
  assert.equal(record.status, 'matched');
  assert.equal(record.provider, 'fake-bg-geocoder');
  assert.equal(record.provider_place_id, 'fake-place-1');
  assert.equal(record.query_text, queryText);
  assert.equal(record.query_text.includes('BG'), true);
  assert.equal(record.query_text.includes('Пловдив'), true);
  assert.equal(record.query_text.includes('Капитан Райчо 32'), true);
  assert.equal(record.latitude, 42.142);
  assert.equal(record.longitude, 24.749);
  assert.equal(record.confidence, 0.91);
  assert.equal(record.provenance.location_id, location.location_id);
  assert.deepEqual(after.retailer_locations, before.retailer_locations);
});

test('geocoding builds a conservative query for slash-separated Sofia addresses', async () => {
  const store = await importRows({
    rows: [
      '"68134","187 - София/Околовръстен път 214","Chocolate Milk 1L","1001","6","2.39","0"',
    ],
    sourceFileName: 'Лидл България_131071587.csv',
  });
  const state = await store.load();
  const location = state.retailer_locations[0];
  const provider = createFakeGeocodingProvider({
    defaultResponse: matchedResult({
      provider_place_id: 'fake-sofia-ring-road',
      formatted_address: 'Околовръстен път 214, София, България',
      latitude: 42.627,
      longitude: 23.403,
      confidence: 0.87,
      confidence_reason: 'fake_slash_address_match',
    }),
  });

  const result = await geocodeRetailerLocations({
    store,
    provider,
    geocodedAt: '2026-04-22T09:05:00.000Z',
  });
  const record = result.records[0];

  assert.equal(record.status, 'matched');
  assert.equal(record.query_text, 'BG, София, Околовръстен път 214, 187 - София');
  assert.equal(record.formatted_address, 'Околовръстен път 214, София, България');
  assert.equal(record.latitude, 42.627);
  assert.equal(record.longitude, 23.403);
});

test('geocoding skips store-only locations without provider calls', async () => {
  const store = await importRows({
    rows: [
      '"65677","Хранителна борса Сарандиев","Бял хляб 650гр","17","1","0.92","0"',
    ],
  });
  const provider = createFakeGeocodingProvider({
    defaultResponse: matchedResult(),
  });

  const result = await geocodeRetailerLocations({
    store,
    provider,
    geocodedAt: '2026-04-22T09:10:00.000Z',
  });
  const record = result.records[0];

  assert.equal(provider.calls.length, 0);
  assert.equal(record.status, 'skipped');
  assert.equal(record.provider, null);
  assert.equal(record.latitude, null);
  assert.equal(record.longitude, null);
  assert.equal(record.confidence_reason, 'missing_city_or_address');
  assert.equal(result.metrics.skipped, 1);
});

test('geocoding records ambiguous provider results without coordinates', async () => {
  const store = await importRows({
    rows: [
      '"68134","REMEDIUM 1 - ул. Добруджа №15","Aspirin 20 tablets","2001","99","3.50","0"',
    ],
  });
  const provider = createFakeGeocodingProvider({
    defaultResponse: {
      confidence_reason: 'fake_multiple_candidates',
      results: [
        {
          provider_place_id: 'candidate-a',
          formatted_address: 'ул. Добруджа 15, София',
          latitude: 42.69,
          longitude: 23.33,
          confidence: 0.76,
        },
        {
          provider_place_id: 'candidate-b',
          formatted_address: 'ул. Добруджа 15, Варна',
          latitude: 43.21,
          longitude: 27.91,
          confidence: 0.73,
        },
      ],
    },
  });

  const result = await geocodeRetailerLocations({
    store,
    provider,
    geocodedAt: '2026-04-22T09:15:00.000Z',
  });
  const record = result.records[0];

  assert.equal(record.status, 'ambiguous');
  assert.equal(record.provider_place_id, null);
  assert.equal(record.latitude, null);
  assert.equal(record.longitude, null);
  assert.equal(record.confidence_reason, 'fake_multiple_candidates');
  assert.equal(record.raw_provider_result.length, 2);
  assert.equal(result.metrics.ambiguous, 1);
});

test('geocoding reuses matched cache records by normalized country city address and store identity', async () => {
  const store = await importRows({
    rows: [
      '"68134","Fresh Market Sofia, Vitosha Boulevard 24","Milk 1L","1001","6","2.40","0"',
    ],
  });
  const firstProvider = createFakeGeocodingProvider({
    defaultResponse: matchedResult({
      provider_place_id: 'fake-vitosha-24',
      formatted_address: 'Vitosha Boulevard 24, Sofia, Bulgaria',
      latitude: 42.695,
      longitude: 23.321,
      confidence: 0.93,
    }),
  });
  const first = await geocodeRetailerLocations({
    store,
    provider: firstProvider,
    geocodedAt: '2026-04-22T09:20:00.000Z',
  });
  const location = (await store.load()).retailer_locations[0];
  const cacheKey = buildGeocodingCacheKey(location);

  const secondProvider = createFakeGeocodingProvider({
    defaultResponse: new Error('provider should not be called on cache hit'),
  });
  const second = await geocodeRetailerLocations({
    store,
    provider: secondProvider,
    geocodedAt: '2026-04-22T09:25:00.000Z',
  });

  assert.equal(firstProvider.calls.length, 1);
  assert.equal(secondProvider.calls.length, 0);
  assert.equal(first.records[0].cache_key, cacheKey);
  assert.equal(second.records[0].cache_key, cacheKey);
  assert.equal(second.records[0].status, 'matched');
  assert.equal(second.records[0].provider_place_id, 'fake-vitosha-24');
  assert.equal(second.metrics.cache_hits, 1);
});

test('manual address geocoding uses fake provider and preserves raw provenance', async () => {
  const store = new InMemoryDataBackboneStore();
  const provider = createFakeGeocodingProvider({
    provider: 'fake-manual-geocoder',
    defaultResponse: matchedResult({
      provider_place_id: 'manual-vitosha-24',
      formatted_address: 'Vitosha Boulevard 24, Sofia, Bulgaria',
      latitude: 42.695,
      longitude: 23.321,
      confidence: 0.9,
      confidence_reason: 'fake_manual_match',
    }),
  });

  const result = await geocodeManualAddress({
    store,
    provider,
    input: {
      user_id: 'user-1',
      address_raw: 'Vitosha Boulevard 24',
      city: 'Sofia',
      country: 'BG',
      display_name: 'Gym',
    },
    geocodedAt: '2026-04-27T08:00:00.000Z',
  });
  const state = await store.load();

  assert.equal(result.status, 'matched');
  assert.equal(result.cache_hit, false);
  assert.equal(provider.calls.length, 1);
  assert.equal(result.geocode.provider, 'fake-manual-geocoder');
  assert.equal(result.geocode.provider_place_id, 'manual-vitosha-24');
  assert.equal(result.geocode.latitude, 42.695);
  assert.equal(result.geocode.longitude, 23.321);
  assert.equal(result.geocode.provenance.source, 'manual_address');
  assert.equal(result.geocode.provenance.address_raw, 'Vitosha Boulevard 24');
  assert.equal(state.manual_location_geocodes.length, 1);
});

test('manual address geocoding reuses cache before provider calls', async () => {
  const store = new InMemoryDataBackboneStore();
  const firstProvider = createFakeGeocodingProvider({
    defaultResponse: matchedResult({
      provider_place_id: 'manual-cache-hit',
      latitude: 42.7,
      longitude: 23.3,
    }),
  });

  await geocodeManualAddress({
    store,
    provider: firstProvider,
    input: {
      user_id: 'user-1',
      address_raw: 'ul. Solunska 12',
      city: 'Sofia',
    },
  });
  const secondProvider = createFakeGeocodingProvider({
    defaultResponse: new Error('provider should not be called'),
  });
  const second = await geocodeManualAddress({
    store,
    provider: secondProvider,
    input: {
      user_id: 'user-1',
      address_raw: 'ul. Solunska 12',
      city: 'Sofia',
    },
  });

  assert.equal(firstProvider.calls.length, 1);
  assert.equal(secondProvider.calls.length, 0);
  assert.equal(second.cache_hit, true);
  assert.equal(second.status, 'matched');
  assert.equal(second.geocode.provider_place_id, 'manual-cache-hit');
});

test('manual address geocoding handler rejects missing user identity and invalid input', async () => {
  const store = new InMemoryDataBackboneStore();
  const missingUser = await handleManualAddressGeocodeRequest({
    store,
    body: { address_raw: 'Sofia center' },
    req: { headers: {} },
  });
  const invalidAddress = await handleManualAddressGeocodeRequest({
    store,
    body: { address_raw: '  ' },
    req: { headers: { 'x-pricer-owner-id': 'user-1' } },
  });

  assert.equal(missingUser.status, 400);
  assert.equal(missingUser.body.error, 'x-pricer-owner-id is required');
  assert.equal(invalidAddress.status, 400);
  assert.equal(invalidAddress.body.status, 'invalid_input');
});

async function run() {
  let failed = 0;

  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error.stack);
    }
  }

  console.log(`\nPhase 6 store-geocoding tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
