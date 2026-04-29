const fs = require('node:fs');
const path = require('node:path');

const {
  createPostgresPool,
  createRuntimeDataBackboneStore,
  isPostgresConfigured,
  optimizeMealPlanBasket,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running PLAN2C basket optimization.');
    return;
  }

  const store = await createRuntimeDataBackboneStore({ env: process.env });
  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await optimizeMealPlanBasket(client, {
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
    candidateSetId: null,
    candidateSetKey: null,
    dryRun: false,
    json: false,
    out: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--candidate-set-id=')) args.candidateSetId = arg.slice('--candidate-set-id='.length);
    else if (arg === '--candidate-set-id') args.candidateSetId = argv[++index];
    else if (arg.startsWith('--candidate-set-key=')) args.candidateSetKey = arg.slice('--candidate-set-key='.length);
    else if (arg === '--candidate-set-key') args.candidateSetKey = argv[++index];
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
  }

  return args;
}

function human(report) {
  return [
    'PLAN2C Meal Plan Basket Optimizer Adapter',
    `Dry run: ${report.dry_run}`,
    `Candidate set key: ${report.candidate_set.candidate_set_key}`,
    `Optimizer run key: ${report.optimized_basket.optimizer_run_key}`,
    `Ready candidates: ${report.ready_candidates}`,
    `Selected strategy: ${report.selected_strategy}`,
    `Selected items: ${report.selected_items}`,
    `Covered by inventory: ${report.covered_by_inventory}`,
    `Missing product: ${report.missing_product}`,
    `Missing price: ${report.missing_price}`,
    `Optimizer excluded: ${report.optimizer_excluded}`,
    `Needs review: ${report.needs_review}`,
    `Total estimated price: ${report.total_estimated_price} ${report.currency}`,
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
