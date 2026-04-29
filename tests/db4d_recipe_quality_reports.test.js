const assert = require('node:assert/strict');

const {
  buildRecipeQualityReport,
  determineRecipeReadinessStatus,
  normalizeRecipeQualityReportOptions,
} = require('../app/functions/src');
const { parseArgs } = require('../scripts/db4d_report_recipe_quality');

function makeRecipe(overrides = {}) {
  const recipeKey = overrides.recipe_key || 'recipe_stub';
  return {
    recipe_id: `recipe:${recipeKey}`,
    recipe_key: recipeKey,
    title_en: overrides.title_en || recipeKey.replaceAll('_', ' '),
    title_bg: overrides.title_bg || null,
    canonical_title: overrides.canonical_title || (overrides.title_en || recipeKey.replaceAll('_', ' ')),
    normalized_title: overrides.normalized_title || recipeKey.replaceAll('_', ' '),
    review_status: overrides.review_status || 'active',
    usability_status: overrides.usability_status || 'draft',
    ingredient_match_rate: overrides.ingredient_match_rate ?? 0,
    nutrition_coverage_rate: overrides.nutrition_coverage_rate ?? 0,
    product_coverage_rate: overrides.product_coverage_rate ?? 0,
    last_quality_computed_at: overrides.last_quality_computed_at || '2026-04-25T12:00:00.000Z',
  };
}

function makeRecipeIngredient(recipeId, overrides = {}) {
  const ingredientId = overrides.ingredient_id ?? null;
  const matchedIngredientId = overrides.matched_ingredient_id ?? ingredientId;
  return {
    recipe_ingredient_id: overrides.recipe_ingredient_id || `${recipeId}:${overrides.sort_order || 1}`,
    recipe_id: recipeId,
    sort_order: overrides.sort_order || 1,
    display_name: overrides.display_name || overrides.ingredient_key_snapshot || 'ingredient line',
    ingredient_key_snapshot: overrides.ingredient_key_snapshot || 'ingredient_line',
    ingredient_id: ingredientId,
    matched_ingredient_id: matchedIngredientId,
    quantity: overrides.quantity ?? null,
    unit: overrides.unit || null,
    quantity_grams: overrides.quantity_grams ?? null,
    match_confidence: overrides.match_confidence ?? null,
    review_status: overrides.review_status || 'active',
  };
}

