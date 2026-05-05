const crypto = require('node:crypto');

const ADMIN_INGEST_JOB_STATUSES = Object.freeze([
  'planned',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

const ADMIN_INGEST_SOURCE_TYPES = Object.freeze([
  'upload',
  'url',
  'local_path',
]);

const DEFAULT_HISTORICAL_TARGET_COLLECTIONS = Object.freeze([
  'raw_price_snapshots',
  'product_daily_prices',
  'ingest_runs',
  'pipeline_logs',
]);

const HISTORICAL_CURRENT_READ_MODEL_COLLECTIONS = Object.freeze([
  'current_product_offers',
  'canonical_current_offer_summary',
]);

function buildAdminIngestJobId({
  snapshotDate,
  sourceType,
  sourceUrl = null,
  storagePath = null,
  localPath = null,
  dryRun = true,
  targetCollections = DEFAULT_HISTORICAL_TARGET_COLLECTIONS,
  createdAt = new Date().toISOString(),
} = {}) {
  return crypto
    .createHash('sha256')
    .update([
      snapshotDate || '',
      sourceType || '',
      sourceUrl || '',
      storagePath || '',
      localPath || '',
      dryRun ? 'dry_run' : 'real_run',
      normalizeTargetCollections(targetCollections).join(','),
      createdAt,
    ].join('|'))
    .digest('hex');
}

function buildAdminIngestJobRecord({
  jobId = null,
  snapshotDate,
  sourceType = 'url',
  sourceUrl = null,
  storagePath = null,
  localPath = null,
  status = 'planned',
  dryRun = true,
  targetCollections = DEFAULT_HISTORICAL_TARGET_COLLECTIONS,
  createdBy = null,
  counts = {},
  warnings = [],
  errors = [],
  firestorePrefix = null,
  command = null,
  version = 'historical_ingest_admin_v1',
  commandHash = null,
  createdAt = new Date().toISOString(),
  startedAt = null,
  finishedAt = null,
} = {}) {
  const normalizedSourceType = normalizeSourceType(sourceType);
  const normalizedStatus = normalizeStatus(status);
  const normalizedTargetCollections = normalizeTargetCollections(targetCollections);
  const normalizedJobId = jobId || buildAdminIngestJobId({
    snapshotDate,
    sourceType: normalizedSourceType,
    sourceUrl,
    storagePath,
    localPath,
    dryRun,
    targetCollections: normalizedTargetCollections,
    createdAt,
  });

  return {
    job_id: normalizedJobId,
    snapshot_date: normalizeSnapshotDate(snapshotDate),
    source_type: normalizedSourceType,
    source_url: sourceUrl || null,
    storage_path: storagePath || null,
    local_path: localPath || null,
    status: normalizedStatus,
    dry_run: Boolean(dryRun),
    target_collections: normalizedTargetCollections,
    started_at: startedAt,
    finished_at: finishedAt,
    created_by: createdBy || null,
    counts: counts && typeof counts === 'object' && !Array.isArray(counts) ? counts : {},
    warnings: Array.isArray(warnings) ? warnings : [],
    errors: Array.isArray(errors) ? errors : [],
    firestore_prefix: firestorePrefix || null,
    command,
    version,
    command_hash: commandHash || (command ? hashCommand(command) : null),
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function buildHistoricalIngestCommandPreview({
  snapshotDate,
  sourceUrl = '',
  localPath = '',
  firestoreProjectId = 'pricer-ee440',
  firestoreDatabaseId = '(default)',
  firestorePrefix = 'prod',
  dryRun = true,
  targetCollections = DEFAULT_HISTORICAL_TARGET_COLLECTIONS,
} = {}) {
  const assignments = [
    `$env:PRICER_SNAPSHOT_DATE="${normalizeSnapshotDate(snapshotDate)}"`,
    sourceUrl ? `$env:PRICER_SNAPSHOT_URL="${escapePowerShellValue(sourceUrl)}"` : null,
    localPath ? `$env:PRICER_SNAPSHOT_ZIP_PATH="${escapePowerShellValue(localPath)}"` : null,
    '$env:PRICER_STORE_BACKEND="firestore"',
    `$env:PRICER_FIRESTORE_PROJECT_ID="${escapePowerShellValue(firestoreProjectId)}"`,
    `$env:PRICER_FIRESTORE_DATABASE_ID="${escapePowerShellValue(firestoreDatabaseId)}"`,
    `$env:PRICER_FIRESTORE_COLLECTION_PREFIX="${escapePowerShellValue(firestorePrefix)}"`,
    `$env:PRICER_PHASE6_PUBLISH_DRY_RUN="${dryRun ? 'true' : 'false'}"`,
    `$env:PRICER_PHASE6_PUBLISH_COLLECTIONS="${normalizeTargetCollections(targetCollections).join(',')}"`,
    '$env:ENABLE_LLM_ENRICHMENT="false"',
    '$env:XAI_API_KEY=""',
    'npm run phase6:ingest-snapshot',
  ].filter(Boolean);

  return assignments.join('; ');
}

async function listAdminIngestJobs({
  store,
  limit = 50,
} = {}) {
  const state = typeof store?.loadCollections === 'function'
    ? await store.loadCollections(['admin_ingest_jobs'])
    : await store.load();
  const boundedLimit = normalizeLimit(limit);
  return (state.admin_ingest_jobs || [])
    .slice()
    .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
    .slice(0, boundedLimit);
}

async function getAdminIngestJob({
  store,
  jobId,
} = {}) {
  const normalizedJobId = String(jobId || '').trim();
  if (!normalizedJobId) {
    return null;
  }
  if (typeof store?.queryCollection === 'function') {
    const rows = await store.queryCollection('admin_ingest_jobs', {
      fieldName: 'job_id',
      value: normalizedJobId,
    });
    return rows[0] || null;
  }
  const state = await store.load();
  return (state.admin_ingest_jobs || []).find((job) => job.job_id === normalizedJobId) || null;
}

async function createPlannedAdminIngestJob({
  store,
  body = {},
  createdBy = null,
  createdAt = new Date().toISOString(),
} = {}) {
  const targetCollections = normalizeTargetCollections(
    body.target_collections || DEFAULT_HISTORICAL_TARGET_COLLECTIONS
  );
  const command = buildHistoricalIngestCommandPreview({
    snapshotDate: body.snapshot_date,
    sourceUrl: body.source_url || '',
    localPath: body.local_path || '',
    firestorePrefix: body.firestore_prefix || 'prod',
    dryRun: body.dry_run !== false,
    targetCollections,
  });
  const record = buildAdminIngestJobRecord({
    snapshotDate: body.snapshot_date,
    sourceType: body.source_type || (body.local_path ? 'local_path' : 'url'),
    sourceUrl: body.source_url || null,
    storagePath: body.storage_path || null,
    localPath: body.local_path || null,
    dryRun: body.dry_run !== false,
    targetCollections,
    createdBy,
    firestorePrefix: body.firestore_prefix || 'prod',
    command,
    createdAt,
  });

  if (typeof store?.upsertRecord === 'function') {
    await store.upsertRecord('admin_ingest_jobs', record);
    return record;
  }

  const state = await store.load();
  state.admin_ingest_jobs = state.admin_ingest_jobs || [];
  const existingIndex = state.admin_ingest_jobs.findIndex((job) => job.job_id === record.job_id);
  if (existingIndex >= 0) {
    state.admin_ingest_jobs[existingIndex] = record;
  } else {
    state.admin_ingest_jobs.push(record);
  }
  await store.save(state);
  return record;
}

function planHistoricalIngest({
  body = {},
} = {}) {
  const targetCollections = normalizeTargetCollections(
    body.target_collections || DEFAULT_HISTORICAL_TARGET_COLLECTIONS
  );
  const warnings = [];
  if (targetCollections.some((collectionName) => HISTORICAL_CURRENT_READ_MODEL_COLLECTIONS.includes(collectionName))) {
    warnings.push('Current read-model collections were selected; they should only be rebuilt from the latest/current selector.');
  }
  if (targetCollections.includes('canonical_products') || targetCollections.includes('canonical_product_mappings')) {
    warnings.push('Canonical/catalog collections require careful idempotent upserts and should not be deleted during historical ingest.');
  }
  if (!body.source_url && !body.local_path && !body.storage_path) {
    warnings.push('Provide a ZIP URL, Cloud Storage path, or operator-local ZIP path before running the command.');
  }

  return {
    snapshot_date: normalizeSnapshotDate(body.snapshot_date),
    dry_run: body.dry_run !== false,
    source_type: normalizeSourceType(body.source_type || (body.local_path ? 'local_path' : 'url')),
    target_collections: targetCollections,
    command: buildHistoricalIngestCommandPreview({
      snapshotDate: body.snapshot_date,
      sourceUrl: body.source_url || '',
      localPath: body.local_path || '',
      firestorePrefix: body.firestore_prefix || 'prod',
      dryRun: body.dry_run !== false,
      targetCollections,
    }),
    warnings,
    safety_rules: [
      'Dry-run first; dry-run does not write.',
      'No destructive deletes are performed by the historical command.',
      'Historical archive collections grow by date.',
      'Current read models remain latest/current-only unless explicitly targeted.',
      'Do not run multiple publishers concurrently against the same prefix.',
      'HTTP admin endpoints create plans/job records only; they do not process ZIP files.',
    ],
  };
}

async function handleListAdminIngestJobsRequest({
  store,
  body = {},
} = {}) {
  const jobs = await listAdminIngestJobs({
    store,
    limit: body.limit,
  });
  return {
    status: 200,
    body: {
      items: jobs,
      count: jobs.length,
    },
  };
}

async function handleGetAdminIngestJobRequest({
  store,
  params = {},
} = {}) {
  const job = await getAdminIngestJob({
    store,
    jobId: params.id,
  });
  if (!job) {
    return {
      status: 404,
      body: {
        error: 'admin ingest job not found',
      },
    };
  }
  return {
    status: 200,
    body: job,
  };
}

function handlePlanAdminIngestRequest({
  body = {},
} = {}) {
  try {
    return {
      status: 200,
      body: planHistoricalIngest({ body }),
    };
  } catch (error) {
    return {
      status: 400,
      body: {
        error: error.message,
      },
    };
  }
}

async function handleCreateAdminIngestJobRequest({
  store,
  body = {},
  req = null,
} = {}) {
  try {
    const job = await createPlannedAdminIngestJob({
      store,
      body,
      createdBy: resolveAdminIdentity(req),
    });
    return {
      status: 201,
      body: job,
    };
  } catch (error) {
    return {
      status: 400,
      body: {
        error: error.message,
      },
    };
  }
}

function resolveAdminIdentity(req) {
  const headerValue = req?.headers?.['x-pricer-admin-id'] || req?.headers?.['x-pricer-operator-id'];
  return typeof headerValue === 'string' && headerValue.trim() ? headerValue.trim() : null;
}

function normalizeStatus(status) {
  const value = String(status || '').trim();
  if (!ADMIN_INGEST_JOB_STATUSES.includes(value)) {
    throw new Error(`Unsupported admin ingest job status "${status}".`);
  }
  return value;
}

function normalizeSourceType(sourceType) {
  const value = String(sourceType || '').trim();
  if (!ADMIN_INGEST_SOURCE_TYPES.includes(value)) {
    throw new Error(`Unsupported admin ingest source_type "${sourceType}".`);
  }
  return value;
}

function normalizeSnapshotDate(snapshotDate) {
  const value = String(snapshotDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error('snapshot_date must be YYYY-MM-DD.');
  }
  return value;
}

function normalizeTargetCollections(values) {
  const rawValues = Array.isArray(values)
    ? values
    : String(values || '').split(',');
  const normalized = rawValues
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(normalized.length ? normalized : DEFAULT_HISTORICAL_TARGET_COLLECTIONS)].sort();
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(parsed, 200);
}

function hashCommand(command) {
  return crypto.createHash('sha256').update(command).digest('hex');
}

function escapePowerShellValue(value) {
  return String(value || '').replace(/"/gu, '`"');
}

module.exports = {
  ADMIN_INGEST_JOB_STATUSES,
  ADMIN_INGEST_SOURCE_TYPES,
  DEFAULT_HISTORICAL_TARGET_COLLECTIONS,
  HISTORICAL_CURRENT_READ_MODEL_COLLECTIONS,
  buildAdminIngestJobId,
  buildAdminIngestJobRecord,
  buildHistoricalIngestCommandPreview,
  createPlannedAdminIngestJob,
  getAdminIngestJob,
  handleCreateAdminIngestJobRequest,
  handleGetAdminIngestJobRequest,
  handleListAdminIngestJobsRequest,
  handlePlanAdminIngestRequest,
  listAdminIngestJobs,
  planHistoricalIngest,
};
