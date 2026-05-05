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
  buildCurrentOfferReadModel,
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
  'current_product_offers',
  'canonical_current_offer_summary',
  'category_daily_aggregates',
  'ingest_runs',
  'pipeline_logs',
]);

const DEFAULT_PROGRESS_EVERY = 10000;
const PROGRESS_LOG_DIR = path.join(process.cwd(), 'tmp', 'phase6_publish_logs');

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
  const startedAt = new Date().toISOString();
  const progressEvery = resolveProgressEvery(env.PRICER_PHASE6_PUBLISH_PROGRESS_EVERY);
  const progress = createProgressReporter({
    runId: buildRunId(startedAt),
    filePath: resolveProgressFilePath(startedAt),
    logger: (line) => console.error(line),
    initialState: createProgressState({
      runId: buildRunId(startedAt),
      startedAt,
      currentPhase: 'starting',
      dryRun: env.PRICER_PHASE6_PUBLISH_DRY_RUN === 'true',
      skipExisting: env.PRICER_PHASE6_PUBLISH_SKIP_EXISTING !== 'false',
      collectionPrefix: env.PRICER_FIRESTORE_COLLECTION_PREFIX || null,
      selectedCollections: [],
      lastMessage: 'Publisher starting.',
    }),
  });

  try {
    const config = await runPhase({
      progress,
      phase: 'env_config_validation',
      label: 'env/config validation',
      fn: async () => {
        const projectId = requiredEnv('PRICER_FIRESTORE_PROJECT_ID');
        const databaseId = env.PRICER_FIRESTORE_DATABASE_ID || '(default)';
        const collectionPrefix = requiredEnv('PRICER_FIRESTORE_COLLECTION_PREFIX');
        const targetCollections = resolveTargetCollections(env.PRICER_PHASE6_PUBLISH_COLLECTIONS);
        const workingDirectory = env.PRICER_WORK_DIR || path.join(process.cwd(), 'tmp', 'phase6_live');
        const dryRun = env.PRICER_PHASE6_PUBLISH_DRY_RUN === 'true';
        const skipExisting = env.PRICER_PHASE6_PUBLISH_SKIP_EXISTING !== 'false';

        progress.update({
          selected_collections: targetCollections,
          dry_run: dryRun,
          skip_existing: skipExisting,
          collection_prefix: collectionPrefix,
        }, 'Environment and publish configuration validated.');

        return {
          projectId,
          databaseId,
          collectionPrefix,
          targetCollections,
          workingDirectory,
          dryRun,
          skipExisting,
        };
      },
    });

    const latest = await runPhase({
      progress,
      phase: 'snapshot_resolution',
      label: 'latest snapshot resolution',
      fn: async () => {
        const resolved = await resolveLatestAvailableSnapshotDate({
          today: new Date(),
        });
        if (!resolved) {
          throw new Error('No latest KolkoStruva snapshot was found in the lookback window.');
        }
        progress.update({
          snapshot_date: resolved.snapshot_date,
        }, `Latest snapshot resolved: ${resolved.snapshot_date}.`);
        return resolved;
      },
      summarize: (resolved) => ({
        snapshot_date: resolved.snapshot_date,
        url: resolved.url,
      }),
    });

    logSafeRuntimeConfig({
      progress,
      projectId: config.projectId,
      databaseId: config.databaseId,
      collectionPrefix: config.collectionPrefix,
      latest,
      targetCollections: config.targetCollections,
      dryRun: config.dryRun,
      skipExisting: config.skipExisting,
      progressEvery,
    });

    const snapshotFiles = await runPhase({
      progress,
      phase: 'snapshot_download_cache_check',
      label: 'snapshot download/cache check',
      fn: async () => {
        fs.mkdirSync(config.workingDirectory, { recursive: true });
        const zipFilePath = path.join(config.workingDirectory, `${latest.snapshot_date}.zip`);
        const wasCached = fs.existsSync(zipFilePath);
        if (!wasCached) {
          await downloadSnapshotZip({
            snapshotDate: latest.snapshot_date,
            outputDir: config.workingDirectory,
          });
        }
        const entries = await listSnapshotEntries({ zipFilePath });
        return {
          zipFilePath,
          zipBytes: fs.statSync(zipFilePath).size,
          entries,
          wasCached,
        };
      },
      summarize: (result) => ({
        cached: result.wasCached,
        zip_file_path: result.zipFilePath,
        zip_bytes: result.zipBytes,
        entry_count: result.entries.length,
      }),
    });

    const now = new Date().toISOString();
    const store = new DirectMemoryStore();
    const ingest = await runPhase({
      progress,
      phase: 'import_canonicalization',
      label: 'import/canonicalization',
      fn: () => importDailySnapshotZip({
        store,
        zipFilePath: snapshotFiles.zipFilePath,
        snapshotDate: latest.snapshot_date,
        sourceUrl: latest.url,
        ingestedAt: now,
        enableLlmEnrichment: env.ENABLE_LLM_ENRICHMENT === 'true',
        enrichmentApiKey: env.XAI_API_KEY || '',
      }),
      summarize: (result) => ({
        imported_rows: result.imported_rows,
        unique_rows: result.unique_rows,
        duplicate_rows: result.duplicate_rows,
        malformed_rows: result.malformed_rows,
        canonical_product_count: result.canonical_product_count,
      }),
    });

    const semantic = await runPhase({
      progress,
      phase: 'semantic_enrichment',
      label: 'semantic enrichment',
      fn: () => runSemanticEnrichmentJob({ store, generatedAt: now }),
      summarize: (result) => ({ processed: result.processed }),
    });

    const embeddings = await runPhase({
      progress,
      phase: 'embeddings',
      label: 'embeddings',
      fn: () => backfillCanonicalEmbeddings({
        store,
        generatedAt: now,
        useRemote: Boolean(env.XAI_API_KEY),
      }),
      summarize: (result) => ({
        processed: result.processed,
        remote_calls: result.remote_calls,
      }),
    });

    const aggregation = await runPhase({
      progress,
      phase: 'daily_aggregation',
      label: 'daily aggregation',
      fn: () => runDailyAggregation({
        store,
        date: latest.snapshot_date,
      }),
      summarize: (result) => ({
        skipped: result.skipped,
        product_rows: result.product_rows || 0,
        category_rows: result.category_rows || 0,
      }),
    });

    const state = await store.load();
    await runPhase({
      progress,
      phase: 'current_offer_read_model_build',
      label: 'current offer read model build',
      fn: async () => {
        const currentOfferReadModel = buildCurrentOfferReadModel({
          state,
          generatedAt: now,
        });
        state.current_product_offers = currentOfferReadModel.current_product_offers;
        state.canonical_current_offer_summary = currentOfferReadModel.canonical_current_offer_summary;
        return currentOfferReadModel;
      },
      summarize: (result) => ({
        current_product_offer_count: result.current_product_offers.length,
        canonical_current_offer_summary_count: result.canonical_current_offer_summary.length,
      }),
    });

    const app = getOrCreateFirebaseApp(config.projectId);
    const firestore = getFirestore(app, config.databaseId);
    const publish = {};

    for (const collectionName of config.targetCollections) {
      publish[collectionName] = await publishCollection({
        firestore,
        collectionPrefix: config.collectionPrefix,
        collectionName,
        records: state[collectionName] || [],
        skipExisting: config.skipExisting,
        dryRun: config.dryRun,
        progress,
        progressEvery,
      });
    }

    const summary = {
      backend: 'firestore',
      project_id: config.projectId,
      database_id: config.databaseId,
      collection_prefix: config.collectionPrefix,
      source: {
        snapshot_date: latest.snapshot_date,
        url: latest.url,
        zip_file_path: snapshotFiles.zipFilePath,
        zip_bytes: snapshotFiles.zipBytes,
        entry_count: snapshotFiles.entries.length,
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
      current_offer_read_model: {
        current_product_offer_count: state.current_product_offers.length,
        canonical_current_offer_summary_count: state.canonical_current_offer_summary.length,
      },
      dry_run: config.dryRun,
      publish,
    };

    progress.log('START final summary.');
    progress.update({
      current_phase: 'final_summary',
      current_collection: null,
      records_total: 0,
      records_written: 0,
      records_skipped: 0,
      failed_writes: 0,
    }, 'Preparing final summary.');
    progress.log('END final summary.', {
      dry_run: config.dryRun,
      selected_collections: config.targetCollections,
    });
    progress.finish('succeeded', 'Publisher finished successfully.');
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    progress.fail(error);
    throw error;
  }
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
  dryRun,
  progress = null,
  progressEvery = DEFAULT_PROGRESS_EVERY,
}) {
  const startedAt = Date.now();
  const collectionId = resolveCollectionName(collectionPrefix, collectionName);
  const collectionRef = firestore.collection(collectionId);
  if (progress) {
    progress.log(`START publish ${collectionName}.`, {
      collection: collectionId,
      input_records: records.length,
      dry_run: dryRun,
      skip_existing: skipExisting,
    });
    progress.update({
      current_phase: 'publish_collection',
      current_collection: collectionName,
      records_total: records.length,
      records_written: 0,
      records_skipped: 0,
      failed_writes: 0,
    }, `Publishing ${collectionName}.`);
  }
  const existingIds = skipExisting ? await listExistingDocumentIds(collectionRef) : new Set();
  if (progress) {
    progress.log(`Existing document scan complete for ${collectionName}.`, {
      collection: collectionId,
      existing_records: existingIds.size,
    });
    progress.update({
      current_phase: 'publish_collection',
      current_collection: collectionName,
      records_total: records.length,
      records_written: 0,
      records_skipped: 0,
      failed_writes: 0,
    }, `Existing document scan complete for ${collectionName}.`);
  }
  let written = 0;
  let skipped = 0;
  let processed = 0;
  let failedWrites = 0;
  let batch = firestore.batch();
  let pending = 0;
  const commitBatch = async () => {
    if (pending === 0) {
      return;
    }
    const committing = pending;
    try {
      await batch.commit();
    } catch (error) {
      failedWrites += committing;
      if (progress) {
        progress.update({
          current_phase: 'publish_collection',
          current_collection: collectionName,
          records_total: records.length,
          records_written: written,
          records_skipped: skipped,
          failed_writes: failedWrites,
        }, `Batch commit failed for ${collectionName}.`);
      }
      throw error;
    }
    batch = firestore.batch();
    pending = 0;
    if (progress) {
      progress.update({
        current_phase: 'publish_collection',
        current_collection: collectionName,
        records_total: records.length,
        records_written: written,
        records_skipped: skipped,
        failed_writes: failedWrites,
      }, `Committed ${committing} pending writes for ${collectionName}.`);
    }
  };

  for (const record of records) {
    processed += 1;
    const documentId = buildDocumentId(collectionName, record);
    if (existingIds.has(documentId)) {
      skipped += 1;
      if (progress && shouldReportProgress({ processed, written, progressEvery })) {
        reportPublishProgress({
          progress,
          collectionName,
          collectionId,
          records,
          existingIds,
          written,
          skipped,
          processed,
          failedWrites,
          dryRun,
          skipExisting,
          startedAt,
        });
      }
      continue;
    }

    if (dryRun) {
      written += 1;
      if (progress && shouldReportProgress({ processed, written, progressEvery })) {
        reportPublishProgress({
          progress,
          collectionName,
          collectionId,
          records,
          existingIds,
          written,
          skipped,
          processed,
          failedWrites,
          dryRun,
          skipExisting,
          startedAt,
        });
      }
      continue;
    }
    batch.set(collectionRef.doc(documentId), sanitizeStoredRecord(record));
    written += 1;
    pending += 1;
    if (pending >= 400) {
      await commitBatch();
    }
    if (progress && shouldReportProgress({ processed, written, progressEvery })) {
      reportPublishProgress({
        progress,
        collectionName,
        collectionId,
        records,
        existingIds,
        written,
        skipped,
        processed,
        failedWrites,
        dryRun,
        skipExisting,
        startedAt,
      });
    }
  }

  if (!dryRun) {
    await commitBatch();
  }
  if (progress) {
    reportPublishProgress({
      progress,
      collectionName,
      collectionId,
      records,
      existingIds,
      written,
      skipped,
      processed,
      failedWrites,
      dryRun,
      skipExisting,
      startedAt,
      force: true,
    });
    progress.log(`END publish ${collectionName}.`, {
      collection: collectionId,
      input_records: records.length,
      existing_records: existingIds.size,
      written_records: written,
      skipped_existing_records: skipped,
      failed_writes: failedWrites,
      elapsed_ms: Date.now() - startedAt,
    });
  }
  return {
    collection: collectionId,
    input_records: records.length,
    existing_records: existingIds.size,
    written_records: written,
    skipped_existing_records: skipped,
    dry_run: dryRun,
    failed_writes: failedWrites,
  };
}

