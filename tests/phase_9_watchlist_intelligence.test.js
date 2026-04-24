const assert = require('node:assert/strict');

const {
  buildWatchlistSummary,
  getWatchlistInsights,
  handleSetTargetPriceRequest,
  handleWatchlistInsightsRequest,
  handleWatchlistSummaryRequest,
  InMemoryDataBackboneStore,
  recomputeWatchlistRecurringPatterns,
  runDailyWatchlistIntelligence,
  setTargetPrice,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createState() {
  return {
    raw_price_snapshots: [],
    source_products: [],
    source_product_enrichment: [],
    semantic_profiles: [],
    embedding_records: [],
    feedback_events: [],
    product_daily_prices: [
      { source_product_id: 'milk-a', date: '2026-04-01', price_avg: 3.2, price_min: 3.2, price_max: 3.2, store_count: 1, snapshot_count: 1 },
      { source_product_id: 'milk-a', date: '2026-04-08', price_avg: 2.9, price_min: 2.9, price_max: 2.9, store_count: 1, snapshot_count: 1 },
      { source_product_id: 'milk-a', date: '2026-04-15', price_avg: 2.8, price_min: 2.8, price_max: 2.8, store_count: 1, snapshot_count: 1 },
      { source_product_id: 'milk-a', date: '2026-04-22', price_avg: 2.5, price_min: 2.5, price_max: 2.5, store_count: 1, snapshot_count: 1 },
      { source_product_id: 'bread-a', date: '2026-04-21', price_avg: 1.5, price_min: 1.5, price_max: 1.5, store_count: 1, snapshot_count: 1 },
      { source_product_id: 'bread-a', date: '2026-04-22', price_avg: 1.1, price_min: 1.1, price_max: 1.1, store_count: 1, snapshot_count: 1 },
      { source_product_id: 'eggs-a', date: '2026-04-21', price_avg: 4.0, price_min: 4.0, price_max: 4.0, store_count: 1, snapshot_count: 1 },
      { source_product_id: 'eggs-a', date: '2026-04-22', price_avg: 4.2, price_min: 4.2, price_max: 4.2, store_count: 1, snapshot_count: 1 },
    ],
    category_daily_aggregates: [],
    sql_products: [],
    sql_product_prices_daily: [],
    sql_category_aggregates: [],
    vector_index_records: [],
    ingest_runs: [],
    pipeline_logs: [],
    analytics_events: [],
    watchlist_alert_events: [],
    notification_events: [],
    watchlist_profiles: [],
    watchlist_recurring_patterns: [],
    watchlist_insight_events: [],
    watchlist_daily_summaries: [],
    demand_logs: [],
    demand_aggregates: [],
    demand_embeddings: [],
    demand_clusters: [],
  };
}

function createWatchlistEntries() {
  return [
    { user_id: 'u1', source_product_id: 'milk-a', display_name: 'Milk A', target_price: 2.6, device_token: 'token-1' },
    { user_id: 'u1', source_product_id: 'bread-a', display_name: 'Bread A', target_price: 1.2, device_token: 'token-1' },
    { user_id: 'u1', source_product_id: 'eggs-a', display_name: 'Eggs A', target_price: 3.8, device_token: 'token-1' },
  ];
}

test('recurring detection computes interval and confidence from repeated drop cadence', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  const result = await recomputeWatchlistRecurringPatterns({
    store,
    watchlistEntries: createWatchlistEntries(),
    computedAt: '2026-04-22T10:00:00.000Z',
  });

  assert.equal(result.recurring_pattern_count, 3);
  const state = await store.load();
  const milkPattern = state.watchlist_recurring_patterns.find((row) => row.source_product_id === 'milk-a');
  assert.equal(milkPattern.recurring_interval_days, 7);
  assert.equal(milkPattern.recurrence_confidence > 0.9, true);
});

