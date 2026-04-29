const crypto = require('node:crypto');

const MEAL_PLAN_REQUIREMENTS_GENERATION_METHOD = 'plan2a_meal_plan_requirements_builder_v1';
const MEAL_PLAN_REQUIREMENTS_RULES_VERSION = 'plan2a_meal_plan_requirements_rules_v1';
const SUPPORTED_MEAL_PLAN_REQUIREMENT_ADAPTER_STATUSES = Object.freeze([
  'ready_for_product_mapping',
  'missing_ingredient',
  'missing_quantity',
  'needs_review',
]);

async function buildMealPlanRequirements(client, options = {}) {
  requireClient(client);
  const normalized = normalizeMealPlanRequirementOptions(options);
  const plan = await getMealPlan(client, normalized);
  if (!plan) {
    throw new Error('Meal plan not found for PLAN2A meal-plan requirement building.');
  }

  const mealPlanItems = await listMealPlanItems(client, plan.plan_id);
  const recipeIds = [...new Set(mealPlanItems.map((row) => row.recipe_id).filter(Boolean))];
  const recipeIngredients = recipeIds.length > 0
    ? await listRecipeIngredients(client, recipeIds)
    : [];
  const requirementKey = buildMealPlanRequirementKey(
    plan.plan_id,
    MEAL_PLAN_REQUIREMENTS_RULES_VERSION,
  );
  const requirement = {
    requirement_id: buildMealPlanRequirementId(requirementKey),
    plan_id: plan.plan_id,
    profile_id: plan.profile_id,
    user_id: plan.user_id,
    requirement_key: requirementKey,
    generation_method: MEAL_PLAN_REQUIREMENTS_GENERATION_METHOD,
    rules_version: MEAL_PLAN_REQUIREMENTS_RULES_VERSION,
  };
  const requirementItems = aggregateMealPlanRequirementItems({
    requirement,
    mealPlanItems,
    recipeIngredients,
  });
  const summary = summarizeMealPlanRequirementItems(requirementItems);
  const report = {
    dry_run: normalized.dry_run,
    plan,
    requirement,
    plans_seen: 1,
    requirements_created: 1,
    items_created: requirementItems.length,
    ready_for_product_mapping: summary.ready_for_product_mapping,
    missing_ingredient: summary.missing_ingredient,
    missing_quantity: summary.missing_quantity,
    needs_review: summary.needs_review,
    total_quantity_grams: summary.total_quantity_grams,
    items: requirementItems,
    errors: [],
  };

  if (normalized.dry_run) {
    return report;
  }

  await persistMealPlanRequirements(client, {
    requirement,
    items: requirementItems,
  });
  return report;
}

async function getMealPlan(client, options = {}) {
  const planId = nullableString(options.plan_id || options.planId);
  const planKey = nullableString(options.plan_key || options.planKey);
  if (planId) {
    const result = await client.query(
      'SELECT * FROM meal_plans WHERE plan_id = $1',
      [planId],
    );
    return result.rows[0] || null;
  }
  const result = await client.query(
    'SELECT * FROM meal_plans WHERE plan_key = $1',
    [requiredString(planKey, 'plan_key')],
  );
  return result.rows[0] || null;
}

async function listMealPlanItems(client, planId) {
  const result = await client.query(`
    SELECT *
    FROM meal_plan_items
    WHERE plan_id = $1
    ORDER BY day_index ASC, meal_type ASC, item_id ASC
  `, [requiredString(planId, 'plan_id')]);
  return result.rows || [];
}

async function listRecipeIngredients(client, recipeIds) {
  const result = await client.query(`
    SELECT
      ri.recipe_ingredient_id,
      ri.recipe_id,
      ri.ingredient_id,
      ri.matched_ingredient_id,
      ri.ingredient_key_snapshot,
      ri.display_name,
      ri.quantity_grams,
      i.shopping_unit,
      i.grams_per_piece
    FROM recipe_ingredients ri
    LEFT JOIN ingredients i
      ON i.ingredient_id = COALESCE(ri.matched_ingredient_id, ri.ingredient_id)
    WHERE ri.recipe_id = ANY($1::text[])
    ORDER BY ri.recipe_id ASC, ri.sort_order ASC, ri.recipe_ingredient_id ASC
  `, [recipeIds]);
  return (result.rows || []).map((row) => ({
    recipe_ingredient_id: row.recipe_ingredient_id,
    recipe_id: row.recipe_id,
    ingredient_id: nullableString(row.ingredient_id),
    matched_ingredient_id: nullableString(row.matched_ingredient_id),
    ingredient_key_snapshot: nullableString(row.ingredient_key_snapshot),
    display_name: nullableString(row.display_name),
    quantity_grams: nullableNumber(row.quantity_grams),
    shopping_unit: nullableString(row.shopping_unit),
    grams_per_piece: nullableNumber(row.grams_per_piece),
  }));
}

