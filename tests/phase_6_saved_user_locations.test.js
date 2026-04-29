const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  buildGeocodeId,
  buildGeocodingCacheKey,
  deleteSavedUserLocation,
  findNearestProductAvailability,
  handleDeleteSavedUserLocationRequest,
  handleListSavedUserLocationsRequest,
  handleNearestProductAvailabilityRequest,
  handleUpsertSavedUserLocationRequest,
  importDailySnapshotCsvStream,
  listSavedUserLocations,
  resolveLocationForSearch,
  upsertSavedUserLocation,
} = require('../app/functions/src');
const { SOURCE_HEADERS } = require('../app/functions/src/phase1/constants');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function req(ownerId = 'user-1') {
  return {
    headers: {
      'x-pricer-owner-id': ownerId,
      'x-pricer-owner-type': 'anonymous',
    },
  };
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

async function importMilkStores() {
  const store = new InMemoryDataBackboneStore();
  await importDailySnapshotCsvStream({
    store,
    csvStream: createCsv([
      '"68134","Fresh Market Sofia, Vitosha Boulevard 24","Milk 1L","1001","6","3.20","0"',
      '"68134","Fresh Market Sofia, Graf Ignatiev Street 10","Milk 1L","1001","6","2.60","0"',
      '"68134","Fresh Market Sofia, Mladost Boulevard 90","Milk 1L","1001","6","2.10","0"',
    ]),
    snapshotDate: '2026-04-21',
    sourceFileName: 'Fresh Market_42.csv',
    ingestedAt: '2026-04-22T08:00:00.000Z',
    enableLlmEnrichment: false,
  });
  await attachMatchedGeocodes(store, {
    'Vitosha Boulevard 24': { latitude: 42.695, longitude: 23.321 },
    'Graf Ignatiev Street 10': { latitude: 42.691, longitude: 23.329 },
    'Mladost Boulevard 90': { latitude: 42.647, longitude: 23.379 },
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
      formatted_address: `${addressPart}, Sofia`,
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
      },
      raw_provider_result: null,
      geocoded_at: '2026-04-22T09:00:00.000Z',
      updated_at: '2026-04-22T09:00:00.000Z',
    };
  }).filter(Boolean);
  await store.save(state);
}

async function createLocation(store, overrides = {}) {
  return upsertSavedUserLocation({
    store,
    input: {
      user_id: 'user-1',
      label: 'home',
      display_name: 'Home',
      address_raw: 'Sofia center',
      latitude: 42.6977,
      longitude: 23.3219,
      default_radius_km: 1.5,
      default_sort: 'nearest',
      source: 'manual',
      is_default: true,
      ...overrides,
    },
    savedAt: overrides.savedAt || '2026-04-22T10:00:00.000Z',
  });
}

test('saved user locations create home work and custom records', async () => {
  const store = new InMemoryDataBackboneStore();

  const home = await createLocation(store);
  const work = await createLocation(store, {
    label: 'work',
    display_name: 'Work',
    latitude: 42.69,
    longitude: 23.33,
    is_default: false,
    savedAt: '2026-04-22T10:01:00.000Z',
  });
  const custom = await createLocation(store, {
    label: 'custom',
    display_name: 'Gym',
    latitude: 42.71,
    longitude: 23.35,
    is_default: false,
    savedAt: '2026-04-22T10:02:00.000Z',
  });
  const listed = await listSavedUserLocations({ store, userId: 'user-1' });

  assert.equal(home.status, 200);
  assert.equal(work.status, 200);
  assert.equal(custom.status, 200);
  assert.equal(listed.body.total, 3);
  assert.deepEqual(listed.body.locations.map((location) => location.label).sort(), ['custom', 'home', 'work']);
});

test('saved user locations update existing home by user and label', async () => {
  const store = new InMemoryDataBackboneStore();
  const first = await createLocation(store, {
    address_raw: 'Old home',
    latitude: 42.6977,
    longitude: 23.3219,
  });
  const second = await createLocation(store, {
    address_raw: 'New home',
    latitude: 42.7,
    longitude: 23.32,
    default_sort: 'cheapest',
    savedAt: '2026-04-22T11:00:00.000Z',
  });
  const listed = await listSavedUserLocations({ store, userId: 'user-1' });

  assert.equal(first.body.location.location_id, second.body.location.location_id);
  assert.equal(listed.body.total, 1);
  assert.equal(listed.body.locations[0].address_raw, 'New home');
  assert.equal(listed.body.locations[0].default_sort, 'cheapest');
});

