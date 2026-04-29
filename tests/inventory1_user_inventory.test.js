const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  addInventoryItem,
  buildUserInventoryKey,
  getOrCreateUserInventoryByUserId,
  getInventoryItemById,
  listInventoryItems,
  reduceInventoryItemQuantity,
  removeInventoryItem,
  updateInventoryItemQuantity,
} = require('../app/functions/src');
const {
  buildDefaultSeedItems,
  parseArgs,
  seedInventoryForUser,
} = require('../scripts/inventory1_seed_inventory');

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '024_inventory_user_inventory.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS user_inventories'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS inventory_items'));
  assert(migration.includes("'pantry'"));
  assert(migration.includes("'fridge'"));
  assert(migration.includes("'freezer'"));
  assert(migration.includes("'manual'"));
  assert(migration.includes("'receipt'"));
  assert(migration.includes("'system'"));

  assert.equal(
    buildUserInventoryKey('user_family_meal_demo'),
    buildUserInventoryKey('user_family_meal_demo'),
    'inventory keys should stay deterministic',
  );

  const client = makeFixtureClient();
  const emptyBeforeCreate = await listInventoryItems(client, {
    userId: 'user_family_meal_demo',
  });
  assert.deepStrictEqual(emptyBeforeCreate, [], 'read-only listing should not auto-create inventory rows');

  const inventory = await getOrCreateUserInventoryByUserId(client, {
    userId: 'user_family_meal_demo',
  });
  const inventoryAgain = await getOrCreateUserInventoryByUserId(client, {
    userId: 'user_family_meal_demo',
  });
  assert.equal(inventory.inventory_id, inventoryAgain.inventory_id, 'inventory creation should be idempotent per user');

  const rice = await addInventoryItem(client, {
    userId: 'user_family_meal_demo',
    ingredientKey: 'rice',
    quantityGrams: 500,
    unit: 'g',
    storageType: 'pantry',
    perishabilityClass: 'long',
    lastUpdatedSource: 'manual',
    createdAt: '2026-04-25T00:00:00.000Z',
  });
  assert.equal(rice.ingredient_id, 'ingredient:rice');
  assert.equal(rice.ingredient_key_snapshot, 'rice');
  assert.equal(rice.quantity_grams, 500);
  assert.equal(rice.estimated_remaining_ratio, 1);
  assert.equal(rice.estimated_expiry_date, '2027-04-25', 'ingredient shelf life should estimate expiry from input date when available');

  const riceMerged = await addInventoryItem(client, {
    userId: 'user_family_meal_demo',
    ingredientKey: 'rice',
    quantityGrams: 250,
    unit: 'g',
    storageType: 'pantry',
    perishabilityClass: 'long',
    lastUpdatedSource: 'manual',
  });
  assert.equal(riceMerged.inventory_item_id, rice.inventory_item_id, 'same ingredient in the same storage bucket should merge into one item');
  assert.equal(riceMerged.quantity_grams, 750, 'duplicate items should merge quantities');

  const riceAfterReduction = await reduceInventoryItemQuantity(client, {
    inventoryItemId: rice.inventory_item_id,
    quantityGrams: 250,
    lastUpdatedSource: 'manual',
  });
  assert.equal(riceAfterReduction.quantity_grams, 500);
  assert.equal(riceAfterReduction.estimated_remaining_ratio, 0.667, 'reductions should update remaining ratio proportionally');

  const riceAfterUpdate = await updateInventoryItemQuantity(client, {
    inventoryItemId: rice.inventory_item_id,
    quantityGrams: 300,
    unit: 'g',
    lastUpdatedSource: 'manual',
  });
  assert.equal(riceAfterUpdate.quantity_grams, 300, 'absolute quantity updates should replace the stored amount');

  const chicken = await addInventoryItem(client, {
    userId: 'user_family_meal_demo',
    ingredientKey: 'chicken_breast',
    quantityGrams: 200,
    unit: 'g',
    storageType: 'fridge',
    perishabilityClass: 'short',
    lastUpdatedSource: 'manual',
    createdAt: '2026-04-25T00:00:00.000Z',
  });
  assert.equal(chicken.estimated_expiry_date, '2026-04-28', 'short shelf-life ingredients should derive bounded expiry dates');

  const soySauce = await addInventoryItem(client, {
    userId: 'user_family_meal_demo',
    productNameSnapshot: 'Soy sauce',
    ingredientKeySnapshot: 'soy_sauce',
    quantityUnits: 1,
    unit: 'bottle',
    storageType: 'pantry',
    perishabilityClass: 'long',
    lastUpdatedSource: 'manual',
  });
  assert.equal(soySauce.ingredient_id, null, 'fallback inventory tracking should allow product-level rows');
  assert.equal(soySauce.product_name_snapshot, 'Soy sauce');

  const activeBeforeZero = await listInventoryItems(client, {
    userId: 'user_family_meal_demo',
    includeEmpty: false,
  });
  assert.equal(activeBeforeZero.length, 3);

  await reduceInventoryItemQuantity(client, {
    inventoryItemId: rice.inventory_item_id,
    quantityGrams: 300,
    lastUpdatedSource: 'manual',
  });
  const zeroedRice = await getInventoryItemById(client, rice.inventory_item_id);
  assert.equal(zeroedRice.quantity_grams, 0, 'quantity falling to zero should soft-remove the item instead of deleting it');
  assert.equal(zeroedRice.estimated_remaining_ratio, 0);

  const activeAfterZero = await listInventoryItems(client, {
    inventoryId: inventory.inventory_id,
    includeEmpty: false,
  });
  assert.equal(activeAfterZero.length, 2, 'zeroed items should be hidden from default active inventory reads');

  const removedSoySauce = await removeInventoryItem(client, {
    inventoryItemId: soySauce.inventory_item_id,
    lastUpdatedSource: 'system',
  });
  assert.equal(removedSoySauce.quantity_units, 0);

  const seedClient = makeFixtureClient();
  const firstSeed = await seedInventoryForUser(seedClient, {
    userId: 'user_family_meal_demo',
  });
  const secondSeed = await seedInventoryForUser(seedClient, {
    userId: 'user_family_meal_demo',
  });
  assert.equal(firstSeed.events_written, buildDefaultSeedItems().length);
  assert.equal(secondSeed.events_written, buildDefaultSeedItems().length);
  const seededItems = await listInventoryItems(seedClient, {
    userId: 'user_family_meal_demo',
    includeEmpty: false,
    limit: 100,
  });
  const seededRice = seededItems.find((item) => item.ingredient_key_snapshot === 'rice');
  assert.equal(seededRice.quantity_grams, 500, 'seed reruns should reset deterministic fixture quantities instead of doubling them');

  assert.deepStrictEqual(parseArgs([
    '--user-id=user_family_meal_demo',
    '--dry-run',
    '--json',
    '--out=tmp/inventory1.json',
  ]), {
    userId: 'user_family_meal_demo',
    dryRun: true,
    json: true,
    out: 'tmp/inventory1.json',
  });

  const repositorySource = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'src', 'db', 'users', 'user_inventory_repository.js'),
    'utf8',
  );
  assert(!/generateMealPlan|buildMealPlanRequirements|optimizeBasket|lookupCanonicalProductPrices/i.test(repositorySource), 'INVENTORY1 must not change planner or basket behavior');
  assert(!/firestore/i.test(repositorySource), 'INVENTORY1 must not write Firestore');
  assert(client.state.commands.every((entry) => !/meal_plans|meal_plan_items|meal_plan_requirements|firestore/i.test(entry.sql)), 'INVENTORY1 must not touch planner tables or Firestore paths');

  console.log('INVENTORY1 user inventory tests passed');
}

