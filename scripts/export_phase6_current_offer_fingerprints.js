const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');

const admin = require('firebase-admin/app');
const { FieldPath, getFirestore } = require('firebase-admin/firestore');

const {
  buildCompactCurrentOfferBaselineRecord,
  buildCurrentOfferFingerprint,
  buildRichCurrentOfferBaselineRecord,
  resolveCollectionName,
} = require('../app/functions/src');

const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_PROGRESS_EVERY = 10000;

async function main() {
  const result = await runCurrentOfferFingerprintBaselineFromEnv(process.env);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function runCurrentOfferFingerprintBaselineFromEnv(env = process.env) {
  return exportCurrentOfferFingerprintBaseline(resolveBaselineOptions(env));
}

async function exportCurrentOfferFingerprintBaseline({
  projectId,
  databaseId = '(default)',
  collectionPrefix,
  outputPath,
  limit = null,
  progressEvery = DEFAULT_PROGRESS_EVERY,
  batchSize = DEFAULT_BATCH_SIZE,
  startAfterDocumentId = null,
  appendOutput = false,
  backfillFirestore = false,
  backfillDryRun = true,
  baselineMode = 'compact',
  now = new Date().toISOString(),
  firestore = null,
  logger = (line) => console.error(line),
} = {}) {
  if (!projectId) {
    throw new Error('projectId is required.');
  }
  if (!collectionPrefix) {
    throw new Error('collectionPrefix is required.');
  }
  if (!outputPath) {
    throw new Error('outputPath is required.');
  }

  const db = firestore || getFirestore(getOrCreateFirebaseApp(projectId), databaseId);
  const currentOffersCollection = resolveCollectionName(collectionPrefix, 'current_product_offers');
  const fingerprintsCollection = resolveCollectionName(collectionPrefix, 'current_offer_fingerprints');
  const normalizedBaselineMode = normalizeBaselineMode(baselineMode);
  const writer = createJsonlWriter(outputPath, { append: appendOutput });
  const startedAt = Date.now();
  let processed = 0;
  let exported = 0;
  let backfillWrites = 0;
  let failedBackfillWrites = 0;
  let lastDoc = null;
  let lastDocumentId = startAfterDocumentId || null;
  let batch = db.batch();
  let pendingWrites = 0;

  logger(`[phase6-baseline] START export mode=${normalizedBaselineMode} from ${currentOffersCollection} to ${path.resolve(outputPath)} append=${appendOutput} start_after=${lastDocumentId || 'none'}.`);
  if (backfillFirestore) {
    logger(`[phase6-baseline] Backfill mode enabled for ${fingerprintsCollection}; dry_run=${backfillDryRun}.`);
  }

  async function commitBackfillBatch() {
    if (!backfillFirestore || backfillDryRun || pendingWrites === 0) {
      pendingWrites = 0;
      batch = db.batch();
      return;
    }
    const committing = pendingWrites;
    try {
      await batch.commit();
      backfillWrites += committing;
    } catch (error) {
      failedBackfillWrites += committing;
      throw error;
    } finally {
      pendingWrites = 0;
      batch = db.batch();
    }
  }

  try {
    while (true) {
      const remaining = Number.isInteger(limit) && limit > 0 ? limit - processed : null;
      if (remaining !== null && remaining <= 0) {
        break;
      }
      const pageSize = remaining === null ? batchSize : Math.min(batchSize, remaining);
      let query = db
        .collection(currentOffersCollection)
        .orderBy(FieldPath.documentId())
        .limit(pageSize);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      } else if (lastDocumentId) {
        query = query.startAfter(lastDocumentId);
      }

      const snapshot = await query.get();
      if (snapshot.empty) {
        break;
      }

      for (const doc of snapshot.docs) {
        const offer = doc.data();
        const baselineRecordBuilder = normalizedBaselineMode === 'rich'
          ? buildRichCurrentOfferBaselineRecord
          : buildCompactCurrentOfferBaselineRecord;
        const baselineRecord = baselineRecordBuilder(offer, {
          generatedAt: now,
          firstSeenSnapshotDate: offer.first_seen_snapshot_date || offer.snapshot_date || null,
          lastSeenSnapshotDate: offer.last_seen_snapshot_date || offer.snapshot_date || null,
        });
        await writer.write(baselineRecord);
        exported += 1;
        processed += 1;

        if (backfillFirestore) {
          const fingerprintRecord = buildCurrentOfferFingerprint(offer, {
            generatedAt: now,
            firstSeenSnapshotDate: baselineRecord.first_seen_snapshot_date,
            lastSeenSnapshotDate: baselineRecord.last_seen_snapshot_date,
          });
          if (backfillDryRun) {
            backfillWrites += 1;
          } else {
            batch.set(db.collection(fingerprintsCollection).doc(fingerprintRecord.source_product_id), sanitizeStoredRecord(fingerprintRecord));
            pendingWrites += 1;
            if (pendingWrites >= 400) {
              await commitBackfillBatch();
            }
          }
        }

        if (processed % progressEvery === 0) {
          logger(`[phase6-baseline] progress processed=${processed} exported=${exported} backfill_writes=${backfillWrites} elapsed_ms=${Date.now() - startedAt}`);
        }
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      lastDocumentId = lastDoc.id;
      if (snapshot.docs.length < pageSize) {
        break;
      }
    }

    await commitBackfillBatch();
  } finally {
    await writer.close();
  }

  const summary = {
    command: backfillFirestore ? 'phase6:backfill-current-offer-fingerprints' : 'phase6:export-current-offer-fingerprints',
    backend: 'firestore',
    project_id: projectId,
    database_id: databaseId,
    collection_prefix: collectionPrefix,
    source_collection: currentOffersCollection,
    fingerprint_collection: fingerprintsCollection,
    output_path: path.resolve(outputPath),
    output_format: 'jsonl',
    baseline_mode: normalizedBaselineMode,
    append_output: appendOutput,
    start_after_document_id: startAfterDocumentId || null,
    last_document_id: lastDocumentId,
    limit,
    processed_current_product_offers: processed,
    exported_fingerprints: exported,
    firestore_writes_enabled: backfillFirestore && !backfillDryRun,
    backfill_dry_run: backfillFirestore ? backfillDryRun : null,
    backfill_records_to_write: backfillFirestore ? backfillWrites : 0,
    backfill_failed_writes: failedBackfillWrites,
    destructive_deletes: false,
    elapsed_ms: Date.now() - startedAt,
  };
  logger(`[phase6-baseline] END ${JSON.stringify(summary)}`);
  return summary;
}

function createJsonlWriter(outputPath, { append = false } = {}) {
  const resolvedPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  if (append && fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).size > 0 && !fileEndsWithNewline(resolvedPath)) {
    fs.appendFileSync(resolvedPath, '\n', 'utf8');
  }
  const stream = fs.createWriteStream(resolvedPath, { encoding: 'utf8', flags: append ? 'a' : 'w' });
  return {
    async write(row) {
      if (!stream.write(`${JSON.stringify(row)}\n`)) {
        await once(stream, 'drain');
      }
    },
    async close() {
      stream.end();
      await once(stream, 'finish');
    },
  };
}

