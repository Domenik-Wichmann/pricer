const {
  DEFAULT_PRODUCT_LAYER_MODE,
  handleResolveShoppingListItemsRequest,
} = require('./shopping_list');

const DEFAULT_PLANNER_OPTIONS = Object.freeze({
  ambiguous_policy: 'carry_top_n',
  ambiguous_top_n: 3,
  unresolved_policy: 'exclude',
});
const ALLOWED_AMBIGUOUS_POLICIES = Object.freeze([
  'carry_top_n',
  'force_best',
  'require_confirmation',
]);
const ALLOWED_UNRESOLVED_POLICIES = Object.freeze([
  'exclude',
  'placeholder',
  'block',
]);
const DEFAULT_REQUESTED_QUANTITY = 1;
const MAX_AMBIGUOUS_TOP_N = 10;

async function handleBuildBasketPlanRequest({
  store,
  body = {},
}) {
  const resolverResponse = await handleResolveShoppingListItemsRequest({
    store,
    body: {
      items: body.items,
      layer_mode: body.layer_mode,
      limit_per_item: resolveResolverLimit(body.planner_options),
    },
  });
  if (resolverResponse.status !== 200) {
    return resolverResponse;
  }

  const options = normalizePlannerOptions(body.planner_options);
  if (options.error) {
    return options.error;
  }

  return {
    status: 200,
    body: buildBasketPlanFromResolvedItems({
      resolvedItems: resolverResponse.body.items,
      layerMode: resolverResponse.body.layer_mode || DEFAULT_PRODUCT_LAYER_MODE,
      options: options.value,
    }),
  };
}

function buildBasketPlanFromResolvedItems({
  resolvedItems = [],
  resolved_items: resolvedItemsSnakeCase = null,
  layerMode = DEFAULT_PRODUCT_LAYER_MODE,
  options = {},
}) {
  const effectiveResolvedItems = Array.isArray(resolvedItemsSnakeCase)
    ? resolvedItemsSnakeCase
    : resolvedItems;
  const plannerOptions = normalizePlannerOptions(options);
  if (plannerOptions.error) {
    throw new Error(plannerOptions.error.body.error);
  }

  const readyItems = [];
  const ambiguousItems = [];
  const unresolvedItems = [];
  let optimizationReady = true;
  let requiresUserConfirmation = false;

  effectiveResolvedItems.forEach((item) => {
    const quantityContext = parseRequestedQuantityContext(item.input_text);
    if (item.status === 'resolved') {
      if (item.best_match) {
        readyItems.push(buildReadyItem({
          sourceItem: item,
          candidate: item.best_match,
          quantityContext,
        }));
      }
      return;
    }

    if (item.status === 'ambiguous') {
      const ambiguousOutcome = buildAmbiguousOutcome({
        item,
        quantityContext,
        options: plannerOptions.value,
      });
      readyItems.push(...ambiguousOutcome.ready_items);
      ambiguousItems.push(...ambiguousOutcome.ambiguous_items);
      if (ambiguousOutcome.blocks_optimization) {
        optimizationReady = false;
      }
      if (ambiguousOutcome.requires_confirmation) {
        requiresUserConfirmation = true;
      }
      return;
    }

    const unresolvedOutcome = buildUnresolvedOutcome({
      item,
      quantityContext,
      options: plannerOptions.value,
    });
    readyItems.push(...unresolvedOutcome.ready_items);
    unresolvedItems.push(...unresolvedOutcome.unresolved_items);
    if (unresolvedOutcome.blocks_optimization) {
      optimizationReady = false;
    }
  });

  return {
    layer_mode: layerMode,
    optimization_ready: optimizationReady,
    requires_user_confirmation: requiresUserConfirmation,
    ready_items: readyItems,
    ambiguous_items: ambiguousItems,
    unresolved_items: unresolvedItems,
    summary: {
      total_items: effectiveResolvedItems.length,
      ready_count: readyItems.length,
      ambiguous_count: ambiguousItems.length,
      unresolved_count: unresolvedItems.length,
    },
  };
}

function buildAmbiguousOutcome({
  item,
  quantityContext,
  options,
}) {
  const policy = options.ambiguous_policy;
  if (policy === 'force_best') {
    const bestCandidate = item.best_match || item.candidates[0] || null;
    return {
      ready_items: bestCandidate ? [buildReadyItem({
        sourceItem: item,
        candidate: bestCandidate,
        quantityContext,
      })] : [],
      ambiguous_items: [],
      blocks_optimization: false,
      requires_confirmation: false,
    };
  }

  const carriedCandidates = item.candidates.slice(0, options.ambiguous_top_n);
  return {
    ready_items: [],
    ambiguous_items: [{
      input_text: item.input_text,
      normalized_query: item.normalized_query,
      confidence: item.confidence,
      requested_quantity: quantityContext.requested_quantity,
      requested_markers: quantityContext.requested_markers,
      candidates: item.candidates,
      carried_candidates: carriedCandidates,
    }],
    blocks_optimization: policy === 'require_confirmation',
    requires_confirmation: policy === 'carry_top_n' || policy === 'require_confirmation',
  };
}

