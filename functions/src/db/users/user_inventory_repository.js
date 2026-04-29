const crypto = require('node:crypto');

const { getIngredientById, getIngredientByKey } = require('../ingredients/ingredient_repository');
const {
  getUserFoodProfileById,
  getUserFoodProfileByUserId,
  normalizeKey,
} = require('./user_food_profile_repository');

const SUPPORTED_INVENTORY_STORAGE_TYPES = Object.freeze([
  'pantry',
  'fridge',
  'freezer',
]);
const SUPPORTED_INVENTORY_PERISHABILITY_CLASSES = Object.freeze([
  'short',
  'medium',
  'long',
]);
const SUPPORTED_INVENTORY_UPDATE_SOURCES = Object.freeze([
  'manual',
  'receipt',
  'system',
]);

async function createUserInventory(client, input = {}) {
  requireClient(client);
  const profile = await requireResolvedProfile(client, input);
  return upsertUserInventory(client, {
    inventory_id: input.inventory_id || input.inventoryId || buildUserInventoryId(profile.user_id),
    inventory_key: input.inventory_key || input.inventoryKey || buildUserInventoryKey(profile.user_id),
    profile_id: profile.profile_id,
    user_id: profile.user_id,
  });
}

async function getUserInventoryById(client, inventoryId) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM user_inventories WHERE inventory_id = $1',
    [requiredString(inventoryId, 'inventory_id')],
  );
  return hydrateUserInventoryRow((result.rows || [])[0] || null);
}

async function getUserInventoryByUserId(client, userId) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM user_inventories WHERE user_id = $1',
    [requiredString(userId, 'user_id')],
  );
  return hydrateUserInventoryRow((result.rows || [])[0] || null);
}

async function getOrCreateUserInventoryByUserId(client, input = {}) {
  requireClient(client);
  const profile = await requireResolvedProfile(client, input);
  return upsertUserInventory(client, {
    inventory_id: input.inventory_id || input.inventoryId || buildUserInventoryId(profile.user_id),
    inventory_key: input.inventory_key || input.inventoryKey || buildUserInventoryKey(profile.user_id),
    profile_id: profile.profile_id,
    user_id: profile.user_id,
  });
}

