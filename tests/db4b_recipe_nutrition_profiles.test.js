const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  assignRecipeNutritionConfidence,
  buildRecipeNutritionProfileCandidates,
  generateRecipeNutritionProfileCandidates,
  upsertRecipeNutritionProfileCandidates,
} = require('../app/functions/src');
const { parseArgs } = require('../scripts/db4b_generate_recipe_nutrition_profiles');

function makeClient() {
  const state = {
    recipes: [
      { recipe_id: 'recipe:chicken_rice_bowl', recipe_key: 'chicken_rice_bowl', servings: 2 },
      { recipe_id: 'recipe:partial_plate', recipe_key: 'partial_plate', servings: 1 },
      { recipe_id: 'recipe:no_valid_ingredients', recipe_key: 'no_valid_ingredients', servings: 1 },
    ],
    recipeIngredients: [
      { recipe_ingredient_id: 'ri:1', recipe_id: 'recipe:chicken_rice_bowl', ingredient_id: 'ingredient:chicken_breast', quantity_grams: 200, sort_order: 1 },
      { recipe_ingredient_id: 'ri:2', recipe_id: 'recipe:chicken_rice_bowl', ingredient_id: 'ingredient:rice', quantity_grams: 100, sort_order: 2 },
      { recipe_ingredient_id: 'ri:3', recipe_id: 'recipe:partial_plate', ingredient_id: 'ingredient:tomato', quantity_grams: 100, sort_order: 1 },
      { recipe_ingredient_id: 'ri:4', recipe_id: 'recipe:partial_plate', ingredient_id: 'ingredient:cucumber', quantity_grams: 100, sort_order: 2 },
      { recipe_ingredient_id: 'ri:5', recipe_id: 'recipe:partial_plate', ingredient_id: 'ingredient:rice', quantity_grams: null, sort_order: 3 },
      { recipe_ingredient_id: 'ri:6', recipe_id: 'recipe:no_valid_ingredients', ingredient_id: 'ingredient:cucumber', quantity_grams: 100, sort_order: 1 },
    ],
    profiles: [
      {
        profile_id: 'profile:chicken_breast',
        ingredient_id: 'ingredient:chicken_breast',
        review_status: 'approved',
        mapping_type: 'default_raw',
        kcal_per_100g: 165,
        protein_g_per_100g: 31,
        fat_g_per_100g: 3.6,
        carbs_g_per_100g: 0,
        fiber_g_per_100g: 0,
        sugar_g_per_100g: 0,
        sodium_mg_per_100g: 74,
      },
      {
        profile_id: 'profile:rice',
        ingredient_id: 'ingredient:rice',
        review_status: 'approved',
        mapping_type: 'default_raw',
        kcal_per_100g: 130,
        protein_g_per_100g: 2.7,
        fat_g_per_100g: 0.3,
        carbs_g_per_100g: 28.2,
        fiber_g_per_100g: 0.4,
        sugar_g_per_100g: 0.1,
        sodium_mg_per_100g: 1,
      },
      {
        profile_id: 'profile:tomato',
        ingredient_id: 'ingredient:tomato',
        review_status: 'approved',
        mapping_type: 'default_raw',
        kcal_per_100g: 18,
        protein_g_per_100g: 0.9,
        fat_g_per_100g: 0.2,
        carbs_g_per_100g: 3.9,
        fiber_g_per_100g: 1.2,
        sugar_g_per_100g: 2.6,
        sodium_mg_per_100g: 5,
      },
      {
        profile_id: 'profile:cucumber_rejected',
        ingredient_id: 'ingredient:cucumber',
        review_status: 'rejected',
        mapping_type: 'default_raw',
        kcal_per_100g: 15,
      },
    ],
    candidates: new Map(),
    commands: [],
  };

  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });

      if (normalizedSql.startsWith('WITH selected_recipes AS')) {
        const hasRecipeFilter = normalizedSql.includes('WHERE recipe_key = $1');
        const recipeKey = hasRecipeFilter ? params[0] : null;
        const limit = Number(params[params.length - 1]);
        const recipes = state.recipes
          .filter((recipe) => !recipeKey || recipe.recipe_key === recipeKey)
          .slice(0, limit);
        return { rows: buildSourceRows(state, recipes) };
      }

      if (normalizedSql.startsWith('INSERT INTO recipe_nutrition_profile_candidates')) {
        const row = candidateFromParams(params);
        const existing = [...state.candidates.values()].find((candidate) => candidate.recipe_id === row.recipe_id);
        const stored = {
          ...existing,
          ...row,
          recipe_profile_candidate_id: existing ? existing.recipe_profile_candidate_id : row.recipe_profile_candidate_id,
          review_status: existing ? existing.review_status : row.review_status,
          created_at: existing ? existing.created_at : '2026-04-24T00:00:00.000Z',
          updated_at: existing ? '2026-04-24T00:01:00.000Z' : '2026-04-24T00:00:00.000Z',
        };
        state.candidates.set(stored.recipe_profile_candidate_id, stored);
        return { rows: [stored] };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function buildSourceRows(state, recipes) {
  const rows = [];
  for (const recipe of recipes) {
    const lines = state.recipeIngredients.filter((line) => line.recipe_id === recipe.recipe_id);
    if (lines.length === 0) {
      rows.push({ recipe_id: recipe.recipe_id, recipe_key: recipe.recipe_key, servings: recipe.servings });
      continue;
    }
    for (const line of lines) {
      const profile = state.profiles.find((candidateProfile) => (
        candidateProfile.ingredient_id === line.ingredient_id && candidateProfile.review_status === 'approved'
      ));
      rows.push({
        ...recipe,
        ...line,
        ...(profile || {}),
      });
    }
  }
  return rows;
}

function candidateFromParams(params) {
  const [
    recipe_profile_candidate_id,
    recipe_id,
    total_kcal,
    total_protein_g,
    total_fat_g,
    total_carbs_g,
    total_fiber_g,
    total_sugar_g,
    total_sodium_mg,
    per_serving_kcal,
    per_serving_protein_g,
    per_serving_fat_g,
    per_serving_carbs_g,
    per_serving_fiber_g,
    per_serving_sugar_g,
    per_serving_sodium_mg,
    servings,
    ingredient_count,
    ingredients_with_nutrition,
    ingredients_missing_nutrition,
    missing_ingredient_ids_json,
    source_profile_ids_json,
    confidence,
    review_status,
    generation_method,
    rules_version,
  ] = params;
  return {
    recipe_profile_candidate_id,
    recipe_id,
    total_kcal,
    total_protein_g,
    total_fat_g,
    total_carbs_g,
    total_fiber_g,
    total_sugar_g,
    total_sodium_mg,
    per_serving_kcal,
    per_serving_protein_g,
    per_serving_fat_g,
    per_serving_carbs_g,
    per_serving_fiber_g,
    per_serving_sugar_g,
    per_serving_sodium_mg,
    servings,
    ingredient_count,
    ingredients_with_nutrition,
    ingredients_missing_nutrition,
    missing_ingredient_ids_json: JSON.parse(missing_ingredient_ids_json || '[]'),
    source_profile_ids_json: JSON.parse(source_profile_ids_json || '[]'),
    confidence,
    review_status,
    generation_method,
    rules_version,
  };
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '013_db4b_recipe_nutrition_profile_candidates.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS recipe_nutrition_profile_candidates'));
  assert(migration.includes('REFERENCES recipes(recipe_id)'));
  assert(migration.includes("review_status IN ('candidate', 'approved', 'rejected', 'needs_review')"));
  assert(!migration.includes('Firestore'));
  assert(!migration.includes('fdc_id'), 'recipe nutrition candidates must not directly map USDA FDC ids');

  const sourceRows = buildSourceRows(makeClient().state, [
    { recipe_id: 'recipe:chicken_rice_bowl', recipe_key: 'chicken_rice_bowl', servings: 2 },
    { recipe_id: 'recipe:partial_plate', recipe_key: 'partial_plate', servings: 1 },
    { recipe_id: 'recipe:no_valid_ingredients', recipe_key: 'no_valid_ingredients', servings: 1 },
  ]);
  const candidates = buildRecipeNutritionProfileCandidates(sourceRows);
  const full = candidates.find((candidate) => candidate.recipe_id === 'recipe:chicken_rice_bowl');
  assert.strictEqual(full.total_kcal, 460);
  assert.strictEqual(full.total_protein_g, 64.7);
  assert.strictEqual(full.total_fat_g, 7.5);
  assert.strictEqual(full.total_carbs_g, 28.2);
  assert.strictEqual(full.total_fiber_g, 0.4);
  assert.strictEqual(full.total_sugar_g, 0.1);
  assert.strictEqual(full.total_sodium_mg, 149);
  assert.strictEqual(full.per_serving_kcal, 230);
  assert.strictEqual(full.per_serving_protein_g, 32.35);
  assert.strictEqual(full.ingredient_count, 2);
  assert.strictEqual(full.ingredients_with_nutrition, 2);
  assert.strictEqual(full.ingredients_missing_nutrition, 0);
  assert.strictEqual(full.confidence, 'high');

  const partial = candidates.find((candidate) => candidate.recipe_id === 'recipe:partial_plate');
  assert(partial, 'partial nutrition should still generate a candidate');
  assert.strictEqual(partial.total_kcal, 18);
  assert.strictEqual(partial.ingredients_with_nutrition, 1);
  assert.strictEqual(partial.ingredients_missing_nutrition, 2);
  assert.deepStrictEqual(partial.missing_ingredient_ids_json, ['ingredient:cucumber', 'ingredient:rice']);
  assert.strictEqual(partial.confidence, 'low');
  assert.strictEqual(candidates.some((candidate) => candidate.recipe_id === 'recipe:no_valid_ingredients'), false);

  assert.strictEqual(assignRecipeNutritionConfidence({ withNutrition: 4, ingredientCount: 4 }), 'high');
  assert.strictEqual(assignRecipeNutritionConfidence({ withNutrition: 3, ingredientCount: 4 }), 'medium');
  assert.strictEqual(assignRecipeNutritionConfidence({ withNutrition: 1, ingredientCount: 4 }), 'low');

  const client = makeClient();
  const firstReport = await generateRecipeNutritionProfileCandidates(client, { limit: 10 });
  assert.strictEqual(firstReport.recipes_seen, 3);
  assert.strictEqual(firstReport.recipes_with_profiles, 2);
  assert.strictEqual(firstReport.recipes_missing_data, 2);
  assert.strictEqual(firstReport.ingredients_missing_total, 3);
  assert.strictEqual(firstReport.upserted, 2);
  assert.strictEqual(firstReport.errors[0].recipe_id, 'recipe:no_valid_ingredients');
  assert.strictEqual(client.state.candidates.size, 2);

  const existingFull = [...client.state.candidates.values()].find((candidate) => candidate.recipe_id === 'recipe:chicken_rice_bowl');
  existingFull.review_status = 'needs_review';
  const secondReport = await generateRecipeNutritionProfileCandidates(client, { limit: 10 });
  const refreshedFull = [...client.state.candidates.values()].find((candidate) => candidate.recipe_id === 'recipe:chicken_rice_bowl');
  assert.strictEqual(secondReport.upserted, 2);
  assert.strictEqual(client.state.candidates.size, 2, 'upsert by recipe_id is idempotent');
  assert.strictEqual(refreshedFull.review_status, 'needs_review', 'existing review_status is preserved');

  const dryRunClient = makeClient();
  const dryRun = await generateRecipeNutritionProfileCandidates(dryRunClient, {
    dryRun: true,
    recipe: 'chicken_rice_bowl',
    limit: 5,
  });
  assert.strictEqual(dryRun.recipes_seen, 1);
  assert.strictEqual(dryRun.recipes_with_profiles, 1);
  assert.strictEqual(dryRun.upserted, 0);
  assert.strictEqual(dryRunClient.state.candidates.size, 0);

  const manualUpsertClient = makeClient();
  await upsertRecipeNutritionProfileCandidates(manualUpsertClient, [full]);
  assert.strictEqual(manualUpsertClient.state.candidates.size, 1);

  assert.deepStrictEqual(parseArgs(['--dry-run', '--limit=5', '--recipe=chicken_rice_bowl', '--json', '--out=tmp/db4b.json']), {
    dryRun: true,
    limit: 5,
    recipe: 'chicken_rice_bowl',
    json: true,
    out: 'tmp/db4b.json',
  });

  const unsafeSql = [...client.state.commands, ...dryRunClient.state.commands, ...manualUpsertClient.state.commands]
    .map((command) => command.sql)
    .join('\n');
  assert(!/Firestore|LLM|OpenAI|meal_planner|runtime_publish/i.test(unsafeSql), 'DB4B must not call Firestore, LLM, planner, or runtime publish paths');

  console.log('DB4B recipe nutrition profile tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
