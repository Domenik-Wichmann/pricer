const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');

const admin = require('firebase-admin/app');
const { FieldPath, getFirestore } = require('firebase-admin/firestore');

const {
  buildCompactCurrentOfferBaselineRecord,
  buildCurrentOfferFingerprint,
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
  backfillFirestore = false,
  backfillDryRun = true,
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
  const writer = createJsonlWriter(outputPath);
  const startedAt = Date.now();
  let processed = 0;
  let exported = 0;
  let backfillWrites = 0;
  let failedBackfillWrites = 0;
  let lastDoc = null;
  let batch = db.batch();
  let pendingWrites = 0;

  logger(`[phase6-baseline] START export from ${currentOffersCollection} to ${path.resolve(outputPath)}.`);
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
      }

      const snapshot = await query.get();
      if (snapshot.empty) {
        break;
      }

      for (const doc of snapshot.docs) {
        const offer = doc.data();
        const baselineRecord = buildCompactCurrentOfferBaselineRecord(offer, {
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

function createJsonlWriter(outputPath) {
  const resolvedPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const stream = fs.createWriteStream(resolvedPath, { encoding: 'utf8' });
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

function resolveBaselineOptions(env = process.env) {
  return {
    projectId: requiredEnv(env, 'PRICER_FIRESTORE_PROJECT_ID'),
    databaseId: env.PRICER_FIRESTORE_DATABASE_ID || '(default)',
    collectionPrefix: requiredEnv(env, 'PRICER_FIRESTORE_COLLECTION_PREFIX'),
    outputPath: requiredEnv(env, 'PRICER_INCREMENTAL_BASELINE_OUTPUT_PATH'),
    limit: normalizeOptionalPositiveInteger(env.PRICER_INCREMENTAL_BASELINE_LIMIT, 'PRICER_INCREMENTAL_BASELINE_LIMIT'),
    progressEvery: normalizeOptionalPositiveInteger(env.PRICER_INCREMENTAL_PROGRESS_EVERY, 'PRICER_INCREMENTAL_PROGRESS_EVERY') || DEFAULT_PROGRESS_EVERY,
    batchSize: normalizeOptionalPositiveInteger(env.PRICER_INCREMENTAL_BASELINE_BATCH_SIZE, 'PRICER_INCREMENTAL_BASELINE_BATCH_SIZE') || DEFAULT_BATCH_SIZE,
    backfillFirestore: env.PRICER_INCREMENTAL_BASELINE_BACKFILL_FIRESTORE === 'true',
    backfillDryRun: env.PRICER_INCREMENTAL_BASELINE_BACKFILL_DRY_RUN !== 'false',
  };
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
  resolveBaselineOptions,
};