test('saved user locations reject invalid coordinates', async () => {
  const store = new InMemoryDataBackboneStore();
  const result = await createLocation(store, {
    latitude: 120,
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'latitude must be a valid coordinate');
});

test('saved user location resolution applies default radius and sort', async () => {
  const store = new InMemoryDataBackboneStore();
  const home = await createLocation(store, {
    default_radius_km: 1.5,
    default_sort: 'cheapest',
  });
  const state = await store.load();

  const resolved = resolveLocationForSearch({
    state,
    userId: 'user-1',
    savedLocationId: home.body.location.location_id,
  });

  assert.equal(resolved.value.radius_km, 1.5);
  assert.equal(resolved.value.sort, 'cheapest');
  assert.equal(resolved.value.saved_location.location_id, home.body.location.location_id);
});

test('saved user location resolves into nearest-store availability search', async () => {
  const store = await importMilkStores();
  const home = await createLocation(store, {
    default_radius_km: 1.5,
    default_sort: 'nearest',
  });
  const state = await store.load();

  const result = findNearestProductAvailability({
    state,
    queryText: 'milk',
    userId: 'user-1',
    savedLocationId: home.body.location.location_id,
    limit: 10,
  });

  assert.equal(result.status, 'matched');
  assert.equal(result.location.saved_location_id, home.body.location.location_id);
  assert.equal(result.location.radius_km, 1.5);
  assert.equal(result.result_count, 2);
});

test('saved user location label resolution rejects ambiguous labels', async () => {
  const store = new InMemoryDataBackboneStore();
  await createLocation(store, {
    label: 'custom',
    display_name: 'Gym',
    latitude: 42.71,
    longitude: 23.35,
    is_default: false,
    savedAt: '2026-04-22T10:02:00.000Z',
  });
  await createLocation(store, {
    label: 'custom',
    display_name: 'School',
    latitude: 42.72,
    longitude: 23.36,
    is_default: false,
    savedAt: '2026-04-22T10:03:00.000Z',
  });
  const state = await store.load();

  const resolved = resolveLocationForSearch({
    state,
    userId: 'user-1',
    label: 'custom',
  });

  assert.equal(resolved.status, 'invalid_location');
  assert.equal(resolved.error, 'saved location label is ambiguous');
});

test('saved user locations delete one location', async () => {
  const store = new InMemoryDataBackboneStore();
  const home = await createLocation(store);

  const deleted = await deleteSavedUserLocation({
    store,
    userId: 'user-1',
    locationId: home.body.location.location_id,
  });
  const listed = await listSavedUserLocations({ store, userId: 'user-1' });

  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted, true);
  assert.equal(listed.body.total, 0);
});

test('saved-location API handlers require user identity and support CRUD', async () => {
  const store = new InMemoryDataBackboneStore();
  const missing = await handleListSavedUserLocationsRequest({ store, req: { headers: {} } });
  assert.equal(missing.status, 400);

  const created = await handleUpsertSavedUserLocationRequest({
    store,
    req: req('api-user'),
    body: {
      label: 'home',
      display_name: 'Home',
      latitude: 42.6977,
      longitude: 23.3219,
      source: 'manual',
    },
  });
  const listed = await handleListSavedUserLocationsRequest({ store, req: req('api-user') });
  const deleted = await handleDeleteSavedUserLocationRequest({
    store,
    req: req('api-user'),
    params: { id: created.body.location.location_id },
  });

  assert.equal(created.status, 200);
  assert.equal(listed.body.total, 1);
  assert.equal(deleted.status, 200);
});

test('nearest availability API handler accepts saved location resolution', async () => {
  const store = await importMilkStores();
  const home = await createLocation(store, {
    user_id: 'api-user',
    default_radius_km: 1.5,
  });

  const response = await handleNearestProductAvailabilityRequest({
    store,
    req: req('api-user'),
    body: {
      query: 'milk',
      saved_location_id: home.body.location.location_id,
      sort: 'nearest',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'matched');
  assert.equal(response.body.location.saved_location_id, home.body.location.location_id);
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

  console.log(`\nPhase 6 saved-user-location tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