async function listExistingDocumentIds(collectionRef) {
  const snapshot = await collectionRef.select().get();
  return new Set(snapshot.docs.map((doc) => doc.id));
}

function resolveProgressEvery(raw) {
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROGRESS_EVERY;
}

function buildRunId(startedAt) {
  return `phase6_latest_${startedAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', 'Z')}`;
}

function resolveProgressFilePath(startedAt) {
  return path.join(PROGRESS_LOG_DIR, `${buildRunId(startedAt)}.json`);
}

function createProgressState({
  runId,
  startedAt,
  snapshotDate = null,
  currentPhase = 'starting',
  currentCollection = null,
  selectedCollections = [],
  dryRun = false,
  skipExisting = true,
  collectionPrefix = null,
  recordsTotal = 0,
  recordsWritten = 0,
  recordsSkipped = 0,
  failedWrites = 0,
  lastMessage = '',
  status = 'running',
  finishedAt = null,
  error = null,
}) {
  const updatedAt = startedAt;
  return {
    run_id: runId,
    started_at: startedAt,
    updated_at: updatedAt,
    snapshot_date: snapshotDate,
    current_phase: currentPhase,
    current_collection: currentCollection,
    selected_collections: selectedCollections,
    dry_run: dryRun,
    skip_existing: skipExisting,
    collection_prefix: collectionPrefix,
    records_total: recordsTotal,
    records_written: recordsWritten,
    records_skipped: recordsSkipped,
    failed_writes: failedWrites,
    last_message: lastMessage,
    finished_at: finishedAt,
    status,
    error,
  };
}

