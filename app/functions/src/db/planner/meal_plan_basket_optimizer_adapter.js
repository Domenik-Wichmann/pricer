const crypto = require('node:crypto');

const {
  DEFAULT_CURRENCY,
  lookupCanonicalProductPrices,
} = require('../../phase16/price_lookup');
const {
  DEFAULT_OPTIMIZER_OPTIONS,
  normalizeOptimizerOptions,
  optimizeBasketMultiStore,
  optimizeBasketSingleStore,
} = require('../../phase16/basket_optimizer');

const MEAL_PLAN_BASKET_OPTIMIZER_GENERATION_METHOD = 'plan2c_meal_plan_basket_optimizer_adapter_v1';
const MEAL_PLAN_BASKET_OPTIMIZER_RULES_VERSION = 'plan2c_meal_plan_basket_optimizer_rules_v1';
const MEAL_PLAN_BASKET_OPTIMIZER_VERSION = 'phase16_basket_optimizer_v1';
const SUPPORTED_MEAL_PLAN_OPTIMIZED_BASKET_ITEM_STATUSES = Object.freeze([
  'selected',
  'covered_by_inventory',
  'missing_product',
  'missing_price',
  'optimizer_excluded',
  'needs_review',
]);

const DEFAULT_PLAN2C_OPTIMIZER_OPTIONS = Object.freeze({
  ...DEFAULT_OPTIMIZER_OPTIONS,
  strategy: 'multi_store',
  ambiguous_policy: 'cheapest_candidate',
  include_explanation: false,
  include_convenience_scoring: false,
  include_metrics: false,
  persist_metrics: false,
});

async function optimizeMealPlanBasket(client, options = {}) {
  requireClient(client);
  const normalized = normalizeMealPlanBasketOptimizerOptions(options);
  const candidateSet = await getMealPlanProductCandidateSet(client, normalized);
  if (!candidateSet) {
    throw new Error('Meal-plan product candidate set not found for PLAN2C optimization.');
  }

  const candidateRows = await listMealPlanProductCandidates(
    client,
    candidateSet.candidate_set_id,
    normalized.limit,
  );
  const grouped = groupCandidatesByNetRequirementItemId(candidateRows);
  const adapter = resolveOptimizerAdapter(normalized.optimizer_adapter);
  const runtimeStore = normalized.store;
  if (!runtimeStore || typeof runtimeStore.load !== 'function') {
    throw new Error('A runtime data store with load() is required for PLAN2C optimization.');
  }

  const optimizerInputs = buildOptimizerInputs(grouped);
  const syntheticBasketPlan = buildSyntheticBasketPlan(optimizerInputs.optimizable_groups);
  const syntheticPriceLookup = await buildSyntheticPriceLookup({
    adapter,
    store: runtimeStore,
    readyCandidates: optimizerInputs.ready_candidates,
  });
  const optimizerOptions = normalizePlan2cOptimizerOptions(normalized.optimizer_options);
  const singleStoreResult = adapter.optimizeBasketSingleStore({
    basketPlan: syntheticBasketPlan,
    priceLookup: syntheticPriceLookup,
    options: optimizerOptions,
  });
  const multiStoreResult = adapter.optimizeBasketMultiStore({
    basketPlan: syntheticBasketPlan,
    priceLookup: syntheticPriceLookup,
    singleStoreResult,
    options: optimizerOptions,
  });

  const selectedOptimization = selectOptimizationResult({
    singleStoreResult,
    multiStoreResult,
  });
  const selectedItems = buildSelectedOptimizedBasketItems({
    optimizedBasketId: buildMealPlanOptimizedBasketId(
      buildMealPlanOptimizerRunKey(
        candidateSet.candidate_set_id,
        MEAL_PLAN_BASKET_OPTIMIZER_VERSION,
        MEAL_PLAN_BASKET_OPTIMIZER_RULES_VERSION,
      ),
    ),
    selectedOptimization,
    candidateBySyntheticId: optimizerInputs.candidate_by_synthetic_id,
  });
  const preservedItems = buildPreservedOptimizedBasketItems({
    optimizedBasketId: buildMealPlanOptimizedBasketId(
      buildMealPlanOptimizerRunKey(
        candidateSet.candidate_set_id,
        MEAL_PLAN_BASKET_OPTIMIZER_VERSION,
        MEAL_PLAN_BASKET_OPTIMIZER_RULES_VERSION,
      ),
    ),
    preservedGroups: optimizerInputs.preserved_groups,
  });
  const optimizedBasketItems = [...selectedItems, ...preservedItems].sort(compareOptimizedBasketItems);

  const optimizedBasket = buildOptimizedBasketRecord({
    candidateSet,
    selectedOptimization,
    syntheticBasketPlan,
    syntheticPriceLookup,
    optimizerInputs,
    optimizedBasketItems,
  });
  const report = buildOptimizationReport({
    dryRun: normalized.dry_run,
    candidateSet,
    candidateRows,
    optimizerInputs,
    selectedOptimization,
    optimizedBasket,
    optimizedBasketItems,
  });

  if (normalized.dry_run) {
    return report;
  }

  await persistMealPlanOptimizedBasket(client, {
    optimizedBasket,
    optimizedBasketItems,
  });
  return report;
}

