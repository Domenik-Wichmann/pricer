const crypto = require('node:crypto');

const { lookupCanonicalProductPrices, DEFAULT_CURRENCY } = require('../../phase16/price_lookup');

const MEAL_PLAN_PRODUCT_CANDIDATE_GENERATION_METHOD = 'plan2b_meal_plan_product_candidate_builder_v1';
const MEAL_PLAN_PRODUCT_CANDIDATE_RULES_VERSION = 'plan2b_meal_plan_product_candidate_rules_v1';
const SUPPORTED_MEAL_PLAN_PRODUCT_CANDIDATE_STATUSES = Object.freeze([
  'ready_for_optimizer',
  'missing_product_mapping',
  'missing_product_size',
  'missing_price',
  'covered_by_inventory',
  'needs_review',
]);

async function buildMealPlanProductCandidateSet(client, options = {}) {
  requireClient(client);
  const normalized = normalizeMealPlanProductCandidateOptions(options);
  const netRequirement = await getMealPlanNetRequirement(client, normalized);
  if (!netRequirement) {
    throw new Error('Meal-plan net requirement not found for PLAN2B product candidate building.');
  }

  const netItems = await listMealPlanNetRequirementItems(
    client,
    netRequirement.net_requirement_id,
    normalized.limit,
  );
  const ingredientMetadata = await getIngredientMetadataMap(client, netItems);
  const approvedMappings = await listApprovedIngredientProductMappings(client, netItems);
  const runtimeStore = normalized.store;
  const runtimeState = runtimeStore ? await runtimeStore.load() : createEmptyRuntimeState();
  const candidateContext = buildRuntimeCandidateContext(runtimeState);
  const resolvedCanonicalProductIds = collectResolvedCanonicalProductIds({
    netItems,
    approvedMappings,
    candidateContext,
  });
  const priceLookup = runtimeStore && resolvedCanonicalProductIds.length > 0
    ? await lookupCanonicalProductPrices({
      store: runtimeStore,
      canonicalProductIds: resolvedCanonicalProductIds,
      options: {},
    })
    : {
      currency: DEFAULT_CURRENCY,
      items: [],
      summary: {
        requested_count: resolvedCanonicalProductIds.length,
        priced_count: 0,
        stale_count: 0,
        missing_count: resolvedCanonicalProductIds.length,
      },
    };
  const priceLookupByCanonicalId = new Map(
    (priceLookup.items || []).map((item) => [item.canonical_product_id, item]),
  );

  const candidateSetKey = buildMealPlanProductCandidateSetKey(
    netRequirement.net_requirement_id,
    MEAL_PLAN_PRODUCT_CANDIDATE_RULES_VERSION,
  );
  const candidateSet = {
    candidate_set_id: buildMealPlanProductCandidateSetId(candidateSetKey),
    net_requirement_id: netRequirement.net_requirement_id,
    plan_id: netRequirement.plan_id,
    profile_id: netRequirement.profile_id,
    user_id: netRequirement.user_id,
    candidate_set_key: candidateSetKey,
    generation_method: MEAL_PLAN_PRODUCT_CANDIDATE_GENERATION_METHOD,
    rules_version: MEAL_PLAN_PRODUCT_CANDIDATE_RULES_VERSION,
  };
  const candidates = buildProductCandidates({
    candidateSet,
    netItems,
    ingredientMetadata,
    approvedMappings,
    candidateContext,
    priceLookupByCanonicalId,
    currency: priceLookup.currency || DEFAULT_CURRENCY,
  });
  const summary = summarizeMealPlanProductCandidates({
    netItems,
    candidates,
  });
  const report = {
    dry_run: normalized.dry_run,
    net_requirement: netRequirement,
    candidate_set: candidateSet,
    net_requirements_seen: 1,
    candidate_sets_created: 1,
    requirement_items_seen: netItems.length,
    covered_by_inventory: summary.covered_by_inventory,
    missing_product_mapping: summary.missing_product_mapping,
    missing_product_size: summary.missing_product_size,
    missing_price: summary.missing_price,
    ready_for_optimizer: summary.ready_for_optimizer,
    candidates_created: candidates.length,
    total_required_grams: summary.total_required_grams,
    total_estimated_price_min: summary.total_estimated_price_min,
    total_estimated_price_max: summary.total_estimated_price_max,
    candidates,
    errors: [],
  };

  if (normalized.dry_run) {
    return report;
  }

  await persistMealPlanProductCandidates(client, {
    candidateSet,
    candidates,
  });
  return report;
}

