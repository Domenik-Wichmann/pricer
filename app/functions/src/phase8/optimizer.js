const { queryEngine } = require('../phase4/service');
const { splitQueryItems } = require('../phase2/normalize');
const { DEFAULT_BASKET_LIMITS, DEFAULT_PREFERENCE_WEIGHTS } = require('./constants');

async function optimizeBasket({
  store,
  query,
  localityCode = null,
  city = null,
  preferences = {},
  limits = {},
}) {
  const itemQueries = splitQueryItems(query || '');
  const resolvedPreferences = resolvePreferences(preferences);
  const resolvedLimits = resolveLimits(limits);

  const itemResults = await Promise.all(itemQueries.map((rawItem, index) => buildItemResult({
    store,
    rawItem,
    index,
    localityCode,
    city,
    maxItemCandidates: resolvedLimits.max_item_candidates,
    minMatchScore: resolvedLimits.min_match_score,
  })));
  const candidateStores = selectCandidateStores({
    itemResults,
    maxStoreCandidates: resolvedLimits.max_store_candidates,
  });
  const singleStorePlans = buildSingleStorePlans({
    itemResults,
    candidateStores,
    preferences: resolvedPreferences,
  });
  const multiStorePlans = buildMultiStorePlans({
    itemResults,
    candidateStores,
    preferences: resolvedPreferences,
    maxStoreCombinationSize: resolvedLimits.max_store_combination_size,
    maxStoreCombinations: resolvedLimits.max_store_combinations,
  });

  const recommendedPlan = chooseBestPlan([...singleStorePlans, ...multiStorePlans]);

  return {
    raw_input: query,
    item_queries: itemQueries,
    locality_code: localityCode,
    city,
    preferences_applied: resolvedPreferences,
    limits_applied: resolvedLimits,
    candidate_store_count: candidateStores.length,
    candidate_stores: candidateStores,
    single_store_plan: singleStorePlans[0] || null,
    multi_store_plan: multiStorePlans[0] || null,
    recommended_plan: recommendedPlan,
    item_results: itemResults.map(toPublicItemResult),
  };
}

async function buildItemResult({
  store,
  rawItem,
  index,
  localityCode,
  city,
  maxItemCandidates,
  minMatchScore,
}) {
  const queryResult = await queryEngine({
    store,
    query: rawItem,
    localityCode,
    city,
  });
  const candidates = queryResult.items
    .filter((row) => typeof row.match_score === 'number' && row.match_score >= minMatchScore)
    .slice(0, maxItemCandidates)
    .map((row, candidateIndex) => ({
      item_index: index,
      raw_item: rawItem,
      candidate_index: candidateIndex,
      source_product_id: row.source_product_id,
      product_name_raw: row.product_name_raw,
      display_en: row.display_en,
      store_name_raw: row.store_name_raw,
      current_price: row.current_price,
      retail_price: row.retail_price,
      promo_price: row.promo_price,
      category_code: row.category_code,
      product_type: row.product_type,
      product_family: row.product_family,
      brand: row.brand,
      match_score: typeof row.match_score === 'number' ? row.match_score : 0,
      match_reasons: row.match_reasons,
    }));

  return {
    item_index: index,
    raw_item: rawItem,
    parsed_query: queryResult.parsed_query,
    matched: candidates.length > 0,
    candidates,
  };
}

function selectCandidateStores({
  itemResults,
  maxStoreCandidates,
}) {
  const storeStats = new Map();

  itemResults.forEach((itemResult) => {
    const seenForItem = new Set();
    itemResult.candidates.forEach((candidate) => {
      const existing = storeStats.get(candidate.store_name_raw) || {
        store_name_raw: candidate.store_name_raw,
        item_coverage: 0,
        total_price: 0,
        best_match_score_sum: 0,
      };

      if (!seenForItem.has(candidate.store_name_raw)) {
        existing.item_coverage += 1;
        seenForItem.add(candidate.store_name_raw);
      }

      existing.total_price += candidate.current_price;
      existing.best_match_score_sum += candidate.match_score;
      storeStats.set(candidate.store_name_raw, existing);
    });
  });

  return Array.from(storeStats.values())
    .sort((left, right) => {
      if (right.item_coverage !== left.item_coverage) {
        return right.item_coverage - left.item_coverage;
      }

      if (left.total_price !== right.total_price) {
        return left.total_price - right.total_price;
      }

      if (right.best_match_score_sum !== left.best_match_score_sum) {
        return right.best_match_score_sum - left.best_match_score_sum;
      }

      return left.store_name_raw.localeCompare(right.store_name_raw);
    })
    .slice(0, maxStoreCandidates)
    .map((entry) => entry.store_name_raw);
}

function buildSingleStorePlans({
  itemResults,
  candidateStores,
  preferences,
}) {
  return candidateStores
    .map((storeName) => buildPlanForStores({
      itemResults,
      storeNames: [storeName],
      preferences,
      planType: 'single_store',
    }))
    .filter(Boolean)
    .sort(comparePlans);
}

function buildMultiStorePlans({
  itemResults,
  candidateStores,
  preferences,
  maxStoreCombinationSize,
  maxStoreCombinations,
}) {
  const combinations = enumerateStoreCombinations({
    stores: candidateStores,
    maxStoreCombinationSize,
    maxStoreCombinations,
  });

  return combinations
    .map((storeNames) => buildPlanForStores({
      itemResults,
      storeNames,
      preferences,
      planType: 'multi_store',
    }))
    .filter(Boolean)
    .sort(comparePlans);
}

