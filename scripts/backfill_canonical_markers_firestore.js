#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  CANONICAL_MARKER_BACKFILL_VERSION,
  buildCanonicalMarkerBackfillPlan,
} = require('../functions/src/phase6/ingest');

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_PROGRESS_EVERY = 1000;
const MAX_EXAMPLES = 12;
const FORBIDDEN_COLLECTIONS = Object.freeze([
  'raw_price_snapshots',
  'current_product_offers',
  'product_daily_prices',
  'canonical_product_mappings',
  'source_products',
]);
const ALLOWED_COLLECTIONS = Object.freeze([
  'canonical_products',
  'canonical_enrichment_store',
]);

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return String(value).trim().toLowerCase() === 'true';
}

function parsePositiveInteger(value, defaultValue = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function buildConfig(env = process.env) {
  return {
    projectId: env.PRICER_FIRESTORE_PROJECT_ID || undefined,
    databaseId: env.PRICER_FIRESTORE_DATABASE_ID || undefined,
    collectionPrefix: env.PRICER_FIRESTORE_COLLECTION_PREFIX || '',
    dryRun: parseBoolean(env.PRICER_BACKFILL_DRY_RUN, true),
    limit: parsePositiveInteger(env.PRICER_BACKFILL_LIMIT, null),
    onlyMissing: parseBoolean(env.PRICER_BACKFILL_ONLY_MISSING, false),
    progressEvery: parsePositiveInteger(env.PRICER_BACKFILL_PROGRESS_EVERY, DEFAULT_PROGRESS_EVERY),
    pageSize: parsePositiveInteger(env.PRICER_BACKFILL_PAGE_SIZE, DEFAULT_PAGE_SIZE),
    logDir: env.PRICER_BACKFILL_LOG_DIR || path.resolve(process.cwd(), 'tmp', 'backfill_logs'),
    now: env.PRICER_BACKFILL_NOW || new Date().toISOString(),
  };
}

function resolveCollectionName(prefix, collectionName) {
  assertAllowedCollection(collectionName);
  return prefix ? `${prefix}_${collectionName}` : collectionName;
}

function assertAllowedCollection(collectionName) {
  if (FORBIDDEN_COLLECTIONS.includes(collectionName)) {
    throw new Error(`Backfill safety violation: forbidden collection "${collectionName}" was requested.`);
  }

  if (!ALLOWED_COLLECTIONS.includes(collectionName)) {
    throw new Error(`Backfill safety violation: unexpected collection "${collectionName}" was requested.`);
  }
}

function collectionRef(firestore, config, collectionName) {
  assertAllowedCollection(collectionName);
  return firestore.collection(resolveCollectionName(config.collectionPrefix, collectionName));
}

function logWithTimestamp(logger, message, details = null) {
  const line = `[${new Date().toISOString()}] ${message}`;
  if (details) {
    logger(line, details);
    return;
  }
  logger(line);
}

function createEmptySummary(config) {
  return {
    started_at: config.now,
    finished_at: null,
    dry_run: config.dryRun,
    collection_prefix: config.collectionPrefix || '',
    parser_version: CANONICAL_MARKER_BACKFILL_VERSION,
    scanned_count: 0,
    changed_count: 0,
    unchanged_count: 0,
    skipped_uncertain_count: 0,
    failed_write_count: 0,
    estimated_writes: 0,
    actual_writes: 0,
    canonical_write_count: 0,
    enrichment_write_count: 0,
    field_change_counts: {},
    examples: [],
    skipped_examples: [],
    failed_examples: [],
    touched_collections: [],
    forbidden_collections_touched: [],
  };
}

function incrementField(summary, fieldName) {
  summary.field_change_counts[fieldName] = (summary.field_change_counts[fieldName] || 0) + 1;
}

function pushLimited(array, value, limit = MAX_EXAMPLES) {
  if (array.length < limit) {
    array.push(value);
  }
}

function normalizeFieldName(fieldName) {
  return fieldName.replace(/^canonical_attributes_json\./u, 'markers.');
}

async function runBackfill({
  firestore,
  env = process.env,
  logger = console.log,
} = {}) {
  if (!firestore) {
    throw new Error('runBackfill requires a Firestore client.');
  }

  const config = buildConfig(env);
  const summary = createEmptySummary(config);
  const touchedCollections = new Set();
  const canonicalCollection = collectionRef(firestore, config, 'canonical_products');
  touchedCollections.add(resolveCollectionName(config.collectionPrefix, 'canonical_products'));

  logWithTimestamp(logger, 'Starting canonical marker backfill.', {
    dry_run: config.dryRun,
    limit: config.limit,
    only_missing: config.onlyMissing,
    collection_prefix: config.collectionPrefix,
  });

  let lastDoc = null;
  let stop = false;
  const pendingWrites = [];

  const queueWrite = async (ref, patch, collectionName) => {
    summary.estimated_writes += 1;
    if (config.dryRun) {
      return;
    }

    pendingWrites.push({ ref, patch, collectionName });
    if (pendingWrites.length >= 400) {
      await flushWrites({ firestore, pendingWrites, summary });
    }
  };

  while (!stop) {
    const remaining = config.limit
      ? Math.max(0, config.limit - summary.scanned_count)
      : config.pageSize;
    if (remaining === 0) {
      break;
    }

    let query = canonicalCollection
      .orderBy('__name__')
      .limit(Math.min(config.pageSize, remaining));
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty || snapshot.docs.length === 0) {
      break;
    }

    for (const doc of snapshot.docs) {
      if (config.limit && summary.scanned_count >= config.limit) {
        stop = true;
        break;
      }

      summary.scanned_count += 1;
      const product = doc.data() || {};
      const plan = buildCanonicalMarkerBackfillPlan({
        product,
        now: config.now,
        onlyMissing: config.onlyMissing,
      });

      if (plan.skipped) {
        summary.skipped_uncertain_count += 1;
        pushLimited(summary.skipped_examples, {
          canonical_product_id: product.canonical_product_id || doc.id,
          reason: plan.skip_reason,
          canonical_display_name: product.canonical_display_name || null,
          source_example_name: product.source_example_name || null,
        });
        continue;
      }

      if (!plan.changed) {
        summary.unchanged_count += 1;
        continue;
      }

      summary.changed_count += 1;
      Object.keys(plan.changes).forEach((fieldName) => incrementField(summary, normalizeFieldName(fieldName)));
      pushLimited(summary.examples, {
        canonical_product_id: product.canonical_product_id || doc.id,
        name: product.source_example_name || product.canonical_display_name || null,
        changes: plan.changes,
      });

      summary.canonical_write_count += 1;
      await queueWrite(doc.ref, plan.patch, 'canonical_products');

      const enrichmentPatch = await maybeBuildEnrichmentPatch({
        firestore,
        config,
        product,
        plan,
        touchedCollections,
      });
      if (enrichmentPatch) {
        summary.enrichment_write_count += 1;
        incrementField(summary, 'canonical_enrichment_store.enrichment.brand');
        await queueWrite(enrichmentPatch.ref, enrichmentPatch.patch, 'canonical_enrichment_store');
      }

      if (summary.scanned_count % config.progressEvery === 0) {
        await writeHeartbeat({ config, summary });
        logWithTimestamp(logger, 'Canonical marker backfill progress.', compactProgress(summary));
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  await flushWrites({ firestore, pendingWrites, summary });

  summary.finished_at = new Date().toISOString();
  summary.touched_collections = [...touchedCollections].sort();
  summary.forbidden_collections_touched = summary.touched_collections.filter((collectionName) =>
    FORBIDDEN_COLLECTIONS.some((forbidden) =>
      collectionName === forbidden || collectionName.endsWith(`_${forbidden}`)
    )
  );

  await writeHeartbeat({ config, summary, final: true });
  logWithTimestamp(logger, 'Canonical marker backfill finished.', compactProgress(summary));
  return summary;
}

async function maybeBuildEnrichmentPatch({
  firestore,
  config,
  product,
  plan,
  touchedCollections,
}) {
  const brandChange = plan.changes.canonical_brand;
  if (!brandChange?.after || !product.canonical_product_id) {
    return null;
  }

  const collection = collectionRef(firestore, config, 'canonical_enrichment_store');
  touchedCollections.add(resolveCollectionName(config.collectionPrefix, 'canonical_enrichment_store'));
  const ref = collection.doc(product.canonical_product_id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return null;
  }

  const record = snapshot.data() || {};
  const currentBrand = record.enrichment?.brand || null;
  const shouldPatch = !currentBrand || currentBrand === brandChange.before;
  if (!shouldPatch) {
    return null;
  }

  return {
    ref,
    patch: {
      'enrichment.brand': brandChange.after,
      marker_backfill_version: CANONICAL_MARKER_BACKFILL_VERSION,
      marker_backfilled_at: config.now,
    },
  };
}

async function flushWrites({
  firestore,
  pendingWrites,
  summary,
}) {
  if (pendingWrites.length === 0) {
    return;
  }

  const writes = pendingWrites.splice(0, pendingWrites.length);
  try {
    if (typeof firestore.batch === 'function') {
      const batch = firestore.batch();
      writes.forEach((write) => {
        batch.update(write.ref, write.patch);
      });
      await batch.commit();
    } else {
      await Promise.all(writes.map((write) => write.ref.update(write.patch)));
    }
    summary.actual_writes += writes.length;
  } catch (error) {
    summary.failed_write_count += writes.length;
    pushLimited(summary.failed_examples, {
      message: error.message,
      write_count: writes.length,
    });
  }
}

function compactProgress(summary) {
  return {
    scanned_count: summary.scanned_count,
    changed_count: summary.changed_count,
    unchanged_count: summary.unchanged_count,
    estimated_writes: summary.estimated_writes,
    actual_writes: summary.actual_writes,
    failed_write_count: summary.failed_write_count,
  };
}

async function writeHeartbeat({
  config,
  summary,
  final = false,
}) {
  fs.mkdirSync(config.logDir, { recursive: true });
  const fileName = final
    ? 'canonical_marker_backfill_latest.json'
    : 'canonical_marker_backfill_heartbeat.json';
  fs.writeFileSync(path.join(config.logDir, fileName), JSON.stringify(summary, null, 2));
}

function createFirestoreFromEnv(env = process.env) {
  // Loaded only for the CLI path so unit tests can exercise the backfill with fakes.
  // eslint-disable-next-line global-require
  const admin = require('firebase-admin/app');
  // eslint-disable-next-line global-require
  const { getFirestore } = require('firebase-admin/firestore');
  const appName = env.PRICER_FIRESTORE_APP_NAME || 'pricer-canonical-marker-backfill';
  const projectId = env.PRICER_FIRESTORE_PROJECT_ID || undefined;
  const databaseId = env.PRICER_FIRESTORE_DATABASE_ID || undefined;

  let app;
  try {
    app = admin.getApp(appName);
  } catch (_error) {
    app = admin.initializeApp({
      credential: admin.applicationDefault(),
      projectId,
    }, appName);
  }

  return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

async function main() {
  const firestore = createFirestoreFromEnv(process.env);
  const summary = await runBackfill({
    firestore,
    env: process.env,
    logger: console.log,
  });
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[${new Date().toISOString()}] Canonical marker backfill failed.`);
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildConfig,
  runBackfill,
};
