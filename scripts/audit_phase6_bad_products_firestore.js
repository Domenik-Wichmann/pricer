const fs = require('node:fs');
const path = require('node:path');

const admin = require('firebase-admin/app');
const { FieldPath, getFirestore } = require('firebase-admin/firestore');

const {
  PRODUCT_QUALITY_STATUS,
  PRODUCT_QUARANTINE_SOURCE,
  resolveCollectionName,
  summarizeProductQualityReasons,
} = require('../app/functions/src');

const DEFAULT_COLLECTIONS = Object.freeze(['canonical_products', 'source_products']);
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_AFFECTED_READ_MODEL_COLLECTIONS = Object.freeze([
  'current_product_offers',
  'canonical_current_offer_summary',
]);
const QUARANTINE_CONFIRMATION = 'mark-invalid-products-no-delete';
const FIRESTORE_IN_QUERY_LIMIT = 30;

async function main() {
  const result = await runBadProductAuditFromEnv(process.env);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function runBadProductAuditFromEnv(env = process.env) {
  const options = resolveAuditOptions(env);
  return runBadProductAudit(options);
}

async function runBadProductAudit({
  projectId,
  databaseId = '(default)',
  collectionPrefix,
  collections = DEFAULT_COLLECTIONS,
  pageSize = DEFAULT_PAGE_SIZE,
  limit = null,
  outputPath = null,
  now = new Date().toISOString(),
  firestore = null,
  dryRun = true,
  confirmQuarantine = '',
} = {}) {
  validateQuarantineMode({ dryRun, confirmQuarantine });
  const resolvedFirestore = firestore || getFirestore(getOrCreateFirebaseApp(projectId), databaseId);
  const collectionResults = {};

  for (const collectionName of collections) {
    collectionResults[collectionName] = await scanCollection({
      firestore: resolvedFirestore,
      collectionPrefix,
      collectionName,
      pageSize,
      limit,
      now,
      dryRun,
    });
  }
  const affectedReadModels = await countAffectedReadModels({
    firestore: resolvedFirestore,
    collectionPrefix,
    collectionResults,
  });
  const totals = summarizeCollectionTotals(collectionResults);
  totals.affected_current_product_offers_count =
    affectedReadModels.current_product_offers?.affected_records || 0;
  totals.affected_canonical_current_offer_summary_count =
    affectedReadModels.canonical_current_offer_summary?.affected_records || 0;

  const result = {
    command: 'phase6:audit-bad-products',
    mode: dryRun ? 'audit' : 'quarantine',
    dry_run: dryRun,
    destructive_deletes: false,
    writes_performed: totals.writes_performed,
    project_id: projectId,
    database_id: databaseId,
    collection_prefix: collectionPrefix,
    page_size: pageSize,
    limit,
    totals,
    collections: collectionResults,
    affected_read_models: affectedReadModels,
    scanned_at: now,
    cleanup_policy: dryRun
      ? 'report_only_no_delete_no_quarantine'
      : 'mark_invalid_only_no_delete',
    quarantine_source: PRODUCT_QUARANTINE_SOURCE,
  };

  if (outputPath) {
    const resolvedOutputPath = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  return result;
}

async function scanCollection({
  firestore,
  collectionPrefix,
  collectionName,
  pageSize,
  limit,
  now,
  dryRun,
}) {
  const collectionId = resolveCollectionName(collectionPrefix, collectionName);
  const ref = firestore.collection(collectionId);
  const findings = [];
  const counts = {
    warning: 0,
    suspicious: 0,
    invalid: 0,
  };
  let scanned = 0;
  let quarantineCandidates = 0;
  let writesPerformed = 0;
  let lastDoc = null;

  while (limit === null || scanned < limit) {
    const remaining = limit === null ? pageSize : Math.min(pageSize, limit - scanned);
    if (remaining <= 0) {
      break;
    }

    let query = ref.orderBy(FieldPath.documentId()).limit(remaining);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    snapshot.docs.forEach((doc) => {
      scanned += 1;
      const data = doc.data();
      const quality = summarizeProductQualityReasons(
        data,
        collectionName === 'source_products' ? 'source_product' : 'canonical_product'
      );
      if (quality.quality_status !== 'valid') {
        if (Object.prototype.hasOwnProperty.call(counts, quality.quality_status)) {
          counts[quality.quality_status] += 1;
        }
        const quarantinable = quality.quality_status === PRODUCT_QUALITY_STATUS.INVALID &&
          quality.quarantinable === true;
        if (quarantinable) {
          quarantineCandidates += 1;
        }
        findings.push({
          collection_name: collectionName,
          document_id: doc.id,
          product_id: data.canonical_product_id || data.source_product_id || doc.id,
          quality_status: quality.quality_status,
          quarantinable,
          reasons: quality.reasons,
          sample: quality.sample,
          quarantine_action: quarantinable
            ? dryRun ? 'would_mark_invalid' : 'marked_invalid'
            : 'not_quarantinable',
        });
      }
    });

    if (!dryRun) {
      const quarantinableDocs = snapshot.docs.filter((doc) => {
        const data = doc.data();
        const quality = summarizeProductQualityReasons(
          data,
          collectionName === 'source_products' ? 'source_product' : 'canonical_product'
        );
        return quality.quality_status === PRODUCT_QUALITY_STATUS.INVALID && quality.quarantinable === true;
      });
      for (const doc of quarantinableDocs) {
        const data = doc.data();
        const quality = summarizeProductQualityReasons(
          data,
          collectionName === 'source_products' ? 'source_product' : 'canonical_product'
        );
        await ref.doc(doc.id).set(buildQuarantineMarker({
          quality,
          quarantinedAt: now,
        }), { merge: true });
        writesPerformed += 1;
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < remaining) {
      break;
    }
  }

  return {
    collection: collectionId,
    scanned_records: scanned,
    warning_count: counts.warning,
    suspicious_count: counts.suspicious,
    invalid_count: counts.invalid,
    quarantinable_count: quarantineCandidates,
    quarantine_candidate_count: quarantineCandidates,
    suspicious_records: counts.suspicious + counts.invalid,
    flagged_records: findings.length,
    findings,
    dry_run: dryRun,
    writes_performed: writesPerformed,
  };
}

function summarizeCollectionTotals(collectionResults) {
  const totals = {
    scanned_records: 0,
    warning_count: 0,
    suspicious_count: 0,
    invalid_count: 0,
    quarantinable_count: 0,
    quarantine_candidate_count: 0,
    suspicious_records: 0,
    flagged_records: 0,
    writes_performed: 0,
  };

  Object.values(collectionResults).forEach((collection) => {
    totals.scanned_records += collection.scanned_records || 0;
    totals.warning_count += collection.warning_count || 0;
    totals.suspicious_count += collection.suspicious_count || 0;
    totals.invalid_count += collection.invalid_count || 0;
    totals.quarantinable_count += collection.quarantinable_count || 0;
    totals.quarantine_candidate_count += collection.quarantine_candidate_count || 0;
    totals.suspicious_records += collection.suspicious_records || 0;
    totals.flagged_records += collection.flagged_records || 0;
    totals.writes_performed += collection.writes_performed || 0;
  });

  return totals;
}

async function countAffectedReadModels({
  firestore,
  collectionPrefix,
  collectionResults,
}) {
  const invalidCanonicalProductIds = new Set();
  const invalidSourceProductIds = new Set();

  Object.entries(collectionResults).forEach(([collectionName, result]) => {
    (result.findings || []).forEach((finding) => {
      if (finding.quality_status !== PRODUCT_QUALITY_STATUS.INVALID || finding.quarantinable !== true) {
        return;
      }
      if (collectionName === 'canonical_products') {
        invalidCanonicalProductIds.add(finding.product_id);
      }
      if (collectionName === 'source_products') {
        invalidSourceProductIds.add(finding.product_id);
      }
    });
  });

  const affectedOffersById = new Map();
  const currentOfferCollection = resolveCollectionName(collectionPrefix, 'current_product_offers');
  const currentOfferRef = firestore.collection(currentOfferCollection);
  await collectMatchingDocuments({
    ref: currentOfferRef,
    fieldName: 'canonical_product_id',
    values: [...invalidCanonicalProductIds],
    targetMap: affectedOffersById,
  });
  await collectMatchingDocuments({
    ref: currentOfferRef,
    fieldName: 'source_product_id',
    values: [...invalidSourceProductIds],
    targetMap: affectedOffersById,
  });

  const affectedSummaryIds = new Set();
  const canonicalIdsFromAffectedOffers = [...affectedOffersById.values()]
    .map((offer) => offer.canonical_product_id)
    .filter(Boolean);
  const summaryCollection = resolveCollectionName(collectionPrefix, 'canonical_current_offer_summary');
  await collectMatchingDocumentIds({
    ref: firestore.collection(summaryCollection),
    fieldName: 'canonical_product_id',
    values: [...new Set([...invalidCanonicalProductIds, ...canonicalIdsFromAffectedOffers])],
    targetSet: affectedSummaryIds,
  });

  return {
    current_product_offers: {
      collection: currentOfferCollection,
      affected_records: affectedOffersById.size,
      write_policy: 'report_only_no_rewrite_no_delete',
    },
    canonical_current_offer_summary: {
      collection: summaryCollection,
      affected_records: affectedSummaryIds.size,
      write_policy: 'report_only_no_rewrite_no_delete',
    },
  };
}

async function collectMatchingDocumentIds({
  ref,
  fieldName,
  values,
  targetSet,
}) {
  const docsById = new Map();
  await collectMatchingDocuments({
    ref,
    fieldName,
    values,
    targetMap: docsById,
  });
  docsById.forEach((_data, id) => targetSet.add(id));
}

async function collectMatchingDocuments({
  ref,
  fieldName,
  values,
  targetMap,
}) {
  const ids = [...new Set((values || []).filter(Boolean))];
  for (const chunk of chunkArray(ids, FIRESTORE_IN_QUERY_LIMIT)) {
    if (chunk.length === 0) {
      continue;
    }
    const snapshot = await ref.where(fieldName, 'in', chunk).get();
    snapshot.docs.forEach((doc) => targetMap.set(doc.id, doc.data()));
  }
}

function buildQuarantineMarker({
  quality,
  quarantinedAt,
}) {
  return {
    data_quality_status: PRODUCT_QUALITY_STATUS.INVALID,
    data_quality_reasons: [...new Set(quality.reasons || [])],
    data_quality_sample: quality.sample || null,
    quarantined_at: quarantinedAt,
    quarantine_source: PRODUCT_QUARANTINE_SOURCE,
  };
}

function validateQuarantineMode({
  dryRun,
  confirmQuarantine,
}) {
  if (dryRun !== false) {
    return;
  }
  if (confirmQuarantine !== QUARANTINE_CONFIRMATION) {
    throw new Error(
      `Real quarantine mode requires PRICER_PHASE6_BAD_PRODUCT_QUARANTINE_CONFIRM="${QUARANTINE_CONFIRMATION}".`
    );
  }
}

function resolveAuditOptions(env = process.env) {
  return {
    projectId: requiredEnv(env, 'PRICER_FIRESTORE_PROJECT_ID'),
    databaseId: env.PRICER_FIRESTORE_DATABASE_ID || '(default)',
    collectionPrefix: requiredEnv(env, 'PRICER_FIRESTORE_COLLECTION_PREFIX'),
    collections: resolveCollections(env.PRICER_PHASE6_BAD_PRODUCT_AUDIT_COLLECTIONS),
    pageSize: parsePositiveInteger(env.PRICER_PHASE6_BAD_PRODUCT_AUDIT_PAGE_SIZE, DEFAULT_PAGE_SIZE),
    limit: parseNullablePositiveInteger(env.PRICER_PHASE6_BAD_PRODUCT_AUDIT_LIMIT),
    outputPath: optionalEnv(env, 'PRICER_PHASE6_BAD_PRODUCT_AUDIT_OUTPUT'),
    dryRun: parseBooleanEnv(env.PRICER_PHASE6_BAD_PRODUCT_QUARANTINE_DRY_RUN, true),
    confirmQuarantine: optionalEnv(env, 'PRICER_PHASE6_BAD_PRODUCT_QUARANTINE_CONFIRM'),
  };
}

function resolveCollections(raw) {
  if (!raw || !String(raw).trim()) {
    return [...DEFAULT_COLLECTIONS];
  }

  const requested = String(raw)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  requested.forEach((collectionName) => {
    if (!DEFAULT_COLLECTIONS.includes(collectionName)) {
      throw new Error(`Unsupported audit collection "${collectionName}".`);
    }
  });
  return [...new Set(requested)];
}

function getOrCreateFirebaseApp(projectId) {
  const appName = 'pricer-phase6-bad-product-audit';
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

function parsePositiveInteger(value, defaultValue) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseNullablePositiveInteger(value) {
  if (!value || !String(value).trim()) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('PRICER_PHASE6_BAD_PRODUCT_AUDIT_LIMIT must be a positive integer when set.');
  }
  return parsed;
}

function parseBooleanEnv(value, defaultValue) {
  if (!value || !String(value).trim()) {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value "${value}".`);
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  QUARANTINE_CONFIRMATION,
  DEFAULT_COLLECTIONS,
  DEFAULT_AFFECTED_READ_MODEL_COLLECTIONS,
  runBadProductAudit,
  runBadProductAuditFromEnv,
  resolveAuditOptions,
};
