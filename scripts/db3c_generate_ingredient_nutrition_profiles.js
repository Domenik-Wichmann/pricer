const fs = require('node:fs');
const path = require('node:path');

const {
  createPostgresPool,
  generateIngredientNutritionProfileCandidates,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before generating DB3C profile candidates.');
    console.log('Local example: docker compose up -d postgres');
    console.log('Then set DATABASE_URL=postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await generateIngredientNutritionProfileCandidates({
        client,
        dryRun: args.dryRun,
        limit: args.limit,
      });
      if (args.out) {
        fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
        fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
      }
      if (args.json || args.out) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printHumanReport(report);
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function printHumanReport(report) {
  console.log('DB3C ingredient nutrition profile candidates');
  console.log(`Dry run: ${report.dry_run}`);
  console.log(`Approved mappings scanned: ${report.approved_mappings_scanned}`);
  console.log(`Candidates built: ${report.candidates_built}`);
  console.log(`Upserted: ${report.upserted}`);
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    json: false,
    out: null,
    limit: 1000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg.startsWith('--out=')) parsed.out = arg.slice('--out='.length);
    else if (arg === '--out') {
      parsed.out = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--limit=')) parsed.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') {
      parsed.limit = Number(argv[index + 1]);
      index += 1;
    }
  }
  return parsed;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  printHumanReport,
};
