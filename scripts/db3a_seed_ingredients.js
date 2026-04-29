const fs = require('node:fs');
const path = require('node:path');
const {
  createPostgresPool,
  isPostgresConfigured,
  runPostgresMigrations,
  upsertIngredientByKey,
} = require('../functions/src');

async function seedCanonicalIngredients({ client, dryRun = false, limit = 1000, seedPath = defaultSeedPath() } = {}) {
  const seeds = JSON.parse(fs.readFileSync(seedPath, 'utf8')).slice(0, positiveInteger(limit, 1000));
  const report = { dry_run: Boolean(dryRun), seed_path: seedPath, scanned: seeds.length, upserted: 0, ingredients: [] };
  for (const seed of seeds) {
    const normalizedSeed = {
      source: 'data/seeds/ingredients_seed.json',
      generation_method: 'fixture_seed_v1',
      rules_version: 'db3a_ingredient_rules_v1',
      ...seed,
    };
    if (dryRun) {
      report.ingredients.push(normalizedSeed);
      continue;
    }
    report.ingredients.push(await upsertIngredientByKey(client, normalizedSeed));
    report.upserted += 1;
  }
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before seeding DB3A ingredients.');
    return;
  }
  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await seedCanonicalIngredients({ ...args, client });
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

function defaultSeedPath() {
  return path.join(__dirname, '..', 'data', 'seeds', 'ingredients_seed.json');
}

function parseArgs(argv) {
  const args = { dryRun: false, limit: 1000, json: false, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice(8));
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg.startsWith('--out=')) args.out = arg.slice(6);
    else if (arg === '--out') args.out = argv[++i];
  }
  return args;
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function human(report) {
  return [
    'DB3A canonical ingredient seed',
    `Dry run: ${report.dry_run}`,
    `Scanned: ${report.scanned}`,
    `Upserted: ${report.upserted}`,
  ].join('\n');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, seedCanonicalIngredients };
