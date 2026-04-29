const {
  handleBuildBasketPlanRequest,
} = require('../phase15/basket_planner');
const {
  DEFAULT_CURRENCY,
  lookupPricesForBasketPlan,
} = require('./price_lookup');
const {
  buildBasketOptimizationExplanation,
} = require('./basket_explanation');
const {
  applyBasketConvenienceScoring,
} = require('./basket_convenience');
const {
  buildBasketQualityMetrics,
  buildGlobalBasketMetricsSummary,
} = require('./basket_quality');
const {
  persistBasketAnalyticsRecord,
} = require('./basket_analytics');
const {
  annotateOptimizerResultWithDeals,
} = require('../phase17/deals');

const DEFAULT_OPTIMIZER_OPTIONS = Object.freeze({
  strategy: 'single_store',
  missing_item_penalty: 999,
  allow_stale: false,
  stale_policy: 'exclude',
  ambiguous_policy: 'cheapest_candidate',
  max_stores: 2,
  minimum_savings: 0.5,
  include_explanation: false,
  include_convenience_scoring: false,
  include_metrics: false,
  persist_metrics: false,
});
const ALLOWED_OPTIMIZER_STRATEGIES = Object.freeze(['single_store', 'multi_store']);
const ALLOWED_STALE_POLICIES = Object.freeze(['exclude']);
const ALLOWED_OPTIMIZER_AMBIGUOUS_POLICIES = Object.freeze([
  'cheapest_candidate',
  'require_confirmation',
]);

async function handleOptimizeBasketSingleStoreRequest({
  store,
  body = {},
  req,
}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      status: 400,
      body: {
        error: 'request body must be an object',
      },
    };
  }

  const options = normalizeOptimizerOptions(body.optimizer_options);
  if (options.error) {
    return options.error;
  }

  const basketPlanResponse = await handleBuildBasketPlanRequest({
    store,
    body: {
      items: body.items,
      layer_mode: body.layer_mode,
      planner_options: body.planner_options,
      locality_code: body.locality_code,
      chain_id: body.chain_id,
      chain_name: body.chain_name,
      store_id: body.store_id,
      store_name: body.store_name,
    },
    req,
  });
  if (basketPlanResponse.status !== 200) {
    return basketPlanResponse;
  }

  const priceResult = await lookupPricesForBasketPlan({
    store,
    basketPlan: basketPlanResponse.body,
    options: body.price_options || {},
  });
  const singleStoreResult = optimizeBasketSingleStore({
    basketPlan: priceResult.basket_plan,
    priceLookup: priceResult.price_lookup,
    options: options.value,
  });
  const rawOptimizerResult = options.value.strategy === 'multi_store'
    ? optimizeBasketMultiStore({
      basketPlan: priceResult.basket_plan,
      priceLookup: priceResult.price_lookup,
      singleStoreResult,
      options: options.value,
    })
    : singleStoreResult;
  const optimizerResult = annotateOptimizerResultWithDeals({
    optimizerResult: rawOptimizerResult,
    priceLookup: priceResult.price_lookup,
  });

  const responseBody = {
    basket_plan: priceResult.basket_plan,
    price_lookup_summary: priceResult.price_lookup.summary,
    optimizer_result: optimizerResult,
  };
  let convenienceResult = null;
  if (options.value.include_convenience_scoring) {
    convenienceResult = applyBasketConvenienceScoring({
      optimizerResult,
      userContext: body.user_context || {},
      convenienceOptions: body.convenience_options || {},
    });
    responseBody.convenience = convenienceResult.convenience;
  }
  if (options.value.include_explanation) {
    responseBody.explanation = buildBasketOptimizationExplanation({
      basketPlan: priceResult.basket_plan,
      priceLookup: priceResult.price_lookup,
      optimizerResult,
      convenience: convenienceResult?.convenience || null,
      options: {
        locale: body.optimizer_options?.locale,
        currency: priceResult.price_lookup.currency,
      },
    });
  }
  if (options.value.include_metrics) {
    responseBody.metrics = buildBasketQualityMetrics({
      basketPlan: priceResult.basket_plan,
      priceLookup: priceResult.price_lookup,
      optimizerResult,
      convenienceResult: convenienceResult?.convenience || null,
    });
    if (options.value.persist_metrics) {
      try {
        await persistBasketAnalyticsRecord({
          store,
          metrics: responseBody.metrics,
        });
      } catch (error) {
        // Metrics persistence must never block the optimizer response.
      }
    }
  }

  return {
    status: 200,
    body: responseBody,
  };
}