async function getMealPlanProductCandidateSet(client, options = {}) {
  const candidateSetId = nullableString(options.candidate_set_id || options.candidateSetId);
  const candidateSetKey = nullableString(options.candidate_set_key || options.candidateSetKey);
  if (candidateSetId) {
    const result = await client.query(
      'SELECT * FROM meal_plan_product_candidate_sets WHERE candidate_set_id = $1',
      [candidateSetId],
    );
    return result.rows[0] || null;
  }
  const result = await client.query(
    'SELECT * FROM meal_plan_product_candidate_sets WHERE candidate_set_key = $1',
    [requiredString(candidateSetKey, 'candidate_set_key')],
  );
  return result.rows[0] || null;
}

async function listMealPlanProductCandidates(client, candidateSetId, limit = 1000) {
  const result = await client.query(`
    SELECT *
    FROM meal_plan_product_candidates
    WHERE candidate_set_id = $1
    ORDER BY display_name ASC, net_requirement_item_id ASC, candidate_status ASC, candidate_id ASC
    LIMIT $2
  `, [requiredString(candidateSetId, 'candidate_set_id'), positiveInteger(limit, 1000)]);
  return (result.rows || []).map(hydrateMealPlanProductCandidateRow);
}

function buildOptimizerInputs(groupedCandidates) {
  const readyCandidates = [];
  const optimizableGroups = [];
  const preservedGroups = [];
  const candidateBySyntheticId = new Map();

  for (const group of groupedCandidates) {
    const readyRows = group.rows
      .filter((row) => row.candidate_status === 'ready_for_optimizer' && nullableString(row.product_id))
      .slice()
      .sort(compareReadyCandidatesForOptimization);
    if (readyRows.length > 0) {
      const optimizableGroup = {
        net_requirement_item_id: group.net_requirement_item_id,
        display_name: group.display_name,
        ingredient_key_snapshot: group.ingredient_key_snapshot,
        candidates: readyRows.map((row) => {
          const syntheticCanonicalProductId = buildSyntheticCandidateCanonicalProductId(row.candidate_id);
          const enriched = {
            ...row,
            synthetic_canonical_product_id: syntheticCanonicalProductId,
          };
          candidateBySyntheticId.set(syntheticCanonicalProductId, enriched);
          readyCandidates.push(enriched);
          return enriched;
        }),
      };
      optimizableGroups.push(optimizableGroup);
      continue;
    }

    preservedGroups.push(buildPreservedGroup(group));
  }

  return {
    ready_candidates: readyCandidates,
    optimizable_groups: optimizableGroups,
    preserved_groups: preservedGroups,
    candidate_by_synthetic_id: candidateBySyntheticId,
  };
}

function buildPreservedGroup(group) {
  const representative = choosePreservedRepresentative(group.rows);
  const itemStatus = mapCandidateStatusToOptimizedBasketItemStatus(representative.candidate_status);
  return {
    net_requirement_item_id: group.net_requirement_item_id,
    representative,
    item_status: itemStatus,
    candidate_statuses: [...new Set(group.rows.map((row) => row.candidate_status))].sort(),
    candidate_ids: group.rows.map((row) => row.candidate_id).filter(Boolean).sort(),
  };
}

function buildSyntheticBasketPlan(optimizableGroups) {
  const readyItems = [];
  const ambiguousItems = [];

  for (const group of optimizableGroups || []) {
    if ((group.candidates || []).length === 1) {
      readyItems.push(buildSyntheticReadyItem(group.candidates[0], group.display_name));
      continue;
    }

    ambiguousItems.push({
      input_text: group.display_name,
      normalized_query: group.ingredient_key_snapshot || normalizeText(group.display_name),
      confidence: roundConfidence(Math.max(
        ...group.candidates.map((candidate) => Number(candidate.candidate_confidence || 0)),
      )),
      requested_quantity: 1,
      requested_markers: {
        plan2c_requirement: true,
      },
      candidates: group.candidates.map(buildSyntheticCandidateDescriptor),
      carried_candidates: group.candidates.map(buildSyntheticCandidateDescriptor),
    });
  }

  return {
    layer_mode: 'plan2c_meal_plan_product_candidates',
    optimization_ready: true,
    requires_user_confirmation: false,
    ready_items: readyItems,
    ambiguous_items: ambiguousItems,
    unresolved_items: [],
    summary: {
      total_items: readyItems.length + ambiguousItems.length,
      ready_count: readyItems.length,
      ambiguous_count: ambiguousItems.length,
      unresolved_count: 0,
    },
  };
}

