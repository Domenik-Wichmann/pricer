const {
  normalizeSearchText,
  tokenizeSearchText,
} = require('../phase12/canonicalization');
const {
  buildGapSignalFromResolvedItem,
  normalizeLocalityCode,
  persistGapSignals,
} = require('../phase18/gap_detection');
const { LAYER_SELECTIONS } = require('./readers');
const {
  DEFAULT_PRODUCT_LAYER_MODE,
  loadProductCatalogState,
  resolveRequestedLayerMode,
  searchCanonicalProductCatalog,
  searchCanonicalProductCatalogForRequest,
} = require('./service');
const DEFAULT_LIMIT_PER_ITEM = 5;
const MAX_LIMIT_PER_ITEM = 10;
const MAX_ITEMS_PER_REQUEST = 100;
const INTERNAL_SEARCH_LIMIT = 25;
const SHOPPING_INTENT_RESOLUTION_MODES = Object.freeze(['default', 'intent_first']);
const RESOLUTION_STATUSES = Object.freeze(['resolved', 'ambiguous', 'unresolved', 'clarification_needed']);
const CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low', 'none']);
const SCORE_THRESHOLDS = Object.freeze({
  high: 0.85,
  medium: 0.65,
  low: 0.45,
  resolved: 0.75,
  resolved_gap: 0.15,
});
const BASE_PRODUCT_HINTS = Object.freeze([
  { tokens: ['milk'], base_product: 'milk', category_l2: 'dairy' },
  { tokens: ['eggs'], base_product: 'eggs', category_l2: 'dairy' },
  { tokens: ['egg'], base_product: 'eggs', category_l2: 'dairy' },
  { tokens: ['water'], base_product: 'water', category_l2: 'beverages' },
  { tokens: ['juice'], base_product: 'juice', category_l2: 'beverages' },
  { tokens: ['bread'], base_product: 'bread', category_l2: 'bakery' },
  { tokens: ['toilet', 'paper'], base_product: 'toilet paper', category_l1: 'household', category_l2: 'hygiene' },
]);

async function handleResolveShoppingListItemsRequest({
  store,
  body = {},
  req,
}) {
  const items = normalizeShoppingListItems(body.items);
  if (items.error) {
    return items.error;
  }

  const layerMode = resolveRequestedLayerMode(body.layer_mode);
  if (!layerMode.ok) {
    return layerMode.response;
  }

  const bodyResponse = await resolveShoppingListItems({
    store,
    items: items.value,
    layerMode: layerMode.layerMode,
    limitPerItem: resolveLimitPerItem(body.limit_per_item),
    useShoppingIntent: body.use_shopping_intent,
    resolutionMode: body.resolution_mode,
    ownerContext: body.owner_context || buildOwnerContextFromRequestBody(body, req),
    preferenceConfidenceThreshold: body.preference_confidence_threshold,
  });
  const localityCode = normalizeLocalityCode(
    body.locality_code ||
    req?.query?.locality_code ||
    req?.headers?.['x-pricer-locality-code']
  );
  const chainId =
    body.chain_id ||
    req?.query?.chain_id ||
    req?.headers?.['x-pricer-chain-id'];
  const chainName =
    body.chain_name ||
    req?.query?.chain_name ||
    req?.headers?.['x-pricer-chain-name'];
  const storeId =
    body.store_id ||
    req?.query?.store_id ||
    req?.headers?.['x-pricer-store-id'];
  const storeName =
    body.store_name ||
    req?.query?.store_name ||
    req?.headers?.['x-pricer-store-name'];
  await persistGapSignals(store, bodyResponse.items.map((item) => buildGapSignalFromResolvedItem({
    ...item,
    source: 'shopping_list',
    locality_code: localityCode,
    chain_id: chainId,
    chain_name: chainName,
    store_id: storeId,
    store_name: storeName,
  })));

  return {
    status: 200,
    body: bodyResponse,
  };
}

