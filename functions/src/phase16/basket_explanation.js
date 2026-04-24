const DEFAULT_EXPLANATION_OPTIONS = Object.freeze({
  locale: 'en',
  currency: 'EUR',
});

function buildBasketOptimizationExplanation({
  basketPlan,
  basket_plan: basketPlanSnakeCase = null,
  priceLookup,
  price_lookup: priceLookupSnakeCase = null,
  optimizerResult,
  optimizer_result: optimizerResultSnakeCase = null,
  options = {},
}) {
  const effectiveBasketPlan = basketPlanSnakeCase || basketPlan || {};
  const effectivePriceLookup = priceLookupSnakeCase || priceLookup || {};
  const effectiveOptimizerResult = optimizerResultSnakeCase || optimizerResult || {};
  const explanationOptions = normalizeExplanationOptions({
    ...options,
    currency: options.currency || effectiveOptimizerResult.currency || effectivePriceLookup.currency,
  });
  const recommendedStrategy = resolveRecommendedStrategy(effectiveOptimizerResult);
  const recommendedOption = resolveRecommendedOption(effectiveOptimizerResult, recommendedStrategy);
  const currency = explanationOptions.currency;
  const savings = buildSavings(effectiveOptimizerResult, recommendedStrategy);
  const storeSummaries = buildStoreSummaries(recommendedOption, recommendedStrategy, currency);
  const itemNotes = buildItemNotes({
    basketPlan: effectiveBasketPlan,
    recommendedOption,
    optimizerResult: effectiveOptimizerResult,
  });
  const limitations = buildLimitations({
    recommendedStrategy,
    recommendedOption,
    itemNotes,
  });
  const estimatedTotal = recommendedOption?.actual_total ?? null;

  return {
    headline: buildHeadline(recommendedStrategy, storeSummaries),
    summary_text: buildSummaryText({
      estimatedTotal,
      currency,
      savings,
      recommendedStrategy,
    }),
    recommended_strategy: recommendedStrategy,
    estimated_total: estimatedTotal,
    currency,
    savings,
    coverage: {
      priced_item_count: recommendedOption?.priced_item_count || 0,
      missing_item_count: recommendedOption?.missing_item_count || 0,
      stale_item_count: recommendedOption?.stale_item_count || 0,
      coverage_ratio: recommendedOption?.coverage_ratio || 0,
    },
    store_summaries: storeSummaries,
    item_notes: itemNotes,
    warnings: collectWarnings(effectiveOptimizerResult, recommendedOption),
    limitations,
  };
}

function normalizeExplanationOptions(rawOptions) {
  const options = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
    ? rawOptions
    : {};
  return {
    locale: options.locale === 'en' ? 'en' : DEFAULT_EXPLANATION_OPTIONS.locale,
    currency: typeof options.currency === 'string' && options.currency.trim()
      ? options.currency.trim()
      : DEFAULT_EXPLANATION_OPTIONS.currency,
  };
}

function resolveRecommendedStrategy(optimizerResult) {
  if (optimizerResult?.optimization_type === 'multi_store') {
    return optimizerResult.recommended_strategy || 'single_store';
  }

  return 'single_store';
}

function resolveRecommendedOption(optimizerResult, recommendedStrategy) {
  if (optimizerResult?.optimization_type === 'multi_store') {
    return recommendedStrategy === 'multi_store'
      ? optimizerResult.best_multi_store_option
      : optimizerResult.best_single_store_option;
  }

  return optimizerResult?.best_option || null;
}

function buildSavings(optimizerResult, recommendedStrategy) {
  if (optimizerResult?.optimization_type !== 'multi_store' || recommendedStrategy !== 'multi_store') {
    return {
      amount: 0,
      comparison: null,
    };
  }

  return {
    amount: optimizerResult.best_multi_store_option?.savings_vs_best_single_store || 0,
    comparison: 'best_single_store',
  };
}

function buildHeadline(recommendedStrategy, storeSummaries) {
  const names = storeSummaries.map((store) => store.chain_name || store.chain_id).filter(Boolean);
  if (names.length === 0) {
    return 'Best option: no priced basket found';
  }

  return `Best option: ${names.join(' + ')}`;
}

function buildSummaryText({
  estimatedTotal,
  currency,
  savings,
}) {
  if (estimatedTotal === null) {
    return 'No priced basket option is available yet.';
  }

  const totalText = formatMoney(estimatedTotal, currency);
  if (savings.amount > 0) {
    return `Estimated total ${totalText}, saving ${formatMoney(savings.amount, currency)} compared with the best single-store option.`;
  }

  return `Estimated total ${totalText}.`;
}