function aggregateMealPlanRequirementItems({
  requirement,
  mealPlanItems,
  recipeIngredients,
}) {
  const requirementId = requiredString(requirement.requirement_id, 'requirement_id');
  const occurrencesByRecipeId = new Map();
  for (const mealPlanItem of mealPlanItems || []) {
    const recipeId = nullableString(mealPlanItem.recipe_id);
    if (!recipeId) continue;
    occurrencesByRecipeId.set(recipeId, (occurrencesByRecipeId.get(recipeId) || 0) + 1);
  }

  const aggregates = new Map();
  for (const recipeIngredient of recipeIngredients || []) {
    const recipeId = nullableString(recipeIngredient.recipe_id);
    const occurrenceCount = recipeId ? occurrencesByRecipeId.get(recipeId) || 0 : 0;
    if (!recipeId || occurrenceCount <= 0) {
      continue;
    }

    // Canonical ingredient links win; unmatched recipe lines fall back to a normalized key bucket.
    const effectiveIngredientId = nullableString(
      recipeIngredient.matched_ingredient_id || recipeIngredient.ingredient_id,
    );
    const aggregateKey = effectiveIngredientId
      ? `ingredient:${effectiveIngredientId}`
      : `unmatched:${normalizeRequirementGroupKey(recipeIngredient)}`;
    const existing = aggregates.get(aggregateKey) || createRequirementAggregateSeed({
      aggregateKey,
      effectiveIngredientId,
      recipeIngredient,
    });
    mergeRequirementAggregate(existing, recipeIngredient, occurrenceCount);
    aggregates.set(aggregateKey, existing);
  }

  return [...aggregates.values()]
    .map((aggregate) => finalizeRequirementAggregate({
      requirementId,
      aggregate,
    }))
    .sort(compareRequirementItems);
}

function createRequirementAggregateSeed({
  aggregateKey,
  effectiveIngredientId,
  recipeIngredient,
}) {
  return {
    aggregate_key: aggregateKey,
    ingredient_id: effectiveIngredientId,
    ingredient_key_snapshot: nullableString(recipeIngredient.ingredient_key_snapshot),
    display_name: (
      nullableString(recipeIngredient.display_name)
      || humanizeNormalizedKey(recipeIngredient.ingredient_key_snapshot)
      || 'ingredient'
    ),
    shopping_unit: nullableString(recipeIngredient.shopping_unit),
    grams_per_piece: nullableNumber(recipeIngredient.grams_per_piece),
    source_recipe_ids: new Set(),
    source_recipe_ingredient_ids: new Set(),
    recipe_occurrences_by_id: new Map(),
    source_line_count: 0,
    quantity_line_count: 0,
    total_quantity_grams: 0,
  };
}

function mergeRequirementAggregate(aggregate, recipeIngredient, occurrenceCount) {
  aggregate.source_line_count += 1;
  aggregate.source_recipe_ids.add(recipeIngredient.recipe_id);
  aggregate.source_recipe_ingredient_ids.add(recipeIngredient.recipe_ingredient_id);
  aggregate.recipe_occurrences_by_id.set(recipeIngredient.recipe_id, occurrenceCount);

  if (!aggregate.ingredient_key_snapshot && recipeIngredient.ingredient_key_snapshot) {
    aggregate.ingredient_key_snapshot = nullableString(recipeIngredient.ingredient_key_snapshot);
  }
  if (!aggregate.shopping_unit && recipeIngredient.shopping_unit) {
    aggregate.shopping_unit = nullableString(recipeIngredient.shopping_unit);
  }
  if (!aggregate.grams_per_piece && recipeIngredient.grams_per_piece) {
    aggregate.grams_per_piece = nullableNumber(recipeIngredient.grams_per_piece);
  }

  const quantityGrams = nullableNumber(recipeIngredient.quantity_grams);
  if (quantityGrams !== null) {
    aggregate.quantity_line_count += 1;
    aggregate.total_quantity_grams = roundNumber(
      aggregate.total_quantity_grams + (quantityGrams * occurrenceCount),
    );
  }
}

