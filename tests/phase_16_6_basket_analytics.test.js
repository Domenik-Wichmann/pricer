const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  buildBasketAnalyticsRecord,
  getBasketAnalyticsSummary,
  handleGetBasketAnalyticsSummaryRequest,
  handleOptimizeBasketSingleStoreRequest,
  importDailySnapshotCsvStream,
  summarizeBasketAnalyticsRecords,
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

async function createEndpointStore() {
  const store = new InMemoryDataBackboneStore();
  await importDailySnapshotCsvStream({
    store,
    csvStream: createCsv([
      '"1000","Lidl","Milk 1L","1001","6","3.00","0"',
      '"1000","Lidl","Eggs 10 Count","1002","8","8.00","0"',
    ]),
    snapshotDate: '2026-04-24',
    sourceFileName: 'LIDL.csv',
    ingestedAt: '2026-04-24T09:00:00.000Z',
    enableLlmEnrichment: false,
  });
  await importDailySnapshotCsvStream({
    store,
    csvStream: createCsv([
      '"1000","Kaufland","Milk 1L","2001","6","8.00","0"',
      '"1000","Kaufland","Eggs 10 Count","2002","8","3.00","0"',
    ]),
    snapshotDate: '2026-04-24',
    sourceFileName: 'KAUFLAND.csv',
    ingestedAt: '2026-04-24T10:00:00.000Z',
    enableLlmEnrichment: false,
  });

  return store;
}

function metrics({
  resolutionRate = 0.5,
  priceCoverageRate = 0.75,
  savings = 20,
  recommendedStrategy = 'multi_store',
  flip = true,
} = {}) {
  return {
    resolver: {
      total_items: 4,
      resolved_count: 2,
      ambiguous_count: 1,
      unresolved_count: 1,
      resolution_rate: resolutionRate,
      ambiguity_rate: 0.25,
      unresolved_rate: 0.25,
    },
    pricing: {
      priced_item_count: 3,
      missing_item_count: 1,
      stale_item_count: 0,
      price_coverage_rate: priceCoverageRate,
      missing_rate: 0.25,
      stale_rate: 0,
    },
    optimization: {
      recommended_strategy: recommendedStrategy,
      single_store_total: 100,
      multi_store_total: 80,
      savings,
      savings_rate: 0.2,
    },
    convenience: {
      recommended_before: flip ? 'multi_store' : recommendedStrategy,
      recommended_after: flip ? 'single_store' : recommendedStrategy,
      recommendation_flip: flip,
      flip,
      effective_total: 85,
      actual_total: 80,
      effective_vs_actual_delta: 5,
    },
  };
}

async function optimizeWithMetrics(store, persistMetrics = false) {
  return handleOptimizeBasketSingleStoreRequest({
    store,
    body: {
      items: ['milk', 'eggs'],
      optimizer_options: {
        strategy: 'multi_store',
        include_convenience_scoring: true,
        include_metrics: true,
        persist_metrics: persistMetrics,
      },
      convenience_options: {
        extra_store_penalty: 2,
      },
    },
  });
}

test('metrics are persisted when include_metrics and persist_metrics are true', async () => {
  const store = await createEndpointStore();
  const response = await optimizeWithMetrics(store, true);
  const state = await store.load();

  assert.equal(response.status, 200);
  assert.equal(state.basket_analytics_store.length, 1);
  assert.equal(state.basket_analytics_store[0].analytics_id.startsWith('ba_'), true);
  assert.deepEqual(state.basket_analytics_store[0].resolver, response.body.metrics.resolver);
  assert.deepEqual(state.basket_analytics_store[0].pricing, response.body.metrics.pricing);
});

test('metrics are not persisted when persist_metrics is omitted', async () => {
  const store = await createEndpointStore();
  const response = await optimizeWithMetrics(store, false);
  const state = await store.load();

  assert.equal(response.status, 200);
  assert.equal(state.basket_analytics_store.length, 0);
});

