const fs = require('node:fs');
const path = require('node:path');

const {
  createPostgresPool,
  insertStagedRecipeBundle,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

const DEFAULT_FIXTURE_PATH = path.join(__dirname, '..', 'data', 'seeds', 'recipe_ingest_staging_seed.json');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before seeding DB5A recipe ingest staging.');
    return;
  }
  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await seedRecipeIngestStaging(client, args);
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

async function seedRecipeIngestStaging(client, {
  dryRun = false,
  limit = 100,
  fixturePath = DEFAULT_FIXTURE_PATH,
} = {}) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const selected = fixture.slice(0, positiveInteger(limit, 100));
  const report = emptyReport();
  report.dry_run = Boolean(dryRun);
  report.jobs_seen = selected.length;

  for (const bundle of selected) {
    try {
      if (dryRun) {
        addBundleCounts(report, bundle);
        continue;
      }
      const inserted = await insertStagedRecipeBundle(client, bundle);
      report.jobs_created += inserted.job ? 1 : 0;
      report.staged_recipes_created += inserted.staged_recipe ? 1 : 0;
      report.staged_ingredients_created += inserted.ingredients.length;
      report.staged_steps_created += inserted.steps.length;
      report.staged_tools_created += inserted.tools.length;
      report.staged_methods_created += inserted.methods.length;
      report.staged_tags_created += inserted.tags.length;
      report.staged_state_changes_created += inserted.state_changes.length;
      report.staged_substitutions_created += inserted.substitution_hints.length;
      report.staged_quality_signals_created += inserted.quality_signals.length;
    } catch (error) {
      report.errors.push({
        job_id: bundle.job ? bundle.job.job_id : null,
        message: error.message,
      });
    }
  }

  return report;
}

function addBundleCounts(report, bundle) {
  report.jobs_created += 0;
  report.staged_recipes_created += bundle.recipe || bundle.staged_recipe ? 1 : 0;
  report.staged_ingredients_created += (bundle.ingredients || bundle.staged_ingredients || []).length;
  report.staged_steps_created += (bundle.steps || bundle.staged_steps || []).length;
  report.staged_tools_created += (bundle.tools || []).length;
  report.staged_methods_created += (bundle.methods || []).length;
  report.staged_tags_created += (bundle.tags || []).length;
  report.staged_state_changes_created += (bundle.state_changes || bundle.stateChanges || []).length;
  report.staged_substitutions_created += (bundle.substitution_hints || bundle.substitutionHints || []).length;
  report.staged_quality_signals_created += (bundle.quality_signals || bundle.qualitySignals || []).length;
}

function emptyReport() {
  return {
    dry_run: false,
    jobs_seen: 0,
    jobs_created: 0,
    staged_recipes_created: 0,
    staged_ingredients_created: 0,
    staged_steps_created: 0,
    staged_tools_created: 0,
    staged_methods_created: 0,
    staged_tags_created: 0,
    staged_state_changes_created: 0,
    staged_substitutions_created: 0,
    staged_quality_signals_created: 0,
    errors: [],
  };
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: 100,
    json: false,
    out: null,
    fixturePath: DEFAULT_FIXTURE_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
    else if (arg.startsWith('--fixture=')) args.fixturePath = arg.slice('--fixture='.length);
    else if (arg === '--fixture') args.fixturePath = argv[++index];
  }
  return args;
}

function human(report) {
  return [
    'DB5A recipe ingest staging seed',
    `Dry run: ${report.dry_run}`,
    `Jobs seen: ${report.jobs_seen}`,
    `Jobs created: ${report.jobs_created}`,
    `Staged recipes: ${report.staged_recipes_created}`,
    `Staged ingredients: ${report.staged_ingredients_created}`,
    `Staged steps: ${report.staged_steps_created}`,
    `Staged tools: ${report.staged_tools_created}`,
    `Staged methods: ${report.staged_methods_created}`,
    `Staged tags: ${report.staged_tags_created}`,
    `Staged state changes: ${report.staged_state_changes_created}`,
    `Staged substitutions: ${report.staged_substitutions_created}`,
    `Staged quality signals: ${report.staged_quality_signals_created}`,
    `Errors: ${report.errors.length}`,
  ].join('\n');
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_FIXTURE_PATH,
  parseArgs,
  seedRecipeIngestStaging,
};
