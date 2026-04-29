const crypto = require('node:crypto');

const {
  buildGlobalBasketMetricsSummary,
} = require('./basket_quality');

const ALLOWED_BASKET_ANALYTICS_WINDOWS = Object.freeze(['last_24h', 'last_7d', 'all']);
const DEFAULT_BASKET_ANALYTICS_LIMIT = 1000;

async function persistBasketAnalyticsRecord({
  store,
  metrics,
  timestamp = new Date().toISOString(),
}) {
  if (!store) {
    throw new Error('store is required');
  }
  const record = buildBasketAnalyticsRecord({
    metrics,
    timestamp,
  });
  const state = await store.load();
  state.basket_analytics_store = Array.isArray(state.basket_analytics_store)
    ? state.basket_analytics_store
    : [];
  const existingIndex = state.basket_analytics_store.findIndex(
    (entry) => entry.analytics_id === record.analytics_id
  );
  if (existingIndex >= 0) {
    state.basket_analytics_store[existingIndex] = record;
  } else {
    state.basket_analytics_store.push(record);
  }
  await store.save(state);
  return record;
}

function buildBasketAnalyticsRecord({
  metrics,
  timestamp = new Date().toISOString(),
}) {
  const normalizedTimestamp = normalizeTimestamp(timestamp);
  const normalizedMetrics = normalizeMetrics(metrics);
  return {
    analytics_id: buildBasketAnalyticsId({
      timestamp: normalizedTimestamp,
      metrics: normalizedMetrics,
    }),
    timestamp: normalizedTimestamp,
    resolver: normalizedMetrics.resolver,
    pricing: normalizedMetrics.pricing,
    optimization: normalizedMetrics.optimization,
    convenience: normalizedMetrics.convenience,
  };
}

async function getBasketAnalyticsSummary({
  store,
  window = 'all',
  limit = DEFAULT_BASKET_ANALYTICS_LIMIT,
  now = new Date().toISOString(),
} = {}) {
  if (!store) {
    throw new Error('store is required');
  }
  const normalizedWindow = normalizeWindow(window);
  const normalizedLimit = normalizeLimit(limit);
  const state = await store.load();
  return summarizeBasketAnalyticsRecords({
    records: state.basket_analytics_store || [],
    window: normalizedWindow,
    limit: normalizedLimit,
    now,
  });
}

function summarizeBasketAnalyticsRecords({
  records = [],
  window = 'all',
  limit = DEFAULT_BASKET_ANALYTICS_LIMIT,
  now = new Date().toISOString(),
} = {}) {
  const normalizedWindow = normalizeWindow(window);
  const normalizedLimit = normalizeLimit(limit);
  const threshold = resolveWindowThreshold({
    window: normalizedWindow,
    now,
  });
  const validRecords = (Array.isArray(records) ? records : [])
    .filter((record) => isValidBasketAnalyticsRecord(record))
    .filter((record) => threshold === null || Date.parse(record.timestamp) >= threshold)
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, normalizedLimit);
  const summary = buildGlobalBasketMetricsSummary(validRecords);

  return {
    ...summary,
    average_stale_rate: roundRatio(average(validRecords.map((record) => record.pricing?.stale_rate || 0))),
    average_savings_rate: roundRatio(average(validRecords.map((record) => record.optimization?.savings_rate || 0))),
    sample_size: validRecords.length,
  };
}

async function handleGetBasketAnalyticsSummaryRequest({
  store,
  query = {},
}) {
  const windowResult = parseWindow(query.window);
  if (windowResult.error) {
    return windowResult.error;
  }
  const limitResult = parseLimit(query.limit);
  if (limitResult.error) {
    return limitResult.error;
  }

  const summary = await getBasketAnalyticsSummary({
    store,
    window: windowResult.value,
    limit: limitResult.value,
  });

  return {
    status: 200,
    body: {
      window: windowResult.value,
      limit: limitResult.value,
      ...summary,
    },
  };
}

function buildBasketAnalyticsId({ timestamp, metrics }) {
  return `ba_${crypto
    .createHash('sha256')
    .update(`${timestamp}|${JSON.stringify(metrics)}`)
    .digest('hex')
    .slice(0, 32)}`;
}

function normalizeMetrics(metrics = {}) {
  return JSON.parse(JSON.stringify({
    resolver: metrics.resolver || {},
    pricing: metrics.pricing || {},
    optimization: metrics.optimization || {},
    convenience: metrics.convenience || {},
  }));
}

function isValidBasketAnalyticsRecord(record) {
  return Boolean(
    record &&
    typeof record.analytics_id === 'string' &&
    Number.isFinite(Date.parse(record.timestamp)) &&
    isFiniteNumber(record.resolver?.resolution_rate) &&
    isFiniteNumber(record.pricing?.price_coverage_rate) &&
    isFiniteNumber(record.optimization?.savings) &&
    typeof record.optimization?.recommended_strategy === 'string' &&
    typeof record.convenience?.recommendation_flip === 'boolean'
  );
}

function resolveWindowThreshold({ window, now }) {
  if (window === 'all') {
    return null;
  }
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    return null;
  }
  const deltaMs = window === 'last_24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return nowMs - deltaMs;
}

function parseWindow(value) {
  const window = normalizeWindow(value || 'all');
  if (!ALLOWED_BASKET_ANALYTICS_WINDOWS.includes(window)) {
    return {
      error: {
        status: 400,
        body: {
          error: 'invalid analytics window',
          allowed_windows: ALLOWED_BASKET_ANALYTICS_WINDOWS,
        },
      },
    };
  }
  return { value: window };
}

function parseLimit(value) {
  const limit = value === undefined || value === null || value === ''
    ? DEFAULT_BASKET_ANALYTICS_LIMIT
    : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > DEFAULT_BASKET_ANALYTICS_LIMIT) {
    return {
      error: {
        status: 400,
        body: {
          error: 'limit must be an integer between 1 and 1000',
        },
      },
    };
  }
  return { value: limit };
}

function normalizeWindow(value) {
  return String(value || 'all').trim().toLowerCase();
}

function normalizeLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    return DEFAULT_BASKET_ANALYTICS_LIMIT;
  }
  return Math.min(limit, DEFAULT_BASKET_ANALYTICS_LIMIT);
}

function normalizeTimestamp(value) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function average(values) {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + Number(value || 0), 0) / values.length;
}

function roundRatio(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

module.exports = {
  ALLOWED_BASKET_ANALYTICS_WINDOWS,
  DEFAULT_BASKET_ANALYTICS_LIMIT,
  buildBasketAnalyticsRecord,
  getBasketAnalyticsSummary,
  handleGetBasketAnalyticsSummaryRequest,
  persistBasketAnalyticsRecord,
  summarizeBasketAnalyticsRecords,
};