function createProgressReporter({
  runId,
  filePath,
  initialState,
  logger,
  now = () => new Date(),
}) {
  const state = {
    ...initialState,
    run_id: runId,
  };

  const reporter = {
    filePath,
    state,
    log(message, details = {}) {
      const suffix = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : '';
      logger(`[${now().toISOString()}] [phase6-publish] ${message}${suffix}`);
    },
    update(patch = {}, message = '') {
      Object.assign(state, patch, {
        updated_at: now().toISOString(),
      });
      if (message) {
        state.last_message = message;
      }
      writeProgressState(filePath, state);
    },
    finish(status, message) {
      const finishedAt = now().toISOString();
      Object.assign(state, {
        status,
        finished_at: finishedAt,
        updated_at: finishedAt,
        last_message: message,
      });
      writeProgressState(filePath, state);
      this.log(message, { status, progress_file: filePath });
    },
    fail(error) {
      const finishedAt = now().toISOString();
      Object.assign(state, {
        status: 'failed',
        finished_at: finishedAt,
        updated_at: finishedAt,
        last_message: `Publisher failed: ${error.message}`,
        error: {
          message: error.message,
          stack: error.stack || '',
        },
      });
      writeProgressState(filePath, state);
      this.log('Publisher failed.', {
        error: error.message,
        progress_file: filePath,
      });
    },
  };

  reporter.log('Progress heartbeat initialized.', { progress_file: filePath });
  reporter.update({}, state.last_message || 'Publisher starting.');
  return reporter;
}

