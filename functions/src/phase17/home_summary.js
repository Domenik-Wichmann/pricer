const {
  lookupCanonicalProductPrices,
} = require('../phase16/price_lookup');
const {
  classifyDealForPriceItem,
} = require('./deals');
const {
  buildMarketTrendSummary,
} = require('./market_trends');
const {
  listSavedLists,
  normalizeOwnerContext,
  resolveOwnerContextFromRequest,
} = require('./saved_lists');
const {
  buildWatchlistPriceView,
} = require('./watchlist');

const DEFAULT_HOME_SUMMARY_LIMITS = Object.freeze({
  deal_limit: 10,
  watchlist_limit: 5,
  saved_list_limit: 5,
  market_limit: 5,
});
const MAX_HOME_SUMMARY_LIMIT = 25;
const HOME_TOP_DEAL_SCAN_LIMIT = 200;

async function handleHomeSummaryRequest({
  store,
  query = {},
  body = {},
  req,
}) {
  try {
    return {
      status: 200,
      body: await buildHomeSummary({
        store,
        owner_context: resolveOwnerContextFromRequest(req),
        options: {
          ...(body?.options || {}),
          ...(query || {}),
        },
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

async function buildHomeSummary({
  store,
  owner_context: ownerContextSnakeCase,
  ownerContext,
  options = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContextSnakeCase || ownerContext);
  const limits = normalizeHomeSummaryOptions(options);
  const state = await store.load();
  const [
    topDeals,
    watchlistHighlights,
    savedLists,
    marketHighlights,
  ] = await Promise.all([
    buildTopDeals({ store, state, limit: limits.deal_limit }),
    buildWatchlistHighlights({ store, owner, limit: limits.watchlist_limit }),
    buildSavedListShortcuts({ store, owner, limit: limits.saved_list_limit }),
    buildMarketHighlights({ store, limit: limits.market_limit }),
  ]);

  return {
    owner,
    top_deals: topDeals,
    watchlist_highlights: watchlistHighlights,
    market_highlights: marketHighlights,
    saved_lists: savedLists,
    quick_actions: buildQuickActions(),
    generated_at: normalizeTimestamp(generatedAt),
  };
}

async function buildTopDeals({
  store,
  state,
  limit,
}) {
  const productById = buildCanonicalProductIndex(state);
  const canonicalProductIds = [...productById.keys()].slice(0, HOME_TOP_DEAL_SCAN_LIMIT);
  if (canonicalProductIds.length === 0 || limit <= 0) {
    return [];
  }

  const priceLookup = await lookupCanonicalProductPrices({
    store,
    canonicalProductIds,
    options: {
      max_age_days: 30,
    },
  });

  return priceLookup.items
    .map((item) => {
      const deal = classifyDealForPriceItem({
        priceItem: item,
      });
      return {
        item,
        deal,
      };
    })
    .filter((entry) => entry.deal.deal_level === 'good' && entry.item.best_price)
    .sort((left, right) => {
      if (right.deal.deal_score !== left.deal.deal_score) {
        return right.deal.deal_score - left.deal.deal_score;
      }
      return String(left.item.canonical_product_id).localeCompare(String(right.item.canonical_product_id));
    })
    .slice(0, limit)
    .map((entry) => {
      const product = productById.get(entry.item.canonical_product_id) || {};
      const bestRecord = (entry.item.price_records || []).find(
        (record) => Number(record.price) === Number(entry.item.best_price.price) && record.is_stale === false
      ) || (entry.item.price_records || [])[0] || {};
      return {
        canonical_product_id: entry.item.canonical_product_id,
        canonical_name: product.canonical_display_name || product.display_name || product.name || null,
        deal_level: entry.deal.deal_level,
        deal_score: entry.deal.deal_score,
        price: entry.item.best_price.price,
        currency: entry.item.best_price.currency || priceLookup.currency || 'EUR',
        chain_name: bestRecord.chain_name || null,
      };
    });
}

async function buildWatchlistHighlights({
  store,
  owner,
  limit,
}) {
  if (limit <= 0) {
    return [];
  }
  const response = await buildWatchlistPriceView({
    store,
    ownerContext: owner,
    options: {
      max_age_days: 30,
    },
  });

  return (response.body.items || [])
    .map((item) => buildWatchlistHighlight(item))
    .filter(Boolean)
    .slice(0, limit);
}

function buildWatchlistHighlight(item) {
  const label = item.label || item.product?.canonical_name || item.canonical_product_id;
  if (item.deal?.target_hit) {
    return {
      watch_id: item.watch_id,
      label,
      canonical_product_id: item.canonical_product_id,
      highlight_type: 'target_hit',
      message: `${label} is below your target price.`,
    };
  }
  if (item.deal?.deal_level === 'good') {
    return {
      watch_id: item.watch_id,
      label,
      canonical_product_id: item.canonical_product_id,
      highlight_type: 'good_deal',
      message: `${label} looks like a good deal.`,
    };
  }
  if (item.price?.price_status === 'missing') {
    return {
      watch_id: item.watch_id,
      label,
      canonical_product_id: item.canonical_product_id,
      highlight_type: 'missing_price',
      message: `${label} does not have a current price yet.`,
    };
  }

  return null;
}

async function buildSavedListShortcuts({
  store,
  owner,
  limit,
}) {
  if (limit <= 0) {
    return [];
  }
  const response = await listSavedLists({
    store,
    ownerContext: owner,
  });

  return (response.body.lists || []).slice(0, limit).map((list) => ({
    list_id: list.list_id,
    name: list.name,
    item_count: Array.isArray(list.items) ? list.items.length : 0,
    action: 'optimize_saved_list',
  }));
}

async function buildMarketHighlights({
  store,
  limit,
}) {
  if (limit <= 0) {
    return [];
  }
  const summary = await buildMarketTrendSummary({
    store,
    group_by: 'category_l2',
    window: 'last_30d',
  });

  return (summary.groups || [])
    .filter((group) => group.trend === 'up' || group.trend === 'down')
    .sort((left, right) => Math.abs(right.change_percent || 0) - Math.abs(left.change_percent || 0))
    .slice(0, limit)
    .map((group) => ({
      type: 'category_trend',
      label: group.key,
      trend: group.trend,
      change_percent: group.change_percent,
      message: `${group.key} prices are ${group.trend} ${formatPercent(group.change_percent)}.`,
    }));
}

function buildQuickActions() {
  return [
    {
      type: 'search_product',
      label: 'Search products',
    },
    {
      type: 'optimize_basket',
      label: 'Optimize a basket',
    },
    {
      type: 'view_watchlist',
      label: 'View watchlist',
    },
  ];
}

function normalizeHomeSummaryOptions(options = {}) {
  return {
    deal_limit: normalizeLimit(options.deal_limit, DEFAULT_HOME_SUMMARY_LIMITS.deal_limit),
    watchlist_limit: normalizeLimit(options.watchlist_limit, DEFAULT_HOME_SUMMARY_LIMITS.watchlist_limit),
    saved_list_limit: normalizeLimit(options.saved_list_limit, DEFAULT_HOME_SUMMARY_LIMITS.saved_list_limit),
    market_limit: normalizeLimit(options.market_limit, DEFAULT_HOME_SUMMARY_LIMITS.market_limit),
  };
}

function normalizeLimit(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(parsed, MAX_HOME_SUMMARY_LIMIT);
}

function buildCanonicalProductIndex(state) {
  return new Map((state?.canonical_products || []).map((product) => [
    product.canonical_product_id,
    product,
  ]));
}

function formatPercent(value) {
  return `${Math.abs(Math.round(Number(value || 0) * 1000) / 10)}%`;
}

function normalizeTimestamp(value) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
}

function requireStore(store) {
  if (!store) {
    throw new Error('store is required');
  }
}

module.exports = {
  DEFAULT_HOME_SUMMARY_LIMITS,
  MAX_HOME_SUMMARY_LIMIT,
  buildHomeSummary,
  handleHomeSummaryRequest,
  normalizeHomeSummaryOptions,
};
