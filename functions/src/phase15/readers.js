const {
  applyEffectiveCanonicalDecisions,
  getEffectiveCanonicalDisambiguationDecision,
} = require('../phase6/disambiguation');
const {
  getEnrichmentByFingerprint,
} = require('../phase1/store');

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
  'base_product',
  'flavor',
  'attributes',
  'diet_tags',
  'usage_context',
  'product_form',
  'packaging',
  'quality_tier',
  'allergens',
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
  const queryTokens = tokenizeSearchInput(queryText);

  return context.canonicalProducts
    .map((product) => buildCanonicalProductView({ product, context }))
    .filter((view) => matchesEnrichmentFilters(view, filters, context))
    .map((view) => ({
      view,
      score: computeSearchScore(view, queryTokens, context),
    }))
    .filter((entry) => queryTokens.length === 0 || entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return String(left.view.canonical_product_id).localeCompare(String(right.view.canonical_product_id));
    })
    .slice(0, boundedLimit)
    .map((entry) => entry.view);
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
  const canonicalProducts = sortCanonicalProducts(state?.canonical_products || []);
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
  if (!matchesScalarFilter(enrichment.base_product, normalizedFilters.base_product)) {
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

  return true;
}

function computeSearchScore(view, queryTokens, context) {
  if (queryTokens.length === 0) {
    return 1;
  }

  const searchFields = [
    view.canonical_truth.canonical_display_name,
    view.canonical_truth.canonical_brand,
    view.canonical_truth.canonical_product_type,
    view.canonical_truth.source_example_name,
  ];

  if (context.supportsEnrichment && view.enrichment) {
    searchFields.push(
      view.enrichment.base_product,
      view.enrichment.category_l1,
      view.enrichment.category_l2,
      view.enrichment.category_l3,
      view.enrichment.category_l4,
      view.enrichment.brand,
      view.enrichment.product_line,
      ...(view.enrichment.flavor || []),
      ...(view.enrichment.attributes || []),
      ...(view.enrichment.diet_tags || []),
      ...(view.enrichment.usage_context || []),
      ...(view.enrichment.allergens || [])
    );
  }

  const haystack = normalizeSearchValue(searchFields.join(' '));
  return queryTokens.reduce((score, token) => {
    if (haystack.includes(token)) {
      return score + 1;
    }

    return score;
  }, 0);
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
  getCanonicalProductViewById,
  listCanonicalProductViews,
  searchCanonicalProductViews,
};
