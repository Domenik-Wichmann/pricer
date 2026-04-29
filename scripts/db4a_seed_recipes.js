const fs = require('node:fs');
const path = require('node:path');
const {
  createPostgresPool,
  getIngredientsByKeys,
  isPostgresConfigured,
  normalizeIngredientKeyForRecipe,
  runPostgresMigrations,
  upsertRecipeByKey,
  upsertRecipeIngredients,
  upsertRecipeSteps,
} = require('../functions/src');

async function seedCanonicalRecipes({
  client,
  dryRun = false,
  limit = 100,
  seedPath = defaultSeedPath(),
  recipes = null,
} = {}) {
  requireClient(client);
  const loadedRecipes = recipes || JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const seeds = loadedRecipes.slice(0, positiveInteger(limit, 100));
  // Validate all fixture ingredient keys before writing any lines for a recipe.
  // Missing links skip the recipe; DB4A never creates ingredients implicitly.
  const allIngredientKeys = collectSeedIngredientKeys(seeds);
  const ingredientRows = await getIngredientsByKeys(client, allIngredientKeys);
  const ingredientByKey = new Map(ingredientRows.map((row) => [row.ingredient_key, row]));

  const report = {
    dry_run: Boolean(dryRun),
    seed_path: seedPath,
    recipes_seen: seeds.length,
    recipes_valid: 0,
    recipes_skipped_missing_ingredients: 0,
    ingredients_linked: 0,
    steps_written: 0,
    upserted: 0,
    errors: [],
    recipes: [],
  };

  for (const seed of seeds) {
    const ingredientLinks = resolveRecipeSeedIngredientLinks(seed, ingredientByKey);
    if (ingredientLinks.missing_ingredient_keys.length > 0) {
      report.recipes_skipped_missing_ingredients += 1;
      report.errors.push({
        recipe_key: seed.recipe_key || seed.recipeKey || null,
        missing_ingredient_keys: ingredientLinks.missing_ingredient_keys,
      });
      report.recipes.push({
        recipe_key: seed.recipe_key || seed.recipeKey || null,
        status: 'skipped_missing_ingredients',
        missing_ingredient_keys: ingredientLinks.missing_ingredient_keys,
      });
      continue;
    }

    report.recipes_valid += 1;
    if (dryRun) {
      report.recipes.push({
        recipe_key: seed.recipe_key || seed.recipeKey,
        status: 'valid_dry_run',
        ingredient_count: ingredientLinks.ingredients.length,
        step_count: (seed.steps || []).length,
      });
      continue;
    }

    const recipe = await upsertRecipeByKey(client, normalizeSeedRecipe(seed));
    const ingredients = await upsertRecipeIngredients(client, {
      recipeId: recipe.recipe_id,
      recipeKey: recipe.recipe_key,
      ingredients: ingredientLinks.ingredients,
    });
    const steps = await upsertRecipeSteps(client, {
      recipeId: recipe.recipe_id,
      recipeKey: recipe.recipe_key,
      steps: seed.steps || [],
    });

    report.upserted += 1;
    report.ingredients_linked += ingredients.length;
    report.steps_written += steps.length;
    report.recipes.push({
      recipe_key: recipe.recipe_key,
      recipe_id: recipe.recipe_id,
      status: 'upserted',
      ingredient_count: ingredients.length,
      step_count: steps.length,
    });
  }

  return report;
}

function normalizeSeedRecipe(seed = {}) {
  return {
    source: 'data/seeds/recipes_seed.json',
    generation_method: 'fixture_seed_v1',
    rules_version: 'db4a_recipe_rules_v1',
    review_status: 'active',
    ...seed,
  };
}

function resolveRecipeSeedIngredientLinks(recipe, ingredientByKey) {
  const missing = [];
  const ingredients = (recipe.ingredients || []).map((line, index) => {
    const key = normalizeIngredientKeyForRecipe(line.ingredient_key || line.ingredientKey);
    const ingredient = ingredientByKey.get(key);
    if (!ingredient) {
      missing.push(key);
      return null;
    }
    return {
      ...line,
      ingredient_id: ingredient.ingredient_id,
      ingredient_key_snapshot: ingredient.ingredient_key,
      display_name: line.display_name || line.displayName || ingredient.name_en || ingredient.ingredient_key,
      sort_order: line.sort_order || line.sortOrder || index + 1,
      match_method: 'existing_ingredient_key',
      match_confidence: 1,
      review_status: line.review_status || line.reviewStatus || 'active',
    };
  }).filter(Boolean);
  return {
    ingredients,
    missing_ingredient_keys: [...new Set(missing)],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before seeding DB4A recipes.');
    return;
  }
  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await seedCanonicalRecipes({ ...args, client });
      if (args.out) {
        fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
        fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
      }
      console.log(args.json || args.out ? JSON.stringify(report, null, 2) : human(report));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function collectSeedIngredientKeys(recipes) {
  return [...new Set((recipes || []).flatMap((recipe) => (
    (recipe.ingredients || []).map((line) => normalizeIngredientKeyForRecipe(line.ingredient_key || line.ingredientKey))
  )))];
}

function defaultSeedPath() {
  return path.join(__dirname, '..', 'data', 'seeds', 'recipes_seed.json');
}

function parseArgs(argv) {
  const args = { dryRun: false, limit: 100, json: false, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
  }
  return args;
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function human(report) {
  return [
    'DB4A canonical recipe seed',
    `Dry run: ${report.dry_run}`,
    `Recipes seen: ${report.recipes_seen}`,
    `Recipes valid: ${report.recipes_valid}`,
    `Recipes skipped missing ingredients: ${report.recipes_skipped_missing_ingredients}`,
    `Ingredients linked: ${report.ingredients_linked}`,
    `Steps written: ${report.steps_written}`,
    `Upserted: ${report.upserted}`,
  ].join('\n');
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  collectSeedIngredientKeys,
  parseArgs,
  resolveRecipeSeedIngredientLinks,
  seedCanonicalRecipes,
};