function writeProgressState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function runPhase({
  progress,
  phase,
  label,
  fn,
  summarize = () => ({}),
}) {
  const startedAt = Date.now();
  progress.log(`START ${label}.`);
  progress.update({
    current_phase: phase,
    current_collection: null,
    records_total: 0,
    records_written: 0,
    records_skipped: 0,
    failed_writes: 0,
  }, `Starting ${label}.`);

  try {
    const result = await fn();
    const summary = summarize(result);
    progress.log(`END ${label}.`, {
      elapsed_ms: Date.now() - startedAt,
      ...summary,
    });
    progress.update({
      current_phase: phase,
      current_collection: null,
      records_total: 0,
      records_written: 0,
      records_skipped: 0,
      failed_writes: 0,
      ...progressPatchFromSummary(summary),
    }, `Finished ${label}.`);
    return result;
  } catch (error) {
    progress.update({
      current_phase: phase,
      current_collection: null,
    }, `Failed during ${label}: ${error.message}`);
    throw error;
  }
}

function progressPatchFromSummary(summary) {
  const patch = {};
  if (summary.snapshot_date) {
    patch.snapshot_date = summary.snapshot_date;
  }
  return patch;
}

function logSafeRuntimeConfig({
  progress,
  projectId,
  databaseId,
  collectionPrefix,
  latest,
  targetCollections,
  dryRun,
  skipExisting,
  progressEvery,
}) {
  progress.log('Runtime config.', {
    backend: 'firestore',
    project_id: projectId,
    database_id: databaseId,
    collection_prefix: collectionPrefix,
    snapshot_date: latest.snapshot_date,
    source_url: latest.url,
    selected_collections: targetCollections,
    dry_run: dryRun,
    skip_existing: skipExisting,
    progress_every: progressEvery,
  });
  progress.update({
    snapshot_date: latest.snapshot_date,
    selected_collections: targetCollections,
    dry_run: dryRun,
    skip_existing: skipExisting,
    collection_prefix: collectionPrefix,
  }, 'Safe runtime config logged.');
}