function optimizeBasketSingleStore({
  basketPlan,
  basket_plan: basketPlanSnakeCase = null,
  priceLookup,
  price_lookup: priceLookupSnakeCase = null,
  options = {},
}) {
  const effectiveBasketPlan = basketPlanSnakeCase || basketPlan;
  const effectivePriceLookup = priceLookupSnakeCase || priceLookup;
  const normalizedOptions = normalizeOptimizerOptions(options);
  if (normalizedOptions.error) {
    throw new Error(normalizedOptions.error.body.error);
  }

  const optimizerOptions = normalizedOptions.value;
  const plannedItems = collectPlannedItems(effectiveBasketPlan);
  const priceIndex = buildPriceIndex(effectivePriceLookup);
  const warnings = [];
  const hasAmbiguousItems = (effectiveBasketPlan?.ambiguous_items || []).length > 0;
  const plannerReady = effectiveBasketPlan?.optimization_ready !== false;

  if (!plannerReady) {
    warnings.push({
      code: 'basket_plan_not_ready',
      message: 'Basket plan is not optimization-ready; unresolved or blocking planner items remain.',
    });
  }

  if (hasAmbiguousItems && optimizerOptions.ambiguous_policy === 'require_confirmation') {
    warnings.push({
      code: 'ambiguous_confirmation_required',
      message: 'Ambiguous basket items require user confirmation before optimization.',
    });
  }

  const canOptimize = plannerReady &&
    !(hasAmbiguousItems && optimizerOptions.ambiguous_policy === 'require_confirmation');
  if (!canOptimize) {
    return buildBlockedResult({
      plannedItems,
      currency: effectivePriceLookup?.currency || DEFAULT_CURRENCY,
      requiresUserConfirmation: hasAmbiguousItems,
      warnings,
    });
  }

  const candidateChains = collectCandidateChains({
    plannedItems,
    priceIndex,
    options: optimizerOptions,
  });
  if (candidateChains.length === 0 && plannedItems.length > 0) {
    warnings.push({
      code: 'no_candidate_chains',
      message: 'No chain has usable prices for the planned basket items.',
    });
  }

  const optionsByChain = candidateChains
    .map((chain) => buildChainOption({
      chain,
      plannedItems,
      priceIndex,
      options: optimizerOptions,
      currency: effectivePriceLookup?.currency || DEFAULT_CURRENCY,
    }))
    .sort(compareBasketOptions);

  return {
    optimization_type: 'single_store',
    currency: effectivePriceLookup?.currency || DEFAULT_CURRENCY,
    optimization_ready: true,
    requires_user_confirmation: false,
    best_option: optionsByChain[0] || null,
    alternatives: optionsByChain.slice(1),
    summary: {
      planned_item_count: plannedItems.length,
      candidate_chain_count: optionsByChain.length,
      complete_option_count: optionsByChain.filter((option) => option.missing_item_count === 0).length,
      incomplete_option_count: optionsByChain.filter((option) => option.missing_item_count > 0).length,
    },
    warnings,
  };
}

