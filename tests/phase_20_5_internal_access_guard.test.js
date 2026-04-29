const assert = require('node:assert/strict');

const {
  INTERNAL_ANALYTICS_ROLE_HEADER,
  INTERNAL_ANALYTICS_TOKEN_ENV,
  INTERNAL_ANALYTICS_TOKEN_HEADER,
  PROTECTED_INTERNAL_ANALYTICS_ENDPOINTS,
  isInternalAnalyticsPath,
  requireInternalAnalyticsAccess,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function req(headers = {}, path = '/analytics/opportunities') {
  return {
    path,
    headers,
    get(name) {
      return this.headers[name] || this.headers[String(name).toLowerCase()] || null;
    },
  };
}

function env(token = 'secret-token') {
  return {
    [INTERNAL_ANALYTICS_TOKEN_ENV]: token,
  };
}

test('protected endpoint without token returns forbidden', () => {
  const result = requireInternalAnalyticsAccess(req({}, '/analytics/gap-detection'), { env: env() });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: 'forbidden' });
});

test('protected endpoint with wrong token returns forbidden', () => {
  const result = requireInternalAnalyticsAccess(req({
    [INTERNAL_ANALYTICS_TOKEN_HEADER]: 'wrong-token',
    [INTERNAL_ANALYTICS_ROLE_HEADER]: 'admin',
  }), { env: env('correct-token') });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: 'forbidden' });
});

test('correct token and admin role passes', () => {
  const result = requireInternalAnalyticsAccess(req({
    [INTERNAL_ANALYTICS_TOKEN_HEADER]: 'correct-token',
    [INTERNAL_ANALYTICS_ROLE_HEADER]: 'admin',
  }), { env: env('correct-token') });

  assert.equal(result.allowed, true);
  assert.equal(result.role, 'admin');
});

test('correct token and analyst role passes', () => {
  const result = requireInternalAnalyticsAccess(req({
    [INTERNAL_ANALYTICS_TOKEN_HEADER]: 'correct-token',
    [INTERNAL_ANALYTICS_ROLE_HEADER]: 'analyst',
  }), { env: env('correct-token') });

  assert.equal(result.allowed, true);
  assert.equal(result.role, 'analyst');
});

test('correct token and merchant role is denied', () => {
  const result = requireInternalAnalyticsAccess(req({
    [INTERNAL_ANALYTICS_TOKEN_HEADER]: 'correct-token',
    [INTERNAL_ANALYTICS_ROLE_HEADER]: 'merchant',
  }), { env: env('correct-token') });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test('missing env token denies access', () => {
  const result = requireInternalAnalyticsAccess(req({
    [INTERNAL_ANALYTICS_TOKEN_HEADER]: 'correct-token',
    [INTERNAL_ANALYTICS_ROLE_HEADER]: 'admin',
  }), { env: {} });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test('normal consumer endpoints remain unguarded by protected path list', () => {
  [
    '/home/summary',
    '/products/search',
    '/basket/optimize',
    '/watchlist',
    '/lists',
  ].forEach((path) => {
    assert.equal(isInternalAnalyticsPath(path), false);
  });
});

test('all Phase 20 market intelligence endpoints are in protected path list', () => {
  [
    '/analytics/gap-detection',
    '/analytics/gap-detection/localities',
    '/analytics/gap-detection/coverage-by-chain',
    '/analytics/opportunities',
    '/analytics/insights/overview',
    '/analytics/insights/opportunities',
    '/analytics/insights/categories',
    '/analytics/insights/localities',
    '/analytics/insights/chains',
  ].forEach((path) => {
    assert.equal(isInternalAnalyticsPath(path), true);
    assert.equal(PROTECTED_INTERNAL_ANALYTICS_ENDPOINTS.includes(path), true);
  });
});

test('token value never appears in forbidden response', () => {
  const leakedToken = 'super-secret-token';
  const result = requireInternalAnalyticsAccess(req({
    [INTERNAL_ANALYTICS_TOKEN_HEADER]: leakedToken,
    [INTERNAL_ANALYTICS_ROLE_HEADER]: 'admin',
  }), { env: env('different-token') });
  const serialized = JSON.stringify(result);

  assert.equal(result.allowed, false);
  assert.equal(serialized.includes(leakedToken), false);
  assert.equal(serialized.includes('different-token'), false);
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

  console.log(`\nPhase 20.5 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
