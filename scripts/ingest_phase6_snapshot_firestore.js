const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const admin = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const {
  buildCurrentOfferReadModel,
  buildDocumentId,
  buildSnapshotZipUrl,
  createEmptyDataBackbone,
  importDailySnapshotZip,
  listSnapshotEntries,
  resolveCollectionName,
  runDailyAggregation,
} = require('../app/functions/src');
const {
  DEFAULT_HISTORICAL_TARGET_COLLECTIONS,
  HISTORICAL_CURRENT_READ_MODEL_COLLECTIONS,
} = require('../app/functions/src/phase6/admin_ingest_jobs');

const HISTORICAL_PUBLISHABLE_COLLECTIONS = Object.freeze([
  'raw_price_snapshots',
  'product_daily_prices',
  'ingest_runs',
  'pipeline_logs',
  'source_products',
  'source_product_enrichment',
  'retailer_locations',
  'canonical_products',
  'canonical_product_mappings',
  'canonical_enrichment_store',
  'canonical_disambiguation_queue',
  'canonical_disambiguation_decisions',
  'current_product_offers',
  'canonical_current_offer_summary',
  'category_daily_aggregates',
]);

class DirectMemoryStore {
  constructor() {
    this.state = createEmptyDataBackbone();
  }

  async load() {
    return this.state;
  }

  async save(nextState) {
    this.state = nextState;
  }
}

async function main() {
  const result = await runHistoricalSnapshotPublishFromEnv(process.env);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function runHistoricalSnapshotPublishFromEnv(env = process.env) {
  const options = resolveHistoricalSnapshotOptions(env);
  const now = new Date().toISOString();
  const zipFilePath = await resolveSnapshotZipFile({
    ...options,
    now,
  });
  return runHistoricalSnapshotPublish({
    ...options,
    zipFilePath,
    now,
  });
}

async function runHistoricalSnapshotPublish({
  snapshotDate,
  snapshotUrl = null,
  zipFilePath,
  projectId,
  databaseId,
  collectionPrefix,
  targetCollections,
  dryRun = true,
  skipExisting = true,
  validationLimit = null,
  checkExistingInDryRun = false,
  now = new Date().toISOString(),
} = {}) {
  const entries = await listSnapshotEntries({ zipFilePath });
  const store = new DirectMemoryStore();
  const ingest = await importDailySnapshotZip({
    store,
    zipFilePath,
    snapshotDate,
    sourceUrl: snapshotUrl,
    ingestedAt: now,
    enableLlmEnrichment: false,
    enrichmentApiKey: '',
  });
  const aggregation = await runDailyAggregation({
    store,
    date: snapshotDate,
  });
  const state = await store.load();

  if (targetCollections.some((collectionName) => HISTORICAL_CURRENT_READ_MODEL_COLLECTIONS.includes(collectionName))) {
    const currentOfferReadModel = buildCurrentOfferReadModel({
      state,
      generatedAt: now,
    });
    state.current_product_offers = currentOfferReadModel.current_product_offers;
    state.canonical_current_offer_summary = currentOfferReadModel.canonical_current_offer_summary;
  }

  const firestore = dryRun && !checkExistingInDryRun
    ? null
    : getFirestore(getOrCreateFirebaseApp(projectId), databaseId);
  const publish = {};

  for (const collectionName of targetCollections) {
    publish[collectionName] = await publishCollection({
      firestore,
      collectionPrefix,
      collectionName,
      records: state[collectionName] || [],
      skipExisting,
      dryRun,
      validationLimit,
    });
  }

  return {
    command: 'phase6:ingest-snapshot',
    backend: 'firestore',
    project_id: projectId,
    database_id: databaseId,
    collection_prefix: collectionPrefix,
    source: {
      snapshot_date: snapshotDate,
      url: snapshotUrl,
      zip_file_path: zipFilePath,
      zip_bytes: fs.statSync(zipFilePath).size,
      entry_count: entries.length,
    },
    ingest: {
      imported_rows: ingest.imported_rows,
      unique_rows: ingest.unique_rows,
      duplicate_rows: ingest.duplicate_rows,
      malformed_rows: ingest.malformed_rows,
      created_products: ingest.created_products,
      updated_products: ingest.updated_products,
      canonical_product_count: ingest.canonical_product_count,
      canonical_warning_count: ingest.canonical_warning_count,
      canonical_disambiguation_queue_count: ingest.canonical_disambiguation_queue_count,
      canonical_enrichment_model_call_count: ingest.canonical_enrichment_model_call_count,
    },
    aggregation: {
      skipped: aggregation.skipped,
      product_daily_prices_rows: aggregation.product_rows || 0,
      category_daily_aggregates_rows: aggregation.category_rows || 0,
    },
    target_collections: targetCollections,
    validation_limit: validationLimit,
    dry_run: dryRun,
    destructive_deletes: false,
    full_store_load_save_production_path: false,
    publish,
  };
}

async function publishCollection({
  firestore,
  collectionPrefix,
  collectionName,
  records,
  skipExisting,
  dryRun,
  validationLimit = null,
}) {
  const collectionId = resolveCollectionName(collectionPrefix, collectionName);
  const selectedRecords = Number.isInteger(validationLimit) && validationLimit > 0
    ? records.slice(0, validationLimit)
    : records;
  const collectionRef = firestore ? firestore.collection(collectionId) : null;
  let recordsToWrite = 0;
  let skippedExisting = 0;
  let failedWrites = 0;
  let batch = firestore ? firestore.batch() : null;
  let pending = 0;

  const commitBatch = async () => {
    if (!batch || pending === 0) {
      return;
    }
    await batch.commit();
    batch = firestore.batch();
    pending = 0;
  };

  for (const record of selectedRecords) {
    const documentId = buildDocumentId(collectionName, record);
    if (skipExisting && collectionRef) {
      const existing = await collectionRef.doc(documentId).get();
      if (existing.exists) {
        skippedExisting += 1;
        continue;
      }
    }

    recordsToWrite += 1;
    if (dryRun || !collectionRef) {
      continue;
    }

    try {
      batch.set(collectionRef.doc(documentId), sanitizeStoredRecord(record));
      pending += 1;
      if (pending >= 400) {
        await commitBatch();
      }
    } catch (_error) {
      failedWrites += 1;
    }
  }

  if (!dryRun) {
    await commitBatch();
  }

  return {
    collection: collectionId,
    input_records: records.length,
    selected_records: selectedRecords.length,
    records_to_write: recordsToWrite,
    written_records: dryRun ? 0 : recordsToWrite - failedWrites,
    skipped_existing_records: skippedExisting,
    failed_writes: failedWrites,
    dry_run: dryRun,
    destructive_deletes: false,
  };
}

function resolveHistoricalSnapshotOptions(env = process.env) {
  const snapshotDate = requiredDateEnv(env, 'PRICER_SNAPSHOT_DATE');
  const snapshotUrl = optionalEnv(env, 'PRICER_SNAPSHOT_URL') || buildSnapshotZipUrl({ snapshotDate });
  const zipFilePath = optionalEnv(env, 'PRICER_SNAPSHOT_ZIP_PATH');
  const dryRun = env.PRICER_PHASE6_PUBLISH_DRY_RUN !== 'false';
  const targetCollections = resolveTargetCollections(env.PRICER_PHASE6_PUBLISH_COLLECTIONS);
  if (
    targetCollections.some((collectionName) => HISTORICAL_CURRENT_READ_MODEL_COLLECTIONS.includes(collectionName)) &&
    env.PRICER_PHASE6_ALLOW_CURRENT_READ_MODEL !== 'true'
  ) {
    throw new Error('Historical ingest refuses current read-model targets unless PRICER_PHASE6_ALLOW_CURRENT_READ_MODEL=true.');
  }

  return {
    snapshotDate,
    snapshotUrl,
    zipFilePath,
    projectId: requiredEnv(env, 'PRICER_FIRESTORE_PROJECT_ID'),
    databaseId: env.PRICER_FIRESTORE_DATABASE_ID || '(default)',
    collectionPrefix: requiredEnv(env, 'PRICER_FIRESTORE_COLLECTION_PREFIX'),
    targetCollections,
    dryRun,
    skipExisting: env.PRICER_PHASE6_PUBLISH_SKIP_EXISTING !== 'false',
    validationLimit: normalizeValidationLimit(env.PRICER_PHASE6_VALIDATION_LIMIT),
    checkExistingInDryRun: env.PRICER_PHASE6_CHECK_EXISTING_IN_DRY_RUN === 'true',
    workingDirectory: env.PRICER_WORK_DIR || path.join(process.cwd(), 'tmp', 'phase6_historical'),
  };
}

async function resolveSnapshotZipFile({
  snapshotDate,
  snapshotUrl,
  zipFilePath,
  workingDirectory,
}) {
  if (zipFilePath) {
    const resolvedPath = path.resolve(zipFilePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`PRICER_SNAPSHOT_ZIP_PATH does not exist: ${resolvedPath}`);
    }
    return resolvedPath;
  }

  fs.mkdirSync(workingDirectory, { recursive: true });
  const outputPath = path.join(workingDirectory, `${snapshotDate}.zip`);
  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  const response = await fetch(snapshotUrl);
  if (!response.ok) {
    throw new Error(`snapshot download failed with status ${response.status}`);
  }
  await pipeline(response.body, fs.createWriteStream(outputPath));
  return outputPath;
}

