const crypto = require('node:crypto');

const { estimateShoppingQuantity } = require('./meal_plan_requirements_builder');

const MEAL_PLAN_NET_REQUIREMENTS_GENERATION_METHOD = 'plan2a1_meal_plan_net_requirements_builder_v1';
const MEAL_PLAN_NET_REQUIREMENTS_RULES_VERSION = 'plan2a1_meal_plan_net_requirements_rules_v1';
const SUPPORTED_MEAL_PLAN_NET_INVENTORY_STATUSES = Object.freeze([
  'no_inventory',
  'partially_covered',
  'fully_covered',
  'missing_ingredient',
  'missing_quantity',
  'needs_review',
]);
const SUPPORTED_MEAL_PLAN_NET_REQUIREMENT_ADAPTER_STATUSES = Object.freeze([
  'ready_for_product_mapping',
  'covered_by_inventory',
  'missing_ingredient',
  'missing_quantity',
  'needs_review',
]);

async function buildMealPlanNetRequirements(client, options = {}) {
  requireClient(client);
  const normalized = normalizeMealPlanNetRequirementOptions(options);
  const requirement = await getMealPlanRequirement(client, normalized);
  if (!requirement) {
    throw new Error('Meal-plan requirement not found for PLAN2A.1 inventory-adjusted requirements.');
  }

  const requirementItems = await listMealPlanRequirementItems(client, requirement.requirement_id);
  const inventory = await getUserInventoryForRequirement(client, requirement);
  const inventoryItems = inventory
    ? await listInventoryItemsForNetting(client, inventory.inventory_id)
    : [];
  const ingredientMetadata = await getIngredientMetadataMap(client, requirementItems);

  const netRequirementKey = buildMealPlanNetRequirementKey(
    requirement.requirement_id,
    MEAL_PLAN_NET_REQUIREMENTS_RULES_VERSION,
  );
  const netRequirement = {
    net_requirement_id: buildMealPlanNetRequirementId(netRequirementKey),
    requirement_id: requirement.requirement_id,
    plan_id: requirement.plan_id,
    profile_id: requirement.profile_id,
    user_id: requirement.user_id,
    net_requirement_key: netRequirementKey,
    generation_method: MEAL_PLAN_NET_REQUIREMENTS_GENERATION_METHOD,
    rules_version: MEAL_PLAN_NET_REQUIREMENTS_RULES_VERSION,
  };
  const netRequirementItems = buildNetRequirementItems({
    netRequirement,
    requirementItems,
    inventoryItems,
    ingredientMetadata,
  });
  const summary = summarizeMealPlanNetRequirementItems(netRequirementItems);
  const report = {
    dry_run: normalized.dry_run,
    requirement,
    inventory,
    net_requirement: netRequirement,
    requirements_seen: 1,
    net_requirements_created: 1,
    items_created: netRequirementItems.length,
    fully_covered: summary.fully_covered,
    partially_covered: summary.partially_covered,
    no_inventory: summary.no_inventory,
    missing_ingredient: summary.missing_ingredient,
    missing_quantity: summary.missing_quantity,
    ready_for_product_mapping: summary.ready_for_product_mapping,
    covered_by_inventory: summary.covered_by_inventory,
    total_required_grams: summary.total_required_grams,
    total_inventory_applied_grams: summary.total_inventory_applied_grams,
    total_net_grams: summary.total_net_grams,
    items: netRequirementItems,
    errors: [],
  };

  if (normalized.dry_run) {
    return report;
  }

  await persistMealPlanNetRequirements(client, {
    netRequirement,
    items: netRequirementItems,
  });
  return report;
}

async function getMealPlanRequirement(client, options = {}) {
  const requirementId = nullableString(options.requirement_id || options.requirementId);
  const requirementKey = nullableString(options.requirement_key || options.requirementKey);
  if (requirementId) {
    const result = await client.query(
      'SELECT * FROM meal_plan_requirements WHERE requirement_id = $1',
      [requirementId],
    );
    return result.rows[0] || null;
  }
  const result = await client.query(
    'SELECT * FROM meal_plan_requirements WHERE requirement_key = $1',
    [requiredString(requirementKey, 'requirement_key')],
  );
  return result.rows[0] || null;
}

