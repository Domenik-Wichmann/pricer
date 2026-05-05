const {
  applyEffectiveCanonicalDecisions,
  getEffectiveCanonicalDisambiguationDecision,
} = require('../phase6/disambiguation');
const {
  getEnrichmentByFingerprint,
} = require('../phase1/store');
const { buildGroceryQueryExpansion } = require('./search_synonyms');
const { isRuntimeSafeCanonicalProduct } = require('../phase6/product_validation');

const LAYER_SELECTIONS = Object.freeze({
  CANONICAL_TRUTH: 'canonical_truth',
  CANONICAL_WITH_APPLIED_VIEW: 'canonical_with_applied_view',
  CANONICAL_WITH_ENRICHMENT: 'canonical_with_enrichment',
  CANONICAL_WITH_APPLIED_VIEW_AND_ENRICHMENT: 'canonical_with_applied_view_and_enrichment',
});

const DEFAULT_VIEW_LIMIT = 50;
const MAX_VIEW_LIMIT = 200;
const ENRICHMENT_FILTER_FIELDS = Object.freeze([
  'category_l1',
  'category_l2',
  'category_l3',
  'category_l4',
  'brand',
  'brand_normalized',
  'base_product',
  'product_type',
  'product_family',
  'category',
  'subcategory',
  'flavor',
  'flavor_terms',
  'search_aliases_bg',
  'search_aliases_en',
  'attributes',
  'diet_tags',
  'usage_context',
  'product_form',
  'packaging',
  'quality_tier',
  'allergens',
  'is_food',
  'is_beverage',
  'is_personal_care',
  'confidence_gte',
]);

function getCanonicalProductViewById({
  state,
  canonicalProductId,
  layerSelection = LAYER_SELECTIONS.CANONICAL_TRUTH,
} = {}) {
  const context = createCanonicalReaderContext({
    state,
    layerSelection,
  });
  const product = context.canonicalProductById.get(canonicalProductId);
  if (!product) {
    return null;
  }

  return buildCanonicalProductView({
    product,
    context,
  });
}

function listCanonicalProductViews({
  state,
  layerSelection = LAYER_SELECTIONS.CANONICAL_TRUTH,
  filters = {},
  limit = DEFAULT_VIEW_LIMIT,
} = {}) {
  const context = createCanonicalReaderContext({
    state,
    layerSelection,
  });
  const boundedLimit = resolveBoundedLimit(limit);

  return context.canonicalProducts
    .map((product) => buildCanonicalProductView({ product, context }))
    .filter((view) => matchesEnrichmentFilters(view, filters, context))
    .slice(0, boundedLimit);
}

function searchCanonicalProductViews({
  state,
  queryText = '',
  layerSelection = LAYER_SELECTIONS.CANONICAL_TRUTH,
  filters = {},
  limit = DEFAULT_VIEW_LIMIT,
} = {}) {
  const context = createCanonicalReaderContext({
    state,
    layerSelection,
  });
  const boundedLimit = resolveBoundedLimit(limit);
  const searchPlan = buildSearchPlan(queryText);

  return context.canonicalProducts
    .map((product) => buildCanonicalProductView({ product, context }))
    .filter((view) => matchesEnrichmentFilters(view, filters, context))
    .map((view) => ({
      view,
      score: computeSearchScore(view, searchPlan, context),
    }))
    .filter((entry) => searchPlan.query_tokens.length === 0 || entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return String(left.view.canonical_product_id).localeCompare(String(right.view.canonical_product_id));
    })
    .slice(0, boundedLimit)
    .map((entry) => ({
      ...entry.view,
      search_debug: buildSearchDebug(entry.score, searchPlan, entry.view, context),
    }));
}

