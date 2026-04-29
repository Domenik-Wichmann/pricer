const fs = require('node:fs');
const path = require('node:path');

const {
  buildMealPlanProductCandidateSet,
  createPostgresPool,
  createRuntimeDataBackboneStore,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running PLAN2B product candidates.');
    return;
  }

  const store = await createRuntimeDataBackboneStore({ env: process.env });
  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await buildMealPlanProductCandidateSet(client, {
        ...args,
        store,
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
    netRequirementId: null,
    netRequirementKey: null,
    dryRun: false,
    json: false,
    out: null,
    limit: 1000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--net-requirement-id=')) args.netRequirementId = arg.slice('--net-requirement-id='.length);
    else if (arg === '--net-requirement-id') args.netRequirementId = argv[++index];
    else if (arg.startsWith('--net-requirement-key=')) args.netRequirementKey = arg.slice('--net-requirement-key='.length);
    else if (arg === '--net-requirement-key') args.netRequirementKey = argv[++index];
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
    else if (arg.startsWith('--limit=')) args.limit = Number.parseInt(arg.slice('--limit='.length), 10);
    else if (arg === '--limit') args.limit = Number.parseInt(argv[++index], 10);
  }

  return args;
}

function human(report) {
  return [
    'PLAN2B Meal Plan Product Candidates',
    `Dry run: ${report.dry_run}`,
    `Candidate set key: ${report.candidate_set.candidate_set_key}`,
    `Net requirement: ${report.net_requirement.net_requirement_key}`,
    `Requirement items seen: ${report.requirement_items_seen}`,
    `Candidates created: ${report.candidates_created}`,
    `Covered by inventory: ${report.covered_by_inventory}`,
    `Missing product mapping: ${report.missing_product_mapping}`,
    `Missing product size: ${report.missing_product_size}`,
    `Missing price: ${report.missing_price}`,
    `Ready for optimizer: ${report.ready_for_optimizer}`,
    `Total required grams: ${report.total_required_grams}`,
    `Estimated price min: ${report.total_estimated_price_min}`,
    `Estimated price max: ${report.total_estimated_price_max}`,
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