async function listMealPlanRequirementItems(client, requirementId) {
  const result = await client.query(`
    SELECT *
    FROM meal_plan_requirement_items
    WHERE requirement_id = $1
    ORDER BY display_name ASC, requirement_item_id ASC
  `, [requiredString(requirementId, 'requirement_id')]);
  return (result.rows || []).map(hydrateRequirementItemRow);
}

async function getUserInventoryForRequirement(client, requirement = {}) {
  const userId = nullableString(requirement.user_id);
  if (userId) {
    const byUser = await client.query(
      'SELECT * FROM user_inventories WHERE user_id = $1',
      [userId],
    );
    if ((byUser.rows || [])[0]) {
      return byUser.rows[0];
    }
  }

  const profileId = nullableString(requirement.profile_id);
  if (profileId) {
    const byProfile = await client.query(
      'SELECT * FROM user_inventories WHERE profile_id = $1',
      [profileId],
    );
    return (byProfile.rows || [])[0] || null;
  }
  return null;
}

async function listInventoryItemsForNetting(client, inventoryId) {
  const result = await client.query(`
    SELECT *
    FROM inventory_items
    WHERE inventory_id = $1
      AND COALESCE(quantity_grams, 0) > 0
    ORDER BY created_at ASC, inventory_item_id ASC
  `, [requiredString(inventoryId, 'inventory_id')]);
  return result.rows || [];
}

async function getIngredientMetadataMap(client, requirementItems = []) {
  const ingredientIds = [...new Set(
    (requirementItems || [])
      .map((item) => nullableString(item.ingredient_id))
      .filter(Boolean),
  )];
  if (!ingredientIds.length) {
    return new Map();
  }

  const result = await client.query(`
    SELECT ingredient_id, shopping_unit, grams_per_piece
    FROM ingredients
    WHERE ingredient_id = ANY($1::text[])
  `, [ingredientIds]);
  return new Map((result.rows || []).map((row) => [
    row.ingredient_id,
    {
      ingredient_id: row.ingredient_id,
      shopping_unit: nullableString(row.shopping_unit),
      grams_per_piece: nullableNumber(row.grams_per_piece),
    },
  ]));
}

function buildNetRequirementItems({
  netRequirement,
  requirementItems,
  inventoryItems,
  ingredientMetadata,
}) {
  const netRequirementId = requiredString(netRequirement.net_requirement_id, 'net_requirement_id');
  const inventoryIndex = buildInventoryCoverageIndex(inventoryItems);
  return (requirementItems || [])
    .map((requirementItem) => buildNetRequirementItem({
      netRequirementId,
      requirementItem,
      inventoryIndex,
      ingredientMetadata,
    }))
    .sort(compareNetRequirementItems);
}

function buildInventoryCoverageIndex(inventoryItems = []) {
  const byIngredientId = new Map();
  const byIngredientKey = new Map();

  for (const item of inventoryItems || []) {
    const grams = nullableNumber(item.quantity_grams);
    if (grams === null || grams <= 0) {
      continue;
    }

    const normalizedItem = {
      inventory_item_id: requiredString(item.inventory_item_id, 'inventory_item_id'),
      ingredient_id: nullableString(item.ingredient_id),
      ingredient_key_snapshot: nullableString(item.ingredient_key_snapshot),
      quantity_grams: grams,
    };

    if (normalizedItem.ingredient_id) {
      pushIndexValue(byIngredientId, normalizedItem.ingredient_id, normalizedItem);
    }
    if (normalizedItem.ingredient_key_snapshot) {
      pushIndexValue(
        byIngredientKey,
        normalizeName(normalizedItem.ingredient_key_snapshot),
        normalizedItem,
      );
    }
  }

  return {
    byIngredientId,
    byIngredientKey,
  };
}