function optimizeBasketMultiStore({
  basketPlan,
  basket_plan: basketPlanSnakeCase = null,
  priceLookup,
  price_lookup: priceLookupSnakeCase = null,
  singleStoreResult,
  single_store_result: singleStoreResultSnakeCase = null,
  options = {},
}) {
  const effectiveBasketPlan = basketPlanSnakeCase || basketPlan;
  const effectivePriceLookup = priceLookupSnakeCase || priceLookup;
  const effectiveSingleStoreResult = singleStoreResultSnakeCase || singleStoreResult || optimizeBasketSingleStore({
    basketPlan: effectiveBasketPlan,
    priceLookup: effectivePriceLookup,
    options,
  });
  const normalizedOptions = normalizeOptimizerOptions({
    ...options,
    strategy: 'multi_store',
  });
  if (normalizedOptions.error) {
    throw new Error(normalizedOptions.error.body.error);
  }

  const optimizerOptions = normalizedOptions.value;
  const plannedItems = collectPlannedItems(effectiveBasketPlan);
  const priceIndex = buildPriceIndex(effectivePriceLookup);
  const warnings = [];
  const bestSingle = effectiveSingleStoreResult?.best_option || null;

  if (effectiveSingleStoreResult?.optimization_ready === false) {
    return {
      optimization_type: 'multi_store',
      currency: effectivePriceLookup?.currency || DEFAULT_CURRENCY,
      recommended_strategy: 'single_store',
      best_single_store_option: bestSingle,
      best_multi_store_option: null,
      alternatives: [],
      summary: {
        candidate_store_count: 0,
        evaluated_combination_count: 0,
        complete_multi_store_option_count: 0,
      },
      warnings: effectiveSingleStoreResult.warnings || [],
    };
  }

  const candidateStores = collectCandidateStores({
    plannedItems,
    priceIndex,
  });
  const combinations = buildStoreCombinations(candidateStores, optimizerOptions.max_stores);
  const multiStoreOptions = combinations
    .map((stores) => buildMultiStoreOption({
      stores,
      plannedItems,
      priceIndex,
      options: optimizerOptions,
      currency: effectivePriceLookup?.currency || DEFAULT_CURRENCY,
      bestSingle,
    }))
    .sort(compareMultiStoreOptions);
  const bestMulti = multiStoreOptions[0] || null;
  const recommendedStrategy = shouldRecommendMultiStore({
    bestSingle,
    bestMulti,
    minimumSavings: optimizerOptions.minimum_savings,
  })
    ? 'multi_store'
    : 'single_store';

  if (!bestMulti && plannedItems.length > 0) {
    warnings.push({
      code: 'no_multi_store_combinations',
      message: 'No bounded multi-store combinations could be evaluated for this basket.',
    });
  }

  return {
    optimization_type: 'multi_store',
    currency: effectivePriceLookup?.currency || DEFAULT_CURRENCY,
    recommended_strategy: recommendedStrategy,
    best_single_store_option: bestSingle,
    best_multi_store_option: bestMulti,
    alternatives: multiStoreOptions.slice(1),
    summary: {
      candidate_store_count: candidateStores.length,
      evaluated_combination_count: combinations.length,
      complete_multi_store_option_count: multiStoreOptions.filter((option) => option.missing_item_count === 0).length,
    },
    warnings,
  };
}

function buildBlockedResult({
  plannedItems,
  currency,
  requiresUserConfirmation,
  warnings,
}) {
  return {
    optimization_type: 'single_store',
    currency,
    optimization_ready: false,
    requires_user_confirmation: requiresUserConfirmation,
    best_option: null,
    alternatives: [],
    summary: {
      planned_item_count: plannedItems.length,
      candidate_chain_count: 0,
      complete_option_count: 0,
      incomplete_option_count: 0,
    },
    warnings,
  };
}

