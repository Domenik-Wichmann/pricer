const fs = require('node:fs');
const path = require('node:path');

const {
  buildMealPlanRequirements,
  createPostgresPool,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running PLAN2A meal-plan requirements.');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await buildMealPlanRequirements(client, args);
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
    planId: null,
    planKey: null,
    dryRun: false,
    json: false,
    out: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--plan-id=')) args.planId = arg.slice('--plan-id='.length);
    else if (arg === '--plan-id') args.planId = argv[++index];
    else if (arg.startsWith('--plan-key=')) args.planKey = arg.slice('--plan-key='.length);
    else if (arg === '--plan-key') args.planKey = argv[++index];
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
  }

  return args;
}

function human(report) {
  return [
    'PLAN2A Meal Plan Requirements',
    `Dry run: ${report.dry_run}`,
    `Requirement key: ${report.requirement.requirement_key}`,
    `Plan: ${report.plan.plan_key}`,
    `Items created: ${report.items_created}`,
    `Ready for product mapping: ${report.ready_for_product_mapping}`,
    `Missing ingredient: ${report.missing_ingredient}`,
    `Missing quantity: ${report.missing_quantity}`,
    `Needs review: ${report.needs_review}`,
    `Total quantity grams: ${report.total_quantity_grams}`,
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
