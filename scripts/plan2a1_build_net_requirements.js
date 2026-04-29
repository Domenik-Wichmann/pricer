const fs = require('node:fs');
const path = require('node:path');

const {
  buildMealPlanNetRequirements,
  createPostgresPool,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running PLAN2A.1 net requirements.');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await buildMealPlanNetRequirements(client, args);
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
    requirementId: null,
    requirementKey: null,
    dryRun: false,
    json: false,
    out: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--requirement-id=')) args.requirementId = arg.slice('--requirement-id='.length);
    else if (arg === '--requirement-id') args.requirementId = argv[++index];
    else if (arg.startsWith('--requirement-key=')) args.requirementKey = arg.slice('--requirement-key='.length);
    else if (arg === '--requirement-key') args.requirementKey = argv[++index];
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
  }

  return args;
}

function human(report) {
  return [
    'PLAN2A.1 Inventory-Adjusted Meal Plan Net Requirements',
    `Dry run: ${report.dry_run}`,
    `Net requirement key: ${report.net_requirement.net_requirement_key}`,
    `Requirement: ${report.requirement.requirement_key}`,
    `Items created: ${report.items_created}`,
    `Fully covered: ${report.fully_covered}`,
    `Partially covered: ${report.partially_covered}`,
    `No inventory: ${report.no_inventory}`,
    `Missing ingredient: ${report.missing_ingredient}`,
    `Missing quantity: ${report.missing_quantity}`,
    `Ready for product mapping: ${report.ready_for_product_mapping}`,
    `Covered by inventory: ${report.covered_by_inventory}`,
    `Total required grams: ${report.total_required_grams}`,
    `Total inventory applied grams: ${report.total_inventory_applied_grams}`,
    `Total net grams: ${report.total_net_grams}`,
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