function shouldReportProgress({ processed, progressEvery }) {
  return processed > 0 && processed % progressEvery === 0;
}

function reportPublishProgress({
  progress,
  collectionName,
  collectionId,
  records,
  existingIds,
  written,
  skipped,
  processed,
  failedWrites,
  dryRun,
  skipExisting,
  startedAt,
  force = false,
}) {
  const elapsedMs = Math.max(Date.now() - startedAt, 1);
  const percentComplete = records.length === 0
    ? 100
    : Number(((processed / records.length) * 100).toFixed(2));
  const writesPerSecond = Number((written / (elapsedMs / 1000)).toFixed(2));
  const message = force
    ? `Publish progress final for ${collectionName}.`
    : `Publish progress for ${collectionName}.`;
  const progressPayload = {
    collection: collectionId,
    input_records: records.length,
    existing_records: existingIds.size,
    dry_run: dryRun,
    skip_existing: skipExisting,
    processed_records: processed,
    records_skipped: skipped,
    records_written: written,
    records_to_write_discovered: written,
    records_to_write_total: force ? written : null,
    failed_writes: failedWrites,
    percent_complete: percentComplete,
    elapsed_ms: elapsedMs,
    writes_per_second: writesPerSecond,
  };

  progress.log(message, progressPayload);
  progress.update({
    current_phase: 'publish_collection',
    current_collection: collectionName,
    records_total: records.length,
    records_written: written,
    records_skipped: skipped,
    failed_writes: failedWrites,
  }, `${message} ${processed}/${records.length} processed.`);
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

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_PROGRESS_EVERY,
  buildRunId,
  createProgressReporter,
  createProgressState,
  publishCollection,
  resolveProgressEvery,
  resolveProgressFilePath,
  resolveTargetCollections,
  sanitizeStoredRecord,
  writeProgressState,
};
