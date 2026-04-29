const DEFAULT_CONVENIENCE_OPTIONS = Object.freeze({
  extra_store_penalty: 1.5,
  non_preferred_chain_penalty: 0.75,
  avoided_chain_penalty: 999,
  missing_locality_penalty: 0.5,
});

function applyBasketConvenienceScoring({
  optimizerResult,
  optimizer_result: optimizerResultSnakeCase = null,
  userContext,
  user_context: userContextSnakeCase = null,
  convenienceOptions,
  convenience_options: convenienceOptionsSnakeCase = null,
}) {
  const effectiveOptimizerResult = optimizerResultSnakeCase || optimizerResult || {};
  const effectiveUserContext = normalizeUserContext(userContextSnakeCase || userContext || {});
  const effectiveOptions = normalizeConvenienceOptions(convenienceOptionsSnakeCase || convenienceOptions || {});
  const optimizerClone = cloneValue(effectiveOptimizerResult);
  const recommendedBefore = resolveRecommendedStrategy(optimizerClone);
  const options = collectScorableOptions(optimizerClone);
  const optionScores = options
    .map((entry) => scoreBasketOption({
      entry,
      userContext: effectiveUserContext,
      options: effectiveOptions,
      currency: optimizerClone.currency || entry.option.currency || 'EUR',
    }))
    .sort(compareOptionScores);
  const bestEffectiveOption = optionScores[0] || null;
  const recommendedAfter = bestEffectiveOption?.strategy || recommendedBefore;

  return {
    optimizer_result: optimizerClone,
    convenience: {
      currency: optimizerClone.currency || bestEffectiveOption?.currency || 'EUR',
      applied: true,
      recommended_strategy_before: recommendedBefore,
      recommended_strategy_after: recommendedAfter,
      recommended_strategy_before_convenience: recommendedBefore,
      recommended_strategy_after_convenience: recommendedAfter,
      best_effective_option: bestEffectiveOption,
      option_scores: optionScores,
    },
  };
}

function normalizeUserContext(rawContext) {
  const context = rawContext && typeof rawContext === 'object' && !Array.isArray(rawContext)
    ? rawContext
    : {};
  return {
    locality_code: normalizeOptionalString(context.locality_code),
    preferred_chain_ids: normalizeIdList(context.preferred_chain_ids),
    avoid_chain_ids: normalizeIdList(context.avoid_chain_ids),
    max_store_count: resolvePositiveInteger(context.max_store_count),
    single_store_preferred: context.single_store_preferred === true,
  };
}

function normalizeConvenienceOptions(rawOptions) {
  const options = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
    ? rawOptions
    : {};
  return {
    extra_store_penalty: resolveNonNegativeNumber(options.extra_store_penalty, DEFAULT_CONVENIENCE_OPTIONS.extra_store_penalty),
    non_preferred_chain_penalty: resolveNonNegativeNumber(options.non_preferred_chain_penalty, DEFAULT_CONVENIENCE_OPTIONS.non_preferred_chain_penalty),
    avoided_chain_penalty: resolveNonNegativeNumber(options.avoided_chain_penalty, DEFAULT_CONVENIENCE_OPTIONS.avoided_chain_penalty),
    missing_locality_penalty: resolveNonNegativeNumber(options.missing_locality_penalty, DEFAULT_CONVENIENCE_OPTIONS.missing_locality_penalty),
  };
}

function collectScorableOptions(optimizerResult) {
  if (optimizerResult?.optimization_type === 'multi_store') {
    return [
      optimizerResult.best_single_store_option ? {
        strategy: 'single_store',
        role: 'best_single_store',
        option: optimizerResult.best_single_store_option,
      } : null,
      optimizerResult.best_multi_store_option ? {
        strategy: 'multi_store',
        role: 'best_multi_store',
        option: optimizerResult.best_multi_store_option,
      } : null,
      ...(optimizerResult.alternatives || []).map((option, index) => ({
        strategy: 'multi_store',
        role: 'alternative',
        alternative_index: index,
        option,
      })),
    ].filter(Boolean);
  }

  return [
    optimizerResult?.best_option ? {
      strategy: 'single_store',
      role: 'best_single_store',
      option: optimizerResult.best_option,
    } : null,
    ...((optimizerResult?.alternatives || []).map((option, index) => ({
      strategy: 'single_store',
      role: 'alternative',
      alternative_index: index,
      option,
    }))),
  ].filter(Boolean);
}

