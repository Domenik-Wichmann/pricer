const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const admin = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const {
  buildCurrentOfferFingerprints,
  buildCurrentOfferReadModel,
  buildSnapshotManifest,
  buildSnapshotZipUrl,
  createEmptyDataBackbone,
  diffCurrentOffers,
  importDailySnapshotZip,
  listSnapshotEntries,
  resolveCollectionName,
} = require('../app/functions/src');

const DEFAULT_PROGRESS_EVERY = 10000;

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
  const result = await runIncrementalSnapshotDiffFromEnv(process.env);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function runIncrementalSnapshotDiffFromEnv(env = process.env) {
  const options = resolveIncrementalDiffOptions(env);
  const zipFilePath = await resolveSnapshotZipFile(options);
  return runIncrementalSnapshotDiff({
    ...options,
    zipFilePath,
  });
}

async function runIncrementalSnapshotDiff({
  snapshotDate,
  snapshotUrl = null,
  zipFilePath,
  projectId,
  databaseId = '(default)',
  collectionPrefix,
  incrementalLimit = null,
  progressEvery = DEFAULT_PROGRESS_EVERY,
  baselinePath = null,
  allowFirestoreDirectCompare = false,
  dryRun = true,
  now = new Date().toISOString(),
} = {}) {
  if (dryRun !== true) {
    throw new Error('Real incremental updates are deferred; this command currently supports dry-run only.');
  }
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
  const state = await store.load();
  const readModel = buildCurrentOfferReadModel({
    state,
    generatedAt: now,
  });
  const allNextOffers = readModel.current_product_offers;
  const selectedNextOffers = Number.isInteger(incrementalLimit) && incrementalLimit > 0
    ? allNextOffers.slice(0, incrementalLimit)
    : allNextOffers;

  const comparison = await loadExistingComparisonFingerprints({
    baselinePath,
    projectId,
    databaseId,
    collectionPrefix,
    sourceProductIds: selectedNextOffers.map((offer) => offer.source_product_id),
    allNextOfferCount: allNextOffers.length,
    allowFirestoreDirectCompare,
    incrementalLimit,
  });

  const diff = comparison.can_compare
    ? diffCurrentOffers({
      nextOffers: selectedNextOffers,
      existingFingerprints: comparison.existing_fingerprints,
      generatedAt: now,
    })
    : null;
  const manifest = diff
    ? buildSnapshotManifest({
      snapshotDate,
      snapshotUrl,
      collectionPrefix,
      source: ingest,
      diff,
      generatedAt: now,
      mode: 'daily_incremental_dry_run',
      comparisonMode: comparison.mode,
    })
    : null;

  const estimatedFirestoreReads = comparison.can_compare
    ? comparison.estimated_reads
    : {
      direct_compare_required_reads: allNextOffers.length,
      reason: 'A full direct Firestore comparison would read one existing fingerprint/current-offer row per incoming offer. Provide PRICER_INCREMENTAL_BASELINE_PATH, set PRICER_INCREMENTAL_LIMIT for a sample, or explicitly set PRICER_INCREMENTAL_ALLOW_FIRESTORE_DIRECT_COMPARE=true.',
    };

  return {
    command: 'phase6:diff-snapshot',
    backend: 'firestore',
    project_id: projectId,
    database_id: databaseId,
    collection_prefix: collectionPrefix,
    dry_run: true,
    destructive_deletes: false,
    writes_performed: 0,
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
    },
    current_offer_build: {
      total_current_product_offers: allNextOffers.length,
      selected_current_product_offers: selectedNextOffers.length,
      canonical_current_offer_summary_count: readModel.canonical_current_offer_summary.length,
      limit: incrementalLimit,
    },
    comparison,
    scanned_rows: ingest.imported_rows,
    new_offers: diff?.counts.new ?? null,
    changed_offers: diff
      ? diff.counts.price_changed + diff.counts.promo_changed + diff.counts.metadata_changed
      : null,
    unchanged_offers: diff?.counts.unchanged ?? null,
    removed_missing_offers: diff?.counts.missing_removed ?? null,
    affected_canonical_summaries: diff?.summaries_to_update ?? null,
    estimated_firestore_reads: estimatedFirestoreReads,
    estimated_firestore_writes: diff?.estimated_writes ?? {
      unknown_until_baseline_compare: true,
      writes_performed: 0,
    },
    target_collections: [
      resolveCollectionName(collectionPrefix, 'current_product_offers'),
      resolveCollectionName(collectionPrefix, 'current_offer_fingerprints'),
      resolveCollectionName(collectionPrefix, 'canonical_current_offer_summary'),
      resolveCollectionName(collectionPrefix, 'offer_change_events'),
      resolveCollectionName(collectionPrefix, 'snapshot_manifests'),
    ],
    manifest,
    progress_every: progressEvery,
    limitations: diff ? [] : [
      'No full direct Firestore diff was run because it would require one read per incoming offer at production scale.',
      'Backfill/export current_offer_fingerprints and pass PRICER_INCREMENTAL_BASELINE_PATH for a cheap complete dry-run.',
    ],
  };
}