function buildChainOption({
  chain,
  plannedItems,
  priceIndex,
  options,
  currency,
}) {
  const items = plannedItems.map((plannedItem) => resolvePlannedItemForChain({
    plannedItem,
    chainId: chain.chain_id,
    priceIndex,
    options,
  }));
  const pricedItems = items.filter((item) => item.price_status === 'priced');
  const missingItems = items.filter((item) => item.price_status === 'missing');
  const staleItemCount = items.filter((item) => item.stale_excluded === true).length;
  const actualTotal = roundMoney(pricedItems.reduce((total, item) => total + item.line_total, 0));
  const missingItemCount = missingItems.length;
  const scoreTotal = roundMoney(actualTotal + (missingItemCount * options.missing_item_penalty));
  const warnings = items.flatMap((item) => item.warnings || []);

  return {
    chain_id: chain.chain_id,
    chain_name: chain.chain_name,
    store_id: null,
    store_name: null,
    actual_total: actualTotal,
    score_total: scoreTotal,
    currency,
    coverage_ratio: plannedItems.length === 0
      ? 1
      : roundRatio(pricedItems.length / plannedItems.length),
    priced_item_count: pricedItems.length,
    missing_item_count: missingItemCount,
    stale_item_count: staleItemCount,
    items,
    warnings,
  };
}

function resolvePlannedItemForChain({
  plannedItem,
  chainId,
  priceIndex,
  options,
}) {
  const candidateSelections = plannedItem.candidates
    .map((candidate) => {
      const records = getCandidateRecordsForChain({
        canonicalProductId: candidate.canonical_product_id,
        chainId,
        priceIndex,
        options,
      });
      return {
        candidate,
        usableRecord: records.usable_records[0] || null,
        staleExcluded: records.stale_excluded,
      };
    })
    .filter((entry) => entry.usableRecord)
    .sort((left, right) => compareCandidateSelections(left, right));

  if (candidateSelections.length === 0) {
    const staleExcluded = plannedItem.candidates.some((candidate) => getCandidateRecordsForChain({
      canonicalProductId: candidate.canonical_product_id,
      chainId,
      priceIndex,
      options,
    }).stale_excluded);
    return buildMissingItem({
      plannedItem,
      staleExcluded,
    });
  }

  const selection = candidateSelections[0];
  const record = selection.usableRecord;
  const quantity = resolveQuantity(plannedItem.quantity);
  const warnings = [];
  if (plannedItem.type === 'ambiguous') {
    warnings.push({
      code: 'ambiguous_candidate_auto_selected',
      input_text: plannedItem.input_text,
      canonical_product_id: selection.candidate.canonical_product_id,
      message: 'Ambiguous basket candidate was auto-selected by lowest chain price.',
    });
  }

  return {
    type: plannedItem.type,
    input_text: plannedItem.input_text,
    canonical_product_id: selection.candidate.canonical_product_id,
    canonical_name: selection.candidate.canonical_name || null,
    quantity,
    unit_price: record.price,
    line_total: roundMoney(record.price * quantity),
    currency: record.currency || DEFAULT_CURRENCY,
    chain_id: record.chain_id,
    chain_name: record.chain_name,
    store_id: record.store_id,
    store_name: record.store_name,
    snapshot_date: record.snapshot_date,
    source: record.source,
    price_status: 'priced',
    stale_excluded: false,
    selection_reason: plannedItem.type === 'ambiguous'
      ? 'cheapest_ambiguous_candidate_for_chain'
      : 'cheapest_price_for_chain',
    warnings,
  };
}

