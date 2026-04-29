const fs = require('node:fs');
const path = require('node:path');

const {
  createPostgresPool,
  generateMealPlan,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running PLAN1 meal planning.');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await generateMealPlan(client, args);
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
    profileId: null,
    userId: null,
    startDate: null,
    days: 7,
    mealsPerDay: 3,
    dryRun: false,
    json: false,
    out: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--profile-id=')) args.profileId = arg.slice('--profile-id='.length);
    else if (arg === '--profile-id') args.profileId = argv[++index];
    else if (arg.startsWith('--user-id=')) args.userId = arg.slice('--user-id='.length);
    else if (arg === '--user-id') args.userId = argv[++index];
    else if (arg.startsWith('--start-date=')) args.startDate = arg.slice('--start-date='.length);
    else if (arg === '--start-date') args.startDate = argv[++index];
    else if (arg.startsWith('--days=')) args.days = Number(arg.slice('--days='.length));
    else if (arg === '--days') args.days = Number(argv[++index]);
    else if (arg.startsWith('--meals-per-day=')) args.mealsPerDay = Number(arg.slice('--meals-per-day='.length));
    else if (arg === '--meals-per-day') args.mealsPerDay = Number(argv[++index]);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
  }

  return args;
}

function human(report) {
  return [
    'PLAN1 Deterministic Meal Plan',
    `Dry run: ${report.dry_run}`,
    `Plan key: ${report.plan.plan_key}`,
    `Profile: ${report.plan.profile_id}`,
    `Recipes considered: ${report.recipes_considered}`,
    `Recipes filtered: ${report.recipes_filtered}`,
    `Plan items created: ${report.plan_items_created}`,
    `Average selection score: ${report.average_selection_score}`,
    `Daily calories: ${report.daily_calorie_summary.map((row) => `${row.day_index}:${row.total_calories}`).join(', ') || 'none'}`,
    `Macro totals: kcal=${report.macro_summary.total_calories}, protein=${report.macro_summary.total_protein_g}, carbs=${report.macro_summary.total_carbs_g}, fat=${report.macro_summary.total_fat_g}`,
    `Errors: ${report.errors.length}`,
  ].join('\n');
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
