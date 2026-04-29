const assert = require('node:assert/strict');

const {
  INTERNAL_INSIGHTS_DASHBOARD_ENDPOINTS,
  INTERNAL_INSIGHTS_DASHBOARD_PATH,
  PROTECTED_INTERNAL_ANALYTICS_ENDPOINTS,
  buildInternalInsightsDashboardHtml,
  handleInternalInsightsDashboardRequest,
  isInternalAnalyticsPath,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('dashboard shell renders as internal HTML surface', () => {
  const html = buildInternalInsightsDashboardHtml();

  assert.equal(html.startsWith('<!doctype html>'), true);
  assert.equal(html.includes('Pricer Internal Insights'), true);
  assert.equal(html.includes('Internal market intelligence dashboard stub'), true);
  assert.equal(html.includes('id="token"'), true);
  assert.equal(html.includes('id="role"'), true);
  assert.equal(html.includes('id="refresh"'), true);
});

test('dashboard consumes all Phase 20.4 insight endpoints', () => {
  const html = buildInternalInsightsDashboardHtml();

  INTERNAL_INSIGHTS_DASHBOARD_ENDPOINTS.forEach((endpoint) => {
    assert.equal(html.includes(endpoint), true);
  });
  assert.deepEqual(INTERNAL_INSIGHTS_DASHBOARD_ENDPOINTS, [
    '/analytics/insights/overview',
    '/analytics/insights/opportunities',
    '/analytics/insights/categories',
    '/analytics/insights/localities',
    '/analytics/insights/chains',
  ]);
});

test('dashboard sends token and role headers but does not embed a token value', () => {
  const html = buildInternalInsightsDashboardHtml();

  assert.equal(html.includes('x-pricer-admin-token'), true);
  assert.equal(html.includes('x-pricer-role'), true);
  assert.equal(html.includes('PRICER_INTERNAL_ANALYTICS_TOKEN='), false);
  assert.equal(html.includes('replace_me'), false);
});

test('dashboard keeps token browser-local and configurable', () => {
  const html = buildInternalInsightsDashboardHtml();

  assert.equal(html.includes('localStorage.getItem'), true);
  assert.equal(html.includes('pricer.internalAnalyticsToken'), true);
  assert.equal(html.includes('Clear token'), true);
});

test('dashboard has table and card targets for each section', () => {
  const html = buildInternalInsightsDashboardHtml();

  [
    'id="overview"',
    'id="opportunities"',
    'id="categories"',
    'id="localities"',
    'id="chains"',
  ].forEach((fragment) => {
    assert.equal(html.includes(fragment), true);
  });
});

test('dashboard route is a shell and protected data endpoints stay guarded', () => {
  assert.equal(INTERNAL_INSIGHTS_DASHBOARD_PATH, '/internal/insights/dashboard');
  assert.equal(isInternalAnalyticsPath(INTERNAL_INSIGHTS_DASHBOARD_PATH), false);
  INTERNAL_INSIGHTS_DASHBOARD_ENDPOINTS.forEach((endpoint) => {
    assert.equal(PROTECTED_INTERNAL_ANALYTICS_ENDPOINTS.includes(endpoint), true);
  });
});

test('dashboard handler returns no-store html response', () => {
  const response = handleInternalInsightsDashboardRequest();

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.includes('<script>'), true);
});

test('dashboard copy does not present merchant billing or polished product UI', () => {
  const html = buildInternalInsightsDashboardHtml().toLowerCase();

  assert.equal(html.includes('billing'), false);
  assert.equal(html.includes('subscribe'), false);
  assert.equal(html.includes('pricing plan'), false);
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

  console.log(`\nPhase 20.6 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