async function resolveShoppingListItems({
  store,
  items = [],
  layerMode = DEFAULT_PRODUCT_LAYER_MODE,
  limitPerItem = DEFAULT_LIMIT_PER_ITEM,
  useShoppingIntent = false,
  resolutionMode = 'default',
  ownerContext = {},
  preferenceConfidenceThreshold,
}) {
  const normalizedItems = normalizeShoppingListItems(items);
  if (normalizedItems.error) {
    throw new Error(normalizedItems.error.body.error);
  }

  const resolvedLayerMode = resolveRequestedLayerMode(layerMode);
  if (!resolvedLayerMode.ok) {
    throw new Error(resolvedLayerMode.response?.body?.error || 'invalid layer_mode');
  }
  const intentMode = resolveShoppingIntentMode({
    useShoppingIntent,
    resolutionMode,
  });

  const boundedLimitPerItem = resolveLimitPerItem(limitPerItem);
  const state = store?.prefersScopedProductSearch
    ? null
    : await loadProductCatalogState(store, resolvedLayerMode.layerMode);
  const resolvedItems = [];
  for (const item of normalizedItems.value) {
    resolvedItems.push(await resolveOneShoppingListItem({
      store,
      state,
      item,
      layerMode: resolvedLayerMode.layerMode,
      limitPerItem: boundedLimitPerItem,
      intentMode,
      ownerContext,
      preferenceConfidenceThreshold,
    }));
  }

  return {
    layer_mode: resolvedLayerMode.layerMode,
    resolution_mode: intentMode,
    items: resolvedItems,
    summary: buildResolutionSummary(resolvedItems),
  };
}

async function resolveOneShoppingListItem({
  store,
  state,
  item,
  layerMode,
  limitPerItem,
  intentMode = 'default',
  ownerContext = {},
  preferenceConfidenceThreshold,
}) {
  const parsed = parseShoppingListItemText(item.text);
  if (!parsed.normalized_query) {
    return {
      input_text: item.text,
      normalized_query: '',
      status: 'unresolved',
      confidence: 'none',
      best_match: null,
      candidates: [],
    };
  }

  const intentResult = intentMode === 'intent_first'
    ? await getShoppingIntentResolver()({
      store,
      text: item.text,
      ownerContext,
      preferenceConfidenceThreshold,
    })
    : null;
  if (intentResult && intentResult.status !== 'unresolved') {
    if (intentResult.status !== 'ready_for_product_selection') {
      return buildClarificationNeededItem({
        item,
        parsed,
        intentResult,
      });
    }
  }

  const queryText = intentResult?.status === 'ready_for_product_selection'
    ? buildIntentFirstCatalogQuery(intentResult)
    : parsed.normalized_query;
  const catalogParsed = queryText === parsed.normalized_query
    ? parsed
    : parseShoppingListItemText(queryText);
  const catalogResponse = state
    ? searchCanonicalProductCatalog({
      state,
      queryText,
      layerMode,
      limit: INTERNAL_SEARCH_LIMIT,
      offset: 0,
    })
    : await searchCanonicalProductCatalogForRequest({
      store,
      queryText,
      layerMode,
      limit: INTERNAL_SEARCH_LIMIT,
      offset: 0,
    });
  const rankedCandidates = rankShoppingListCandidates({
    parsed: catalogParsed,
    candidates: catalogResponse.results,
  });
  const status = determineResolutionStatus(rankedCandidates);
  const bestMatch = status === 'unresolved' || rankedCandidates.length === 0
    ? null
    : buildRankedCandidate(rankedCandidates[0]);

  return {
    input_text: item.text,
    normalized_query: parsed.normalized_query,
    ...(intentResult ? {
      intent_resolution: buildIntentResolutionSummary(intentResult),
      intent_query: queryText,
    } : {}),
    status,
    confidence: determineConfidence(rankedCandidates[0]?.score || 0),
    best_match: bestMatch,
    candidates: rankedCandidates
      .slice(0, limitPerItem)
      .map((candidate) => buildRankedCandidate(candidate)),
  };
}

function getShoppingIntentResolver() {
  return require('./shopping_intent').resolveShoppingIntent;
}

