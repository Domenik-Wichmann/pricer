const crypto = require('node:crypto');

const { normalizeSearchText } = require('../phase12/canonicalization');

const GAP_SIGNAL_SOURCES = Object.freeze(['search', 'shopping_list', 'watchlist']);
const GAP_SIGNAL_STATUSES = Object.freeze(['resolved', 'ambiguous', 'unresolved']);
const ALLOWED_GAP_WINDOWS = Object.freeze(['last_7d', 'last_30d', 'all']);
const ALLOWED_GAP_GROUPS = Object.freeze([
  'normalized_query',
  'category_l2',
  'chain_id',
  'store_id',
  'locality_code',
]);
const DEFAULT_LOCALITY_GAP_LIMIT = 20;
const DEFAULT_GAP_LIMIT = 50;
const DEFAULT_OPPORTUNITY_REPORT_LIMIT = 20;
const DEFAULT_INSIGHT_LIMIT = 20;
const MAX_GAP_LIMIT = 200;
const CONFIDENCE_RANK = Object.freeze({
  high: 3,
  medium: 2,
  low: 1,
});
const DEFAULT_GAP_SCORING_CONFIG = Object.freeze({
  search_count_weight: 0.4,
  unresolved_rate_weight: 5,
  ambiguous_rate_weight: 2,
  high_price_pressure_bonus: 2,
  high_price_multiplier: 1.2,
  missing_supply_unresolved_rate: 0.5,
  poor_match_ambiguous_rate: 0.4,
  data_quality_low_signal_count: 10,
  high_confidence_signal_count: 50,
  high_confidence_gap_score: 8,
  medium_confidence_signal_count: 10,
  distribution_poor_coverage_rate: 0.25,
  distribution_reasonable_coverage_rate: 0.6,
});

function buildGapSignalRecord(input = {}) {
  const query = normalizeOptionalString(input.query);
  const normalizedQuery = normalizeOptionalString(input.normalized_query) || normalizeSearchText(query);
  const status = GAP_SIGNAL_STATUSES.includes(input.status) ? input.status : 'unresolved';
  const timestamp = normalizeTimestamp(input.timestamp || new Date().toISOString());
  const canonicalAttempt = normalizeOptionalString(input.canonical_attempt);
  const source = GAP_SIGNAL_SOURCES.includes(input.source) ? input.source : 'search';
  const confidence = normalizeConfidence(input.confidence);
  const categoryL1 = normalizeOptionalString(input.category_l1);
  const categoryL2 = normalizeOptionalString(input.category_l2);
  const localityCode = normalizeLocalityCode(input.locality_code || input.localityCode);
  const chainId = normalizeChainId(input.chain_id || input.chainId);
  const chainName = normalizeOptionalString(input.chain_name || input.chainName);
  const storeId = normalizeStoreId(input.store_id || input.storeId);
  const storeName = normalizeOptionalString(input.store_name || input.storeName);
  const priceContext = normalizePriceContext(input.price_context);
  const identity = [
    source,
    normalizedQuery,
    status,
    canonicalAttempt || '',
    timestamp,
    categoryL1 || '',
    categoryL2 || '',
    localityCode || '',
    chainId || '',
    storeId || '',
  ].join('|');

  return {
    signal_id: `gs_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 32)}`,
    query,
    normalized_query: normalizedQuery,
    canonical_attempt: canonicalAttempt,
    status,
    confidence,
    category_l1: categoryL1,
    category_l2: categoryL2,
    locality_code: localityCode,
    chain_id: chainId,
    chain_name: chainName,
    store_id: storeId,
    store_name: storeName,
    price_context: priceContext,
    source,
    timestamp,
  };
}

async function persistGapSignal(store, signalInput) {
  if (!store) {
    return null;
  }
  try {
    const record = buildGapSignalRecord(signalInput);
    if (typeof store.upsertRecord === 'function') {
      await store.upsertRecord('gap_signal_store', record);
      return record;
    }

    const state = await store.load();
    upsertGapSignalRecord(state, record);
    await store.save(state);
    return record;
  } catch (_error) {
    return null;
  }
}

async function persistGapSignals(store, signalInputs = []) {
  if (!store || !Array.isArray(signalInputs) || signalInputs.length === 0) {
    return [];
  }
  try {
    const records = signalInputs.map((input) => buildGapSignalRecord(input));
    if (typeof store.upsertRecord === 'function') {
      for (const record of records) {
        await store.upsertRecord('gap_signal_store', record);
      }
      return records;
    }

    const state = await store.load();
    records.forEach((record) => upsertGapSignalRecord(state, record));
    await store.save(state);
    return records;
  } catch (_error) {
    return [];
  }
}

async function buildGapDetectionSummary({
  store,
  state,
  window = 'last_30d',
  group_by: groupBySnakeCase,
  groupBy,
  locality_code: localityCodeSnakeCase,
  localityCode,
  chain_id: chainIdSnakeCase,
  chainId,
  store_id: storeIdSnakeCase,
  storeId,
  limit,
  config = {},
} = {}) {
  const resolvedGroupBy = groupBySnakeCase || groupBy || 'normalized_query';
  if (!ALLOWED_GAP_GROUPS.includes(resolvedGroupBy)) {
    throw new Error('invalid group_by');
  }
  if (!ALLOWED_GAP_WINDOWS.includes(window)) {
    throw new Error('invalid window');
  }

  const loadedState = state || await loadGapSignalState(store);
  const boundedLimit = resolveLimit(limit);
  const scoringConfig = { ...DEFAULT_GAP_SCORING_CONFIG, ...(config || {}) };
  const filters = resolveGapFilters({
    locality_code: localityCodeSnakeCase || localityCode,
    chain_id: chainIdSnakeCase || chainId,
    store_id: storeIdSnakeCase || storeId,
  });
  const signals = filterSignalsByWindow(loadedState.gap_signal_store || [], window)
    .filter((signal) => matchesGapFilters(signal, filters));

  return {
    window,
    group_by: resolvedGroupBy,
    filters,
    ...(filters.locality_code ? { locality_code: filters.locality_code } : {}),
    groups: summarizeGapGroups({
      signals,
      groupBy: resolvedGroupBy,
      config: scoringConfig,
      limit: boundedLimit,
    }),
  };
}

async function buildLocalityGapSummary({
  store,
  state,
  window = 'last_30d',
  group_by: groupBySnakeCase,
  groupBy,
  locality_code: localityCodeSnakeCase,
  localityCode,
  chain_id: chainIdSnakeCase,
  chainId,
  store_id: storeIdSnakeCase,
  storeId,
  limit,
  config = {},
} = {}) {
  const resolvedGroupBy = groupBySnakeCase || groupBy || 'normalized_query';
  if (!ALLOWED_GAP_GROUPS.includes(resolvedGroupBy)) {
    throw new Error('invalid group_by');
  }
  if (!ALLOWED_GAP_WINDOWS.includes(window)) {
    throw new Error('invalid window');
  }

  const loadedState = state || await loadGapSignalState(store);
  const filters = resolveGapFilters({
    locality_code: localityCodeSnakeCase || localityCode,
    chain_id: chainIdSnakeCase || chainId,
    store_id: storeIdSnakeCase || storeId,
  });
  const boundedLimit = resolveLocalityLimit(limit);
  const scoringConfig = { ...DEFAULT_GAP_SCORING_CONFIG, ...(config || {}) };
  const signals = filterSignalsByWindow(loadedState.gap_signal_store || [], window)
    .filter((signal) => matchesGapFilters(signal, filters));

  if (filters.locality_code) {
    return {
      window,
      group_by: resolvedGroupBy,
      locality_code: filters.locality_code,
      filters,
      groups: summarizeGapGroups({
        signals,
        groupBy: resolvedGroupBy,
        config: scoringConfig,
        limit: boundedLimit,
        includeCategory: true,
      }),
    };
  }

  const localities = new Map();
  signals.forEach((signal) => {
    const localityKey = signal.locality_code ?? null;
    const entries = localities.get(localityKey) || [];
    entries.push(signal);
    localities.set(localityKey, entries);
  });

  return {
    window,
    group_by: resolvedGroupBy,
    filters,
    localities: [...localities.entries()]
      .map(([localityKey, localitySignals]) => ({
        locality_code: localityKey,
        top_gaps: summarizeGapGroups({
          signals: localitySignals,
          groupBy: resolvedGroupBy,
          config: scoringConfig,
          limit: boundedLimit,
          includeCategory: true,
        }),
      }))
      .sort(compareLocalitySummaries),
  };
}