function buildNetRequirementItem({
  netRequirementId,
  requirementItem,
  inventoryIndex,
  ingredientMetadata,
}) {
  const requiredQuantityGrams = nullableNumber(requirementItem.total_quantity_grams);
  const hasIngredient = Boolean(nullableString(requirementItem.ingredient_id));
  const hasKeyFallback = Boolean(nullableString(requirementItem.ingredient_key_snapshot));
  const coverageMatches = selectInventoryCoverageMatches(requirementItem, inventoryIndex);
  const totalAvailableInventoryGrams = roundNumber(
    coverageMatches.reduce((sum, item) => sum + Number(item.quantity_grams || 0), 0),
  );
  const inventoryAppliedGrams = requiredQuantityGrams === null
    ? 0
    : roundNumber(Math.min(requiredQuantityGrams, totalAvailableInventoryGrams));
  const netQuantityGrams = requiredQuantityGrams === null
    ? null
    : roundNumber(Math.max(requiredQuantityGrams - inventoryAppliedGrams, 0));
  const ingredient = hasIngredient
    ? ingredientMetadata.get(requirementItem.ingredient_id) || {}
    : {};
  const shoppingUnit = nullableString(requirementItem.shopping_unit || ingredient.shopping_unit);
  const shoppingEstimate = estimateShoppingQuantity({
    total_quantity_grams: netQuantityGrams,
    shopping_unit: shoppingUnit,
    grams_per_piece: ingredient.grams_per_piece,
  });
  const inventoryStatus = determineInventoryStatus({
    ingredient_id: requirementItem.ingredient_id,
    required_quantity_grams: requiredQuantityGrams,
    inventory_applied_grams: inventoryAppliedGrams,
    net_quantity_grams: netQuantityGrams,
    ingredient_key_snapshot: requirementItem.ingredient_key_snapshot,
  });
  const adapterStatus = determineNetRequirementAdapterStatus({
    inventory_status: inventoryStatus,
    ingredient_id: requirementItem.ingredient_id,
    required_quantity_grams: requiredQuantityGrams,
    net_quantity_grams: netQuantityGrams,
    ingredient_key_snapshot: requirementItem.ingredient_key_snapshot,
  });

  // We preserve incomplete identity and quantity state explicitly so later PLAN2
  // layers can skip or review rows without mutating the original requirement bundle.
  return {
    net_requirement_item_id: buildMealPlanNetRequirementItemId(
      netRequirementId,
      requirementItem.requirement_item_id,
    ),
    net_requirement_id: netRequirementId,
    requirement_item_id: requirementItem.requirement_item_id,
    ingredient_id: hasIngredient ? requirementItem.ingredient_id : null,
    ingredient_key_snapshot: hasIngredient || hasKeyFallback
      ? nullableString(requirementItem.ingredient_key_snapshot)
      : null,
    display_name: requiredString(requirementItem.display_name, 'display_name'),
    required_quantity_grams: requiredQuantityGrams,
    inventory_applied_grams: inventoryAppliedGrams,
    net_quantity_grams: netQuantityGrams,
    inventory_item_ids_json: coverageMatches.map((item) => item.inventory_item_id).sort(),
    source_recipe_ids_json: parseJson(requirementItem.source_recipe_ids_json, []),
    source_recipe_ingredient_ids_json: parseJson(requirementItem.source_recipe_ingredient_ids_json, []),
    shopping_unit: shoppingUnit,
    estimated_shopping_quantity: shoppingEstimate.estimated_shopping_quantity,
    estimated_shopping_unit: shoppingEstimate.estimated_shopping_unit,
    inventory_status: inventoryStatus,
    adapter_status: adapterStatus,
  };
}

function selectInventoryCoverageMatches(requirementItem = {}, inventoryIndex = {}) {
  const ingredientId = nullableString(requirementItem.ingredient_id);
  if (ingredientId) {
    const directMatches = inventoryIndex.byIngredientId?.get(ingredientId) || [];
    if (directMatches.length) {
      return directMatches;
    }
  }

  const ingredientKeySnapshot = nullableString(requirementItem.ingredient_key_snapshot);
  if (ingredientKeySnapshot) {
    return inventoryIndex.byIngredientKey?.get(normalizeName(ingredientKeySnapshot)) || [];
  }
  return [];
}

