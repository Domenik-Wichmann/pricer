const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  buildGapDetectionSummary,
  buildGapSignalRecord,
  buildLocalityGapSummary,
  handleAddWatchlistItemRequest,
  handleGetGapDetectionRequest,
  handleGetLocalityGapDetectionRequest,
  handleResolveShoppingListItemsRequest,
  handleSearchCanonicalProductsRequest,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function signal(query, status, categoryL2, avgPrice, timestamp, canonicalAttempt = null, localityCode = null) {
  return buildGapSignalRecord({
    query,
    normalized_query: query,
    canonical_attempt: canonicalAttempt,
    status,
    confidence: status === 'resolved' ? 0.9 : 0.2,
    category_l1: 'Food & Beverage',
    category_l2: categoryL2,
    locality_code: localityCode,
    price_context: avgPrice === null ? {} : { avg_price: avgPrice },
    source: 'search',
    timestamp,
  });
}

function createLocalityStore() {
  return new InMemoryDataBackboneStore({
    gap_signal_store: [
      signal('organic chicken', 'unresolved', 'Meat', null, '2026-04-25T00:00:00.000Z', null, 'burgas'),
      signal('organic chicken', 'unresolved', 'Meat', null, '2026-04-25T00:01:00.000Z', null, 'burgas'),
      signal('organic chicken', 'resolved', 'Meat', 9.5, '2026-04-25T00:02:00.000Z', 'cp_chicken', 'burgas'),
      signal('yogurt', 'resolved', 'Dairy', 2.4, '2026-04-25T00:03:00.000Z', 'cp_yogurt', 'burgas'),
      signal('milk', 'ambiguous', 'Dairy', 2.5, '2026-04-25T00:04:00.000Z', 'cp_milk_a', 'sofia'),
      signal('milk', 'ambiguous', 'Dairy', 2.7, '2026-04-25T00:05:00.000Z', 'cp_milk_b', 'sofia'),
      signal('milk', 'resolved', 'Dairy', 2.4, '2026-04-25T00:06:00.000Z', 'cp_milk_a', 'sofia'),
      signal('saffron', 'resolved', 'Spices', 15, '2026-04-25T00:07:00.000Z', 'cp_saffron', null),
      signal('pepper', 'resolved', 'Spices', 5, '2026-04-25T00:08:00.000Z', 'cp_pepper', null),
    ],
  });
}

function createCatalogStore() {
  return new InMemoryDataBackboneStore({
    canonical_products: [
      { canonical_product_id: 'cp_milk_a', canonical_display_name: 'Whole Milk 1L' },
      { canonical_product_id: 'cp_milk_b', canonical_display_name: 'Chocolate Milk 1L' },
    ],
    canonical_enrichment_store: [
      {
        canonical_fingerprint: 'cp_milk_a',
        enrichment: {
          base_product: 'milk',
          category_l1: 'Food & Beverage',
          category_l2: 'Dairy',
          confidence: 0.9,
        },
      },
      {
        canonical_fingerprint: 'cp_milk_b',
        enrichment: {
          base_product: 'milk',
          category_l1: 'Food & Beverage',
          category_l2: 'Dairy',
          flavor: ['chocolate'],
          confidence: 0.9,
        },
      },
    ],
  });
}

test('gap signals normalize locality codes and keep deterministic identity boundaries', async () => {
  const left = buildGapSignalRecord({
    query: 'Milk',
    normalized_query: 'milk',
    status: 'resolved',
    locality_code: 'Burgas',
    timestamp: '2026-04-25T10:00:00.000Z',
  });
  const right = buildGapSignalRecord({
    query: 'Milk',
    normalized_query: 'milk',
    status: 'resolved',
    locality_code: 'Sofia',
    timestamp: '2026-04-25T10:00:00.000Z',
  });

  assert.equal(left.locality_code, 'burgas');
  assert.equal(right.locality_code, 'sofia');
  assert.notEqual(left.signal_id, right.signal_id);
});

test('global gap detection still works with locality filtering when requested directly', async () => {
  const summary = await buildGapDetectionSummary({
    store: createLocalityStore(),
    group_by: 'normalized_query',
    window: 'last_7d',
    locality_code: 'Burgas',
  });

  assert.equal(summary.locality_code, 'burgas');
  assert.deepEqual(summary.groups.map((entry) => entry.key), ['organic chicken', 'yogurt']);
});