function finalizeRequirementAggregate({
  requirementId,
  aggregate,
}) {
  const totalQuantityGrams = aggregate.quantity_line_count > 0
    ? roundNumber(aggregate.total_quantity_grams)
    : null;
  const hasCanonicalIngredient = Boolean(aggregate.ingredient_id);
  const hasCompleteQuantityGrams = (
    aggregate.source_line_count > 0
    && aggregate.quantity_line_count === aggregate.source_line_count
  );
  const shoppingEstimate = estimateShoppingQuantity({
    total_quantity_grams: totalQuantityGrams,
    shopping_unit: aggregate.shopping_unit,
    grams_per_piece: aggregate.grams_per_piece,
  });
  // Partial gram coverage stays visible for later review instead of being silently promoted as ready.
  const adapterStatus = determineAdapterStatus({
    has_canonical_ingredient: hasCanonicalIngredient,
    total_quantity_grams: totalQuantityGrams,
    has_complete_quantity_grams: hasCompleteQuantityGrams,
  });
  const recipeCount = [...aggregate.recipe_occurrences_by_id.values()]
    .reduce((sum, value) => sum + Number(value || 0), 0);
  return {
    requirement_item_id: buildMealPlanRequirementItemId(
      requirementId,
      aggregate.aggregate_key,
    ),
    requirement_id: requirementId,
    ingredient_id: aggregate.ingredient_id,
    ingredient_key_snapshot: aggregate.ingredient_key_snapshot,
    display_name: aggregate.display_name,
    total_quantity_grams: totalQuantityGrams,
    recipe_count: recipeCount,
    source_recipe_ids_json: [...aggregate.source_recipe_ids].sort(),
    source_recipe_ingredient_ids_json: [...aggregate.source_recipe_ingredient_ids].sort(),
    shopping_unit: aggregate.shopping_unit,
    estimated_shopping_quantity: shoppingEstimate.estimated_shopping_quantity,
    estimated_shopping_unit: shoppingEstimate.estimated_shopping_unit,
    has_canonical_ingredient: hasCanonicalIngredient,
    has_quantity_grams: hasCompleteQuantityGrams,
    adapter_status: adapterStatus,
  };
}

function estimateShoppingQuantity({
  total_quantity_grams,
  shopping_unit,
  grams_per_piece,
}) {
  const grams = nullableNumber(total_quantity_grams);
  if (grams === null || grams <= 0) {
    return {
      estimated_shopping_quantity: null,
      estimated_shopping_unit: nullableString(shopping_unit),
    };
  }

  const unit = normalizeUnit(shopping_unit);
  if (unit === 'kg') {
    return {
      estimated_shopping_quantity: roundNumber(grams / 1000),
      estimated_shopping_unit: 'kg',
    };
  }
  if (unit === 'g') {
    return {
      estimated_shopping_quantity: roundNumber(grams),
      estimated_shopping_unit: 'g',
    };
  }
  if (unit === 'piece' && nullableNumber(grams_per_piece)) {
    return {
      estimated_shopping_quantity: roundNumber(grams / grams_per_piece),
      estimated_shopping_unit: 'piece',
    };
  }
  return {
    estimated_shopping_quantity: roundNumber(grams),
    estimated_shopping_unit: 'g',
  };
}

function determineAdapterStatus({
  has_canonical_ingredient,
  total_quantity_grams,
  has_complete_quantity_grams,
}) {
  if (!has_canonical_ingredient) {
    return 'missing_ingredient';
  }
  if (nullableNumber(total_quantity_grams) === null) {
    return 'missing_quantity';
  }
  if (has_complete_quantity_grams) {
    return 'ready_for_product_mapping';
  }
  return 'needs_review';
}

function summarizeMealPlanRequirementItems(items = []) {
  return items.reduce((summary, item) => {
    const status = item.adapter_status;
    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    }
    summary.total_quantity_grams = roundNumber(
      summary.total_quantity_grams + Number(item.total_quantity_grams || 0),
    );
    return summary;
  }, {
    ready_for_product_mapping: 0,
    missing_ingredient: 0,
    missing_quantity: 0,
    needs_review: 0,
    total_quantity_grams: 0,
  });
}

