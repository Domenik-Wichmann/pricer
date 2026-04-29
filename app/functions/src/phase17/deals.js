const {
  lookupCanonicalProductPrices,
} = require('../phase16/price_lookup');

const GOOD_DEAL_AVG_MULTIPLIER = 0.8;
const EXPENSIVE_AVG_MULTIPLIER = 1.2;

function classifyProductDeal({
  price_records: priceRecordsSnakeCase,
  priceRecords,
  current_price: currentPriceSnakeCase,
  currentPrice,
  target_price: targetPriceSnakeCase,
  targetPrice,
} = {}) {
  const records = Array.isArray(priceRecordsSnakeCase)
    ? priceRecordsSnakeCase
    : Array.isArray(priceRecords)
      ? priceRecords
      : [];
  const current = normalizePrice(
    currentPriceSnakeCase !== undefined ? currentPriceSnakeCase : currentPrice
  );
  const target = normalizePrice(
    targetPriceSnakeCase !== undefined ? targetPriceSnakeCase : targetPrice
  );
  const observedPrices = records
    .map((record) => normalizePrice(record?.price))
    .filter((value) => value !== null);
  const targetHit = current !== null && target !== null ? current <= target : false;

  if (current === null || observedPrices.length === 0) {
    return {
      deal_level: 'normal',
      deal_score: 0.5,
      reason: 'not enough recent price history',
      target_hit: targetHit,
      comparison: {
        avg_price: null,
        min_price: null,
        percent_difference_from_avg: null,
      },
    };
  }

  const avgPrice = roundMoney(observedPrices.reduce((sum, price) => sum + price, 0) / observedPrices.length);
  const minPrice = roundMoney(Math.min(...observedPrices));
  const percentDifference = avgPrice > 0 ? roundRatio((current - avgPrice) / avgPrice) : 0;
  let dealLevel = 'normal';
  if (current <= avgPrice * GOOD_DEAL_AVG_MULTIPLIER) {
    dealLevel = 'good';
  } else if (current >= avgPrice * EXPENSIVE_AVG_MULTIPLIER) {
    dealLevel = 'expensive';
  }

  return {
    deal_level: dealLevel,
    deal_score: buildDealScore({ dealLevel, percentDifference }),
    reason: buildDealReason({ dealLevel, percentDifference }),
    target_hit: targetHit,
    comparison: {
      avg_price: avgPrice,
      min_price: minPrice,
      percent_difference_from_avg: percentDifference,
    },
  };
}

async function handleDealCheckRequest({
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

  let priceLookup;
  try {
    priceLookup = await lookupCanonicalProductPrices({
      store,
      canonicalProductIds: body.canonical_product_ids,
      options: body.price_options || {},
    });
  } catch (error) {
    return {
      status: 400,
      body: {
        error: error.message,
      },
    };
  }

  return {
    status: 200,
    body: {
      currency: priceLookup.currency,
      items: priceLookup.items.map((item) => ({
        canonical_product_id: item.canonical_product_id,
        price_status: item.price_status,
        best_price: item.best_price,
        deal: classifyDealForPriceItem({
          priceItem: item,
          targetPrice: resolveTargetPrice(body.target_prices, item.canonical_product_id),
        }),
      })),
      summary: summarizeDeals(priceLookup.items.map((item) => classifyDealForPriceItem({
        priceItem: item,
        targetPrice: resolveTargetPrice(body.target_prices, item.canonical_product_id),
      }))),
    },
  };
}

function annotateOptimizerResultWithDeals({
  optimizerResult,
  priceLookup,
}) {
  const result = clone(optimizerResult);
  const priceByCanonicalId = new Map((priceLookup?.items || []).map((item) => [
    item.canonical_product_id,
    item,
  ]));
  const deals = [];

  visitOptimizerOptions(result, (option) => {
    option.items = (option.items || []).map((item) => {
      const deal = classifyDealForOptimizerItem({
        item,
        priceItem: priceByCanonicalId.get(item.canonical_product_id),
      });
      deals.push(deal);
      return {
        ...item,
        deal,
      };
    });
    if (Array.isArray(option.stores)) {
      option.stores = option.stores.map((store) => ({
        ...store,
        items: (store.items || []).map((item) => ({
          ...item,
          deal: classifyDealForOptimizerItem({
            item,
            priceItem: priceByCanonicalId.get(item.canonical_product_id),
          }),
        })),
      }));
    }
  });

  result.basket_deal_summary = summarizeDeals(deals);
  return result;
}

function classifyDealForPriceItem({
  priceItem,
  targetPrice,
}) {
  return classifyProductDeal({
    price_records: priceItem?.price_records || [],
    current_price: priceItem?.best_price?.price ?? null,
    target_price: targetPrice,
  });
}

function classifyDealForOptimizerItem({
  item,
  priceItem,
}) {
  return classifyProductDeal({
    price_records: priceItem?.price_records || [],
    current_price: item?.unit_price,
  });
}

function summarizeDeals(deals) {
  return {
    good_deals_count: deals.filter((deal) => deal.deal_level === 'good').length,
    expensive_items_count: deals.filter((deal) => deal.deal_level === 'expensive').length,
    normal_items_count: deals.filter((deal) => deal.deal_level === 'normal').length,
  };
}

function visitOptimizerOptions(result, visitor) {
  if (result?.best_option) {
    visitor(result.best_option);
  }
  (result?.alternatives || []).forEach(visitor);
  if (result?.best_single_store_option) {
    visitor(result.best_single_store_option);
  }
  if (result?.best_multi_store_option) {
    visitor(result.best_multi_store_option);
  }
}

function resolveTargetPrice(targetPrices, canonicalProductId) {
  if (!targetPrices || typeof targetPrices !== 'object' || Array.isArray(targetPrices)) {
    return undefined;
  }
  return targetPrices[canonicalProductId];
}

function buildDealScore({
  dealLevel,
  percentDifference,
}) {
  if (dealLevel === 'good') {
    return clampScore(roundRatio(0.75 + Math.min(Math.abs(percentDifference), 0.5) / 2));
  }
  if (dealLevel === 'expensive') {
    return clampScore(roundRatio(0.25 - Math.min(Math.abs(percentDifference), 0.5) / 2));
  }
  return 0.5;
}

function buildDealReason({
  dealLevel,
  percentDifference,
}) {
  const percent = Math.round(Math.abs(percentDifference) * 100);
  if (dealLevel === 'good') {
    return `price is ${percent}% below recent average`;
  }
  if (dealLevel === 'expensive') {
    return `price is ${percent}% above recent average`;
  }
  return 'price is close to recent average';
}

function normalizePrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function clampScore(value) {
  return Math.max(0, Math.min(1, value));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundRatio(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  EXPENSIVE_AVG_MULTIPLIER,
  GOOD_DEAL_AVG_MULTIPLIER,
  annotateOptimizerResultWithDeals,
  classifyDealForPriceItem,
  classifyProductDeal,
  handleDealCheckRequest,
  summarizeDeals,
};