async function buildGapCoverageByChain({
  store,
  state,
  normalized_query: normalizedQuerySnakeCase,
  normalizedQuery,
  category_l2: categoryL2SnakeCase,
  categoryL2,
  locality_code: localityCodeSnakeCase,
  localityCode,
  window = 'last_30d',
  limit,
  config = {},
} = {}) {
  if (!ALLOWED_GAP_WINDOWS.includes(window)) {
    throw new Error('invalid window');
  }

  const resolvedNormalizedQuery = normalizeOptionalString(normalizedQuerySnakeCase || normalizedQuery);
  const resolvedCategoryL2 = normalizeOptionalString(categoryL2SnakeCase || categoryL2);
  if (!resolvedNormalizedQuery && !resolvedCategoryL2) {
    throw new Error('normalized_query or category_l2 is required');
  }

  const loadedState = state || await loadGapSignalState(store);
  const filters = resolveGapFilters({
    locality_code: localityCodeSnakeCase || localityCode,
  });
  const boundedLimit = resolveLocalityLimit(limit);
  const scoringConfig = { ...DEFAULT_GAP_SCORING_CONFIG, ...(config || {}) };
  const signals = filterSignalsByWindow(loadedState.gap_signal_store || [], window)
    .filter((signal) => matchesGapFilters(signal, filters))
    .filter((signal) => {
      if (resolvedNormalizedQuery && normalizeOptionalString(signal.normalized_query) !== resolvedNormalizedQuery) {
        return false;
      }
      if (resolvedCategoryL2 && normalizeOptionalString(signal.category_l2) !== resolvedCategoryL2) {
        return false;
      }
      return true;
    });

  const categoryAverageMap = buildCategoryAverageMap(signals);
  const groups = new Map();
  signals.forEach((signal) => {
    const key = normalizeGroupKey(signal.chain_id);
    const group = groups.get(key) || createCoverageGroup(signal.chain_id);
    group.signal_count += 1;
    if (signal.status === 'resolved') {
      group.resolved_count += 1;
    } else if (signal.status === 'ambiguous') {
      group.ambiguous_count += 1;
    } else {
      group.unresolved_count += 1;
    }
    const avgPrice = normalizePositiveNumber(signal.price_context?.avg_price);
    if (avgPrice !== null) {
      group.prices.push(avgPrice);
    }
    const chainName = normalizeOptionalString(signal.chain_name);
    if (chainName) {
      group.chain_name_values.push(chainName);
    }
    const categoryValue = normalizeOptionalString(signal.category_l2);
    if (categoryValue) {
      group.category_l2_values.push(categoryValue);
    }
    groups.set(key, group);
  });

  return {
    window,
    normalized_query: resolvedNormalizedQuery || null,
    category_l2: resolvedCategoryL2 || null,
    filters,
    chains: [...groups.values()]
      .map((group) => finalizeCoverageGroup(group, categoryAverageMap, scoringConfig))
      .sort(compareCoverageGroups)
      .slice(0, boundedLimit),
  };
}

async function buildMarketOpportunityReports({
  store,
  state,
  window = 'last_30d',
  locality_code: localityCodeSnakeCase,
  localityCode,
  category_l1: categoryL1SnakeCase,
  categoryL1,
  category_l2: categoryL2SnakeCase,
  categoryL2,
  chain_id: chainIdSnakeCase,
  chainId,
  store_id: storeIdSnakeCase,
  storeId,
  limit,
  min_gap_score: minGapScoreSnakeCase,
  minGapScore,
  config = {},
} = {}) {
  if (!ALLOWED_GAP_WINDOWS.includes(window)) {
    throw new Error('invalid window');
  }

  const loadedState = state || await loadGapSignalState(store);
  const boundedLimit = resolveOpportunityLimit(limit);
  const minimumGapScore = resolveMinimumGapScore(minGapScoreSnakeCase ?? minGapScore);
  const scoringConfig = { ...DEFAULT_GAP_SCORING_CONFIG, ...(config || {}) };
  const filters = resolveOpportunityFilters({
    locality_code: localityCodeSnakeCase || localityCode,
    category_l1: categoryL1SnakeCase || categoryL1,
    category_l2: categoryL2SnakeCase || categoryL2,
    chain_id: chainIdSnakeCase || chainId,
    store_id: storeIdSnakeCase || storeId,
  });
  const signals = filterSignalsByWindow(loadedState.gap_signal_store || [], window)
    .filter((signal) => matchesOpportunityFilters(signal, filters));
  const categoryAverageMap = buildCategoryAverageMap(signals);
  const groups = groupOpportunitySignals(signals);
  const opportunities = groups
    .map((group) => finalizeOpportunityGroup({
      group,
      categoryAverageMap,
      config: scoringConfig,
      window,
      filters,
      state: loadedState,
    }))
    .filter((opportunity) => opportunity !== null)
    .filter((opportunity) => opportunity.gap_score >= minimumGapScore)
    .sort(compareOpportunities)
    .slice(0, boundedLimit);

  return {
    window,
    filters,
    opportunities,
  };
}