async function persistMealPlanRequirements(client, {
  requirement,
  items,
}) {
  await client.query('BEGIN');
  try {
    const storedRequirement = await upsertMealPlanRequirement(client, requirement);
    await client.query(
      'DELETE FROM meal_plan_requirement_items WHERE requirement_id = $1',
      [storedRequirement.requirement_id],
    );
    for (const item of items) {
      await insertMealPlanRequirementItem(client, {
        ...item,
        requirement_id: storedRequirement.requirement_id,
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function upsertMealPlanRequirement(client, requirement) {
  const result = await client.query(`
    INSERT INTO meal_plan_requirements (
      requirement_id,
      plan_id,
      profile_id,
      user_id,
      requirement_key,
      generation_method,
      rules_version
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (requirement_key) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      profile_id = EXCLUDED.profile_id,
      user_id = EXCLUDED.user_id,
      generation_method = EXCLUDED.generation_method,
      rules_version = EXCLUDED.rules_version,
      updated_at = NOW()
    RETURNING *
  `, [
    requirement.requirement_id,
    requirement.plan_id,
    requirement.profile_id,
    requirement.user_id,
    requirement.requirement_key,
    requirement.generation_method,
    requirement.rules_version,
  ]);
  return result.rows[0];
}

async function insertMealPlanRequirementItem(client, item) {
  const result = await client.query(`
    INSERT INTO meal_plan_requirement_items (
      requirement_item_id,
      requirement_id,
      ingredient_id,
      ingredient_key_snapshot,
      display_name,
      total_quantity_grams,
      recipe_count,
      source_recipe_ids_json,
      source_recipe_ingredient_ids_json,
      shopping_unit,
      estimated_shopping_quantity,
      estimated_shopping_unit,
      has_canonical_ingredient,
      has_quantity_grams,
      adapter_status
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8::jsonb, $9::jsonb, $10, $11, $12,
      $13, $14, $15
    )
    RETURNING *
  `, [
    item.requirement_item_id,
    item.requirement_id,
    item.ingredient_id,
    item.ingredient_key_snapshot,
    item.display_name,
    item.total_quantity_grams,
    item.recipe_count,
    JSON.stringify(item.source_recipe_ids_json || []),
    JSON.stringify(item.source_recipe_ingredient_ids_json || []),
    item.shopping_unit,
    item.estimated_shopping_quantity,
    item.estimated_shopping_unit,
    item.has_canonical_ingredient,
    item.has_quantity_grams,
    item.adapter_status,
  ]);
  return hydrateRequirementItemRow(result.rows[0]);
}

function hydrateRequirementItemRow(row) {
  if (!row) return null;
  return {
    ...row,
    source_recipe_ids_json: parseJson(row.source_recipe_ids_json, []),
    source_recipe_ingredient_ids_json: parseJson(row.source_recipe_ingredient_ids_json, []),
  };
}

function buildMealPlanRequirementKey(planId, rulesVersion) {
  return `meal_plan_requirement:${stableHash([
    requiredString(planId, 'plan_id'),
    requiredString(rulesVersion, 'rules_version'),
  ].join('|'))}`;
}

function buildMealPlanRequirementId(requirementKey) {
  return `meal_plan_requirement:${stableHash(requiredString(requirementKey, 'requirement_key'))}`;
}

function buildMealPlanRequirementItemId(requirementId, aggregateKey) {
  return `meal_plan_requirement_item:${stableHash([
    requiredString(requirementId, 'requirement_id'),
    requiredString(aggregateKey, 'aggregate_key'),
  ].join('|'))}`;
}

function normalizeMealPlanRequirementOptions(options = {}) {
  const planId = nullableString(options.planId || options.plan_id);
  const planKey = nullableString(options.planKey || options.plan_key);
  if (!planId && !planKey) {
    throw new Error('plan_id or plan_key is required for PLAN2A meal-plan requirements.');
  }
  return {
    plan_id: planId,
    plan_key: planKey,
    dry_run: Boolean(options.dryRun || options.dry_run),
  };
}

function normalizeRequirementGroupKey(recipeIngredient = {}) {
  return normalizeName(
    recipeIngredient.ingredient_key_snapshot
    || recipeIngredient.display_name
    || recipeIngredient.recipe_ingredient_id
    || 'ingredient',
  );
}

function compareRequirementItems(left, right) {
  return String(left.ingredient_key_snapshot || '')
    .localeCompare(String(right.ingredient_key_snapshot || ''))
    || String(left.display_name || '').localeCompare(String(right.display_name || ''))
    || String(left.requirement_item_id || '').localeCompare(String(right.requirement_item_id || ''));
}

function normalizeUnit(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}0-9]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function humanizeNormalizedKey(value) {
  const normalized = nullableString(value);
  return normalized ? normalized.replace(/_/g, ' ') : null;
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

function stableHash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16);
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  MEAL_PLAN_REQUIREMENTS_GENERATION_METHOD,
  MEAL_PLAN_REQUIREMENTS_RULES_VERSION,
  SUPPORTED_MEAL_PLAN_REQUIREMENT_ADAPTER_STATUSES,
  aggregateMealPlanRequirementItems,
  buildMealPlanRequirementId,
  buildMealPlanRequirementItemId,
  buildMealPlanRequirementKey,
  buildMealPlanRequirements,
  determineAdapterStatus,
  estimateShoppingQuantity,
  hydrateRequirementItemRow,
  normalizeMealPlanRequirementOptions,
  summarizeMealPlanRequirementItems,
};
