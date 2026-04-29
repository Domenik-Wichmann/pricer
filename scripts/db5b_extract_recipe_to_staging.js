const fs = require('node:fs');
const path = require('node:path');

const {
  createPostgresPool,
  extractRecipeJobsToStaging,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running DB5B recipe extraction.');
    return;
  }
  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await extractRecipeJobsToStaging(client, args);
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
    jobId: null,
    status: 'pending',
    limit: 10,
    dryRun: false,
    force: false,
    json: false,
    out: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--job-id=')) args.jobId = arg.slice('--job-id='.length);
    else if (arg === '--job-id') args.jobId = argv[++index];
    else if (arg.startsWith('--status=')) args.status = arg.slice('--status='.length);
    else if (arg === '--status') args.status = argv[++index];
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
  }
  return args;
}

function human(report) {
  return [
    'DB5B recipe extraction to staging',
    `Dry run: ${report.dry_run}`,
    `Force: ${report.force}`,
    `Jobs seen: ${report.jobs_seen}`,
    `Jobs extracted: ${report.jobs_extracted}`,
    `Jobs staged: ${report.jobs_staged}`,
    `Jobs failed: ${report.jobs_failed}`,
    `Skipped existing: ${report.skipped_existing}`,
    `Ingredients matched: ${report.ingredients_matched}`,
    `Ingredients unmatched: ${report.ingredients_unmatched}`,
    `Validation errors: ${report.validation_errors}`,
    `LLM errors: ${report.llm_errors}`,
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
  parseArgs,
};