function buildCanonicalEnrichmentAnalytics({
  state,
  layerSelection = LAYER_SELECTIONS.CANONICAL_WITH_ENRICHMENT,
  filters = {},
  limit = MAX_VIEW_LIMIT,
} = {}) {
  const context = createCanonicalReaderContext({
    state,
    layerSelection,
  });
  const views = listCanonicalProductViews({
    state,
    layerSelection,
    filters,
    limit,
  });
  const coveredViews = views.filter((view) => Boolean(view.enrichment));
  const uncoveredViews = views.filter((view) => !view.enrichment);

  return {
    layer_selection: context.layerSelection,
    total_view_count: views.length,
    enrichment_coverage: {
      covered_count: coveredViews.length,
      uncovered_count: uncoveredViews.length,
      coverage_ratio: views.length === 0 ? 0 : roundRatio(coveredViews.length / views.length),
    },
    counts_by_category_l1: buildCountRollup(coveredViews, (view) => [view.enrichment.category_l1]),
    counts_by_category_l2: buildCountRollup(coveredViews, (view) => [view.enrichment.category_l2]),
    counts_by_category_l3: buildCountRollup(coveredViews, (view) => [view.enrichment.category_l3]),
    counts_by_brand: buildCountRollup(coveredViews, (view) => [view.enrichment.brand]),
    counts_by_base_product: buildCountRollup(coveredViews, (view) => [view.enrichment.base_product]),
    counts_by_flavor: buildCountRollup(coveredViews, (view) => view.enrichment.flavor),
    ingest_enrichment_run_summary: buildIngestEnrichmentRunSummary(state),
  };
}

function createCanonicalReaderContext({
  state,
  layerSelection,
}) {
  const resolvedLayerSelection = resolveLayerSelection(layerSelection);
  const canonicalProducts = sortCanonicalProducts(state?.canonical_products || [])
    .filter(isRuntimeSafeCanonicalProduct);
  const canonicalProductById = new Map(
    canonicalProducts.map((product) => [product.canonical_product_id, product])
  );
  const mappingsByCanonicalId = new Map();

  (state?.canonical_product_mappings || []).forEach((mapping) => {
    const entries = mappingsByCanonicalId.get(mapping.canonical_product_id) || [];
    entries.push(mapping);
    mappingsByCanonicalId.set(mapping.canonical_product_id, entries);
  });

  return {
    state,
    layerSelection: resolvedLayerSelection,
    canonicalProducts,
    canonicalProductById,
    mappingsByCanonicalId,
    supportsAppliedView: layerSelectionIncludesAppliedView(resolvedLayerSelection),
    supportsEnrichment: layerSelectionIncludesEnrichment(resolvedLayerSelection),
    appliedViewContext: layerSelectionIncludesAppliedView(resolvedLayerSelection)
      ? buildAppliedViewContext(state, canonicalProducts)
      : null,
  };
}

function buildCanonicalProductView({
  product,
  context,
}) {
  const mappings = [...(context.mappingsByCanonicalId.get(product.canonical_product_id) || [])]
    .sort((left, right) => String(left.source_product_id).localeCompare(String(right.source_product_id)));
  const enrichmentRecord = context.supportsEnrichment
    ? getEnrichmentByFingerprint(context.state, product.canonical_product_id)
    : null;
  const appliedView = context.supportsAppliedView
    ? buildAppliedViewForProduct(product.canonical_product_id, context.appliedViewContext)
    : null;

  return {
    view_id: product.canonical_product_id,
    layer_selection: context.layerSelection,
    canonical_product_id: product.canonical_product_id,
    effective_canonical_product_id: appliedView?.effective_canonical_product_id || product.canonical_product_id,
    canonical_truth: {
      ...product,
      source_product_ids: mappings.map((mapping) => mapping.source_product_id),
    },
    canonical_mappings: mappings,
    applied_view: appliedView,
    enrichment: enrichmentRecord ? enrichmentRecord.enrichment : null,
    enrichment_provenance: enrichmentRecord ? {
      canonical_fingerprint: enrichmentRecord.canonical_fingerprint,
      model_name: enrichmentRecord.model_name,
      prompt_version: enrichmentRecord.prompt_version,
      created_at: enrichmentRecord.created_at,
    } : null,
  };
}