async function handleGetMarketOpportunityReportsRequest({
  store,
  query = {},
  body = {},
}) {
  const input = Object.keys(query || {}).length > 0 ? query : body;
  try {
    return {
      status: 200,
      body: await buildMarketOpportunityReports({
        store,
        window: input.window || 'last_30d',
        locality_code: input.locality_code,
        category_l1: input.category_l1,
        category_l2: input.category_l2,
        chain_id: input.chain_id,
        store_id: input.store_id,
        limit: input.limit,
        min_gap_score: input.min_gap_score,
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

async function buildMerchantInsightOverview({
  store,
  state,
  window = 'last_30d',
  locality_code: localityCodeSnakeCase,
  localityCode,
  category_l1: categoryL1SnakeCase,
  categoryL1,
  category_l2: categoryL2SnakeCase,
  categoryL2,
  chain_id: chainIdSnakeCase,
  chainId,
  store_id: storeIdSnakeCase,
  storeId,
  limit,
  min_gap_score: minGapScoreSnakeCase,
  minGapScore,
  config = {},
} = {}) {
  const loadedState = state || await loadGapSignalState(store);
  const filters = resolveInsightFilters({
    locality_code: localityCodeSnakeCase || localityCode,
    category_l1: categoryL1SnakeCase || categoryL1,
    category_l2: categoryL2SnakeCase || categoryL2,
    chain_id: chainIdSnakeCase || chainId,
    store_id: storeIdSnakeCase || storeId,
  });
  const signals = selectInsightSignals({
    state: loadedState,
    window,
    filters,
  });
  const opportunityReport = await buildMarketOpportunityReports({
    store,
    state: loadedState,
    window,
    locality_code: filters.locality_code,
    category_l1: filters.category_l1,
    category_l2: filters.category_l2,
    chain_id: filters.chain_id,
    store_id: filters.store_id,
    limit: limit || MAX_GAP_LIMIT,
    min_gap_score: minGapScoreSnakeCase ?? minGapScore,
    config,
  });
  const opportunities = opportunityReport.opportunities || [];
  const categories = aggregateOpportunitiesByCategory(opportunities, resolveInsightLimit(limit));

  return {
    window,
    filters,
    generated_at: buildInsightsGeneratedAt(signals),
    totals: {
      total_signals: signals.length,
      total_opportunities: opportunities.length,
      high_confidence_opportunities: opportunities.filter((entry) => entry.confidence === 'high').length,
    },
    top_opportunity: summarizeTopOpportunity(opportunities[0]),
    top_category: categories[0] ? {
      category_l2: categories[0].category_l2,
      opportunity_count: categories[0].opportunity_count,
    } : null,
  };
}

async function buildMerchantInsightOpportunities({
  store,
  state,
  window = 'last_30d',
  locality_code: localityCodeSnakeCase,
  localityCode,
  category_l1: categoryL1SnakeCase,
  categoryL1,
  category_l2: categoryL2SnakeCase,
  categoryL2,
  chain_id: chainIdSnakeCase,
  chainId,
  store_id: storeIdSnakeCase,
  storeId,
  limit,
  min_gap_score: minGapScoreSnakeCase,
  minGapScore,
  config = {},
} = {}) {
  const loadedState = state || await loadGapSignalState(store);
  const filters = resolveInsightFilters({
    locality_code: localityCodeSnakeCase || localityCode,
    category_l1: categoryL1SnakeCase || categoryL1,
    category_l2: categoryL2SnakeCase || categoryL2,
    chain_id: chainIdSnakeCase || chainId,
    store_id: storeIdSnakeCase || storeId,
  });
  const signals = selectInsightSignals({
    state: loadedState,
    window,
    filters,
  });
  const report = await buildMarketOpportunityReports({
    store,
    state: loadedState,
    window,
    locality_code: filters.locality_code,
    category_l1: filters.category_l1,
    category_l2: filters.category_l2,
    chain_id: filters.chain_id,
    store_id: filters.store_id,
    limit: resolveInsightLimit(limit),
    min_gap_score: minGapScoreSnakeCase ?? minGapScore,
    config,
  });

  return {
    window,
    filters,
    generated_at: buildInsightsGeneratedAt(signals),
    opportunities: report.opportunities,
  };
}

async function buildMerchantCategoryInsights({
  store,
  state,
  window = 'last_30d',
  locality_code: localityCodeSnakeCase,
  localityCode,
  category_l1: categoryL1SnakeCase,
  categoryL1,
  category_l2: categoryL2SnakeCase,
  categoryL2,
  chain_id: chainIdSnakeCase,
  chainId,
  store_id: storeIdSnakeCase,
  storeId,
  limit,
  min_gap_score: minGapScoreSnakeCase,
  minGapScore,
  config = {},
} = {}) {
  const loadedState = state || await loadGapSignalState(store);
  const filters = resolveInsightFilters({
    locality_code: localityCodeSnakeCase || localityCode,
    category_l1: categoryL1SnakeCase || categoryL1,
    category_l2: categoryL2SnakeCase || categoryL2,
    chain_id: chainIdSnakeCase || chainId,
    store_id: storeIdSnakeCase || storeId,
  });
  const signals = selectInsightSignals({
    state: loadedState,
    window,
    filters,
  });
  const report = await buildMarketOpportunityReports({
    store,
    state: loadedState,
    window,
    locality_code: filters.locality_code,
    category_l1: filters.category_l1,
    category_l2: filters.category_l2,
    chain_id: filters.chain_id,
    store_id: filters.store_id,
    limit: MAX_GAP_LIMIT,
    min_gap_score: minGapScoreSnakeCase ?? minGapScore,
    config,
  });

  return {
    window,
    filters,
    generated_at: buildInsightsGeneratedAt(signals),
    categories: aggregateOpportunitiesByCategory(report.opportunities, resolveInsightLimit(limit)),
  };
}

async function buildMerchantLocalityInsights({
  store,
  state,
  window = 'last_30d',
  locality_code: localityCodeSnakeCase,
  localityCode,
  category_l1: categoryL1SnakeCase,
  categoryL1,
  category_l2: categoryL2SnakeCase,
  categoryL2,
  chain_id: chainIdSnakeCase,
  chainId,
  store_id: storeIdSnakeCase,
  storeId,
  limit,
  min_gap_score: minGapScoreSnakeCase,
  minGapScore,
  config = {},
} = {}) {
  const loadedState = state || await loadGapSignalState(store);
  const filters = resolveInsightFilters({
    locality_code: localityCodeSnakeCase || localityCode,
    category_l1: categoryL1SnakeCase || categoryL1,
    category_l2: categoryL2SnakeCase || categoryL2,
    chain_id: chainIdSnakeCase || chainId,
    store_id: storeIdSnakeCase || storeId,
  });
  const signals = selectInsightSignals({
    state: loadedState,
    window,
    filters,
  });
  const report = await buildMarketOpportunityReports({
    store,
    state: loadedState,
    window,
    locality_code: filters.locality_code,
    category_l1: filters.category_l1,
    category_l2: filters.category_l2,
    chain_id: filters.chain_id,
    store_id: filters.store_id,
    limit: MAX_GAP_LIMIT,
    min_gap_score: minGapScoreSnakeCase ?? minGapScore,
    config,
  });

  return {
    window,
    filters,
    generated_at: buildInsightsGeneratedAt(signals),
    localities: aggregateOpportunitiesByLocality(report.opportunities, resolveInsightLimit(limit)),
  };
}

async function buildMerchantChainInsights({
  store,
  state,
  window = 'last_30d',
  locality_code: localityCodeSnakeCase,
  localityCode,
  category_l1: categoryL1SnakeCase,
  categoryL1,
  category_l2: categoryL2SnakeCase,
  categoryL2,
  chain_id: chainIdSnakeCase,
  chainId,
  store_id: storeIdSnakeCase,
  storeId,
  limit,
  min_gap_score: minGapScoreSnakeCase,
  minGapScore,
  config = {},
} = {}) {
  const loadedState = state || await loadGapSignalState(store);
  const filters = resolveInsightFilters({
    locality_code: localityCodeSnakeCase || localityCode,
    category_l1: categoryL1SnakeCase || categoryL1,
    category_l2: categoryL2SnakeCase || categoryL2,
    chain_id: chainIdSnakeCase || chainId,
    store_id: storeIdSnakeCase || storeId,
  });
  const signals = selectInsightSignals({
    state: loadedState,
    window,
    filters,
  });
  const report = await buildMarketOpportunityReports({
    store,
    state: loadedState,
    window,
    locality_code: filters.locality_code,
    category_l1: filters.category_l1,
    category_l2: filters.category_l2,
    chain_id: filters.chain_id,
    store_id: filters.store_id,
    limit: MAX_GAP_LIMIT,
    min_gap_score: minGapScoreSnakeCase ?? minGapScore,
    config,
  });

  return {
    window,
    filters,
    generated_at: buildInsightsGeneratedAt(signals),
    chains: aggregateOpportunitiesByChain(report.opportunities, resolveInsightLimit(limit)),
  };
}

function createMerchantInsightHandler(builder) {
  return async function handleMerchantInsightRequest({
    store,
    query = {},
    body = {},
  }) {
    const input = Object.keys(query || {}).length > 0 ? query : body;
    try {
      return {
        status: 200,
        body: await builder({
          store,
          window: input.window || 'last_30d',
          locality_code: input.locality_code || input.locality,
          category_l1: input.category_l1,
          category_l2: input.category_l2 || input.category,
          chain_id: input.chain_id || input.chain,
          store_id: input.store_id,
          limit: input.limit,
          min_gap_score: input.min_gap_score,
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
  };
}

const handleGetMerchantInsightOverviewRequest = createMerchantInsightHandler(buildMerchantInsightOverview);
const handleGetMerchantInsightOpportunitiesRequest = createMerchantInsightHandler(buildMerchantInsightOpportunities);
const handleGetMerchantCategoryInsightsRequest = createMerchantInsightHandler(buildMerchantCategoryInsights);
const handleGetMerchantLocalityInsightsRequest = createMerchantInsightHandler(buildMerchantLocalityInsights);
const handleGetMerchantChainInsightsRequest = createMerchantInsightHandler(buildMerchantChainInsights);

async function loadGapSignalState(store) {
  if (typeof store?.loadCollections === 'function') {
    return store.loadCollections(['gap_signal_store']);
  }
  return store.load();
}

async function handleGetGapDetectionRequest({
  store,
  query = {},
  body = {},
}) {
  const input = Object.keys(query || {}).length > 0 ? query : body;
  try {
    const filters = resolveGapFilters(input);
    const hasLocalityFilter = Boolean(filters.locality_code);
    return {
      status: 200,
      body: hasLocalityFilter
        ? await buildLocalityGapSummary({
          store,
          window: input.window || 'last_30d',
          group_by: input.group_by || 'normalized_query',
          locality_code: filters.locality_code,
          chain_id: filters.chain_id,
          store_id: filters.store_id,
          limit: input.limit,
        })
        : await buildGapDetectionSummary({
          store,
          window: input.window || 'last_30d',
          group_by: input.group_by || 'normalized_query',
          chain_id: filters.chain_id,
          store_id: filters.store_id,
          limit: input.limit,
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

async function handleGetLocalityGapDetectionRequest({
  store,
  query = {},
  body = {},
}) {
  const input = Object.keys(query || {}).length > 0 ? query : body;
  try {
    return {
      status: 200,
      body: await buildLocalityGapSummary({
        store,
        window: input.window || 'last_30d',
        group_by: input.group_by || 'normalized_query',
        locality_code: input.locality_code,
        chain_id: input.chain_id,
        store_id: input.store_id,
        limit: input.limit,
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

async function handleGetGapCoverageByChainRequest({
  store,
  query = {},
  body = {},
}) {
  const input = Object.keys(query || {}).length > 0 ? query : body;
  try {
    return {
      status: 200,
      body: await buildGapCoverageByChain({
        store,
        normalized_query: input.normalized_query,
        category_l2: input.category_l2,
        locality_code: input.locality_code,
        window: input.window || 'last_30d',
        limit: input.limit,
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

function buildGapSignalFromSearch({
  query,
  results = [],
  locality_code: localityCodeSnakeCase,
  localityCode,
  chain_id: chainIdSnakeCase,
  chainId,
  chain_name: chainNameSnakeCase,
  chainName,
  store_id: storeIdSnakeCase,
  storeId,
  store_name: storeNameSnakeCase,
  storeName,
  timestamp,
}) {
  const best = Array.isArray(results) && results.length > 0 ? results[0] : null;
  return buildGapSignalFromResolvedItem({
    input_text: query,
    normalized_query: normalizeSearchText(query),
    status: best ? 'resolved' : 'unresolved',
    confidence: best ? 1 : 0,
    best_match: best,
    candidates: Array.isArray(results) ? results : [],
    source: 'search',
    locality_code: localityCodeSnakeCase || localityCode,
    chain_id: chainIdSnakeCase || chainId,
    chain_name: chainNameSnakeCase || chainName,
    store_id: storeIdSnakeCase || storeId,
    store_name: storeNameSnakeCase || storeName,
    timestamp,
  });
}

function buildGapSignalFromResolvedItem({
  input_text,
  normalized_query,
  status,
  confidence,
  best_match,
  candidates = [],
  source = 'shopping_list',
  locality_code: localityCodeSnakeCase,
  localityCode,
  chain_id: chainIdSnakeCase,
  chainId,
  chain_name: chainNameSnakeCase,
  chainName,
  store_id: storeIdSnakeCase,
  storeId,
  store_name: storeNameSnakeCase,
  storeName,
  timestamp,
}) {
  const candidate = best_match || candidates[0] || null;
  return {
    query: input_text,
    normalized_query,
    canonical_attempt: candidate?.canonical_product_id || null,
    status,
    confidence: normalizeConfidenceValue(confidence),
    category_l1: candidate?.enrichment?.category_l1 || null,
    category_l2: candidate?.enrichment?.category_l2 || null,
    locality_code: normalizeLocalityCode(localityCodeSnakeCase || localityCode),
    chain_id: normalizeChainId(chainIdSnakeCase || chainId),
    chain_name: normalizeOptionalString(chainNameSnakeCase || chainName),
    store_id: normalizeStoreId(storeIdSnakeCase || storeId),
    store_name: normalizeOptionalString(storeNameSnakeCase || storeName),
    price_context: {},
    source,
    timestamp,
  };
}

function buildGapSignalFromWatchlist({
  input = {},
  product = null,
  enrichment = null,
  ownerContext = null,
  timestamp,
}) {
  return {
    query: input.label || product?.canonical_display_name || input.canonical_product_id,
    normalized_query: normalizeSearchText(input.label || product?.canonical_display_name || input.canonical_product_id),
    canonical_attempt: input.canonical_product_id || null,
    status: 'resolved',
    confidence: 1,
    category_l1: enrichment?.category_l1 || null,
    category_l2: enrichment?.category_l2 || null,
    locality_code: normalizeLocalityCode(
      input.locality_code ||
      input.localityCode ||
      ownerContext?.locality_code ||
      ownerContext?.localityCode
    ),
    chain_id: normalizeChainId(
      input.chain_id ||
      input.chainId ||
      ownerContext?.chain_id ||
      ownerContext?.chainId
    ),
    chain_name: normalizeOptionalString(
      input.chain_name ||
      input.chainName ||
      ownerContext?.chain_name ||
      ownerContext?.chainName
    ),
    store_id: normalizeStoreId(
      input.store_id ||
      input.storeId ||
      ownerContext?.store_id ||
      ownerContext?.storeId
    ),
    store_name: normalizeOptionalString(
      input.store_name ||
      input.storeName ||
      ownerContext?.store_name ||
      ownerContext?.storeName
    ),
    price_context: {},
    source: 'watchlist',
    timestamp,
  };
}

function upsertGapSignalRecord(state, record) {
  state.gap_signal_store = Array.isArray(state.gap_signal_store) ? state.gap_signal_store : [];
  const existingIndex = state.gap_signal_store.findIndex((entry) => entry.signal_id === record.signal_id);
  if (existingIndex >= 0) {
    state.gap_signal_store[existingIndex] = record;
  } else {
    state.gap_signal_store.push(record);
  }
  state.gap_signal_store.sort(compareSignals);
}

function filterSignalsByWindow(signals, window) {
  const validSignals = (signals || []).filter((signal) => normalizeTimestamp(signal.timestamp));
  if (window === 'all' || validSignals.length === 0) {
    return validSignals.slice();
  }
  const latestTime = Math.max(...validSignals.map((signal) => Date.parse(signal.timestamp)));
  const days = window === 'last_7d' ? 7 : 30;
  const start = latestTime - (days - 1) * 86400000;
  return validSignals.filter((signal) => Date.parse(signal.timestamp) >= start);
}

function buildCategoryAverageMap(signals) {
  const groups = new Map();
  signals.forEach((signal) => {
    const category = normalizeGroupKey(signal.category_l2);
    const avgPrice = normalizePositiveNumber(signal.price_context?.avg_price);
    if (avgPrice === null) {
      return;
    }
    const prices = groups.get(category) || [];
    prices.push(avgPrice);
    groups.set(category, prices);
  });
  return new Map([...groups.entries()].map(([key, prices]) => [key, average(prices)]));
}

function summarizeGapGroups({
  signals,
  groupBy,
  config,
  limit,
  includeCategory = false,
}) {
  const categoryAverages = buildCategoryAverageMap(signals);
  const groups = new Map();

  (signals || []).forEach((signal) => {
    const key = normalizeGroupKey(signal[groupBy]);
    const group = groups.get(key) || createEmptyGroup(key);
    group.search_count += 1;
    if (signal.status === 'unresolved') {
      group.unresolved_count += 1;
    } else if (signal.status === 'ambiguous') {
      group.ambiguous_count += 1;
    }
    const avgPrice = normalizePositiveNumber(signal.price_context?.avg_price);
    if (avgPrice !== null) {
      group.prices.push(avgPrice);
    }
    const categoryL2 = normalizeOptionalString(signal.category_l2);
    if (categoryL2) {
      group.category_l2_values.push(categoryL2);
    }
    const chainName = normalizeOptionalString(signal.chain_name);
    if (chainName) {
      group.chain_name_values.push(chainName);
    }
    const storeName = normalizeOptionalString(signal.store_name);
    if (storeName) {
      group.store_name_values.push(storeName);
    }
    groups.set(key, group);
  });

  return [...groups.values()]
    .map((group) => finalizeGroup(group, categoryAverages, config, { includeCategory }))
    .sort(compareGapGroups)
    .slice(0, limit);
}

function attachSignalStoreContext(record, state) {
  if (!record || !state || !record.canonical_attempt) {
    return record;
  }
  const productId = record.canonical_attempt;
  const enrichment = (state.canonical_enrichment_store || []).find(
    (entry) => entry.canonical_fingerprint === productId
  )?.enrichment || null;
  const avgPrice = resolveCanonicalAveragePrice({
    state,
    canonicalProductId: productId,
  });
  const coverageContext = resolveCanonicalCoverageContext({
    state,
    canonicalProductId: productId,
  });

  return {
    ...record,
    category_l1: record.category_l1 || enrichment?.category_l1 || null,
    category_l2: record.category_l2 || enrichment?.category_l2 || null,
    locality_code: record.locality_code || coverageContext.locality_code || null,
    chain_id: record.chain_id || coverageContext.chain_id || null,
    chain_name: record.chain_name || coverageContext.chain_name || null,
    store_id: record.store_id || coverageContext.store_id || null,
    store_name: record.store_name || coverageContext.store_name || null,
    price_context: Object.keys(record.price_context || {}).length > 0
      ? record.price_context
      : (avgPrice === null ? {} : { avg_price: avgPrice }),
  };
}

function resolveCanonicalAveragePrice({
  state,
  canonicalProductId,
}) {
  const sourceIds = new Set(
    (state.canonical_product_mappings || [])
      .filter((mapping) => mapping.canonical_product_id === canonicalProductId)
      .map((mapping) => mapping.source_product_id)
  );
  const prices = (state.product_daily_prices || [])
    .filter((row) => sourceIds.has(row.source_product_id))
    .map((row) => normalizePositiveNumber(row.price_avg))
    .filter((value) => value !== null);
  return prices.length > 0 ? roundMoney(average(prices)) : null;
}

function finalizeGroup(group, categoryAverages, config, options = {}) {
  const unresolvedRate = group.search_count > 0 ? roundRatio(group.unresolved_count / group.search_count) : 0;
  const ambiguousRate = group.search_count > 0 ? roundRatio(group.ambiguous_count / group.search_count) : 0;
  const avgPrice = group.prices.length > 0 ? roundMoney(average(group.prices)) : null;
  const categoryKey = mostCommon(group.category_l2_values) || group.key;
  const categoryAvg = categoryAverages.get(normalizeGroupKey(categoryKey)) || null;
  const highPricePressure = avgPrice !== null &&
    categoryAvg !== null &&
    avgPrice > categoryAvg * config.high_price_multiplier;
  const pricePressureScore = highPricePressure ? config.high_price_pressure_bonus : 0;
  const gapScore = roundScore(
    group.search_count * config.search_count_weight +
    unresolvedRate * config.unresolved_rate_weight +
    ambiguousRate * config.ambiguous_rate_weight +
    pricePressureScore
  );

  const finalized = {
    key: group.key,
    search_count: group.search_count,
    unresolved_rate: unresolvedRate,
    ambiguous_rate: ambiguousRate,
    avg_price: avgPrice,
    gap_score: gapScore,
    gap_type: classifyGapType({
      unresolvedRate,
      ambiguousRate,
      highPricePressure,
      config,
    }),
  };
  const categoryL2 = mostCommon(group.category_l2_values);
  if (options.includeCategory) {
    finalized.category_l2 = categoryL2;
  }
  return finalized;
}

function createCoverageGroup(chainId) {
  return {
    chain_id: normalizeChainId(chainId),
    signal_count: 0,
    resolved_count: 0,
    ambiguous_count: 0,
    unresolved_count: 0,
    prices: [],
    chain_name_values: [],
    category_l2_values: [],
  };
}

function finalizeCoverageGroup(group, categoryAverages, config) {
  const coverageRate = group.signal_count > 0 ? roundRatio(group.resolved_count / group.signal_count) : 0;
  const unresolvedRate = group.signal_count > 0 ? roundRatio(group.unresolved_count / group.signal_count) : 0;
  const ambiguousRate = group.signal_count > 0 ? roundRatio(group.ambiguous_count / group.signal_count) : 0;
  const avgPrice = group.prices.length > 0 ? roundMoney(average(group.prices)) : null;
  const categoryKey = mostCommon(group.category_l2_values) || null;
  const categoryAvg = categoryKey ? categoryAverages.get(normalizeGroupKey(categoryKey)) || null : null;
  const highPricePressure = avgPrice !== null &&
    categoryAvg !== null &&
    avgPrice > categoryAvg * config.high_price_multiplier;
  const pricePressureScore = highPricePressure ? config.high_price_pressure_bonus : 0;
  return {
    chain_id: group.chain_id,
    chain_name: mostCommon(group.chain_name_values),
    signal_count: group.signal_count,
    resolved_count: group.resolved_count,
    ambiguous_count: group.ambiguous_count,
    unresolved_count: group.unresolved_count,
    coverage_rate: coverageRate,
    gap_score: roundScore(
      group.signal_count * config.search_count_weight +
      unresolvedRate * config.unresolved_rate_weight +
      ambiguousRate * config.ambiguous_rate_weight +
      pricePressureScore
    ),
  };
}

function classifyGapType({
  unresolvedRate,
  ambiguousRate,
  highPricePressure,
  config = DEFAULT_GAP_SCORING_CONFIG,
}) {
  if (unresolvedRate > config.missing_supply_unresolved_rate) {
    return 'missing_supply';
  }
  if (ambiguousRate > config.poor_match_ambiguous_rate) {
    return 'poor_match_quality';
  }
  if (highPricePressure) {
    return 'high_price_pressure';
  }
  return 'normal';
}

function createEmptyGroup(key) {
  return {
    key,
    search_count: 0,
    unresolved_count: 0,
    ambiguous_count: 0,
    prices: [],
    category_l2_values: [],
    chain_name_values: [],
    store_name_values: [],
  };
}

function groupOpportunitySignals(signals = []) {
  const groups = new Map();
  signals.forEach((signal) => {
    const key = normalizeGroupKey(signal.normalized_query);
    const group = groups.get(key) || createEmptyOpportunityGroup(key);
    group.signal_count += 1;
    if (signal.source === 'search') {
      group.search_count += 1;
    }
    if (signal.status === 'resolved') {
      group.resolved_count += 1;
    } else if (signal.status === 'ambiguous') {
      group.ambiguous_count += 1;
    } else {
      group.unresolved_count += 1;
    }
    const avgPrice = normalizePositiveNumber(signal.price_context?.avg_price);
    if (avgPrice !== null) {
      group.prices.push(avgPrice);
    }
    const categoryL1 = normalizeOptionalString(signal.category_l1);
    if (categoryL1) {
      group.category_l1_values.push(categoryL1);
    }
    const categoryL2 = normalizeOptionalString(signal.category_l2);
    if (categoryL2) {
      group.category_l2_values.push(categoryL2);
    }
    const localityCode = normalizeLocalityCode(signal.locality_code);
    if (localityCode) {
      group.locality_values.push(localityCode);
    }
    const chainId = normalizeChainId(signal.chain_id);
    if (chainId) {
      group.chain_values.push(chainId);
    }
    const storeId = normalizeStoreId(signal.store_id);
    if (storeId) {
      group.store_values.push(storeId);
    }
    collectCoverageGroupSignal(group.coverageGroups, signal);
    groups.set(key, group);
  });
  return [...groups.values()];
}

function createEmptyOpportunityGroup(key) {
  return {
    key,
    signal_count: 0,
    search_count: 0,
    resolved_count: 0,
    unresolved_count: 0,
    ambiguous_count: 0,
    prices: [],
    category_l1_values: [],
    category_l2_values: [],
    locality_values: [],
    chain_values: [],
    store_values: [],
    coverageGroups: new Map(),
  };
}

function collectCoverageGroupSignal(coverageGroups, signal) {
  const key = normalizeGroupKey(signal.chain_id);
  const group = coverageGroups.get(key) || createCoverageGroup(signal.chain_id);
  group.signal_count += 1;
  if (signal.status === 'resolved') {
    group.resolved_count += 1;
  } else if (signal.status === 'ambiguous') {
    group.ambiguous_count += 1;
  } else {
    group.unresolved_count += 1;
  }
  const avgPrice = normalizePositiveNumber(signal.price_context?.avg_price);
  if (avgPrice !== null) {
    group.prices.push(avgPrice);
  }
  const chainName = normalizeOptionalString(signal.chain_name);
  if (chainName) {
    group.chain_name_values.push(chainName);
  }
  const categoryValue = normalizeOptionalString(signal.category_l2);
  if (categoryValue) {
    group.category_l2_values.push(categoryValue);
  }
  coverageGroups.set(key, group);
}

function finalizeOpportunityGroup({
  group,
  categoryAverageMap,
  config,
  window,
  filters,
}) {
  const unresolvedRate = group.signal_count > 0 ? roundRatio(group.unresolved_count / group.signal_count) : 0;
  const ambiguousRate = group.signal_count > 0 ? roundRatio(group.ambiguous_count / group.signal_count) : 0;
  const avgPrice = group.prices.length > 0 ? roundMoney(average(group.prices)) : null;
  const categoryL1 = mostCommon(group.category_l1_values);
  const categoryL2 = mostCommon(group.category_l2_values);
  const localityCode = filters.locality_code || mostCommon(group.locality_values);
  const chainId = filters.chain_id || mostCommon(group.chain_values);
  const storeId = filters.store_id || mostCommon(group.store_values);
  const categoryKey = categoryL2 || group.key;
  const categoryAvg = categoryAverageMap.get(normalizeGroupKey(categoryKey)) || null;
  const pricePressure = avgPrice !== null &&
    categoryAvg !== null &&
    avgPrice > categoryAvg * config.high_price_multiplier;
  const gapScore = roundScore(
    group.signal_count * config.search_count_weight +
    unresolvedRate * config.unresolved_rate_weight +
    ambiguousRate * config.ambiguous_rate_weight +
    (pricePressure ? config.high_price_pressure_bonus : 0)
  );
  const coverageByChain = [...group.coverageGroups.values()]
    .map((coverageGroup) => finalizeCoverageGroup(coverageGroup, categoryAverageMap, config))
    .sort(compareCoverageGroups);
  const baseGapType = classifyGapType({
    unresolvedRate,
    ambiguousRate,
    highPricePressure: pricePressure,
    config,
  });
  const opportunityType = classifyOpportunityType({
    signalCount: group.signal_count,
    unresolvedRate,
    ambiguousRate,
    pricePressure,
    baseGapType,
    coverageByChain,
    config,
  });

  if (opportunityType === 'normal') {
    return null;
  }

  const confidence = classifyOpportunityConfidence({
    signalCount: group.signal_count,
    gapScore,
    config,
  });

  return {
    opportunity_id: buildOpportunityId({
      window,
      key: group.key,
      localityCode,
      categoryL2,
      chainId,
      storeId,
      opportunityType,
    }),
    title: buildOpportunityTitle({
      key: group.key,
      localityCode,
      categoryL2,
    }),
    opportunity_type: opportunityType,
    confidence,
    locality_code: localityCode || null,
    category_l1: categoryL1 || null,
    category_l2: categoryL2 || null,
    chain_id: chainId || null,
    store_id: storeId || null,
    gap_score: gapScore,
    evidence: {
      signal_count: group.signal_count,
      search_count: group.search_count,
      unresolved_rate: unresolvedRate,
      ambiguous_rate: ambiguousRate,
      avg_price: avgPrice,
      price_pressure: pricePressure,
      gap_type: baseGapType,
      coverage_by_chain: shouldIncludeCoverageByChain(coverageByChain)
        ? coverageByChain
        : [],
    },
    recommended_action: recommendedActionForOpportunity(opportunityType),
    limitations: opportunityLimitations(opportunityType),
  };
}

function classifyOpportunityType({
  signalCount,
  unresolvedRate,
  ambiguousRate,
  pricePressure,
  baseGapType,
  coverageByChain,
  config,
}) {
  const hasWeakCoverageEvidence = signalCount < config.data_quality_low_signal_count &&
    (unresolvedRate > 0 || ambiguousRate > 0);
  if (hasWeakCoverageEvidence) {
    return 'data_quality_gap';
  }
  if (hasDistributionGap(coverageByChain, config)) {
    return 'distribution_gap';
  }
  if (unresolvedRate > config.missing_supply_unresolved_rate || baseGapType === 'missing_supply') {
    return 'missing_supply';
  }
  if (ambiguousRate > config.poor_match_ambiguous_rate || baseGapType === 'poor_match_quality') {
    return 'poor_match_quality';
  }
  if (pricePressure || baseGapType === 'high_price_pressure') {
    return 'high_price_pressure';
  }
  if (signalCount >= config.medium_confidence_signal_count) {
    return 'emerging_interest';
  }
  return 'normal';
}

function hasDistributionGap(coverageByChain, config) {
  const meaningful = (coverageByChain || []).filter((entry) => entry.signal_count >= 2);
  return meaningful.some((entry) => entry.coverage_rate <= config.distribution_poor_coverage_rate) &&
    meaningful.some((entry) => entry.coverage_rate >= config.distribution_reasonable_coverage_rate);
}

function classifyOpportunityConfidence({
  signalCount,
  gapScore,
  config,
}) {
  if (signalCount >= config.high_confidence_signal_count && gapScore >= config.high_confidence_gap_score) {
    return 'high';
  }
  if (signalCount >= config.medium_confidence_signal_count) {
    return 'medium';
  }
  return 'low';
}

function recommendedActionForOpportunity(type) {
  switch (type) {
    case 'missing_supply':
      return 'Investigate sourcing or supplier coverage for this demand.';
    case 'poor_match_quality':
      return 'Improve catalog matching, synonyms, or enrichment for this product family.';
    case 'high_price_pressure':
      return 'Review pricing, promotions, or lower-cost alternatives.';
    case 'distribution_gap':
      return 'Compare coverage across chains and consider targeted stocking.';
    case 'data_quality_gap':
      return 'Verify catalog data and ingestion coverage before treating this as market demand.';
    case 'emerging_interest':
    default:
      return 'Monitor this demand signal as more usage data accumulates.';
  }
}

function opportunityLimitations(type) {
  const limitations = [
    'Demand signals are based on app interactions, not full-market surveys.',
    'This report is observational and should be validated before business decisions.',
  ];
  if (type === 'data_quality_gap') {
    limitations.push('Low sample size means this may reflect catalog or ingest gaps rather than market demand.');
  }
  return limitations;
}

function selectInsightSignals({
  state,
  window,
  filters,
}) {
  if (!ALLOWED_GAP_WINDOWS.includes(window)) {
    throw new Error('invalid window');
  }
  return filterSignalsByWindow(state?.gap_signal_store || [], window)
    .filter((signal) => matchesOpportunityFilters(signal, filters));
}

function buildInsightsGeneratedAt(signals = []) {
  const timestamps = (signals || [])
    .map((signal) => normalizeTimestamp(signal.timestamp))
    .filter(Boolean)
    .sort();
  return timestamps[timestamps.length - 1] || '1970-01-01T00:00:00.000Z';
}

function summarizeTopOpportunity(opportunity) {
  if (!opportunity) {
    return null;
  }
  return {
    title: opportunity.title,
    gap_score: opportunity.gap_score,
    locality_code: opportunity.locality_code || null,
  };
}

function aggregateOpportunitiesByCategory(opportunities = [], limit = DEFAULT_INSIGHT_LIMIT) {
  const groups = new Map();
  opportunities.forEach((opportunity) => {
    const key = normalizeOptionalString(opportunity.category_l2) || 'Uncategorized';
    const group = groups.get(key) || createInsightAggregateGroup(key);
    collectInsightAggregateOpportunity(group, opportunity);
    groups.set(key, group);
  });
  return [...groups.values()]
    .map((group) => finalizeInsightAggregateGroup(group, 'category_l2'))
    .sort(compareInsightAggregates)
    .slice(0, limit);
}

function aggregateOpportunitiesByLocality(opportunities = [], limit = DEFAULT_INSIGHT_LIMIT) {
  const groups = new Map();
  opportunities.forEach((opportunity) => {
    const key = normalizeLocalityCode(opportunity.locality_code) || null;
    const groupKey = key || 'unknown';
    const group = groups.get(groupKey) || createInsightAggregateGroup(key);
    collectInsightAggregateOpportunity(group, opportunity);
    groups.set(groupKey, group);
  });
  return [...groups.values()]
    .map((group) => finalizeInsightAggregateGroup(group, 'locality_code'))
    .sort(compareInsightAggregates)
    .slice(0, limit);
}

function aggregateOpportunitiesByChain(opportunities = [], limit = DEFAULT_INSIGHT_LIMIT) {
  const groups = new Map();
  opportunities.forEach((opportunity) => {
    const coverage = Array.isArray(opportunity.evidence?.coverage_by_chain)
      ? opportunity.evidence.coverage_by_chain
      : [];
    const coverageRows = coverage.length > 0
      ? coverage
      : [{
        chain_id: opportunity.chain_id,
        chain_name: null,
        coverage_rate: opportunity.opportunity_type === 'distribution_gap' ? 0 : 1,
        signal_count: opportunity.evidence?.signal_count || 0,
      }];
    coverageRows.forEach((row) => {
      const chainId = normalizeChainId(row.chain_id);
      if (!chainId) {
        return;
      }
      const group = groups.get(chainId) || {
        chain_id: chainId,
        chain_name_values: [],
        coverageRates: [],
        weightedCoverageNumerator: 0,
        weightedCoverageDenominator: 0,
        gap_count: 0,
        opportunities: [],
      };
      const signalCount = Math.max(1, Number(row.signal_count) || 1);
      const coverageRate = Math.max(0, Math.min(1, Number(row.coverage_rate) || 0));
      group.coverageRates.push(coverageRate);
      group.weightedCoverageNumerator += coverageRate * signalCount;
      group.weightedCoverageDenominator += signalCount;
      if (coverageRate < 1 || opportunity.opportunity_type === 'distribution_gap') {
        group.gap_count += 1;
      }
      const chainName = normalizeOptionalString(row.chain_name);
      if (chainName) {
        group.chain_name_values.push(chainName);
      }
      group.opportunities.push(opportunity);
      groups.set(chainId, group);
    });
  });
  return [...groups.values()]
    .map((group) => {
      const topOpportunity = chooseTopOpportunity(group.opportunities);
      return {
        chain_id: group.chain_id,
        chain_name: mostCommon(group.chain_name_values),
        coverage_rate: roundRatio(group.weightedCoverageDenominator > 0
          ? group.weightedCoverageNumerator / group.weightedCoverageDenominator
          : average(group.coverageRates)),
        gap_count: group.gap_count,
        top_gap: deriveOpportunityGapLabel(topOpportunity),
      };
    })
    .sort(compareChainInsights)
    .slice(0, limit);
}

function createInsightAggregateGroup(key) {
  return {
    key,
    opportunities: [],
    scoreTotal: 0,
  };
}

function collectInsightAggregateOpportunity(group, opportunity) {
  group.opportunities.push(opportunity);
  group.scoreTotal += Number(opportunity.gap_score) || 0;
}

function finalizeInsightAggregateGroup(group, fieldName) {
  const topOpportunity = chooseTopOpportunity(group.opportunities);
  return {
    [fieldName]: group.key,
    opportunity_count: group.opportunities.length,
    avg_gap_score: roundScore(group.opportunities.length > 0 ? group.scoreTotal / group.opportunities.length : 0),
    top_gap: deriveOpportunityGapLabel(topOpportunity),
  };
}

function chooseTopOpportunity(opportunities = []) {
  return opportunities.slice().sort(compareOpportunities)[0] || null;
}

function deriveOpportunityGapLabel(opportunity) {
  if (!opportunity) {
    return null;
  }
  const title = normalizeOptionalString(opportunity.title);
  if (!title) {
    return null;
  }
  return title.split(' in ')[0] || title;
}

function buildOpportunityTitle({
  key,
  localityCode,
  categoryL2,
}) {
  const subject = titleCase(key);
  const parts = [subject];
  if (categoryL2 && normalizeGroupKey(categoryL2) !== normalizeGroupKey(key)) {
    parts.push(`in ${categoryL2}`);
  }
  if (localityCode) {
    parts.push(`in ${titleCase(localityCode.replace(/_/gu, ' '))}`);
  }
  return parts.join(' ');
}

function buildOpportunityId({
  window,
  key,
  localityCode,
  categoryL2,
  chainId,
  storeId,
  opportunityType,
}) {
  const identity = [
    window,
    key,
    localityCode || '',
    categoryL2 || '',
    chainId || '',
    storeId || '',
    opportunityType,
  ].join('|');
  return `opp_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

function shouldIncludeCoverageByChain(coverageByChain) {
  return Array.isArray(coverageByChain) && coverageByChain.length > 1;
}

function titleCase(value) {
  return String(value || '')
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeTimestamp(value) {
  if (!Number.isFinite(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString();
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeLocalityCode(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return String(value).trim().toLowerCase().replace(/\s+/gu, '_') || null;
}

function normalizeChainId(value) {
  return normalizeIdentifier(value);
}

function normalizeStoreId(value) {
  const input = String(value || '').trim();
  if (!input) {
    return null;
  }
  const segments = input.split('::').map((segment) => normalizeIdentifier(segment)).filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  return segments.length > 1 ? `${segments[0]}::${segments.slice(1).join('-')}` : segments[0];
}

function normalizeConfidence(value) {
  return normalizeConfidenceValue(value);
}

function normalizeConfidenceValue(value) {
  if (value === 'high') {
    return 0.9;
  }
  if (value === 'medium') {
    return 0.65;
  }
  if (value === 'low') {
    return 0.45;
  }
  if (value === 'none') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
}

function normalizePriceContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const avgPrice = normalizePositiveNumber(value.avg_price);
  return avgPrice === null ? {} : { avg_price: roundMoney(avgPrice) };
}

function normalizePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeGroupKey(value) {
  return String(value || '').trim() || 'Uncategorized';
}

function matchesLocality(signal, localityCode) {
  if (!localityCode) {
    return true;
  }
  return normalizeLocalityCode(signal.locality_code) === localityCode;
}

function matchesChain(signal, chainId) {
  if (!chainId) {
    return true;
  }
  return normalizeChainId(signal.chain_id) === chainId;
}

function matchesStore(signal, storeId) {
  if (!storeId) {
    return true;
  }
  return normalizeStoreId(signal.store_id) === storeId;
}

function matchesGapFilters(signal, filters = {}) {
  return matchesLocality(signal, filters.locality_code) &&
    matchesChain(signal, filters.chain_id) &&
    matchesStore(signal, filters.store_id);
}

function matchesOpportunityFilters(signal, filters = {}) {
  return matchesGapFilters(signal, filters) &&
    matchesCategory(signal, 'category_l1', filters.category_l1) &&
    matchesCategory(signal, 'category_l2', filters.category_l2);
}

function matchesCategory(signal, field, expectedValue) {
  if (!expectedValue) {
    return true;
  }
  return normalizeOptionalString(signal[field]) === expectedValue;
}

function resolveGapFilters(input = {}) {
  return {
    locality_code: normalizeLocalityCode(input.locality_code || input.localityCode),
    chain_id: normalizeChainId(input.chain_id || input.chainId),
    store_id: normalizeStoreId(input.store_id || input.storeId),
  };
}

function resolveOpportunityFilters(input = {}) {
  return {
    ...resolveGapFilters(input),
    category_l1: normalizeOptionalString(input.category_l1 || input.categoryL1),
    category_l2: normalizeOptionalString(input.category_l2 || input.categoryL2),
  };
}

function resolveInsightFilters(input = {}) {
  return resolveOpportunityFilters(input);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mostCommon(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  })[0]?.[0] || null;
}

function resolveLimit(rawLimit) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_GAP_LIMIT;
  }
  return Math.min(parsed, MAX_GAP_LIMIT);
}

function resolveLocalityLimit(rawLimit) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LOCALITY_GAP_LIMIT;
  }
  return Math.min(parsed, MAX_GAP_LIMIT);
}

function resolveOpportunityLimit(rawLimit) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OPPORTUNITY_REPORT_LIMIT;
  }
  return Math.min(parsed, MAX_GAP_LIMIT);
}

function resolveInsightLimit(rawLimit) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_INSIGHT_LIMIT;
  }
  return Math.min(parsed, MAX_GAP_LIMIT);
}

function resolveMinimumGapScore(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return 0;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('invalid min_gap_score');
  }
  return parsed;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundRatio(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function roundScore(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function compareGapGroups(left, right) {
  if (right.gap_score !== left.gap_score) {
    return right.gap_score - left.gap_score;
  }
  if (right.search_count !== left.search_count) {
    return right.search_count - left.search_count;
  }
  return left.key.localeCompare(right.key);
}

function compareSignals(left, right) {
  if (left.timestamp !== right.timestamp) {
    return String(left.timestamp).localeCompare(String(right.timestamp));
  }
  return String(left.signal_id).localeCompare(String(right.signal_id));
}

function compareLocalitySummaries(left, right) {
  const leftTop = left.top_gaps[0] || null;
  const rightTop = right.top_gaps[0] || null;
  const leftScore = leftTop?.gap_score || 0;
  const rightScore = rightTop?.gap_score || 0;
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }
  const leftUnresolved = leftTop?.unresolved_rate || 0;
  const rightUnresolved = rightTop?.unresolved_rate || 0;
  if (rightUnresolved !== leftUnresolved) {
    return rightUnresolved - leftUnresolved;
  }
  return String(left.locality_code || '').localeCompare(String(right.locality_code || ''));
}

function compareCoverageGroups(left, right) {
  if (left.coverage_rate !== right.coverage_rate) {
    return left.coverage_rate - right.coverage_rate;
  }
  if (right.signal_count !== left.signal_count) {
    return right.signal_count - left.signal_count;
  }
  return String(left.chain_id || '').localeCompare(String(right.chain_id || ''));
}

function compareOpportunities(left, right) {
  if (right.gap_score !== left.gap_score) {
    return right.gap_score - left.gap_score;
  }
  const confidenceDelta = (CONFIDENCE_RANK[right.confidence] || 0) - (CONFIDENCE_RANK[left.confidence] || 0);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }
  if (right.evidence.signal_count !== left.evidence.signal_count) {
    return right.evidence.signal_count - left.evidence.signal_count;
  }
  return left.opportunity_id.localeCompare(right.opportunity_id);
}

function compareInsightAggregates(left, right) {
  if (right.opportunity_count !== left.opportunity_count) {
    return right.opportunity_count - left.opportunity_count;
  }
  if (right.avg_gap_score !== left.avg_gap_score) {
    return right.avg_gap_score - left.avg_gap_score;
  }
  return String(left.category_l2 || left.locality_code || '').localeCompare(
    String(right.category_l2 || right.locality_code || '')
  );
}

function compareChainInsights(left, right) {
  if (right.gap_count !== left.gap_count) {
    return right.gap_count - left.gap_count;
  }
  if (left.coverage_rate !== right.coverage_rate) {
    return left.coverage_rate - right.coverage_rate;
  }
  return String(left.chain_id || '').localeCompare(String(right.chain_id || ''));
}

function resolveCanonicalCoverageContext({
  state,
  canonicalProductId,
}) {
  const mappingRows = (state.canonical_product_mappings || [])
    .filter((mapping) => mapping.canonical_product_id === canonicalProductId);
  if (mappingRows.length === 0) {
    return emptyCoverageContext();
  }

  const sourceProductById = new Map(
    (state.source_products || []).map((row) => [row.source_product_id, row])
  );
  const latestSnapshotBySourceId = buildLatestSnapshotBySourceId(state.raw_price_snapshots || []);
  const contexts = mappingRows.map((mapping) => {
    const sourceProduct = sourceProductById.get(mapping.source_product_id) || null;
    const snapshot = latestSnapshotBySourceId.get(mapping.source_product_id) || null;
    return {
      locality_code: normalizeLocalityCode(sourceProduct?.locality_code || snapshot?.locality_code),
      chain_id: normalizeChainId(
        sourceProduct?.source_chain_name_normalized ||
        snapshot?.source_chain_name_normalized ||
        sourceProduct?.source_chain_name_raw ||
        snapshot?.source_chain_name_raw ||
        sourceProduct?.store_name_raw ||
        snapshot?.store_name_raw
      ),
      chain_name: normalizeOptionalString(
        sourceProduct?.source_chain_name_raw ||
        snapshot?.source_chain_name_raw ||
        sourceProduct?.source_chain_name_normalized ||
        snapshot?.source_chain_name_normalized ||
        sourceProduct?.store_name_raw ||
        snapshot?.store_name_raw
      ),
      store_id: buildDerivedStoreId({
        localityCode: sourceProduct?.locality_code || snapshot?.locality_code || null,
        storeName: sourceProduct?.store_name_raw || snapshot?.store_name_raw || null,
      }),
      store_name: normalizeOptionalString(sourceProduct?.store_name_raw || snapshot?.store_name_raw),
    };
  });

  return {
    locality_code: resolveUniqueContextValue(contexts, 'locality_code'),
    chain_id: resolveUniqueContextValue(contexts, 'chain_id'),
    chain_name: resolveUniqueContextValue(contexts, 'chain_name'),
    store_id: resolveUniqueContextValue(contexts, 'store_id'),
    store_name: resolveUniqueContextValue(contexts, 'store_name'),
  };
}

function buildLatestSnapshotBySourceId(rawSnapshots = []) {
  const index = new Map();
  (rawSnapshots || []).forEach((row) => {
    if (!row?.source_product_id) {
      return;
    }
    const existing = index.get(row.source_product_id);
    if (!existing || String(row.snapshot_date || '').localeCompare(String(existing.snapshot_date || '')) > 0) {
      index.set(row.source_product_id, row);
    }
  });
  return index;
}

function resolveUniqueContextValue(contexts, field) {
  const values = [...new Set(contexts.map((entry) => entry[field]).filter((value) => value !== null && value !== undefined && value !== ''))];
  return values.length === 1 ? values[0] : null;
}

function buildDerivedStoreId({
  localityCode,
  storeName,
}) {
  const normalizedStore = normalizeIdentifier(storeName);
  const normalizedLocality = normalizeIdentifier(localityCode);
  if (!normalizedStore) {
    return null;
  }
  return normalizedLocality ? `${normalizedLocality}::${normalizedStore}` : normalizedStore;
}

function normalizeIdentifier(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff]+/gu, '-')
    .replace(/^-+|-+$/gu, '') || null;
}

function emptyCoverageContext() {
  return {
    locality_code: null,
    chain_id: null,
    chain_name: null,
    store_id: null,
    store_name: null,
  };
}

module.exports = {
  ALLOWED_GAP_GROUPS,
  ALLOWED_GAP_WINDOWS,
  DEFAULT_GAP_SCORING_CONFIG,
  buildGapDetectionSummary,
  buildGapCoverageByChain,
  buildLocalityGapSummary,
  buildMarketOpportunityReports,
  buildMerchantCategoryInsights,
  buildMerchantChainInsights,
  buildMerchantInsightOpportunities,
  buildMerchantInsightOverview,
  buildMerchantLocalityInsights,
  buildGapSignalFromResolvedItem,
  buildGapSignalFromSearch,
  buildGapSignalFromWatchlist,
  buildGapSignalRecord,
  classifyGapType,
  classifyOpportunityType,
  handleGetGapDetectionRequest,
  handleGetGapCoverageByChainRequest,
  handleGetLocalityGapDetectionRequest,
  handleGetMarketOpportunityReportsRequest,
  handleGetMerchantCategoryInsightsRequest,
  handleGetMerchantChainInsightsRequest,
  handleGetMerchantInsightOpportunitiesRequest,
  handleGetMerchantInsightOverviewRequest,
  handleGetMerchantLocalityInsightsRequest,
  normalizeChainId,
  normalizeLocalityCode,
  normalizeStoreId,
  persistGapSignal,
  persistGapSignals,
};
