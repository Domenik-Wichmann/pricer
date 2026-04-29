const fs = require('node:fs');
const path = require('node:path');

const {
  buildRecipeQualityReport,
  createPostgresPool,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running DB4D recipe quality reporting.');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await buildRecipeQualityReport({
        client,
        limit: args.limit,
        recipe: args.recipe,
        status: args.status,
        missingIngredients: args.missingIngredients,
        missingNutrition: args.missingNutrition,
        missingProducts: args.missingProducts,
      });
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

function parseArgs(argv) {
  const args = {
    json: false,
    out: null,
    limit: 100,
    recipe: null,
    status: null,
    missingIngredients: false,
    missingNutrition: false,
    missingProducts: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg.startsWith('--recipe=')) args.recipe = arg.slice('--recipe='.length);
    else if (arg === '--recipe') args.recipe = argv[++index];
    else if (arg.startsWith('--status=')) args.status = arg.slice('--status='.length);
    else if (arg === '--status') args.status = argv[++index];
    else if (arg === '--missing-ingredients') args.missingIngredients = true;
    else if (arg === '--missing-nutrition') args.missingNutrition = true;
    else if (arg === '--missing-products') args.missingProducts = true;
  }

  return args;
}

function human(report) {
  return [
    'DB4 Recipe Quality Report',
    `Total recipes: ${report.total_recipes}`,
    `By usability: ${formatSummary(report.summary_by_usability_status)}`,
    `By readiness: ${formatSummary(report.summary_by_readiness_status)}`,
    `Missing ingredient matches: ${report.ingredients_missing_matched_ingredient_id.length}`,
    `Missing grams: ${report.ingredients_missing_quantity_grams.length}`,
    `Missing ingredient nutrition: ${report.ingredients_missing_approved_nutrition.length}`,
    `Missing product mappings: ${report.ingredients_missing_approved_product_mappings.length}`,
    `Approved recipe nutrition profiles: ${report.recipes_with_approved_nutrition_profiles.length}`,
    `Top gap candidates: ${report.top_ingredient_gap_candidates.length}`,
  ].join('\n');
}

function formatSummary(rows = []) {
  return rows.map((row) => `${row.key}:${row.count}`).join(', ') || 'none';
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  human,
  parseArgs,
};
