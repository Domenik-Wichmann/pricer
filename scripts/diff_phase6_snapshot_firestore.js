const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { pipeline } = require('node:stream/promises');

const admin = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const {
  DEFAULT_INCREMENTAL_HIGH_WRITE_THRESHOLD,
  buildCurrentOfferFingerprints,
  buildCurrentOfferFingerprint,
  buildCurrentOfferReadModel,
  buildIncrementalWriterPlan,
  buildOfferChangeEvents,
  buildSnapshotManifest,
  buildSnapshotZipUrl,
  changedRowsForWriter,
  createEmptyDataBackbone,
  diffCurrentOffers,
  importDailySnapshotZip,
  listSnapshotEntries,
  normalizeIncrementalEventPolicy,
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
  eventPolicy = 'price_promo_availability',
  dryRun = true,
  allowHighWriteCatchup = false,
  highWriteThreshold = DEFAULT_INCREMENTAL_HIGH_WRITE_THRESHOLD,
  markMissingUnavailable = false,
  now = new Date().toISOString(),
  firestore = null,
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
    baselineProgressEvery: progressEvery,
    logger: console.error,
  });

  const diff = comparison.can_compare
    ? diffCurrentOffers({
      nextOffers: selectedNextOffers,
      existingFingerprints: comparison.existing_fingerprints,
      generatedAt: now,
      eventPolicy,
    })
    : null;
  const writerPlan = diff
    ? buildIncrementalWriterPlan({
      diff,
      dryRun,
      allowHighWriteCatchup,
      highWriteThreshold,
      markMissingUnavailable,
    })
    : null;
  if (writerPlan?.refusal_reason) {
    const error = new Error(writerPlan.refusal_reason);
    error.code = 'PRICER_INCREMENTAL_HIGH_WRITE_CATCHUP_ACK_REQUIRED';
    error.writer_plan = writerPlan;
    throw error;
  }
  const manifest = diff
    ? buildSnapshotManifest({
      snapshotDate,
      snapshotUrl,
      collectionPrefix,
      source: ingest,
      generatedAt: now,
      mode: dryRun === true ? 'daily_incremental_dry_run' : 'daily_incremental_real_writer',
      diff: {
        ...diff,
        high_write_catchup_acknowledged: allowHighWriteCatchup === true,
      },
      comparisonMode: comparison.mode,
    })
    : null;
  const diffDiagnostics = diff
    ? buildDailyDiffDiagnostics({
      diff,
      nextOffers: selectedNextOffers,
      existingFingerprints: comparison.existing_fingerprints,
    })
    : null;

  const estimatedFirestoreReads = comparison.can_compare
    ? comparison.estimated_reads
    : {
      direct_compare_required_reads: allNextOffers.length,
      reason: 'A full direct Firestore comparison would read one existing fingerprint/current-offer row per incoming offer. Provide PRICER_INCREMENTAL_BASELINE_PATH, set PRICER_INCREMENTAL_LIMIT for a sample, or explicitly set PRICER_INCREMENTAL_ALLOW_FIRESTORE_DIRECT_COMPARE=true.',
    };
  const writeResult = diff
    ? await applyIncrementalWriter({
      firestore,
      projectId,
      databaseId,
      collectionPrefix,
      diff,
      manifest,
      writerPlan,
      nextOffers: selectedNextOffers,
      currentOfferSummaries: readModel.canonical_current_offer_summary,
      existingFingerprints: comparison.existing_fingerprints,
      snapshotDate,
      eventPolicy,
      now,
      dryRun,
    })
    : {
      actual_writes: emptyActualWrites(),
      failed_writes: emptyActualWrites(),
      writes_performed: 0,
      firestore_writes_enabled: false,
    };
  if (manifest) {
    manifest.actual_writes = writeResult.actual_writes;
    manifest.failed_writes = writeResult.failed_writes;
  }

  return {
    command: 'phase6:diff-snapshot',
    backend: 'firestore',
    project_id: projectId,
    database_id: databaseId,
    collection_prefix: collectionPrefix,
    dry_run: dryRun === true,
    destructive_deletes: false,
    writes_performed: writeResult.writes_performed,
    firestore_writes_enabled: writeResult.firestore_writes_enabled,
    writer_plan: writerPlan,
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
    comparison: buildComparisonSummary(comparison),
    scanned_rows: ingest.imported_rows,
    new_offers: diff?.counts.new ?? null,
    changed_offers: diff
      ? diff.counts.price_changed +
        diff.counts.promo_changed +
        diff.counts.availability_changed +
        diff.counts.metadata_changed_only +
        diff.counts.canonical_mapping_changed +
        diff.counts.other_changed
      : null,
    unchanged_offers: diff?.counts.unchanged ?? null,
    removed_missing_offers: diff?.counts.missing_removed ?? null,
    affected_canonical_summaries: diff?.summaries_to_update ?? null,
    estimated_firestore_reads: estimatedFirestoreReads,
    estimated_firestore_writes: diff?.estimated_writes ?? {
      unknown_until_baseline_compare: true,
      writes_performed: 0,
    },
    estimated_write_policy_variants: diff?.estimated_write_policy_variants ?? null,
    recommended_event_policy: diff?.recommended_event_policy ?? 'price_promo_availability',
    change_category_report: diff?.change_category_report ?? null,
    diff_diagnostics: diffDiagnostics,
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

async function applyIncrementalWriter({
  firestore = null,
  projectId,
  databaseId,
  collectionPrefix,
  diff,
  manifest,
  writerPlan,
  nextOffers = [],
  currentOfferSummaries = [],
  existingFingerprints = [],
  snapshotDate,
  eventPolicy,
  now,
  dryRun = true,
} = {}) {
  const actualWrites = emptyActualWrites();
  const failedWrites = emptyActualWrites();
  if (dryRun === true || !diff || !writerPlan?.can_write) {
    return {
      actual_writes: actualWrites,
      failed_writes: failedWrites,
      writes_performed: 0,
      firestore_writes_enabled: false,
    };
  }

  const db = firestore || getFirestore(getOrCreateFirebaseApp(projectId), databaseId);
  const nextOfferBySourceId = new Map((nextOffers || []).map((offer) => [offer.source_product_id, offer]));
  const existingBySourceId = new Map((existingFingerprints || []).map((row) => [row.source_product_id, row]));
  const changedRows = changedRowsForWriter(diff);
  const changedSourceIds = new Set(changedRows.map((row) => row.source_product_id));
  const changedCanonicalIds = new Set(
    changedRows.map((row) => row.canonical_product_id).filter(Boolean)
  );
  const offersToWrite = [...changedSourceIds]
    .map((sourceProductId) => nextOfferBySourceId.get(sourceProductId))
    .filter(Boolean)
    .sort((left, right) => String(left.offer_id).localeCompare(String(right.offer_id)));
  const fingerprintsToWrite = offersToWrite.map((offer) => {
    const existing = existingBySourceId.get(offer.source_product_id) || {};
    return buildCurrentOfferFingerprint(offer, {
      generatedAt: now,
      firstSeenSnapshotDate: existing.first_seen_snapshot_date || existing.snapshot_date || offer.snapshot_date || snapshotDate,
      lastSeenSnapshotDate: offer.snapshot_date || snapshotDate,
    });
  });
  const eventsToWrite = buildOfferChangeEvents({
    diff,
    snapshotDate,
    generatedAt: now,
    eventPolicy,
  });
  const summariesToWrite = (currentOfferSummaries || [])
    .filter((summary) => changedCanonicalIds.has(summary.canonical_product_id))
    .sort((left, right) => left.canonical_product_id.localeCompare(right.canonical_product_id));
  const operations = [
    ...offersToWrite.map((record) => ['current_product_offers', record]),
    ...fingerprintsToWrite.map((record) => ['current_offer_fingerprints', record]),
    ...eventsToWrite.map((record) => ['offer_change_events', record]),
    ...summariesToWrite.map((record) => ['canonical_current_offer_summary', record]),
  ];

  for (let index = 0; index < operations.length; index += 400) {
    const batch = db.batch();
    const chunk = operations.slice(index, index + 400);
    chunk.forEach(([collectionName, record]) => {
      const collectionId = resolveCollectionName(collectionPrefix, collectionName);
      batch.set(
        db.collection(collectionId).doc(documentIdForIncrementalRecord(collectionName, record)),
        sanitizeStoredRecord(record)
      );
    });
    try {
      await batch.commit();
      chunk.forEach(([collectionName]) => {
        actualWrites[collectionName] += 1;
      });
    } catch (error) {
      chunk.forEach(([collectionName]) => {
        failedWrites[collectionName] += 1;
      });
      throw error;
    }
  }

  const manifestToWrite = {
    ...manifest,
    mode: 'daily_incremental_real_writer',
    actual_writes: {
      ...actualWrites,
      snapshot_manifests: 1,
    },
    failed_writes: failedWrites,
  };
  try {
    await db
      .collection(resolveCollectionName(collectionPrefix, 'snapshot_manifests'))
      .doc(manifestToWrite.manifest_id)
      .set(sanitizeStoredRecord(manifestToWrite));
    actualWrites.snapshot_manifests += 1;
  } catch (error) {
    failedWrites.snapshot_manifests += 1;
    throw error;
  }

  return {
    actual_writes: actualWrites,
    failed_writes: failedWrites,
    writes_performed: Object.values(actualWrites).reduce((sum, count) => sum + count, 0),
    firestore_writes_enabled: true,
  };
}

function emptyActualWrites() {
  return {
    current_product_offers: 0,
    current_offer_fingerprints: 0,
    offer_change_events: 0,
    canonical_current_offer_summary: 0,
    snapshot_manifests: 0,
    deletes: 0,
  };
}

function documentIdForIncrementalRecord(collectionName, record) {
  if (collectionName === 'current_product_offers') {
    return record.offer_id;
  }
  if (collectionName === 'current_offer_fingerprints') {
    return record.source_product_id;
  }
  if (collectionName === 'offer_change_events') {
    return record.event_id;
  }
  if (collectionName === 'canonical_current_offer_summary') {
    return record.canonical_product_id;
  }
  if (collectionName === 'snapshot_manifests') {
    return record.manifest_id;
  }
  throw new Error(`Unsupported incremental writer collection: ${collectionName}`);
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

function buildDailyDiffDiagnostics({
  diff,
  nextOffers = [],
  existingFingerprints = [],
} = {}) {
  const nextOfferBySourceId = new Map((nextOffers || [])
    .filter((offer) => offer?.source_product_id)
    .map((offer) => [offer.source_product_id, offer]));
  const existingBySourceId = new Map((existingFingerprints || [])
    .filter((row) => row?.source_product_id)
    .map((row) => [row.source_product_id, row]));

  const newRows = diff?.categories?.new_offers || diff?.categories?.new || [];
  const missingRows = diff?.categories?.missing_removed || [];
  const mappingRows = diff?.categories?.canonical_mapping_changed || [];
  const priceRows = diff?.categories?.price_changed || [];

  const newOffers = buildOfferCategoryDiagnostics({
    rows: newRows,
    nextOfferBySourceId,
    existingBySourceId,
    side: 'next',
  });
  const missingRemoved = buildOfferCategoryDiagnostics({
    rows: missingRows,
    nextOfferBySourceId,
    existingBySourceId,
    side: 'existing',
  });
  const replacementHeuristic = buildReplacementChurnHeuristic({
    newRows,
    missingRows,
    nextOfferBySourceId,
    existingBySourceId,
  });

  return {
    new_offers: {
      ...newOffers,
      id_stability: buildSourceIdStabilityReport({
        rows: newRows,
        knownExistingSourceIds: new Set(existingBySourceId.keys()),
      }),
    },
    missing_removed: {
      ...missingRemoved,
      similar_new_offer_heuristic: replacementHeuristic,
    },
    billa_diagnostics: buildBillaDiagnostics({
      newRows,
      missingRows,
      nextOfferBySourceId,
      existingBySourceId,
      replacementHeuristic,
    }),
    canonical_mapping_changed: buildCanonicalMappingDiagnostics({
      rows: mappingRows,
      nextOfferBySourceId,
      existingBySourceId,
    }),
    price_changed: buildPriceChangeDiagnostics({
      rows: priceRows,
      nextOfferBySourceId,
      existingBySourceId,
    }),
    baseline_detail_availability: buildBaselineDetailAvailability(existingFingerprints),
  };
}

function buildOfferCategoryDiagnostics({
  rows,
  nextOfferBySourceId,
  existingBySourceId,
  side,
}) {
  const enrichedRows = (rows || []).map((row) => {
    const sourceId = row?.source_product_id;
    return side === 'next'
      ? { ...row, ...(nextOfferBySourceId.get(sourceId) || {}) }
      : { ...row, ...(existingBySourceId.get(sourceId) || {}) };
  });
  return {
    count: enrichedRows.length,
    top_chains_or_retailers: topValues(enrichedRows, chainOrRetailerLabel),
    top_categories: topValues(enrichedRows, categoryLabel),
    sample_source_products: enrichedRows.slice(0, 5).map(buildSourceProductSample),
    detail_fields_available: summarizeDetailFields(enrichedRows),
  };
}

function buildCanonicalMappingDiagnostics({
  rows,
  nextOfferBySourceId,
  existingBySourceId,
}) {
  const samples = (rows || []).slice(0, 5).map((row) => {
    const sourceId = row?.source_product_id;
    const nextOffer = nextOfferBySourceId.get(sourceId) || {};
    const existing = existingBySourceId.get(sourceId) || {};
    return {
      source_product_id: sourceId || null,
      source_product_name_raw: nextOffer.source_product_name_raw || existing.source_product_name_raw || null,
      category_code: nextOffer.category_code || existing.category_code || null,
      chain_or_retailer: chainOrRetailerLabel({ ...existing, ...nextOffer }),
      previous_canonical_product_id: existing.canonical_product_id || row.previous_canonical_product_id || null,
      next_canonical_product_id: row.canonical_product_id || nextOffer.canonical_product_id || null,
      change_reasons: row.change_reasons || [],
      likely_explanation: explainCanonicalMappingChange({ row, nextOffer, existing }),
    };
  });
  return {
    count: (rows || []).length,
    samples,
    top_chains_or_retailers: topValues((rows || []).map((row) => ({
      ...row,
      ...(nextOfferBySourceId.get(row.source_product_id) || {}),
    })), chainOrRetailerLabel),
    top_categories: topValues((rows || []).map((row) => ({
      ...row,
      ...(nextOfferBySourceId.get(row.source_product_id) || {}),
    })), categoryLabel),
  };
}

function buildPriceChangeDiagnostics({
  rows,
  nextOfferBySourceId,
  existingBySourceId,
}) {
  const enrichedRows = (rows || []).map((row) => ({
    ...row,
    ...(nextOfferBySourceId.get(row.source_product_id) || {}),
  }));
  return {
    count: enrichedRows.length,
    top_chains_or_retailers: topValues(enrichedRows, chainOrRetailerLabel),
    top_categories: topValues(enrichedRows, categoryLabel),
    samples: (rows || []).slice(0, 5).map((row) => {
      const existing = existingBySourceId.get(row.source_product_id) || {};
      const nextOffer = nextOfferBySourceId.get(row.source_product_id) || {};
      return {
        source_product_id: row.source_product_id || null,
        source_product_name_raw: nextOffer.source_product_name_raw || existing.source_product_name_raw || null,
        chain_or_retailer: chainOrRetailerLabel({ ...existing, ...nextOffer }),
        category_code: nextOffer.category_code || existing.category_code || null,
        previous_current_price: existing.current_price ?? existing.price ?? null,
        next_current_price: nextOffer.current_price ?? row.current_price ?? null,
        previous_retail_price: existing.retail_price ?? null,
        next_retail_price: nextOffer.retail_price ?? row.retail_price ?? null,
        previous_promo_price: existing.promo_price ?? null,
        next_promo_price: nextOffer.promo_price ?? row.promo_price ?? null,
        previous_snapshot_date: existing.snapshot_date || row.previous_snapshot_date || null,
        next_snapshot_date: nextOffer.snapshot_date || row.snapshot_date || null,
        change_reasons: row.change_reasons || [],
      };
    }),
  };
}

function buildReplacementChurnHeuristic({
  newRows,
  missingRows,
  nextOfferBySourceId,
  existingBySourceId,
}) {
  const newIndexed = {
    name_chain_store_category: new Map(),
    name_retailer_category: new Map(),
  };
  let newRowsWithKey = 0;
  for (const row of newRows || []) {
    const offer = nextOfferBySourceId.get(row.source_product_id) || row;
    const keys = buildReplacementKeys(offer);
    if (!keys.name_chain_store_category && !keys.name_retailer_category) {
      continue;
    }
    newRowsWithKey += 1;
    Object.entries(keys).forEach(([keyName, key]) => {
      if (!key) {
        return;
      }
      const bucket = newIndexed[keyName].get(key) || [];
      bucket.push(offer);
      newIndexed[keyName].set(key, bucket);
    });
  }

  let missingRowsWithKey = 0;
  const matchedNewSourceIds = new Set();
  const matchedMissingSourceIds = new Set();
  const samples = [];
  for (const row of missingRows || []) {
    const existing = existingBySourceId.get(row.source_product_id) || row;
    const keys = buildReplacementKeys(existing);
    if (!keys.name_chain_store_category && !keys.name_retailer_category) {
      continue;
    }
    missingRowsWithKey += 1;
    const matchType = keys.name_chain_store_category && newIndexed.name_chain_store_category.has(keys.name_chain_store_category)
      ? 'normalized_name_chain_store_category'
      : keys.name_retailer_category && newIndexed.name_retailer_category.has(keys.name_retailer_category)
        ? 'normalized_name_retailer_category'
        : null;
    const matches = matchType === 'normalized_name_chain_store_category'
      ? newIndexed.name_chain_store_category.get(keys.name_chain_store_category) || []
      : matchType === 'normalized_name_retailer_category'
        ? newIndexed.name_retailer_category.get(keys.name_retailer_category) || []
        : [];
    if (matches.length === 0) {
      continue;
    }
    matchedMissingSourceIds.add(existing.source_product_id);
    matchedNewSourceIds.add(matches[0].source_product_id);
    if (samples.length < 5) {
      samples.push({
        match_type: matchType,
        replacement_key: matchType === 'normalized_name_chain_store_category'
          ? keys.name_chain_store_category
          : keys.name_retailer_category,
        missing_source_product_id: existing.source_product_id || null,
        new_source_product_id: matches[0].source_product_id || null,
        source_product_id_changed: Boolean(existing.source_product_id && matches[0].source_product_id && existing.source_product_id !== matches[0].source_product_id),
        normalized_name: normalizeTextForChurn(offerName(existing)),
        chain_or_retailer: chainOrRetailerLabel(existing),
        store_id: existing.store_id || null,
        store_name: existing.store_name || null,
        category_code: categoryLabel(existing),
        missing_price: existing.current_price ?? existing.price ?? null,
        new_price: matches[0].current_price ?? matches[0].price ?? null,
      });
    }
  }

  const available = newRowsWithKey > 0 && missingRowsWithKey > 0;
  const likelyReplacements = matchedMissingSourceIds.size;
  const likelyGenuinelyNew = Math.max(0, (newRows || []).length - matchedNewSourceIds.size);
  const likelyGenuinelyRemoved = Math.max(0, (missingRows || []).length - matchedMissingSourceIds.size);
  const unknown = available ? 0 : (newRows || []).length + (missingRows || []).length;
  return {
    available,
    reason: available
      ? null
      : 'Replacement heuristic requires product name plus chain/store/category on both missing baseline rows and new snapshot rows. The current compact baseline usually omits old-side names, categories, chains, and stores.',
    missing_rows_with_replacement_key: missingRowsWithKey,
    new_rows_with_replacement_key: newRowsWithKey,
    likely_same_real_offer_with_new_id: likelyReplacements,
    likely_same_real_offer_pairs: likelyReplacements,
    likely_genuinely_new: available ? likelyGenuinelyNew : null,
    likely_genuinely_removed: available ? likelyGenuinelyRemoved : null,
    unknown,
    estimated_unstable_source_id_churn: likelyReplacements,
    matched_new_source_product_ids: matchedNewSourceIds.size,
    matched_missing_source_product_ids: matchedMissingSourceIds.size,
    sample_pairs: samples,
  };
}

function buildReplacementKeys(row = {}) {
  const normalizedName = normalizeTextForChurn(offerName(row));
  const chain = normalizeTextForChurn(row.chain_id || row.chain_name || row.retailer || row.source_chain_name_normalized || row.source_name);
  const store = normalizeTextForChurn(row.store_id || row.store_name || row.locality_code);
  const retailer = normalizeTextForChurn(row.retailer || row.chain_name || row.chain_id || row.source_chain_name_normalized || row.source_name);
  const category = normalizeTextForChurn(row.category_code || row.canonical_category_code);
  return {
    name_chain_store_category: normalizedName && chain && store && category
      ? [normalizedName, chain, store, category].join('|')
      : null,
    name_retailer_category: normalizedName && retailer && category
      ? [normalizedName, retailer, category].join('|')
      : null,
  };
}

function buildBillaDiagnostics({
  newRows,
  missingRows,
  nextOfferBySourceId,
  existingBySourceId,
  replacementHeuristic,
}) {
  const billaNewRows = (newRows || [])
    .map((row) => nextOfferBySourceId.get(row.source_product_id) || row)
    .filter(isBillaOffer);
  const billaMissingRows = (missingRows || [])
    .map((row) => existingBySourceId.get(row.source_product_id) || row)
    .filter(isBillaOffer);
  const billaHeuristic = buildReplacementChurnHeuristic({
    newRows: billaNewRows,
    missingRows: billaMissingRows,
    nextOfferBySourceId: new Map(),
    existingBySourceId: new Map(),
  });
  const billaSamples = billaHeuristic.sample_pairs || [];
  return {
    billa_new_count: billaNewRows.length,
    billa_missing_count: billaMissingRows.length,
    billa_likely_replacements: billaHeuristic.likely_same_real_offer_with_new_id || 0,
    sample_replacement_pairs: billaSamples,
    source_product_id_changed_while_product_store_looks_same: billaSamples.some((pair) => pair.source_product_id_changed === true),
    top_billa_new_categories: topValues(billaNewRows, categoryLabel),
    top_billa_missing_categories: topValues(billaMissingRows, categoryLabel),
  };
}

function buildSourceIdStabilityReport({
  rows,
  knownExistingSourceIds,
}) {
  const ids = (rows || []).map((row) => String(row?.source_product_id || '')).filter(Boolean);
  const sha256Like = ids.filter((id) => /^[a-f0-9]{64}$/u.test(id)).length;
  const seenInExisting = ids.filter((id) => knownExistingSourceIds.has(id)).length;
  return {
    sampled_count: ids.length,
    sha256_like_source_product_ids: sha256Like,
    non_sha256_like_source_product_ids: ids.length - sha256Like,
    already_present_in_existing_baseline: seenInExisting,
    structurally_new_assessment: seenInExisting === 0
      ? 'All reported new offers are absent from the loaded baseline by source_product_id. ID shape alone cannot prove whether they are real new offers or churn; use the replacement heuristic when baseline detail is available.'
      : 'Some reported new offer ids were unexpectedly present in the existing baseline.',
  };
}

function buildBaselineDetailAvailability(rows = []) {
  const total = rows.length;
  const withNames = rows.filter((row) => row.source_product_name_raw || row.product_name_raw).length;
  const withCategories = rows.filter((row) => row.category_code || row.canonical_category_code).length;
  const withChains = rows.filter((row) => row.chain_id || row.chain_name || row.retailer || row.source_chain_name_normalized).length;
  const withStores = rows.filter((row) => row.store_id || row.store_name || row.locality_code).length;
  return {
    total_rows: total,
    rows_with_product_name: withNames,
    rows_with_category: withCategories,
    rows_with_chain_or_retailer: withChains,
    rows_with_store_or_locality: withStores,
    compact_baseline_likely: total > 0 && withNames === 0 && withCategories === 0 && withChains === 0,
  };
}

function explainCanonicalMappingChange({ row, nextOffer, existing }) {
  const reasons = row.change_reasons || [];
  const metadataChanged = reasons.some((reason) => reason.startsWith('metadata.'));
  const canonicalChanged = reasons.includes('canonical.canonical_product_id');
  const hasName = Boolean(nextOffer.source_product_name_raw || existing.source_product_name_raw);
  if (canonicalChanged && metadataChanged) {
    return 'Same source_product_id now points to a different canonical_product_id and at least one source metadata field also changed. This can indicate canonicalization/parser differences, source metadata normalization differences, or changed input-row evidence.';
  }
  if (canonicalChanged && hasName) {
    return 'Same source_product_id now points to a different canonical_product_id while product evidence is available for review.';
  }
  if (canonicalChanged) {
    return 'Same source_product_id now points to a different canonical_product_id. The compact baseline lacks enough old product evidence to attribute the cause.';
  }
  return 'Fingerprint changed for this source_product_id, but canonical change reason was not explicit.';
}

function topValues(rows, selector, limit = 10) {
  const counts = new Map();
  for (const row of rows || []) {
    const value = selector(row) || 'unknown';
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, limit);
}

function buildSourceProductSample(row = {}) {
  return {
    source_product_id: row.source_product_id || null,
    offer_id: row.offer_id || null,
    source_product_name_raw: offerName(row) || null,
    canonical_product_id: row.canonical_product_id || null,
    chain_or_retailer: chainOrRetailerLabel(row),
    store_id: row.store_id || null,
    store_name: row.store_name || null,
    locality_code: row.locality_code || null,
    category_code: categoryLabel(row),
    current_price: row.current_price ?? row.price ?? null,
    snapshot_date: row.snapshot_date || null,
  };
}

function summarizeDetailFields(rows = []) {
  return {
    rows_with_product_name: rows.filter((row) => offerName(row)).length,
    rows_with_category: rows.filter((row) => row.category_code || row.canonical_category_code).length,
    rows_with_chain_or_retailer: rows.filter((row) => chainOrRetailerLabel(row) !== 'unknown').length,
  };
}

function offerName(row = {}) {
  return row.source_product_name_raw ||
    row.source_product_name ||
    row.product_name_raw ||
    row.source_name ||
    null;
}

function chainOrRetailerLabel(row = {}) {
  return row.chain_name ||
    row.retailer ||
    row.chain_id ||
    row.source_chain_name_normalized ||
    row.source_name ||
    'unknown';
}

function categoryLabel(row = {}) {
  return row.category_code || row.canonical_category_code || 'unknown';
}

function normalizeTextForChurn(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function isBillaOffer(row = {}) {
  return isBillaLabel(chainOrRetailerLabel(row)) ||
    isBillaLabel(row.chain_id) ||
    isBillaLabel(row.source_chain_name_normalized) ||
    isBillaLabel(row.source_file_stem) ||
    isBillaLabel(row.source_file_name_raw);
}

function isBillaLabel(value) {
  const normalized = normalizeTextForChurn(value);
  return normalized.includes('billa') || normalized.includes('билла');
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
  baselineProgressEvery,
  logger = console.error,
}) {
  if (baselinePath) {
    const loadedBaseline = await loadExistingFingerprintsFromJson(baselinePath, {
      progressEvery: baselineProgressEvery,
      logger,
    });
    const existingFingerprints = loadedBaseline.rows || loadedBaseline;
    return {
      mode: 'local_baseline_file',
      can_compare: true,
      existing_fingerprints: existingFingerprints,
      existing_fingerprint_count: existingFingerprints.length,
      baseline_load_report: loadedBaseline.report || null,
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

function buildComparisonSummary(comparison = {}) {
  const {
    existing_fingerprints: _existingFingerprints,
    ...summary
  } = comparison;
  return summary;
}

async function loadExistingFingerprintsFromJson(filePath, {
  progressEvery = DEFAULT_PROGRESS_EVERY,
  logger = console.error,
} = {}) {
  const resolvedPath = path.resolve(filePath);
  if (resolvedPath.toLowerCase().endsWith('.jsonl')) {
    return loadExistingFingerprintsFromJsonl(resolvedPath, {
      progressEvery,
      logger,
    });
  }

  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.current_offer_fingerprints)
      ? parsed.current_offer_fingerprints
      : Array.isArray(parsed.current_product_offers)
        ? buildCurrentOfferFingerprints(parsed.current_product_offers)
        : [];
  if (!Array.isArray(rows)) {
    return {
      rows: [],
      report: buildBaselineLoadReport({
        filePath: resolvedPath,
        format: 'json',
        linesRead: null,
        blankLines: null,
        parsedRows: 0,
        loadedRows: 0,
        duplicateSourceProductIds: 0,
        elapsedMs: 0,
      }),
    };
  }
  const deduped = dedupeBaselineRows(rows);
  return {
    rows: deduped.rows,
    report: buildBaselineLoadReport({
      filePath: resolvedPath,
      format: 'json',
      linesRead: null,
      blankLines: null,
      parsedRows: rows.length,
      loadedRows: deduped.rows.length,
      duplicateSourceProductIds: deduped.duplicateSourceProductIds,
      elapsedMs: 0,
    }),
  };
}

async function loadExistingFingerprintsFromJsonl(filePath, {
  progressEvery = DEFAULT_PROGRESS_EVERY,
  logger = console.error,
} = {}) {
  const startedAt = Date.now();
  const rowsBySourceProductId = new Map();
  let linesRead = 0;
  let blankLines = 0;
  let parsedRows = 0;
  let duplicateSourceProductIds = 0;
  const effectiveProgressEvery = Number.isInteger(progressEvery) && progressEvery > 0
    ? progressEvery
    : DEFAULT_PROGRESS_EVERY;
  const stream = fs.createReadStream(filePath, {
    encoding: 'utf8',
  });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  try {
    for await (const rawLine of reader) {
      linesRead += 1;
      const line = String(rawLine || '').trim();
      if (!line) {
        blankLines += 1;
        continue;
      }

      let row;
      try {
        row = JSON.parse(line);
      } catch (error) {
        throw new Error(`Malformed JSONL baseline at ${filePath}:${linesRead}: ${error.message}`);
      }

      parsedRows += 1;
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`Malformed JSONL baseline at ${filePath}:${linesRead}: expected a JSON object.`);
      }
      if (!row.source_product_id) {
        throw new Error(`Malformed JSONL baseline at ${filePath}:${linesRead}: source_product_id is required.`);
      }
      if (rowsBySourceProductId.has(row.source_product_id)) {
        duplicateSourceProductIds += 1;
      }
      rowsBySourceProductId.set(row.source_product_id, row);

      if (parsedRows % effectiveProgressEvery === 0) {
        logBaselineLoadProgress(logger, {
          filePath,
          linesRead,
          loadedRows: rowsBySourceProductId.size,
          elapsedMs: Date.now() - startedAt,
        });
      }
    }
  } finally {
    reader.close();
  }

  const rows = [...rowsBySourceProductId.values()]
    .sort((left, right) => String(left.source_product_id).localeCompare(String(right.source_product_id)));
  const report = buildBaselineLoadReport({
    filePath,
    format: 'jsonl',
    linesRead,
    blankLines,
    parsedRows,
    loadedRows: rows.length,
    duplicateSourceProductIds,
    elapsedMs: Date.now() - startedAt,
  });
  logBaselineLoadProgress(logger, {
    filePath,
    linesRead,
    loadedRows: rows.length,
    elapsedMs: report.elapsed_ms,
    final: true,
    duplicateSourceProductIds,
  });
  return {
    rows,
    report,
  };
}

function dedupeBaselineRows(rows = []) {
  const rowsBySourceProductId = new Map();
  let duplicateSourceProductIds = 0;
  for (const row of rows) {
    if (!row?.source_product_id) {
      continue;
    }
    if (rowsBySourceProductId.has(row.source_product_id)) {
      duplicateSourceProductIds += 1;
    }
    rowsBySourceProductId.set(row.source_product_id, row);
  }
  return {
    rows: [...rowsBySourceProductId.values()]
      .sort((left, right) => String(left.source_product_id).localeCompare(String(right.source_product_id))),
    duplicateSourceProductIds,
  };
}

function buildBaselineLoadReport({
  filePath,
  format,
  linesRead,
  blankLines,
  parsedRows,
  loadedRows,
  duplicateSourceProductIds,
  elapsedMs,
}) {
  return {
    file_path: filePath,
    format,
    lines_read: linesRead,
    blank_lines: blankLines,
    parsed_rows: parsedRows,
    loaded_fingerprints: loadedRows,
    duplicate_source_product_ids: duplicateSourceProductIds,
    duplicate_handling: 'last_row_wins_by_source_product_id',
    elapsed_ms: elapsedMs,
  };
}

function logBaselineLoadProgress(logger, {
  filePath,
  linesRead,
  loadedRows,
  elapsedMs,
  final = false,
  duplicateSourceProductIds = null,
}) {
  if (typeof logger !== 'function') {
    return;
  }
  const payload = {
    event: final ? 'baseline_load_complete' : 'baseline_load_progress',
    file_path: filePath,
    lines_read: linesRead,
    fingerprints_loaded: loadedRows,
    elapsed_ms: elapsedMs,
  };
  if (duplicateSourceProductIds !== null) {
    payload.duplicate_source_product_ids = duplicateSourceProductIds;
  }
  logger(JSON.stringify(payload));
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
    eventPolicy: normalizeIncrementalEventPolicy(env.PRICER_INCREMENTAL_EVENT_POLICY),
    allowHighWriteCatchup: env.PRICER_INCREMENTAL_ALLOW_HIGH_WRITE_CATCHUP === 'true',
    highWriteThreshold: normalizeOptionalPositiveInteger(env.PRICER_INCREMENTAL_HIGH_WRITE_THRESHOLD, 'PRICER_INCREMENTAL_HIGH_WRITE_THRESHOLD') ||
      DEFAULT_INCREMENTAL_HIGH_WRITE_THRESHOLD,
    markMissingUnavailable: env.PRICER_INCREMENTAL_MARK_MISSING_UNAVAILABLE === 'true',
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
  applyIncrementalWriter,
  buildDailyDiffDiagnostics,
  DirectMemoryStore,
  loadExistingFingerprintsFromJson,
  resolveIncrementalDiffOptions,
  runIncrementalSnapshotDiff,
  runIncrementalSnapshotDiffFromEnv,
};