test('single-locality summary filters correctly and includes category context', async () => {
  const summary = await buildLocalityGapSummary({
    store: createLocalityStore(),
    group_by: 'normalized_query',
    window: 'last_7d',
    locality_code: 'burgas',
  });
  const top = summary.groups[0];

  assert.equal(summary.locality_code, 'burgas');
  assert.equal(top.key, 'organic chicken');
  assert.equal(top.category_l2, 'Meat');
  assert.equal(top.gap_type, 'missing_supply');
});

test('multi-locality aggregation works and sorts localities by strongest gap', async () => {
  const summary = await buildLocalityGapSummary({
    store: createLocalityStore(),
    group_by: 'normalized_query',
    window: 'last_7d',
  });

  assert.deepEqual(summary.localities.map((entry) => entry.locality_code), ['burgas', 'sofia', null]);
  assert.equal(summary.localities[0].top_gaps[0].key, 'organic chicken');
  assert.equal(summary.localities[1].top_gaps[0].key, 'milk');
});

test('missing locality is handled safely', async () => {
  const summary = await buildLocalityGapSummary({
    store: createLocalityStore(),
    group_by: 'normalized_query',
    window: 'last_7d',
  });
  const noLocality = summary.localities.find((entry) => entry.locality_code === null);

  assert.ok(noLocality);
  assert.equal(noLocality.top_gaps[0].key, 'saffron');
  assert.equal(noLocality.top_gaps[0].gap_type, 'high_price_pressure');
});

test('grouping by category works for locality summaries', async () => {
  const summary = await buildLocalityGapSummary({
    store: createLocalityStore(),
    group_by: 'category_l2',
    window: 'last_7d',
    locality_code: 'burgas',
  });

  assert.deepEqual(summary.groups.map((entry) => entry.key), ['Meat', 'Dairy']);
});

test('gap endpoints route locality and multi-locality requests cleanly', async () => {
  const store = createLocalityStore();
  const localityResponse = await handleGetGapDetectionRequest({
    store,
    query: { group_by: 'normalized_query', window: 'last_7d', locality_code: 'burgas' },
  });
  const localitiesResponse = await handleGetLocalityGapDetectionRequest({
    store,
    query: { group_by: 'normalized_query', window: 'last_7d', limit: '1' },
  });

  assert.equal(localityResponse.status, 200);
  assert.equal(localityResponse.body.locality_code, 'burgas');
  assert.equal(localityResponse.body.groups[0].category_l2, 'Meat');
  assert.equal(localitiesResponse.status, 200);
  assert.equal(localitiesResponse.body.localities[0].top_gaps.length, 1);
});

test('locality output is deterministic and does not mutate stored signals', async () => {
  const store = createLocalityStore();
  const before = await store.load();
  const first = await buildLocalityGapSummary({
    store,
    group_by: 'normalized_query',
    window: 'last_7d',
  });
  const second = await buildLocalityGapSummary({
    store,
    group_by: 'normalized_query',
    window: 'last_7d',
  });
  await handleGetLocalityGapDetectionRequest({
    store,
    query: { group_by: 'normalized_query', window: 'last_7d' },
  });
  const after = await store.load();

  assert.deepEqual(second, first);
  assert.deepEqual(after.gap_signal_store, before.gap_signal_store);
});

test('search resolver and watchlist handlers capture locality codes', async () => {
  const searchStore = createCatalogStore();
  const resolverStore = createCatalogStore();
  const watchlistStore = createCatalogStore();

  const searchResponse = await handleSearchCanonicalProductsRequest({
    store: searchStore,
    body: { query: 'milk', locality_code: 'Burgas' },
  });
  const resolverResponse = await handleResolveShoppingListItemsRequest({
    store: resolverStore,
    body: { items: ['missing fruit'], locality_code: 'Varna' },
  });
  const watchlistResponse = await handleAddWatchlistItemRequest({
    store: watchlistStore,
    body: { canonical_product_id: 'cp_milk_a', label: 'Whole Milk 1L' },
    req: {
      headers: {
        'x-pricer-locality-code': 'Sofia',
      },
    },
  });

  const searchState = await searchStore.load();
  const resolverState = await resolverStore.load();
  const watchlistState = await watchlistStore.load();

  assert.equal(searchResponse.status, 200);
  assert.equal(resolverResponse.status, 200);
  assert.equal(watchlistResponse.status, 201);
  assert.equal(searchState.gap_signal_store[0].locality_code, 'burgas');
  assert.equal(resolverState.gap_signal_store[0].locality_code, 'varna');
  assert.equal(watchlistState.gap_signal_store[0].locality_code, 'sofia');
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

  console.log(`\nPhase 20.1 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
