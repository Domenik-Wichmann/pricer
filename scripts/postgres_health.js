const {
  checkPostgresHealth,
} = require('../functions/src');

async function main() {
  const result = await checkPostgresHealth();
  if (result.skipped) {
    console.log('Postgres is not configured; health check skipped.');
    console.log('Start local Postgres with: docker compose up -d postgres');
    return;
  }

  console.log(`Postgres health: ok=${result.ok}, migration_table_exists=${result.migration_table_exists}`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