async function getMealPlanNetRequirement(client, options = {}) {
  const netRequirementId = nullableString(options.net_requirement_id || options.netRequirementId);
  const netRequirementKey = nullableString(options.net_requirement_key || options.netRequirementKey);
  if (netRequirementId) {
    const result = await client.query(
      'SELECT * FROM meal_plan_net_requirements WHERE net_requirement_id = $1',
      [netRequirementId],
    );
    return result.rows[0] || null;
  }
  const result = await client.query(
    'SELECT * FROM meal_plan_net_requirements WHERE net_requirement_key = $1',
    [requiredString(netRequirementKey, 'net_requirement_key')],
  );
  return result.rows[0] || null;
}

async function listMealPlanNetRequirementItems(client, netRequirementId, limit = 1000) {
  const result = await client.query(`
    SELECT *
    FROM meal_plan_net_requirement_items
    WHERE net_requirement_id = $1
    ORDER BY display_name ASC, net_requirement_item_id ASC
    LIMIT $2
  `, [requiredString(netRequirementId, 'net_requirement_id'), positiveInteger(limit, 1000)]);
  return (result.rows || []).map(hydrateNetRequirementItemRow);
}

async function getIngredientMetadataMap(client, netItems = []) {
  const ingredientIds = [...new Set(
    (netItems || [])
      .map((item) => nullableString(item.ingredient_id))
      .filter(Boolean),
  )];
  if (!ingredientIds.length) {
    return new Map();
  }

  const result = await client.query(`
    SELECT ingredient_id, ingredient_key, density_g_per_ml, grams_per_piece
    FROM ingredients
    WHERE ingredient_id = ANY($1::text[])
  `, [ingredientIds]);
  return new Map((result.rows || []).map((row) => [
    row.ingredient_id,
    {
      ingredient_id: row.ingredient_id,
      ingredient_key: nullableString(row.ingredient_key),
      density_g_per_ml: nullableNumber(row.density_g_per_ml),
      grams_per_piece: nullableNumber(row.grams_per_piece),
    },
  ]));
}

async function listApprovedIngredientProductMappings(client, netItems = []) {
  const ingredientIds = [...new Set(
    (netItems || [])
      .map((item) => nullableString(item.ingredient_id))
      .filter(Boolean),
  )];
  if (!ingredientIds.length) {
    return new Map();
  }

  const result = await client.query(`
    SELECT
      m.*,
      c.candidate_id,
      c.product_name,
      c.normalized_product_name,
      c.brand,
      c.size,
      c.unit,
      c.parsed_attributes_json,
      c.proposed_ingredient_key
    FROM ingredient_product_mappings m
    LEFT JOIN ingredient_product_candidates c
      ON c.product_id = m.product_id
    WHERE m.ingredient_id = ANY($1::text[])
      AND m.review_status = 'approved'
    ORDER BY m.ingredient_id ASC, m.confidence DESC NULLS LAST, m.product_id ASC
  `, [ingredientIds]);
  const index = new Map();
  for (const row of result.rows || []) {
    const ingredientId = requiredString(row.ingredient_id, 'ingredient_id');
    const current = index.get(ingredientId) || [];
    current.push({
      mapping_id: row.mapping_id,
      ingredient_id: ingredientId,
      product_id: requiredString(row.product_id, 'product_id'),
      mapping_type: nullableString(row.mapping_type),
      confidence: nullableNumber(row.confidence),
      review_status: nullableString(row.review_status),
      reviewed_by: nullableString(row.reviewed_by),
      reviewed_at: nullableString(row.reviewed_at),
      review_reason: nullableString(row.review_reason),
      generation_method: nullableString(row.generation_method),
      product: {
        candidate_id: nullableString(row.candidate_id),
        product_id: requiredString(row.product_id, 'product_id'),
        product_name: nullableString(row.product_name),
        normalized_product_name: nullableString(row.normalized_product_name),
        brand: nullableString(row.brand),
        size: nullableNumber(row.size),
        unit: nullableString(row.unit),
        parsed_attributes_json: parseJson(row.parsed_attributes_json, {}),
        proposed_ingredient_key: nullableString(row.proposed_ingredient_key),
      },
    });
    index.set(ingredientId, current);
  }
  return index;
}