function buildMissingItem({
  plannedItem,
  staleExcluded,
}) {
  const warningCode = staleExcluded ? 'stale_price_excluded' : 'missing_price';
  return {
    type: plannedItem.type,
    input_text: plannedItem.input_text,
    canonical_product_id: plannedItem.candidates[0]?.canonical_product_id || null,
    canonical_name: plannedItem.candidates[0]?.canonical_name || null,
    quantity: resolveQuantity(plannedItem.quantity),
    unit_price: null,
    line_total: null,
    currency: DEFAULT_CURRENCY,
    chain_id: null,
    chain_name: null,
    store_id: null,
    store_name: null,
    snapshot_date: null,
    source: null,
    price_status: 'missing',
    stale_excluded: staleExcluded,
    selection_reason: null,
    warnings: [{
      code: warningCode,
      input_text: plannedItem.input_text,
      canonical_product_id: plannedItem.candidates[0]?.canonical_product_id || null,
      message: staleExcluded
        ? 'Only stale prices were available for this item at this chain and stale prices are excluded.'
        : 'No usable price was found for this item at this chain.',
    }],
  };
}

function buildMultiStoreOption({
  stores,
  plannedItems,
  priceIndex,
  options,
  currency,
  bestSingle,
}) {
  const items = plannedItems.map((plannedItem) => resolvePlannedItemForStoreCombination({
    plannedItem,
    stores,
    priceIndex,
    options,
  }));
  const pricedItems = items.filter((item) => item.price_status === 'priced');
  const missingItemCount = items.length - pricedItems.length;
  const staleItemCount = items.filter((item) => item.stale_excluded === true).length;
  const actualTotal = roundMoney(pricedItems.reduce((total, item) => total + item.line_total, 0));
  const scoreTotal = roundMoney(actualTotal + (missingItemCount * options.missing_item_penalty));
  const storeSummaries = stores.map((store) => {
    const storeItems = pricedItems.filter((item) => item.store_key === store.store_key);
    return {
      chain_id: store.chain_id,
      chain_name: store.chain_name,
      store_id: store.store_id,
      store_name: store.store_name,
      actual_total: roundMoney(storeItems.reduce((total, item) => total + item.line_total, 0)),
      items: storeItems.map(stripStoreKey),
    };
  });

  return {
    store_count: stores.length,
    actual_total: actualTotal,
    score_total: scoreTotal,
    currency,
    coverage_ratio: plannedItems.length === 0
      ? 1
      : roundRatio(pricedItems.length / plannedItems.length),
    priced_item_count: pricedItems.length,
    missing_item_count: missingItemCount,
    stale_item_count: staleItemCount,
    savings_vs_best_single_store: bestSingle
      ? roundMoney(bestSingle.actual_total - actualTotal)
      : null,
    stores: storeSummaries,
    items: items.map(stripStoreKey),
    warnings: items.flatMap((item) => item.warnings || []),
    store_key: stores.map((store) => store.store_key).join('|'),
  };
}

function resolvePlannedItemForStoreCombination({
  plannedItem,
  stores,
  priceIndex,
  options,
}) {
  const storeKeys = new Set(stores.map((store) => store.store_key));
  const candidateSelections = plannedItem.candidates
    .map((candidate) => {
      const records = getCandidateRecordsForStoreKeys({
        canonicalProductId: candidate.canonical_product_id,
        storeKeys,
        priceIndex,
        options,
      });
      return {
        candidate,
        usableRecord: records.usable_records[0] || null,
        staleExcluded: records.stale_excluded,
      };
    })
    .filter((entry) => entry.usableRecord)
    .sort((left, right) => compareCandidateSelections(left, right));

  if (candidateSelections.length === 0) {
    const staleExcluded = plannedItem.candidates.some((candidate) => getCandidateRecordsForStoreKeys({
      canonicalProductId: candidate.canonical_product_id,
      storeKeys,
      priceIndex,
      options,
    }).stale_excluded);
    return buildMissingItem({
      plannedItem,
      staleExcluded,
    });
  }

  const selection = candidateSelections[0];
  const record = selection.usableRecord;
  const quantity = resolveQuantity(plannedItem.quantity);
  const warnings = [];
  if (plannedItem.type === 'ambiguous') {
    warnings.push({
      code: 'ambiguous_candidate_auto_selected',
      input_text: plannedItem.input_text,
      canonical_product_id: selection.candidate.canonical_product_id,
      message: 'Ambiguous basket candidate was auto-selected by lowest multi-store price.',
    });
  }

  return {
    type: plannedItem.type,
    input_text: plannedItem.input_text,
    canonical_product_id: selection.candidate.canonical_product_id,
    canonical_name: selection.candidate.canonical_name || null,
    quantity,
    unit_price: record.price,
    line_total: roundMoney(record.price * quantity),
    currency: record.currency || DEFAULT_CURRENCY,
    chain_id: record.chain_id,
    chain_name: record.chain_name,
    store_id: record.store_id,
    store_name: record.store_name,
    store_key: buildStoreKey(record),
    snapshot_date: record.snapshot_date,
    source: record.source,
    price_status: 'priced',
    stale_excluded: false,
    selection_reason: plannedItem.type === 'ambiguous'
      ? 'cheapest_ambiguous_candidate_for_store_combination'
      : 'cheapest_price_for_store_combination',
    warnings,
  };
}