function buildSyntheticReadyItem(candidate, displayName) {
  return {
    canonical_product_id: candidate.synthetic_canonical_product_id,
    canonical_name: candidate.product_name_snapshot || displayName,
    quantity: 1,
    requested_quantity: 1,
    requested_markers: {
      plan2c_requirement: true,
      required_quantity_grams: nullableNumber(candidate.required_quantity_grams),
      units_needed: positiveInteger(candidate.units_needed, 1),
    },
    markers: {
      shopping_unit: nullableString(candidate.shopping_unit),
    },
    input_text: displayName,
    source_status: 'plan2b_ready_for_optimizer',
    source_confidence: nullableNumber(candidate.candidate_confidence),
    score: nullableNumber(candidate.candidate_confidence),
    match_reasons: [candidate.selection_reason_json || {}],
  };
}

function buildSyntheticCandidateDescriptor(candidate) {
  return {
    canonical_product_id: candidate.synthetic_canonical_product_id,
    canonical_name: candidate.product_name_snapshot || candidate.display_name,
    score: nullableNumber(candidate.candidate_confidence),
    match_reasons: [candidate.selection_reason_json || {}],
  };
}

async function buildSyntheticPriceLookup({
  adapter,
  store,
  readyCandidates,
}) {
  const realCanonicalProductIds = [...new Set(
    (readyCandidates || [])
      .map((candidate) => nullableString(candidate.product_id))
      .filter(Boolean),
  )].sort();
  if (!realCanonicalProductIds.length) {
    return {
      price_mode: 'latest',
      currency: DEFAULT_CURRENCY,
      items: [],
      summary: {
        requested_count: 0,
        priced_count: 0,
        stale_count: 0,
        missing_count: 0,
      },
    };
  }

  const realLookup = await adapter.lookupCanonicalProductPrices({
    store,
    canonicalProductIds: realCanonicalProductIds,
    options: {},
  });
  const realLookupByCanonicalProductId = new Map(
    (realLookup.items || []).map((item) => [item.canonical_product_id, item]),
  );
  const syntheticItems = (readyCandidates || []).map((candidate) => {
    const sourceItem = realLookupByCanonicalProductId.get(candidate.product_id) || null;
    return buildSyntheticPriceLookupItem(candidate, sourceItem);
  });
  return {
    price_mode: realLookup.price_mode || 'latest',
    currency: realLookup.currency || DEFAULT_CURRENCY,
    items: syntheticItems,
    summary: summarizeSyntheticPriceLookup(syntheticItems),
    source_lookup_summary: realLookup.summary || null,
  };
}

function buildSyntheticPriceLookupItem(candidate, sourceItem) {
  const unitsNeeded = positiveInteger(candidate.units_needed, 1);
  const priceRecords = Array.isArray(sourceItem?.price_records)
    ? sourceItem.price_records.map((record) => ({
      chain_id: nullableString(record.chain_id),
      chain_name: nullableString(record.chain_name),
      store_id: nullableString(record.store_id),
      store_name: nullableString(record.store_name),
      price: roundMoney(Number(record.price || 0) * unitsNeeded),
      currency: nullableString(record.currency) || DEFAULT_CURRENCY,
      snapshot_date: nullableString(record.snapshot_date),
      is_stale: record.is_stale === true,
      source: nullableString(record.source),
    }))
    : [];
  const pricedRecords = priceRecords.filter((record) => record.is_stale !== true);
  return {
    canonical_product_id: candidate.synthetic_canonical_product_id,
    price_records: priceRecords,
    best_price: pricedRecords[0]
      ? {
        price: pricedRecords[0].price,
        chain_id: pricedRecords[0].chain_id,
        currency: pricedRecords[0].currency,
      }
      : null,
    price_status: priceRecords.length === 0
      ? 'missing'
      : pricedRecords.length > 0
        ? 'priced'
        : 'stale',
  };
}

function summarizeSyntheticPriceLookup(items) {
  return (items || []).reduce((summary, item) => {
    const next = {
      ...summary,
      requested_count: summary.requested_count + 1,
    };
    if (item.price_status === 'priced') next.priced_count += 1;
    else if (item.price_status === 'stale') next.stale_count += 1;
    else next.missing_count += 1;
    return next;
  }, {
    requested_count: 0,
    priced_count: 0,
    stale_count: 0,
    missing_count: 0,
  });
}