function buildAppliedViewContext(state, canonicalProducts) {
  const preview = applyEffectiveCanonicalDecisions({
    canonicalProducts,
    canonicalDisambiguationQueue: state?.canonical_disambiguation_queue || [],
    getEffectiveDecision: (pairFingerprint) => getEffectiveCanonicalDisambiguationDecision({
      state,
      pairFingerprint,
    }),
    dryRun: false,
    apply: true,
  });
  const productIds = canonicalProducts
    .map((product) => product.canonical_product_id)
    .filter(Boolean);
  const parent = new Map(productIds.map((id) => [id, id]));
  const mergeFingerprintsByRoot = new Map();

  preview.applied_merges.forEach((pair) => {
    const leftId = pair.product_a?.canonical_candidate_id || null;
    const rightId = pair.product_b?.canonical_candidate_id || null;
    if (!leftId || !rightId) {
      return;
    }

    unionIds(parent, leftId, rightId);
  });

  const membersByRoot = new Map();
  productIds.forEach((id) => {
    const root = findRoot(parent, id);
    const members = membersByRoot.get(root) || [];
    members.push(id);
    membersByRoot.set(root, members);
  });

  preview.applied_merges.forEach((pair) => {
    const leftId = pair.product_a?.canonical_candidate_id || null;
    if (!leftId) {
      return;
    }
    const root = findRoot(parent, leftId);
    const fingerprints = mergeFingerprintsByRoot.get(root) || [];
    fingerprints.push(pair.pair_fingerprint);
    mergeFingerprintsByRoot.set(root, fingerprints);
  });

  const rootById = new Map(productIds.map((id) => [id, findRoot(parent, id)]));
  return {
    preview,
    rootById,
    membersByRoot: new Map(
      [...membersByRoot.entries()].map(([root, members]) => [
        root,
        [...members].sort((left, right) => String(left).localeCompare(String(right))),
      ])
    ),
    mergeFingerprintsByRoot: new Map(
      [...mergeFingerprintsByRoot.entries()].map(([root, fingerprints]) => [
        root,
        [...new Set(fingerprints)].sort(),
      ])
    ),
  };
}

function buildAppliedViewForProduct(canonicalProductId, appliedViewContext) {
  const root = appliedViewContext.rootById.get(canonicalProductId) || canonicalProductId;
  const members = appliedViewContext.membersByRoot.get(root) || [canonicalProductId];
  const isGroupRoot = root === canonicalProductId;

  return {
    effective_canonical_product_id: root,
    is_group_root: isGroupRoot,
    group_member_canonical_product_ids: members,
    merged_into_canonical_product_id: isGroupRoot ? null : root,
    applied_merge_pair_fingerprints: appliedViewContext.mergeFingerprintsByRoot.get(root) || [],
  };
}

function matchesEnrichmentFilters(view, filters, context) {
  const normalizedFilters = filters && typeof filters === 'object' ? filters : {};
  const usedEnrichmentFilter = Object.keys(normalizedFilters).some(
    (key) => ENRICHMENT_FILTER_FIELDS.includes(key)
  );
  if (usedEnrichmentFilter && !context.supportsEnrichment) {
    throw new Error(`Layer selection "${context.layerSelection}" does not include enrichment filters.`);
  }

  if (!context.supportsEnrichment || !usedEnrichmentFilter) {
    return true;
  }

  if (!view.enrichment) {
    return false;
  }

  const enrichment = view.enrichment;
  if (!matchesScalarFilter(enrichment.category_l1, normalizedFilters.category_l1)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.category_l2, normalizedFilters.category_l2)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.category_l3, normalizedFilters.category_l3)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.category_l4, normalizedFilters.category_l4)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.brand, normalizedFilters.brand)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.brand_normalized, normalizedFilters.brand_normalized)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.base_product, normalizedFilters.base_product)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.product_type, normalizedFilters.product_type)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.product_family, normalizedFilters.product_family)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.category, normalizedFilters.category)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.subcategory, normalizedFilters.subcategory)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.product_form, normalizedFilters.product_form)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.packaging, normalizedFilters.packaging)) {
    return false;
  }
  if (!matchesScalarFilter(enrichment.quality_tier, normalizedFilters.quality_tier)) {
    return false;
  }
  if (!matchesArrayFilter(enrichment.flavor, normalizedFilters.flavor)) {
    return false;
  }
  if (!matchesArrayFilter(enrichment.flavor_terms, normalizedFilters.flavor_terms)) {
    return false;
  }
  if (!matchesArrayFilter(enrichment.search_aliases_bg, normalizedFilters.search_aliases_bg)) {
    return false;
  }
  if (!matchesArrayFilter(enrichment.search_aliases_en, normalizedFilters.search_aliases_en)) {
    return false;
  }
  if (!matchesArrayFilter(enrichment.attributes, normalizedFilters.attributes)) {
    return false;
  }
  if (!matchesArrayFilter(enrichment.diet_tags, normalizedFilters.diet_tags)) {
    return false;
  }
  if (!matchesArrayFilter(enrichment.usage_context, normalizedFilters.usage_context)) {
    return false;
  }
  if (!matchesArrayFilter(enrichment.allergens, normalizedFilters.allergens)) {
    return false;
  }
  if (
    normalizedFilters.confidence_gte !== undefined &&
    Number.isFinite(Number(normalizedFilters.confidence_gte)) &&
    enrichment.confidence < Number(normalizedFilters.confidence_gte)
  ) {
    return false;
  }
  if (!matchesBooleanFilter(enrichment.is_food, normalizedFilters.is_food)) {
    return false;
  }
  if (!matchesBooleanFilter(enrichment.is_beverage, normalizedFilters.is_beverage)) {
    return false;
  }
  if (!matchesBooleanFilter(enrichment.is_personal_care, normalizedFilters.is_personal_care)) {
    return false;
  }

  return true;
}