async function addInventoryItem(client, input = {}) {
  requireClient(client);
  const inventory = await getOrCreateUserInventoryByUserId(client, input);
  const ingredient = await resolveInventoryIngredient(client, input);
  const record = normalizeInventoryItemRecord(input, {
    inventoryId: inventory.inventory_id,
    ingredient,
  });

  await client.query('BEGIN');
  try {
    const existingItems = await listInventoryItemsRaw(client, inventory.inventory_id);
    const matchingItems = findMatchingInventoryItems(existingItems, record);
    const merged = mergeInventoryItemRecords([
      ...matchingItems,
      record,
    ], {
      inventoryItemId: matchingItems[0]
        ? matchingItems[0].inventory_item_id
        : buildInventoryItemId({
          inventoryId: inventory.inventory_id,
          identityKey: buildInventoryIdentityKey(record),
          storageType: record.storage_type,
          perishabilityClass: record.perishability_class,
          unit: record.unit,
        }),
      keepCreatedAt: matchingItems[0] ? matchingItems[0].created_at : null,
      lastUpdatedSource: record.last_updated_source,
      estimatedExpiryDate: coalesceLatestExpiryDate([
        ...matchingItems.map((item) => item.estimated_expiry_date),
        record.estimated_expiry_date,
      ]),
      forceRemainingRatio: weightedRemainingRatio([
        ...matchingItems,
        record,
      ]),
    });
    const stored = await upsertInventoryItem(client, merged);
    await zeroOutDuplicateInventoryItems(client, matchingItems.slice(1), {
      lastUpdatedSource: record.last_updated_source,
    });
    await client.query('COMMIT');
    return stored;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function updateInventoryItemQuantity(client, input = {}) {
  requireClient(client);
  const current = await getRequiredInventoryItem(client, input.inventory_item_id || input.inventoryItemId);
  const ingredient = current.ingredient_id
    ? await getIngredientById(client, current.ingredient_id)
    : await resolveInventoryIngredient(client, input);
  const next = normalizeInventoryQuantityUpdate(input, current, ingredient);
  const updated = {
    ...current,
    quantity_grams: next.quantity_grams,
    quantity_units: next.quantity_units,
    unit: next.unit,
    estimated_remaining_ratio: next.estimated_remaining_ratio,
    estimated_expiry_date: next.estimated_expiry_date,
    last_updated_source: next.last_updated_source,
  };

  if (isInventoryItemEmpty(updated)) {
    return removeInventoryItem(client, {
      inventoryItemId: current.inventory_item_id,
      lastUpdatedSource: next.last_updated_source,
    });
  }
  return upsertInventoryItem(client, updated);
}

async function reduceInventoryItemQuantity(client, input = {}) {
  requireClient(client);
  const current = await getRequiredInventoryItem(client, input.inventory_item_id || input.inventoryItemId);
  const reduction = normalizeInventoryReduction(input);
  const nextGrams = reduction.quantity_grams === null
    ? current.quantity_grams
    : roundNumber(Math.max(0, Number(current.quantity_grams || 0) - reduction.quantity_grams));
  const nextUnits = reduction.quantity_units === null
    ? current.quantity_units
    : roundNumber(Math.max(0, Number(current.quantity_units || 0) - reduction.quantity_units));
  const nextRatio = reduceRemainingRatio(current, {
    quantity_grams: nextGrams,
    quantity_units: nextUnits,
  });

  if (isInventoryItemEmpty({
    ...current,
    quantity_grams: nextGrams,
    quantity_units: nextUnits,
  })) {
    return removeInventoryItem(client, {
      inventoryItemId: current.inventory_item_id,
      lastUpdatedSource: reduction.last_updated_source,
    });
  }

  return upsertInventoryItem(client, {
    ...current,
    quantity_grams: nextGrams,
    quantity_units: nextUnits,
    estimated_remaining_ratio: nextRatio,
    last_updated_source: reduction.last_updated_source,
  });
}

async function removeInventoryItem(client, input = {}) {
  requireClient(client);
  const current = await getRequiredInventoryItem(client, input.inventory_item_id || input.inventoryItemId);
  const result = await client.query(`
    UPDATE inventory_items
    SET quantity_grams = 0,
        quantity_units = 0,
        estimated_remaining_ratio = 0,
        last_updated_source = $2,
        updated_at = NOW()
    WHERE inventory_item_id = $1
    RETURNING *
  `, [
    current.inventory_item_id,
    normalizeInventorySource(input.last_updated_source || input.lastUpdatedSource || 'system'),
  ]);
  return hydrateInventoryItemRow((result.rows || [])[0] || null);
}

async function listInventoryItems(client, input = {}) {
  requireClient(client);
  const inventory = await resolveInventory(client, input);
  if (!inventory) {
    return [];
  }
  const includeEmpty = normalizeBoolean(input.include_empty ?? input.includeEmpty, false);
  const limit = positiveInteger(input.limit, 1000);
  const rows = await listInventoryItemsRaw(client, inventory.inventory_id);
  return rows
    .filter((row) => includeEmpty || !isInventoryItemEmpty(row))
    .slice(0, limit);
}

async function mergeDuplicateInventoryItems(client, input = {}) {
  requireClient(client);
  const inventory = await requireResolvedInventory(client, input);
  const inventoryItems = await listInventoryItemsRaw(client, inventory.inventory_id);
  const target = normalizeInventoryItemRecord({
    ...input,
    quantity_grams: input.quantity_grams ?? input.quantityGrams ?? 0,
    quantity_units: input.quantity_units ?? input.quantityUnits ?? 0,
    estimated_remaining_ratio: input.estimated_remaining_ratio ?? input.estimatedRemainingRatio ?? 1,
  }, {
    inventoryId: inventory.inventory_id,
    ingredient: await resolveInventoryIngredient(client, input),
    allowZeroQuantities: true,
  });
  const matches = findMatchingInventoryItems(inventoryItems, target);
  if (matches.length <= 1) {
    return matches[0] || null;
  }

  const keeper = matches[0];
  const merged = mergeInventoryItemRecords(matches, {
    inventoryItemId: keeper.inventory_item_id,
    keepCreatedAt: keeper.created_at,
    lastUpdatedSource: normalizeInventorySource(input.last_updated_source || input.lastUpdatedSource || 'system'),
    estimatedExpiryDate: coalesceLatestExpiryDate(matches.map((item) => item.estimated_expiry_date)),
    forceRemainingRatio: weightedRemainingRatio(matches),
  });

  await client.query('BEGIN');
  try {
    const stored = await upsertInventoryItem(client, merged);
    await zeroOutDuplicateInventoryItems(client, matches.slice(1), {
      lastUpdatedSource: merged.last_updated_source,
    });
    await client.query('COMMIT');
    return stored;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function deleteUserInventory() {
  throw new Error('User inventory is append-preserving sidecar state and must not be hard-deleted.');
}

async function getInventoryItemById(client, inventoryItemId) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM inventory_items WHERE inventory_item_id = $1',
    [requiredString(inventoryItemId, 'inventory_item_id')],
  );
  return hydrateInventoryItemRow((result.rows || [])[0] || null);
}

function normalizeInventoryItemRecord(input = {}, {
  inventoryId = null,
  ingredient = null,
  allowZeroQuantities = false,
} = {}) {
  const ingredientId = nullableString(input.ingredient_id || input.ingredientId || ingredient?.ingredient_id);
  const ingredientKeySnapshot = nullableString(
    input.ingredient_key_snapshot
    || input.ingredientKeySnapshot
    || input.ingredient_key
    || input.ingredientKey
    || ingredient?.ingredient_key,
  );
  const productId = nullableString(input.product_id || input.productId);
  const productNameSnapshot = nullableString(input.product_name_snapshot || input.productNameSnapshot || input.product_name || input.productName);
  if (!ingredientId && !productId && !productNameSnapshot && !ingredientKeySnapshot) {
    throw new Error('ingredient_id, product_id, product_name_snapshot, or ingredient_key_snapshot is required.');
  }

  const quantityGrams = nullableNonNegativeNumber(input.quantity_grams ?? input.quantityGrams, 'quantity_grams');
  const quantityUnits = nullableNonNegativeNumber(input.quantity_units ?? input.quantityUnits, 'quantity_units');
  if (!allowZeroQuantities && quantityGrams === null && quantityUnits === null) {
    throw new Error('quantity_grams or quantity_units is required.');
  }

  const storageType = normalizeEnum(input.storage_type || input.storageType || 'pantry', {
    fieldName: 'storage_type',
    supportedValues: SUPPORTED_INVENTORY_STORAGE_TYPES,
  });
  const perishabilityClass = normalizeEnum(input.perishability_class || input.perishabilityClass || 'medium', {
    fieldName: 'perishability_class',
    supportedValues: SUPPORTED_INVENTORY_PERISHABILITY_CLASSES,
  });
  const unit = requiredString(
    input.unit
    || deriveInventoryUnit({
      ingredient,
      quantityGrams,
      quantityUnits,
    }),
    'unit',
  );
  const identityKey = buildInventoryIdentityKey({
    ingredient_id: ingredientId,
    ingredient_key_snapshot: ingredientKeySnapshot,
    product_id: productId,
    product_name_snapshot: productNameSnapshot,
  });
  const inventoryItemId = requiredString(
    input.inventory_item_id
    || input.inventoryItemId
    || buildInventoryItemId({
      inventoryId: requiredString(inventoryId, 'inventory_id'),
      identityKey,
      storageType,
      perishabilityClass,
      unit,
    }),
    'inventory_item_id',
  );

  return {
    inventory_item_id: inventoryItemId,
    inventory_id: requiredString(inventoryId, 'inventory_id'),
    ingredient_id: ingredientId,
    ingredient_key_snapshot: ingredientKeySnapshot,
    product_id: productId,
    product_name_snapshot: productNameSnapshot,
    quantity_grams: quantityGrams,
    quantity_units: quantityUnits,
    unit,
    estimated_remaining_ratio: normalizeNullableRatio(
      input.estimated_remaining_ratio ?? input.estimatedRemainingRatio,
      quantityGrams,
      quantityUnits,
    ),
    storage_type: storageType,
    perishability_class: perishabilityClass,
    estimated_expiry_date: normalizeExpiryDate(
      input.estimated_expiry_date
      || input.estimatedExpiryDate
      || buildEstimatedExpiryDate(ingredient, {
        baseDate: input.created_at
          || input.createdAt
          || input.observed_at
          || input.observedAt
          || input.as_of_date
          || input.asOfDate,
      }),
    ),
    last_updated_source: normalizeInventorySource(
      input.last_updated_source || input.lastUpdatedSource || 'manual',
    ),
    created_at: nullableString(input.created_at || input.createdAt),
    updated_at: nullableString(input.updated_at || input.updatedAt),
  };
}

function buildUserInventoryId(userId) {
  return `user_inventory:${normalizeInventoryKey(userId)}`;
}

function buildUserInventoryKey(userId) {
  return `inventory:${normalizeInventoryKey(userId)}`;
}

function buildInventoryItemId({
  inventoryId,
  identityKey,
  storageType,
  perishabilityClass,
  unit,
} = {}) {
  return `inventory_item:${stableHash([
    requiredString(inventoryId, 'inventory_id'),
    requiredString(identityKey, 'identity_key'),
    requiredString(storageType, 'storage_type'),
    requiredString(perishabilityClass, 'perishability_class'),
    requiredString(unit, 'unit'),
  ].join('|'))}`;
}

function buildInventoryIdentityKey(item = {}) {
  if (item.ingredient_id) {
    return `ingredient:${requiredString(item.ingredient_id, 'ingredient_id')}`;
  }
  if (item.product_id) {
    return `product:${requiredString(item.product_id, 'product_id')}`;
  }
  if (item.product_name_snapshot) {
    return `product_name:${normalizeInventoryKey(item.product_name_snapshot)}`;
  }
  return `ingredient_key:${normalizeInventoryKey(requiredString(item.ingredient_key_snapshot, 'ingredient_key_snapshot'))}`;
}

function hydrateUserInventoryRow(row) {
  return row ? { ...row } : null;
}

function hydrateInventoryItemRow(row) {
  return row ? { ...row } : null;
}

async function resolveInventoryIngredient(client, input = {}) {
  const ingredientId = nullableString(input.ingredient_id || input.ingredientId);
  if (ingredientId) {
    return getIngredientById(client, ingredientId);
  }
  const ingredientKey = nullableString(input.ingredient_key || input.ingredientKey || input.ingredient_key_snapshot || input.ingredientKeySnapshot);
  if (ingredientKey) {
    return getIngredientByKey(client, ingredientKey);
  }
  return null;
}

async function resolveProfile(client, input = {}) {
  if (input.profile_id || input.profileId) {
    return getUserFoodProfileById(client, input.profile_id || input.profileId);
  }
  if (input.user_id || input.userId) {
    return getUserFoodProfileByUserId(client, input.user_id || input.userId);
  }
  throw new Error('profile_id or user_id is required.');
}

async function requireResolvedProfile(client, input = {}) {
  const profile = await resolveProfile(client, input);
  if (!profile) {
    throw new Error('User food profile not found.');
  }
  return profile;
}

async function requireResolvedInventory(client, input = {}) {
  const inventory = await resolveInventory(client, input);
  if (!inventory) {
    throw new Error('User inventory not found.');
  }
  return inventory;
}

async function resolveInventory(client, input = {}) {
  if (input.inventory_id || input.inventoryId) {
    return getUserInventoryById(client, input.inventory_id || input.inventoryId);
  }
  if (input.user_id || input.userId) {
    return getUserInventoryByUserId(client, input.user_id || input.userId);
  }
  if (input.profile_id || input.profileId) {
    const profile = await getUserFoodProfileById(client, input.profile_id || input.profileId);
    if (!profile) return null;
    return getUserInventoryByUserId(client, profile.user_id);
  }
  throw new Error('inventory_id, profile_id, or user_id is required.');
}

async function getRequiredInventoryItem(client, inventoryItemId) {
  const item = await getInventoryItemById(client, inventoryItemId);
  if (!item) {
    throw new Error('Inventory item not found.');
  }
  return item;
}

async function upsertUserInventory(client, record) {
  const result = await client.query(`
    INSERT INTO user_inventories (
      inventory_id,
      profile_id,
      user_id,
      inventory_key
    )
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id) DO UPDATE SET
      profile_id = EXCLUDED.profile_id,
      inventory_key = EXCLUDED.inventory_key,
      updated_at = NOW()
    RETURNING *
  `, [
    requiredString(record.inventory_id, 'inventory_id'),
    requiredString(record.profile_id, 'profile_id'),
    requiredString(record.user_id, 'user_id'),
    requiredString(record.inventory_key, 'inventory_key'),
  ]);
  return hydrateUserInventoryRow((result.rows || [])[0] || null);
}

async function listInventoryItemsRaw(client, inventoryId) {
  const result = await client.query(`
    SELECT *
    FROM inventory_items
    WHERE inventory_id = $1
    ORDER BY created_at ASC, inventory_item_id ASC
  `, [requiredString(inventoryId, 'inventory_id')]);
  return (result.rows || []).map(hydrateInventoryItemRow);
}

async function upsertInventoryItem(client, item) {
  const result = await client.query(`
    INSERT INTO inventory_items (
      inventory_item_id,
      inventory_id,
      ingredient_id,
      ingredient_key_snapshot,
      product_id,
      product_name_snapshot,
      quantity_grams,
      quantity_units,
      unit,
      estimated_remaining_ratio,
      storage_type,
      perishability_class,
      estimated_expiry_date,
      last_updated_source
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12,
      $13, $14
    )
    ON CONFLICT (inventory_item_id) DO UPDATE SET
      ingredient_id = EXCLUDED.ingredient_id,
      ingredient_key_snapshot = EXCLUDED.ingredient_key_snapshot,
      product_id = EXCLUDED.product_id,
      product_name_snapshot = EXCLUDED.product_name_snapshot,
      quantity_grams = EXCLUDED.quantity_grams,
      quantity_units = EXCLUDED.quantity_units,
      unit = EXCLUDED.unit,
      estimated_remaining_ratio = EXCLUDED.estimated_remaining_ratio,
      storage_type = EXCLUDED.storage_type,
      perishability_class = EXCLUDED.perishability_class,
      estimated_expiry_date = EXCLUDED.estimated_expiry_date,
      last_updated_source = EXCLUDED.last_updated_source,
      updated_at = NOW()
    RETURNING *
  `, [
    item.inventory_item_id,
    item.inventory_id,
    item.ingredient_id,
    item.ingredient_key_snapshot,
    item.product_id,
    item.product_name_snapshot,
    item.quantity_grams,
    item.quantity_units,
    item.unit,
    item.estimated_remaining_ratio,
    item.storage_type,
    item.perishability_class,
    item.estimated_expiry_date,
    item.last_updated_source,
  ]);
  return hydrateInventoryItemRow((result.rows || [])[0] || null);
}

async function zeroOutDuplicateInventoryItems(client, items = [], {
  lastUpdatedSource = 'system',
} = {}) {
  for (const item of items) {
    await client.query(`
      UPDATE inventory_items
      SET quantity_grams = 0,
          quantity_units = 0,
          estimated_remaining_ratio = 0,
          last_updated_source = $2,
          updated_at = NOW()
      WHERE inventory_item_id = $1
    `, [
      item.inventory_item_id,
      normalizeInventorySource(lastUpdatedSource),
    ]);
  }
}

function findMatchingInventoryItems(items = [], target = {}) {
  const targetIdentity = buildInventoryIdentityKey(target);
  return (items || [])
    .filter((item) => (
      buildInventoryIdentityKey(item) === targetIdentity
      && normalizeInventoryStorage(item.storage_type) === normalizeInventoryStorage(target.storage_type)
      && normalizeInventoryStorage(item.perishability_class) === normalizeInventoryStorage(target.perishability_class)
      && normalizeInventoryStorage(item.unit) === normalizeInventoryStorage(target.unit)
    ))
    .sort(compareInventoryItems);
}

function mergeInventoryItemRecords(items = [], {
  inventoryItemId,
  keepCreatedAt = null,
  lastUpdatedSource = 'system',
  estimatedExpiryDate = null,
  forceRemainingRatio = null,
} = {}) {
  if (!items.length) {
    throw new Error('At least one inventory item is required to merge.');
  }

  const keeper = items.slice().sort(compareInventoryItems)[0];
  const totalQuantityGrams = roundNumber(items.reduce(
    (sum, item) => sum + Number(item.quantity_grams || 0),
    0,
  ));
  const totalQuantityUnits = roundNumber(items.reduce(
    (sum, item) => sum + Number(item.quantity_units || 0),
    0,
  ));
  const quantityGrams = totalQuantityGrams > 0 ? totalQuantityGrams : null;
  const quantityUnits = totalQuantityUnits > 0 ? totalQuantityUnits : null;

  return {
    ...keeper,
    inventory_item_id: requiredString(inventoryItemId, 'inventory_item_id'),
    ingredient_id: keeper.ingredient_id || null,
    ingredient_key_snapshot: keeper.ingredient_key_snapshot || null,
    product_id: keeper.product_id || null,
    product_name_snapshot: keeper.product_name_snapshot || null,
    quantity_grams: quantityGrams,
    quantity_units: quantityUnits,
    unit: keeper.unit,
    estimated_remaining_ratio: forceRemainingRatio === null
      ? normalizeNullableRatio(null, quantityGrams, quantityUnits)
      : normalizeNullableRatio(forceRemainingRatio, quantityGrams, quantityUnits),
    storage_type: keeper.storage_type,
    perishability_class: keeper.perishability_class,
    estimated_expiry_date: normalizeExpiryDate(estimatedExpiryDate || keeper.estimated_expiry_date),
    last_updated_source: normalizeInventorySource(lastUpdatedSource),
    created_at: keepCreatedAt || keeper.created_at || null,
  };
}

function normalizeInventoryQuantityUpdate(input = {}, current = {}, ingredient = null) {
  const quantityGrams = input.quantity_grams !== undefined || input.quantityGrams !== undefined
    ? nullableNonNegativeNumber(input.quantity_grams ?? input.quantityGrams, 'quantity_grams')
    : nullableNumber(current.quantity_grams);
  const quantityUnits = input.quantity_units !== undefined || input.quantityUnits !== undefined
    ? nullableNonNegativeNumber(input.quantity_units ?? input.quantityUnits, 'quantity_units')
    : nullableNumber(current.quantity_units);
  if (quantityGrams === null && quantityUnits === null) {
    throw new Error('quantity_grams or quantity_units is required.');
  }
  const unit = requiredString(input.unit || current.unit, 'unit');
  return {
    quantity_grams: quantityGrams,
    quantity_units: quantityUnits,
    unit,
    estimated_remaining_ratio: normalizeUpdateRemainingRatio(current, {
      quantity_grams: quantityGrams,
      quantity_units: quantityUnits,
      estimated_remaining_ratio: input.estimated_remaining_ratio ?? input.estimatedRemainingRatio,
    }),
    estimated_expiry_date: normalizeExpiryDate(
      input.estimated_expiry_date
      || input.estimatedExpiryDate
      || buildEstimatedExpiryDate(ingredient, {
        baseDate: input.updated_at
          || input.updatedAt
          || input.created_at
          || input.createdAt
          || input.as_of_date
          || input.asOfDate,
      })
      || current.estimated_expiry_date,
    ),
    last_updated_source: normalizeInventorySource(
      input.last_updated_source || input.lastUpdatedSource || current.last_updated_source || 'manual',
    ),
  };
}

function normalizeInventoryReduction(input = {}) {
  const quantityGrams = input.quantity_grams === undefined && input.quantityGrams === undefined
    ? null
    : nullableNonNegativeNumber(input.quantity_grams ?? input.quantityGrams, 'quantity_grams');
  const quantityUnits = input.quantity_units === undefined && input.quantityUnits === undefined
    ? null
    : nullableNonNegativeNumber(input.quantity_units ?? input.quantityUnits, 'quantity_units');
  if (quantityGrams === null && quantityUnits === null) {
    throw new Error('quantity_grams or quantity_units is required for reduction.');
  }
  return {
    quantity_grams: quantityGrams,
    quantity_units: quantityUnits,
    last_updated_source: normalizeInventorySource(
      input.last_updated_source || input.lastUpdatedSource || 'manual',
    ),
  };
}

function normalizeUpdateRemainingRatio(current = {}, {
  quantity_grams,
  quantity_units,
  estimated_remaining_ratio,
} = {}) {
  if (estimated_remaining_ratio !== undefined && estimated_remaining_ratio !== null && estimated_remaining_ratio !== '') {
    return normalizeNullableRatio(estimated_remaining_ratio, quantity_grams, quantity_units);
  }

  const previousBasis = preferredInventoryQuantity(current);
  const nextBasis = preferredInventoryQuantity({
    quantity_grams,
    quantity_units,
  });
  if (previousBasis === null || nextBasis === null) {
    return normalizeNullableRatio(current.estimated_remaining_ratio, quantity_grams, quantity_units);
  }
  if (nextBasis >= previousBasis) {
    return 1;
  }
  const currentRatio = normalizeNullableRatio(current.estimated_remaining_ratio, current.quantity_grams, current.quantity_units);
  return roundRatio((currentRatio || 1) * (nextBasis / previousBasis));
}

function reduceRemainingRatio(current = {}, next = {}) {
  const previousBasis = preferredInventoryQuantity(current);
  const nextBasis = preferredInventoryQuantity(next);
  if (previousBasis === null || nextBasis === null || previousBasis <= 0) {
    return 0;
  }
  const currentRatio = normalizeNullableRatio(current.estimated_remaining_ratio, current.quantity_grams, current.quantity_units);
  return roundRatio((currentRatio || 1) * (nextBasis / previousBasis));
}

function weightedRemainingRatio(items = []) {
  const weighted = (items || [])
    .map((item) => ({
      weight: preferredInventoryQuantity(item),
      ratio: normalizeNullableRatio(
        item.estimated_remaining_ratio,
        item.quantity_grams,
        item.quantity_units,
      ),
    }))
    .filter((entry) => entry.weight !== null && entry.weight > 0 && entry.ratio !== null);
  if (!weighted.length) return 1;
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedSum = weighted.reduce((sum, entry) => sum + (entry.weight * entry.ratio), 0);
  return roundRatio(weightedSum / totalWeight);
}

function preferredInventoryQuantity(item = {}) {
  const grams = nullableNumber(item.quantity_grams);
  if (grams !== null && grams > 0) return grams;
  const units = nullableNumber(item.quantity_units);
  if (units !== null && units > 0) return units;
  return null;
}

function buildEstimatedExpiryDate(ingredient, { baseDate = null } = {}) {
  const shelfLifeDays = getIngredientShelfLifeDays(ingredient);
  if (shelfLifeDays === null) return null;
  const expiryDate = normalizeBaseDate(baseDate);
  expiryDate.setUTCDate(expiryDate.getUTCDate() + shelfLifeDays);
  return expiryDate.toISOString().slice(0, 10);
}

function getIngredientShelfLifeDays(ingredient) {
  if (!ingredient || typeof ingredient !== 'object') return null;
  const candidates = [
    ingredient.shelf_life_days,
    ingredient?.tags_json?.shelf_life_days,
    ingredient?.state_defaults_json?.shelf_life_days,
  ];
  for (const candidate of candidates) {
    const normalized = nullablePositiveInteger(candidate);
    if (normalized !== null) {
      return normalized;
    }
  }
  return null;
}

function deriveInventoryUnit({
  ingredient,
  quantityGrams,
  quantityUnits,
} = {}) {
  if (quantityGrams !== null) return 'g';
  if (quantityUnits !== null && ingredient?.shopping_unit) {
    return ingredient.shopping_unit;
  }
  if (quantityUnits !== null) return 'unit';
  return ingredient?.shopping_unit || 'g';
}

function normalizeBaseDate(value) {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Base inventory date must be a valid ISO date or timestamp.');
  }
  return date;
}

function coalesceLatestExpiryDate(dates = []) {
  const normalized = (dates || [])
    .map((value) => normalizeExpiryDate(value))
    .filter(Boolean)
    .sort();
  return normalized.length ? normalized[normalized.length - 1] : null;
}

function compareInventoryItems(left, right) {
  const leftActive = isInventoryItemEmpty(left) ? 1 : 0;
  const rightActive = isInventoryItemEmpty(right) ? 1 : 0;
  return leftActive - rightActive
    || String(left.created_at || '').localeCompare(String(right.created_at || ''))
    || String(left.inventory_item_id || '').localeCompare(String(right.inventory_item_id || ''));
}

function isInventoryItemEmpty(item = {}) {
  const grams = nullableNumber(item.quantity_grams);
  const units = nullableNumber(item.quantity_units);
  const gramsEmpty = grams === null || grams <= 0;
  const unitsEmpty = units === null || units <= 0;
  return gramsEmpty && unitsEmpty;
}

function stableHash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16);
}

