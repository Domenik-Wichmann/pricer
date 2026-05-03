const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  buildGeocodeId,
  buildGeocodingCacheKey,
  findNearestProductAvailability,
  handleNearestProductAvailabilityRequest,
  haversineDistanceKm,
  importDailySnapshotCsvStream,
  resolveDefaultCoordinateMode,
  searchCanonicalProductCatalog,
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

async function importRows(rows) {
  const store = new InMemoryDataBackboneStore();
  await importDailySnapshotCsvStream({
    store,
    csvStream: createCsv(rows),
    snapshotDate: '2026-04-21',
    sourceFileName: 'Fresh Market_42.csv',
    ingestedAt: '2026-04-22T08:00:00.000Z',
    enableLlmEnrichment: false,
  });
  return store;
}

async function importMilkStores() {
  const store = await importRows([
    '"68134","Fresh Market Sofia, Vitosha Boulevard 24","Milk 1L","1001","6","3.20","0"',
    '"68134","Fresh Market Sofia, Graf Ignatiev Street 10","Milk 1L","1001","6","2.60","0"',
    '"68134","Fresh Market Sofia, Mladost Boulevard 90","Milk 1L","1001","6","2.10","0"',
  ]);
  await attachMatchedGeocodes(store, {
    'Vitosha Boulevard 24': { latitude: 42.695, longitude: 23.321, formatted_address: 'Vitosha Boulevard 24, Sofia' },
    'Graf Ignatiev Street 10': { latitude: 42.691, longitude: 23.329, formatted_address: 'Graf Ignatiev Street 10, Sofia' },
    'Mladost Boulevard 90': { latitude: 42.647, longitude: 23.379, formatted_address: 'Mladost Boulevard 90, Sofia' },
  });
  return store;
}

async function attachMatchedGeocodes(store, coordinatesByAddressPart) {
  const state = await store.load();
  state.retailer_location_geocodes = state.retailer_locations.map((location) => {
    const match = Object.entries(coordinatesByAddressPart)
      .find(([addressPart]) => String(location.raw_address || '').includes(addressPart));
    if (!match) {
      return null;
    }

    const [addressPart, coordinates] = match;
    const cacheKey = buildGeocodingCacheKey(location);
    return {
      geocode_id: buildGeocodeId(cacheKey),
      cache_key: cacheKey,
      location_id: location.location_id,
      provider: 'fake',
      provider_place_id: `fake-${addressPart.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      query_text: `BG, Sofia, ${addressPart}`,
      formatted_address: coordinates.formatted_address,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      confidence: 0.9,
      confidence_reason: 'fixture_match',
      status: 'matched',
      rules_version: 'store-location-geocoding-v1',
      provenance: {
        source: 'retailer_locations',
        location_id: location.location_id,
        raw_address: location.raw_address,
        store_name_raw: location.store_name_raw,
      },
      raw_provider_result: null,
      geocoded_at: '2026-04-22T09:00:00.000Z',
      updated_at: '2026-04-22T09:00:00.000Z',
    };
  }).filter(Boolean);
  await store.save(state);
}

async function attachReviewedCoordinates(store, coordinatesByAddressPart) {
  const state = await store.load();
  state.reviewed_location_coordinates = state.retailer_locations.map((location) => {
    const match = Object.entries(coordinatesByAddressPart)
      .find(([addressPart]) => String(location.raw_address || '').includes(addressPart));
    if (!match) {
      return null;
    }

    const [addressPart, coordinates] = match;
    return {
      reviewed_coordinate_id: `reviewed-${addressPart.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      source_candidate_id: `candidate-${addressPart.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      source_type: 'retailer_location_geocode',
      source_id: `geocode-${addressPart.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      location_id: location.location_id,
      source_identity: `location|${location.location_id}`,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      confidence: coordinates.confidence ?? 0.95,
      correction_reason: 'fixture_reviewed_coordinate',
      approved_by: 'operator@example.test',
      approved_at: coordinates.approved_at || '2026-04-22T10:00:00.000Z',
      supersedes_id: coordinates.supersedes_id || null,
      is_active: coordinates.is_active !== false,
      provenance: {
        source: 'location_review_candidates',
        raw_address: location.raw_address,
        formatted_address: coordinates.formatted_address || null,
      },
      rules_version: 'reviewed-location-coordinate-v1',
      published_at: coordinates.published_at || '2026-04-22T10:05:00.000Z',
      updated_at: coordinates.updated_at || '2026-04-22T10:05:00.000Z',
    };
  }).filter(Boolean);
  await store.save(state);
}

function firstCanonicalProductId(state) {
  assert.ok(state.canonical_products.length > 0);
  return state.canonical_products[0].canonical_product_id;
}

async function withDefaultCoordinateMode(value, fn) {
  const previous = process.env.DEFAULT_COORDINATE_MODE;
  if (value === undefined) {
    delete process.env.DEFAULT_COORDINATE_MODE;
  } else {
    process.env.DEFAULT_COORDINATE_MODE = value;
  }

  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.DEFAULT_COORDINATE_MODE;
    } else {
      process.env.DEFAULT_COORDINATE_MODE = previous;
    }
  }
}

