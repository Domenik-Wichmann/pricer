const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  buildBasketQualityMetrics,
  buildGlobalBasketMetricsSummary,
  handleOptimizeBasketSingleStoreRequest,
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

function metricFixture(overrides = {}) {
  return {
    resolver_output: overrides.resolver_output || {
      items: [
        { status: 'resolved' },
        { status: 'resolved' },
        { status: 'ambiguous' },
        { status: 'unresolved' },
      ],
    },
    price_lookup: overrides.price_lookup || {
      summary: {
        requested_count: 4,
        priced_count: 3,
        missing_count: 1,
        stale_count: 1,
      },
    },
    optimizer_result: overrides.optimizer_result || {
      optimization_type: 'multi_store',
      recommended_strategy: 'multi_store',
      best_single_store_option: {
        actual_total: 100,
      },
      best_multi_store_option: {
        actual_total: 80,
      },
    },
    convenience_result: overrides.convenience_result || {
      recommended_strategy_before_convenience: 'multi_store',
      recommended_strategy_after_convenience: 'single_store',
      best_effective_option: {
        actual_total: 80,
        effective_total: 85,
      },
    },
  };
}

test('resolver rates are calculated from resolver output', () => {
  const metrics = buildBasketQualityMetrics(metricFixture());

  assert.equal(metrics.resolver.total_items, 4);
  assert.equal(metrics.resolver.resolved_count, 2);
  assert.equal(metrics.resolver.ambiguous_count, 1);
  assert.equal(metrics.resolver.unresolved_count, 1);
  assert.equal(metrics.resolver.resolution_rate, 0.5);
  assert.equal(metrics.resolver.ambiguity_rate, 0.25);
  assert.equal(metrics.resolver.unresolved_rate, 0.25);
});

test('pricing coverage, missing, and stale rates are calculated from price lookup summary', () => {
  const metrics = buildBasketQualityMetrics(metricFixture());

  assert.equal(metrics.pricing.priced_item_count, 3);
  assert.equal(metrics.pricing.missing_item_count, 1);
  assert.equal(metrics.pricing.stale_item_count, 1);
  assert.equal(metrics.pricing.price_coverage_rate, 0.75);
  assert.equal(metrics.pricing.missing_rate, 0.25);
  assert.equal(metrics.pricing.stale_rate, 0.25);
});

test('optimization savings and savings rate compare multi-store against single-store total', () => {
  const metrics = buildBasketQualityMetrics(metricFixture());

  assert.equal(metrics.optimization.single_store_total, 100);
  assert.equal(metrics.optimization.multi_store_total, 80);
  assert.equal(metrics.optimization.savings, 20);
  assert.equal(metrics.optimization.savings_rate, 0.2);
});

test('convenience metrics detect recommendation flip and effective price delta', () => {
  const metrics = buildBasketQualityMetrics(metricFixture());

  assert.equal(metrics.convenience.recommended_before, 'multi_store');
  assert.equal(metrics.convenience.recommended_after, 'single_store');
  assert.equal(metrics.convenience.recommendation_flip, true);
  assert.equal(metrics.convenience.flip, true);
  assert.equal(metrics.convenience.effective_total, 85);
  assert.equal(metrics.convenience.actual_total, 80);
  assert.equal(metrics.convenience.effective_vs_actual_delta, 5);
});

test('global basket metrics summary aggregates multiple runs deterministically', () => {
  const first = buildBasketQualityMetrics(metricFixture());
  const second = buildBasketQualityMetrics(metricFixture({
    resolver_output: {
      items: [
        { status: 'resolved' },
        { status: 'resolved' },
      ],
    },
    price_lookup: {
      summary: {
        requested_count: 2,
        priced_count: 2,
        missing_count: 0,
        stale_count: 0,
      },
    },
    optimizer_result: {
      optimization_type: 'multi_store',
      recommended_strategy: 'single_store',
      best_single_store_option: { actual_total: 50 },
      best_multi_store_option: { actual_total: 49 },
    },
    convenience_result: {
      recommended_strategy_before_convenience: 'single_store',
      recommended_strategy_after_convenience: 'single_store',
      best_effective_option: {
        actual_total: 50,
        effective_total: 50,
      },
    },
  }));

  const summary = buildGlobalBasketMetricsSummary([first, second]);

  assert.equal(summary.average_resolution_rate, 0.75);
  assert.equal(summary.average_price_coverage, 0.875);
  assert.equal(summary.average_savings, 10.5);
  assert.equal(summary.multi_store_usage_rate, 0.5);
  assert.equal(summary.convenience_flip_rate, 0.5);
});