function buildSearchPlan(queryText) {
  const expansion = buildGroceryQueryExpansion(queryText);
  return {
    ...expansion,
    matched_concept_ids: expansion.matched_concepts.map((concept) => concept.id),
  };
}

function computeSearchScore(view, searchPlan, context) {
  const queryTokens = searchPlan.query_tokens;
  if (queryTokens.length === 0) {
    return 1;
  }

  const weightedFields = [
    { value: view.canonical_truth.canonical_display_name, weight: 1.4 },
    { value: view.canonical_truth.source_example_name, weight: 1.2 },
    { value: view.canonical_truth.canonical_product_type, weight: 1.1 },
    { value: view.canonical_truth.canonical_brand, weight: 0.8 },
  ];

  const searchFields = weightedFields.map((field) => field.value);

  if (context.supportsEnrichment && view.enrichment) {
    weightedFields.push(
      { value: view.enrichment.base_product, weight: 1.1 },
      { value: view.enrichment.category_l1, weight: 0.4 },
      { value: view.enrichment.category_l2, weight: 0.5 },
      { value: view.enrichment.category_l3, weight: 0.6 },
      { value: view.enrichment.category_l4, weight: 0.6 },
      { value: view.enrichment.product_type, weight: 1.3 },
      { value: view.enrichment.product_family, weight: 1.1 },
      { value: view.enrichment.category, weight: 0.8 },
      { value: view.enrichment.subcategory, weight: 0.8 },
      { value: view.enrichment.brand, weight: 0.8 },
      { value: view.enrichment.brand_normalized, weight: 1.0 },
      { value: view.enrichment.product_line, weight: 0.7 },
      ...(view.enrichment.flavor || []).map((value) => ({ value, weight: 0.4 })),
      ...(view.enrichment.flavor_terms || []).map((value) => ({ value, weight: 0.5 })),
      ...(view.enrichment.search_aliases_bg || []).map((value) => ({ value, weight: 1.2 })),
      ...(view.enrichment.search_aliases_en || []).map((value) => ({ value, weight: 1.2 })),
      ...(view.enrichment.synonym_terms || []).map((value) => ({ value, weight: 0.9 })),
      ...(view.enrichment.should_match_queries || []).map((value) => ({ value, weight: 1.0 })),
      ...(view.enrichment.attributes || []).map((value) => ({ value, weight: 0.4 })),
      ...(view.enrichment.diet_tags || []).map((value) => ({ value, weight: 0.3 })),
      ...(view.enrichment.usage_context || []).map((value) => ({ value, weight: 0.3 })),
      ...(view.enrichment.allergens || []).map((value) => ({ value, weight: 0.3 }))
    );
  }

  const haystack = normalizeSearchValue(weightedFields.map((field) => field.value).join(' '));
  const haystackTokens = new Set(tokenizeSearchInput(haystack));
  const originalMatchedTokens = queryTokens.filter((token) => haystackTokens.has(token) || haystack.includes(token));
  const expandedMatchedTokens = searchPlan.expanded_tokens
    .filter((token) => !queryTokens.includes(token))
    .filter((token) => haystackTokens.has(token) || haystack.includes(token));
  const matchedExpandedPhrases = searchPlan.expanded_terms
    .filter((term) => term.includes(' '))
    .filter((term) => haystack.includes(term));
  const exactPhrase = searchPlan.normalized_query && haystack.includes(searchPlan.normalized_query);
  const allOriginalTokens = queryTokens.length > 0 && originalMatchedTokens.length === queryTokens.length;

  let score = 0;
  if (exactPhrase) {
    score += 30;
  }
  if (allOriginalTokens) {
    score += 18;
  }

  score += originalMatchedTokens.length * 5;
  score += expandedMatchedTokens.length * 1.6;
  score += matchedExpandedPhrases.length * 4;
  score += computeWeightedFieldBonus(weightedFields, searchPlan);

  if (searchPlan.matched_concept_ids.includes('baby_formula') && isBabyFormulaView(view)) {
    score += 16;
  }
  if (
    searchPlan.matched_concept_ids.includes('milk') &&
    !searchPlan.matched_concept_ids.includes('baby_formula') &&
    isBabyFormulaView(view)
  ) {
    score -= 14;
  }

  const guardrail = computeCategoryGuardrail(view, searchPlan);
  score += guardrail.score_adjustment;
  score += computeRichEnrichmentQueryAdjustment(view, searchPlan);

  return Math.max(0, Math.round(score * 1000) / 1000);
}