function buildStoreSummaries(recommendedOption, recommendedStrategy, currency) {
  if (!recommendedOption) {
    return [];
  }

  if (recommendedStrategy === 'multi_store') {
    return (recommendedOption.stores || []).map((store) => ({
      chain_id: store.chain_id,
      chain_name: store.chain_name,
      store_id: store.store_id,
      store_name: store.store_name,
      actual_total: store.actual_total,
      currency,
      item_count: (store.items || []).length,
      items: cloneValue(store.items || []),
    }));
  }

  return [{
    chain_id: recommendedOption.chain_id,
    chain_name: recommendedOption.chain_name,
    store_id: recommendedOption.store_id,
    store_name: recommendedOption.store_name,
    actual_total: recommendedOption.actual_total,
    currency,
    item_count: (recommendedOption.items || []).filter((item) => item.price_status === 'priced').length,
    items: cloneValue((recommendedOption.items || []).filter((item) => item.price_status === 'priced')),
  }];
}

function buildItemNotes({
  basketPlan,
  recommendedOption,
  optimizerResult,
}) {
  const notes = [];
  const items = recommendedOption?.items || [];
  items.forEach((item) => {
    (item.warnings || []).forEach((warning) => {
      notes.push(mapWarningToItemNote(warning));
    });
    if (item.type === 'manual') {
      notes.push({
        type: 'manual_item_included',
        severity: 'warning',
        input_text: item.input_text,
        message: 'This item was included as a manual placeholder and may need review.',
      });
    }
  });

  (optimizerResult?.warnings || []).forEach((warning) => {
    if (warning.code === 'basket_plan_not_ready') {
      notes.push({
        type: 'optimization_blocked',
        severity: 'blocking',
        input_text: null,
        message: warning.message,
      });
    }
  });

  (basketPlan?.unresolved_items || []).forEach((item) => {
    notes.push({
      type: 'unresolved_item_excluded',
      severity: 'warning',
      input_text: item.input_text,
      message: 'This item could not be matched to a priced product.',
    });
  });

  return notes.filter(Boolean);
}

function mapWarningToItemNote(warning) {
  if (warning.code === 'missing_price') {
    return {
      type: 'missing_price',
      severity: 'warning',
      input_text: warning.input_text || null,
      message: 'No usable price was found for this item.',
    };
  }
  if (warning.code === 'stale_price_excluded') {
    return {
      type: 'stale_price_excluded',
      severity: 'warning',
      input_text: warning.input_text || null,
      message: 'Only stale prices were available, so this item was treated as missing.',
    };
  }
  if (warning.code === 'ambiguous_candidate_auto_selected') {
    return {
      type: 'ambiguous_auto_selected',
      severity: 'info',
      input_text: warning.input_text || null,
      message: 'Selected the cheapest matching candidate for this item.',
    };
  }

  return {
    type: warning.code || 'optimizer_warning',
    severity: 'warning',
    input_text: warning.input_text || null,
    message: warning.message || 'Optimizer warning.',
  };
}

function buildLimitations({
  recommendedStrategy,
  recommendedOption,
  itemNotes,
}) {
  const limitations = [{
    type: 'availability_not_guaranteed',
    message: 'Store availability is not guaranteed until verified at purchase time.',
  }];

  if (recommendedStrategy === 'multi_store') {
    limitations.push({
      type: 'travel_not_included',
      message: 'Travel time and fuel cost are not included yet.',
    });
  }

  if ((recommendedOption?.stale_item_count || 0) > 0) {
    limitations.push({
      type: 'stale_prices_excluded',
      message: 'Some stale prices were excluded from the basket total.',
    });
  }

  if (itemNotes.some((note) => note.type === 'ambiguous_auto_selected')) {
    limitations.push({
      type: 'ambiguous_selection_needs_confirmation',
      message: 'Some ambiguous product choices may need confirmation.',
    });
  }

  return limitations;
}

function collectWarnings(optimizerResult, recommendedOption) {
  return [
    ...(optimizerResult?.warnings || []),
    ...(recommendedOption?.warnings || []),
  ].map((warning) => cloneValue(warning));
}

function formatMoney(value, currency) {
  const symbol = currency === 'EUR' ? '€' : `${currency} `;
  return `${symbol}${Number(value).toFixed(2)}`;
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  DEFAULT_EXPLANATION_OPTIONS,
  buildBasketOptimizationExplanation,
};