test('haversine distance helper returns deterministic kilometer distances', () => {
  const distance = haversineDistanceKm(
    { latitude: 42.6977, longitude: 23.3219 },
    { latitude: 42.691, longitude: 23.329 },
  );

  assert.equal(distance > 0.9 && distance < 1.0, true);
});

test('location-aware availability sorts offers by nearest store', async () => {
  const store = await importMilkStores();
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    canonicalProductId: firstCanonicalProductId(state),
    latitude: 42.6977,
    longitude: 23.3219,
    radiusKm: 10,
    limit: 3,
    sort: 'nearest',
  });

  assert.equal(result.status, 'matched');
  assert.equal(result.result_count, 3);
  assert.equal(result.offers[0].store_name_raw.includes('Vitosha Boulevard 24'), true);
  assert.equal(result.offers[0].distance_km <= result.offers[1].distance_km, true);
  assert.equal(result.offers[0].provenance.geocode_status, 'matched');
  assert.equal(result.offers[0].coordinate_source, 'provider');
});

test('location-aware availability sorts offers by cheapest store', async () => {
  const store = await importMilkStores();
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    queryText: 'milk',
    latitude: 42.6977,
    longitude: 23.3219,
    radiusKm: 10,
    limit: 3,
    sort: 'cheapest',
  });

  assert.equal(result.status, 'matched');
  assert.equal(result.offers[0].store_name_raw.includes('Mladost Boulevard 90'), true);
  assert.equal(result.offers[0].effective_price, 2.1);
});

test('location-aware availability filters stores outside radius', async () => {
  const store = await importMilkStores();
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    queryText: 'milk',
    latitude: 42.6977,
    longitude: 23.3219,
    radiusKm: 1.5,
    limit: 10,
    sort: 'nearest',
  });

  assert.equal(result.status, 'matched');
  assert.equal(result.result_count, 2);
  assert.equal(result.offers.every((offer) => offer.distance_km <= 1.5), true);
});

test('location-aware availability reports no nearby stores when geocoded offers are outside radius', async () => {
  const store = await importMilkStores();
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    queryText: 'milk',
    latitude: 42.6977,
    longitude: 23.3219,
    radiusKm: 0.1,
    limit: 10,
    sort: 'nearest',
  });

  assert.equal(result.status, 'no_nearby_stores');
  assert.equal(result.total_geocoded_offer_count, 3);
  assert.equal(result.result_count, 0);
});

test('location-aware availability reports product with no matched geocoded stores', async () => {
  const store = await importRows([
    '"68134","Fresh Market Sofia, Vitosha Boulevard 24","Yogurt 400g","2001","6","1.90","0"',
  ]);
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    canonicalProductId: firstCanonicalProductId(state),
    latitude: 42.6977,
    longitude: 23.3219,
    radiusKm: 10,
  });

  assert.equal(result.status, 'no_geocoded_locations');
  assert.deepEqual(result.coordinate_sources, ['unavailable']);
  assert.equal(result.result_count, 0);
});

test('location-aware availability reports product not found for unmatched query text', async () => {
  const store = await importMilkStores();
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    queryText: 'nonexistent specialty item',
    latitude: 42.6977,
    longitude: 23.3219,
    radiusKm: 10,
  });

  assert.equal(result.status, 'product_not_found');
  assert.equal(result.product, null);
});