function computeRichEnrichmentQueryAdjustment(view, searchPlan) {
  const enrichment = view.enrichment || {};
  let adjustment = 0;
  if (matchesAnyQueryHint(searchPlan, enrichment.should_match_queries || [])) {
    adjustment += 8;
  }
  if (matchesAnyQueryHint(searchPlan, enrichment.synonym_terms || [])) {
    adjustment += 4;
  }
  if (matchesAnyQueryHint(searchPlan, enrichment.do_not_match_queries || [])) {
    adjustment -= 40;
  }
  if (matchesAnyQueryHint(searchPlan, enrichment.negative_match_hints || [])) {
    adjustment -= 12;
  }
  return adjustment;
}

function computeCategoryGuardrail(view, searchPlan) {
  const conceptIds = new Set(searchPlan.matched_concept_ids || []);
  const beverageIntent = conceptIds.has('cola') || conceptIds.has('soft_drink');
  const snackIntent = conceptIds.has('snacks') || conceptIds.has('biscuits') || conceptIds.has('chips') || conceptIds.has('crackers');
  const reasons = [];
  let scoreAdjustment = 0;

  if (beverageIntent && isBeverageView(view)) {
    scoreAdjustment += 18;
    reasons.push('beverage_intent_boost');
  }
  if (beverageIntent && isPersonalCareView(view) && !isBeverageView(view)) {
    scoreAdjustment -= 35;
    reasons.push('personal_care_vs_beverage_demotion');
  }
  if (snackIntent && isSnackView(view)) {
    scoreAdjustment += 14;
    reasons.push('snack_category_boost');
  }
  if (matchesAnyQueryHint(searchPlan, view.enrichment?.do_not_match_queries || [])) {
    scoreAdjustment -= 40;
    reasons.push('enrichment_do_not_match_query');
  }
  if (matchesAnyQueryHint(searchPlan, view.enrichment?.negative_match_hints || [])) {
    scoreAdjustment -= 12;
    reasons.push('enrichment_negative_match_hint');
  }

  return {
    score_adjustment: scoreAdjustment,
    reasons,
  };
}