function buildClarificationNeededItem({
  item,
  parsed,
  intentResult,
}) {
  return {
    input_text: item.text,
    normalized_query: parsed.normalized_query,
    status: 'clarification_needed',
    confidence: 'none',
    best_match: null,
    candidates: [],
    clarification_needed: {
      status: intentResult.status,
      possible_families: intentResult.possible_families || [],
      selected_family: intentResult.selected_family || null,
      missing_attributes: intentResult.missing_attributes || [],
      clarification_questions: intentResult.clarification_questions || [],
      suggested_defaults: intentResult.suggested_defaults || {},
      ready_for_product_selection: false,
    },
    intent_resolution: buildIntentResolutionSummary(intentResult),
  };
}

function buildIntentFirstCatalogQuery(intentResult) {
  const terms = [
    intentResult.selected_family?.display_name_en,
  ];
  const resolvedAttributes = {
    ...(intentResult.resolved_attributes || {}),
  };
  for (const [attributeId, defaultValue] of Object.entries(intentResult.suggested_defaults || {})) {
    if (!resolvedAttributes[attributeId]) {
      resolvedAttributes[attributeId] = defaultValue?.value_id;
    }
  }
  for (const [attributeId, value] of Object.entries(resolvedAttributes)) {
    if (attributeId === 'brand') {
      terms.push(value);
      continue;
    }
    const defaultValue = intentResult.suggested_defaults?.[attributeId];
    terms.push(defaultValue?.display_name_en || value);
  }
  return terms.filter(Boolean).join(' ');
}

function buildIntentResolutionSummary(intentResult) {
  return {
    status: intentResult.status,
    possible_families: intentResult.possible_families || [],
    selected_family: intentResult.selected_family || null,
    resolved_attributes: intentResult.resolved_attributes || {},
    missing_attributes: intentResult.missing_attributes || [],
    clarification_questions: intentResult.clarification_questions || [],
    suggested_defaults: intentResult.suggested_defaults || {},
    ready_for_product_selection: intentResult.status === 'ready_for_product_selection',
  };
}

function normalizeShoppingListItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return {
      error: {
        status: 400,
        body: {
          error: 'items must be a non-empty array',
        },
      },
    };
  }

  if (rawItems.length > MAX_ITEMS_PER_REQUEST) {
    return {
      error: {
        status: 400,
        body: {
          error: `items exceeds max per request of ${MAX_ITEMS_PER_REQUEST}`,
        },
      },
    };
  }

  const normalized = [];
  for (const entry of rawItems) {
    if (typeof entry === 'string') {
      normalized.push({ text: entry });
      continue;
    }

    if (entry && typeof entry === 'object' && typeof entry.text === 'string') {
      normalized.push({ text: entry.text });
      continue;
    }

    return {
      error: {
        status: 400,
        body: {
          error: 'each item must be a string or an object with a text field',
        },
      },
    };
  }

  return { value: normalized };
}

function parseShoppingListItemText(text) {
  const normalizedQuery = normalizeSearchText(text);
  const tokens = tokenizeSearchText(text);
  const volumeMarker = parseVolumeMarker(text);
  const countValue = parseCountValue(text);
  const hints = inferShoppingHints(tokens);

  return {
    input_text: text,
    normalized_query: normalizedQuery,
    tokens,
    volume_marker: volumeMarker,
    count_value: countValue,
    base_product_hint: hints.base_product || null,
    category_l1_hint: hints.category_l1 || null,
    category_l2_hint: hints.category_l2 || null,
  };
}