function buildRuntimeCandidateContext(runtimeState = {}) {
  const canonicalProducts = runtimeState.canonical_products || [];
  const canonicalMappings = runtimeState.canonical_product_mappings || [];
  const sourceProducts = runtimeState.source_products || [];

  const canonicalProductsById = new Map(
    canonicalProducts.map((row) => [row.canonical_product_id, row]),
  );
  const sourceProductsById = new Map(
    sourceProducts.map((row) => [row.source_product_id, row]),
  );
  const canonicalProductIdsBySourceProductId = new Map();
  const sourceProductIdsByCanonicalProductId = new Map();

  for (const row of canonicalMappings) {
    if (!row || !row.canonical_product_id || !row.source_product_id) {
      continue;
    }
    canonicalProductIdsBySourceProductId.set(row.source_product_id, row.canonical_product_id);
    const entries = sourceProductIdsByCanonicalProductId.get(row.canonical_product_id) || [];
    entries.push(row.source_product_id);
    sourceProductIdsByCanonicalProductId.set(row.canonical_product_id, entries);
  }

  return {
    canonicalProductsById,
    sourceProductsById,
    canonicalProductIdsBySourceProductId,
    sourceProductIdsByCanonicalProductId: new Map(
      [...sourceProductIdsByCanonicalProductId.entries()].map(([canonicalProductId, sourceProductIds]) => [
        canonicalProductId,
        [...new Set(sourceProductIds)].sort(),
      ]),
    ),
  };
}

function createEmptyRuntimeState() {
  return {
    canonical_products: [],
    canonical_product_mappings: [],
    source_products: [],
    raw_price_snapshots: [],
    product_daily_prices: [],
  };
}

function collectResolvedCanonicalProductIds({
  netItems,
  approvedMappings,
  candidateContext,
}) {
  const ids = new Set();
  for (const netItem of netItems || []) {
    if (netItem.adapter_status !== 'ready_for_product_mapping') {
      continue;
    }
    const mappings = approvedMappings.get(netItem.ingredient_id) || [];
    for (const mapping of mappings) {
      const resolvedCanonicalProductId = resolveCanonicalProductId(mapping.product_id, candidateContext);
      if (resolvedCanonicalProductId) {
        ids.add(resolvedCanonicalProductId);
      }
    }
  }
  return [...ids].sort();
}

function buildProductCandidates({
  candidateSet,
  netItems,
  ingredientMetadata,
  approvedMappings,
  candidateContext,
  priceLookupByCanonicalId,
  currency,
}) {
  const candidateSetId = requiredString(candidateSet.candidate_set_id, 'candidate_set_id');
  const candidates = [];

  for (const netItem of netItems || []) {
    const built = buildCandidatesForNetItem({
      candidateSetId,
      netItem,
      ingredient: ingredientMetadata.get(netItem.ingredient_id) || null,
      approvedMappings: approvedMappings.get(netItem.ingredient_id) || [],
      candidateContext,
      priceLookupByCanonicalId,
      currency,
    });
    candidates.push(...built);
  }

  return candidates.sort(compareMealPlanProductCandidates);
}

function buildCandidatesForNetItem({
  candidateSetId,
  netItem,
  ingredient,
  approvedMappings,
  candidateContext,
  priceLookupByCanonicalId,
  currency,
}) {
  const markerBase = buildCandidateBase({
    candidateSetId,
    netItem,
  });

  if (netItem.adapter_status === 'covered_by_inventory' || nullableNumber(netItem.net_quantity_grams) === 0) {
    return [buildMarkerCandidate(markerBase, {
      candidate_status: 'covered_by_inventory',
      selection_reason_json: {
        reason: 'covered_by_inventory',
        inventory_item_ids: parseJson(netItem.inventory_item_ids_json, []),
      },
    })];
  }

  if (!nullableString(netItem.ingredient_id)) {
    return [buildMarkerCandidate(markerBase, {
      candidate_status: 'missing_product_mapping',
      selection_reason_json: {
        reason: 'missing_ingredient',
      },
    })];
  }

  if (nullableNumber(netItem.net_quantity_grams) === null) {
    return [buildMarkerCandidate(markerBase, {
      candidate_status: 'missing_product_size',
      selection_reason_json: {
        reason: 'missing_quantity',
      },
    })];
  }

  if (!approvedMappings.length) {
    return [buildMarkerCandidate(markerBase, {
      candidate_status: 'missing_product_mapping',
      selection_reason_json: {
        reason: 'no_approved_ingredient_product_mapping',
      },
    })];
  }

  const candidates = approvedMappings.map((mapping) => buildProductCandidateFromMapping({
    base: markerBase,
    netItem,
    ingredient,
    mapping,
    candidateContext,
    priceLookup: priceLookupByCanonicalId.get(
      resolveCanonicalProductId(mapping.product_id, candidateContext),
    ) || null,
    currency,
  }));

  return candidates.length
    ? candidates
    : [buildMarkerCandidate(markerBase, {
      candidate_status: 'needs_review',
      selection_reason_json: {
        reason: 'approved_mapping_present_but_unusable',
      },
    })];
}