function collectPlannedItems(basketPlan) {
  const readyItems = (basketPlan?.ready_items || [])
    .filter((item) => typeof item?.canonical_product_id === 'string' && item.canonical_product_id.trim())
    .map((item) => ({
      type: 'ready',
      input_text: item.input_text || item.canonical_name || item.canonical_product_id,
      quantity: item.quantity ?? item.requested_quantity ?? 1,
      candidates: [{
        canonical_product_id: item.canonical_product_id.trim(),
        canonical_name: item.canonical_name || null,
      }],
    }));

  const ambiguousItems = (basketPlan?.ambiguous_items || [])
    .map((item) => ({
      type: 'ambiguous',
      input_text: item.input_text || item.normalized_query || 'ambiguous item',
      quantity: item.requested_quantity ?? 1,
      candidates: (item.carried_candidates || [])
        .filter((candidate) => typeof candidate?.canonical_product_id === 'string' && candidate.canonical_product_id.trim())
        .map((candidate) => ({
          canonical_product_id: candidate.canonical_product_id.trim(),
          canonical_name: candidate.canonical_name || null,
        })),
    }))
    .filter((item) => item.candidates.length > 0);

  return [...readyItems, ...ambiguousItems];
}

function buildPriceIndex(priceLookup) {
  const index = new Map();
  (priceLookup?.items || []).forEach((item) => {
    index.set(item.canonical_product_id, item);
  });
  return index;
}

function collectCandidateStores({
  plannedItems,
  priceIndex,
}) {
  const stores = new Map();
  plannedItems.forEach((plannedItem) => {
    plannedItem.candidates.forEach((candidate) => {
      const item = priceIndex.get(candidate.canonical_product_id);
      (item?.price_records || []).forEach((record) => {
        if (!record.chain_id) {
          return;
        }
        const storeKey = buildStoreKey(record);
        if (!stores.has(storeKey)) {
          stores.set(storeKey, {
            store_key: storeKey,
            chain_id: record.chain_id,
            chain_name: record.chain_name || record.chain_id,
            store_id: record.store_id || null,
            store_name: record.store_name || null,
          });
        }
      });
    });
  });

  return [...stores.values()].sort(compareStores);
}

function buildStoreCombinations(stores, maxStores) {
  const limit = Math.min(Math.max(Number.parseInt(maxStores, 10) || 2, 2), 3);
  const combinations = [];
  for (let size = 2; size <= limit; size += 1) {
    combinations.push(...chooseStoreCombinations(stores, size));
  }
  return combinations;
}

function chooseStoreCombinations(stores, size, start = 0, prefix = []) {
  if (prefix.length === size) {
    return [prefix];
  }

  const combinations = [];
  for (let index = start; index < stores.length; index += 1) {
    combinations.push(...chooseStoreCombinations(stores, size, index + 1, [...prefix, stores[index]]));
  }
  return combinations;
}

