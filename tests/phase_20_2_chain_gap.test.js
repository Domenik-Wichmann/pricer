const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  buildGapCoverageByChain,
  buildGapDetectionSummary,
  buildGapSignalRecord,
  buildLocalityGapSummary,
  handleAddWatchlistItemRequest,
  handleGetGapCoverageByChainRequest,
  handleGetGapDetectionRequest,
  handleGetLocalityGapDetectionRequest,
  handleResolveShoppingListItemsRequest,
  handleSearchCanonicalProductsRequest,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function signal(query, status, categoryL2, avgPrice, timestamp, options = {}) {
  return buildGapSignalRecord({
    query,
    normalized_query: query,
    canonical_attempt: options.canonical_attempt || null,
    status,
    confidence: status === 'resolved' ? 0.9 : 0.2,
    category_l1: 'Food & Beverage',
    category_l2: categoryL2,
    locality_code: options.locality_code || null,
    chain_id: options.chain_id || null,
    chain_name: options.chain_name || null,
    store_id: options.store_id || null,
    store_name: options.store_name || null,
    price_context: avgPrice === null ? {} : { avg_price: avgPrice },
    source: 'search',
    timestamp,
  });
}

function createChainStore() {
  return new InMemoryDataBackboneStore({
    gap_signal_store: [
      signal('matcha latte', 'unresolved', 'Beverages', null, '2026-04-25T00:00:00.000Z', {
        locality_code: 'burgas',
        chain_id: 'metro',
        chain_name: 'Metro',
        store_id: 'burgas::metro-west',
        store_name: 'Metro West',
      }),
      signal('matcha latte', 'unresolved', 'Beverages', null, '2026-04-25T00:01:00.000Z', {
        locality_code: 'burgas',
        chain_id: 'metro',
        chain_name: 'Metro',
        store_id: 'burgas::metro-west',
        store_name: 'Metro West',
      }),
      signal('matcha latte', 'unresolved', 'Beverages', null, '2026-04-25T00:02:00.000Z', {
        locality_code: 'burgas',
        chain_id: 'kaufland',
        chain_name: 'Kaufland',
        store_id: 'burgas::kaufland-main',
        store_name: 'Kaufland Main',
      }),
      signal('matcha latte', 'unresolved', 'Beverages', null, '2026-04-25T00:03:00.000Z', {
        locality_code: 'burgas',
        chain_id: 'kaufland',
        chain_name: 'Kaufland',
        store_id: 'burgas::kaufland-main',
        store_name: 'Kaufland Main',
      }),
      signal('matcha latte', 'resolved', 'Beverages', 4.5, '2026-04-25T00:04:00.000Z', {
        canonical_attempt: 'cp_matcha',
        locality_code: 'burgas',
        chain_id: 'kaufland',
        chain_name: 'Kaufland',
        store_id: 'burgas::kaufland-main',
        store_name: 'Kaufland Main',
      }),
      signal('matcha latte', 'resolved', 'Beverages', 4.2, '2026-04-25T00:05:00.000Z', {
        canonical_attempt: 'cp_matcha',
        locality_code: 'burgas',
        chain_id: 'billa',
        chain_name: 'Billa',
        store_id: 'burgas::billa-center',
        store_name: 'Billa Center',
      }),
      signal('matcha latte', 'resolved', 'Beverages', 4.1, '2026-04-25T00:06:00.000Z', {
        canonical_attempt: 'cp_matcha',
        locality_code: 'burgas',
        chain_id: 'billa',
        chain_name: 'Billa',
        store_id: 'burgas::billa-center',
        store_name: 'Billa Center',
      }),
      signal('matcha latte', 'unresolved', 'Beverages', null, '2026-04-25T00:07:00.000Z', {
        locality_code: 'burgas',
      }),
      signal('organic chicken', 'unresolved', 'Meat', null, '2026-04-25T00:08:00.000Z', {
        locality_code: 'burgas',
        chain_id: 'kaufland',
        chain_name: 'Kaufland',
        store_id: 'burgas::kaufland-main',
        store_name: 'Kaufland Main',
      }),
      signal('organic chicken', 'resolved', 'Meat', 10, '2026-04-25T00:09:00.000Z', {
        canonical_attempt: 'cp_chicken',
        locality_code: 'burgas',
        chain_id: 'kaufland',
        chain_name: 'Kaufland',
        store_id: 'burgas::kaufland-main',
        store_name: 'Kaufland Main',
      }),
      signal('milk', 'ambiguous', 'Dairy', 2.5, '2026-04-25T00:10:00.000Z', {
        locality_code: 'sofia',
        chain_id: 'kaufland',
        chain_name: 'Kaufland',
        store_id: 'sofia::kaufland-ring',
        store_name: 'Kaufland Ring',
      }),
      signal('milk', 'resolved', 'Dairy', 2.4, '2026-04-25T00:11:00.000Z', {
        canonical_attempt: 'cp_milk',
        locality_code: 'sofia',
        chain_id: 'kaufland',
        chain_name: 'Kaufland',
        store_id: 'sofia::kaufland-ring',
        store_name: 'Kaufland Ring',
      }),
      signal('legacy query', 'unresolved', 'Pantry', null, '2026-04-25T00:12:00.000Z'),
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

test('old signals without chain or store still work', async () => {
  const summary = await buildGapDetectionSummary({
    store: createChainStore(),
    group_by: 'normalized_query',
    window: 'last_7d',
  });

  assert.equal(summary.filters.chain_id, null);
  assert.equal(summary.filters.store_id, null);
  assert.equal(summary.groups.some((entry) => entry.key === 'legacy query'), true);
});

test('new signals normalize chain and store fields', async () => {
  const record = buildGapSignalRecord({
    query: 'Milk',
    normalized_query: 'milk',
    status: 'resolved',
    chain_id: 'Kaufland',
    chain_name: 'Kaufland',
    store_id: 'Burgas::Kaufland Main',
    store_name: 'Kaufland Main',
    timestamp: '2026-04-25T10:00:00.000Z',
  });

  assert.equal(record.chain_id, 'kaufland');
  assert.equal(record.store_id, 'burgas::kaufland-main');
  assert.equal(record.chain_name, 'Kaufland');
  assert.equal(record.store_name, 'Kaufland Main');
});

test('chain filtering works', async () => {
  const summary = await buildGapDetectionSummary({
    store: createChainStore(),
    group_by: 'normalized_query',
    window: 'last_7d',
    chain_id: 'kaufland',
  });

  assert.equal(summary.filters.chain_id, 'kaufland');
  assert.deepEqual(summary.groups.map((entry) => entry.key), ['matcha latte', 'organic chicken', 'milk']);
});

test('store filtering works', async () => {
  const summary = await buildGapDetectionSummary({
    store: createChainStore(),
    group_by: 'normalized_query',
    window: 'last_7d',
    store_id: 'Burgas::Kaufland Main',
  });

  assert.equal(summary.filters.store_id, 'burgas::kaufland-main');
  assert.deepEqual(summary.groups.map((entry) => entry.key), ['matcha latte', 'organic chicken']);
});

test('locality and chain filtering works together', async () => {
  const response = await handleGetGapDetectionRequest({
    store: createChainStore(),
    query: {
      group_by: 'normalized_query',
      window: 'last_7d',
      locality_code: 'burgas',
      chain_id: 'kaufland',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.locality_code, 'burgas');
  assert.equal(response.body.filters.chain_id, 'kaufland');
  assert.deepEqual(response.body.groups.map((entry) => entry.key), ['matcha latte', 'organic chicken']);
});

test('grouping by chain works', async () => {
  const summary = await buildGapDetectionSummary({
    store: createChainStore(),
    group_by: 'chain_id',
    window: 'last_7d',
  });

  assert.deepEqual(summary.groups.map((entry) => entry.key), ['metro', 'Uncategorized', 'kaufland', 'billa']);
});

test('grouping by store works', async () => {
  const summary = await buildGapDetectionSummary({
    store: createChainStore(),
    group_by: 'store_id',
    window: 'last_7d',
  });

  assert.deepEqual(summary.groups.map((entry) => entry.key), [
    'burgas::kaufland-main',
    'burgas::metro-west',
    'Uncategorized',
    'sofia::kaufland-ring',
    'burgas::billa-center',
  ]);
});

test('coverage by chain computes coverage_rate correctly and sorts low coverage first', async () => {
  const summary = await buildGapCoverageByChain({
    store: createChainStore(),
    normalized_query: 'matcha latte',
    locality_code: 'burgas',
    window: 'last_7d',
  });

  assert.equal(summary.chains[0].chain_id, 'metro');
  assert.equal(summary.chains[0].coverage_rate, 0);
  assert.equal(summary.chains[1].chain_id, null);
  assert.equal(summary.chains[1].coverage_rate, 0);
  assert.equal(summary.chains[2].chain_id, 'kaufland');
  assert.equal(summary.chains[2].coverage_rate, 0.3333);
  assert.equal(summary.chains[3].chain_id, 'billa');
  assert.equal(summary.chains[3].coverage_rate, 1);
});

test('localities endpoint supports optional chain filters', async () => {
  const response = await handleGetLocalityGapDetectionRequest({
    store: createChainStore(),
    query: {
      group_by: 'normalized_query',
      chain_id: 'kaufland',
      window: 'last_7d',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.filters.chain_id, 'kaufland');
  assert.deepEqual(response.body.localities.map((entry) => entry.locality_code), ['burgas', 'sofia']);
});

test('coverage endpoint validates and returns deterministic non-mutating output', async () => {
  const store = createChainStore();
  const before = await store.load();
  const first = await handleGetGapCoverageByChainRequest({
    store,
    query: { normalized_query: 'matcha latte', locality_code: 'burgas', window: 'last_7d' },
  });
  const second = await handleGetGapCoverageByChainRequest({
    store,
    query: { normalized_query: 'matcha latte', locality_code: 'burgas', window: 'last_7d' },
  });
  const bad = await handleGetGapCoverageByChainRequest({
    store,
    query: { locality_code: 'burgas', window: 'last_7d' },
  });
  const after = await store.load();

  assert.equal(first.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(bad.status, 400);
  assert.deepEqual(after.gap_signal_store, before.gap_signal_store);
});

test('search resolver and watchlist handlers capture chain and store fields when present', async () => {
  const searchStore = createCatalogStore();
  const resolverStore = createCatalogStore();
  const watchlistStore = createCatalogStore();

  const searchResponse = await handleSearchCanonicalProductsRequest({
    store: searchStore,
    body: {
      query: 'milk',
      locality_code: 'Burgas',
      chain_id: 'Kaufland',
      store_id: 'Burgas::Kaufland Main',
    },
  });
  const resolverResponse = await handleResolveShoppingListItemsRequest({
    store: resolverStore,
    body: {
      items: ['missing fruit'],
      locality_code: 'Varna',
      chain_id: 'Billa',
      store_id: 'Varna::Billa Center',
    },
  });
  const watchlistResponse = await handleAddWatchlistItemRequest({
    store: watchlistStore,
    body: { canonical_product_id: 'cp_milk_a', label: 'Whole Milk 1L' },
    req: {
      headers: {
        'x-pricer-locality-code': 'Sofia',
        'x-pricer-chain-id': 'Metro',
        'x-pricer-store-id': 'Sofia::Metro Ring',
      },
    },
  });

  const searchState = await searchStore.load();
  const resolverState = await resolverStore.load();
  const watchlistState = await watchlistStore.load();

  assert.equal(searchResponse.status, 200);
  assert.equal(resolverResponse.status, 200);
  assert.equal(watchlistResponse.status, 201);
  assert.equal(searchState.gap_signal_store[0].chain_id, 'kaufland');
  assert.equal(searchState.gap_signal_store[0].store_id, 'burgas::kaufland-main');
  assert.equal(resolverState.gap_signal_store[0].chain_id, 'billa');
  assert.equal(resolverState.gap_signal_store[0].store_id, 'varna::billa-center');
  assert.equal(watchlistState.gap_signal_store[0].chain_id, 'metro');
  assert.equal(watchlistState.gap_signal_store[0].store_id, 'sofia::metro-ring');
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

  console.log(`\nPhase 20.2 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
