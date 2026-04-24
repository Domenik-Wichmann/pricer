const { applyConstraintFilters } = require('./constraint_filters');
const { rankQueryResults } = require('./ranker');
const { filterCandidates } = require('../phase2/filter');
const { matchQueryAgainstState } = require('../phase2/matcher');
const { parseQueryItem } = require('../phase2/normalize');

function executeQueryPlan({ state, plan }) {
  const baseRows = plan.use_matcher
    ? executeMatcherPath({ state, plan })
    : executeCategoryPath({ state, plan });

  const filteredRows = applyConstraintFilters({
    rows: baseRows,
    parsedQuery: plan.parsed_query,
  });
  const rankedRows = rankQueryResults({
    rows: filteredRows,
    rankByPrice: plan.rank_by_price,
  });

  return {
    parsed_query: plan.parsed_query,
    filters_applied: {
      price_max: plan.parsed_query.constraints_price_max,
      location: plan.parsed_query.constraints_location,
      category_code: plan.parsed_query.category_code,
      product_type: plan.parsed_query.product_type,
    },
    items: rankedRows,
    cheapest_store: rankedRows[0] ? rankedRows[0].store_name_raw : null,
    total_cost: rankedRows[0] ? rankedRows[0].current_price : null,
  };
}

function executeMatcherPath({ state, plan }) {
  const matchResult = matchQueryAgainstState({
    query: plan.parsed_query.raw_query,
    state,
    enableAiFallback: plan.use_ai_fallback,
  });

  return matchResult.items.flatMap((item) => {
    const priceComparisonById = new Map(item.price_comparison.map((row) => [row.source_product_id, row]));
    return item.matched_products.map((matched) => buildQueryRow({
      matched,
      priceRow: priceComparisonById.get(matched.source_product_id),
      productDailyPrices: state.product_daily_prices,
    }));
  }).filter(Boolean);
}

function executeCategoryPath({ state, plan }) {
  const parsedItem = parseQueryItem(plan.parsed_query.raw_query);
  const candidates = filterCandidates({
    parsedItem,
    sourceProducts: state.source_products,
    sourceProductEnrichment: state.source_product_enrichment,
  });

  return candidates.map((candidate) => {
    const latestPrice = findLatestSnapshotPrice({
      rawPriceSnapshots: state.raw_price_snapshots,
      sourceProductId: candidate.source_product.source_product_id,
    });

    return buildQueryRow({
      matched: {
        source_product_id: candidate.source_product.source_product_id,
        score: 0.3,
        reasons: ['category_query'],
        store_name_raw: candidate.source_product.store_name_raw,
        locality_code: candidate.source_product.locality_code,
        product_name_raw: candidate.source_product.latest_product_name_raw,
        category_code: candidate.source_product.category_code,
        canonical_en: candidate.enrichment.canonical_en || null,
        display_en: candidate.enrichment.display_en || null,
      },
      priceRow: latestPrice,
      productDailyPrices: state.product_daily_prices,
    });
  }).filter(Boolean);
}

function buildQueryRow({ matched, priceRow, productDailyPrices }) {
  if (!priceRow) {
    return null;
  }

  const history = productDailyPrices
    .filter((row) => row.source_product_id === matched.source_product_id)
    .sort((left, right) => right.date.localeCompare(left.date));
  const latestDaily = history[0] || null;

  return {
    source_product_id: matched.source_product_id,
    product_name_raw: matched.product_name_raw,
    display_en: matched.display_en,
    category_code: matched.category_code,
    product_type: matched.canonical_en ? matched.canonical_en.product_type : null,
    product_family: matched.canonical_en ? matched.canonical_en.product_family : null,
    brand: matched.canonical_en ? matched.canonical_en.brand : null,
    store_name_raw: priceRow.store_name_raw,
    location_code: priceRow.locality_code,
    location_label: priceRow.locality_code,
    current_price: priceRow.effective_price,
    retail_price: priceRow.retail_price,
    promo_price: priceRow.promo_price,
    match_score: matched.score,
    match_reasons: matched.reasons.join('|'),
    history_avg_price: latestDaily ? latestDaily.price_avg : null,
    store_count: latestDaily ? latestDaily.store_count : 1,
  };
}

function findLatestSnapshotPrice({ rawPriceSnapshots, sourceProductId }) {
  const matches = rawPriceSnapshots
    .filter((row) => row.source_product_id === sourceProductId)
    .sort((left, right) => {
      if (left.snapshot_date !== right.snapshot_date) {
        return right.snapshot_date.localeCompare(left.snapshot_date);
      }

      return right.ingested_at.localeCompare(left.ingested_at);
    });

  if (matches.length === 0) {
    return null;
  }

  const snapshot = matches[0];
  return {
    source_product_id: snapshot.source_product_id,
    store_name_raw: snapshot.store_name_raw,
    locality_code: snapshot.locality_code,
    retail_price: snapshot.retail_price,
    promo_price: snapshot.promo_price,
    effective_price: snapshot.promo_price > 0 && snapshot.promo_price < snapshot.retail_price
      ? snapshot.promo_price
      : snapshot.retail_price,
  };
}

module.exports = {
  executeQueryPlan,
};