test('aggregation returns correct averages for stored records', async () => {
  const store = new InMemoryDataBackboneStore({
    basket_analytics_store: [
      buildBasketAnalyticsRecord({
        metrics: metrics(),
        timestamp: '2026-04-24T10:00:00.000Z',
      }),
      buildBasketAnalyticsRecord({
        metrics: metrics({
          resolutionRate: 1,
          priceCoverageRate: 1,
          savings: 10,
          recommendedStrategy: 'single_store',
          flip: false,
        }),
        timestamp: '2026-04-24T11:00:00.000Z',
      }),
    ],
  });

  const summary = await getBasketAnalyticsSummary({
    store,
    window: 'all',
    limit: 1000,
    now: '2026-04-24T12:00:00.000Z',
  });

  assert.equal(summary.average_resolution_rate, 0.75);
  assert.equal(summary.average_price_coverage, 0.875);
  assert.equal(summary.average_savings, 15);
  assert.equal(summary.multi_store_usage_rate, 0.5);
  assert.equal(summary.convenience_flip_rate, 0.5);
  assert.equal(summary.sample_size, 2);
});

test('empty analytics dataset returns safe zero summary', async () => {
  const response = await handleGetBasketAnalyticsSummaryRequest({
    store: new InMemoryDataBackboneStore(),
    query: {},
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.average_resolution_rate, 0);
  assert.equal(response.body.average_price_coverage, 0);
  assert.equal(response.body.average_savings, 0);
  assert.equal(response.body.multi_store_usage_rate, 0);
  assert.equal(response.body.convenience_flip_rate, 0);
  assert.equal(response.body.sample_size, 0);
});

test('partial and bad records are ignored during aggregation', () => {
  const valid = buildBasketAnalyticsRecord({
    metrics: metrics({
      resolutionRate: 1,
      priceCoverageRate: 1,
      savings: 8,
      flip: false,
    }),
    timestamp: '2026-04-24T10:00:00.000Z',
  });
  const summary = summarizeBasketAnalyticsRecords({
    records: [
      valid,
      { analytics_id: 'bad_missing_fields', timestamp: '2026-04-24T10:00:00.000Z' },
      { analytics_id: 'bad_timestamp', timestamp: 'not-a-date', resolver: valid.resolver },
    ],
    window: 'all',
    limit: 1000,
    now: '2026-04-24T12:00:00.000Z',
  });

  assert.equal(summary.sample_size, 1);
  assert.equal(summary.average_resolution_rate, 1);
  assert.equal(summary.average_price_coverage, 1);
  assert.equal(summary.average_savings, 8);
});

test('summary window and limit are applied deterministically', () => {
  const records = [
    buildBasketAnalyticsRecord({
      metrics: metrics({ resolutionRate: 0.2, savings: 2 }),
      timestamp: '2026-04-20T10:00:00.000Z',
    }),
    buildBasketAnalyticsRecord({
      metrics: metrics({ resolutionRate: 0.8, savings: 8 }),
      timestamp: '2026-04-24T09:00:00.000Z',
    }),
    buildBasketAnalyticsRecord({
      metrics: metrics({ resolutionRate: 1, savings: 10 }),
      timestamp: '2026-04-24T10:00:00.000Z',
    }),
  ];

  const summary = summarizeBasketAnalyticsRecords({
    records,
    window: 'last_24h',
    limit: 1,
    now: '2026-04-24T12:00:00.000Z',
  });

  assert.equal(summary.sample_size, 1);
  assert.equal(summary.average_resolution_rate, 1);
  assert.equal(summary.average_savings, 10);
});

test('persisting metrics does not mutate optimizer result', async () => {
  const store = await createEndpointStore();
  const withoutPersist = await optimizeWithMetrics(store, false);
  const withPersist = await optimizeWithMetrics(store, true);

  assert.deepEqual(withPersist.body.optimizer_result, withoutPersist.body.optimizer_result);
});

test('persistence failure does not break optimize API response', async () => {
  const populatedStore = await createEndpointStore();
  const state = await populatedStore.load();
  class FailingSaveStore extends InMemoryDataBackboneStore {
    async save() {
      throw new Error('simulated save failure');
    }
  }
  const failingStore = new FailingSaveStore(state);

  const response = await optimizeWithMetrics(failingStore, true);

  assert.equal(response.status, 200);
  assert.equal(Boolean(response.body.metrics), true);
  assert.equal(response.body.optimizer_result.currency, 'EUR');
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

  console.log(`\nPhase 16.6 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