function makeFixtureClient() {
  const state = {
    recipes: [
      makeRecipe({
        recipe_key: 'dormant_soup',
        title_en: 'Dormant Soup',
        title_bg: 'Спяща супа',
        usability_status: 'dormant',
      }),
      makeRecipe({
        recipe_key: 'mapping_stew',
        title_en: 'Mapping Stew',
        usability_status: 'needs_ingredient_mapping',
      }),
      makeRecipe({
        recipe_key: 'grams_bowl',
        title_en: 'Grams Bowl',
        review_status: 'needs_review',
        usability_status: 'needs_nutrition',
      }),
      makeRecipe({
        recipe_key: 'nutrition_salad',
        title_en: 'Nutrition Salad',
        usability_status: 'needs_nutrition',
      }),
      makeRecipe({
        recipe_key: 'usable_plate',
        title_en: 'Usable Plate',
        usability_status: 'usable',
      }),
      makeRecipe({
        recipe_key: 'ready_skillet',
        title_en: 'Ready Skillet',
        usability_status: 'meal_plan_ready',
      }),
    ],
    ingredients: [
      { ingredient_id: 'ingredient:rice', ingredient_key: 'rice', name_en: 'Rice', name_bg: 'ориз' },
      { ingredient_id: 'ingredient:chicken_breast', ingredient_key: 'chicken_breast', name_en: 'Chicken breast', name_bg: 'пилешки гърди' },
      { ingredient_id: 'ingredient:tomato', ingredient_key: 'tomato', name_en: 'Tomato', name_bg: 'домат' },
      { ingredient_id: 'ingredient:cucumber', ingredient_key: 'cucumber', name_en: 'Cucumber', name_bg: 'краставица' },
      { ingredient_id: 'ingredient:potato', ingredient_key: 'potato', name_en: 'Potato', name_bg: 'картоф' },
      { ingredient_id: 'ingredient:mushroom', ingredient_key: 'mushroom', name_en: 'Mushroom', name_bg: 'гъба' },
      { ingredient_id: 'ingredient:green_beans', ingredient_key: 'green_beans', name_en: 'Green beans', name_bg: 'зелен фасул' },
      { ingredient_id: 'ingredient:milk_whole', ingredient_key: 'milk_whole', name_en: 'Whole milk', name_bg: 'пълномаслено мляко' },
      { ingredient_id: 'ingredient:apple', ingredient_key: 'apple', name_en: 'Apple', name_bg: 'ябълка' },
    ],
    recipeIngredients: [
      makeRecipeIngredient('recipe:dormant_soup', {
        sort_order: 1,
        display_name: 'wild herb',
        ingredient_key_snapshot: 'wild_herb',
        ingredient_id: null,
        matched_ingredient_id: null,
        quantity_grams: null,
        review_status: 'needs_review',
      }),
      makeRecipeIngredient('recipe:dormant_soup', {
        sort_order: 2,
        display_name: 'mystery root',
        ingredient_key_snapshot: 'mystery_root',
        ingredient_id: null,
        matched_ingredient_id: null,
        quantity_grams: null,
        review_status: 'needs_review',
      }),
      makeRecipeIngredient('recipe:mapping_stew', {
        sort_order: 1,
        display_name: 'rice',
        ingredient_key_snapshot: 'rice',
        ingredient_id: 'ingredient:rice',
        matched_ingredient_id: 'ingredient:rice',
        quantity_grams: 100,
        match_confidence: 1,
      }),
      makeRecipeIngredient('recipe:mapping_stew', {
        sort_order: 2,
        display_name: 'mystery leaf',
        ingredient_key_snapshot: 'mystery_leaf',
        ingredient_id: null,
        matched_ingredient_id: null,
        quantity_grams: 30,
        review_status: 'needs_review',
      }),
      makeRecipeIngredient('recipe:grams_bowl', {
        sort_order: 1,
        display_name: 'chicken breast',
        ingredient_key_snapshot: 'chicken_breast',
        ingredient_id: 'ingredient:chicken_breast',
        matched_ingredient_id: 'ingredient:chicken_breast',
        quantity_grams: null,
        match_confidence: 1,
      }),
      makeRecipeIngredient('recipe:nutrition_salad', {
        sort_order: 1,
        display_name: 'tomato',
        ingredient_key_snapshot: 'tomato',
        ingredient_id: 'ingredient:tomato',
        matched_ingredient_id: 'ingredient:tomato',
        quantity_grams: 100,
        match_confidence: 1,
      }),
      makeRecipeIngredient('recipe:nutrition_salad', {
        sort_order: 2,
        display_name: 'cucumber',
        ingredient_key_snapshot: 'cucumber',
        ingredient_id: 'ingredient:cucumber',
        matched_ingredient_id: 'ingredient:cucumber',
        quantity_grams: 100,
        match_confidence: 1,
      }),
      makeRecipeIngredient('recipe:usable_plate', {
        sort_order: 1,
        display_name: 'potato',
        ingredient_key_snapshot: 'potato',
        ingredient_id: 'ingredient:potato',
        matched_ingredient_id: 'ingredient:potato',
        quantity_grams: 120,
        match_confidence: 1,
      }),
      makeRecipeIngredient('recipe:usable_plate', {
        sort_order: 2,
        display_name: 'mushroom',
        ingredient_key_snapshot: 'mushroom',
        ingredient_id: 'ingredient:mushroom',
        matched_ingredient_id: 'ingredient:mushroom',
        quantity_grams: 80,
        match_confidence: 1,
      }),
      makeRecipeIngredient('recipe:usable_plate', {
        sort_order: 3,
        display_name: 'green beans',
        ingredient_key_snapshot: 'green_beans',
        ingredient_id: 'ingredient:green_beans',
        matched_ingredient_id: 'ingredient:green_beans',
        quantity_grams: 70,
        match_confidence: 1,
      }),
      makeRecipeIngredient('recipe:usable_plate', {
        sort_order: 4,
        display_name: 'apple',
        ingredient_key_snapshot: 'apple',
        ingredient_id: 'ingredient:apple',
        matched_ingredient_id: 'ingredient:apple',
        quantity_grams: 30,
        match_confidence: 1,
      }),
      makeRecipeIngredient('recipe:ready_skillet', {
        sort_order: 1,
        display_name: 'milk whole',
        ingredient_key_snapshot: 'milk_whole',
        ingredient_id: 'ingredient:milk_whole',
        matched_ingredient_id: 'ingredient:milk_whole',
        quantity_grams: 150,
        match_confidence: 1,
      }),
      makeRecipeIngredient('recipe:ready_skillet', {
        sort_order: 2,
        display_name: 'rice',
        ingredient_key_snapshot: 'rice',
        ingredient_id: 'ingredient:rice',
        matched_ingredient_id: 'ingredient:rice',
        quantity_grams: 90,
        match_confidence: 1,
      }),
    ],
    approvedIngredientNutritionIds: new Set([
      'ingredient:rice',
      'ingredient:chicken_breast',
      'ingredient:tomato',
      'ingredient:potato',
      'ingredient:mushroom',
      'ingredient:green_beans',
      'ingredient:apple',
      'ingredient:milk_whole',
    ]),
    approvedIngredientProductIds: new Set([
      'ingredient:potato',
      'ingredient:mushroom',
      'ingredient:green_beans',
      'ingredient:milk_whole',
      'ingredient:rice',
    ]),
    approvedRecipeNutritionIds: new Set([
      'recipe:usable_plate',
      'recipe:ready_skillet',
    ]),
    gapCandidates: [
      {
        gap_id: 'gap:dormant:wild_herb',
        recipe_id: 'recipe:dormant_soup',
        raw_name: 'wild herb',
        normalized_name: 'wild herb',
        proposed_ingredient_key: 'wild_herb',
        occurrences: 6,
        created_at: '2026-04-25T11:00:00.000Z',
        updated_at: '2026-04-25T12:00:00.000Z',
      },
      {
        gap_id: 'gap:mapping:mystery_leaf',
        recipe_id: 'recipe:mapping_stew',
        raw_name: 'mystery leaf',
        normalized_name: 'mystery leaf',
        proposed_ingredient_key: 'mystery_leaf',
        occurrences: 3,
        created_at: '2026-04-25T11:00:00.000Z',
        updated_at: '2026-04-25T12:00:00.000Z',
      },
    ],
    commands: [],
  };

  return {
    state,
    async query(sql) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
      state.commands.push(normalizedSql);

      if (normalizedSql.startsWith('SELECT r.recipe_id, r.recipe_key, r.title_en, r.title_bg, r.canonical_title')) {
        return {
          rows: state.recipes.map((recipe) => ({
            ...recipe,
            has_approved_recipe_nutrition: state.approvedRecipeNutritionIds.has(recipe.recipe_id),
          })),
        };
      }

      if (normalizedSql.startsWith('SELECT r.recipe_id, r.recipe_key, r.title_en, ri.recipe_ingredient_id')) {
        return {
          rows: state.recipeIngredients.map((line) => {
            const recipe = state.recipes.find((row) => row.recipe_id === line.recipe_id);
            const ingredient = state.ingredients.find((row) => row.ingredient_id === line.matched_ingredient_id) || {};
            const coverageId = line.matched_ingredient_id || line.ingredient_id;
            return {
              recipe_id: line.recipe_id,
              recipe_key: recipe.recipe_key,
              title_en: recipe.title_en,
              recipe_ingredient_id: line.recipe_ingredient_id,
              sort_order: line.sort_order,
              display_name: line.display_name,
              ingredient_key_snapshot: line.ingredient_key_snapshot,
              ingredient_id: line.ingredient_id,
              matched_ingredient_id: line.matched_ingredient_id,
              quantity: line.quantity,
              unit: line.unit,
              quantity_grams: line.quantity_grams,
              match_confidence: line.match_confidence,
              review_status: line.review_status,
              matched_ingredient_key: ingredient.ingredient_key || null,
              matched_ingredient_name_en: ingredient.name_en || null,
              matched_ingredient_name_bg: ingredient.name_bg || null,
              has_approved_ingredient_nutrition: coverageId ? state.approvedIngredientNutritionIds.has(coverageId) : false,
              has_approved_product_mapping: coverageId ? state.approvedIngredientProductIds.has(coverageId) : false,
            };
          }),
        };
      }

      if (normalizedSql.startsWith('SELECT igc.gap_id, igc.recipe_id, igc.raw_name')) {
        return {
          rows: state.gapCandidates.map((gap) => {
            const recipe = state.recipes.find((row) => row.recipe_id === gap.recipe_id) || {};
            return {
              ...gap,
              recipe_key: recipe.recipe_key || null,
              title_en: recipe.title_en || null,
            };
          }),
        };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

async function run() {
  assert.deepStrictEqual(normalizeRecipeQualityReportOptions({
    limit: 'oops',
    recipe: '  ready skillet  ',
    status: '',
    missingIngredients: 1,
    missingNutrition: 0,
    missingProducts: 1,
  }), {
    limit: 100,
    recipe: 'ready skillet',
    status: null,
    missingIngredients: true,
    missingNutrition: false,
    missingProducts: true,
  });

  assert.throws(
    () => normalizeRecipeQualityReportOptions({ status: 'archived' }),
    /Unsupported recipe usability_status/,
  );

  assert.equal(determineRecipeReadinessStatus({
    ingredientCount: 1,
    ingredientMatchRate: 1,
    gramsCoverageRate: 0,
    nutritionCoverageRate: 1,
    productCoverageRate: 1,
    hasApprovedRecipeNutrition: false,
  }), 'needs_grams');
  assert.equal(determineRecipeReadinessStatus({
    ingredientCount: 2,
    ingredientMatchRate: 1,
    gramsCoverageRate: 1,
    nutritionCoverageRate: 1,
    productCoverageRate: 0.5,
    hasApprovedRecipeNutrition: true,
  }), 'needs_product_mapping');
  assert.equal(determineRecipeReadinessStatus({
    ingredientCount: 2,
    ingredientMatchRate: 1,
    gramsCoverageRate: 1,
    nutritionCoverageRate: 1,
    productCoverageRate: 0.75,
    hasApprovedRecipeNutrition: true,
  }), 'usable');
  assert.equal(determineRecipeReadinessStatus({
    ingredientCount: 2,
    ingredientMatchRate: 1,
    gramsCoverageRate: 1,
    nutritionCoverageRate: 1,
    productCoverageRate: 1,
    hasApprovedRecipeNutrition: true,
  }), 'meal_plan_ready');

  const client = makeFixtureClient();
  const report = await buildRecipeQualityReport({
    client,
    limit: 10,
  });

  assert.equal(report.total_recipes, 6);
  assert.deepStrictEqual(report.summary_by_review_status, [
    { key: 'active', count: 5 },
    { key: 'needs_review', count: 1 },
  ]);
  assert(report.summary_by_usability_status.some((row) => row.key === 'usable' && row.count === 1));
  assert(report.summary_by_readiness_status.some((row) => row.key === 'needs_grams' && row.count === 1));
  assert(report.summary_by_readiness_status.some((row) => row.key === 'meal_plan_ready' && row.count === 1));

  const usabilityRow = report.recipe_readiness.find((row) => row.recipe_key === 'usable_plate');
  assert.equal(usabilityRow.ingredient_match_rate, 1);
  assert.equal(usabilityRow.grams_coverage_rate, 1);
  assert.equal(usabilityRow.nutrition_coverage_rate, 1);
  assert.equal(usabilityRow.product_coverage_rate, 0.75);
  assert.equal(usabilityRow.has_approved_recipe_nutrition, true);
  assert.equal(usabilityRow.readiness_status, 'usable');

  assert.equal(report.dormant_recipes.length, 1);
  assert.equal(report.needs_ingredient_mapping_recipes.length, 1);
  assert.equal(report.needs_nutrition_recipes.length, 1);
  assert.equal(report.usable_recipes.length, 1);
  assert.equal(report.meal_plan_ready_recipes.length, 1);
  assert.equal(report.ingredients_missing_matched_ingredient_id.length, 3);
  assert.equal(report.ingredients_missing_quantity_grams.length, 3);
  assert.equal(report.ingredients_missing_approved_nutrition.length, 4);
  assert.equal(report.ingredients_missing_approved_product_mappings.length, 7);
  assert.equal(report.recipes_with_approved_nutrition_profiles.length, 2);
  assert.equal(report.recipes_without_approved_nutrition_profiles.length, 4);
  assert.equal(report.top_ingredient_gap_candidates[0].normalized_name, 'wild herb');
  assert(report.suggested_next_review_targets.some((target) => target.reason === 'missing_ingredient_matches'));
  assert(report.suggested_next_review_targets.some((target) => target.reason === 'missing_recipe_nutrition_profiles'));
  assert(client.state.commands.every((sql) => !/\b(INSERT|UPDATE|DELETE)\b/i.test(sql)), 'DB4D report must stay read-only');

  const filteredClient = makeFixtureClient();
  const filtered = await buildRecipeQualityReport({
    client: filteredClient,
    limit: 10,
    recipe: 'ready skillet',
    status: 'meal_plan_ready',
    missingProducts: false,
  });
  assert.equal(filtered.total_recipes, 1);
  assert.equal(filtered.recipe_readiness[0].recipe_key, 'ready_skillet');

  const missingProductsOnly = await buildRecipeQualityReport({
    client: makeFixtureClient(),
    limit: 10,
    missingProducts: true,
  });
  assert(missingProductsOnly.recipe_readiness.every((row) => row.ingredients_missing_approved_product_mappings > 0));

  const missingIngredientsOnly = await buildRecipeQualityReport({
    client: makeFixtureClient(),
    limit: 10,
    missingIngredients: true,
  });
  assert.deepStrictEqual(
    missingIngredientsOnly.recipe_readiness.map((row) => row.recipe_key),
    ['dormant_soup', 'mapping_stew'],
  );

  const missingNutritionOnly = await buildRecipeQualityReport({
    client: makeFixtureClient(),
    limit: 10,
    missingNutrition: true,
  });
  assert(missingNutritionOnly.recipe_readiness.some((row) => row.recipe_key === 'nutrition_salad'));
  assert(missingNutritionOnly.recipe_readiness.every((row) => (
    !row.has_approved_recipe_nutrition || row.ingredients_missing_approved_nutrition > 0
  )));

  assert.deepStrictEqual(parseArgs([
    '--json',
    '--out=tmp/db4d.json',
    '--limit=25',
    '--recipe=ready skillet',
    '--status=usable',
    '--missing-ingredients',
    '--missing-nutrition',
    '--missing-products',
  ]), {
    json: true,
    out: 'tmp/db4d.json',
    limit: 25,
    recipe: 'ready skillet',
    status: 'usable',
    missingIngredients: true,
    missingNutrition: true,
    missingProducts: true,
  });

  console.log('DB4D recipe quality report tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
