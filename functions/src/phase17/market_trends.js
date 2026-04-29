const {
  classifyProductDeal,
} = require('./deals');

const ALLOWED_MARKET_TREND_GROUPS = Object.freeze([
  'category_l1',
  'category_l2',
  'category_l3',
  'brand',
  'base_product',
]);
const ALLOWED_MARKET_TREND_WINDOWS = Object.freeze(['last_7d', 'last_30d', 'all']);
const MARKET_TREND_UP_THRESHOLD = 0.03;
const MARKET_TREND_DOWN_THRESHOLD = -0.03;

async function handleMarketTrendsRequest({
  store,
  body = {},
}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      status: 400,
      body: {
        error: 'request body must be an object',
      },
    };
  }

  try {
    return {
      status: 200,
      body: await buildMarketTrendSummary({
        store,
        group_by: body.group_by,
        window: body.window,
        filters: body.filters,
      }),
    };
  } catch (error) {
    return {
      status: 400,
      body: {
        error: error.message,
      },
    };
  }
}

async function handleMarketOverviewRequest({
  store,
  body = {},
}) {
  try {
    return {
      status: 200,
      body: await buildMarketTrendSummary({
        store,
        group_by: 'category_l1',
        window: body.window || 'last_30d',
        filters: body.filters || {},
      }),
    };
  } catch (error) {
    return {
      status: 400,
      body: {
        error: error.message,
      },
    };
  }
}

async function buildMarketTrendSummary({
  store,
  state,
  group_by: groupBySnakeCase,
  groupBy,
  window = 'last_30d',
  filters = {},
} = {}) {
  const resolvedGroupBy = groupBySnakeCase || groupBy || 'category_l1';
  if (!ALLOWED_MARKET_TREND_GROUPS.includes(resolvedGroupBy)) {
    throw new Error('invalid group_by');
  }
  if (!ALLOWED_MARKET_TREND_WINDOWS.includes(window)) {
    throw new Error('invalid window');
  }

  const loadedState = state || await store.load();
  const normalizedFilters = normalizeFilters(filters);
  const productContexts = buildCanonicalProductContexts(loadedState)
    .filter((context) => matchesFilters(context.enrichment, normalizedFilters));
  const latestDate = resolveLatestDate(loadedState.product_daily_prices || []);
  const windowRange = buildWindowRange({
    window,
    latestDate,
  });

  const groups = new Map();
  productContexts.forEach((context) => {
    const key = normalizeGroupKey(resolveGroupValue(context, resolvedGroupBy));
    const group = groups.get(key) || createEmptyGroup(key);
    group.product_count += 1;

    const trendInput = buildProductTrendInput({
      context,
      productDailyPrices: loadedState.product_daily_prices || [],
      windowRange,
      window,
    });

    if (trendInput.current_price !== null) {
      group.priced_product_count += 1;
      group.current_prices.push(trendInput.current_price);
      const deal = classifyProductDeal({
        price_records: trendInput.price_records,
        current_price: trendInput.current_price,
      });
      if (deal.deal_level === 'good') {
        group.deal_count += 1;
      }
    }

    if (trendInput.previous_price !== null) {
      group.previous_prices.push(trendInput.previous_price);
    }

    groups.set(key, group);
  });

  return {
    group_by: resolvedGroupBy,
    window,
    groups: [...groups.values()].map(finalizeGroup).sort(compareGroups),
  };
}

function buildCanonicalProductContexts(state) {
  const enrichmentsById = new Map(
    (state?.canonical_enrichment_store || []).map((row) => [row.canonical_fingerprint, row.enrichment || null])
  );
  const mappingsByCanonicalId = new Map();
  (state?.canonical_product_mappings || []).forEach((mapping) => {
    const entries = mappingsByCanonicalId.get(mapping.canonical_product_id) || [];
    entries.push(mapping.source_product_id);
    mappingsByCanonicalId.set(mapping.canonical_product_id, entries);
  });

  return (state?.canonical_products || [])
    .map((product) => ({
      canonical_product_id: product.canonical_product_id,
      product,
      enrichment: enrichmentsById.get(product.canonical_product_id) || null,
      source_product_ids: [...new Set(mappingsByCanonicalId.get(product.canonical_product_id) || [])].sort(),
    }))
    .filter((context) => context.enrichment);
}

function buildProductTrendInput({
  context,
  productDailyPrices,
  windowRange,
  window,
}) {
  const sourceIds = new Set(context.source_product_ids);
  const rows = productDailyPrices
    .filter((row) => sourceIds.has(row.source_product_id))
    .filter((row) => normalizePrice(row.price_avg) !== null)
    .filter((row) => parseDate(row.date) !== null)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));

  const currentRows = rows.filter((row) => row.date >= windowRange.current_start && row.date <= windowRange.current_end);
  const current = latestAverageByDate(currentRows);
  const previousRows = window === 'all'
    ? rows.filter((row) => current.date === null || row.date < current.date)
    : rows.filter((row) => row.date >= windowRange.previous_start && row.date < windowRange.current_start);
  const previous = latestAverageByDate(previousRows);

  return {
    current_price: current.price,
    previous_price: previous.price,
    price_records: currentRows.map((row) => ({
      price: normalizePrice(row.price_avg),
      snapshot_date: row.date,
    })),
  };
}

