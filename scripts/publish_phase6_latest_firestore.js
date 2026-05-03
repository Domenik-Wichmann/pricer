const fs = require('node:fs');
const path = require('node:path');

const admin = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const {
  buildDocumentId,
  createEmptyDataBackbone,
  importDailySnapshotZip,
  listSnapshotEntries,
  resolveCollectionName,
  resolveLatestAvailableSnapshotDate,
  downloadSnapshotZip,
  runDailyAggregation,
  runSemanticEnrichmentJob,
  backfillCanonicalEmbeddings,
} = require('../app/functions/src');

const DEFAULT_TARGET_COLLECTIONS = Object.freeze([
  'raw_price_snapshots',
  'source_products',
  'source_product_enrichment',
  'retailer_locations',
  'canonical_products',
  'canonical_product_mappings',
  'canonical_enrichment_store',
  'canonical_disambiguation_queue',
  'canonical_disambiguation_decisions',
  'semantic_profiles',
  'embedding_records',
  'product_daily_prices',
  'category_daily_aggregates',
  'ingest_runs',
  'pipeline_logs',
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
  const env = process.env;
  const projectId = requiredEnv('PRICER_FIRESTORE_PROJECT_ID');
  const databaseId = env.PRICER_FIRESTORE_DATABASE_ID || '(default)';
  const collectionPrefix = requiredEnv('PRICER_FIRESTORE_COLLECTION_PREFIX');
  const workingDirectory = env.PRICER_WORK_DIR || path.join(process.cwd(), 'tmp', 'phase6_live');
  const now = new Date().toISOString();

  const latest = await resolveLatestAvailableSnapshotDate({
    today: new Date(),
  });
  if (!latest) {
    throw new Error('No latest KolkoStruva snapshot was found in the lookback window.');
  }

  fs.mkdirSync(workingDirectory, { recursive: true });
  const zipFilePath = path.join(workingDirectory, `${latest.snapshot_date}.zip`);
  if (!fs.existsSync(zipFilePath)) {
    await downloadSnapshotZip({
      snapshotDate: latest.snapshot_date,
      outputDir: workingDirectory,
    });
  }

  const entries = await listSnapshotEntries({ zipFilePath });
  const store = new DirectMemoryStore();
  const ingest = await importDailySnapshotZip({
    store,
    zipFilePath,
    snapshotDate: latest.snapshot_date,
    sourceUrl: latest.url,
    ingestedAt: now,
    enableLlmEnrichment: env.ENABLE_LLM_ENRICHMENT === 'true',
    enrichmentApiKey: env.XAI_API_KEY || '',
  });
  const semantic = await runSemanticEnrichmentJob({ store, generatedAt: now });
  const embeddings = await backfillCanonicalEmbeddings({
    store,
    generatedAt: now,
    useRemote: Boolean(env.XAI_API_KEY),
  });
  const aggregation = await runDailyAggregation({
    store,
    date: latest.snapshot_date,
  });
  const state = await store.load();

  const app = getOrCreateFirebaseApp(projectId);
  const firestore = getFirestore(app, databaseId);
  const targetCollections = resolveTargetCollections(env.PRICER_PHASE6_PUBLISH_COLLECTIONS);
  const publish = {};

  for (const collectionName of targetCollections) {
    publish[collectionName] = await publishCollection({
      firestore,
      collectionPrefix,
      collectionName,
      records: state[collectionName] || [],
      skipExisting: env.PRICER_PHASE6_PUBLISH_SKIP_EXISTING !== 'false',
    });
  }

  process.stdout.write(`${JSON.stringify({
    backend: 'firestore',
    project_id: projectId,
    database_id: databaseId,
    collection_prefix: collectionPrefix,
    source: {
      snapshot_date: latest.snapshot_date,
      url: latest.url,
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
    semantic: {
      processed: semantic.processed,
    },
    embeddings: {
      processed: embeddings.processed,
      remote_calls: embeddings.remote_calls,
    },
    aggregation: {
      skipped: aggregation.skipped,
      product_rows: aggregation.product_rows || 0,
      category_rows: aggregation.category_rows || 0,
    },
    publish,
  }, null, 2)}\n`);
}

function getOrCreateFirebaseApp(projectId) {
  const appName = 'pricer-phase6-publisher';
  try {
    return admin.getApp(appName);
  } catch (_error) {
    return admin.initializeApp({
      credential: admin.applicationDefault(),
      projectId,
    }, appName);
  }
}

async function publishCollection({
  firestore,
  collectionPrefix,
  collectionName,
  records,
  skipExisting,
}) {
  const collectionId = resolveCollectionName(collectionPrefix, collectionName);
  const collectionRef = firestore.collection(collectionId);
  const existingIds = skipExisting ? await listExistingDocumentIds(collectionRef) : new Set();
  let written = 0;
  let skipped = 0;
  let batch = firestore.batch();
  let pending = 0;
  const commitBatch = async () => {
    if (pending === 0) {
      return;
    }
    await batch.commit();
    batch = firestore.batch();
    pending = 0;
  };

  for (const record of records) {
    const documentId = buildDocumentId(collectionName, record);
    if (existingIds.has(documentId)) {
      skipped += 1;
      continue;
    }

    batch.set(collectionRef.doc(documentId), sanitizeStoredRecord(record));
    written += 1;
    pending += 1;
    if (pending >= 400) {
      await commitBatch();
    }
  }

  await commitBatch();
  return {
    collection: collectionId,
    input_records: records.length,
    existing_records: existingIds.size,
    written_records: written,
    skipped_existing_records: skipped,
    failed_writes: 0,
  };
}

async function listExistingDocumentIds(collectionRef) {
  const snapshot = await collectionRef.select().get();
  return new Set(snapshot.docs.map((doc) => doc.id));
}

function resolveTargetCollections(raw) {
  if (!raw || !raw.trim()) {
    return DEFAULT_TARGET_COLLECTIONS;
  }

  const requested = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const valid = new Set(DEFAULT_TARGET_COLLECTIONS);
  requested.forEach((collectionName) => {
    if (!valid.has(collectionName)) {
      throw new Error(`Unsupported publish collection "${collectionName}".`);
    }
  });
  return requested;
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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