function rankShoppingListCandidates({
  parsed,
  candidates,
}) {
  return candidates
    .map((candidate) => scoreShoppingListCandidate({
      parsed,
      candidate,
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return String(left.canonical_product_id).localeCompare(String(right.canonical_product_id));
    });
}

function scoreShoppingListCandidate({
  parsed,
  candidate,
}) {
  const candidateTokens = buildCandidateTokenSet(candidate);
  const matchedTokens = parsed.tokens.filter((token) => candidateTokens.has(token));
  const queryCoverage = parsed.tokens.length === 0 ? 0 : matchedTokens.length / parsed.tokens.length;
  const reasons = [];
  let score = queryCoverage * 0.55;

  if (matchedTokens.length > 0) {
    reasons.push('token_match');
  }

  const normalizedCandidateName = normalizeSearchText(candidate.canonical_name);
  if (normalizedCandidateName === parsed.normalized_query) {
    score += 0.12;
    reasons.push('exact_name_match');
  } else if (
    parsed.normalized_query &&
    normalizedCandidateName.includes(parsed.normalized_query)
  ) {
    score += 0.08;
    reasons.push('phrase_match');
  }

  if (
    parsed.base_product_hint &&
    normalizeSearchText(candidate.enrichment?.base_product) === parsed.base_product_hint
  ) {
    score += 0.15;
    reasons.push('base_product_match');
  }

  if (matchesCategoryHint(parsed, candidate)) {
    score += 0.08;
    reasons.push('category_match');
  }

  if (matchesBrandHint(parsed.tokens, candidate.enrichment?.brand)) {
    score += 0.12;
    reasons.push('brand_match');
  }

  if (parsed.volume_marker) {
    if (candidate.markers?.volume_marker === parsed.volume_marker) {
      score += 0.18;
      reasons.push('volume_match');
    } else if (candidate.markers?.volume_marker) {
      score -= 0.18;
    }
  }

  if (parsed.count_value !== null) {
    if (matchesCountMarker(parsed.count_value, candidate.markers?.count_marker)) {
      score += 0.18;
      reasons.push('count_match');
    } else if (candidate.markers?.count_marker) {
      score -= 0.18;
    }
  }

  const enrichmentConfidence = Number(candidate.enrichment?.confidence || 0);
  if (Number.isFinite(enrichmentConfidence) && enrichmentConfidence > 0) {
    score += Math.min(enrichmentConfidence, 1) * 0.05;
    if (enrichmentConfidence >= 0.8) {
      reasons.push('enrichment_confident');
    }
  }

  return {
    ...candidate,
    score: roundScore(score),
    match_reasons: [...new Set(reasons)],
  };
}

function buildCandidateTokenSet(candidate) {
  const fields = [
    candidate.canonical_name,
    candidate.enrichment?.base_product,
    candidate.enrichment?.brand,
    candidate.enrichment?.category_l1,
    candidate.enrichment?.category_l2,
    candidate.enrichment?.category_l3,
    ...(candidate.enrichment?.flavor || []),
    ...(candidate.enrichment?.attributes || []),
  ];

  return new Set(fields.flatMap((value) => tokenizeSearchText(value)));
}

function matchesCategoryHint(parsed, candidate) {
  if (!candidate.enrichment) {
    return false;
  }

  return [
    candidate.enrichment.category_l1,
    candidate.enrichment.category_l2,
    candidate.enrichment.category_l3,
  ].some((value) => {
    const normalized = normalizeSearchText(value);
    return normalized &&
      (
        normalized === parsed.category_l1_hint ||
        normalized === parsed.category_l2_hint
      );
  });
}

function matchesBrandHint(tokens, brand) {
  const normalizedBrand = normalizeSearchText(brand);
  if (!normalizedBrand) {
    return false;
  }

  return tokenizeSearchText(normalizedBrand).every((brandToken) => tokens.includes(brandToken));
}

function matchesCountMarker(countValue, countMarker) {
  if (countValue === null || !countMarker) {
    return false;
  }

  const numericMatch = String(countMarker).match(/\d+/u);
  return numericMatch ? Number.parseInt(numericMatch[0], 10) === countValue : false;
}

function determineResolutionStatus(candidates) {
  if (candidates.length === 0) {
    return 'unresolved';
  }

  const best = candidates[0];
  if (best.score < SCORE_THRESHOLDS.low) {
    return 'unresolved';
  }

  const second = candidates[1] || null;
  const onlyOneStrongCandidate = !second || second.score < SCORE_THRESHOLDS.resolved;
  const meaningfulGap = !second || (best.score - second.score) >= SCORE_THRESHOLDS.resolved_gap;
  if (best.score >= SCORE_THRESHOLDS.resolved && (onlyOneStrongCandidate || meaningfulGap)) {
    return 'resolved';
  }

  return 'ambiguous';
}

function determineConfidence(score) {
  if (score >= SCORE_THRESHOLDS.high) {
    return 'high';
  }
  if (score >= SCORE_THRESHOLDS.medium) {
    return 'medium';
  }
  if (score >= SCORE_THRESHOLDS.low) {
    return 'low';
  }

  return 'none';
}

function buildRankedCandidate(candidate) {
  return {
    canonical_product_id: candidate.canonical_product_id,
    canonical_name: candidate.canonical_name,
    markers: candidate.markers,
    enrichment: candidate.enrichment,
    score: candidate.score,
    match_reasons: candidate.match_reasons,
  };
}

function buildResolutionSummary(items) {
  return items.reduce((summary, item) => {
    const next = {
      ...summary,
      total_items: summary.total_items + 1,
    };

    if (item.status === 'resolved') {
      next.resolved_count += 1;
    } else if (item.status === 'ambiguous') {
      next.ambiguous_count += 1;
    } else if (item.status === 'clarification_needed') {
      next.clarification_needed_count += 1;
    } else {
      next.unresolved_count += 1;
    }

    return next;
  }, {
    total_items: 0,
    resolved_count: 0,
    ambiguous_count: 0,
    clarification_needed_count: 0,
    unresolved_count: 0,
  });
}

function inferShoppingHints(tokens) {
  const tokenSet = new Set(tokens);
  const hint = BASE_PRODUCT_HINTS.find((entry) => entry.tokens.every((token) => tokenSet.has(token)));
  return hint || {};
}

function parseVolumeMarker(text) {
  const match = String(text || '').match(/(\d+(?:[.,]\d+)?)\s*(ml|мл|милилитър|милилитра|l|л|литър|литра|cl|kg|кг|килограм|килограма|g|гр|г|грам|грама)(?=\s|$|[.,])/iu);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = match[2].toLowerCase();
  if (unit === 'l' || unit === 'л' || unit === 'литър' || unit === 'литра') {
    return `${Math.round(value * 1000)}ml`;
  }
  if (unit === 'cl') {
    return `${Math.round(value * 10)}ml`;
  }
  if (unit === 'kg' || unit === 'кг' || unit === 'килограм' || unit === 'килограма') {
    return `${Math.round(value * 1000)}g`;
  }
  if (unit === 'g' || unit === 'гр' || unit === 'г' || unit === 'грам' || unit === 'грама') {
    return `${Math.round(value)}g`;
  }

  return `${Math.round(value)}ml`;
}

function parseCountValue(text) {
  const explicitCountMatch = String(text || '').match(/(\d+)\s*(бр|брой|броя|count|ct|pcs?|pieces?|rolls?|eggs?)(?=\s|$|[.,])/iu);
  if (explicitCountMatch) {
    return Number.parseInt(explicitCountMatch[1], 10);
  }

  const leadingNumberMatch = String(text || '').match(/^\s*(\d+)\s+\p{L}/u);
  return leadingNumberMatch ? Number.parseInt(leadingNumberMatch[1], 10) : null;
}

function resolveLimitPerItem(rawLimit) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT_PER_ITEM;
  }

  return Math.min(parsed, MAX_LIMIT_PER_ITEM);
}

