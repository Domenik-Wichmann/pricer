const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MEAL_PLAN_NET_REQUIREMENTS_RULES_VERSION,
  buildMealPlanNetRequirementKey,
  buildMealPlanNetRequirements,
  normalizeMealPlanNetRequirementOptions,
} = require('../app/functions/src');
const { parseArgs } = require('../scripts/plan2a1_build_net_requirements');

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

      if (normalizedSql === 'SELECT * FROM meal_plan_requirements WHERE requirement_id = $1') {
        return { rows: state.requirement.requirement_id === params[0] ? [state.requirement] : [] };
      }
      if (normalizedSql === 'SELECT * FROM meal_plan_requirements WHERE requirement_key = $1') {
        return { rows: state.requirement.requirement_key === params[0] ? [state.requirement] : [] };
      }
      if (normalizedSql.startsWith('SELECT * FROM meal_plan_requirement_items')) {
        return { rows: state.requirementItems.filter((row) => row.requirement_id === params[0]) };
      }
      if (normalizedSql === 'SELECT * FROM user_inventories WHERE user_id = $1') {
        return { rows: state.inventory.user_id === params[0] ? [state.inventory] : [] };
      }
      if (normalizedSql === 'SELECT * FROM user_inventories WHERE profile_id = $1') {
        return { rows: state.inventory.profile_id === params[0] ? [state.inventory] : [] };
      }
      if (normalizedSql.startsWith('SELECT * FROM inventory_items')) {
        return {
          rows: state.inventoryItems.filter((row) => (
            row.inventory_id === params[0]
            && Number(row.quantity_grams || 0) > 0
          )),
        };
      }
      if (normalizedSql.startsWith('SELECT ingredient_id, shopping_unit, grams_per_piece FROM ingredients')) {
        const ids = new Set(params[0] || []);
        return {
          rows: state.ingredients.filter((row) => ids.has(row.ingredient_id)),
        };
      }
      if (normalizedSql.startsWith('INSERT INTO meal_plan_net_requirements')) {
        const row = mealPlanNetRequirementFromParams(params);
        const existing = state.netRequirementsByKey.get(row.net_requirement_key);
        const stored = {
          ...(existing || {}),
          ...row,
          net_requirement_id: existing ? existing.net_requirement_id : row.net_requirement_id,
          created_at: existing ? existing.created_at : '2026-04-25T12:00:00.000Z',
          updated_at: '2026-04-25T12:30:00.000Z',
        };
        state.netRequirementsByKey.set(stored.net_requirement_key, stored);
        return { rows: [stored] };
      }
      if (normalizedSql === 'DELETE FROM meal_plan_net_requirement_items WHERE net_requirement_id = $1') {
        state.netRequirementItemsByNetRequirementId.set(params[0], []);
        return { rows: [] };
      }
      if (normalizedSql.startsWith('INSERT INTO meal_plan_net_requirement_items')) {
        const row = mealPlanNetRequirementItemFromParams(params);
        const current = state.netRequirementItemsByNetRequirementId.get(row.net_requirement_id) || [];
        current.push(row);
        state.netRequirementItemsByNetRequirementId.set(row.net_requirement_id, current);
        return { rows: [row] };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function buildFixtureState() {
  const requirement = {
    requirement_id: 'meal_plan_requirement:demo',
    plan_id: 'meal_plan:demo',
    profile_id: 'user_food_profile:user_demo',
    user_id: 'user_demo',
    requirement_key: 'meal_plan_requirement:demo:key',
    generation_method: 'plan2a_meal_plan_requirements_builder_v1',
    rules_version: 'plan2a_meal_plan_requirements_rules_v1',
  };

  const requirementItems = [
    makeRequirementItem(requirement.requirement_id, '001', {
      ingredient_id: 'ingredient:rice',
      ingredient_key_snapshot: 'rice',
      display_name: 'rice',
      total_quantity_grams: 500,
      shopping_unit: 'kg',
      estimated_shopping_quantity: 0.5,
      estimated_shopping_unit: 'kg',
      has_canonical_ingredient: true,
      has_quantity_grams: true,
      adapter_status: 'ready_for_product_mapping',
      source_recipe_ids_json: ['recipe:a', 'recipe:b'],
      source_recipe_ingredient_ids_json: ['ri:a:rice', 'ri:b:rice'],
    }),
    makeRequirementItem(requirement.requirement_id, '002', {
      ingredient_id: 'ingredient:chicken',
      ingredient_key_snapshot: 'chicken_breast',
      display_name: 'chicken breast',
      total_quantity_grams: 350,
      shopping_unit: 'kg',
      estimated_shopping_quantity: 0.35,
      estimated_shopping_unit: 'kg',
      has_canonical_ingredient: true,
      has_quantity_grams: true,
      adapter_status: 'ready_for_product_mapping',
      source_recipe_ids_json: ['recipe:a'],
      source_recipe_ingredient_ids_json: ['ri:a:chicken'],
    }),
    makeRequirementItem(requirement.requirement_id, '003', {
      ingredient_id: 'ingredient:cucumber',
      ingredient_key_snapshot: 'cucumber',
      display_name: 'cucumber',
      total_quantity_grams: 400,
      shopping_unit: 'piece',
      estimated_shopping_quantity: 2,
      estimated_shopping_unit: 'piece',
      has_canonical_ingredient: true,
      has_quantity_grams: true,
      adapter_status: 'ready_for_product_mapping',
      source_recipe_ids_json: ['recipe:c'],
      source_recipe_ingredient_ids_json: ['ri:c:cucumber'],
    }),
    makeRequirementItem(requirement.requirement_id, '004', {
      ingredient_id: null,
      ingredient_key_snapshot: 'fresh_dill',
      display_name: 'fresh dill',
      total_quantity_grams: 30,
      shopping_unit: 'g',
      estimated_shopping_quantity: 30,
      estimated_shopping_unit: 'g',
      has_canonical_ingredient: false,
      has_quantity_grams: true,
      adapter_status: 'missing_ingredient',
      source_recipe_ids_json: ['recipe:a'],
      source_recipe_ingredient_ids_json: ['ri:a:dill'],
    }),
    makeRequirementItem(requirement.requirement_id, '005', {
      ingredient_id: 'ingredient:parsley',
      ingredient_key_snapshot: 'parsley',
      display_name: 'parsley',
      total_quantity_grams: null,
      shopping_unit: 'g',
      estimated_shopping_quantity: null,
      estimated_shopping_unit: 'g',
      has_canonical_ingredient: true,
      has_quantity_grams: false,
      adapter_status: 'missing_quantity',
      source_recipe_ids_json: ['recipe:d'],
      source_recipe_ingredient_ids_json: ['ri:d:parsley'],
    }),
    makeRequirementItem(requirement.requirement_id, '006', {
      ingredient_id: 'ingredient:soy_sauce',
      ingredient_key_snapshot: 'soy_sauce',
      display_name: 'soy sauce',
      total_quantity_grams: 120,
      shopping_unit: 'g',
      estimated_shopping_quantity: 120,
      estimated_shopping_unit: 'g',
      has_canonical_ingredient: true,
      has_quantity_grams: true,
      adapter_status: 'ready_for_product_mapping',
      source_recipe_ids_json: ['recipe:e'],
      source_recipe_ingredient_ids_json: ['ri:e:soy'],
    }),
  ];

  const inventory = {
    inventory_id: 'user_inventory:user_demo',
    profile_id: requirement.profile_id,
    user_id: requirement.user_id,
    inventory_key: 'inventory:user_demo',
  };

  const inventoryItems = [
    makeInventoryItem(inventory.inventory_id, '001', {
      ingredient_id: 'ingredient:rice',
      ingredient_key_snapshot: 'rice',
      quantity_grams: 200,
      unit: 'g',
    }),
    makeInventoryItem(inventory.inventory_id, '002', {
      ingredient_id: 'ingredient:chicken',
      ingredient_key_snapshot: 'chicken_breast',
      quantity_grams: 500,
      unit: 'g',
    }),
    makeInventoryItem(inventory.inventory_id, '003', {
      ingredient_id: 'ingredient:cucumber',
      ingredient_key_snapshot: 'cucumber',
      quantity_grams: 200,
      unit: 'g',
    }),
    makeInventoryItem(inventory.inventory_id, '004', {
      ingredient_id: null,
      ingredient_key_snapshot: 'fresh_dill',
      quantity_grams: 25,
      unit: 'g',
    }),
    makeInventoryItem(inventory.inventory_id, '005', {
      ingredient_id: 'ingredient:soy_sauce',
      ingredient_key_snapshot: 'soy_sauce',
      quantity_grams: 0,
      unit: 'g',
    }),
  ];

  return {
    requirement,
    requirementItems,
    inventory,
    inventoryItems,
    ingredients: [
      { ingredient_id: 'ingredient:rice', shopping_unit: 'kg', grams_per_piece: null },
      { ingredient_id: 'ingredient:chicken', shopping_unit: 'kg', grams_per_piece: null },
      { ingredient_id: 'ingredient:cucumber', shopping_unit: 'piece', grams_per_piece: 200 },
      { ingredient_id: 'ingredient:parsley', shopping_unit: 'g', grams_per_piece: null },
      { ingredient_id: 'ingredient:soy_sauce', shopping_unit: 'g', grams_per_piece: null },
    ],
    netRequirementsByKey: new Map(),
    netRequirementItemsByNetRequirementId: new Map(),
    commands: [],
  };
}

function makeRequirementItem(requirementId, suffix, overrides) {
  return {
    requirement_item_id: `meal_plan_requirement_item:${suffix}`,
    requirement_id: requirementId,
    ingredient_id: null,
    ingredient_key_snapshot: null,
    display_name: null,
    total_quantity_grams: null,
    recipe_count: 1,
    source_recipe_ids_json: [],
    source_recipe_ingredient_ids_json: [],
    shopping_unit: null,
    estimated_shopping_quantity: null,
    estimated_shopping_unit: null,
    has_canonical_ingredient: false,
    has_quantity_grams: false,
    adapter_status: 'needs_review',
    ...overrides,
  };
}

function makeInventoryItem(inventoryId, suffix, overrides) {
  return {
    inventory_item_id: `inventory_item:${suffix}`,
    inventory_id: inventoryId,
    ingredient_id: null,
    ingredient_key_snapshot: null,
    quantity_grams: null,
    quantity_units: null,
    unit: 'g',
    estimated_remaining_ratio: 1,
    created_at: `2026-04-25T12:0${suffix}:00.000Z`,
    ...overrides,
  };
}

function mealPlanNetRequirementFromParams(params) {
  const columns = [
    'net_requirement_id',
    'requirement_id',
    'plan_id',
    'profile_id',
    'user_id',
    'net_requirement_key',
    'generation_method',
    'rules_version',
  ];
  return Object.fromEntries(columns.map((column, index) => [column, params[index]]));
}

function mealPlanNetRequirementItemFromParams(params) {
  return {
    net_requirement_item_id: params[0],
    net_requirement_id: params[1],
    requirement_item_id: params[2],
    ingredient_id: params[3],
    ingredient_key_snapshot: params[4],
    display_name: params[5],
    required_quantity_grams: params[6],
    inventory_applied_grams: params[7],
    net_quantity_grams: params[8],
    inventory_item_ids_json: JSON.parse(params[9]),
    source_recipe_ids_json: JSON.parse(params[10]),
    source_recipe_ingredient_ids_json: JSON.parse(params[11]),
    shopping_unit: params[12],
    estimated_shopping_quantity: params[13],
    estimated_shopping_unit: params[14],
    inventory_status: params[15],
    adapter_status: params[16],
  };
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '025_plan2a1_inventory_adjusted_requirements.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS meal_plan_net_requirements'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS meal_plan_net_requirement_items'));
  assert(migration.includes('fully_covered'));
  assert(migration.includes('partially_covered'));
  assert(migration.includes('covered_by_inventory'));
  assert(migration.includes('ready_for_product_mapping'));

  assert.deepStrictEqual(normalizeMealPlanNetRequirementOptions({
    requirementId: 'meal_plan_requirement:demo',
    dryRun: true,
  }), {
    requirement_id: 'meal_plan_requirement:demo',
    requirement_key: null,
    dry_run: true,
  });
  assert.throws(() => normalizeMealPlanNetRequirementOptions({ dryRun: true }), /requirement_id or requirement_key is required/);

  const keyA = buildMealPlanNetRequirementKey(
    'meal_plan_requirement:demo',
    MEAL_PLAN_NET_REQUIREMENTS_RULES_VERSION,
  );
  const keyB = buildMealPlanNetRequirementKey(
    'meal_plan_requirement:demo',
    MEAL_PLAN_NET_REQUIREMENTS_RULES_VERSION,
  );
  assert.equal(keyA, keyB, 'net requirement key should be deterministic');

  const client = makeFixtureClient();
  const inventorySnapshot = JSON.parse(JSON.stringify(client.state.inventoryItems));
  const report = await buildMealPlanNetRequirements(client, {
    requirementId: 'meal_plan_requirement:demo',
  });
  assert.equal(report.requirements_seen, 1);
  assert.equal(report.net_requirements_created, 1);
  assert.equal(report.items_created, 6);
  assert.equal(report.fully_covered, 1);
  assert.equal(report.partially_covered, 2);
  assert.equal(report.no_inventory, 1);
  assert.equal(report.missing_ingredient, 1);
  assert.equal(report.missing_quantity, 1);
  assert.equal(report.ready_for_product_mapping, 3);
  assert.equal(report.covered_by_inventory, 1);
  assert.equal(report.total_required_grams, 1400);
  assert.equal(report.total_inventory_applied_grams, 775);
  assert.equal(report.total_net_grams, 625);
  assert.equal(client.state.netRequirementsByKey.size, 1);
  assert.equal(
    (client.state.netRequirementItemsByNetRequirementId.get(report.net_requirement.net_requirement_id) || []).length,
    6,
  );

  const rice = report.items.find((item) => item.ingredient_id === 'ingredient:rice');
  assert.equal(rice.required_quantity_grams, 500);
  assert.equal(rice.inventory_applied_grams, 200, 'inventory should subtract by ingredient_id first');
  assert.equal(rice.net_quantity_grams, 300);
  assert.equal(rice.inventory_status, 'partially_covered');
  assert.equal(rice.adapter_status, 'ready_for_product_mapping');
  assert.equal(rice.estimated_shopping_quantity, 0.3);
  assert.equal(rice.estimated_shopping_unit, 'kg');

  const chicken = report.items.find((item) => item.ingredient_id === 'ingredient:chicken');
  assert.equal(chicken.inventory_applied_grams, 350);
  assert.equal(chicken.net_quantity_grams, 0, 'fully covered item should net to zero');
  assert.equal(chicken.inventory_status, 'fully_covered');
  assert.equal(chicken.adapter_status, 'covered_by_inventory');
  assert.equal(chicken.estimated_shopping_quantity, null);

  const cucumber = report.items.find((item) => item.ingredient_id === 'ingredient:cucumber');
  assert.equal(cucumber.net_quantity_grams, 200);
  assert.equal(cucumber.estimated_shopping_quantity, 1, 'piece estimate should be recomputed from net grams');
  assert.equal(cucumber.estimated_shopping_unit, 'piece');

  const dill = report.items.find((item) => item.display_name === 'fresh dill');
  assert.equal(dill.ingredient_id, null);
  assert.equal(dill.inventory_applied_grams, 25, 'fallback inventory match should use ingredient_key_snapshot');
  assert.equal(dill.net_quantity_grams, 5);
  assert.equal(dill.inventory_status, 'missing_ingredient');
  assert.equal(dill.adapter_status, 'missing_ingredient');
  assert.deepStrictEqual(dill.inventory_item_ids_json, ['inventory_item:004']);

  const parsley = report.items.find((item) => item.ingredient_id === 'ingredient:parsley');
  assert.equal(parsley.required_quantity_grams, null);
  assert.equal(parsley.inventory_applied_grams, 0);
  assert.equal(parsley.net_quantity_grams, null);
  assert.equal(parsley.inventory_status, 'missing_quantity');
  assert.equal(parsley.adapter_status, 'missing_quantity');

  const soySauce = report.items.find((item) => item.ingredient_id === 'ingredient:soy_sauce');
  assert.equal(soySauce.inventory_applied_grams, 0);
  assert.equal(soySauce.net_quantity_grams, 120);
  assert.equal(soySauce.inventory_status, 'no_inventory');
  assert.equal(soySauce.adapter_status, 'ready_for_product_mapping');

  assert.deepStrictEqual(client.state.inventoryItems, inventorySnapshot, 'inventory must not be mutated by net requirement planning');

  const rerun = await buildMealPlanNetRequirements(client, {
    requirementKey: 'meal_plan_requirement:demo:key',
  });
  assert.equal(rerun.net_requirement.net_requirement_key, report.net_requirement.net_requirement_key);
  assert.equal(client.state.netRequirementsByKey.size, 1, 'net requirement upsert should stay idempotent');
  assert.equal(
    (client.state.netRequirementItemsByNetRequirementId.get(report.net_requirement.net_requirement_id) || []).length,
    6,
    'net requirement item rebuild should replace rows without duplicates',
  );

  const dryRunClient = makeFixtureClient();
  const dryRun = await buildMealPlanNetRequirements(dryRunClient, {
    requirementId: 'meal_plan_requirement:demo',
    dryRun: true,
  });
  assert.equal(dryRun.items_created, 6);
  assert.equal(dryRunClient.state.netRequirementsByKey.size, 0, 'dry-run should not persist net requirement rows');

  assert.deepStrictEqual(parseArgs([
    '--requirement-id=meal_plan_requirement:demo',
    '--dry-run',
    '--json',
    '--out=tmp/plan2a1.json',
  ]), {
    requirementId: 'meal_plan_requirement:demo',
    requirementKey: null,
    dryRun: true,
    json: true,
    out: 'tmp/plan2a1.json',
  });

  const source = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'src', 'db', 'planner', 'meal_plan_net_requirements_builder.js'),
    'utf8',
  );
  assert(!/optimizeBasket|lookupCanonicalProductPrices|lookupPricesForBasketPlan/i.test(source), 'PLAN2A.1 must not call optimizer or price lookup paths');
  assert(client.state.commands.every((command) => !/firestore|canonical_products|product_daily_prices/i.test(command.sql)), 'PLAN2A.1 must not touch Firestore or runtime product-price tables');

  console.log('PLAN2A.1 inventory-adjusted meal-plan requirement tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
