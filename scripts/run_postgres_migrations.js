const {
  createPostgresPool,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured; skipping migrations.');
    console.log('Start local Postgres with: docker compose up -d postgres');
    console.log('Then set POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_DB=pricer_dev POSTGRES_USER=pricer POSTGRES_PASSWORD=pricer_dev_password');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      const result = await runPostgresMigrations({ client });
      console.log(`Postgres migrations complete: ${result.applied.length} applied, ${result.skipped.length} skipped, ${result.total} total.`);
      if (result.applied.length > 0) {
        console.log(`Applied: ${result.applied.join(', ')}`);
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