function latestAverageByDate(rows) {
  if (rows.length === 0) {
    return {
      date: null,
      price: null,
    };
  }

  const latestDate = rows[rows.length - 1].date;
  const latestRows = rows.filter((row) => row.date === latestDate);
  return {
    date: latestDate,
    price: roundMoney(average(latestRows.map((row) => normalizePrice(row.price_avg)).filter((value) => value !== null))),
  };
}

function buildWindowRange({
  window,
  latestDate,
}) {
  const end = latestDate || new Date().toISOString().slice(0, 10);
  if (window === 'all') {
    return {
      current_start: '0000-01-01',
      current_end: end,
      previous_start: '0000-01-01',
    };
  }

  const days = window === 'last_7d' ? 7 : 30;
  const endTime = Date.parse(`${end}T00:00:00.000Z`);
  const currentStart = new Date(endTime - (days - 1) * 86400000).toISOString().slice(0, 10);
  const previousStart = new Date(endTime - (days * 2 - 1) * 86400000).toISOString().slice(0, 10);
  return {
    current_start: currentStart,
    current_end: end,
    previous_start: previousStart,
  };
}

function finalizeGroup(group) {
  const averagePriceCurrent = group.current_prices.length > 0
    ? roundMoney(average(group.current_prices))
    : null;
  const averagePricePrevious = group.previous_prices.length > 0
    ? roundMoney(average(group.previous_prices))
    : null;
  const changeAmount = averagePriceCurrent !== null && averagePricePrevious !== null
    ? roundMoney(averagePriceCurrent - averagePricePrevious)
    : null;
  const changePercent = averagePriceCurrent !== null && averagePricePrevious !== null && averagePricePrevious > 0
    ? roundRatio(changeAmount / averagePricePrevious)
    : null;

  return {
    key: group.key,
    product_count: group.product_count,
    priced_product_count: group.priced_product_count,
    average_price_current: averagePriceCurrent,
    average_price_previous: averagePricePrevious,
    change_amount: changeAmount,
    change_percent: changePercent,
    trend: classifyTrend(changePercent),
    deal_count: group.deal_count,
    deal_density: group.priced_product_count > 0
      ? roundRatio(group.deal_count / group.priced_product_count)
      : 0,
  };
}

function classifyTrend(changePercent) {
  if (changePercent === null) {
    return 'insufficient_data';
  }
  if (changePercent >= MARKET_TREND_UP_THRESHOLD) {
    return 'up';
  }
  if (changePercent <= MARKET_TREND_DOWN_THRESHOLD) {
    return 'down';
  }
  return 'flat';
}

function createEmptyGroup(key) {
  return {
    key,
    product_count: 0,
    priced_product_count: 0,
    current_prices: [],
    previous_prices: [],
    deal_count: 0,
  };
}

function resolveGroupValue(context, groupBy) {
  if (groupBy === 'brand') {
    return context.enrichment.brand || context.product.canonical_brand;
  }
  if (groupBy === 'base_product') {
    return context.enrichment.base_product || context.product.canonical_product_type;
  }

  return context.enrichment[groupBy];
}

function matchesFilters(enrichment, filters) {
  return Object.entries(filters).every(([key, requested]) => {
    if (requested === undefined || requested === null || requested === '') {
      return true;
    }
    return normalizeComparable(enrichment?.[key]) === normalizeComparable(requested);
  });
}

function normalizeFilters(filters) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(filters).filter(([key]) => ALLOWED_MARKET_TREND_GROUPS.includes(key))
  );
}

function normalizeGroupKey(value) {
  const normalized = String(value || '').trim();
  return normalized || 'Uncategorized';
}

function resolveLatestDate(productDailyPrices) {
  return productDailyPrices
    .map((row) => row.date)
    .filter((date) => parseDate(date) !== null)
    .sort()
    .at(-1) || null;
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return null;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundRatio(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function normalizeComparable(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/gu, ' ');
}

function compareGroups(left, right) {
  if (right.priced_product_count !== left.priced_product_count) {
    return right.priced_product_count - left.priced_product_count;
  }
  if (right.product_count !== left.product_count) {
    return right.product_count - left.product_count;
  }
  return left.key.localeCompare(right.key);
}

module.exports = {
  ALLOWED_MARKET_TREND_GROUPS,
  ALLOWED_MARKET_TREND_WINDOWS,
  MARKET_TREND_DOWN_THRESHOLD,
  MARKET_TREND_UP_THRESHOLD,
  buildMarketTrendSummary,
  handleMarketOverviewRequest,
  handleMarketTrendsRequest,
};