function buildPlanForStores({
  itemResults,
  storeNames,
  preferences,
  planType,
}) {
  if (storeNames.length === 0) {
    return null;
  }

  const storeSet = new Set(storeNames);
  const selections = [];
  const unmatchedItems = [];

  itemResults.forEach((itemResult) => {
    const candidate = chooseBestCandidateForStores({
      candidates: itemResult.candidates,
      storeSet,
    });

    if (!candidate) {
      unmatchedItems.push({
        item_index: itemResult.item_index,
        raw_item: itemResult.raw_item,
      });
      return;
    }

    selections.push(candidate);
  });

  if (selections.length === 0) {
    return null;
  }

  const totalCost = sum(selections.map((entry) => entry.current_price));
  const matchAverage = sum(selections.map((entry) => entry.match_score)) / selections.length;
  const score = computePlanScore({
    totalCost,
    storeCount: storeNames.length,
    unmatchedCount: unmatchedItems.length,
    matchAverage,
    preferences,
  });

  return {
    plan_type: planType,
    stores: [...storeNames].sort(),
    total_cost: round2(totalCost),
    matched_item_count: selections.length,
    unmatched_item_count: unmatchedItems.length,
    match_average: Number(matchAverage.toFixed(4)),
    score: Number(score.toFixed(4)),
    items: selections.map((entry) => ({
      item_index: entry.item_index,
      raw_item: entry.raw_item,
      source_product_id: entry.source_product_id,
      product_name_raw: entry.product_name_raw,
      display_en: entry.display_en,
      store_name_raw: entry.store_name_raw,
      current_price: entry.current_price,
      match_score: entry.match_score,
      match_reasons: entry.match_reasons,
    })),
    unmatched_items: unmatchedItems,
  };
}

function chooseBestCandidateForStores({
  candidates,
  storeSet,
}) {
  return candidates
    .filter((candidate) => storeSet.has(candidate.store_name_raw))
    .sort((left, right) => {
      if (left.current_price !== right.current_price) {
        return left.current_price - right.current_price;
      }

      if (right.match_score !== left.match_score) {
        return right.match_score - left.match_score;
      }

      return left.store_name_raw.localeCompare(right.store_name_raw);
    })[0] || null;
}

function enumerateStoreCombinations({
  stores,
  maxStoreCombinationSize,
  maxStoreCombinations,
}) {
  const combinations = [];

  for (let size = 2; size <= Math.min(maxStoreCombinationSize, stores.length); size += 1) {
    backtrack([], 0, size);
    if (combinations.length >= maxStoreCombinations) {
      break;
    }
  }

  return combinations;

  function backtrack(current, start, targetSize) {
    if (combinations.length >= maxStoreCombinations) {
      return;
    }

    if (current.length === targetSize) {
      combinations.push([...current]);
      return;
    }

    for (let index = start; index < stores.length; index += 1) {
      current.push(stores[index]);
      backtrack(current, index + 1, targetSize);
      current.pop();
      if (combinations.length >= maxStoreCombinations) {
        return;
      }
    }
  }
}

function computePlanScore({
  totalCost,
  storeCount,
  unmatchedCount,
  matchAverage,
  preferences,
}) {
  return (
    totalCost * preferences.price_weight
    + storeCount * preferences.store_weight
    + unmatchedCount * 1000
    + (1 - matchAverage) * preferences.match_weight
  );
}

function chooseBestPlan(plans) {
  return plans.sort(comparePlans)[0] || null;
}

function comparePlans(left, right) {
  if (left.unmatched_item_count !== right.unmatched_item_count) {
    return left.unmatched_item_count - right.unmatched_item_count;
  }

  if (left.score !== right.score) {
    return left.score - right.score;
  }

  if (left.total_cost !== right.total_cost) {
    return left.total_cost - right.total_cost;
  }

  if (left.stores.length !== right.stores.length) {
    return left.stores.length - right.stores.length;
  }

  return left.stores.join('|').localeCompare(right.stores.join('|'));
}

function resolvePreferences(preferences) {
  return {
    price_weight: toPositiveNumber(preferences.price_weight, DEFAULT_PREFERENCE_WEIGHTS.price_weight),
    store_weight: toPositiveNumber(preferences.store_weight, DEFAULT_PREFERENCE_WEIGHTS.store_weight),
    match_weight: toPositiveNumber(preferences.match_weight, DEFAULT_PREFERENCE_WEIGHTS.match_weight),
  };
}

function resolveLimits(limits) {
  return {
    max_item_candidates: toPositiveInteger(limits.max_item_candidates, DEFAULT_BASKET_LIMITS.max_item_candidates),
    max_store_candidates: toPositiveInteger(limits.max_store_candidates, DEFAULT_BASKET_LIMITS.max_store_candidates),
    max_store_combination_size: toPositiveInteger(limits.max_store_combination_size, DEFAULT_BASKET_LIMITS.max_store_combination_size),
    max_store_combinations: toPositiveInteger(limits.max_store_combinations, DEFAULT_BASKET_LIMITS.max_store_combinations),
    min_match_score: toPositiveNumber(limits.min_match_score, DEFAULT_BASKET_LIMITS.min_match_score),
  };
}

function toPublicItemResult(itemResult) {
  return {
    item_index: itemResult.item_index,
    raw_item: itemResult.raw_item,
    matched: itemResult.matched,
    candidate_count: itemResult.candidates.length,
    candidates: itemResult.candidates.map((candidate) => ({
      source_product_id: candidate.source_product_id,
      product_name_raw: candidate.product_name_raw,
      display_en: candidate.display_en,
      store_name_raw: candidate.store_name_raw,
      current_price: candidate.current_price,
      match_score: candidate.match_score,
      match_reasons: candidate.match_reasons,
    })),
  };
}

function toPositiveNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function toPositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function round2(value) {
  return Number(value.toFixed(2));
}

module.exports = {
  optimizeBasket,
  resolveLimits,
  resolvePreferences,
};