function resolveTargetCollections(raw) {
  if (!raw || !String(raw).trim()) {
    return [...DEFAULT_HISTORICAL_TARGET_COLLECTIONS];
  }

  const requested = String(raw)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  requested.forEach((collectionName) => {
    if (!HISTORICAL_PUBLISHABLE_COLLECTIONS.includes(collectionName)) {
      throw new Error(`Unsupported historical publish collection "${collectionName}".`);
    }
  });
  return [...new Set(requested)];
}

function getOrCreateFirebaseApp(projectId) {
  const appName = 'pricer-phase6-historical-publisher';
  try {
    return admin.getApp(appName);
  } catch (_error) {
    return admin.initializeApp({
      credential: admin.applicationDefault(),
      projectId,
    }, appName);
  }
}

function sanitizeStoredRecord(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeStoredRecord(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, sanitizeStoredRecord(entry)])
    );
  }

  return value;
}

function optionalEnv(env, name) {
  const value = env[name];
  return value && String(value).trim() ? String(value).trim() : '';
}

function requiredEnv(env, name) {
  const value = optionalEnv(env, name);
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function requiredDateEnv(env, name) {
  const value = requiredEnv(env, name);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`${name} must be YYYY-MM-DD.`);
  }
  return value;
}

function normalizeValidationLimit(value) {
  if (!value || !String(value).trim()) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('PRICER_PHASE6_VALIDATION_LIMIT must be a positive integer when set.');
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
  HISTORICAL_PUBLISHABLE_COLLECTIONS,
  DirectMemoryStore,
  publishCollection,
  resolveHistoricalSnapshotOptions,
  resolveTargetCollections,
  runHistoricalSnapshotPublish,
  runHistoricalSnapshotPublishFromEnv,
};