function selectOptimizationResult({
  singleStoreResult,
  multiStoreResult,
}) {
  const selectedStrategy = multiStoreResult?.recommended_strategy === 'multi_store'
    && multiStoreResult?.best_multi_store_option
    ? 'multi_store'
    : 'single_store';
  const selectedOption = selectedStrategy === 'multi_store'
    ? multiStoreResult?.best_multi_store_option || null
    : singleStoreResult?.best_option || null;
  return {
    selected_strategy: selectedStrategy,
    selected_option: selectedOption,
    single_store_result: singleStoreResult || null,
    multi_store_result: multiStoreResult || null,
  };
}

function buildSelectedOptimizedBasketItems({
  optimizedBasketId,
  selectedOptimization,
  candidateBySyntheticId,
}) {
  const selectedOptionItems = Array.isArray(selectedOptimization?.selected_option?.items)
    ? selectedOptimization.selected_option.items
    : [];

  return selectedOptionItems.map((optimizerItem) => {
    const candidate = candidateBySyntheticId.get(optimizerItem.canonical_product_id) || null;
    const sourceCandidateId = candidate?.candidate_id || optimizerItem.canonical_product_id;
    const unitsSelected = positiveInteger(candidate?.units_needed, null);
    const totalPrice = nullableNumber(optimizerItem.line_total);
    const derivedUnitPrice = (
      unitsSelected && totalPrice !== null
    )
      ? roundMoney(totalPrice / unitsSelected)
      : null;
    const itemStatus = optimizerItem.price_status === 'priced' ? 'selected' : 'missing_price';
    return {
      optimized_basket_item_id: buildMealPlanOptimizedBasketItemId(
        optimizedBasketId,
        requiredString(candidate?.net_requirement_item_id, 'net_requirement_item_id'),
        itemStatus,
      ),
      optimized_basket_id: optimizedBasketId,
      candidate_id: candidate?.candidate_id || null,
      net_requirement_item_id: requiredString(candidate?.net_requirement_item_id, 'net_requirement_item_id'),
      ingredient_id: nullableString(candidate?.ingredient_id),
      ingredient_key_snapshot: nullableString(candidate?.ingredient_key_snapshot),
      display_name: requiredString(candidate?.display_name || optimizerItem.input_text, 'display_name'),
      product_id: nullableString(candidate?.product_id),
      product_name_snapshot: nullableString(candidate?.product_name_snapshot || optimizerItem.canonical_name),
      brand: nullableString(candidate?.brand),
      chain_id: nullableString(optimizerItem.chain_id),
      store_id: nullableString(optimizerItem.store_id),
      price_id: nullableString(optimizerItem.source),
      units_selected: unitsSelected,
      total_purchased_grams: nullableNumber(candidate?.total_purchased_grams),
      required_quantity_grams: nullableNumber(candidate?.required_quantity_grams),
      overage_grams: nullableNumber(candidate?.overage_grams),
      unit_price: itemStatus === 'selected' ? derivedUnitPrice : null,
      total_price: itemStatus === 'selected' ? totalPrice : null,
      currency: nullableString(optimizerItem.currency) || DEFAULT_CURRENCY,
      selection_reason_json: {
        item_status: itemStatus,
        selected_strategy: selectedOptimization.selected_strategy,
        optimizer_item_type: nullableString(optimizerItem.type),
        optimizer_selection_reason: nullableString(optimizerItem.selection_reason),
        optimizer_warnings: optimizerItem.warnings || [],
        source_candidate_status: nullableString(candidate?.candidate_status),
        source_candidate_reason: candidate?.selection_reason_json || {},
      },
      item_status: itemStatus,
    };
  });
}

function buildPreservedOptimizedBasketItems({
  optimizedBasketId,
  preservedGroups,
}) {
  return (preservedGroups || []).map((group) => {
    const candidate = group.representative;
    return {
      optimized_basket_item_id: buildMealPlanOptimizedBasketItemId(
        optimizedBasketId,
        requiredString(candidate.net_requirement_item_id, 'net_requirement_item_id'),
        group.item_status,
      ),
      optimized_basket_id: optimizedBasketId,
      candidate_id: nullableString(candidate.candidate_id),
      net_requirement_item_id: requiredString(candidate.net_requirement_item_id, 'net_requirement_item_id'),
      ingredient_id: nullableString(candidate.ingredient_id),
      ingredient_key_snapshot: nullableString(candidate.ingredient_key_snapshot),
      display_name: requiredString(candidate.display_name, 'display_name'),
      product_id: nullableString(candidate.product_id),
      product_name_snapshot: nullableString(candidate.product_name_snapshot),
      brand: nullableString(candidate.brand),
      chain_id: null,
      store_id: null,
      price_id: null,
      units_selected: null,
      total_purchased_grams: nullableNumber(candidate.total_purchased_grams),
      required_quantity_grams: nullableNumber(candidate.required_quantity_grams),
      overage_grams: nullableNumber(candidate.overage_grams),
      unit_price: null,
      total_price: null,
      currency: nullableString(candidate.currency) || DEFAULT_CURRENCY,
      selection_reason_json: {
        item_status: group.item_status,
        source_candidate_statuses: group.candidate_statuses,
        source_candidate_ids: group.candidate_ids,
        source_candidate_reason: candidate.selection_reason_json || {},
      },
      item_status: group.item_status,
    };
  });
}