function buildUnresolvedOutcome({
  item,
  quantityContext,
  options,
}) {
  if (options.unresolved_policy === 'placeholder') {
    return {
      ready_items: [{
        type: 'manual',
        input_text: item.input_text,
        normalized_query: item.normalized_query,
        requested_quantity: quantityContext.requested_quantity,
        requested_markers: quantityContext.requested_markers,
      }],
      unresolved_items: [],
      blocks_optimization: false,
    };
  }

  return {
    ready_items: [],
    unresolved_items: [{
      input_text: item.input_text,
      normalized_query: item.normalized_query,
      requested_quantity: quantityContext.requested_quantity,
      requested_markers: quantityContext.requested_markers,
    }],
    blocks_optimization: options.unresolved_policy === 'block',
  };
}

function buildReadyItem({
  sourceItem,
  candidate,
  quantityContext,
}) {
  return {
    canonical_product_id: candidate.canonical_product_id,
    canonical_name: candidate.canonical_name,
    quantity: quantityContext.requested_quantity,
    requested_quantity: quantityContext.requested_quantity,
    requested_markers: quantityContext.requested_markers,
    markers: candidate.markers,
    enrichment: candidate.enrichment,
    input_text: sourceItem.input_text,
    source_status: sourceItem.status,
    source_confidence: sourceItem.confidence,
    score: candidate.score ?? null,
    match_reasons: candidate.match_reasons || [],
  };
}

function normalizePlannerOptions(rawOptions) {
  const options = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
    ? rawOptions
    : {};
  const ambiguousPolicy = typeof options.ambiguous_policy === 'string'
    ? options.ambiguous_policy.trim()
    : DEFAULT_PLANNER_OPTIONS.ambiguous_policy;
  if (!ALLOWED_AMBIGUOUS_POLICIES.includes(ambiguousPolicy)) {
    return {
      error: {
        status: 400,
        body: {
          error: 'invalid ambiguous_policy',
          allowed_ambiguous_policies: ALLOWED_AMBIGUOUS_POLICIES,
        },
      },
    };
  }

  const unresolvedPolicy = typeof options.unresolved_policy === 'string'
    ? options.unresolved_policy.trim()
    : DEFAULT_PLANNER_OPTIONS.unresolved_policy;
  if (!ALLOWED_UNRESOLVED_POLICIES.includes(unresolvedPolicy)) {
    return {
      error: {
        status: 400,
        body: {
          error: 'invalid unresolved_policy',
          allowed_unresolved_policies: ALLOWED_UNRESOLVED_POLICIES,
        },
      },
    };
  }

  return {
    value: {
      ambiguous_policy: ambiguousPolicy,
      ambiguous_top_n: resolveAmbiguousTopN(options.ambiguous_top_n),
      unresolved_policy: unresolvedPolicy,
    },
  };
}

function resolveResolverLimit(rawPlannerOptions) {
  const normalized = normalizePlannerOptions(rawPlannerOptions);
  if (normalized.error) {
    return undefined;
  }

  if (normalized.value.ambiguous_policy === 'carry_top_n') {
    return normalized.value.ambiguous_top_n;
  }

  return undefined;
}

function resolveAmbiguousTopN(rawValue) {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PLANNER_OPTIONS.ambiguous_top_n;
  }

  return Math.min(parsed, MAX_AMBIGUOUS_TOP_N);
}

function parseRequestedQuantityContext(text) {
  return {
    requested_quantity: parseRequestedQuantity(text),
    requested_markers: {
      volume_marker: parseVolumeMarker(text),
      count_marker: parseCountMarker(text),
    },
  };
}

function parseRequestedQuantity(text) {
  const input = String(text || '');
  const prefixMultiplier = input.match(/^\s*(\d+)\s*[xX]\b/u);
  if (prefixMultiplier) {
    return Number.parseInt(prefixMultiplier[1], 10);
  }

  const suffixMultiplier = input.match(/\b[xX]\s*(\d+)\s*$/u);
  if (suffixMultiplier) {
    return Number.parseInt(suffixMultiplier[1], 10);
  }

  return DEFAULT_REQUESTED_QUANTITY;
}

function parseVolumeMarker(text) {
  const match = String(text || '').match(/(\d+(?:[.,]\d+)?)\s*(ml|l|cl)(?=\s|$|[.,])/iu);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = match[2].toLowerCase();
  if (unit === 'l') {
    return `${Math.round(value * 1000)}ml`;
  }
  if (unit === 'cl') {
    return `${Math.round(value * 10)}ml`;
  }

  return `${Math.round(value)}ml`;
}

function parseCountMarker(text) {
  const explicitMatch = String(text || '').match(/(\d+)\s*(count|ct|pcs?|pieces?|rolls?|eggs?)(?=\s|$|[.,])/iu);
  if (explicitMatch) {
    return `${Number.parseInt(explicitMatch[1], 10)} count`;
  }

  const leadingMatch = String(text || '').match(/^\s*(\d+)\s+(eggs?|rolls?)\b/iu);
  if (leadingMatch) {
    return `${Number.parseInt(leadingMatch[1], 10)} count`;
  }

  return null;
}

module.exports = {
  ALLOWED_AMBIGUOUS_POLICIES,
  ALLOWED_UNRESOLVED_POLICIES,
  DEFAULT_PLANNER_OPTIONS,
  DEFAULT_REQUESTED_QUANTITY,
  buildBasketPlanFromResolvedItems,
  handleBuildBasketPlanRequest,
};