test('location-aware availability rejects invalid coordinates', async () => {
  const store = await importMilkStores();
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    queryText: 'milk',
    latitude: 120,
    longitude: 23.3219,
    radiusKm: 10,
  });

  assert.equal(result.status, 'invalid_location');
  assert.equal(result.reason, 'latitude and longitude must be valid numeric coordinates');
});

test('normal product search still works without coordinates', async () => {
  const store = await importMilkStores();
  const state = await store.load();

  const result = searchCanonicalProductCatalog({
    state,
    queryText: 'milk',
    limit: 10,
  });

  assert.equal(result.total > 0, true);
  assert.equal(result.results[0].canonical_product_id, firstCanonicalProductId(state));
});

test('location-aware availability defaults to provider-only coordinates', async () => {
  const store = await importMilkStores();
  await attachReviewedCoordinates(store, {
    'Vitosha Boulevard 24': { latitude: 42.640, longitude: 23.380 },
  });
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    queryText: 'milk',
    latitude: 42.6977,
    longitude: 23.3219,
    radiusKm: 10,
    limit: 1,
  });

  assert.equal(result.status, 'matched');
  assert.equal(result.location.coordinate_mode, 'provider_only');
  assert.equal(result.offers[0].coordinate_source, 'provider');
  assert.equal(result.offers[0].latitude, 42.695);
  assert.equal(result.offers[0].reviewed_coordinate_id, null);
});

test('reviewed_first availability uses active reviewed coordinates when requested', async () => {
  const store = await importMilkStores();
  await attachReviewedCoordinates(store, {
    'Vitosha Boulevard 24': { latitude: 42.640, longitude: 23.380 },
  });
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    queryText: 'milk',
    latitude: 42.6401,
    longitude: 23.3801,
    radiusKm: 10,
    limit: 1,
    coordinateMode: 'reviewed_first',
  });

  assert.equal(result.status, 'matched');
  assert.equal(result.location.coordinate_mode, 'reviewed_first');
  assert.equal(result.offers[0].store_name_raw.includes('Vitosha Boulevard 24'), true);
  assert.equal(result.offers[0].coordinate_source, 'reviewed');
  assert.equal(result.offers[0].latitude, 42.64);
  assert.equal(result.offers[0].reviewed_coordinate_id, 'reviewed-vitosha-boulevard-24');
});

test('reviewed_first availability falls back to provider coordinates', async () => {
  const store = await importMilkStores();
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    queryText: 'milk',
    latitude: 42.6977,
    longitude: 23.3219,
    radiusKm: 10,
    limit: 1,
    coordinateMode: 'reviewed_first',
  });

  assert.equal(result.status, 'matched');
  assert.equal(result.location.coordinate_mode, 'reviewed_first');
  assert.equal(result.offers[0].coordinate_source, 'provider');
  assert.equal(result.offers[0].latitude, 42.695);
});

test('reviewed_first availability ignores superseded reviewed coordinates', async () => {
  const store = await importMilkStores();
  await attachReviewedCoordinates(store, {
    'Vitosha Boulevard 24': { latitude: 42.640, longitude: 23.380, is_active: false },
  });
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    queryText: 'milk',
    latitude: 42.6977,
    longitude: 23.3219,
    radiusKm: 10,
    limit: 1,
    coordinateMode: 'reviewed_first',
  });

  assert.equal(result.status, 'matched');
  assert.equal(result.offers[0].coordinate_source, 'provider');
  assert.equal(result.offers[0].reviewed_coordinate_id, null);
  assert.equal(result.offers[0].latitude, 42.695);
});

test('nearest availability response includes coordinate source metadata', async () => {
  const store = await importMilkStores();
  await attachReviewedCoordinates(store, {
    'Vitosha Boulevard 24': { latitude: 42.640, longitude: 23.380 },
  });
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    queryText: 'milk',
    latitude: 42.6401,
    longitude: 23.3801,
    radiusKm: 10,
    limit: 1,
    coordinateMode: 'reviewed_first',
  });

  assert.equal(result.status, 'matched');
  assert.equal(result.location.coordinate_mode, 'reviewed_first');
  assert.deepEqual(result.coordinate_sources, ['reviewed']);
  assert.equal(result.offers[0].coordinate_source, 'reviewed');
  assert.equal(result.offers[0].provenance.coordinate_source, 'reviewed');
  assert.equal(result.offers[0].provenance.coordinate_mode, 'reviewed_first');
});

