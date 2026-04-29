const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  buildGapSignalRecord,
  buildMerchantCategoryInsights,
  buildMerchantChainInsights,
  buildMerchantInsightOpportunities,
  buildMerchantInsightOverview,
  buildMerchantLocalityInsights,
  handleGetMerchantInsightOverviewRequest,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function signal(query, status, categoryL2, index, options = {}) {
  const timestamp = new Date(Date.UTC(2026, 3, 25, 0, 0, 0) + index * 60000).toISOString();
  return buildGapSignalRecord({
    query,
    normalized_query: query,
    canonical_attempt: status === 'unresolved' ? null : `cp_${query.replace(/\s+/gu, '_')}`,
    status,
    confidence: status === 'resolved' ? 0.9 : status === 'ambiguous' ? 0.5 : 0.1,
    category_l1: options.category_l1 || 'Food & Beverage',
    category_l2: categoryL2,
    locality_code: options.locality_code || null,
    chain_id: options.chain_id || null,
    chain_name: options.chain_name || null,
    store_id: options.store_id || null,
    store_name: options.store_name || null,
    price_context: options.avg_price ? { avg_price: options.avg_price } : {},
    source: options.source || 'search',
    timestamp,
  });
}

function repeated({
  query,
  categoryL2,
  statuses,
  start,
  options = {},
}) {
  return statuses.map((status, offset) => signal(query, status, categoryL2, start + offset, options));
}

function createStore(signals = fixtureSignals()) {
  return new InMemoryDataBackboneStore({
    gap_signal_store: signals,
  });
}

function fixtureSignals() {
  return [
    ...repeated({
      query: 'matcha latte',
      categoryL2: 'Beverages',
      statuses: Array(30).fill('resolved'),
      start: 0,
      options: { locality_code: 'burgas', chain_id: 'billa', chain_name: 'Billa', avg_price: 4 },
    }),
    ...repeated({
      query: 'matcha latte',
      categoryL2: 'Beverages',
      statuses: Array(20).fill('unresolved'),
      start: 40,
      options: { locality_code: 'burgas', chain_id: 'metro', chain_name: 'Metro' },
    }),
    ...repeated({
      query: 'organic chicken',
      categoryL2: 'Meat',
      statuses: Array(12).fill('unresolved'),
      start: 80,
      options: { locality_code: 'burgas', chain_id: 'metro', chain_name: 'Metro' },
    }),
    ...repeated({
      query: 'oat milk',
      categoryL2: 'Beverages',
      statuses: Array(12).fill('unresolved'),
      start: 110,
      options: { locality_code: 'sofia', chain_id: 'billa', chain_name: 'Billa' },
    }),
  ];
}

test('overview aggregates totals and top cards correctly', async () => {
  const overview = await buildMerchantInsightOverview({ store: createStore(), window: 'last_7d' });

  assert.equal(overview.window, 'last_7d');
  assert.equal(overview.totals.total_signals, fixtureSignals().length);
  assert.equal(overview.totals.total_opportunities, 3);
  assert.equal(overview.totals.high_confidence_opportunities, 1);
  assert.equal(overview.top_opportunity.title.startsWith('Matcha Latte'), true);
  assert.equal(overview.top_category.category_l2, 'Beverages');
  assert.equal(typeof overview.generated_at, 'string');
});

test('top opportunities wrapper applies filters and limits', async () => {
  const result = await buildMerchantInsightOpportunities({
    store: createStore(),
    window: 'last_7d',
    category_l2: 'Beverages',
    limit: 1,
  });

  assert.equal(result.filters.category_l2, 'Beverages');
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].category_l2, 'Beverages');
});

test('category aggregation is dashboard friendly', async () => {
  const result = await buildMerchantCategoryInsights({ store: createStore(), window: 'last_7d' });

  assert.deepEqual(result.categories.map((entry) => entry.category_l2), ['Beverages', 'Meat']);
  assert.equal(result.categories[0].opportunity_count, 2);
  assert.equal(result.categories[0].top_gap, 'Matcha Latte');
  assert.equal(result.categories[0].avg_gap_score > result.categories[1].avg_gap_score, true);
});

test('locality aggregation is correct', async () => {
  const result = await buildMerchantLocalityInsights({ store: createStore(), window: 'last_7d' });

  assert.deepEqual(result.localities.map((entry) => entry.locality_code), ['burgas', 'sofia']);
  assert.equal(result.localities[0].opportunity_count, 2);
  assert.equal(result.localities[0].top_gap, 'Matcha Latte');
});

test('chain aggregation reuses coverage evidence', async () => {
  const result = await buildMerchantChainInsights({ store: createStore(), window: 'last_7d' });
  const metro = result.chains.find((entry) => entry.chain_id === 'metro');
  const billa = result.chains.find((entry) => entry.chain_id === 'billa');

  assert.ok(metro);
  assert.ok(billa);
  assert.equal(metro.coverage_rate < 0.5, true);
  assert.equal(metro.gap_count >= 1, true);
  assert.equal(billa.coverage_rate > metro.coverage_rate, true);
});

test('filters are preserved and applied across insight builders', async () => {
  const result = await buildMerchantLocalityInsights({
    store: createStore(),
    window: 'last_7d',
    locality_code: 'Sofia',
  });

  assert.equal(result.filters.locality_code, 'sofia');
  assert.deepEqual(result.localities.map((entry) => entry.locality_code), ['sofia']);
});

test('empty dataset is safe', async () => {
  const store = createStore([]);
  const overview = await buildMerchantInsightOverview({ store, window: 'all' });
  const categories = await buildMerchantCategoryInsights({ store, window: 'all' });
  const localities = await buildMerchantLocalityInsights({ store, window: 'all' });
  const chains = await buildMerchantChainInsights({ store, window: 'all' });

  assert.equal(overview.totals.total_signals, 0);
  assert.equal(overview.top_opportunity, null);
  assert.deepEqual(categories.categories, []);
  assert.deepEqual(localities.localities, []);
  assert.deepEqual(chains.chains, []);
});

test('source data is not mutated', async () => {
  const store = createStore();
  const before = await store.load();

  await buildMerchantInsightOverview({ store, window: 'last_7d' });
  await buildMerchantInsightOpportunities({ store, window: 'last_7d' });
  await buildMerchantCategoryInsights({ store, window: 'last_7d' });
  await buildMerchantLocalityInsights({ store, window: 'last_7d' });
  await buildMerchantChainInsights({ store, window: 'last_7d' });

  const after = await store.load();
  assert.deepEqual(after.gap_signal_store, before.gap_signal_store);
});

test('output is deterministic and endpoint validation is bounded', async () => {
  const store = createStore();
  const first = await buildMerchantCategoryInsights({ store, window: 'last_7d' });
  const second = await buildMerchantCategoryInsights({ store, window: 'last_7d' });
  const ok = await handleGetMerchantInsightOverviewRequest({ store, query: { window: 'last_7d' } });
  const bad = await handleGetMerchantInsightOverviewRequest({ store, query: { window: 'bad' } });

  assert.deepEqual(second, first);
  assert.equal(ok.status, 200);
  assert.equal(bad.status, 400);
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

  console.log(`\nPhase 20.4 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