function determineInventoryStatus({
  ingredient_id,
  required_quantity_grams,
  inventory_applied_grams,
  net_quantity_grams,
}) {
  if (!nullableString(ingredient_id)) {
    return 'missing_ingredient';
  }
  if (nullableNumber(required_quantity_grams) === null) {
    return 'missing_quantity';
  }
  if (nullableNumber(net_quantity_grams) === 0) {
    return 'fully_covered';
  }
  if (nullableNumber(inventory_applied_grams) > 0 && nullableNumber(net_quantity_grams) > 0) {
    return 'partially_covered';
  }
  if (nullableNumber(inventory_applied_grams) === 0) {
    return 'no_inventory';
  }
  return 'needs_review';
}

function determineNetRequirementAdapterStatus({
  inventory_status,
  ingredient_id,
  required_quantity_grams,
  net_quantity_grams,
}) {
  if (inventory_status === 'fully_covered') {
    return 'covered_by_inventory';
  }
  if (!nullableString(ingredient_id)) {
    return 'missing_ingredient';
  }
  if (nullableNumber(required_quantity_grams) === null) {
    return 'missing_quantity';
  }
  if (nullableNumber(net_quantity_grams) > 0) {
    return 'ready_for_product_mapping';
  }
  return 'needs_review';
}

function summarizeMealPlanNetRequirementItems(items = []) {
  return items.reduce((summary, item) => {
    summary[item.inventory_status] = (summary[item.inventory_status] || 0) + 1;
    if (item.adapter_status === 'ready_for_product_mapping') {
      summary.ready_for_product_mapping += 1;
    } else if (item.adapter_status === 'covered_by_inventory') {
      summary.covered_by_inventory += 1;
    } else if (item.adapter_status === 'needs_review') {
      summary.needs_review += 1;
    }
    summary.total_required_grams = roundNumber(
      summary.total_required_grams + Number(item.required_quantity_grams || 0),
    );
    summary.total_inventory_applied_grams = roundNumber(
      summary.total_inventory_applied_grams + Number(item.inventory_applied_grams || 0),
    );
    summary.total_net_grams = roundNumber(
      summary.total_net_grams + Number(item.net_quantity_grams || 0),
    );
    return summary;
  }, {
    fully_covered: 0,
    partially_covered: 0,
    no_inventory: 0,
    missing_ingredient: 0,
    missing_quantity: 0,
    needs_review: 0,
    ready_for_product_mapping: 0,
    covered_by_inventory: 0,
    total_required_grams: 0,
    total_inventory_applied_grams: 0,
    total_net_grams: 0,
  });
}