function collectCandidateChains({
  plannedItems,
  priceIndex,
  options,
}) {
  const chains = new Map();
  plannedItems.forEach((plannedItem) => {
    plannedItem.candidates.forEach((candidate) => {
      const item = priceIndex.get(candidate.canonical_product_id);
      (item?.price_records || []).forEach((record) => {
        if (!record.chain_id) {
          return;
        }
        if (!chains.has(record.chain_id)) {
          chains.set(record.chain_id, {
            chain_id: record.chain_id,
            chain_name: record.chain_name || record.chain_id,
          });
        }
      });
    });
  });

  return [...chains.values()].sort((left, right) => left.chain_id.localeCompare(right.chain_id));
}

function getCandidateRecordsForChain({
  canonicalProductId,
  chainId,
  priceIndex,
  options,
}) {
  const item = priceIndex.get(canonicalProductId);
  const chainRecords = (item?.price_records || [])
    .filter((record) => record.chain_id === chainId);
  const staleRecords = chainRecords.filter((record) => record.is_stale === true);
  const usableRecords = chainRecords
    .filter((record) => options.allow_stale || record.is_stale !== true)
    .sort(comparePriceRecords);

  return {
    usable_records: usableRecords,
    stale_excluded: staleRecords.length > 0 && usableRecords.length === 0 && !options.allow_stale,
  };
}

function getCandidateRecordsForStoreKeys({
  canonicalProductId,
  storeKeys,
  priceIndex,
  options,
}) {
  const item = priceIndex.get(canonicalProductId);
  const storeRecords = (item?.price_records || [])
    .filter((record) => storeKeys.has(buildStoreKey(record)));
  const staleRecords = storeRecords.filter((record) => record.is_stale === true);
  const usableRecords = storeRecords
    .filter((record) => options.allow_stale || record.is_stale !== true)
    .sort(comparePriceRecords);

  return {
    usable_records: usableRecords,
    stale_excluded: staleRecords.length > 0 && usableRecords.length === 0 && !options.allow_stale,
  };
}

function compareBasketOptions(left, right) {
  if (left.score_total !== right.score_total) {
    return left.score_total - right.score_total;
  }
  if (left.coverage_ratio !== right.coverage_ratio) {
    return right.coverage_ratio - left.coverage_ratio;
  }
  if (left.actual_total !== right.actual_total) {
    return left.actual_total - right.actual_total;
  }

  return `${left.chain_id || ''}::${left.store_id || ''}`
    .localeCompare(`${right.chain_id || ''}::${right.store_id || ''}`);
}

function compareMultiStoreOptions(left, right) {
  if (left.score_total !== right.score_total) {
    return left.score_total - right.score_total;
  }
  if (left.coverage_ratio !== right.coverage_ratio) {
    return right.coverage_ratio - left.coverage_ratio;
  }
  if (left.actual_total !== right.actual_total) {
    return left.actual_total - right.actual_total;
  }
  if (left.store_count !== right.store_count) {
    return left.store_count - right.store_count;
  }

  return String(left.store_key || '').localeCompare(String(right.store_key || ''));
}

function compareStores(left, right) {
  return left.store_key.localeCompare(right.store_key);
}

function compareCandidateSelections(left, right) {
  return comparePriceRecords(left.usableRecord, right.usableRecord) ||
    left.candidate.canonical_product_id.localeCompare(right.candidate.canonical_product_id);
}

function comparePriceRecords(left, right) {
  if (left.price !== right.price) {
    return left.price - right.price;
  }
  if ((right.snapshot_date || '') !== (left.snapshot_date || '')) {
    return String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''));
  }
  if ((left.store_id || '') !== (right.store_id || '')) {
    return String(left.store_id || '').localeCompare(String(right.store_id || ''));
  }

  return String(left.source || '').localeCompare(String(right.source || ''));
}

