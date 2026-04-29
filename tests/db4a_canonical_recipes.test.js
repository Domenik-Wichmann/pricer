const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  deleteCanonicalRecipe,
  getRecipeDetail,
  listRecipesByReviewStatus,
  normalizeRecipeRecord,
  searchRecipesByNormalizedTitle,
  upsertRecipeByKey,
  upsertRecipeIngredients,
  upsertRecipeSteps,
} = require('../app/functions/src');
const {
  parseArgs,
  seedCanonicalRecipes,
} = require('../scripts/db4a_seed_recipes');

function makeClient() {
  const state = {
    ingredients: new Map([
      ['rice', { ingredient_id: 'ingredient:rice', ingredient_key: 'rice', name_en: 'Rice', name_bg: 'ориз' }],
      ['chicken_breast', { ingredient_id: 'ingredient:chicken_breast', ingredient_key: 'chicken_breast', name_en: 'Chicken breast', name_bg: 'пилешки гърди' }],
      ['tomato', { ingredient_id: 'ingredient:tomato', ingredient_key: 'tomato', name_en: 'Tomato', name_bg: 'домат' }],
      ['cucumber', { ingredient_id: 'ingredient:cucumber', ingredient_key: 'cucumber', name_en: 'Cucumber', name_bg: 'краставица' }],
      ['apple', { ingredient_id: 'ingredient:apple', ingredient_key: 'apple', name_en: 'Apple', name_bg: 'ябълка' }],
      ['milk_whole', { ingredient_id: 'ingredient:milk_whole', ingredient_key: 'milk_whole', name_en: 'Milk whole', name_bg: 'пълномаслено мляко' }],
      ['dried_apple', { ingredient_id: 'ingredient:dried_apple', ingredient_key: 'dried_apple', name_en: 'Dried apple', name_bg: 'сушена ябълка' }],
      ['potato', { ingredient_id: 'ingredient:potato', ingredient_key: 'potato', name_en: 'Potato', name_bg: 'картоф' }],
      ['pork', { ingredient_id: 'ingredient:pork', ingredient_key: 'pork', name_en: 'Pork', name_bg: 'свинско месо' }],
      ['beef', { ingredient_id: 'ingredient:beef', ingredient_key: 'beef', name_en: 'Beef', name_bg: 'говеждо месо' }],
      ['mushroom', { ingredient_id: 'ingredient:mushroom', ingredient_key: 'mushroom', name_en: 'Mushroom', name_bg: 'гъба' }],
      ['shiitake_mushroom', { ingredient_id: 'ingredient:shiitake_mushroom', ingredient_key: 'shiitake_mushroom', name_en: 'Shiitake mushroom', name_bg: 'гъба шийтаке' }],
      ['green_beans', { ingredient_id: 'ingredient:green_beans', ingredient_key: 'green_beans', name_en: 'Green beans', name_bg: 'зелен фасул' }],
    ]),
    recipes: new Map(),
    recipeIngredients: new Map(),
    recipeSteps: new Map(),
    commands: [],
  };
  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });

      if (normalizedSql.startsWith('SELECT ingredient_id, ingredient_key')) {
        const requested = params[0] || [];
        return {
          rows: requested
            .map((key) => state.ingredients.get(key))
            .filter(Boolean)
            .sort((a, b) => a.ingredient_key.localeCompare(b.ingredient_key)),
        };
      }

      if (normalizedSql.startsWith('INSERT INTO recipes')) {
        const row = recipeFromParams(params);
        const existing = state.recipes.get(row.recipe_key);
        const stored = {
          ...existing,
          ...row,
          recipe_id: existing ? existing.recipe_id : row.recipe_id,
          created_at: existing ? existing.created_at : '2026-04-24T00:00:00.000Z',
          updated_at: existing ? '2026-04-24T00:01:00.000Z' : '2026-04-24T00:00:00.000Z',
        };
        state.recipes.set(stored.recipe_key, stored);
        return { rows: [stored] };
      }

      if (normalizedSql.startsWith('INSERT INTO recipe_ingredients')) {
        const row = recipeIngredientFromParams(params);
        const existing = state.recipeIngredients.get(row.recipe_ingredient_id);
        const stored = {
          ...existing,
          ...row,
          created_at: existing ? existing.created_at : '2026-04-24T00:00:00.000Z',
          updated_at: existing ? '2026-04-24T00:01:00.000Z' : '2026-04-24T00:00:00.000Z',
        };
        state.recipeIngredients.set(stored.recipe_ingredient_id, stored);
        return { rows: [stored] };
      }

      if (normalizedSql.startsWith('INSERT INTO recipe_steps')) {
        const row = recipeStepFromParams(params);
        const existing = state.recipeSteps.get(row.recipe_step_id);
        const stored = {
          ...existing,
          ...row,
          created_at: existing ? existing.created_at : '2026-04-24T00:00:00.000Z',
          updated_at: existing ? '2026-04-24T00:01:00.000Z' : '2026-04-24T00:00:00.000Z',
        };
        state.recipeSteps.set(stored.recipe_step_id, stored);
        return { rows: [stored] };
      }

      if (normalizedSql.includes('FROM recipes') && normalizedSql.includes('WHERE recipe_id =')) {
        return { rows: [...state.recipes.values()].filter((row) => row.recipe_id === params[0]) };
      }

      if (normalizedSql.includes('FROM recipes') && normalizedSql.includes('WHERE recipe_key =')) {
        return { rows: [...state.recipes.values()].filter((row) => row.recipe_key === params[0]) };
      }

      if (normalizedSql.includes('FROM recipe_ingredients')) {
        return {
          rows: [...state.recipeIngredients.values()]
            .filter((row) => row.recipe_id === params[0])
            .sort((a, b) => a.sort_order - b.sort_order),
        };
      }

      if (normalizedSql.includes('FROM recipe_steps')) {
        return {
          rows: [...state.recipeSteps.values()]
            .filter((row) => row.recipe_id === params[0])
            .sort((a, b) => a.step_number - b.step_number),
        };
      }

      if (normalizedSql.includes('WHERE review_status =')) {
        return {
          rows: [...state.recipes.values()]
            .filter((row) => row.review_status === params[0])
            .slice(0, Number(params[1])),
        };
      }

      if (normalizedSql.includes('WHERE normalized_title ILIKE')) {
        const normalizedNeedle = params[0].replaceAll('%', '').toLowerCase();
        const titleNeedle = params[1].replaceAll('%', '').toLowerCase();
        return {
          rows: [...state.recipes.values()]
            .filter((row) => row.normalized_title.includes(normalizedNeedle)
              || String(row.title_en || '').toLowerCase().includes(titleNeedle)
              || String(row.title_bg || '').toLowerCase().includes(titleNeedle))
            .slice(0, Number(params[2])),
        };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function recipeFromParams(params) {
  const [
    recipe_id,
    recipe_key,
    title_en,
    title_bg,
    canonical_title,
    normalized_title,
    description,
    cuisine_tags_json,
    dietary_tags_json,
    meal_type_tags_json,
    servings,
    yield_quantity,
    yield_unit,
    source,
    review_status,
    generation_method,
    rules_version,
  ] = params;
  return {
    recipe_id,
    recipe_key,
    title_en,
    title_bg,
    canonical_title,
    normalized_title,
    description,
    cuisine_tags_json: JSON.parse(cuisine_tags_json || '[]'),
    dietary_tags_json: JSON.parse(dietary_tags_json || '[]'),
    meal_type_tags_json: JSON.parse(meal_type_tags_json || '[]'),
    servings,
    yield_quantity,
    yield_unit,
    source,
    review_status,
    generation_method,
    rules_version,
  };
}

function recipeIngredientFromParams(params) {
  const [
    recipe_ingredient_id,
    recipe_id,
    ingredient_id,
    matched_ingredient_id,
    ingredient_key_snapshot,
    display_name,
    quantity,
    unit,
    quantity_grams,
    preparation_note,
    optional,
    sort_order,
    match_method,
    match_confidence,
    review_status,
  ] = params;
  return {
    recipe_ingredient_id,
    recipe_id,
    ingredient_id,
    matched_ingredient_id,
    ingredient_key_snapshot,
    display_name,
    quantity,
    unit,
    quantity_grams,
    preparation_note,
    optional,
    sort_order,
    match_method,
    match_confidence,
    review_status,
  };
}

function recipeStepFromParams(params) {
  const [
    recipe_step_id,
    recipe_id,
    step_number,
    instruction,
    duration_minutes,
    temperature_c,
    equipment_tags_json,
  ] = params;
  return {
    recipe_step_id,
    recipe_id,
    step_number,
    instruction,
    duration_minutes,
    temperature_c,
    equipment_tags_json: JSON.parse(equipment_tags_json || '[]'),
  };
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '012_db4a_canonical_recipes.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS recipes'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS recipe_ingredients'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS recipe_steps'));
  assert(migration.includes('REFERENCES ingredients(ingredient_id)'));
  assert(!migration.includes('fdc_id'), 'recipe tables must not directly carry USDA FDC ids');
  assert(!migration.includes('usda_foods'), 'recipe tables must not directly map raw USDA rows');

  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data', 'seeds', 'recipes_seed.json'),
    'utf8',
  ));
  assert(fixture.length >= 5 && fixture.length <= 10);

  const ingredientFixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data', 'seeds', 'ingredients_seed.json'),
    'utf8',
  ));
  const allowedIngredientKeys = new Set(ingredientFixture.map((row) => row.ingredient_key));
  for (const recipe of fixture) {
    for (const line of recipe.ingredients) {
      assert(allowedIngredientKeys.has(line.ingredient_key), `${line.ingredient_key} must exist in DB3A ingredient seed`);
    }
  }

  const normalized = normalizeRecipeRecord({
    title_en: 'Chicken Rice Bowl',
    title_bg: 'Купа с пиле и ориз',
    servings: 2,
    review_status: 'active',
  });
  assert.strictEqual(normalized.recipe_key, 'chicken_rice_bowl');
  assert.strictEqual(normalized.recipe_id, 'recipe:chicken_rice_bowl');
  assert.strictEqual(normalized.title_bg, 'Купа с пиле и ориз');

  const client = makeClient();
  const first = await upsertRecipeByKey(client, normalized);
  const second = await upsertRecipeByKey(client, { ...normalized, title_en: 'Chicken and Rice Bowl' });
  assert.strictEqual(second.recipe_id, first.recipe_id, 'recipe upsert preserves stable ids');
  assert.strictEqual(client.state.recipes.size, 1, 'upsert by recipe_key is idempotent');

  const linkedIngredients = await upsertRecipeIngredients(client, {
    recipeId: first.recipe_id,
    recipeKey: first.recipe_key,
    ingredients: [
      {
        ingredient_id: 'ingredient:chicken_breast',
        ingredient_key: 'chicken_breast',
        display_name: 'Chicken breast',
        quantity: 300,
        unit: 'g',
        quantity_grams: 300,
      },
      {
        ingredient_id: 'ingredient:rice',
        ingredient_key: 'rice',
        display_name: 'Rice',
        quantity: 160,
        unit: 'g',
        quantity_grams: 160,
      },
    ],
  });
  assert.deepStrictEqual(linkedIngredients.map((row) => row.ingredient_id), ['ingredient:chicken_breast', 'ingredient:rice']);
  assert(linkedIngredients.every((row) => !Object.prototype.hasOwnProperty.call(row, 'fdc_id')));

  await upsertRecipeSteps(client, {
    recipeId: first.recipe_id,
    recipeKey: first.recipe_key,
    steps: [
      { instruction: 'Cook the rice.' },
      { instruction: 'Cook the chicken.' },
      { instruction: 'Serve together.' },
    ],
  });
  const detail = await getRecipeDetail(client, { recipeKey: 'chicken_rice_bowl' });
  assert.strictEqual(detail.recipe.recipe_id, first.recipe_id);
  assert.deepStrictEqual(detail.ingredients.map((row) => row.sort_order), [1, 2]);
  assert.deepStrictEqual(detail.steps.map((row) => row.step_number), [1, 2, 3]);
  assert.strictEqual(detail.steps[0].instruction, 'Cook the rice.');
  assert.notStrictEqual(detail.recipe.recipe_id, detail.ingredients[0].ingredient_id, 'recipe ids are not ingredient ids');

  const activeRecipes = await listRecipesByReviewStatus(client, 'active');
  assert.strictEqual(activeRecipes.length, 1);
  const searchResults = await searchRecipesByNormalizedTitle(client, { query: 'rice bowl', limit: 5 });
  assert.strictEqual(searchResults[0].recipe_key, 'chicken_rice_bowl');

  const seedClient = makeClient();
  const report = await seedCanonicalRecipes({
    client: seedClient,
    recipes: [
      fixture[0],
      {
        recipe_key: 'missing_ingredient_recipe',
        title_en: 'Missing Ingredient Recipe',
        servings: 1,
        ingredients: [{ ingredient_key: 'not_a_real_ingredient', quantity: 1, unit: 'piece' }],
        steps: [{ instruction: 'This recipe should be skipped.' }],
      },
    ],
  });
  assert.strictEqual(report.recipes_seen, 2);
  assert.strictEqual(report.recipes_valid, 1);
  assert.strictEqual(report.recipes_skipped_missing_ingredients, 1);
  assert.strictEqual(report.upserted, 1);
  assert.strictEqual(report.ingredients_linked, fixture[0].ingredients.length);
  assert.strictEqual(report.steps_written, fixture[0].steps.length);
  assert.deepStrictEqual(report.errors[0].missing_ingredient_keys, ['not_a_real_ingredient']);
  const seededDetail = await getRecipeDetail(seedClient, { recipeKey: fixture[0].recipe_key });
  assert.strictEqual(seededDetail.ingredients[0].ingredient_id, 'ingredient:rice');
  assert.strictEqual(seededDetail.ingredients[0].ingredient_key_snapshot, 'rice');

  const dryRunClient = makeClient();
  const dryReport = await seedCanonicalRecipes({
    client: dryRunClient,
    dryRun: true,
    recipes: [fixture[1]],
  });
  assert.strictEqual(dryReport.recipes_valid, 1);
  assert.strictEqual(dryReport.upserted, 0);
  assert.strictEqual(dryRunClient.state.recipes.size, 0);

  assert.deepStrictEqual(parseArgs(['--dry-run', '--limit=5', '--json', '--out=tmp/report.json']), {
    dryRun: true,
    limit: 5,
    json: true,
    out: 'tmp/report.json',
  });
  assert.throws(() => deleteCanonicalRecipe(client, first.recipe_id), /must not be deleted/);

  const unsafeSql = [...client.state.commands, ...seedClient.state.commands, ...dryRunClient.state.commands]
    .map((command) => command.sql)
    .join('\n');
  assert(!/Firestore|LLM|OpenAI|source_recipes|recipe_ingest/i.test(unsafeSql), 'DB4A must not call Firestore, LLM, or source recipe ingest paths');

  console.log('DB4A canonical recipe tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