function normalizeInventoryKey(value) {
  const normalized = normalizeKey(requiredString(value, 'inventory_key'));
  if (!normalized) {
    throw new Error('inventory_key is required.');
  }
  return normalized;
}

function normalizeInventoryStorage(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function normalizeInventorySource(value) {
  return normalizeEnum(value, {
    fieldName: 'last_updated_source',
    supportedValues: SUPPORTED_INVENTORY_UPDATE_SOURCES,
  });
}

function normalizeExpiryDate(value) {
  const normalized = nullableString(value);
  if (!normalized) return null;
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    throw new Error('estimated_expiry_date must be an ISO date string.');
  }
  return match[1];
}

function normalizeNullableRatio(value, quantityGrams, quantityUnits) {
  if (value === undefined || value === null || value === '') {
    if ((quantityGrams !== null && quantityGrams > 0) || (quantityUnits !== null && quantityUnits > 0)) {
      return 1;
    }
    return 0;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new Error('estimated_remaining_ratio must be between 0 and 1.');
  }
  return roundRatio(numeric);
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new Error('Boolean value expected.');
}

function normalizeEnum(value, { fieldName, supportedValues }) {
  const normalized = requiredString(value, fieldName);
  if (!supportedValues.includes(normalized)) {
    throw new Error(`Unsupported ${fieldName}: ${normalized}`);
  }
  return normalized;
}

function positiveInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
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

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nullablePositiveInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function nullableNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }
  return roundNumber(numeric);
}

function roundNumber(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function roundRatio(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  SUPPORTED_INVENTORY_PERISHABILITY_CLASSES,
  SUPPORTED_INVENTORY_STORAGE_TYPES,
  SUPPORTED_INVENTORY_UPDATE_SOURCES,
  addInventoryItem,
  buildInventoryIdentityKey,
  buildInventoryItemId,
  buildUserInventoryId,
  buildUserInventoryKey,
  createUserInventory,
  deleteUserInventory,
  getInventoryItemById,
  getOrCreateUserInventoryByUserId,
  getUserInventoryById,
  getUserInventoryByUserId,
  hydrateInventoryItemRow,
  hydrateUserInventoryRow,
  listInventoryItems,
  mergeDuplicateInventoryItems,
  normalizeInventoryItemRecord,
  reduceInventoryItemQuantity,
  removeInventoryItem,
  updateInventoryItemQuantity,
};