test('metrics helpers do not mutate inputs', () => {
  const input = metricFixture();
  const before = JSON.parse(JSON.stringify(input));

  buildBasketQualityMetrics(input);

  assert.deepEqual(input, before);
});

test('all unresolved inputs return zero resolution and full unresolved rate', () => {
  const metrics = buildBasketQualityMetrics(metricFixture({
    resolver_output: {
      items: [
        { status: 'unresolved' },
        { status: 'unresolved' },
        { status: 'unresolved' },
      ],
    },
  }));

  assert.equal(metrics.resolver.resolution_rate, 0);
  assert.equal(metrics.resolver.unresolved_rate, 1);
});

test('all missing prices return zero price coverage and full missing rate', () => {
  const metrics = buildBasketQualityMetrics(metricFixture({
    price_lookup: {
      summary: {
        requested_count: 3,
        priced_count: 0,
        missing_count: 3,
        stale_count: 0,
      },
    },
  }));

  assert.equal(metrics.pricing.price_coverage_rate, 0);
  assert.equal(metrics.pricing.missing_rate, 1);
});

test('single-store optimizer result without multi-store option reports no multi-store savings', () => {
  const metrics = buildBasketQualityMetrics(metricFixture({
    optimizer_result: {
      optimization_type: 'single_store',
      best_option: {
        actual_total: 50,
      },
    },
  }));

  assert.equal(metrics.optimization.recommended_strategy, 'single_store');
  assert.equal(metrics.optimization.single_store_total, 50);
  assert.equal(metrics.optimization.multi_store_total, null);
  assert.equal(metrics.optimization.savings, 0);
  assert.equal(metrics.optimization.savings_rate, 0);
});

test('include_metrics omitted preserves existing optimize response shape', async () => {
  const response = await handleOptimizeBasketSingleStoreRequest({
    store: await createEndpointStore(),
    body: {
      items: ['milk'],
    },
  });

  assert.equal(response.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(response.body, 'metrics'), false);
});

test('include_metrics true adds read-only metrics to optimize response', async () => {
  const response = await handleOptimizeBasketSingleStoreRequest({
    store: await createEndpointStore(),
    body: {
      items: ['milk', 'eggs'],
      optimizer_options: {
        strategy: 'multi_store',
        include_convenience_scoring: true,
        include_metrics: true,
      },
      convenience_options: {
        extra_store_penalty: 2,
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.metrics.resolver.total_items, 2);
  assert.equal(response.body.metrics.resolver.ambiguity_rate, 1);
  assert.equal(response.body.metrics.pricing.price_coverage_rate, 1);
  assert.equal(response.body.metrics.optimization.savings, 5);
  assert.equal(response.body.metrics.convenience.effective_vs_actual_delta, 2);
});

test('metrics do not affect optimizer result', async () => {
  const store = await createEndpointStore();
  const body = {
    items: ['milk', 'eggs'],
    optimizer_options: {
      strategy: 'multi_store',
      include_convenience_scoring: true,
    },
    convenience_options: {
      extra_store_penalty: 2,
    },
  };
  const withoutMetrics = await handleOptimizeBasketSingleStoreRequest({ store, body });
  const withMetrics = await handleOptimizeBasketSingleStoreRequest({
    store,
    body: {
      ...body,
      optimizer_options: {
        ...body.optimizer_options,
        include_metrics: true,
      },
    },
  });
  const comparableBody = { ...withMetrics.body };
  delete comparableBody.metrics;

  assert.equal(withoutMetrics.status, 200);
  assert.equal(withMetrics.status, 200);
  assert.deepEqual(comparableBody, withoutMetrics.body);
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

  console.log(`\nPhase 16.5 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