function buildProductCandidateFromMapping({
  base,
  netItem,
  ingredient,
  mapping,
  candidateContext,
  priceLookup,
  currency,
}) {
  const resolvedCanonicalProductId = resolveCanonicalProductId(mapping.product_id, candidateContext);
  const runtimeCanonicalProduct = resolvedCanonicalProductId
    ? candidateContext.canonicalProductsById.get(resolvedCanonicalProductId) || null
    : null;
  const packageSize = resolveProductPackageSize({
    ingredient,
    runtimeCanonicalProduct,
    productCandidate: mapping.product,
  });
  const bestPriceRecord = selectBestPriceRecord(priceLookup);
  const requiredQuantityGrams = roundNumber(netItem.net_quantity_grams);
  const unitsNeeded = packageSize.product_size_grams
    ? Math.max(1, Math.ceil(requiredQuantityGrams / packageSize.product_size_grams))
    : null;
  const totalPurchasedGrams = (
    unitsNeeded !== null && packageSize.product_size_grams !== null
  )
    ? roundNumber(unitsNeeded * packageSize.product_size_grams)
    : null;
  const overageGrams = totalPurchasedGrams !== null
    ? roundNumber(Math.max(totalPurchasedGrams - requiredQuantityGrams, 0))
    : null;
  const unitPrice = bestPriceRecord ? nullableNumber(bestPriceRecord.price) : null;
  const totalEstimatedPrice = (
    unitsNeeded !== null && unitPrice !== null
  )
    ? roundNumber(unitsNeeded * unitPrice)
    : null;
  const candidateStatus = determineMealPlanProductCandidateStatus({
    resolved_canonical_product_id: resolvedCanonicalProductId,
    product_size_grams: packageSize.product_size_grams,
    unit_price: unitPrice,
  });
  const productId = resolvedCanonicalProductId || nullableString(mapping.product_id);
  return {
    ...base,
    candidate_id: buildMealPlanProductCandidateId(
      base.candidate_set_id,
      base.net_requirement_item_id,
      productId || mapping.mapping_id || candidateStatus,
    ),
    product_id: productId,
    product_name_snapshot: nullableString(
      runtimeCanonicalProduct?.canonical_display_name
      || mapping.product?.product_name
      || base.display_name
    ),
    brand: nullableString(
      runtimeCanonicalProduct?.canonical_brand
      || mapping.product?.brand
    ),
    chain_id: nullableString(bestPriceRecord?.chain_id),
    store_id: nullableString(bestPriceRecord?.store_id),
    price_id: nullableString(bestPriceRecord?.source),
    product_size_quantity: packageSize.product_size_quantity,
    product_size_unit: packageSize.product_size_unit,
    product_size_grams: packageSize.product_size_grams,
    required_quantity_grams: requiredQuantityGrams,
    units_needed: unitsNeeded,
    total_purchased_grams: totalPurchasedGrams,
    overage_grams: overageGrams,
    unit_price: unitPrice,
    total_estimated_price: totalEstimatedPrice,
    currency: nullableString(bestPriceRecord?.currency) || currency,
    mapping_id: nullableString(mapping.mapping_id),
    mapping_confidence: nullableNumber(mapping.confidence),
    candidate_confidence: computeCandidateConfidence({
      mapping_confidence: mapping.confidence,
      resolved_canonical_product_id: resolvedCanonicalProductId,
      product_size_grams: packageSize.product_size_grams,
      unit_price: unitPrice,
    }),
    candidate_status: candidateStatus,
    selection_reason_json: {
      reason: candidateStatus,
      mapping_type: nullableString(mapping.mapping_type),
      mapped_product_id: nullableString(mapping.product_id),
      resolved_canonical_product_id: resolvedCanonicalProductId,
      package_size_source: packageSize.package_size_source,
      price_status: nullableString(priceLookup?.price_status),
      price_record_count: Array.isArray(priceLookup?.price_records)
        ? priceLookup.price_records.length
        : 0,
      inventory_status: nullableString(netItem.inventory_status),
      source_recipe_ids: parseJson(netItem.source_recipe_ids_json, []),
      source_recipe_ingredient_ids: parseJson(netItem.source_recipe_ingredient_ids_json, []),
    },
  };
}

