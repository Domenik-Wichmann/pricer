const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildMealPlanKey,
  generateMealPlan,
  normalizeMealPlanOptions,
} = require('../app/functions/src');
const { parseArgs } = require('../scripts/plan1_generate_meal_plan');

function makeFixtureClient({ includeTasteSnapshot = true } = {}) {
  const state = buildFixtureState({ includeTasteSnapshot });
  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });

      if (normalizedSql === 'BEGIN' || normalizedSql === 'COMMIT' || normalizedSql === 'ROLLBACK') {
        return { rows: [] };
      }

      if (normalizedSql === 'SELECT * FROM user_food_profiles WHERE user_id = $1') {
        return { rows: state.profile.user_id === params[0] ? [state.profile] : [] };
      }
      if (normalizedSql === 'SELECT * FROM user_food_profiles WHERE profile_id = $1') {
        return { rows: state.profile.profile_id === params[0] ? [state.profile] : [] };
      }
      if (normalizedSql.startsWith('SELECT * FROM user_food_constraints')) {
        return { rows: state.constraints.slice(0, Number(params[params.length - 1])) };
      }
      if (normalizedSql.startsWith('SELECT * FROM user_food_preferences')) {
        return { rows: state.preferences.slice(0, Number(params[params.length - 1])) };
      }
      if (normalizedSql.startsWith('SELECT * FROM user_equipment')) {
        return { rows: state.equipment.slice(0, Number(params[params.length - 1])) };
      }
      if (normalizedSql.startsWith('SELECT * FROM user_taste_profile_snapshots')) {
        return { rows: includeTasteSnapshot ? [state.tasteSnapshot] : [] };
      }

      if (normalizedSql.startsWith('SELECT r.recipe_id, r.recipe_key, r.title_en, r.title_bg, r.canonical_title')) {
        return {
          rows: state.recipes
            .filter((recipe) => (
              state.approvedRecipeNutritionIds.has(recipe.recipe_id)
              && ['usable', 'meal_plan_ready'].includes(recipe.usability_status)
            ))
            .map((recipe) => ({
              ...recipe,
              cuisine_tags_json: recipe.cuisine_tags_json,
              dietary_tags_json: recipe.dietary_tags_json,
              meal_type_tags_json: recipe.meal_type_tags_json,
            })),
        };
      }

      if (normalizedSql.startsWith('SELECT ri.recipe_id, ri.recipe_ingredient_id, ri.sort_order')) {
        return {
          rows: state.recipeIngredients.map((line) => {
            const ingredient = state.ingredientsById.get(line.matched_ingredient_id || line.ingredient_id) || {};
            return {
              ...line,
              ingredient_key: ingredient.ingredient_key || null,
              food_family: ingredient.food_family || null,
              tags_json: ingredient.tags_json || [],
              allergen_flags_json: ingredient.allergen_flags_json || {},
            };
          }),
        };
      }

      if (normalizedSql.startsWith('SELECT recipe_id, recipe_step_id, step_number, duration_minutes, equipment_tags_json FROM recipe_steps')) {
        return { rows: state.recipeSteps };
      }

      if (normalizedSql.startsWith('SELECT ph.recipe_id, ph.staged_recipe_id, ph.created_at, ph.id AS promotion_history_id')) {
        return {
          rows: state.recipeMetadata.map((row) => ({
            ...row,
            region_tags_json: row.region_tags_json,
            feeling_tags_json: row.feeling_tags_json,
            flavor_profile_json: row.flavor_profile_json,
            texture_profile_json: row.texture_profile_json,
          })),
        };
      }

      if (normalizedSql.startsWith('SELECT staged_recipe_id, staged_recipe_method_id, method_key, method_name_en FROM recipe_ingest_staged_methods')) {
        return { rows: state.recipeMethods };
      }

      if (normalizedSql.startsWith('SELECT staged_recipe_id, staged_recipe_tag_id, tag_type, tag_key, tag_value FROM recipe_ingest_staged_tags')) {
        return { rows: state.recipeTags };
      }

      if (normalizedSql.startsWith('INSERT INTO meal_plans')) {
        const row = mealPlanFromParams(params);
        const existing = state.plansByKey.get(row.plan_key);
        const stored = {
          ...(existing || {}),
          ...row,
          plan_id: existing ? existing.plan_id : row.plan_id,
          created_at: existing ? existing.created_at : '2026-04-25T12:00:00.000Z',
        };
        state.plansByKey.set(stored.plan_key, stored);
        return { rows: [stored] };
      }

      if (normalizedSql === 'DELETE FROM meal_plan_items WHERE plan_id = $1') {
        state.mealPlanItemsByPlanId.set(params[0], []);
        return { rows: [] };
      }

      if (normalizedSql.startsWith('INSERT INTO meal_plan_items')) {
        const row = mealPlanItemFromParams(params);
        const current = state.mealPlanItemsByPlanId.get(row.plan_id) || [];
        current.push(row);
        state.mealPlanItemsByPlanId.set(row.plan_id, current);
        return { rows: [row] };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function buildFixtureState({ includeTasteSnapshot }) {
  const profile = {
    profile_id: 'user_food_profile:user_demo',
    user_id: 'user_demo',
    household_size: 2,
    default_servings: 2,
    weekly_budget_amount: 100,
    weekly_budget_currency: 'EUR',
    preferred_language: 'en',
    cooking_skill_level: 'intermediate',
    max_prep_time_minutes: 25,
    max_total_time_minutes: 40,
    meal_prep_preference: 'family_style',
    nutrition_goal: 'balanced',
    daily_calorie_target: 2100,
    protein_target_g: 120,
    carbs_target_g: 210,
    fat_target_g: 70,
    fiber_target_g: 30,
    sodium_limit_mg: 2300,
    review_status: 'active',
  };

  const constraints = [
    {
      constraint_id: 'constraint:allergy:peanut',
      profile_id: profile.profile_id,
      constraint_type: 'allergy',
      target_type: 'ingredient',
      target_key: 'peanut',
      severity: 'hard',
      notes: 'Hard allergy.',
    },
    {
      constraint_id: 'constraint:avoid:spicy',
      profile_id: profile.profile_id,
      constraint_type: 'avoid',
      target_type: 'tag',
      target_key: 'spicy',
      severity: 'hard',
      notes: 'Low-spice household.',
    },
    {
      constraint_id: 'constraint:dislike:mushroom',
      profile_id: profile.profile_id,
      constraint_type: 'dislike',
      target_type: 'ingredient',
      target_key: 'mushroom',
      severity: 'soft',
      notes: 'Soft dislike only.',
    },
  ];

  const preferences = [
    {
      preference_id: 'pref:cuisine:mediterranean',
      profile_id: profile.profile_id,
      preference_type: 'cuisine',
      preference_key: 'mediterranean',
      preference_score: 0.8,
      source: 'explicit',
      confidence: 1,
    },
    {
      preference_id: 'pref:flavor:savory',
      profile_id: profile.profile_id,
      preference_type: 'flavor',
      preference_key: 'savory',
      preference_score: 0.7,
      source: 'explicit',
      confidence: 1,
    },
  ];

  const equipment = [
    {
      equipment_id: 'equipment:oven',
      profile_id: profile.profile_id,
      equipment_key: 'oven',
      available: true,
      notes: null,
    },
    {
      equipment_id: 'equipment:slow_cooker',
      profile_id: profile.profile_id,
      equipment_key: 'slow_cooker',
      available: false,
      notes: 'Not available.',
    },
  ];

  const tasteSnapshot = includeTasteSnapshot ? {
    snapshot_id: 'taste_profile_snapshot:user_demo:0001',
    profile_id: profile.profile_id,
    user_id: profile.user_id,
    snapshot_version: 1,
    flavor_vector_json: { savory: 0.8, mild: 0.6, spicy: -1 },
    texture_vector_json: { smooth: 0.5, crunchy: 0.3 },
    cuisine_vector_json: { mediterranean: 0.9, comfort: 0.5 },
    region_vector_json: {},
    feeling_vector_json: { cozy: 0.8, family_friendly: 0.7 },
    meal_type_vector_json: { breakfast: 0.8, lunch: 0.6, dinner: 0.7 },
    cooking_method_vector_json: { baked: 0.7, skillet: 0.5, assemble: 0.6 },
    dietary_pattern_json: {},
    disliked_patterns_json: {},
    preferred_constraints_json: {},
    confidence_json: { level: 'medium' },
  } : null;

  const recipes = [
    makeRecipe({
      recipe_key: 'apple_yogurt_bowl',
      meal_type_tags_json: ['breakfast'],
      cuisine_tags_json: ['mediterranean'],
      per_serving_kcal: 430,
      per_serving_protein_g: 22,
      per_serving_carbs_g: 48,
      per_serving_fat_g: 12,
      primaryFlavor: 'mild',
      primaryTexture: 'smooth',
      feeling: ['cozy'],
      methods: ['assemble'],
      prep: 5,
      total: 5,
    }),
    makeRecipe({
      recipe_key: 'rice_milk_poridge',
      meal_type_tags_json: ['breakfast'],
      cuisine_tags_json: ['comfort'],
      per_serving_kcal: 400,
      per_serving_protein_g: 18,
      per_serving_carbs_g: 58,
      per_serving_fat_g: 9,
      primaryFlavor: 'mild',
      primaryTexture: 'smooth',
      feeling: ['cozy'],
      methods: ['stovetop'],
      prep: 8,
      total: 15,
    }),
    makeRecipe({
      recipe_key: 'chicken_rice_bowl',
      meal_type_tags_json: ['lunch'],
      cuisine_tags_json: ['mediterranean'],
      per_serving_kcal: 610,
      per_serving_protein_g: 44,
      per_serving_carbs_g: 62,
      per_serving_fat_g: 18,
      primaryFlavor: 'savory',
      primaryTexture: 'crunchy',
      feeling: ['cozy'],
      methods: ['skillet'],
      prep: 15,
      total: 25,
    }),
    makeRecipe({
      recipe_key: 'tomato_cucumber_salad',
      meal_type_tags_json: ['lunch', 'snack'],
      cuisine_tags_json: ['mediterranean'],
      per_serving_kcal: 350,
      per_serving_protein_g: 10,
      per_serving_carbs_g: 34,
      per_serving_fat_g: 16,
      primaryFlavor: 'mild',
      primaryTexture: 'crunchy',
      feeling: ['family_friendly'],
      methods: ['assemble'],
      prep: 10,
      total: 10,
    }),
    makeRecipe({
      recipe_key: 'green_bean_chicken_plate',
      meal_type_tags_json: ['dinner'],
      cuisine_tags_json: ['mediterranean'],
      per_serving_kcal: 640,
      per_serving_protein_g: 48,
      per_serving_carbs_g: 52,
      per_serving_fat_g: 21,
      primaryFlavor: 'savory',
      primaryTexture: 'crunchy',
      feeling: ['cozy', 'family_friendly'],
      methods: ['baked'],
      prep: 20,
      total: 35,
    }),
    makeRecipe({
      recipe_key: 'pork_potato_stew',
      meal_type_tags_json: ['dinner'],
      cuisine_tags_json: ['comfort'],
      per_serving_kcal: 690,
      per_serving_protein_g: 36,
      per_serving_carbs_g: 54,
      per_serving_fat_g: 28,
      primaryFlavor: 'savory',
      primaryTexture: 'smooth',
      feeling: ['cozy', 'family_friendly'],
      methods: ['stovetop'],
      prep: 20,
      total: 40,
    }),
    makeRecipe({
      recipe_key: 'spicy_peanut_noodles',
      meal_type_tags_json: ['lunch', 'dinner'],
      cuisine_tags_json: ['mediterranean'],
      per_serving_kcal: 720,
      per_serving_protein_g: 24,
      per_serving_carbs_g: 70,
      per_serving_fat_g: 32,
      primaryFlavor: 'spicy',
      primaryTexture: 'smooth',
      feeling: ['cozy'],
      methods: ['skillet'],
      prep: 15,
      total: 20,
    }),
    makeRecipe({
      recipe_key: 'slow_cooker_stew',
      meal_type_tags_json: ['dinner'],
      cuisine_tags_json: ['comfort'],
      per_serving_kcal: 650,
      per_serving_protein_g: 34,
      per_serving_carbs_g: 52,
      per_serving_fat_g: 24,
      primaryFlavor: 'savory',
      primaryTexture: 'smooth',
      feeling: ['cozy'],
      methods: ['slow_cooker'],
      prep: 10,
      total: 35,
      equipment: ['slow_cooker'],
    }),
    makeRecipe({
      recipe_key: 'no_profile_stir_fry',
      meal_type_tags_json: ['lunch'],
      cuisine_tags_json: ['mediterranean'],
      per_serving_kcal: 500,
      per_serving_protein_g: 28,
      per_serving_carbs_g: 50,
      per_serving_fat_g: 16,
      primaryFlavor: 'savory',
      primaryTexture: 'crunchy',
      feeling: ['family_friendly'],
      methods: ['skillet'],
      prep: 12,
      total: 18,
    }),
  ];

  const recipeIngredients = [
    makeRecipeIngredient('recipe:apple_yogurt_bowl', 'ingredient:apple'),
    makeRecipeIngredient('recipe:apple_yogurt_bowl', 'ingredient:yogurt'),
    makeRecipeIngredient('recipe:rice_milk_poridge', 'ingredient:rice'),
    makeRecipeIngredient('recipe:rice_milk_poridge', 'ingredient:milk'),
    makeRecipeIngredient('recipe:chicken_rice_bowl', 'ingredient:chicken'),
    makeRecipeIngredient('recipe:chicken_rice_bowl', 'ingredient:rice'),
    makeRecipeIngredient('recipe:tomato_cucumber_salad', 'ingredient:tomato'),
    makeRecipeIngredient('recipe:tomato_cucumber_salad', 'ingredient:cucumber'),
    makeRecipeIngredient('recipe:green_bean_chicken_plate', 'ingredient:green_beans'),
    makeRecipeIngredient('recipe:green_bean_chicken_plate', 'ingredient:chicken'),
    makeRecipeIngredient('recipe:pork_potato_stew', 'ingredient:pork'),
    makeRecipeIngredient('recipe:pork_potato_stew', 'ingredient:potato'),
    makeRecipeIngredient('recipe:spicy_peanut_noodles', 'ingredient:peanut'),
    makeRecipeIngredient('recipe:spicy_peanut_noodles', 'ingredient:rice'),
    makeRecipeIngredient('recipe:slow_cooker_stew', 'ingredient:potato'),
    makeRecipeIngredient('recipe:no_profile_stir_fry', 'ingredient:chicken'),
  ];

  const recipeSteps = recipes.map((recipe) => ({
    recipe_id: recipe.recipe_id,
    recipe_step_id: `${recipe.recipe_id}:step:1`,
    step_number: 1,
    duration_minutes: recipe.total_time_minutes,
    equipment_tags_json: recipe.equipment_tags_json || [],
  }));

  const recipeMetadata = recipes.map((recipe) => ({
    recipe_id: recipe.recipe_id,
    staged_recipe_id: `staged:${recipe.recipe_key}`,
    created_at: '2026-04-25T12:00:00.000Z',
    promotion_history_id: `promotion:${recipe.recipe_key}`,
    region_tags_json: [],
    feeling_tags_json: recipe.feeling_tags_json || [],
    flavor_profile_json: recipe.flavor_profile_json || {},
    texture_profile_json: recipe.texture_profile_json || {},
    prep_time_minutes: recipe.prep_time_minutes,
    cook_time_minutes: null,
    total_time_minutes: recipe.total_time_minutes,
  }));

  const recipeMethods = recipes.flatMap((recipe, index) => (
    (recipe.method_keys || []).map((methodKey, methodIndex) => ({
      staged_recipe_id: `staged:${recipe.recipe_key}`,
      staged_recipe_method_id: `method:${index}:${methodIndex}`,
      method_key: methodKey,
      method_name_en: methodKey,
    }))
  ));
  const recipeTags = recipes.flatMap((recipe, index) => (
    (recipe.staged_tag_keys || []).map((tagKey, tagIndex) => ({
      staged_recipe_id: `staged:${recipe.recipe_key}`,
      staged_recipe_tag_id: `tag:${index}:${tagIndex}`,
      tag_type: 'flavor',
      tag_key: tagKey,
      tag_value: tagKey,
    }))
  ));

  const approvedRecipeNutritionIds = new Set([
    'recipe:apple_yogurt_bowl',
    'recipe:rice_milk_poridge',
    'recipe:chicken_rice_bowl',
    'recipe:tomato_cucumber_salad',
    'recipe:green_bean_chicken_plate',
    'recipe:pork_potato_stew',
    'recipe:spicy_peanut_noodles',
    'recipe:slow_cooker_stew',
  ]);

  return {
    profile,
    constraints,
    preferences,
    equipment,
    tasteSnapshot,
    recipes,
    recipeIngredients,
    recipeSteps,
    recipeMetadata,
    recipeMethods,
    recipeTags,
    approvedRecipeNutritionIds,
    ingredientsById: new Map([
      ['ingredient:apple', { ingredient_id: 'ingredient:apple', ingredient_key: 'apple', food_family: 'fruit', tags_json: ['fruit'], allergen_flags_json: {} }],
      ['ingredient:yogurt', { ingredient_id: 'ingredient:yogurt', ingredient_key: 'yogurt', food_family: 'dairy', tags_json: ['dairy'], allergen_flags_json: { milk: true } }],
      ['ingredient:rice', { ingredient_id: 'ingredient:rice', ingredient_key: 'rice', food_family: 'grain', tags_json: ['grain'], allergen_flags_json: {} }],
      ['ingredient:milk', { ingredient_id: 'ingredient:milk', ingredient_key: 'milk', food_family: 'dairy', tags_json: ['dairy'], allergen_flags_json: { milk: true } }],
      ['ingredient:chicken', { ingredient_id: 'ingredient:chicken', ingredient_key: 'chicken', food_family: 'meat', tags_json: ['meat'], allergen_flags_json: {} }],
      ['ingredient:tomato', { ingredient_id: 'ingredient:tomato', ingredient_key: 'tomato', food_family: 'vegetable', tags_json: ['vegetable'], allergen_flags_json: {} }],
      ['ingredient:cucumber', { ingredient_id: 'ingredient:cucumber', ingredient_key: 'cucumber', food_family: 'vegetable', tags_json: ['vegetable'], allergen_flags_json: {} }],
      ['ingredient:green_beans', { ingredient_id: 'ingredient:green_beans', ingredient_key: 'green_beans', food_family: 'vegetable', tags_json: ['vegetable'], allergen_flags_json: {} }],
      ['ingredient:pork', { ingredient_id: 'ingredient:pork', ingredient_key: 'pork', food_family: 'meat', tags_json: ['meat'], allergen_flags_json: {} }],
      ['ingredient:potato', { ingredient_id: 'ingredient:potato', ingredient_key: 'potato', food_family: 'vegetable', tags_json: ['vegetable'], allergen_flags_json: {} }],
      ['ingredient:peanut', { ingredient_id: 'ingredient:peanut', ingredient_key: 'peanut', food_family: 'legume', tags_json: ['legume'], allergen_flags_json: { peanut: true } }],
    ]),
    plansByKey: new Map(),
    mealPlanItemsByPlanId: new Map(),
    commands: [],
  };
}

function makeRecipe({
  recipe_key,
  meal_type_tags_json,
  cuisine_tags_json,
  per_serving_kcal,
  per_serving_protein_g,
  per_serving_carbs_g,
  per_serving_fat_g,
  primaryFlavor,
  primaryTexture,
  feeling,
  methods,
  prep,
  total,
  equipment = [],
}) {
  return {
    recipe_id: `recipe:${recipe_key}`,
    recipe_key,
    title_en: recipe_key.replaceAll('_', ' '),
    title_bg: null,
    canonical_title: recipe_key.replaceAll('_', ' '),
    description: null,
    usability_status: 'usable',
    servings: 1,
    cuisine_tags_json,
    dietary_tags_json: [],
    meal_type_tags_json,
    recipe_profile_id: `recipe_profile:${recipe_key}`,
    per_serving_kcal,
    per_serving_protein_g,
    per_serving_carbs_g,
    per_serving_fat_g,
    total_kcal: per_serving_kcal,
    total_protein_g: per_serving_protein_g,
    total_carbs_g: per_serving_carbs_g,
    total_fat_g: per_serving_fat_g,
    flavor_profile_json: { primary: primaryFlavor },
    texture_profile_json: { primary: primaryTexture },
    feeling_tags_json: feeling,
    method_keys: methods,
    staged_tag_keys: primaryFlavor === 'spicy' ? ['spicy'] : [],
    prep_time_minutes: prep,
    total_time_minutes: total,
    equipment_tags_json: equipment,
  };
}

function makeRecipeIngredient(recipeId, ingredientId) {
  const ingredientKey = ingredientId.replace('ingredient:', '');
  return {
    recipe_id: recipeId,
    recipe_ingredient_id: `${recipeId}:${ingredientKey}`,
    sort_order: 1,
    display_name: ingredientKey,
    ingredient_key_snapshot: ingredientKey,
    ingredient_id: ingredientId,
    matched_ingredient_id: ingredientId,
    quantity_grams: 100,
  };
}

function mealPlanFromParams(params) {
  const columns = [
    'plan_id',
    'profile_id',
    'user_id',
    'plan_key',
    'start_date',
    'days',
    'meals_per_day',
    'target_calories_per_day',
    'target_protein_g',
    'target_carbs_g',
    'target_fat_g',
    'generation_method',
    'rules_version',
  ];
  return Object.fromEntries(columns.map((column, index) => [column, params[index]]));
}

function mealPlanItemFromParams(params) {
  return {
    item_id: params[0],
    plan_id: params[1],
    day_index: params[2],
    meal_type: params[3],
    recipe_id: params[4],
    recipe_key_snapshot: params[5],
    calories: params[6],
    protein_g: params[7],
    carbs_g: params[8],
    fat_g: params[9],
    selection_score: params[10],
    selection_reason_json: JSON.parse(params[11]),
  };
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '022_plan1_meal_plans.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS meal_plans'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS meal_plan_items'));
  assert(migration.includes("meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')"));

  assert.deepStrictEqual(normalizeMealPlanOptions({
    userId: 'user_demo',
    startDate: '2026-04-28',
    days: 5,
    mealsPerDay: 3,
    dryRun: true,
  }), {
    profile_id: null,
    user_id: 'user_demo',
    start_date: '2026-04-28',
    days: 5,
    meals_per_day: 3,
    dry_run: true,
  });
  assert.throws(() => normalizeMealPlanOptions({ startDate: '2026-04-28' }), /profile_id or user_id is required/);

  const keyA = buildMealPlanKey('user_food_profile:user_demo', '2026-04-28', 'plan1_meal_planner_rules_v1');
  const keyB = buildMealPlanKey('user_food_profile:user_demo', '2026-04-28', 'plan1_meal_planner_rules_v1');
  assert.equal(keyA, keyB, 'plan key should be deterministic');

  const client = makeFixtureClient();
  const report = await generateMealPlan(client, {
    userId: 'user_demo',
    startDate: '2026-04-28',
    days: 2,
    mealsPerDay: 3,
  });
  assert.equal(report.recipes_considered, 8, 'recipes without approved nutrition are excluded before planning');
  assert.equal(report.recipes_filtered, 2);
  assert.equal(report.filtered_out_by_reason.hard_constraint, 1);
  assert.equal(report.filtered_out_by_reason.equipment_unavailable, 1);
  assert.equal(report.plan_items_created, 6);
  assert.deepStrictEqual(
    report.items.map((item) => `${item.day_index}:${item.meal_type}:${item.recipe_key_snapshot}`),
    [
      '0:breakfast:apple_yogurt_bowl',
      '0:lunch:chicken_rice_bowl',
      '0:dinner:pork_potato_stew',
      '1:breakfast:rice_milk_poridge',
      '1:lunch:tomato_cucumber_salad',
      '1:dinner:green_bean_chicken_plate',
    ],
  );
  assert.equal(report.daily_calorie_summary[0].total_calories, 1730);
  assert.equal(report.daily_calorie_summary[1].total_calories, 1390);
  assert.equal(report.macro_summary.total_calories, 3120);
  assert.equal(report.macro_summary.total_protein_g, 178);
  assert.equal(report.macro_summary.total_carbs_g, 308);
  assert.equal(report.macro_summary.total_fat_g, 104);
  assert.equal(client.state.plansByKey.size, 1);
  assert.equal((client.state.mealPlanItemsByPlanId.get(report.plan.plan_id) || []).length, 6);
  assert(report.items.every((item) => !['spicy_peanut_noodles', 'slow_cooker_stew', 'no_profile_stir_fry'].includes(item.recipe_key_snapshot)));
  assert.equal(new Set(report.items.filter((item) => item.day_index === 0).map((item) => item.recipe_id)).size, 3);
  assert.equal(new Set(report.items.filter((item) => item.day_index === 1).map((item) => item.recipe_id)).size, 3);

  const rerun = await generateMealPlan(client, {
    userId: 'user_demo',
    startDate: '2026-04-28',
    days: 2,
    mealsPerDay: 3,
  });
  assert.equal(rerun.plan.plan_key, report.plan.plan_key);
  assert.equal(client.state.plansByKey.size, 1, 'idempotent plan key should upsert one plan');
  assert.equal((client.state.mealPlanItemsByPlanId.get(report.plan.plan_id) || []).length, 6, 'item replacement should avoid duplicates');
  assert.deepStrictEqual(
    rerun.items.map((item) => item.recipe_key_snapshot),
    report.items.map((item) => item.recipe_key_snapshot),
    'scoring and selection ordering should remain deterministic on rerun',
  );

  const fallbackClient = makeFixtureClient({ includeTasteSnapshot: false });
  const fallback = await generateMealPlan(fallbackClient, {
    userId: 'user_demo',
    startDate: '2026-04-29',
    days: 1,
    mealsPerDay: 3,
    dryRun: true,
  });
  assert.equal(fallback.plan_items_created, 3);
  assert.equal(fallback.plan.plan_key, buildMealPlanKey('user_food_profile:user_demo', '2026-04-29', 'plan1_meal_planner_rules_v1'));
  assert.equal(fallbackClient.state.plansByKey.size, 0, 'dry-run should not persist meal plans');

  assert.deepStrictEqual(parseArgs([
    '--profile-id=user_food_profile:user_demo',
    '--start-date=2026-04-28',
    '--days=5',
    '--meals-per-day=4',
    '--dry-run',
    '--json',
    '--out=tmp/plan1.json',
  ]), {
    profileId: 'user_food_profile:user_demo',
    userId: null,
    startDate: '2026-04-28',
    days: 5,
    mealsPerDay: 4,
    dryRun: true,
    json: true,
    out: 'tmp/plan1.json',
  });

  assert(client.state.commands.every((command) => !/firestore|openai|llm/i.test(command.sql)), 'PLAN1 must not call Firestore or LLM paths');

  console.log('PLAN1 meal planner tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