function resolveShoppingIntentMode({
  useShoppingIntent,
  resolutionMode,
}) {
  if (resolutionMode === 'intent_first' || useShoppingIntent === true) {
    return 'intent_first';
  }
  return 'default';
}

function buildOwnerContextFromRequestBody(body = {}, req = null) {
  const ownerId = body.owner_id || body.user_id || req?.headers?.['x-pricer-owner-id'] || req?.headers?.['x-pricer-user-id'];
  if (!ownerId) {
    return {};
  }
  return {
    owner_id: ownerId,
    owner_type: body.owner_type || req?.headers?.['x-pricer-owner-type'] || 'user',
  };
}

function roundScore(value) {
  const bounded = Math.max(0, Math.min(1, value));
  return Math.round(bounded * 100) / 100;
}

module.exports = {
  CONFIDENCE_LEVELS,
  DEFAULT_LIMIT_PER_ITEM,
  DEFAULT_PRODUCT_LAYER_MODE,
  INTERNAL_SEARCH_LIMIT,
  LAYER_SELECTIONS,
  MAX_ITEMS_PER_REQUEST,
  MAX_LIMIT_PER_ITEM,
  RESOLUTION_STATUSES,
  SCORE_THRESHOLDS,
  SHOPPING_INTENT_RESOLUTION_MODES,
  handleResolveShoppingListItemsRequest,
  resolveShoppingListItems,
};
