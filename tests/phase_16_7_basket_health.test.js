const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  buildBasketAnalyticsRecord,
  buildBasketHealthAlerts,
  handleGetBasketHealthRequest,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function summary(overrides = {}) {
  return {
    average_resolution_rate: 0.9,
    average_price_coverage: 0.9,
    average_stale_rate: 0.05,
    average_savings: 3,
    average_savings_rate: 0.1,
    multi_store_usage_rate: 0.5,
    convenience_flip_rate: 0.1,
    sample_size: 30,
    ...overrides,
  };
}

function metrics(overrides = {}) {
  const resolutionRate = overrides.resolutionRate ?? 0.9;
  const priceCoverageRate = overrides.priceCoverageRate ?? 0.9;
  const staleRate = overrides.staleRate ?? 0.05;
  const savings = overrides.savings ?? 3;
  const savingsRate = overrides.savingsRate ?? 0.1;
  const flip = overrides.flip ?? false;

  return {
    resolver: {
      total_items: 4,
      resolved_count: Math.round(resolutionRate * 4),
      ambiguous_count: 0,
      unresolved_count: 0,
      resolution_rate: resolutionRate,
      ambiguity_rate: 0,
      unresolved_rate: 0,
    },
    pricing: {
      priced_item_count: 4,
      missing_item_count: 0,
      stale_item_count: Math.round(staleRate * 4),
      price_coverage_rate: priceCoverageRate,
      missing_rate: 0,
      stale_rate: staleRate,
    },
    optimization: {
      recommended_strategy: 'multi_store',
      single_store_total: 100,
      multi_store_total: 100 - savings,
      savings,
      savings_rate: savingsRate,
    },
    convenience: {
      recommended_before: 'multi_store',
      recommended_after: flip ? 'single_store' : 'multi_store',
      recommendation_flip: flip,
      flip,
      effective_total: 100,
      actual_total: 100,
      effective_vs_actual_delta: 0,
    },
  };
}

function hasAlert(result, type, severity = null) {
  return result.alerts.some((entry) => (
    entry.type === type && (severity === null || entry.severity === severity)
  ));
}

test('low resolution triggers warning', () => {
  const result = buildBasketHealthAlerts(summary({
    average_resolution_rate: 0.6,
  }));

  assert.equal(result.status, 'warning');
  assert.equal(hasAlert(result, 'low_resolution_rate', 'warning'), true);
});

test('low price coverage triggers warning', () => {
  const result = buildBasketHealthAlerts(summary({
    average_price_coverage: 0.6,
  }));

  assert.equal(result.status, 'warning');
  assert.equal(hasAlert(result, 'low_price_coverage', 'warning'), true);
});

test('high stale rate triggers warning', () => {
  const result = buildBasketHealthAlerts(summary({
    average_stale_rate: 0.4,
  }));

  assert.equal(result.status, 'warning');
  assert.equal(hasAlert(result, 'high_stale_rate', 'warning'), true);
});

test('low savings and low savings rate trigger warnings', () => {
  const result = buildBasketHealthAlerts(summary({
    average_savings: 0.5,
    average_savings_rate: 0.03,
  }));

  assert.equal(result.status, 'warning');
  assert.equal(hasAlert(result, 'low_average_savings', 'warning'), true);
  assert.equal(hasAlert(result, 'low_average_savings_rate', 'warning'), true);
});

test('high convenience flip rate triggers warning', () => {
  const result = buildBasketHealthAlerts(summary({
    convenience_flip_rate: 0.5,
  }));

  assert.equal(result.status, 'warning');
  assert.equal(hasAlert(result, 'high_convenience_flip_rate', 'warning'), true);
});

test('multiple alerts combine correctly', () => {
  const result = buildBasketHealthAlerts(summary({
    average_resolution_rate: 0.6,
    average_price_coverage: 0.65,
    average_stale_rate: 0.4,
  }));

  assert.equal(result.status, 'warning');
  assert.equal(result.alerts.filter((entry) => entry.severity === 'warning').length, 3);
});

test('critical alert overrides warning status', () => {
  const result = buildBasketHealthAlerts(summary({
    average_resolution_rate: 0.6,
    average_price_coverage: 0.4,
  }));

  assert.equal(result.status, 'critical');
  assert.equal(hasAlert(result, 'low_resolution_rate', 'warning'), true);
  assert.equal(hasAlert(result, 'low_price_coverage', 'critical'), true);
});

test('empty dataset returns safe health output', async () => {
  const response = await handleGetBasketHealthRequest({
    store: new InMemoryDataBackboneStore(),
    query: {},
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'healthy');
  assert.equal(response.body.summary.sample_size, 0);
  assert.equal(hasAlert(response.body, 'low_sample_size', 'info'), true);
});

test('basket health endpoint aggregates persisted analytics and supports window', async () => {
  const store = new InMemoryDataBackboneStore({
    basket_analytics_store: [
      buildBasketAnalyticsRecord({
        metrics: metrics({
          resolutionRate: 0.9,
          priceCoverageRate: 0.9,
          staleRate: 0.05,
          savings: 3,
          savingsRate: 0.1,
        }),
        timestamp: '2026-04-20T10:00:00.000Z',
      }),
      buildBasketAnalyticsRecord({
        metrics: metrics({
          resolutionRate: 0.6,
          priceCoverageRate: 0.6,
          staleRate: 0.4,
          savings: 0.5,
          savingsRate: 0.03,
          flip: false,
        }),
        timestamp: new Date().toISOString(),
      }),
    ],
  });

  const response = await handleGetBasketHealthRequest({
    store,
    query: {
      window: 'last_24h',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'warning');
  assert.equal(response.body.summary.window, 'last_24h');
  assert.equal(response.body.summary.sample_size, 1);
  assert.equal(hasAlert(response.body, 'low_price_coverage', 'warning'), true);
});

test('health builder does not mutate summary input', () => {
  const input = summary({
    average_resolution_rate: 0.6,
    average_price_coverage: 0.4,
  });
  const before = JSON.parse(JSON.stringify(input));

  buildBasketHealthAlerts(input);

  assert.deepEqual(input, before);
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

  console.log(`\nPhase 16.7 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