function buildCandidateBase({
  candidateSetId,
  netItem,
}) {
  return {
    candidate_set_id: requiredString(candidateSetId, 'candidate_set_id'),
    net_requirement_item_id: requiredString(netItem.net_requirement_item_id, 'net_requirement_item_id'),
    ingredient_id: nullableString(netItem.ingredient_id),
    ingredient_key_snapshot: nullableString(netItem.ingredient_key_snapshot),
    display_name: requiredString(netItem.display_name, 'display_name'),
    required_quantity_grams: nullableNumber(netItem.net_quantity_grams),
    source_recipe_ids_json: parseJson(netItem.source_recipe_ids_json, []),
    source_recipe_ingredient_ids_json: parseJson(netItem.source_recipe_ingredient_ids_json, []),
    shopping_unit: nullableString(netItem.shopping_unit),
  };
}

function buildMarkerCandidate(base, {
  candidate_status,
  selection_reason_json,
}) {
  return {
    candidate_id: buildMealPlanProductCandidateId(
      base.candidate_set_id,
      base.net_requirement_item_id,
      candidate_status,
    ),
    candidate_set_id: base.candidate_set_id,
    net_requirement_item_id: base.net_requirement_item_id,
    ingredient_id: base.ingredient_id,
    ingredient_key_snapshot: base.ingredient_key_snapshot,
    display_name: base.display_name,
    product_id: null,
    product_name_snapshot: null,
    brand: null,
    chain_id: null,
    store_id: null,
    price_id: null,
    product_size_quantity: null,
    product_size_unit: null,
    product_size_grams: null,
    required_quantity_grams: nullableNumber(base.required_quantity_grams),
    units_needed: null,
    total_purchased_grams: null,
    overage_grams: null,
    unit_price: null,
    total_estimated_price: null,
    currency: DEFAULT_CURRENCY,
    mapping_id: null,
    mapping_confidence: null,
    candidate_confidence: null,
    candidate_status,
    selection_reason_json: {
      ...(selection_reason_json || {}),
      source_recipe_ids: base.source_recipe_ids_json || [],
      source_recipe_ingredient_ids: base.source_recipe_ingredient_ids_json || [],
    },
    source_recipe_ids_json: base.source_recipe_ids_json || [],
    source_recipe_ingredient_ids_json: base.source_recipe_ingredient_ids_json || [],
  };
}

function resolveCanonicalProductId(productId, candidateContext) {
  const normalizedProductId = nullableString(productId);
  if (!normalizedProductId) {
    return null;
  }
  if (candidateContext.canonicalProductsById.has(normalizedProductId)) {
    return normalizedProductId;
  }
  return candidateContext.canonicalProductIdsBySourceProductId.get(normalizedProductId) || null;
}