function makeFixtureClient() {
  const state = buildFixtureState();
  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });

      if (normalizedSql === 'BEGIN' || normalizedSql === 'COMMIT' || normalizedSql === 'ROLLBACK') {
        return { rows: [] };
      }

      if (normalizedSql === 'SELECT * FROM user_food_profiles WHERE user_id = $1') {
        const profile = state.profilesByUserId.get(params[0]);
        return { rows: profile ? [profile] : [] };
      }
      if (normalizedSql === 'SELECT * FROM user_food_profiles WHERE profile_id = $1') {
        const profile = state.profilesById.get(params[0]);
        return { rows: profile ? [profile] : [] };
      }
      if (normalizedSql === 'SELECT * FROM user_inventories WHERE user_id = $1') {
        const inventory = state.inventoriesByUserId.get(params[0]);
        return { rows: inventory ? [inventory] : [] };
      }
      if (normalizedSql === 'SELECT * FROM user_inventories WHERE inventory_id = $1') {
        const inventory = state.inventoriesById.get(params[0]);
        return { rows: inventory ? [inventory] : [] };
      }
      if (normalizedSql.startsWith('INSERT INTO user_inventories')) {
        const row = {
          inventory_id: params[0],
          profile_id: params[1],
          user_id: params[2],
          inventory_key: params[3],
        };
        const existing = state.inventoriesByUserId.get(row.user_id);
        const stored = {
          ...(existing || {}),
          ...row,
          created_at: existing ? existing.created_at : nextTimestamp(state),
          updated_at: nextTimestamp(state),
        };
        state.inventoriesByUserId.set(stored.user_id, stored);
        state.inventoriesById.set(stored.inventory_id, stored);
        return { rows: [stored] };
      }
      if (normalizedSql === 'SELECT * FROM ingredients WHERE ingredient_key = $1') {
        const ingredient = state.ingredientsByKey.get(params[0]);
        return { rows: ingredient ? [ingredient] : [] };
      }
      if (normalizedSql === 'SELECT * FROM ingredients WHERE ingredient_id = $1') {
        const ingredient = state.ingredientsById.get(params[0]);
        return { rows: ingredient ? [ingredient] : [] };
      }
      if (normalizedSql === 'SELECT * FROM inventory_items WHERE inventory_id = $1 ORDER BY created_at ASC, inventory_item_id ASC') {
        const rows = [...state.inventoryItemsById.values()]
          .filter((row) => row.inventory_id === params[0])
          .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)) || String(left.inventory_item_id).localeCompare(String(right.inventory_item_id)));
        return { rows };
      }
      if (normalizedSql === 'SELECT * FROM inventory_items WHERE inventory_item_id = $1') {
        const row = state.inventoryItemsById.get(params[0]);
        return { rows: row ? [row] : [] };
      }
      if (normalizedSql.startsWith('INSERT INTO inventory_items')) {
        const existing = state.inventoryItemsById.get(params[0]);
        const stored = {
          inventory_item_id: params[0],
          inventory_id: params[1],
          ingredient_id: params[2],
          ingredient_key_snapshot: params[3],
          product_id: params[4],
          product_name_snapshot: params[5],
          quantity_grams: params[6],
          quantity_units: params[7],
          unit: params[8],
          estimated_remaining_ratio: params[9],
          storage_type: params[10],
          perishability_class: params[11],
          estimated_expiry_date: params[12],
          last_updated_source: params[13],
          created_at: existing ? existing.created_at : nextTimestamp(state),
          updated_at: nextTimestamp(state),
        };
        state.inventoryItemsById.set(stored.inventory_item_id, stored);
        return { rows: [stored] };
      }
      if (normalizedSql.startsWith('UPDATE inventory_items SET quantity_grams = 0,')) {
        const existing = state.inventoryItemsById.get(params[0]);
        const stored = {
          ...existing,
          quantity_grams: 0,
          quantity_units: 0,
          estimated_remaining_ratio: 0,
          last_updated_source: params[1],
          updated_at: nextTimestamp(state),
        };
        state.inventoryItemsById.set(stored.inventory_item_id, stored);
        return normalizedSql.includes('RETURNING *') ? { rows: [stored] } : { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function buildFixtureState() {
  const profile = {
    profile_id: 'user_food_profile:user_family_meal_demo',
    user_id: 'user_family_meal_demo',
  };
  const rice = {
    ingredient_id: 'ingredient:rice',
    ingredient_key: 'rice',
    name_en: 'Rice',
    shopping_unit: 'kg',
    tags_json: { shelf_life_days: 365 },
    state_defaults_json: {},
  };
  const chicken = {
    ingredient_id: 'ingredient:chicken',
    ingredient_key: 'chicken_breast',
    name_en: 'Chicken breast',
    shopping_unit: 'kg',
    tags_json: { shelf_life_days: 3 },
    state_defaults_json: {},
  };
  return {
    profilesByUserId: new Map([[profile.user_id, profile]]),
    profilesById: new Map([[profile.profile_id, profile]]),
    ingredientsByKey: new Map([
      [rice.ingredient_key, rice],
      [chicken.ingredient_key, chicken],
    ]),
    ingredientsById: new Map([
      [rice.ingredient_id, rice],
      [chicken.ingredient_id, chicken],
    ]),
    inventoriesByUserId: new Map(),
    inventoriesById: new Map(),
    inventoryItemsById: new Map(),
    commands: [],
    tick: 0,
  };
}

function nextTimestamp(state) {
  const base = new Date('2026-04-25T12:00:00.000Z');
  base.setUTCSeconds(base.getUTCSeconds() + state.tick);
  state.tick += 1;
  return base.toISOString();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
