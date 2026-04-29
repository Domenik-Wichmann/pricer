const fs = require('node:fs');
const path = require('node:path');
const {
  createPostgresPool,
  isPostgresConfigured,
  runPostgresMigrations,
  suggestIngredientNutritionMappings,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before suggesting ingredient nutrition mappings.');
    return;
  }
  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await suggestIngredientNutritionMappings({ ...args, client });
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
  const args = { dryRun: false, limit: 1000, ingredient: null, clusterKey: null, json: false, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice(8));
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg.startsWith('--ingredient=')) args.ingredient = arg.slice(13);
    else if (arg === '--ingredient') args.ingredient = argv[++i];
    else if (arg.startsWith('--cluster-key=')) args.clusterKey = arg.slice(14);
    else if (arg === '--cluster-key') args.clusterKey = argv[++i];
    else if (arg.startsWith('--out=')) args.out = arg.slice(6);
    else if (arg === '--out') args.out = argv[++i];
  }
  return args;
}

function human(report) {
  return [
    'Ingredient nutrition mapping suggestions',
    `Dry run: ${report.dry_run}`,
    `Approved clusters scanned: ${report.approved_clusters_scanned}`,
    `Ingredients scanned: ${report.ingredients_scanned}`,
    `Suggestions: ${report.suggested_count}`,
    `Upserted: ${report.upserted}`,
  ].join('\n');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
