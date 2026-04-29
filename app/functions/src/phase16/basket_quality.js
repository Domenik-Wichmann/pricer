function buildBasketQualityMetrics({
  resolverOutput,
  resolver_output: resolverOutputSnakeCase = null,
  basketPlan,
  basket_plan: basketPlanSnakeCase = null,
  priceLookup,
  price_lookup: priceLookupSnakeCase = null,
  optimizerResult,
  optimizer_result: optimizerResultSnakeCase = null,
  convenienceResult,
  convenience_result: convenienceResultSnakeCase = null,
}) {
  const resolver = buildResolverMetrics(resolverOutputSnakeCase || resolverOutput, basketPlanSnakeCase || basketPlan);
  const pricing = buildPricingMetrics(priceLookupSnakeCase || priceLookup, basketPlanSnakeCase || basketPlan);
  const optimization = buildOptimizationMetrics(optimizerResultSnakeCase || optimizerResult);
  const convenience = buildConvenienceMetrics(convenienceResultSnakeCase || convenienceResult);

  return {
    resolver,
    pricing,
    optimization,
    convenience,
  };
}

function buildGlobalBasketMetricsSummary(metricsRuns = []) {
  const runs = Array.isArray(metricsRuns) ? metricsRuns.filter(Boolean) : [];
  if (runs.length === 0) {
    return {
      average_resolution_rate: 0,
      average_price_coverage: 0,
      average_savings: 0,
      multi_store_usage_rate: 0,
      convenience_flip_rate: 0,
    };
  }

  return {
    average_resolution_rate: roundRatio(average(runs.map((run) => run.resolver?.resolution_rate || 0))),
    average_price_coverage: roundRatio(average(runs.map((run) => run.pricing?.price_coverage_rate || 0))),
    average_savings: roundMoney(average(runs.map((run) => run.optimization?.savings || 0))),
    multi_store_usage_rate: roundRatio(runs.filter((run) => run.optimization?.recommended_strategy === 'multi_store').length / runs.length),
    convenience_flip_rate: roundRatio(runs.filter((run) => run.convenience?.recommendation_flip === true).length / runs.length),
  };
}

function buildResolverMetrics(resolverOutput, basketPlan) {
  const resolverItems = Array.isArray(resolverOutput?.items) ? resolverOutput.items : null;
  const totalItems = resolverItems
    ? resolverItems.length
    : numberOrZero(basketPlan?.summary?.total_items);
  const resolvedCount = resolverItems
    ? resolverItems.filter((item) => item.status === 'resolved').length
    : numberOrZero(basketPlan?.summary?.ready_count);
  const ambiguousCount = resolverItems
    ? resolverItems.filter((item) => item.status === 'ambiguous').length
    : numberOrZero(basketPlan?.summary?.ambiguous_count);
  const unresolvedCount = resolverItems
    ? resolverItems.filter((item) => item.status === 'unresolved').length
    : numberOrZero(basketPlan?.summary?.unresolved_count);

  return {
    total_items: totalItems,
    resolved_count: resolvedCount,
    ambiguous_count: ambiguousCount,
    unresolved_count: unresolvedCount,
    resolution_rate: rate(resolvedCount, totalItems),
    ambiguity_rate: rate(ambiguousCount, totalItems),
    unresolved_rate: rate(unresolvedCount, totalItems),
  };
}

function buildPricingMetrics(priceLookup, basketPlan) {
  const summary = priceLookup?.summary || {};
  const requestedCount = numberOrZero(summary.requested_count) ||
    numberOrZero(basketPlan?.summary?.ready_count) +
      numberOrZero(basketPlan?.summary?.ambiguous_count);
  const pricedCount = numberOrZero(summary.priced_count);
  const missingCount = numberOrZero(summary.missing_count);
  const staleCount = numberOrZero(summary.stale_count);

  return {
    priced_item_count: pricedCount,
    missing_item_count: missingCount,
    stale_item_count: staleCount,
    price_coverage_rate: rate(pricedCount, requestedCount),
    missing_rate: rate(missingCount, requestedCount),
    stale_rate: rate(staleCount, requestedCount),
  };
}

function buildOptimizationMetrics(optimizerResult) {
  const singleOption = optimizerResult?.optimization_type === 'multi_store'
    ? optimizerResult.best_single_store_option
    : optimizerResult?.best_option;
  const multiOption = optimizerResult?.optimization_type === 'multi_store'
    ? optimizerResult.best_multi_store_option
    : null;
  const singleStoreTotal = nullableNumber(singleOption?.actual_total);
  const multiStoreTotal = nullableNumber(multiOption?.actual_total);
  const savings = singleStoreTotal !== null && multiStoreTotal !== null
    ? roundMoney(singleStoreTotal - multiStoreTotal)
    : 0;

  return {
    recommended_strategy: optimizerResult?.recommended_strategy ||
      (optimizerResult?.optimization_type === 'single_store' ? 'single_store' : null),
    single_store_total: singleStoreTotal,
    multi_store_total: multiStoreTotal,
    savings,
    savings_rate: singleStoreTotal && singleStoreTotal > 0
      ? roundRatio(savings / singleStoreTotal)
      : 0,
  };
}

function buildConvenienceMetrics(convenienceResult) {
  const convenience = convenienceResult?.convenience || convenienceResult || null;
  const before = convenience?.recommended_strategy_before_convenience ||
    convenience?.recommended_strategy_before ||
    null;
  const after = convenience?.recommended_strategy_after_convenience ||
    convenience?.recommended_strategy_after ||
    null;
  const best = convenience?.best_effective_option || null;
  const actualTotal = nullableNumber(best?.actual_total);
  const effectiveTotal = nullableNumber(best?.effective_total);

  return {
    recommended_before: before,
    recommended_after: after,
    recommendation_flip: before !== null && after !== null && before !== after,
    flip: before !== null && after !== null && before !== after,
    effective_total: effectiveTotal,
    actual_total: actualTotal,
    effective_vs_actual_delta: actualTotal !== null && effectiveTotal !== null
      ? roundMoney(effectiveTotal - actualTotal)
      : 0,
  };
}

function average(values) {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function rate(numerator, denominator) {
  return denominator > 0 ? roundRatio(numerator / denominator) : 0;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundRatio(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

module.exports = {
  buildBasketQualityMetrics,
  buildGlobalBasketMetricsSummary,
};