function computeWeightedFieldBonus(weightedFields, searchPlan) {
  return weightedFields.reduce((sum, field) => {
    const normalized = normalizeSearchValue(field.value);
    if (!normalized) {
      return sum;
    }

    let fieldScore = 0;
    if (searchPlan.normalized_query && normalized.includes(searchPlan.normalized_query)) {
      fieldScore += 3 * field.weight;
    }
    searchPlan.query_tokens.forEach((token) => {
      if (normalized.includes(token)) {
        fieldScore += field.weight;
      }
    });
    searchPlan.expanded_terms.forEach((term) => {
      if (term !== searchPlan.normalized_query && normalized.includes(term)) {
        fieldScore += 0.6 * field.weight;
      }
    });
    return sum + fieldScore;
  }, 0);
}

function isBabyFormulaView(view) {
  const haystack = normalizeSearchValue([
    view.canonical_truth.canonical_display_name,
    view.canonical_truth.canonical_brand,
    view.canonical_truth.canonical_product_type,
    view.canonical_truth.source_example_name,
    view.enrichment?.base_product,
    view.enrichment?.category_l2,
    view.enrichment?.category_l3,
    view.enrichment?.category_l4,
    view.enrichment?.brand,
    view.enrichment?.product_line,
  ].join(' '));
  return /\b(aptamil|аптамил|pronutra|адаптирано|бебешко|infant formula|baby formula|follow on|follow-on|toddler milk)\b/u.test(haystack);
}

function isBeverageView(view) {
  const enrichment = view.enrichment || {};
  if (enrichment.is_beverage === true) {
    return true;
  }
  if (enrichment.is_beverage === false) {
    return false;
  }
  return normalizedFieldValues(view).some((value) =>
    /\b(beverage|beverages|soft drink|soft drinks|soda|cola|water|juice|напитка|безалкохолно|газирано|кола)\b/u.test(value)
  );
}

function isPersonalCareView(view) {
  const enrichment = view.enrichment || {};
  if (enrichment.is_personal_care === true) {
    return true;
  }
  return normalizedFieldValues(view).some((value) =>
    /\b(personal care|hair care|shampoo|conditioner|soap|hygiene|шампоан|сапун)\b/u.test(value)
  );
}

function isSnackView(view) {
  return normalizedFieldValues(view).some((value) =>
    /\b(snack|snacks|biscuit|biscuits|cookie|cookies|chips|crisps|cracker|crackers|wafer|wafers|dessert|снакс|бисквити|курабии|сладки|чипс|солети|крекери|вафли|десерт)\b/u.test(value)
  );
}

function normalizedFieldValues(view) {
  const enrichment = view.enrichment || {};
  return [
    view.canonical_truth.canonical_display_name,
    view.canonical_truth.canonical_brand,
    view.canonical_truth.canonical_product_type,
    view.canonical_truth.source_example_name,
    enrichment.base_product,
    enrichment.product_type,
    enrichment.product_family,
    enrichment.category,
    enrichment.subcategory,
    enrichment.category_l1,
    enrichment.category_l2,
    enrichment.category_l3,
    enrichment.category_l4,
    enrichment.brand,
    enrichment.brand_normalized,
    enrichment.product_line,
    enrichment.dairy_type,
    enrichment.beverage_type,
    enrichment.storage_type,
    enrichment.shopping_family_id,
    ...(enrichment.flavor || []),
    ...(enrichment.flavor_terms || []),
    ...(enrichment.search_aliases_bg || []),
    ...(enrichment.search_aliases_en || []),
    ...(enrichment.exclusion_terms || []),
    ...(enrichment.synonym_terms || []),
    ...(enrichment.should_match_queries || []),
    ...(enrichment.negative_match_hints || []),
    ...(enrichment.do_not_match_queries || []),
  ].map((value) => normalizeSearchValue(value)).filter(Boolean);
}