function fileEndsWithNewline(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size === 0) {
      return true;
    }
    const buffer = Buffer.alloc(1);
    fs.readSync(fd, buffer, 0, 1, size - 1);
    return buffer[0] === 0x0a;
  } finally {
    fs.closeSync(fd);
  }
}

function resolveBaselineOptions(env = process.env) {
  return {
    projectId: requiredEnv(env, 'PRICER_FIRESTORE_PROJECT_ID'),
    databaseId: env.PRICER_FIRESTORE_DATABASE_ID || '(default)',
    collectionPrefix: requiredEnv(env, 'PRICER_FIRESTORE_COLLECTION_PREFIX'),
    outputPath: requiredEnv(env, 'PRICER_INCREMENTAL_BASELINE_OUTPUT_PATH'),
    limit: normalizeOptionalPositiveInteger(env.PRICER_INCREMENTAL_BASELINE_LIMIT, 'PRICER_INCREMENTAL_BASELINE_LIMIT'),
    progressEvery: normalizeOptionalPositiveInteger(env.PRICER_INCREMENTAL_PROGRESS_EVERY, 'PRICER_INCREMENTAL_PROGRESS_EVERY') || DEFAULT_PROGRESS_EVERY,
    batchSize: normalizeOptionalPositiveInteger(env.PRICER_INCREMENTAL_BASELINE_BATCH_SIZE, 'PRICER_INCREMENTAL_BASELINE_BATCH_SIZE') || DEFAULT_BATCH_SIZE,
    startAfterDocumentId: optionalEnv(env, 'PRICER_INCREMENTAL_BASELINE_START_AFTER_DOCUMENT_ID') ||
      optionalEnv(env, 'PRICER_INCREMENTAL_BASELINE_START_AFTER_SOURCE_PRODUCT_ID') ||
      null,
    appendOutput: env.PRICER_INCREMENTAL_BASELINE_APPEND === 'true',
    backfillFirestore: env.PRICER_INCREMENTAL_BASELINE_BACKFILL_FIRESTORE === 'true',
    backfillDryRun: env.PRICER_INCREMENTAL_BASELINE_BACKFILL_DRY_RUN !== 'false',
    baselineMode: env.PRICER_INCREMENTAL_BASELINE_MODE || 'compact',
  };
}

function normalizeBaselineMode(value) {
  const normalized = String(value || 'compact').trim().toLowerCase();
  if (!['compact', 'rich'].includes(normalized)) {
    throw new Error('PRICER_INCREMENTAL_BASELINE_MODE must be compact or rich.');
  }
  return normalized;
}

function getOrCreateFirebaseApp(projectId) {
  const appName = 'pricer-phase6-current-offer-fingerprint-baseline';
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

function normalizeOptionalPositiveInteger(value, name) {
  if (!value || !String(value).trim()) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer when set.`);
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
  exportCurrentOfferFingerprintBaseline,
  normalizeBaselineMode,
  resolveBaselineOptions,
};
