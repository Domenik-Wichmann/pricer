const fs = require('node:fs');
const path = require('node:path');
const {
  createPostgresPool,
  generateRecipeNutritionProfileCandidates,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before generating DB4B recipe nutrition profiles.');
    return;
  }
  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await generateRecipeNutritionProfileCandidates(client, args);
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
  const args = { dryRun: false, limit: 100, recipe: null, json: false, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg.startsWith('--recipe=')) args.recipe = arg.slice('--recipe='.length);
    else if (arg === '--recipe') args.recipe = argv[++index];
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
  }
  return args;
}

function human(report) {
  return [
    'DB4B recipe nutrition profile generation',
    `Dry run: ${report.dry_run}`,
    `Recipes seen: ${report.recipes_seen}`,
    `Recipes with profiles: ${report.recipes_with_profiles}`,
    `Recipes missing data: ${report.recipes_missing_data}`,
    `Ingredients missing total: ${report.ingredients_missing_total}`,
    `Upserted: ${report.upserted}`,
  ].join('\n');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
};
