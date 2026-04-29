const fs = require('node:fs');
const path = require('node:path');

const {
  createPostgresPool,
  createRuntimeDataBackboneStore,
  isPostgresConfigured,
  runMealPlanShoppingOrchestration,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running PLAN2D meal-plan shopping orchestration.');
    return;
  }

  const store = await createRuntimeDataBackboneStore({ env: process.env });
  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await runMealPlanShoppingOrchestration(client, {
        ...args,
        store,
      });
      if (args.out) {
        fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
        fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
      }
      console.log(args.json || args.out ? JSON.stringify(report, null, 2) : human(report));
      if (report.run_status === 'failed') {
        process.exitCode = 1;
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function parseArgs(argv) {
  const args = {
    userId: null,
    profileId: null,
    planId: null,
    planKey: null,
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
    else if (arg.startsWith('--user-id=')) args.userId = arg.slice('--user-id='.length);
    else if (arg === '--user-id') args.userId = argv[++index];
    else if (arg.startsWith('--profile-id=')) args.profileId = arg.slice('--profile-id='.length);
    else if (arg === '--profile-id') args.profileId = argv[++index];
    else if (arg.startsWith('--plan-id=')) args.planId = arg.slice('--plan-id='.length);
    else if (arg === '--plan-id') args.planId = argv[++index];
    else if (arg.startsWith('--plan-key=')) args.planKey = arg.slice('--plan-key='.length);
    else if (arg === '--plan-key') args.planKey = argv[++index];
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
    'PLAN2D Meal Plan Shopping Orchestration',
    `Dry run: ${report.dry_run}`,
    `Run status: ${report.run_status}`,
    `Plan generated: ${report.plan_generated}`,
    `Plan id: ${report.ids.plan_id || 'none'}`,
    `Requirement id: ${report.ids.requirement_id || 'none'}`,
    `Net requirement id: ${report.ids.net_requirement_id || 'none'}`,
    `Candidate set id: ${report.ids.candidate_set_id || 'none'}`,
    `Optimized basket id: ${report.ids.optimized_basket_id || 'none'}`,
    `Total estimated price: ${report.total_estimated_price} ${report.run?.summary_json?.currency || 'EUR'}`,
    `Inventory coverage percent: ${report.inventory_coverage_percent}`,
    `Missing items: ${report.missing_items_count}`,
    `Ready items: ${report.ready_items_count}`,
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