function scoreBasketOption({
  entry,
  userContext,
  options,
  currency,
}) {
  const option = entry.option || {};
  const stores = collectOptionStores(option);
  const storeCount = stores.length || option.store_count || 0;
  const penaltyBreakdown = buildPenaltyBreakdown({
    stores,
    storeCount,
    userContext,
    options,
  });
  const conveniencePenalty = roundMoney(penaltyBreakdown.reduce((total, penalty) => total + penalty.amount, 0));
  const estimatedTravelCost = 0;
  const actualTotal = Number(option.actual_total) || 0;
  const effectiveTotal = roundMoney(actualTotal + conveniencePenalty + estimatedTravelCost);

  return {
    strategy: entry.strategy,
    role: entry.role,
    alternative_index: entry.alternative_index,
    option_key: buildOptionKey({ entry, stores }),
    chain_ids: stores.map((store) => store.chain_id).filter(Boolean),
    store_count: storeCount,
    actual_total: actualTotal,
    convenience_penalty: conveniencePenalty,
    estimated_travel_cost: estimatedTravelCost,
    effective_total: effectiveTotal,
    convenience_score: effectiveTotal,
    currency,
    coverage_ratio: option.coverage_ratio || 0,
    penalty_breakdown: penaltyBreakdown,
    option: cloneValue(option),
  };
}

function buildPenaltyBreakdown({
  stores,
  storeCount,
  userContext,
  options,
}) {
  const penalties = [];
  if (storeCount > 1) {
    penalties.push({
      type: 'extra_store',
      amount: roundMoney((storeCount - 1) * options.extra_store_penalty),
      message: 'Multi-store trip adds convenience cost.',
    });
  }

  if (userContext.single_store_preferred && storeCount > 1) {
    penalties.push({
      type: 'extra_store',
      amount: roundMoney(options.extra_store_penalty),
      message: 'Single-store preference adds convenience cost to split baskets.',
    });
  }

  if (userContext.max_store_count !== null && storeCount > userContext.max_store_count) {
    penalties.push({
      type: 'user_max_store_count_exceeded',
      amount: roundMoney((storeCount - userContext.max_store_count) * options.extra_store_penalty),
      message: 'This option uses more stores than the user preference.',
    });
  }

  const preferred = new Set(userContext.preferred_chain_ids);
  if (preferred.size > 0) {
    stores
      .filter((store) => store.chain_id && !preferred.has(store.chain_id))
      .forEach((store) => {
        penalties.push({
          type: 'non_preferred_chain',
          amount: roundMoney(options.non_preferred_chain_penalty),
          chain_id: store.chain_id,
          message: 'This option includes a non-preferred chain.',
        });
      });
  }

  const avoided = new Set(userContext.avoid_chain_ids);
  if (avoided.size > 0) {
    stores
      .filter((store) => store.chain_id && avoided.has(store.chain_id))
      .forEach((store) => {
        penalties.push({
          type: 'avoided_chain',
          amount: roundMoney(options.avoided_chain_penalty),
          chain_id: store.chain_id,
          message: 'This option includes a chain the user asked to avoid.',
        });
      });
  }

  if (userContext.locality_code) {
    stores
      .filter((store) => !store.locality_code)
      .forEach((store) => {
        penalties.push({
          type: 'missing_locality',
          amount: roundMoney(options.missing_locality_penalty),
          chain_id: store.chain_id || null,
          message: 'Store locality is unavailable for this option.',
        });
      });
  }

  return penalties.filter((penalty) => penalty.amount > 0);
}

function collectOptionStores(option) {
  if (Array.isArray(option.stores) && option.stores.length > 0) {
    return option.stores.map((store) => ({
      chain_id: normalizeIdentifier(store.chain_id),
      chain_name: store.chain_name || store.chain_id || null,
      store_id: store.store_id || null,
      store_name: store.store_name || null,
      locality_code: normalizeOptionalString(store.locality_code),
    }));
  }

  if (option.chain_id || option.store_id) {
    return [{
      chain_id: normalizeIdentifier(option.chain_id),
      chain_name: option.chain_name || option.chain_id || null,
      store_id: option.store_id || null,
      store_name: option.store_name || null,
      locality_code: normalizeOptionalString(option.locality_code),
    }];
  }

  return [];
}

function compareOptionScores(left, right) {
  if (left.effective_total !== right.effective_total) {
    return left.effective_total - right.effective_total;
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

  return left.option_key.localeCompare(right.option_key);
}

function resolveRecommendedStrategy(optimizerResult) {
  if (optimizerResult?.optimization_type === 'multi_store') {
    return optimizerResult.recommended_strategy || 'single_store';
  }

  return 'single_store';
}

function buildOptionKey({
  entry,
  stores,
}) {
  const storeKey = stores
    .map((store) => `${store.chain_id || ''}::${store.store_id || ''}`)
    .sort()
    .join('|');
  return `${entry.strategy}::${entry.role || ''}::${entry.alternative_index ?? ''}::${storeKey}`;
}

function normalizeIdList(rawValue) {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return [...new Set(rawValue
    .filter((value) => typeof value === 'string')
    .map((value) => normalizeIdentifier(value))
    .filter(Boolean))]
    .sort();
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

function resolvePositiveInteger(rawValue) {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveNonNegativeNumber(rawValue, fallback) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  DEFAULT_CONVENIENCE_OPTIONS,
  applyBasketConvenienceScoring,
};
