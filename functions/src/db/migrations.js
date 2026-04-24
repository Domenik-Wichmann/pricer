const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

const SCHEMA_MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

function listMigrationFiles(migrationsDir = resolveDefaultMigrationsDir()) {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory does not exist: ${migrationsDir}`);
  }

  return fs.readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => ({
      name: fileName,
      path: path.join(migrationsDir, fileName),
      sql: fs.readFileSync(path.join(migrationsDir, fileName), 'utf8'),
    }));
}

async function runPostgresMigrations({
  client,
  migrationsDir = resolveDefaultMigrationsDir(),
} = {}) {
  if (!client) {
    throw new Error('runPostgresMigrations requires a Postgres client.');
  }

  await ensureSchemaMigrationsTable(client);
  const applied = await loadAppliedMigrations(client);
  const files = listMigrationFiles(migrationsDir);
  const appliedNow = [];
  const skipped = [];

  for (const file of files) {
    const checksum = checksumSql(file.sql);
    const existing = applied.get(file.name);
    if (existing) {
      if (existing.checksum !== checksum) {
        throw new Error(`Migration checksum changed after apply: ${file.name}`);
      }
      skipped.push(file.name);
      continue;
    }

    await client.query('BEGIN');
    try {
      await client.query(file.sql);
      await client.query(
        'INSERT INTO schema_migrations (migration_name, checksum) VALUES ($1, $2)',
        [file.name, checksum]
      );
      await client.query('COMMIT');
      appliedNow.push(file.name);
      applied.set(file.name, { checksum });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  return {
    migrations_dir: migrationsDir,
    applied: appliedNow,
    skipped,
    total: files.length,
  };
}

async function ensureSchemaMigrationsTable(client) {
  await client.query(SCHEMA_MIGRATIONS_TABLE_SQL);
}

async function loadAppliedMigrations(client) {
  const result = await client.query(
    'SELECT migration_name, checksum FROM schema_migrations ORDER BY migration_name'
  );
  return new Map((result.rows || []).map((row) => [
    row.migration_name,
    { checksum: row.checksum },
  ]));
}

function checksumSql(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

function resolveDefaultMigrationsDir() {
  const candidates = [
    path.resolve(process.cwd(), 'db', 'migrations'),
    path.resolve(__dirname, '..', '..', '..', '..', 'db', 'migrations'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found || candidates[0];
}

module.exports = {
  checksumSql,
  ensureSchemaMigrationsTable,
  listMigrationFiles,
  loadAppliedMigrations,
  resolveDefaultMigrationsDir,
  runPostgresMigrations,
};