function buildOptimizedBasketRecord({
  candidateSet,
  selectedOptimization,
  syntheticBasketPlan,
  syntheticPriceLookup,
  optimizerInputs,
  optimizedBasketItems,
}) {
  const optimizerRunKey = buildMealPlanOptimizerRunKey(
    candidateSet.candidate_set_id,
    MEAL_PLAN_BASKET_OPTIMIZER_VERSION,
    MEAL_PLAN_BASKET_OPTIMIZER_RULES_VERSION,
  );
  const optimizedBasketId = buildMealPlanOptimizedBasketId(optimizerRunKey);
  const selectedOption = selectedOptimization.selected_option || null;
  const totalEstimatedPrice = selectedOption
    ? roundMoney(selectedOption.actual_total || 0)
    : 0;
  const currency = nullableString(selectedOption?.currency)
    || nullableString(syntheticPriceLookup?.currency)
    || DEFAULT_CURRENCY;
  const coveredRequirementCount = optimizedBasketItems
    .filter((item) => item.item_status === 'selected' || item.item_status === 'covered_by_inventory')
    .length;
  const missingRequirementCount = optimizedBasketItems.length - coveredRequirementCount;

  return {
    optimized_basket_id: optimizedBasketId,
    candidate_set_id: candidateSet.candidate_set_id,
    net_requirement_id: candidateSet.net_requirement_id,
    plan_id: candidateSet.plan_id,
    profile_id: candidateSet.profile_id,
    user_id: candidateSet.user_id,
    optimizer_run_key: optimizerRunKey,
    optimizer_version: MEAL_PLAN_BASKET_OPTIMIZER_VERSION,
    total_estimated_price: totalEstimatedPrice,
    currency,
    selected_chain_id: selectedOptimization.selected_strategy === 'single_store'
      ? nullableString(selectedOption?.chain_id)
      : null,
    selected_store_id: selectedOptimization.selected_strategy === 'single_store'
      ? nullableString(selectedOption?.store_id)
      : null,
    item_count: optimizedBasketItems.length,
    covered_requirement_count: coveredRequirementCount,
    missing_requirement_count: missingRequirementCount,
    optimizer_summary_json: {
      selected_strategy: selectedOptimization.selected_strategy,
      basket_plan_summary: syntheticBasketPlan.summary,
      price_lookup_summary: syntheticPriceLookup.summary,
      ready_candidate_count: optimizerInputs.ready_candidates.length,
      preserved_group_count: optimizerInputs.preserved_groups.length,
      single_store_result: selectedOptimization.single_store_result,
      multi_store_result: selectedOptimization.multi_store_result,
      final_item_status_counts: summarizeOptimizedBasketItemStatuses(optimizedBasketItems),
    },
    generation_method: MEAL_PLAN_BASKET_OPTIMIZER_GENERATION_METHOD,
    rules_version: MEAL_PLAN_BASKET_OPTIMIZER_RULES_VERSION,
  };
}

function buildOptimizationReport({
  dryRun,
  candidateSet,
  candidateRows,
  optimizerInputs,
  selectedOptimization,
  optimizedBasket,
  optimizedBasketItems,
}) {
  const statusCounts = summarizeOptimizedBasketItemStatuses(optimizedBasketItems);
  return {
    dry_run: dryRun,
    candidate_set: candidateSet,
    optimized_basket: optimizedBasket,
    candidate_sets_seen: 1,
    ready_candidates: optimizerInputs.ready_candidates.length,
    covered_by_inventory: statusCounts.covered_by_inventory || 0,
    missing_product: statusCounts.missing_product || 0,
    missing_price: statusCounts.missing_price || 0,
    optimizer_excluded: statusCounts.optimizer_excluded || 0,
    needs_review: statusCounts.needs_review || 0,
    optimized_baskets_created: 1,
    selected_items: statusCounts.selected || 0,
    total_estimated_price: optimizedBasket.total_estimated_price,
    currency: optimizedBasket.currency,
    candidate_count: candidateRows.length,
    selected_strategy: selectedOptimization.selected_strategy,
    items: optimizedBasketItems,
    errors: [],
  };
}