function buildSearchDebug(score, searchPlan, view) {
  const haystack = normalizeSearchValue([
    view.canonical_truth.canonical_display_name,
    view.canonical_truth.source_example_name,
    view.canonical_truth.canonical_product_type,
    view.canonical_truth.canonical_brand,
    view.enrichment?.base_product,
    view.enrichment?.product_type,
    view.enrichment?.product_family,
    view.enrichment?.category,
    view.enrichment?.subcategory,
    view.enrichment?.category_l1,
    view.enrichment?.category_l2,
    view.enrichment?.category_l3,
    ...(view.enrichment?.search_aliases_bg || []),
    ...(view.enrichment?.search_aliases_en || []),
  ].join(' '));
  const matchedTokens = searchPlan.query_tokens.filter((token) => haystack.includes(token));
  const matchedAliases = [
    ...(view.enrichment?.search_aliases_bg || []),
    ...(view.enrichment?.search_aliases_en || []),
  ].filter((alias) => {
    const normalizedAlias = normalizeSearchValue(alias);
    return normalizedAlias && (
      searchPlan.normalized_query.includes(normalizedAlias) ||
      haystack.includes(normalizedAlias) ||
      searchPlan.expanded_terms.includes(normalizedAlias)
    );
  });
  const exactPhrase = Boolean(searchPlan.normalized_query && haystack.includes(searchPlan.normalized_query));
  const allTokens = searchPlan.query_tokens.length > 0 && matchedTokens.length === searchPlan.query_tokens.length;
  const tier = exactPhrase
    ? 'exact_phrase'
    : allTokens
      ? 'all_tokens'
      : matchedTokens.length > 0
        ? 'any_token'
        : 'expanded';
  const guardrail = computeCategoryGuardrail(view, searchPlan);

  return {
    normalized_query: searchPlan.normalized_query,
    expanded_terms: searchPlan.expanded_terms,
    matched_concepts: searchPlan.matched_concepts,
    match_tier: tier,
    matched_tokens: matchedTokens,
    matched_enrichment: {
      product_type: view.enrichment?.product_type || null,
      product_family: view.enrichment?.product_family || null,
      category: view.enrichment?.category || view.enrichment?.category_l2 || null,
      subcategory: view.enrichment?.subcategory || view.enrichment?.category_l3 || null,
      enrichment_version: view.enrichment?.enrichment_version || null,
      dairy_type: view.enrichment?.dairy_type || null,
      beverage_type: view.enrichment?.beverage_type || null,
      is_food: view.enrichment?.is_food ?? null,
      is_beverage: view.enrichment?.is_beverage ?? null,
      is_personal_care: view.enrichment?.is_personal_care ?? null,
      aliases: matchedAliases,
    },
    guardrail_reasons: guardrail.reasons,
    demotion_reason: guardrail.reasons.find((reason) => reason.includes('demotion')) || null,
    score,
  };
}

function buildCountRollup(views, selector) {
  const counts = new Map();
  views.forEach((view) => {
    selector(view)
      .map((value) => normalizeSearchValue(value))
      .filter(Boolean)
      .forEach((value) => {
        counts.set(value, (counts.get(value) || 0) + 1);
      });
  });

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.value.localeCompare(right.value);
    });
}

function buildIngestEnrichmentRunSummary(state) {
  const runs = state?.ingest_runs || [];
  return runs.reduce((summary, run) => ({
    ingest_run_count: summary.ingest_run_count + 1,
    coverage_count: summary.coverage_count + Number(run.canonical_enrichment_coverage_count || 0),
    total_count: summary.total_count + Number(run.canonical_enrichment_count || 0),
    created_count: summary.created_count + Number(run.canonical_enrichment_created_count || 0),
    reused_count: summary.reused_count + Number(run.canonical_enrichment_reused_count || 0),
    rejected_count: summary.rejected_count + Number(run.canonical_enrichment_rejected_count || 0),
    offline_missing_count: summary.offline_missing_count + Number(run.canonical_enrichment_offline_missing_count || 0),
    model_call_count: summary.model_call_count + Number(run.canonical_enrichment_model_call_count || 0),
  }), {
    ingest_run_count: 0,
    coverage_count: 0,
    total_count: 0,
    created_count: 0,
    reused_count: 0,
    rejected_count: 0,
    offline_missing_count: 0,
    model_call_count: 0,
  });
}