test('nearest availability API rejects invalid coordinate mode', async () => {
  const store = await importMilkStores();

  const response = await handleNearestProductAvailabilityRequest({
    store,
    body: {
      query: 'milk',
      latitude: 42.6977,
      longitude: 23.3219,
      coordinate_mode: 'reviewed_only',
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.status, 'invalid_location');
  assert.equal(response.body.reason, 'coordinate_mode must be provider_only or reviewed_first');
});

test('nearest availability unset coordinate-mode config defaults to provider-only', async () => {
  await withDefaultCoordinateMode(undefined, async () => {
    const store = await importMilkStores();
    await attachReviewedCoordinates(store, {
      'Vitosha Boulevard 24': { latitude: 42.640, longitude: 23.380 },
    });
    const state = await store.load();

    const result = findNearestProductAvailability({
      state,
      queryText: 'milk',
      latitude: 42.6977,
      longitude: 23.3219,
      radiusKm: 10,
      limit: 1,
    });

    assert.equal(resolveDefaultCoordinateMode(), 'provider_only');
    assert.equal(result.status, 'matched');
    assert.equal(result.location.coordinate_mode, 'provider_only');
    assert.equal(result.offers[0].coordinate_source, 'provider');
  });
});

test('nearest availability invalid coordinate-mode config falls back to provider-only', async () => {
  await withDefaultCoordinateMode('reviewed_only', async () => {
    const store = await importMilkStores();
    await attachReviewedCoordinates(store, {
      'Vitosha Boulevard 24': { latitude: 42.640, longitude: 23.380 },
    });
    const state = await store.load();

    const result = findNearestProductAvailability({
      state,
      queryText: 'milk',
      latitude: 42.6977,
      longitude: 23.3219,
      radiusKm: 10,
      limit: 1,
    });

    assert.equal(resolveDefaultCoordinateMode(), 'provider_only');
    assert.equal(result.status, 'matched');
    assert.equal(result.location.coordinate_mode, 'provider_only');
    assert.equal(result.offers[0].coordinate_source, 'provider');
  });
});

test('nearest availability reviewed_first config changes default coordinate mode', async () => {
  await withDefaultCoordinateMode('reviewed_first', async () => {
    const store = await importMilkStores();
    await attachReviewedCoordinates(store, {
      'Vitosha Boulevard 24': { latitude: 42.640, longitude: 23.380 },
    });
    const state = await store.load();

    const result = findNearestProductAvailability({
      state,
      queryText: 'milk',
      latitude: 42.6401,
      longitude: 23.3801,
      radiusKm: 10,
      limit: 1,
    });

    assert.equal(resolveDefaultCoordinateMode(), 'reviewed_first');
    assert.equal(result.status, 'matched');
    assert.equal(result.location.coordinate_mode, 'reviewed_first');
    assert.equal(result.offers[0].coordinate_source, 'reviewed');
  });
});

test('nearest availability explicit request coordinate mode overrides config', async () => {
  await withDefaultCoordinateMode('reviewed_first', async () => {
    const store = await importMilkStores();
    await attachReviewedCoordinates(store, {
      'Vitosha Boulevard 24': { latitude: 42.640, longitude: 23.380 },
    });

    const response = await handleNearestProductAvailabilityRequest({
      store,
      body: {
        query: 'milk',
        latitude: 42.6977,
        longitude: 23.3219,
        radius_km: 10,
        limit: 1,
        coordinate_mode: 'provider_only',
      },
    });

    assert.equal(response.status, 200);
    const result = response.body;
    assert.equal(result.status, 'matched');
    assert.equal(result.location.coordinate_mode, 'provider_only');
    assert.equal(result.offers[0].coordinate_source, 'provider');
  });
});

test('nearest availability returns controlled Firestore limitation instead of full-loading runtime data', async () => {
  const response = await handleNearestProductAvailabilityRequest({
    store: {
      isFirestoreBackboneStore: true,
      async load() {
        throw new Error('full store load should not be used by nearest availability on Firestore');
      },
    },
    body: {
      canonical_product_id: 'cp_milk',
      latitude: 42.6977,
      longitude: 23.3219,
    },
  });

  assert.equal(response.status, 503);
  assert.match(response.body.error, /compact production read model/);
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

  console.log(`\nPhase 6 location-availability tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