function resolveProductPackageSize({
  ingredient,
  runtimeCanonicalProduct,
  productCandidate,
}) {
  const runtimeSizeQuantity = nullableNumber(runtimeCanonicalProduct?.canonical_size_value);
  const runtimeSizeUnit = nullableString(runtimeCanonicalProduct?.canonical_size_unit);
  if (runtimeSizeQuantity !== null && runtimeSizeUnit) {
    return {
      product_size_quantity: runtimeSizeQuantity,
      product_size_unit: runtimeSizeUnit,
      product_size_grams: convertPackageSizeToGrams({
        quantity: runtimeSizeQuantity,
        unit: runtimeSizeUnit,
        ingredient,
      }),
      package_size_source: 'runtime_canonical_product',
    };
  }

  const candidateSizeQuantity = nullableNumber(
    productCandidate?.size
    ?? productCandidate?.parsed_attributes_json?.size
    ?? productCandidate?.parsed_attributes_json?.package_size
    ?? productCandidate?.parsed_attributes_json?.quantity,
  );
  const candidateSizeUnit = nullableString(
    productCandidate?.unit
    || productCandidate?.parsed_attributes_json?.unit
    || productCandidate?.parsed_attributes_json?.package_unit,
  );
  if (candidateSizeQuantity !== null && candidateSizeUnit) {
    return {
      product_size_quantity: candidateSizeQuantity,
      product_size_unit: candidateSizeUnit,
      product_size_grams: convertPackageSizeToGrams({
        quantity: candidateSizeQuantity,
        unit: candidateSizeUnit,
        ingredient,
      }),
      package_size_source: 'db3e_candidate',
    };
  }

  return {
    product_size_quantity: null,
    product_size_unit: null,
    product_size_grams: null,
    package_size_source: 'missing',
  };
}

function convertPackageSizeToGrams({
  quantity,
  unit,
  ingredient,
}) {
  const normalizedQuantity = nullableNumber(quantity);
  const normalizedUnit = normalizeUnit(unit);
  if (normalizedQuantity === null || !normalizedUnit) {
    return null;
  }
  if (normalizedUnit === 'g' || normalizedUnit === 'gram' || normalizedUnit === 'grams') {
    return roundNumber(normalizedQuantity);
  }
  if (normalizedUnit === 'kg' || normalizedUnit === 'kilogram' || normalizedUnit === 'kilograms') {
    return roundNumber(normalizedQuantity * 1000);
  }
  if (normalizedUnit === 'ml' || normalizedUnit === 'milliliter' || normalizedUnit === 'milliliters') {
    const density = nullableNumber(ingredient?.density_g_per_ml);
    return density !== null ? roundNumber(normalizedQuantity * density) : null;
  }
  if (normalizedUnit === 'l' || normalizedUnit === 'liter' || normalizedUnit === 'liters') {
    const density = nullableNumber(ingredient?.density_g_per_ml);
    return density !== null ? roundNumber(normalizedQuantity * 1000 * density) : null;
  }
  if (
    normalizedUnit === 'piece'
    || normalizedUnit === 'pieces'
    || normalizedUnit === 'count'
    || normalizedUnit === 'pc'
    || normalizedUnit === 'pcs'
  ) {
    const gramsPerPiece = nullableNumber(ingredient?.grams_per_piece);
    return gramsPerPiece !== null ? roundNumber(normalizedQuantity * gramsPerPiece) : null;
  }
  return null;
}

function selectBestPriceRecord(priceLookup) {
  if (!priceLookup || !Array.isArray(priceLookup.price_records)) {
    return null;
  }
  return priceLookup.price_records.find((record) => record.is_stale !== true) || null;
}

function determineMealPlanProductCandidateStatus({
  resolved_canonical_product_id,
  product_size_grams,
  unit_price,
}) {
  if (!nullableString(resolved_canonical_product_id)) {
    return 'needs_review';
  }
  if (nullableNumber(product_size_grams) === null) {
    return 'missing_product_size';
  }
  if (nullableNumber(unit_price) === null) {
    return 'missing_price';
  }
  return 'ready_for_optimizer';
}

function computeCandidateConfidence({
  mapping_confidence,
  resolved_canonical_product_id,
  product_size_grams,
  unit_price,
}) {
  const base = nullableNumber(mapping_confidence) ?? 0.5;
  let score = base;
  if (nullableString(resolved_canonical_product_id)) score += 0.1;
  if (nullableNumber(product_size_grams) !== null) score += 0.1;
  if (nullableNumber(unit_price) !== null) score += 0.1;
  return roundConfidence(Math.min(score, 1));
}

