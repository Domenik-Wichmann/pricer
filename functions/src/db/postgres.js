const { Pool } = require('pg');

function buildPostgresConfig(env = process.env) {
  const databaseUrl = cleanString(env.DATABASE_URL || env.PRICER_POSTGRES_URL);
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl: resolveSslConfig(env),
    };
  }

  const host = cleanString(env.POSTGRES_HOST || env.PRICER_POSTGRES_HOST);
  const database = cleanString(env.POSTGRES_DB || env.PRICER_POSTGRES_DB);
  const user = cleanString(env.POSTGRES_USER || env.PRICER_POSTGRES_USER);
  const password = cleanString(env.POSTGRES_PASSWORD || env.PRICER_POSTGRES_PASSWORD);

  if (!host && !database && !user && !password) {
    return null;
  }

  const missing = [];
  if (!host) missing.push('POSTGRES_HOST');
  if (!database) missing.push('POSTGRES_DB');
  if (!user) missing.push('POSTGRES_USER');
  if (!password) missing.push('POSTGRES_PASSWORD');

  if (missing.length > 0) {
    throw new Error(`Incomplete Postgres configuration. Missing: ${missing.join(', ')}`);
  }

  return {
    host,
    port: parsePort(env.POSTGRES_PORT || env.PRICER_POSTGRES_PORT),
    database,
    user,
    password,
    ssl: resolveSslConfig(env),
  };
}

function isPostgresConfigured(env = process.env) {
  return Boolean(buildPostgresConfig(env));
}

function createPostgresPool({
  env = process.env,
  config = null,
} = {}) {
  const resolvedConfig = config || buildPostgresConfig(env);
  if (!resolvedConfig) {
    throw new Error('Postgres is not configured. Set DATABASE_URL or POSTGRES_HOST/POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD.');
  }
  return new Pool(resolvedConfig);
}

async function withPostgresClient(callback, {
  pool = null,
  env = process.env,
} = {}) {
  const ownPool = pool || createPostgresPool({ env });
  const client = await ownPool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
    if (!pool) {
      await ownPool.end();
    }
  }
}

async function checkPostgresHealth({
  client = null,
  pool = null,
  env = process.env,
} = {}) {
  if (!client && !pool && !buildPostgresConfig(env)) {
    return {
      ok: false,
      configured: false,
      skipped: true,
      message: 'postgres_not_configured',
    };
  }

  const run = async (dbClient) => {
    const result = await dbClient.query('SELECT 1 AS ok');
    const migrationTable = await dbClient.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'schema_migrations'
      ) AS exists
    `);
    return {
      ok: result.rows?.[0]?.ok === 1,
      configured: true,
      skipped: false,
      migration_table_exists: Boolean(migrationTable.rows?.[0]?.exists),
    };
  };

  if (client) {
    return run(client);
  }

  return withPostgresClient(run, { pool, env });
}

function parsePort(value) {
  const raw = cleanString(value);
  if (!raw) {
    return 5432;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid Postgres port "${raw}".`);
  }
  return parsed;
}

function resolveSslConfig(env) {
  const raw = cleanString(env.POSTGRES_SSL || env.PRICER_POSTGRES_SSL);
  if (!raw || raw === 'false' || raw === '0' || raw === 'disable') {
    return false;
  }
  if (raw === 'true' || raw === '1' || raw === 'require') {
    return { rejectUnauthorized: false };
  }
  throw new Error(`Unsupported POSTGRES_SSL value "${raw}". Use true or false.`);
}

function cleanString(value) {
  return String(value || '').trim();
}

module.exports = {
  buildPostgresConfig,
  checkPostgresHealth,
  createPostgresPool,
  isPostgresConfigured,
  withPostgresClient,
};