function resolveLayerSelection(layerSelection) {
  const value = String(layerSelection || '').trim();
  if (!Object.values(LAYER_SELECTIONS).includes(value)) {
    throw new Error(`Unsupported canonical layer selection: ${layerSelection}`);
  }

  return value;
}

function layerSelectionIncludesAppliedView(layerSelection) {
  return layerSelection === LAYER_SELECTIONS.CANONICAL_WITH_APPLIED_VIEW ||
    layerSelection === LAYER_SELECTIONS.CANONICAL_WITH_APPLIED_VIEW_AND_ENRICHMENT;
}

function layerSelectionIncludesEnrichment(layerSelection) {
  return layerSelection === LAYER_SELECTIONS.CANONICAL_WITH_ENRICHMENT ||
    layerSelection === LAYER_SELECTIONS.CANONICAL_WITH_APPLIED_VIEW_AND_ENRICHMENT;
}

function sortCanonicalProducts(products) {
  return [...products].sort(
    (left, right) => String(left.canonical_product_id).localeCompare(String(right.canonical_product_id))
  );
}

function resolveBoundedLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_VIEW_LIMIT;
  }

  return Math.min(parsed, MAX_VIEW_LIMIT);
}

function matchesScalarFilter(actualValue, requestedValue) {
  if (requestedValue === undefined || requestedValue === null || requestedValue === '') {
    return true;
  }

  return normalizeSearchValue(actualValue) === normalizeSearchValue(requestedValue);
}

function matchesArrayFilter(actualValues, requestedValue) {
  if (requestedValue === undefined || requestedValue === null || requestedValue === '') {
    return true;
  }

  const requestedValues = Array.isArray(requestedValue) ? requestedValue : [requestedValue];
  const actual = new Set((actualValues || []).map((value) => normalizeSearchValue(value)).filter(Boolean));
  return requestedValues
    .map((value) => normalizeSearchValue(value))
    .filter(Boolean)
    .every((value) => actual.has(value));
}

function matchesBooleanFilter(actualValue, requestedValue) {
  if (requestedValue === undefined || requestedValue === null || requestedValue === '') {
    return true;
  }
  const normalized = String(requestedValue).trim().toLowerCase();
  if (normalized !== 'true' && normalized !== 'false') {
    return true;
  }
  return Boolean(actualValue) === (normalized === 'true');
}

function tokenizeSearchInput(value) {
  return normalizeSearchValue(value)
    .split(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff%]+/u)
    .filter(Boolean);
}

function normalizeSearchValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, ' ');
}

function matchesAnyQueryHint(searchPlan, hints = []) {
  return (hints || [])
    .map((hint) => normalizeSearchValue(hint))
    .filter(Boolean)
    .some((hint) => {
      if (searchPlan.normalized_query === hint || searchPlan.normalized_query.includes(hint)) {
        return true;
      }
      const hintTokens = tokenizeSearchInput(hint);
      return hintTokens.length > 0 && hintTokens.every((token) => searchPlan.query_tokens.includes(token));
    });
}

function roundRatio(value) {
  return Math.round(value * 10000) / 10000;
}

function findRoot(parent, id) {
  const currentParent = parent.get(id) || id;
  if (currentParent === id) {
    return id;
  }

  const root = findRoot(parent, currentParent);
  parent.set(id, root);
  return root;
}

function unionIds(parent, left, right) {
  if (!parent.has(left)) {
    parent.set(left, left);
  }
  if (!parent.has(right)) {
    parent.set(right, right);
  }

  const leftRoot = findRoot(parent, left);
  const rightRoot = findRoot(parent, right);
  if (leftRoot === rightRoot) {
    return;
  }

  const winner = [leftRoot, rightRoot].sort()[0];
  const loser = winner === leftRoot ? rightRoot : leftRoot;
  parent.set(loser, winner);
}

module.exports = {
  ENRICHMENT_FILTER_FIELDS,
  LAYER_SELECTIONS,
  buildCanonicalEnrichmentAnalytics,
  buildSearchPlan,
  getCanonicalProductViewById,
  listCanonicalProductViews,
  searchCanonicalProductViews,
};