function summarizeMealPlanProductCandidates({
  netItems,
  candidates,
}) {
  const groupedByNetItemId = new Map();
  for (const candidate of candidates || []) {
    const current = groupedByNetItemId.get(candidate.net_requirement_item_id) || [];
    current.push(candidate);
    groupedByNetItemId.set(candidate.net_requirement_item_id, current);
  }

  const summary = {
    covered_by_inventory: 0,
    missing_product_mapping: 0,
    missing_product_size: 0,
    missing_price: 0,
    ready_for_optimizer: 0,
    total_required_grams: 0,
    total_estimated_price_min: 0,
    total_estimated_price_max: 0,
  };

  for (const netItem of netItems || []) {
    summary.total_required_grams = roundNumber(
      summary.total_required_grams + Number(netItem.net_quantity_grams || 0),
    );
    const itemCandidates = groupedByNetItemId.get(netItem.net_requirement_item_id) || [];
    const statuses = new Set(itemCandidates.map((candidate) => candidate.candidate_status));
    for (const status of statuses) {
      if (Object.prototype.hasOwnProperty.call(summary, status)) {
        summary[status] += 1;
      }
    }
    const readyCandidates = itemCandidates
      .filter((candidate) => candidate.candidate_status === 'ready_for_optimizer')
      .map((candidate) => Number(candidate.total_estimated_price || 0))
      .filter((value) => Number.isFinite(value) && value >= 0);
    if (readyCandidates.length > 0) {
      summary.total_estimated_price_min = roundNumber(
        summary.total_estimated_price_min + Math.min(...readyCandidates),
      );
      summary.total_estimated_price_max = roundNumber(
        summary.total_estimated_price_max + Math.max(...readyCandidates),
      );
    }
  }

  return summary;
}

