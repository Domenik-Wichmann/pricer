const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MEAL_PLAN_REQUIREMENTS_RULES_VERSION,
  buildMealPlanRequirementKey,
  buildMealPlanRequirements,
  estimateShoppingQuantity,
  normalizeMealPlanRequirementOptions,
} = require('../app/functions/src');
const { parseArgs } = require('../scripts/plan2a_build_meal_plan_requirements');

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

      if (normalizedSql === 'SELECT * FROM meal_plans WHERE plan_id = $1') {
        return { rows: state.plan.plan_id === params[0] ? [state.plan] : [] };
      }
      if (normalizedSql === 'SELECT * FROM meal_plans WHERE plan_key = $1') {
        return { rows: state.plan.plan_key === params[0] ? [state.plan] : [] };
      }
      if (normalizedSql.startsWith('SELECT * FROM meal_plan_items')) {
        return { rows: state.mealPlanItems.filter((row) => row.plan_id === params[0]) };
      }
      if (normalizedSql.startsWith('SELECT ri.recipe_ingredient_id, ri.recipe_id, ri.ingredient_id, ri.matched_ingredient_id')) {
        const recipeIds = new Set(params[0] || []);
        return {
          rows: state.recipeIngredients
            .filter((row) => recipeIds.has(row.recipe_id))
            .map((row) => {
              const ingredient = state.ingredientsById.get(row.matched_ingredient_id || row.ingredient_id) || {};
              return {
                ...row,
                shopping_unit: ingredient.shopping_unit || null,
                grams_per_piece: ingredient.grams_per_piece ?? null,
              };
            }),
        };
      }
      if (normalizedSql.startsWith('INSERT INTO meal_plan_requirements')) {
        const row = mealPlanRequirementFromParams(params);
        const existing = state.requirementsByKey.get(row.requirement_key);
        const stored = {
          ...(existing || {}),
          ...row,
          requirement_id: existing ? existing.requirement_id : row.requirement_id,
          created_at: existing ? existing.created_at : '2026-04-25T12:00:00.000Z',
          updated_at: '2026-04-25T12:30:00.000Z',
        };
        state.requirementsByKey.set(stored.requirement_key, stored);
        return { rows: [stored] };
      }
      if (normalizedSql === 'DELETE FROM meal_plan_requirement_items WHERE requirement_id = $1') {
        state.requirementItemsByRequirementId.set(params[0], []);
        return { rows: [] };
      }
      if (normalizedSql.startsWith('INSERT INTO meal_plan_requirement_items')) {
        const row = mealPlanRequirementItemFromParams(params);
        const current = state.requirementItemsByRequirementId.get(row.requirement_id) || [];
        current.push(row);
        state.requirementItemsByRequirementId.set(row.requirement_id, current);
        return { rows: [row] };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function buildFixtureState() {
  const plan = {
    plan_id: 'meal_plan:demo',
    profile_id: 'user_food_profile:user_demo',
    user_id: 'user_demo',
    plan_key: 'meal_plan:demo:key',
    start_date: '2026-04-28',
    days: 2,
    meals_per_day: 3,
    target_calories_per_day: 2100,
    target_protein_g: 120,
    target_carbs_g: 220,
    target_fat_g: 70,
    generation_method: 'plan1_deterministic_meal_planner_v1',
    rules_version: 'plan1_meal_planner_rules_v1',
  };

  const mealPlanItems = [
    makeMealPlanItem(plan.plan_id, 0, 'breakfast', 'recipe:chicken_rice_bowl', 'chicken_rice_bowl'),
    makeMealPlanItem(plan.plan_id, 0, 'lunch', 'recipe:green_bean_chicken_plate', 'green_bean_chicken_plate'),
    makeMealPlanItem(plan.plan_id, 1, 'dinner', 'recipe:tomato_cucumber_salad', 'tomato_cucumber_salad'),
  ];

  const recipeIngredients = [
    makeRecipeIngredient('recipe:chicken_rice_bowl', '001', {
      ingredient_id: 'ingredient:chicken',
      matched_ingredient_id: 'ingredient:chicken',
      ingredient_key_snapshot: 'chicken_breast',
      display_name: 'chicken breast',
      quantity_grams: 300,
    }),
    makeRecipeIngredient('recipe:chicken_rice_bowl', '002', {
      ingredient_id: 'ingredient:rice',
      matched_ingredient_id: 'ingredient:rice',
      ingredient_key_snapshot: 'rice',
      display_name: 'rice',
      quantity_grams: 150,
    }),
    makeRecipeIngredient('recipe:chicken_rice_bowl', '003', {
      ingredient_id: 'ingredient:cucumber',
      matched_ingredient_id: 'ingredient:cucumber',
      ingredient_key_snapshot: 'cucumber',
      display_name: 'cucumber',
      quantity_grams: 200,
    }),
    makeRecipeIngredient('recipe:chicken_rice_bowl', '004', {
      ingredient_id: 'ingredient:salt',
      matched_ingredient_id: 'ingredient:salt',
      ingredient_key_snapshot: 'salt',
      display_name: 'salt',
      quantity_grams: 5,
    }),
    makeRecipeIngredient('recipe:green_bean_chicken_plate', '001', {
      ingredient_id: 'ingredient:chicken',
      matched_ingredient_id: 'ingredient:chicken',
      ingredient_key_snapshot: 'chicken_breast',
      display_name: 'chicken breast',
      quantity_grams: 250,
    }),
    makeRecipeIngredient('recipe:green_bean_chicken_plate', '002', {
      ingredient_id: 'ingredient:rice',
      matched_ingredient_id: 'ingredient:rice',
      ingredient_key_snapshot: 'rice',
      display_name: 'rice',
      quantity_grams: null,
    }),
    makeRecipeIngredient('recipe:green_bean_chicken_plate', '003', {
      ingredient_id: 'ingredient:cucumber',
      matched_ingredient_id: 'ingredient:cucumber',
      ingredient_key_snapshot: 'cucumber',
      display_name: 'cucumber',
      quantity_grams: 200,
    }),
    makeRecipeIngredient('recipe:green_bean_chicken_plate', '004', {
      ingredient_id: null,
      matched_ingredient_id: null,
      ingredient_key_snapshot: 'fresh_dill',
      display_name: 'fresh dill',
      quantity_grams: 10,
    }),
    makeRecipeIngredient('recipe:tomato_cucumber_salad', '001', {
      ingredient_id: null,
      matched_ingredient_id: null,
      ingredient_key_snapshot: 'fresh_dill',
      display_name: 'fresh dill',
      quantity_grams: 5,
    }),
    makeRecipeIngredient('recipe:tomato_cucumber_salad', '002', {
      ingredient_id: 'ingredient:parsley',
      matched_ingredient_id: 'ingredient:parsley',
      ingredient_key_snapshot: 'parsley',
      display_name: 'parsley',
      quantity_grams: null,
    }),
  ];

  return {
    plan,
    mealPlanItems,
    recipeIngredients,
    ingredientsById: new Map([
      ['ingredient:chicken', { ingredient_id: 'ingredient:chicken', shopping_unit: 'kg', grams_per_piece: null }],
      ['ingredient:rice', { ingredient_id: 'ingredient:rice', shopping_unit: 'kg', grams_per_piece: null }],
      ['ingredient:cucumber', { ingredient_id: 'ingredient:cucumber', shopping_unit: 'piece', grams_per_piece: 200 }],
      ['ingredient:salt', { ingredient_id: 'ingredient:salt', shopping_unit: 'g', grams_per_piece: null }],
      ['ingredient:parsley', { ingredient_id: 'ingredient:parsley', shopping_unit: 'g', grams_per_piece: null }],
    ]),
    requirementsByKey: new Map(),
    requirementItemsByRequirementId: new Map(),
    commands: [],
  };
}

function makeMealPlanItem(planId, dayIndex, mealType, recipeId, recipeKey) {
  return {
    item_id: `meal_plan_item:${dayIndex}:${mealType}:${recipeKey}`,
    plan_id: planId,
    day_index: dayIndex,
    meal_type: mealType,
    recipe_id: recipeId,
    recipe_key_snapshot: recipeKey,
  };
}

function makeRecipeIngredient(recipeId, suffix, overrides) {
  return {
    recipe_ingredient_id: `${recipeId}:ingredient:${suffix}`,
    recipe_id: recipeId,
    ingredient_id: null,
    matched_ingredient_id: null,
    ingredient_key_snapshot: null,
    display_name: null,
    quantity_grams: null,
    ...overrides,
  };
}

function mealPlanRequirementFromParams(params) {
  const columns = [
    'requirement_id',
    'plan_id',
    'profile_id',
    'user_id',
    'requirement_key',
    'generation_method',
    'rules_version',
  ];
  return Object.fromEntries(columns.map((column, index) => [column, params[index]]));
}

function mealPlanRequirementItemFromParams(params) {
  return {
    requirement_item_id: params[0],
    requirement_id: params[1],
    ingredient_id: params[2],
    ingredient_key_snapshot: params[3],
    display_name: params[4],
    total_quantity_grams: params[5],
    recipe_count: params[6],
    source_recipe_ids_json: JSON.parse(params[7]),
    source_recipe_ingredient_ids_json: JSON.parse(params[8]),
    shopping_unit: params[9],
    estimated_shopping_quantity: params[10],
    estimated_shopping_unit: params[11],
    has_canonical_ingredient: params[12],
    has_quantity_grams: params[13],
    adapter_status: params[14],
  };
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '023_plan2a_meal_plan_requirements.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS meal_plan_requirements'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS meal_plan_requirement_items'));
  assert(migration.includes('ready_for_product_mapping'));
  assert(migration.includes('missing_ingredient'));
  assert(migration.includes('missing_quantity'));
  assert(migration.includes('needs_review'));

  assert.deepStrictEqual(normalizeMealPlanRequirementOptions({
    planId: 'meal_plan:demo',
    dryRun: true,
  }), {
    plan_id: 'meal_plan:demo',
    plan_key: null,
    dry_run: true,
  });
  assert.throws(() => normalizeMealPlanRequirementOptions({ dryRun: true }), /plan_id or plan_key is required/);

  const keyA = buildMealPlanRequirementKey('meal_plan:demo', MEAL_PLAN_REQUIREMENTS_RULES_VERSION);
  const keyB = buildMealPlanRequirementKey('meal_plan:demo', MEAL_PLAN_REQUIREMENTS_RULES_VERSION);
  assert.equal(keyA, keyB, 'requirement key should be deterministic');

  assert.deepStrictEqual(estimateShoppingQuantity({
    total_quantity_grams: 550,
    shopping_unit: 'kg',
  }), {
    estimated_shopping_quantity: 0.55,
    estimated_shopping_unit: 'kg',
  });
  assert.deepStrictEqual(estimateShoppingQuantity({
    total_quantity_grams: 400,
    shopping_unit: 'piece',
    grams_per_piece: 200,
  }), {
    estimated_shopping_quantity: 2,
    estimated_shopping_unit: 'piece',
  });
  assert.deepStrictEqual(estimateShoppingQuantity({
    total_quantity_grams: 5,
    shopping_unit: 'g',
  }), {
    estimated_shopping_quantity: 5,
    estimated_shopping_unit: 'g',
  });

  const client = makeFixtureClient();
  const report = await buildMealPlanRequirements(client, {
    planId: 'meal_plan:demo',
  });
  assert.equal(report.plans_seen, 1);
  assert.equal(report.items_created, 6);
  assert.equal(report.ready_for_product_mapping, 3);
  assert.equal(report.missing_ingredient, 1);
  assert.equal(report.missing_quantity, 1);
  assert.equal(report.needs_review, 1);
  assert.equal(report.total_quantity_grams, 1120);
  assert.equal(client.state.requirementsByKey.size, 1);
  assert.equal(
    (client.state.requirementItemsByRequirementId.get(report.requirement.requirement_id) || []).length,
    6,
  );

  const chicken = report.items.find((item) => item.ingredient_id === 'ingredient:chicken');
  assert.equal(chicken.total_quantity_grams, 550, 'same ingredient should aggregate across recipes');
  assert.equal(chicken.estimated_shopping_quantity, 0.55);
  assert.equal(chicken.estimated_shopping_unit, 'kg');
  assert.equal(chicken.adapter_status, 'ready_for_product_mapping');
  assert.deepStrictEqual(
    chicken.source_recipe_ids_json,
    ['recipe:chicken_rice_bowl', 'recipe:green_bean_chicken_plate'],
  );
  assert.deepStrictEqual(
    chicken.source_recipe_ingredient_ids_json,
    [
      'recipe:chicken_rice_bowl:ingredient:001',
      'recipe:green_bean_chicken_plate:ingredient:001',
    ],
  );

  const cucumber = report.items.find((item) => item.ingredient_id === 'ingredient:cucumber');
  assert.equal(cucumber.total_quantity_grams, 400);
  assert.equal(cucumber.estimated_shopping_quantity, 2, 'piece conversion should use grams_per_piece when present');
  assert.equal(cucumber.estimated_shopping_unit, 'piece');

  const dill = report.items.find((item) => item.display_name === 'fresh dill');
  assert.equal(dill.ingredient_id, null);
  assert.equal(dill.total_quantity_grams, 15, 'NULL ingredient rows should aggregate by normalized display name or key snapshot');
  assert.equal(dill.adapter_status, 'missing_ingredient');
  assert.deepStrictEqual(
    dill.source_recipe_ids_json,
    ['recipe:green_bean_chicken_plate', 'recipe:tomato_cucumber_salad'],
  );

  const parsley = report.items.find((item) => item.ingredient_id === 'ingredient:parsley');
  assert.equal(parsley.total_quantity_grams, null);
  assert.equal(parsley.adapter_status, 'missing_quantity');
  assert.equal(parsley.has_quantity_grams, false);

  const rice = report.items.find((item) => item.ingredient_id === 'ingredient:rice');
  assert.equal(rice.total_quantity_grams, 150);
  assert.equal(rice.adapter_status, 'needs_review');
  assert.equal(rice.has_quantity_grams, false);
  assert.equal(rice.estimated_shopping_quantity, 0.15);
  assert.equal(rice.estimated_shopping_unit, 'kg');

  const rerun = await buildMealPlanRequirements(client, {
    planKey: 'meal_plan:demo:key',
  });
  assert.equal(rerun.requirement.requirement_key, report.requirement.requirement_key);
  assert.equal(client.state.requirementsByKey.size, 1, 'requirement upsert should stay idempotent');
  assert.equal(
    (client.state.requirementItemsByRequirementId.get(report.requirement.requirement_id) || []).length,
    6,
    'requirement-item rebuild should replace rows without duplicates',
  );

  const dryRunClient = makeFixtureClient();
  const dryRun = await buildMealPlanRequirements(dryRunClient, {
    planId: 'meal_plan:demo',
    dryRun: true,
  });
  assert.equal(dryRun.items_created, 6);
  assert.equal(dryRunClient.state.requirementsByKey.size, 0, 'dry-run should not persist requirement rows');

  assert.deepStrictEqual(parseArgs([
    '--plan-id=meal_plan:demo',
    '--dry-run',
    '--json',
    '--out=tmp/plan2a.json',
  ]), {
    planId: 'meal_plan:demo',
    planKey: null,
    dryRun: true,
    json: true,
    out: 'tmp/plan2a.json',
  });

  const source = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'src', 'db', 'planner', 'meal_plan_requirements_builder.js'),
    'utf8',
  );
  assert(!/optimizeBasket|lookupCanonicalProductPrices|lookupPricesForBasketPlan/i.test(source), 'PLAN2A must not call optimizer or price lookup paths');
  assert(client.state.commands.every((command) => !/firestore|canonical_products|product_daily_prices/i.test(command.sql)), 'PLAN2A must not touch Firestore or runtime product-price tables');

  console.log('PLAN2A meal-plan requirements tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