function normalizeOptimizerOptions(rawOptions) {
  const options = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
    ? rawOptions
    : {};
  const stalePolicy = typeof options.stale_policy === 'string'
    ? options.stale_policy.trim()
    : DEFAULT_OPTIMIZER_OPTIONS.stale_policy;
  if (!ALLOWED_STALE_POLICIES.includes(stalePolicy)) {
    return {
      error: {
        status: 400,
        body: {
          error: 'invalid stale_policy',
          allowed_stale_policies: ALLOWED_STALE_POLICIES,
        },
      },
    };
  }

  const ambiguousPolicy = typeof options.ambiguous_policy === 'string'
    ? options.ambiguous_policy.trim()
    : DEFAULT_OPTIMIZER_OPTIONS.ambiguous_policy;
  if (!ALLOWED_OPTIMIZER_AMBIGUOUS_POLICIES.includes(ambiguousPolicy)) {
    return {
      error: {
        status: 400,
        body: {
          error: 'invalid ambiguous_policy',
          allowed_ambiguous_policies: ALLOWED_OPTIMIZER_AMBIGUOUS_POLICIES,
        },
      },
    };
  }

  const strategy = typeof options.strategy === 'string'
    ? options.strategy.trim()
    : DEFAULT_OPTIMIZER_OPTIONS.strategy;
  if (!ALLOWED_OPTIMIZER_STRATEGIES.includes(strategy)) {
    return {
      error: {
        status: 400,
        body: {
          error: 'invalid strategy',
          allowed_strategies: ALLOWED_OPTIMIZER_STRATEGIES,
        },
      },
    };
  }

  return {
    value: {
      missing_item_penalty: resolvePenalty(options.missing_item_penalty),
      allow_stale: options.allow_stale === true,
      stale_policy: stalePolicy,
      ambiguous_policy: ambiguousPolicy,
      strategy,
      max_stores: resolveMaxStores(options.max_stores),
      minimum_savings: resolveMinimumSavings(options.minimum_savings),
      include_explanation: options.include_explanation === true,
      include_convenience_scoring: options.include_convenience_scoring === true,
      include_metrics: options.include_metrics === true,
      persist_metrics: options.persist_metrics === true,
    },
  };
}

function resolvePenalty(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_OPTIMIZER_OPTIONS.missing_item_penalty;
  }

  return parsed;
}

function resolveMaxStores(rawValue) {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 2) {
    return DEFAULT_OPTIMIZER_OPTIONS.max_stores;
  }

  return Math.min(parsed, 3);
}

function resolveMinimumSavings(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_OPTIMIZER_OPTIONS.minimum_savings;
  }

  return parsed;
}

function shouldRecommendMultiStore({
  bestSingle,
  bestMulti,
  minimumSavings,
}) {
  if (!bestSingle || !bestMulti) {
    return false;
  }

  return bestMulti.coverage_ratio >= bestSingle.coverage_ratio &&
    bestMulti.savings_vs_best_single_store >= minimumSavings &&
    bestMulti.score_total <= bestSingle.score_total;
}

function buildStoreKey(record) {
  return `${record.chain_id || ''}::${record.store_id || ''}`;
}

function stripStoreKey(item) {
  const { store_key: storeKey, ...rest } = item;
  return rest;
}

function resolveQuantity(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundRatio(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

module.exports = {
  ALLOWED_OPTIMIZER_STRATEGIES,
  ALLOWED_OPTIMIZER_AMBIGUOUS_POLICIES,
  ALLOWED_STALE_POLICIES,
  DEFAULT_OPTIMIZER_OPTIONS,
  applyBasketConvenienceScoring,
  buildBasketOptimizationExplanation,
  buildBasketQualityMetrics,
  buildGlobalBasketMetricsSummary,
  handleOptimizeBasketSingleStoreRequest,
  normalizeOptimizerOptions,
  optimizeBasketMultiStore,
  optimizeBasketSingleStore,
};
