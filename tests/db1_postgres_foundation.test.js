const assert = require('node:assert/strict');

const {
  buildPostgresConfig,
  checkPostgresHealth,
  createPostgresPool,
  createRuntimeDataBackboneStore,
  getSourceDataset,
  insertSourceFile,
  isPostgresConfigured,
  listMigrationFiles,
  normalizeDataset,
  normalizeSourceFile,
  runPostgresMigrations,
  upsertSourceDataset,
  createImportBatch,
  completeImportBatch,
  getImportBatch,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('Postgres config parsing is explicit and no-config safe', async () => {
  assert.equal(buildPostgresConfig({}), null);
  assert.equal(isPostgresConfigured({}), false);

  const fromUrl = buildPostgresConfig({
    DATABASE_URL: 'postgres://user:pass@localhost:5432/pricer',
    POSTGRES_SSL: 'false',
  });
  assert.equal(fromUrl.connectionString, 'postgres://user:pass@localhost:5432/pricer');
  assert.equal(fromUrl.ssl, false);

  const fromParts = buildPostgresConfig({
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: '5433',
    POSTGRES_DB: 'pricer_dev',
    POSTGRES_USER: 'pricer',
    POSTGRES_PASSWORD: 'secret',
    POSTGRES_SSL: 'true',
  });
  assert.equal(fromParts.host, 'localhost');
  assert.equal(fromParts.port, 5433);
  assert.equal(fromParts.database, 'pricer_dev');
  assert.deepEqual(fromParts.ssl, { rejectUnauthorized: false });

  assert.throws(() => buildPostgresConfig({
    POSTGRES_HOST: 'localhost',
  }), /Incomplete Postgres configuration/);

  const health = await checkPostgresHealth({ env: {} });
  assert.deepEqual(health, {
    ok: false,
    configured: false,
    skipped: true,
    message: 'postgres_not_configured',
  });
});

test('migration runner applies SQL files once and tracks checksums', async () => {
  const client = new FakeMigrationClient();
  const result = await runPostgresMigrations({ client });

  assert.equal(result.total >= 1, true);
  assert.equal(result.applied.includes('001_db1_import_metadata.sql'), true);
  assert.deepEqual(result.skipped, []);
  assert.equal(client.transactions.commits, result.applied.length);
  assert.equal(client.transactions.rollbacks, 0);
  assert.equal(client.executedMigrationSql.length, result.applied.length);

  const second = await runPostgresMigrations({ client });
  assert.deepEqual(second.applied, []);
  assert.equal(second.skipped.includes('001_db1_import_metadata.sql'), true);
  assert.equal(client.executedMigrationSql.length, result.applied.length);
});

test('migration files are deterministic and include DB1 import metadata schema', () => {
  const files = listMigrationFiles();
  const names = files.map((file) => file.name);
  assert.deepEqual(names, [...names].sort());
  assert.equal(names.includes('001_db1_import_metadata.sql'), true);

  const db1 = files.find((file) => file.name === '001_db1_import_metadata.sql');
  assert.match(db1.sql, /CREATE TABLE IF NOT EXISTS source_datasets/);
  assert.match(db1.sql, /CREATE TABLE IF NOT EXISTS source_files/);
  assert.match(db1.sql, /CREATE TABLE IF NOT EXISTS import_batches/);
});

test('import metadata repository normalizes records before DB2 source imports exist', () => {
  assert.deepEqual(normalizeDataset({
    datasetId: 'usda_fdc_2025_12_18',
    sourceName: 'USDA FoodData Central',
    sourceType: 'nutrition',
    rootPath: 'datasets/usda',
  }), {
    dataset_id: 'usda_fdc_2025_12_18',
    source_name: 'USDA FoodData Central',
    source_type: 'nutrition',
    version: null,
    root_path: 'datasets/usda',
    license_note: null,
  });

  assert.deepEqual(normalizeSourceFile({
    sourceFileId: 'file_food',
    datasetId: 'usda_fdc_2025_12_18',
    path: 'food.csv',
    bytes: '123',
    rowCount: 456,
  }), {
    source_file_id: 'file_food',
    dataset_id: 'usda_fdc_2025_12_18',
    path: 'food.csv',
    format: null,
    bytes: 123,
    row_count: 456,
    checksum: null,
  });

  assert.throws(() => normalizeDataset({ sourceName: 'missing id', sourceType: 'x' }), /dataset_id is required/);
});

test('existing runtime store selection remains independent from Postgres configuration', async () => {
  const memoryStore = await createRuntimeDataBackboneStore({
    env: {
      NODE_ENV: 'test',
      POSTGRES_HOST: 'localhost',
      POSTGRES_DB: 'pricer_dev',
      POSTGRES_USER: 'pricer',
      POSTGRES_PASSWORD: 'secret',
    },
  });
  assert.equal(memoryStore.constructor.name, 'InMemoryDataBackboneStore');
});

test('real Postgres import metadata flow works when local Postgres is configured', async () => {
  if (!isPostgresConfigured(process.env)) {
    console.log('SKIP real Postgres metadata flow: Postgres is not configured.');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const dataset = await upsertSourceDataset(client, {
        datasetId: 'db1_test_dataset',
        sourceName: 'DB1 Test Dataset',
        sourceType: 'test',
        version: 'v1',
      });
      assert.equal(dataset.dataset_id, 'db1_test_dataset');

      await insertSourceFile(client, {
        sourceFileId: 'db1_test_file',
        datasetId: 'db1_test_dataset',
        path: 'datasets/test/file.csv',
        format: 'csv',
        bytes: 10,
        rowCount: 1,
        checksum: 'abc',
      });

      const batch = await createImportBatch(client, {
        importBatchId: 'db1_test_batch',
        datasetId: 'db1_test_dataset',
        status: 'running',
        metadataJson: { test: true },
      });
      assert.equal(batch.status, 'running');

      const completed = await completeImportBatch(client, {
        importBatchId: 'db1_test_batch',
        status: 'completed',
      });
      assert.equal(completed.status, 'completed');

      const loadedDataset = await getSourceDataset(client, 'db1_test_dataset');
      const loadedBatch = await getImportBatch(client, 'db1_test_batch');
      assert.equal(loadedDataset.source_name, 'DB1 Test Dataset');
      assert.equal(loadedBatch.status, 'completed');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
});

class FakeMigrationClient {
  constructor() {
    this.applied = new Map();
    this.executedMigrationSql = [];
    this.transactions = {
      begins: 0,
      commits: 0,
      rollbacks: 0,
    };
  }

  async query(sql, params = []) {
    const normalized = String(sql).trim();

    if (normalized === 'BEGIN') {
      this.transactions.begins += 1;
      return { rows: [] };
    }
    if (normalized === 'COMMIT') {
      this.transactions.commits += 1;
      return { rows: [] };
    }
    if (normalized === 'ROLLBACK') {
      this.transactions.rollbacks += 1;
      return { rows: [] };
    }
    if (normalized.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
      return { rows: [] };
    }
    if (normalized.startsWith('SELECT migration_name, checksum FROM schema_migrations')) {
      return {
        rows: [...this.applied.entries()].map(([migration_name, checksum]) => ({
          migration_name,
          checksum,
        })),
      };
    }
    if (normalized.startsWith('INSERT INTO schema_migrations')) {
      this.applied.set(params[0], params[1]);
      return { rows: [] };
    }

    if (
      (normalized.includes('source_datasets') && normalized.includes('source_files') && normalized.includes('import_batches'))
      || normalized.includes('usda_foods')
      || normalized.includes('usda_food_clusters')
      || normalized.includes('usda_food_cluster_review_history')
      || normalized.includes('CREATE TABLE IF NOT EXISTS ingredients')
      || normalized.includes('CREATE TABLE IF NOT EXISTS ingredient_nutrition_profile_candidates')
      || normalized.includes('CREATE TABLE IF NOT EXISTS ingredient_nutrition_profiles')
      || normalized.includes('CREATE TABLE IF NOT EXISTS ingredient_product_candidates')
      || normalized.includes('CREATE TABLE IF NOT EXISTS recipes')
      || normalized.includes('CREATE TABLE IF NOT EXISTS recipe_nutrition_profile_candidates')
      || normalized.includes('CREATE TABLE IF NOT EXISTS recipe_nutrition_profiles')
      || normalized.includes('CREATE TABLE IF NOT EXISTS recipe_ingest_jobs')
      || normalized.includes('CREATE TABLE IF NOT EXISTS ingredient_gap_candidates')
      || normalized.includes('CREATE TABLE IF NOT EXISTS recipe_promotion_history')
      || normalized.includes('CREATE TABLE IF NOT EXISTS user_food_profiles')
      || normalized.includes('CREATE TABLE IF NOT EXISTS user_food_constraints')
      || normalized.includes('CREATE TABLE IF NOT EXISTS user_food_preferences')
      || normalized.includes('CREATE TABLE IF NOT EXISTS user_equipment')
      || normalized.includes('CREATE TABLE IF NOT EXISTS recipe_feedback_events')
      || normalized.includes('CREATE TABLE IF NOT EXISTS recipe_feedback_note_signals')
      || normalized.includes('CREATE TABLE IF NOT EXISTS user_taste_profile_snapshots')
      || normalized.includes('CREATE TABLE IF NOT EXISTS user_taste_profile_signal_sources')
      || normalized.includes('CREATE TABLE IF NOT EXISTS meal_plans')
      || normalized.includes('CREATE TABLE IF NOT EXISTS meal_plan_items')
      || normalized.includes('CREATE TABLE IF NOT EXISTS meal_plan_requirements')
      || normalized.includes('CREATE TABLE IF NOT EXISTS meal_plan_requirement_items')
      || normalized.includes('CREATE TABLE IF NOT EXISTS meal_plan_net_requirements')
      || normalized.includes('CREATE TABLE IF NOT EXISTS meal_plan_net_requirement_items')
      || normalized.includes('CREATE TABLE IF NOT EXISTS meal_plan_product_candidate_sets')
      || normalized.includes('CREATE TABLE IF NOT EXISTS meal_plan_product_candidates')
      || normalized.includes('CREATE TABLE IF NOT EXISTS meal_plan_optimized_baskets')
      || normalized.includes('CREATE TABLE IF NOT EXISTS meal_plan_optimized_basket_items')
      || normalized.includes('CREATE TABLE IF NOT EXISTS meal_plan_shopping_runs')
      || normalized.includes('CREATE TABLE IF NOT EXISTS user_inventories')
      || normalized.includes('CREATE TABLE IF NOT EXISTS inventory_items')
      || normalized.includes('ALTER TABLE recipe_ingest_jobs')
      || normalized.includes('ALTER TABLE recipes')
      || normalized.includes('ALTER TABLE recipe_ingredients')
      || normalized.includes('ALTER TABLE usda_import_runs')
      || normalized.includes('DROP INDEX IF EXISTS usda_food_nutrients_food_macro_idx')
    ) {
      this.executedMigrationSql.push(normalized);
      return { rows: [] };
    }

    throw new Error(`Unexpected fake query: ${normalized.slice(0, 120)}`);
  }
}

async function run() {
  let failed = 0;

  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error.stack);
    }
  }

  console.log(`\nDB1 Postgres foundation tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