async function persistMealPlanProductCandidates(client, {
  candidateSet,
  candidates,
}) {
  await client.query('BEGIN');
  try {
    const storedSet = await upsertMealPlanProductCandidateSet(client, candidateSet);
    await client.query(
      'DELETE FROM meal_plan_product_candidates WHERE candidate_set_id = $1',
      [storedSet.candidate_set_id],
    );
    for (const candidate of candidates) {
      await insertMealPlanProductCandidate(client, {
        ...candidate,
        candidate_set_id: storedSet.candidate_set_id,
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function upsertMealPlanProductCandidateSet(client, candidateSet) {
  const result = await client.query(`
    INSERT INTO meal_plan_product_candidate_sets (
      candidate_set_id,
      net_requirement_id,
      plan_id,
      profile_id,
      user_id,
      candidate_set_key,
      generation_method,
      rules_version
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (candidate_set_key) DO UPDATE SET
      net_requirement_id = EXCLUDED.net_requirement_id,
      plan_id = EXCLUDED.plan_id,
      profile_id = EXCLUDED.profile_id,
      user_id = EXCLUDED.user_id,
      generation_method = EXCLUDED.generation_method,
      rules_version = EXCLUDED.rules_version,
      updated_at = NOW()
    RETURNING *
  `, [
    candidateSet.candidate_set_id,
    candidateSet.net_requirement_id,
    candidateSet.plan_id,
    candidateSet.profile_id,
    candidateSet.user_id,
    candidateSet.candidate_set_key,
    candidateSet.generation_method,
    candidateSet.rules_version,
  ]);
  return result.rows[0];
}

async function insertMealPlanProductCandidate(client, candidate) {
  const result = await client.query(`
    INSERT INTO meal_plan_product_candidates (
      candidate_id,
      candidate_set_id,
      net_requirement_item_id,
      ingredient_id,
      ingredient_key_snapshot,
      display_name,
      product_id,
      product_name_snapshot,
      brand,
      chain_id,
      store_id,
      price_id,
      product_size_quantity,
      product_size_unit,
      product_size_grams,
      required_quantity_grams,
      units_needed,
      total_purchased_grams,
      overage_grams,
      unit_price,
      total_estimated_price,
      currency,
      mapping_id,
      mapping_confidence,
      candidate_confidence,
      candidate_status,
      selection_reason_json
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20, $21,
      $22, $23, $24, $25, $26, $27::jsonb
    )
    RETURNING *
  `, [
    candidate.candidate_id,
    candidate.candidate_set_id,
    candidate.net_requirement_item_id,
    candidate.ingredient_id,
    candidate.ingredient_key_snapshot,
    candidate.display_name,
    candidate.product_id,
    candidate.product_name_snapshot,
    candidate.brand,
    candidate.chain_id,
    candidate.store_id,
    candidate.price_id,
    candidate.product_size_quantity,
    candidate.product_size_unit,
    candidate.product_size_grams,
    candidate.required_quantity_grams,
    candidate.units_needed,
    candidate.total_purchased_grams,
    candidate.overage_grams,
    candidate.unit_price,
    candidate.total_estimated_price,
    candidate.currency,
    candidate.mapping_id,
    candidate.mapping_confidence,
    candidate.candidate_confidence,
    candidate.candidate_status,
    JSON.stringify(candidate.selection_reason_json || {}),
  ]);
  return hydrateMealPlanProductCandidateRow(result.rows[0]);
}

function hydrateNetRequirementItemRow(row) {
  if (!row) return null;
  return {
    ...row,
    inventory_item_ids_json: parseJson(row.inventory_item_ids_json, []),
    source_recipe_ids_json: parseJson(row.source_recipe_ids_json, []),
    source_recipe_ingredient_ids_json: parseJson(row.source_recipe_ingredient_ids_json, []),
  };
}

function hydrateMealPlanProductCandidateRow(row) {
  if (!row) return null;
  return {
    ...row,
    selection_reason_json: parseJson(row.selection_reason_json, {}),
  };
}

function buildMealPlanProductCandidateSetKey(netRequirementId, rulesVersion) {
  return `meal_plan_product_candidate_set:${stableHash([
    requiredString(netRequirementId, 'net_requirement_id'),
    requiredString(rulesVersion, 'rules_version'),
  ].join('|'))}`;
}

function buildMealPlanProductCandidateSetId(candidateSetKey) {
  return `meal_plan_product_candidate_set:${stableHash(requiredString(candidateSetKey, 'candidate_set_key'))}`;
}

function buildMealPlanProductCandidateId(candidateSetId, netRequirementItemId, productIdentity) {
  return `meal_plan_product_candidate:${stableHash([
    requiredString(candidateSetId, 'candidate_set_id'),
    requiredString(netRequirementItemId, 'net_requirement_item_id'),
    requiredString(productIdentity, 'product_identity'),
  ].join('|'))}`;
}

function normalizeMealPlanProductCandidateOptions(options = {}) {
  const netRequirementId = nullableString(options.netRequirementId || options.net_requirement_id);
  const netRequirementKey = nullableString(options.netRequirementKey || options.net_requirement_key);
  if (!netRequirementId && !netRequirementKey) {
    throw new Error('net_requirement_id or net_requirement_key is required for PLAN2B product candidates.');
  }
  return {
    net_requirement_id: netRequirementId,
    net_requirement_key: netRequirementKey,
    dry_run: Boolean(options.dryRun || options.dry_run),
    limit: positiveInteger(options.limit, 1000),
    store: options.store || null,
  };
}

function compareMealPlanProductCandidates(left, right) {
  return String(left.display_name || '').localeCompare(String(right.display_name || ''))
    || String(left.candidate_status || '').localeCompare(String(right.candidate_status || ''))
    || Number(left.total_estimated_price ?? Number.MAX_SAFE_INTEGER)
      - Number(right.total_estimated_price ?? Number.MAX_SAFE_INTEGER)
    || String(left.product_id || '').localeCompare(String(right.product_id || ''))
    || String(left.candidate_id || '').localeCompare(String(right.candidate_id || ''));
}

function normalizeUnit(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function positiveInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function requiredString(value, fieldName) {
  const normalized = nullableString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

function roundNumber(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function roundConfidence(value) {
  if (!Number.isFinite(Number(value))) return null;
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function stableHash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16);
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  MEAL_PLAN_PRODUCT_CANDIDATE_GENERATION_METHOD,
  MEAL_PLAN_PRODUCT_CANDIDATE_RULES_VERSION,
  SUPPORTED_MEAL_PLAN_PRODUCT_CANDIDATE_STATUSES,
  buildMealPlanProductCandidateId,
  buildMealPlanProductCandidateSet,
  buildMealPlanProductCandidateSetId,
  buildMealPlanProductCandidateSetKey,
  buildProductCandidates,
  convertPackageSizeToGrams,
  determineMealPlanProductCandidateStatus,
  hydrateMealPlanProductCandidateRow,
  normalizeMealPlanProductCandidateOptions,
  resolveCanonicalProductId,
  summarizeMealPlanProductCandidates,
};