async function persistMealPlanOptimizedBasket(client, {
  optimizedBasket,
  optimizedBasketItems,
}) {
  await client.query('BEGIN');
  try {
    const storedBasket = await upsertMealPlanOptimizedBasket(client, optimizedBasket);
    await client.query(
      'DELETE FROM meal_plan_optimized_basket_items WHERE optimized_basket_id = $1',
      [storedBasket.optimized_basket_id],
    );
    for (const item of optimizedBasketItems) {
      await insertMealPlanOptimizedBasketItem(client, {
        ...item,
        optimized_basket_id: storedBasket.optimized_basket_id,
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function upsertMealPlanOptimizedBasket(client, optimizedBasket) {
  const result = await client.query(`
    INSERT INTO meal_plan_optimized_baskets (
      optimized_basket_id,
      candidate_set_id,
      net_requirement_id,
      plan_id,
      profile_id,
      user_id,
      optimizer_run_key,
      optimizer_version,
      total_estimated_price,
      currency,
      selected_chain_id,
      selected_store_id,
      item_count,
      covered_requirement_count,
      missing_requirement_count,
      optimizer_summary_json,
      generation_method,
      rules_version
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18
    )
    ON CONFLICT (optimizer_run_key) DO UPDATE SET
      candidate_set_id = EXCLUDED.candidate_set_id,
      net_requirement_id = EXCLUDED.net_requirement_id,
      plan_id = EXCLUDED.plan_id,
      profile_id = EXCLUDED.profile_id,
      user_id = EXCLUDED.user_id,
      optimizer_version = EXCLUDED.optimizer_version,
      total_estimated_price = EXCLUDED.total_estimated_price,
      currency = EXCLUDED.currency,
      selected_chain_id = EXCLUDED.selected_chain_id,
      selected_store_id = EXCLUDED.selected_store_id,
      item_count = EXCLUDED.item_count,
      covered_requirement_count = EXCLUDED.covered_requirement_count,
      missing_requirement_count = EXCLUDED.missing_requirement_count,
      optimizer_summary_json = EXCLUDED.optimizer_summary_json,
      generation_method = EXCLUDED.generation_method,
      rules_version = EXCLUDED.rules_version,
      updated_at = NOW()
    RETURNING *
  `, [
    optimizedBasket.optimized_basket_id,
    optimizedBasket.candidate_set_id,
    optimizedBasket.net_requirement_id,
    optimizedBasket.plan_id,
    optimizedBasket.profile_id,
    optimizedBasket.user_id,
    optimizedBasket.optimizer_run_key,
    optimizedBasket.optimizer_version,
    optimizedBasket.total_estimated_price,
    optimizedBasket.currency,
    optimizedBasket.selected_chain_id,
    optimizedBasket.selected_store_id,
    optimizedBasket.item_count,
    optimizedBasket.covered_requirement_count,
    optimizedBasket.missing_requirement_count,
    JSON.stringify(optimizedBasket.optimizer_summary_json || {}),
    optimizedBasket.generation_method,
    optimizedBasket.rules_version,
  ]);
  return hydrateMealPlanOptimizedBasketRow(result.rows[0]);
}

async function insertMealPlanOptimizedBasketItem(client, item) {
  const result = await client.query(`
    INSERT INTO meal_plan_optimized_basket_items (
      optimized_basket_item_id,
      optimized_basket_id,
      candidate_id,
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
      units_selected,
      total_purchased_grams,
      required_quantity_grams,
      overage_grams,
      unit_price,
      total_price,
      currency,
      selection_reason_json,
      item_status
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb, $22
    )
    RETURNING *
  `, [
    item.optimized_basket_item_id,
    item.optimized_basket_id,
    item.candidate_id,
    item.net_requirement_item_id,
    item.ingredient_id,
    item.ingredient_key_snapshot,
    item.display_name,
    item.product_id,
    item.product_name_snapshot,
    item.brand,
    item.chain_id,
    item.store_id,
    item.price_id,
    item.units_selected,
    item.total_purchased_grams,
    item.required_quantity_grams,
    item.overage_grams,
    item.unit_price,
    item.total_price,
    item.currency,
    JSON.stringify(item.selection_reason_json || {}),
    item.item_status,
  ]);
  return hydrateMealPlanOptimizedBasketItemRow(result.rows[0]);
}

function hydrateMealPlanProductCandidateRow(row) {
  if (!row) return null;
  return {
    ...row,
    selection_reason_json: parseJson(row.selection_reason_json, {}),
  };
}

function hydrateMealPlanOptimizedBasketRow(row) {
  if (!row) return null;
  return {
    ...row,
    optimizer_summary_json: parseJson(row.optimizer_summary_json, {}),
  };
}

function hydrateMealPlanOptimizedBasketItemRow(row) {
  if (!row) return null;
  return {
    ...row,
    selection_reason_json: parseJson(row.selection_reason_json, {}),
  };
}

function buildMealPlanOptimizerRunKey(candidateSetId, optimizerVersion, rulesVersion) {
  return `meal_plan_optimizer_run:${stableHash([
    requiredString(candidateSetId, 'candidate_set_id'),
    requiredString(optimizerVersion, 'optimizer_version'),
    requiredString(rulesVersion, 'rules_version'),
  ].join('|'))}`;
}

function buildMealPlanOptimizedBasketId(optimizerRunKey) {
  return `meal_plan_optimized_basket:${stableHash(requiredString(optimizerRunKey, 'optimizer_run_key'))}`;
}

function buildMealPlanOptimizedBasketItemId(optimizedBasketId, netRequirementItemId, itemStatus) {
  return `meal_plan_optimized_basket_item:${stableHash([
    requiredString(optimizedBasketId, 'optimized_basket_id'),
    requiredString(netRequirementItemId, 'net_requirement_item_id'),
    requiredString(itemStatus, 'item_status'),
  ].join('|'))}`;
}

function buildSyntheticCandidateCanonicalProductId(candidateId) {
  return requiredString(candidateId, 'candidate_id');
}

function normalizeMealPlanBasketOptimizerOptions(options = {}) {
  const candidateSetId = nullableString(options.candidateSetId || options.candidate_set_id);
  const candidateSetKey = nullableString(options.candidateSetKey || options.candidate_set_key);
  if (!candidateSetId && !candidateSetKey) {
    throw new Error('candidate_set_id or candidate_set_key is required for PLAN2C basket optimization.');
  }
  return {
    candidate_set_id: candidateSetId,
    candidate_set_key: candidateSetKey,
    dry_run: Boolean(options.dryRun || options.dry_run),
    limit: positiveInteger(options.limit, 1000),
    store: options.store || null,
    optimizer_adapter: options.optimizerAdapter || options.optimizer_adapter || null,
    optimizer_options: options.optimizerOptions || options.optimizer_options || {},
  };
}

function normalizePlan2cOptimizerOptions(rawOptions) {
  const merged = {
    ...DEFAULT_PLAN2C_OPTIMIZER_OPTIONS,
    ...(rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {}),
    strategy: 'multi_store',
    ambiguous_policy: 'cheapest_candidate',
  };
  const normalized = normalizeOptimizerOptions(merged);
  if (normalized.error) {
    throw new Error(normalized.error.body.error);
  }
  return normalized.value;
}

function resolveOptimizerAdapter(adapter) {
  const resolved = adapter && typeof adapter === 'object'
    ? adapter
    : {
      lookupCanonicalProductPrices,
      optimizeBasketSingleStore,
      optimizeBasketMultiStore,
    };
  if (typeof resolved.lookupCanonicalProductPrices !== 'function') {
    throw new Error('optimizer adapter must provide lookupCanonicalProductPrices');
  }
  if (typeof resolved.optimizeBasketSingleStore !== 'function') {
    throw new Error('optimizer adapter must provide optimizeBasketSingleStore');
  }
  if (typeof resolved.optimizeBasketMultiStore !== 'function') {
    throw new Error('optimizer adapter must provide optimizeBasketMultiStore');
  }
  return resolved;
}

function groupCandidatesByNetRequirementItemId(candidateRows) {
  const grouped = new Map();
  for (const row of candidateRows || []) {
    const netRequirementItemId = requiredString(row.net_requirement_item_id, 'net_requirement_item_id');
    const current = grouped.get(netRequirementItemId) || {
      net_requirement_item_id: netRequirementItemId,
      display_name: row.display_name,
      ingredient_key_snapshot: row.ingredient_key_snapshot,
      rows: [],
    };
    current.rows.push(row);
    grouped.set(netRequirementItemId, current);
  }
  return [...grouped.values()].map((group) => ({
    ...group,
    rows: group.rows.slice().sort(compareCandidateRows),
  })).sort((left, right) => String(left.display_name || '').localeCompare(String(right.display_name || '')));
}

function choosePreservedRepresentative(rows) {
  return rows.slice().sort(comparePreservedCandidateRows)[0];
}

function compareCandidateRows(left, right) {
  return String(left.display_name || '').localeCompare(String(right.display_name || ''))
    || compareCandidateStatusPriority(left.candidate_status, right.candidate_status)
    || compareNumberDescending(left.candidate_confidence, right.candidate_confidence)
    || compareNumberDescending(left.mapping_confidence, right.mapping_confidence)
    || compareNumberAscending(left.total_estimated_price, right.total_estimated_price)
    || String(left.product_id || '').localeCompare(String(right.product_id || ''))
    || String(left.candidate_id || '').localeCompare(String(right.candidate_id || ''));
}

function compareReadyCandidatesForOptimization(left, right) {
  return compareNumberAscending(left.total_estimated_price, right.total_estimated_price)
    || compareNumberDescending(left.candidate_confidence, right.candidate_confidence)
    || compareNumberDescending(left.mapping_confidence, right.mapping_confidence)
    || String(left.product_id || '').localeCompare(String(right.product_id || ''))
    || String(left.candidate_id || '').localeCompare(String(right.candidate_id || ''));
}

function comparePreservedCandidateRows(left, right) {
  return comparePreservedStatusPriority(left.candidate_status, right.candidate_status)
    || compareNumberDescending(left.candidate_confidence, right.candidate_confidence)
    || compareNumberDescending(left.mapping_confidence, right.mapping_confidence)
    || String(left.product_id || '').localeCompare(String(right.product_id || ''))
    || String(left.candidate_id || '').localeCompare(String(right.candidate_id || ''));
}

function compareCandidateStatusPriority(left, right) {
  const order = [
    'ready_for_optimizer',
    'covered_by_inventory',
    'missing_product_mapping',
    'missing_price',
    'missing_product_size',
    'needs_review',
  ];
  return order.indexOf(String(left || '')) - order.indexOf(String(right || ''));
}

function comparePreservedStatusPriority(left, right) {
  const order = [
    'covered_by_inventory',
    'missing_product_mapping',
    'missing_price',
    'missing_product_size',
    'needs_review',
  ];
  return order.indexOf(String(left || '')) - order.indexOf(String(right || ''));
}

function mapCandidateStatusToOptimizedBasketItemStatus(candidateStatus) {
  switch (candidateStatus) {
    case 'covered_by_inventory':
      return 'covered_by_inventory';
    case 'missing_product_mapping':
      return 'missing_product';
    case 'missing_price':
      return 'missing_price';
    case 'missing_product_size':
      return 'optimizer_excluded';
    default:
      return 'needs_review';
  }
}

function summarizeOptimizedBasketItemStatuses(items) {
  return (items || []).reduce((counts, item) => {
    const key = item.item_status;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {
    selected: 0,
    covered_by_inventory: 0,
    missing_product: 0,
    missing_price: 0,
    optimizer_excluded: 0,
    needs_review: 0,
  });
}

function compareOptimizedBasketItems(left, right) {
  return String(left.display_name || '').localeCompare(String(right.display_name || ''))
    || comparePreservedStatusPriority(left.item_status, right.item_status)
    || String(left.candidate_id || '').localeCompare(String(right.candidate_id || ''))
    || String(left.optimized_basket_item_id || '').localeCompare(String(right.optimized_basket_item_id || ''));
}

function compareNumberAscending(left, right) {
  const leftNumber = Number.isFinite(Number(left)) ? Number(left) : Number.POSITIVE_INFINITY;
  const rightNumber = Number.isFinite(Number(right)) ? Number(right) : Number.POSITIVE_INFINITY;
  return leftNumber - rightNumber;
}

function compareNumberDescending(left, right) {
  const leftNumber = Number.isFinite(Number(left)) ? Number(left) : Number.NEGATIVE_INFINITY;
  const rightNumber = Number.isFinite(Number(right)) ? Number(right) : Number.NEGATIVE_INFINITY;
  return rightNumber - leftNumber;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function roundConfidence(value) {
  if (!Number.isFinite(Number(value))) return null;
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
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
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  return fallback;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
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

function requiredString(value, fieldName) {
  const normalized = nullableString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
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
  MEAL_PLAN_BASKET_OPTIMIZER_GENERATION_METHOD,
  MEAL_PLAN_BASKET_OPTIMIZER_RULES_VERSION,
  MEAL_PLAN_BASKET_OPTIMIZER_VERSION,
  SUPPORTED_MEAL_PLAN_OPTIMIZED_BASKET_ITEM_STATUSES,
  buildMealPlanOptimizedBasketId,
  buildMealPlanOptimizedBasketItemId,
  buildMealPlanOptimizerRunKey,
  buildSyntheticBasketPlan,
  buildSyntheticPriceLookup,
  hydrateMealPlanOptimizedBasketItemRow,
  hydrateMealPlanOptimizedBasketRow,
  normalizeMealPlanBasketOptimizerOptions,
  optimizeMealPlanBasket,
};
