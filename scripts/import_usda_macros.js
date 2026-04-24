const {
  createPostgresPool,
  isPostgresConfigured,
  runPostgresMigrations,
  importUsdaMacros,
  resolveUsdaDatasetRoot,
} = require('../functions/src');

async function main() {
  const datasetRoot = resolveArgValue('--dataset-root') || process.env.USDA_DATASET_ROOT;
  const version = resolveArgValue('--dataset-version') || process.env.USDA_DATASET_VERSION || '2025-12-18';
  const batchSize = Number(resolveArgValue('--batch-size') || process.env.USDA_IMPORT_BATCH_SIZE || 1000);

  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running the USDA macro import.');
    console.log('Local example: docker compose up -d postgres');
    console.log('Then set DATABASE_URL=postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev');
    return;
  }

  const root = resolveUsdaDatasetRoot(datasetRoot);
  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const result = await importUsdaMacros({
        client,
        datasetRoot: root,
        datasetVersion: version,
        batchSize,
      });
      console.log(JSON.stringify(result, null, 2));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function resolveArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] || null;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