test('daily evaluation marks significance, good-deal flag, target hits, and list diffs', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  await recomputeWatchlistRecurringPatterns({
    store,
    watchlistEntries: createWatchlistEntries(),
    computedAt: '2026-04-22T10:00:00.000Z',
  });

  const result = await runDailyWatchlistIntelligence({
    store,
    watchlistEntries: createWatchlistEntries(),
    date: '2026-04-22',
    createdAt: '2026-04-22T12:00:00.000Z',
  });

  assert.equal(result.insight_count, 3);
  const insights = await getWatchlistInsights({ store, userId: 'u1', snapshotDate: '2026-04-22' });
  const bread = insights.find((row) => row.source_product_id === 'bread-a');
  const milk = insights.find((row) => row.source_product_id === 'milk-a');
  const eggs = insights.find((row) => row.source_product_id === 'eggs-a');

  assert.equal(bread.significance_level, 'major');
  assert.equal(bread.good_deal_flag, true);
  assert.equal(bread.is_target_hit, true);
  assert.equal(bread.list_diff_direction, 'down');
  assert.equal(eggs.list_diff_direction, 'up');
  assert.equal(milk.nudge_type !== null, true);
});

test('cooldowns suppress repeated nudges during the configured window', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  await recomputeWatchlistRecurringPatterns({
    store,
    watchlistEntries: createWatchlistEntries(),
    computedAt: '2026-04-22T10:00:00.000Z',
  });

  await runDailyWatchlistIntelligence({
    store,
    watchlistEntries: createWatchlistEntries(),
    date: '2026-04-22',
    createdAt: '2026-04-22T12:00:00.000Z',
  });
  await runDailyWatchlistIntelligence({
    store,
    watchlistEntries: createWatchlistEntries(),
    date: '2026-04-22',
    createdAt: '2026-04-23T12:00:00.000Z',
  });

  const state = await store.load();
  const profile = state.watchlist_profiles.find((row) => row.source_product_id === 'bread-a');
  assert.equal(profile.last_nudge_sent_at, '2026-04-22T12:00:00.000Z');
});

test('daily summary is aggregated per user with low-spam counts', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  await recomputeWatchlistRecurringPatterns({
    store,
    watchlistEntries: createWatchlistEntries(),
    computedAt: '2026-04-22T10:00:00.000Z',
  });
  await runDailyWatchlistIntelligence({
    store,
    watchlistEntries: createWatchlistEntries(),
    date: '2026-04-22',
    createdAt: '2026-04-22T12:00:00.000Z',
  });

  const summary = await buildWatchlistSummary({
    store,
    userId: 'u1',
  });

  assert.equal(summary.item_count, 3);
  assert.equal(summary.latest_daily_summary.drop_count >= 2, true);
  assert.equal(summary.latest_daily_summary.nudge_count >= 1, true);
});

test('set target price upserts watchlist profile and target alert state', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  const profile = await setTargetPrice({
    store,
    userId: 'u1',
    sourceProductId: 'milk-a',
    targetPrice: 2.4,
    displayName: 'Milk A',
    updatedAt: '2026-04-22T13:00:00.000Z',
  });

  assert.equal(profile.target_price, 2.4);

  const response = await handleSetTargetPriceRequest({
    store,
    body: {
      user_id: 'u1',
      source_product_id: 'milk-a',
      target_price: 2.3,
      display_name: 'Milk A',
      updated_at: '2026-04-22T14:00:00.000Z',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.target_price, 2.3);
});

test('watchlist summary and insights endpoints validate and return current data', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  await recomputeWatchlistRecurringPatterns({
    store,
    watchlistEntries: createWatchlistEntries(),
    computedAt: '2026-04-22T10:00:00.000Z',
  });
  await runDailyWatchlistIntelligence({
    store,
    watchlistEntries: createWatchlistEntries(),
    date: '2026-04-22',
    createdAt: '2026-04-22T12:00:00.000Z',
  });

  const summaryResponse = await handleWatchlistSummaryRequest({
    store,
    body: {
      user_id: 'u1',
    },
  });
  const insightsResponse = await handleWatchlistInsightsRequest({
    store,
    body: {
      user_id: 'u1',
      snapshot_date: '2026-04-22',
    },
  });

  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.body.item_count, 3);
  assert.equal(insightsResponse.status, 200);
  assert.equal(insightsResponse.body.items.length, 3);
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

  console.log(`\nPhase 9 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