async function persistMealPlanNetRequirements(client, {
  netRequirement,
  items,
}) {
  await client.query('BEGIN');
  try {
    const storedNetRequirement = await upsertMealPlanNetRequirement(client, netRequirement);
    await client.query(
      'DELETE FROM meal_plan_net_requirement_items WHERE net_requirement_id = $1',
      [storedNetRequirement.net_requirement_id],
    );
    for (const item of items) {
      await insertMealPlanNetRequirementItem(client, {
        ...item,
        net_requirement_id: storedNetRequirement.net_requirement_id,
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function upsertMealPlanNetRequirement(client, netRequirement) {
  const result = await client.query(`
    INSERT INTO meal_plan_net_requirements (
      net_requirement_id,
      requirement_id,
      plan_id,
      profile_id,
      user_id,
      net_requirement_key,
      generation_method,
      rules_version
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (net_requirement_key) DO UPDATE SET
      requirement_id = EXCLUDED.requirement_id,
      plan_id = EXCLUDED.plan_id,
      profile_id = EXCLUDED.profile_id,
      user_id = EXCLUDED.user_id,
      generation_method = EXCLUDED.generation_method,
      rules_version = EXCLUDED.rules_version,
      updated_at = NOW()
    RETURNING *
  `, [
    netRequirement.net_requirement_id,
    netRequirement.requirement_id,
    netRequirement.plan_id,
    netRequirement.profile_id,
    netRequirement.user_id,
    netRequirement.net_requirement_key,
    netRequirement.generation_method,
    netRequirement.rules_version,
  ]);
  return result.rows[0];
}

async function insertMealPlanNetRequirementItem(client, item) {
  const result = await client.query(`
    INSERT INTO meal_plan_net_requirement_items (
      net_requirement_item_id,
      net_requirement_id,
      requirement_item_id,
      ingredient_id,
      ingredient_key_snapshot,
      display_name,
      required_quantity_grams,
      inventory_applied_grams,
      net_quantity_grams,
      inventory_item_ids_json,
      source_recipe_ids_json,
      source_recipe_ingredient_ids_json,
      shopping_unit,
      estimated_shopping_quantity,
      estimated_shopping_unit,
      inventory_status,
      adapter_status
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb,
      $13, $14, $15, $16, $17
    )
    RETURNING *
  `, [
    item.net_requirement_item_id,
    item.net_requirement_id,
    item.requirement_item_id,
    item.ingredient_id,
    item.ingredient_key_snapshot,
    item.display_name,
    item.required_quantity_grams,
    item.inventory_applied_grams,
    item.net_quantity_grams,
    JSON.stringify(item.inventory_item_ids_json || []),
    JSON.stringify(item.source_recipe_ids_json || []),
    JSON.stringify(item.source_recipe_ingredient_ids_json || []),
    item.shopping_unit,
    item.estimated_shopping_quantity,
    item.estimated_shopping_unit,
    item.inventory_status,
    item.adapter_status,
  ]);
  return hydrateNetRequirementItemRow(result.rows[0]);
}

function hydrateRequirementItemRow(row) {
  if (!row) return null;
  return {
    ...row,
    source_recipe_ids_json: parseJson(row.source_recipe_ids_json, []),
    source_recipe_ingredient_ids_json: parseJson(row.source_recipe_ingredient_ids_json, []),
  };
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

function buildMealPlanNetRequirementKey(requirementId, rulesVersion) {
  return `meal_plan_net_requirement:${stableHash([
    requiredString(requirementId, 'requirement_id'),
    requiredString(rulesVersion, 'rules_version'),
  ].join('|'))}`;
}

function buildMealPlanNetRequirementId(netRequirementKey) {
  return `meal_plan_net_requirement:${stableHash(requiredString(netRequirementKey, 'net_requirement_key'))}`;
}

function buildMealPlanNetRequirementItemId(netRequirementId, requirementItemId) {
  return `meal_plan_net_requirement_item:${stableHash([
    requiredString(netRequirementId, 'net_requirement_id'),
    requiredString(requirementItemId, 'requirement_item_id'),
  ].join('|'))}`;
}

function normalizeMealPlanNetRequirementOptions(options = {}) {
  const requirementId = nullableString(options.requirementId || options.requirement_id);
  const requirementKey = nullableString(options.requirementKey || options.requirement_key);
  if (!requirementId && !requirementKey) {
    throw new Error('requirement_id or requirement_key is required for PLAN2A.1 net requirements.');
  }
  return {
    requirement_id: requirementId,
    requirement_key: requirementKey,
    dry_run: Boolean(options.dryRun || options.dry_run),
  };
}

function compareNetRequirementItems(left, right) {
  return String(left.ingredient_key_snapshot || '')
    .localeCompare(String(right.ingredient_key_snapshot || ''))
    || String(left.display_name || '').localeCompare(String(right.display_name || ''))
    || String(left.net_requirement_item_id || '').localeCompare(String(right.net_requirement_item_id || ''));
}

function pushIndexValue(map, key, value) {
  const current = map.get(key) || [];
  current.push(value);
  map.set(key, current);
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}0-9]+/gu, '_')
    .replace(/^_+|_+$/g, '');
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
  MEAL_PLAN_NET_REQUIREMENTS_GENERATION_METHOD,
  MEAL_PLAN_NET_REQUIREMENTS_RULES_VERSION,
  SUPPORTED_MEAL_PLAN_NET_INVENTORY_STATUSES,
  SUPPORTED_MEAL_PLAN_NET_REQUIREMENT_ADAPTER_STATUSES,
  buildInventoryCoverageIndex,
  buildMealPlanNetRequirementId,
  buildMealPlanNetRequirementItemId,
  buildMealPlanNetRequirementKey,
  buildMealPlanNetRequirements,
  determineInventoryStatus,
  determineNetRequirementAdapterStatus,
  hydrateNetRequirementItemRow,
  normalizeMealPlanNetRequirementOptions,
  summarizeMealPlanNetRequirementItems,
};
