const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  buildGapDetectionSummary,
  buildGapSignalRecord,
  handleGetGapDetectionRequest,
  handleResolveShoppingListItemsRequest,
  handleSearchCanonicalProductsRequest,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createStoreWithSignals() {
  return new InMemoryDataBackboneStore({
    gap_signal_store: [
      signal('organic chicken', 'unresolved', 'Meat', null, '2026-04-24T00:00:00.000Z'),
      signal('organic chicken', 'unresolved', 'Meat', null, '2026-04-24T00:01:00.000Z'),
      signal('organic chicken', 'resolved', 'Meat', 9.2, '2026-04-24T00:02:00.000Z', 'cp_chicken'),
      signal('milk', 'ambiguous', 'Dairy', 2.5, '2026-04-24T00:03:00.000Z', 'cp_milk_a'),
      signal('milk', 'ambiguous', 'Dairy', 2.7, '2026-04-24T00:04:00.000Z', 'cp_milk_b'),
      signal('milk', 'resolved', 'Dairy', 2.4, '2026-04-24T00:05:00.000Z', 'cp_milk_a'),
      signal('saffron', 'resolved', 'Spices', 15, '2026-04-24T00:06:00.000Z', 'cp_saffron'),
      signal('pepper', 'resolved', 'Spices', 5, '2026-04-24T00:07:00.000Z', 'cp_pepper'),
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

function signal(query, status, categoryL2, avgPrice, timestamp, canonicalAttempt = null) {
  return buildGapSignalRecord({
    query,
    normalized_query: query,
    canonical_attempt: canonicalAttempt,
    status,
    confidence: status === 'resolved' ? 0.9 : 0.2,
    category_l1: 'Food & Beverage',
    category_l2: categoryL2,
    price_context: avgPrice === null ? {} : { avg_price: avgPrice },
    source: 'search',
    timestamp,
  });
}

test('unresolved queries produce high gap score and missing supply classification', async () => {
  const summary = await buildGapDetectionSummary({
    store: createStoreWithSignals(),
    group_by: 'normalized_query',
    window: 'last_7d',
  });
  const group = summary.groups.find((entry) => entry.key === 'organic chicken');

  assert.equal(group.search_count, 3);
  assert.equal(group.unresolved_rate, 0.6667);
  assert.equal(group.gap_type, 'missing_supply');
  assert.equal(group.gap_score > 4, true);
});

test('ambiguous queries produce medium gap score and poor match classification', async () => {
  const summary = await buildGapDetectionSummary({
    store: createStoreWithSignals(),
    group_by: 'normalized_query',
    window: 'last_7d',
  });
  const group = summary.groups.find((entry) => entry.key === 'milk');

  assert.equal(group.ambiguous_rate, 0.6667);
  assert.equal(group.gap_type, 'poor_match_quality');
  assert.equal(group.gap_score > 2, true);
  assert.equal(group.gap_score < 5, true);
});

test('high price raises score and classifies price pressure', async () => {
  const summary = await buildGapDetectionSummary({
    store: createStoreWithSignals(),
    group_by: 'normalized_query',
    window: 'last_7d',
  });
  const group = summary.groups.find((entry) => entry.key === 'saffron');

  assert.equal(group.avg_price, 15);
  assert.equal(group.gap_type, 'high_price_pressure');
  assert.equal(group.gap_score, 2.4);
});

test('grouping by category_l2 works', async () => {
  const summary = await buildGapDetectionSummary({
    store: createStoreWithSignals(),
    group_by: 'category_l2',
    window: 'last_7d',
  });

  assert.deepEqual(summary.groups.map((entry) => entry.key).sort(), ['Dairy', 'Meat', 'Spices']);
});

test('empty dataset is safe', async () => {
  const summary = await buildGapDetectionSummary({
    store: new InMemoryDataBackboneStore(),
    group_by: 'normalized_query',
    window: 'all',
  });

  assert.deepEqual(summary.groups, []);
});

test('summary does not mutate signal store', async () => {
  const store = createStoreWithSignals();
  const before = await store.load();
  await buildGapDetectionSummary({ store, group_by: 'category_l2', window: 'last_30d' });
  await handleGetGapDetectionRequest({
    store,
    query: { group_by: 'normalized_query', window: 'last_7d' },
  });
  const after = await store.load();

  assert.deepEqual(after.gap_signal_store, before.gap_signal_store);
});

test('gap output is deterministic', async () => {
  const store = createStoreWithSignals();
  const first = await buildGapDetectionSummary({ store, group_by: 'normalized_query', window: 'last_7d' });
  const second = await buildGapDetectionSummary({ store, group_by: 'normalized_query', window: 'last_7d' });

  assert.deepEqual(second, first);
});

test('search and resolver handlers capture gap signals without changing responses', async () => {
  const store = createCatalogStore();
  const searchResponse = await handleSearchCanonicalProductsRequest({
    store,
    body: { query: 'milk' },
  });
  const resolverResponse = await handleResolveShoppingListItemsRequest({
    store,
    body: { items: ['missing fruit'] },
  });
  const state = await store.load();

  assert.equal(searchResponse.status, 200);
  assert.equal(resolverResponse.status, 200);
  assert.equal(state.gap_signal_store.length, 2);
  assert.equal(state.gap_signal_store.some((entry) => entry.source === 'search'), true);
  assert.equal(state.gap_signal_store.some((entry) => entry.status === 'unresolved'), true);
});

test('gap endpoint validates options and applies limit', async () => {
  const store = createStoreWithSignals();
  const ok = await handleGetGapDetectionRequest({
    store,
    query: { group_by: 'normalized_query', window: 'last_7d', limit: '2' },
  });
  const badGroup = await handleGetGapDetectionRequest({
    store,
    query: { group_by: 'brand', window: 'last_7d' },
  });

  assert.equal(ok.status, 200);
  assert.equal(ok.body.groups.length, 2);
  assert.equal(badGroup.status, 400);
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

  console.log(`\nPhase 18.7 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