async function loadExistingComparisonFingerprints({
  baselinePath,
  projectId,
  databaseId,
  collectionPrefix,
  sourceProductIds,
  allNextOfferCount,
  allowFirestoreDirectCompare,
  incrementalLimit,
}) {
  if (baselinePath) {
    const existingFingerprints = loadExistingFingerprintsFromJson(baselinePath);
    return {
      mode: 'local_baseline_file',
      can_compare: true,
      existing_fingerprints: existingFingerprints,
      existing_fingerprint_count: existingFingerprints.length,
      estimated_reads: {
        firestore: 0,
        local_baseline_rows: existingFingerprints.length,
      },
    };
  }

  if (!allowFirestoreDirectCompare && !incrementalLimit && allNextOfferCount > 100000) {
    return {
      mode: 'manifest_required',
      can_compare: false,
      existing_fingerprints: [],
      existing_fingerprint_count: null,
      estimated_reads: {
        direct_compare_required_reads: allNextOfferCount,
      },
    };
  }

  const firestore = getFirestore(getOrCreateFirebaseApp(projectId), databaseId);
  const existingFingerprints = await loadExistingFingerprintsFromFirestore({
    firestore,
    collectionPrefix,
    sourceProductIds,
  });
  return {
    mode: incrementalLimit ? 'firestore_direct_sample' : 'firestore_direct_full',
    can_compare: true,
    existing_fingerprints: existingFingerprints,
    existing_fingerprint_count: existingFingerprints.length,
    estimated_reads: {
      firestore: sourceProductIds.length,
      note: 'Direct compare reads one existing row per selected incoming source_product_id.',
    },
  };
}

function loadExistingFingerprintsFromJson(filePath) {
  const resolvedPath = path.resolve(filePath);
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  if (resolvedPath.toLowerCase().endsWith('.jsonl')) {
    return raw
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.current_offer_fingerprints)
      ? parsed.current_offer_fingerprints
      : Array.isArray(parsed.current_product_offers)
        ? buildCurrentOfferFingerprints(parsed.current_product_offers)
        : [];
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows;
}

async function loadExistingFingerprintsFromFirestore({
  firestore,
  collectionPrefix,
  sourceProductIds,
}) {
  const fingerprintRows = await queryCollectionByFieldValues({
    firestore,
    collectionName: resolveCollectionName(collectionPrefix, 'current_offer_fingerprints'),
    fieldName: 'source_product_id',
    values: sourceProductIds,
  });
  if (fingerprintRows.length > 0) {
    return fingerprintRows;
  }

  const currentOffers = await queryCollectionByFieldValues({
    firestore,
    collectionName: resolveCollectionName(collectionPrefix, 'current_product_offers'),
    fieldName: 'source_product_id',
    values: sourceProductIds,
  });
  return buildCurrentOfferFingerprints(currentOffers);
}

async function queryCollectionByFieldValues({
  firestore,
  collectionName,
  fieldName,
  values,
}) {
  const normalizedValues = [...new Set((values || []).filter(Boolean))];
  const rows = [];
  for (let index = 0; index < normalizedValues.length; index += 30) {
    const chunk = normalizedValues.slice(index, index + 30);
    const snapshot = await firestore.collection(collectionName).where(fieldName, 'in', chunk).get();
    rows.push(...snapshot.docs.map((doc) => doc.data()));
  }
  return rows;
}

function resolveIncrementalDiffOptions(env = process.env) {
  const snapshotDate = requiredDateEnv(env, 'PRICER_SNAPSHOT_DATE');
  return {
    snapshotDate,
    snapshotUrl: optionalEnv(env, 'PRICER_SNAPSHOT_URL') || buildSnapshotZipUrl({ snapshotDate }),
    zipFilePath: optionalEnv(env, 'PRICER_SNAPSHOT_ZIP_PATH'),
    projectId: requiredEnv(env, 'PRICER_FIRESTORE_PROJECT_ID'),
    databaseId: env.PRICER_FIRESTORE_DATABASE_ID || '(default)',
    collectionPrefix: requiredEnv(env, 'PRICER_FIRESTORE_COLLECTION_PREFIX'),
    incrementalLimit: normalizeOptionalPositiveInteger(env.PRICER_INCREMENTAL_LIMIT, 'PRICER_INCREMENTAL_LIMIT'),
    progressEvery: normalizeOptionalPositiveInteger(env.PRICER_INCREMENTAL_PROGRESS_EVERY, 'PRICER_INCREMENTAL_PROGRESS_EVERY') || DEFAULT_PROGRESS_EVERY,
    baselinePath: optionalEnv(env, 'PRICER_INCREMENTAL_BASELINE_PATH'),
    allowFirestoreDirectCompare: env.PRICER_INCREMENTAL_ALLOW_FIRESTORE_DIRECT_COMPARE === 'true',
    dryRun: env.PRICER_INCREMENTAL_DRY_RUN !== 'false',
    workingDirectory: env.PRICER_WORK_DIR || path.join(process.cwd(), 'tmp', 'phase6_incremental_diff'),
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

function getOrCreateFirebaseApp(projectId) {
  const appName = 'pricer-phase6-incremental-diff';
  try {
    return admin.getApp(appName);
  } catch (_error) {
    return admin.initializeApp({
      credential: admin.applicationDefault(),
      projectId,
    }, appName);
  }
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
  DirectMemoryStore,
  loadExistingFingerprintsFromJson,
  resolveIncrementalDiffOptions,
  runIncrementalSnapshotDiff,
  runIncrementalSnapshotDiffFromEnv,
};
