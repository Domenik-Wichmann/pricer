const {
  createPostgresPool,
  generateUsdaClusterCandidatesBatch,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before generating USDA cluster candidates.');
    console.log('Local example: docker compose up -d postgres');
    console.log('Then set DATABASE_URL=postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const summary = await generateUsdaClusterCandidatesBatch({
        client,
        dryRun: args.dryRun,
        limit: args.limit,
        batchSize: args.batchSize,
        dataTypes: args.dataTypes.length > 0 ? args.dataTypes : null,
      });
      console.log(JSON.stringify(summary, null, 2));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    limit: null,
    batchSize: null,
    dataTypes: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      parsed.limit = Number(arg.slice('--limit='.length));
      continue;
    }
    if (arg === '--limit') {
      parsed.limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--batch-size=')) {
      parsed.batchSize = Number(arg.slice('--batch-size='.length));
      continue;
    }
    if (arg === '--batch-size') {
      parsed.batchSize = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--data-type=')) {
      parsed.dataTypes.push(arg.slice('--data-type='.length));
      continue;
    }
    if (arg === '--data-type') {
      parsed.dataTypes.push(argv[index + 1]);
      index += 1;
    }
  }

  return parsed;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
