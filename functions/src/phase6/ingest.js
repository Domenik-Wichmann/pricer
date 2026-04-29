const crypto = require('node:crypto');
const path = require('node:path');

const { SOURCE_HEADERS } = require('../phase1/constants');
const { buildEnrichment, detectNameDrift } = require('../phase1/enrichment');
const { buildRawSnapshotRecord } = require('../phase1/importer');
const { normalizeHeader, parseDelimitedStream } = require('./csv_stream');
const { appendPipelineLog, createPipelineLog } = require('./logging');
const {
  listSnapshotEntries,
  openSnapshotEntryStreamByName,
  parseSnapshotEntryMetadata,
} = require('./kolkostruva_client');
const { buildRetailerLocationsFromState } = require('./store_locations');

const NORMALIZED_SOURCE_HEADERS = Object.freeze({
  localityCode: normalizeHeaderLookup(SOURCE_HEADERS.localityCode),
  storeNameRaw: normalizeHeaderLookup(SOURCE_HEADERS.storeNameRaw),
  productNameRaw: normalizeHeaderLookup(SOURCE_HEADERS.productNameRaw),
  productCode: normalizeHeaderLookup(SOURCE_HEADERS.productCode),
  categoryCode: normalizeHeaderLookup(SOURCE_HEADERS.categoryCode),
  retailPrice: normalizeHeaderLookup(SOURCE_HEADERS.retailPrice),
  promoPrice: normalizeHeaderLookup(SOURCE_HEADERS.promoPrice),
});

const SOURCE_HEADER_ALIASES = Object.freeze({
  localityCode: new Set([
    NORMALIZED_SOURCE_HEADERS.localityCode,
    'населеномясто',
    'населено място',
  ]),
  storeNameRaw: new Set([
    NORMALIZED_SOURCE_HEADERS.storeNameRaw,
    'търговскиобект',
    'търговски обект',
  ]),
  productNameRaw: new Set([
    NORMALIZED_SOURCE_HEADERS.productNameRaw,
    'наименованиенапродукта',
    'наименование на продукта',
    'продукт',
    'име на продукта',
  ]),
  productCode: new Set([
    NORMALIZED_SOURCE_HEADERS.productCode,
    'коднапродукта',
    'код на продукта',
    'код',
  ]),
  categoryCode: new Set([
    NORMALIZED_SOURCE_HEADERS.categoryCode,
    'категория',
  ]),
  retailPrice: new Set([
    NORMALIZED_SOURCE_HEADERS.retailPrice,
    'ценанадребно',
    'цена на дребно',
    'редовна цена',
  ]),
  promoPrice: new Set([
    NORMALIZED_SOURCE_HEADERS.promoPrice,
    'ценавпромоция',
    'цена в промоция',
    'промо цена',
    'промоционална цена',
  ]),
});
const DEDUPE_AUDIT_SAMPLE_LIMIT = 100;
const DEDUPE_AUDIT_NAME_SAMPLE_LIMIT = 5;
const DEDUPE_AUDIT_STORE_SAMPLE_LIMIT = 5;
const CANONICAL_GROUP_SAMPLE_LIMIT = 100;
const CANONICAL_GROUP_NAME_SAMPLE_LIMIT = 5;
const CANONICAL_GROUP_CHAIN_SAMPLE_LIMIT = 5;
const POTENTIAL_OVER_DEDUPE_NAME_LENGTH_DELTA = 8;
const POTENTIAL_OVER_DEDUPE_OVERLAP_THRESHOLD = 0.6;
const CANONICAL_CONFIDENCE_DETERMINISTIC = 0.9;
const KNOWN_FLAVOR_MARKERS = Object.freeze([
  'vanilla',
  'vanil',
  'vanilla',
  'chocolate',
  'choco',
  'cocoa',
  'strawberry',
  'banana',
  'apple',
  'orange',
  'peach',
  'berry',
  'fruit',
  'mint',
  'herbal',
  'lavender',
  'rose',
  'watermelon',
  'cola',
  'лимон',
  'ягода',
  'банан',
  'ванилия',
  'шоколад',
  'какао',
  'праскова',
  'портокал',
  'ябълка',
  'мента',
  'билк',
  'лаванд',
  'роза',
  'диня',
  'кола',
  'плод',
]);
const KNOWN_COLOR_MARKERS = Object.freeze([
  'blue',
  'pink',
  'green',
  'red',
  'black',
  'white',
  'yellow',
  'orange',
  'purple',
  'violet',
  'turquoise',
  'gray',
  'grey',
  'silver',
  'gold',
  'син',
  'синя',
  'синьо',
  'розов',
  'розова',
  'розово',
  'зелен',
  'зелена',
  'зелено',
  'червен',
  'червена',
  'червено',
  'черен',
  'черна',
  'черно',
  'бял',
  'бяла',
  'бяло',
  'жълт',
  'жълта',
  'жълто',
  'оранжев',
  'оранжева',
  'лилав',
  'лилава',
  'лилаво',
  'тюркоаз',
  'сив',
  'сива',
  'сиво',
  'сребрист',
  'златист',
]);

async function importDailySnapshotZip({
  store,
  zipFilePath,
  snapshotDate,
  ingestedAt = new Date().toISOString(),
  sourceUrl = null,
  canonicalEnrichmentClient = null,
  enableLlmEnrichment = undefined,
  enrichmentFetchImpl = fetch,
  enrichmentApiKey = process.env.XAI_API_KEY,
  enrichmentEndpoint = null,
  enrichmentModelName = null,
  enrichmentPromptVersion = null,
}) {
  const entryNames = await listSnapshotEntries({
    zipFilePath,
  });

  if (entryNames.length === 0) {
    throw new Error('no supported data file found inside snapshot zip');
  }

  const state = await store.load();
  const ingestState = createIngestState(state);
  const processedFiles = [];
  const archiveSourceName = path.basename(zipFilePath);
  const archiveSourceMetadata = parseSnapshotEntryMetadata(archiveSourceName);

  for (const entryName of entryNames) {
    const { stream } = await openSnapshotEntryStreamByName({
      zipFilePath,
      entryName,
    });

    const fileResult = await processDailySnapshotCsvStream({
      ingestState,
      csvStream: stream,
      snapshotDate,
      sourceFileName: entryName,
      ingestedAt,
      delimiter: null,
    });
    processedFiles.push(fileResult);
  }

  const result = await finalizeIngestState({
    state,
    ingestState,
    snapshotDate,
    ingestedAt,
    sourceFileName: archiveSourceName,
    sourceFileMetadata: archiveSourceMetadata,
    sourceUrl,
    processedFiles,
    canonicalEnrichmentClient,
    enableLlmEnrichment,
    enrichmentFetchImpl,
    enrichmentApiKey,
    enrichmentEndpoint,
    enrichmentModelName,
    enrichmentPromptVersion,
  });

  await store.save(state);
  return result;
}

async function importDailySnapshotCsvStream({
  store,
  csvStream,
  snapshotDate,
  sourceFileName,
  sourceUrl = null,
  ingestedAt = new Date().toISOString(),
  delimiter = null,
  canonicalEnrichmentClient = null,
  enableLlmEnrichment = undefined,
  enrichmentFetchImpl = fetch,
  enrichmentApiKey = process.env.XAI_API_KEY,
  enrichmentEndpoint = null,
  enrichmentModelName = null,
  enrichmentPromptVersion = null,
}) {
  const state = await store.load();
  const ingestState = createIngestState(state);
  const sourceFileMetadata = parseSnapshotEntryMetadata(sourceFileName);
  const fileResult = await processDailySnapshotCsvStream({
    ingestState,
    csvStream,
    snapshotDate,
    sourceFileName,
    sourceFileMetadata,
    ingestedAt,
    delimiter,
  });
  const result = await finalizeIngestState({
    state,
    ingestState,
    snapshotDate,
    sourceFileName,
    sourceFileMetadata,
    sourceUrl,
    ingestedAt,
    processedFiles: [fileResult],
    canonicalEnrichmentClient,
    enableLlmEnrichment,
    enrichmentFetchImpl,
    enrichmentApiKey,
    enrichmentEndpoint,
    enrichmentModelName,
    enrichmentPromptVersion,
  });

  await store.save(state);
  return result;
}

function buildIngestRun({
  snapshotDate,
  sourceFileName,
  sourceFileMetadata = {},
  sourceUrl,
  sourceFileCount,
  importedRows,
  uniqueRows,
  duplicateRows,
  malformedRows,
  createdProducts,
  updatedProducts,
  enrichmentRuns,
  dedupeBucketCount,
  enrichmentReuseCount,
  dedupeAuditSample,
  canonicalProductCount,
  canonicalMergeCount,
  canonicalSingletonCount,
  canonicalGroupSample,
  canonicalWarningCount,
  canonicalDisambiguationQueueCount = 0,
  canonicalDisambiguationPendingCount = 0,
  canonicalDisambiguationReusedDecisionCount = 0,
  canonicalEnrichmentCount = 0,
  canonicalEnrichmentCoverageCount = 0,
  canonicalEnrichmentCreatedCount = 0,
  canonicalEnrichmentReusedCount = 0,
  canonicalEnrichmentModelCallCount = 0,
  canonicalEnrichmentRejectedCount = 0,
  canonicalEnrichmentOfflineMissingCount = 0,
  canonicalEnrichmentSample = [],
  disambiguationApplicationPreview = null,
  ingestedAt,
}) {
  return {
    ingest_run_id: crypto
      .createHash('sha256')
      .update(`${snapshotDate}|${sourceFileName}|${ingestedAt}`)
      .digest('hex'),
    snapshot_date: snapshotDate,
    source_file_name: sourceFileName,
    source_url: sourceUrl,
    source_file_count: sourceFileCount,
    ...sourceFileMetadata,
    imported_rows: importedRows,
    unique_rows: uniqueRows,
    duplicate_rows: duplicateRows,
    malformed_rows: malformedRows,
    created_products: createdProducts,
    updated_products: updatedProducts,
    enrichment_runs: enrichmentRuns,
    dedupe_bucket_count: dedupeBucketCount,
    enrichment_reuse_count: enrichmentReuseCount,
    dedupe_audit_sample: dedupeAuditSample,
    canonical_product_count: canonicalProductCount,
    canonical_merge_count: canonicalMergeCount,
    canonical_singleton_count: canonicalSingletonCount,
    canonical_group_sample: canonicalGroupSample,
    canonical_warning_count: canonicalWarningCount,
    canonical_disambiguation_queue_count: canonicalDisambiguationQueueCount,
    canonical_disambiguation_pending_count: canonicalDisambiguationPendingCount,
    canonical_disambiguation_reused_decision_count: canonicalDisambiguationReusedDecisionCount,
    canonical_enrichment_count: canonicalEnrichmentCount,
    canonical_enrichment_coverage_count: canonicalEnrichmentCoverageCount,
    canonical_enrichment_created_count: canonicalEnrichmentCreatedCount,
    canonical_enrichment_reused_count: canonicalEnrichmentReusedCount,
    canonical_enrichment_model_call_count: canonicalEnrichmentModelCallCount,
    canonical_enrichment_rejected_count: canonicalEnrichmentRejectedCount,
    canonical_enrichment_offline_missing_count: canonicalEnrichmentOfflineMissingCount,
    canonical_enrichment_sample: canonicalEnrichmentSample,
    disambiguation_application_preview: disambiguationApplicationPreview,
    status: 'completed',
    ingested_at: ingestedAt,
  };
}

function buildSourceProductRecord(snapshotRecord, ingestedAt) {
  return {
    source_product_id: snapshotRecord.source_product_id,
    locality_code: snapshotRecord.locality_code,
    store_name_raw: snapshotRecord.store_name_raw,
    product_code: snapshotRecord.product_code,
    category_code: snapshotRecord.category_code,
    latest_product_name_raw: snapshotRecord.product_name_raw,
    first_seen_date: snapshotRecord.snapshot_date,
    last_seen_date: snapshotRecord.snapshot_date,
    is_active: true,
    needs_revalidation: false,
    latest_snapshot_id: snapshotRecord.snapshot_id,
    drift_level: 'none',
    source_file_name_raw: snapshotRecord.source_file_name_raw,
    source_file_stem: snapshotRecord.source_file_stem,
    source_chain_name_raw: snapshotRecord.source_chain_name_raw,
    source_chain_name_normalized: snapshotRecord.source_chain_name_normalized,
    source_file_numeric_id: snapshotRecord.source_file_numeric_id,
    created_at: ingestedAt,
    updated_at: ingestedAt,
    last_enriched_at: ingestedAt,
  };
}

function createIngestState(state) {
  return {
    state,
    snapshotIndex: new Map((state.raw_price_snapshots || []).map((row) => [row.snapshot_id, row])),
    productIndex: new Map((state.source_products || []).map((row) => [row.source_product_id, row])),
    enrichmentIndex: new Map((state.source_product_enrichment || []).map((row) => [row.source_product_id, row])),
    dedupedRows: new Map(),
    enrichmentBuckets: new Map(),
    potentialOverDedupeWarnings: [],
    seenToday: new Set(),
  };
}

async function processDailySnapshotCsvStream({
  ingestState,
  csvStream,
  snapshotDate,
  sourceFileName,
  sourceFileMetadata = parseSnapshotEntryMetadata(sourceFileName),
  ingestedAt,
  delimiter = null,
}) {
  let importedRows = 0;
  let duplicateRows = 0;
  let malformedRows = 0;
  let ingestDiagnostics = null;

  for await (const row of parseDelimitedStream(csvStream, {
    delimiter,
    onDiagnostics: (diagnostics) => {
      ingestDiagnostics = diagnostics;
    },
  })) {
    importedRows += 1;

    const sourceRow = mapCsvRecordToSourceRow(row.record);
    if (!isImportableSourceRow(sourceRow)) {
      malformedRows += 1;
      appendPipelineLog(ingestState.state, createPipelineLog({
        level: 'warn',
        event_type: 'ingest_malformed_row',
        message: 'Skipped malformed source row during streamed ingest.',
        context: {
          snapshot_date: snapshotDate,
          row_number: row.row_number,
          source_file_name: sourceFileName,
          ...sourceFileMetadata,
        },
        logged_at: ingestedAt,
      }));
      continue;
    }

    const snapshotRecord = buildRawSnapshotRecord({
      sourceRow,
      snapshotDate,
      sourceFileName,
      rowNumber: row.row_number,
      ingestedAt,
    });
    Object.assign(snapshotRecord, sourceFileMetadata);

    const dedupeKey = snapshotRecord.source_product_id;
    if (ingestState.dedupedRows.has(dedupeKey)) {
      duplicateRows += 1;
    }
    ingestState.dedupedRows.set(dedupeKey, snapshotRecord);
    updateEnrichmentBucket(ingestState, snapshotRecord);
  }

  if (ingestDiagnostics) {
    appendPipelineLog(ingestState.state, createPipelineLog({
      level: 'info',
      event_type: 'ingest_csv_diagnostics',
      message: 'Captured streamed source CSV diagnostics.',
      context: {
        snapshot_date: snapshotDate,
        source_file_name: sourceFileName,
        raw_header_line: ingestDiagnostics.raw_header_line,
        detected_delimiter: ingestDiagnostics.detected_delimiter,
        parsed_headers: ingestDiagnostics.parsed_headers,
        first_rows: ingestDiagnostics.first_rows,
        ...sourceFileMetadata,
      },
      logged_at: ingestedAt,
    }));
  }

  const fileResult = {
    source_file_name: sourceFileName,
    ...sourceFileMetadata,
    imported_rows: importedRows,
    duplicate_rows: duplicateRows,
    malformed_rows: malformedRows,
  };

  appendPipelineLog(ingestState.state, createPipelineLog({
    level: 'info',
    event_type: 'ingest_file_processed',
    message: 'Completed streamed ingest for one CSV file inside the daily archive.',
    context: {
      snapshot_date: snapshotDate,
      source_file_name: sourceFileName,
      imported_rows: importedRows,
      duplicate_rows: duplicateRows,
      malformed_rows: malformedRows,
      ...sourceFileMetadata,
    },
    logged_at: ingestedAt,
  }));

  return fileResult;
}

async function finalizeIngestState({
  state,
  ingestState,
  snapshotDate,
  sourceFileName,
  sourceFileMetadata = {},
  sourceUrl,
  ingestedAt,
  processedFiles,
  canonicalEnrichmentClient = null,
  enableLlmEnrichment = undefined,
  enrichmentFetchImpl = fetch,
  enrichmentApiKey = process.env.XAI_API_KEY,
  enrichmentEndpoint = null,
  enrichmentModelName = null,
  enrichmentPromptVersion = null,
}) {
  let createdProducts = 0;
  let updatedProducts = 0;
  let potentialEnrichmentRuns = 0;

  for (const snapshotRecord of ingestState.dedupedRows.values()) {
    ingestState.snapshotIndex.set(snapshotRecord.snapshot_id, snapshotRecord);
    ingestState.seenToday.add(snapshotRecord.source_product_id);
    const enrichmentBucket = getEnrichmentBucket(ingestState, snapshotRecord);

    const existingProduct = ingestState.productIndex.get(snapshotRecord.source_product_id);
    if (!existingProduct) {
      const sourceProduct = buildSourceProductRecord(snapshotRecord, ingestedAt);
      ingestState.productIndex.set(sourceProduct.source_product_id, sourceProduct);
      createdProducts += 1;
      potentialEnrichmentRuns += 1;

      ingestState.enrichmentIndex.set(
        sourceProduct.source_product_id,
        buildSourceProductEnrichmentFromBucket({
          sourceProduct,
          ingestedAt,
          enrichmentBucket,
          existingEnrichment: null,
        })
      );
      continue;
    }

    const drift = detectNameDrift(existingProduct.latest_product_name_raw, snapshotRecord.product_name_raw);
    const nextProduct = {
      ...existingProduct,
      latest_product_name_raw: snapshotRecord.product_name_raw,
      latest_snapshot_id: snapshotRecord.snapshot_id,
      last_seen_date: snapshotDate,
      is_active: true,
      needs_revalidation: existingProduct.needs_revalidation || drift.needsRevalidation,
      updated_at: ingestedAt,
      drift_level: drift.driftLevel === 'none' ? existingProduct.drift_level : drift.driftLevel,
      source_file_name_raw: snapshotRecord.source_file_name_raw,
      source_file_stem: snapshotRecord.source_file_stem,
      source_chain_name_raw: snapshotRecord.source_chain_name_raw,
      source_chain_name_normalized: snapshotRecord.source_chain_name_normalized,
      source_file_numeric_id: snapshotRecord.source_file_numeric_id,
    };
    ingestState.productIndex.set(nextProduct.source_product_id, nextProduct);
    updatedProducts += 1;

    const shouldReenrich = !ingestState.enrichmentIndex.has(nextProduct.source_product_id) || nextProduct.needs_revalidation;
    if (shouldReenrich) {
      potentialEnrichmentRuns += 1;
      ingestState.enrichmentIndex.set(
        nextProduct.source_product_id,
        buildSourceProductEnrichmentFromBucket({
          sourceProduct: nextProduct,
          ingestedAt,
          enrichmentBucket,
          existingEnrichment: ingestState.enrichmentIndex.get(nextProduct.source_product_id) || null,
        })
      );
      nextProduct.needs_revalidation = false;
      nextProduct.last_enriched_at = ingestedAt;
      nextProduct.updated_at = ingestedAt;
      ingestState.productIndex.set(nextProduct.source_product_id, nextProduct);
    }
  }

  for (const sourceProduct of ingestState.productIndex.values()) {
    if (sourceProduct.last_seen_date !== snapshotDate) {
      sourceProduct.is_active = false;
      sourceProduct.updated_at = ingestedAt;
    }
  }

  state.raw_price_snapshots = sortByKey([...ingestState.snapshotIndex.values()], 'snapshot_id');
  state.source_products = sortByKey([...ingestState.productIndex.values()], 'source_product_id');
  state.source_product_enrichment = sortByKey([...ingestState.enrichmentIndex.values()], 'source_product_id');
  state.retailer_locations = buildRetailerLocationsFromState({
    state,
    extractedAt: ingestedAt,
  });
  const canonicalization = buildCanonicalizationState({
    sourceProducts: state.source_products,
    enrichmentIndex: ingestState.enrichmentIndex,
    mappedAt: ingestedAt,
  });
  state.canonical_products = sortByKey(canonicalization.canonicalProducts, 'canonical_product_id');
  state.canonical_product_mappings = sortByKey(canonicalization.canonicalMappings, 'source_product_id');
  const { syncCanonicalEnrichmentArtifacts } = require('../phase15/enrichment');
  const enrichmentMetrics = await syncCanonicalEnrichmentArtifacts({
    state,
    canonicalProducts: state.canonical_products,
    mappedAt: ingestedAt,
    canonicalEnrichmentClient,
    enableNetwork: enableLlmEnrichment,
    fetchImpl: enrichmentFetchImpl,
    apiKey: enrichmentApiKey,
    endpoint: enrichmentEndpoint || undefined,
    modelName: enrichmentModelName || undefined,
    promptVersion: enrichmentPromptVersion || undefined,
  });
  const disambiguationMetrics = syncCanonicalDisambiguationArtifacts({
    state,
    canonicalWarnings: canonicalization.canonicalWarnings,
    mappedAt: ingestedAt,
  });
  const disambiguationApplicationPreview = buildDisambiguationApplicationPreview({
    state,
    canonicalProducts: state.canonical_products,
  });
  state.ingest_runs = state.ingest_runs || [];

  const importedRows = processedFiles.reduce((sum, file) => sum + file.imported_rows, 0);
  const duplicateRows = processedFiles.reduce((sum, file) => sum + file.duplicate_rows, 0);
  const malformedRows = processedFiles.reduce((sum, file) => sum + file.malformed_rows, 0);
  const dedupeBucketCount = ingestState.enrichmentBuckets.size;
  const enrichmentRuns = [...ingestState.enrichmentBuckets.values()].reduce(
    (sum, bucket) => sum + bucket.enrichment_runs,
    0
  );
  const enrichmentReuseCount = Math.max(0, potentialEnrichmentRuns - enrichmentRuns);
  const dedupeAuditSample = buildDedupeAuditSample(ingestState);

  const run = buildIngestRun({
    snapshotDate,
    sourceFileName,
    sourceFileMetadata,
    sourceUrl,
    sourceFileCount: processedFiles.length,
    importedRows,
    uniqueRows: ingestState.dedupedRows.size,
    duplicateRows,
    malformedRows,
    createdProducts,
    updatedProducts,
    enrichmentRuns,
    dedupeBucketCount,
    enrichmentReuseCount,
    dedupeAuditSample,
    canonicalProductCount: canonicalization.canonicalProductCount,
    canonicalMergeCount: canonicalization.canonicalMergeCount,
    canonicalSingletonCount: canonicalization.canonicalSingletonCount,
    canonicalGroupSample: canonicalization.canonicalGroupSample,
    canonicalWarningCount: canonicalization.canonicalWarnings.length,
    canonicalDisambiguationQueueCount: disambiguationMetrics.canonicalDisambiguationQueueCount,
    canonicalDisambiguationPendingCount: disambiguationMetrics.canonicalDisambiguationPendingCount,
    canonicalDisambiguationReusedDecisionCount: disambiguationMetrics.canonicalDisambiguationReusedDecisionCount,
    canonicalEnrichmentCount: enrichmentMetrics.total_count,
    canonicalEnrichmentCoverageCount: enrichmentMetrics.coverage_count,
    canonicalEnrichmentCreatedCount: enrichmentMetrics.created_count,
    canonicalEnrichmentReusedCount: enrichmentMetrics.reused_count,
    canonicalEnrichmentModelCallCount: enrichmentMetrics.model_call_count,
    canonicalEnrichmentRejectedCount: enrichmentMetrics.rejected_count,
    canonicalEnrichmentOfflineMissingCount: enrichmentMetrics.offline_missing_count,
    canonicalEnrichmentSample: enrichmentMetrics.sample,
    disambiguationApplicationPreview,
    ingestedAt,
  });
  state.ingest_runs.push(run);
  canonicalization.canonicalWarnings.forEach((warning) => {
    appendPipelineLog(state, createPipelineLog({
      level: 'warn',
      event_type: warning.warning,
      message: 'Canonical cross-chain grouping may be overly aggressive for one deterministic group.',
      context: warning,
      logged_at: ingestedAt,
    }));
  });
  appendPipelineLog(state, createPipelineLog({
    level: 'info',
    event_type: 'ingest_completed',
    message: 'Streamed daily ingest completed.',
    context: {
      snapshot_date: snapshotDate,
      imported_rows: importedRows,
      unique_rows: ingestState.dedupedRows.size,
      duplicate_rows: duplicateRows,
      malformed_rows: malformedRows,
      created_products: createdProducts,
      updated_products: updatedProducts,
      enrichment_runs: enrichmentRuns,
      dedupe_bucket_count: dedupeBucketCount,
      enrichment_reuse_count: enrichmentReuseCount,
      estimated_enrichment_runs_without_dedupe: potentialEnrichmentRuns,
      dedupe_audit_sample: dedupeAuditSample,
      potential_over_dedupe_warning_count: ingestState.potentialOverDedupeWarnings.length,
      canonical_product_count: canonicalization.canonicalProductCount,
      canonical_merge_count: canonicalization.canonicalMergeCount,
      canonical_singleton_count: canonicalization.canonicalSingletonCount,
      canonical_group_sample: canonicalization.canonicalGroupSample,
      canonical_warning_count: canonicalization.canonicalWarnings.length,
      canonical_disambiguation_queue_count: disambiguationMetrics.canonicalDisambiguationQueueCount,
      canonical_disambiguation_pending_count: disambiguationMetrics.canonicalDisambiguationPendingCount,
      canonical_disambiguation_reused_decision_count: disambiguationMetrics.canonicalDisambiguationReusedDecisionCount,
      canonical_enrichment_count: enrichmentMetrics.total_count,
      canonical_enrichment_coverage_count: enrichmentMetrics.coverage_count,
      canonical_enrichment_created_count: enrichmentMetrics.created_count,
      canonical_enrichment_reused_count: enrichmentMetrics.reused_count,
      canonical_enrichment_model_call_count: enrichmentMetrics.model_call_count,
      canonical_enrichment_rejected_count: enrichmentMetrics.rejected_count,
      canonical_enrichment_offline_missing_count: enrichmentMetrics.offline_missing_count,
      canonical_enrichment_sample: enrichmentMetrics.sample,
      canonical_enrichment_errors: enrichmentMetrics.errors,
      disambiguation_application_preview: disambiguationApplicationPreview,
      source_file_name: sourceFileName,
      source_file_count: processedFiles.length,
      ...sourceFileMetadata,
      processed_files: processedFiles,
    },
    logged_at: ingestedAt,
  }));

  return {
    imported_rows: importedRows,
    unique_rows: ingestState.dedupedRows.size,
    duplicate_rows: duplicateRows,
    malformed_rows: malformedRows,
    created_products: createdProducts,
    updated_products: updatedProducts,
    enrichment_runs: enrichmentRuns,
    dedupe_bucket_count: dedupeBucketCount,
    enrichment_reuse_count: enrichmentReuseCount,
    dedupe_audit_sample: dedupeAuditSample,
    canonical_product_count: canonicalization.canonicalProductCount,
    canonical_merge_count: canonicalization.canonicalMergeCount,
    canonical_singleton_count: canonicalization.canonicalSingletonCount,
    canonical_group_sample: canonicalization.canonicalGroupSample,
    canonical_warning_count: canonicalization.canonicalWarnings.length,
    canonical_disambiguation_queue_count: disambiguationMetrics.canonicalDisambiguationQueueCount,
    canonical_disambiguation_pending_count: disambiguationMetrics.canonicalDisambiguationPendingCount,
    canonical_disambiguation_reused_decision_count: disambiguationMetrics.canonicalDisambiguationReusedDecisionCount,
    canonical_enrichment_count: enrichmentMetrics.total_count,
    canonical_enrichment_coverage_count: enrichmentMetrics.coverage_count,
    canonical_enrichment_created_count: enrichmentMetrics.created_count,
    canonical_enrichment_reused_count: enrichmentMetrics.reused_count,
    canonical_enrichment_model_call_count: enrichmentMetrics.model_call_count,
    canonical_enrichment_rejected_count: enrichmentMetrics.rejected_count,
    canonical_enrichment_offline_missing_count: enrichmentMetrics.offline_missing_count,
    canonical_enrichment_sample: enrichmentMetrics.sample,
    canonical_enrichment_errors: enrichmentMetrics.errors,
    disambiguation_application_preview: disambiguationApplicationPreview,
    seen_today: ingestState.seenToday.size,
    processed_files: processedFiles,
    ingest_run: run,
    state,
  };
}

function buildDisambiguationApplicationPreview({
  state,
  canonicalProducts,
}) {
  const {
    applyEffectiveCanonicalDecisions,
    getEffectiveCanonicalDisambiguationDecision,
  } = require('./disambiguation');

  return applyEffectiveCanonicalDecisions({
    canonicalProducts,
    canonicalDisambiguationQueue: state.canonical_disambiguation_queue || [],
    getEffectiveDecision: (pairFingerprint) => getEffectiveCanonicalDisambiguationDecision({
      state,
      pairFingerprint,
    }),
    dryRun: true,
    apply: false,
  });
}

function buildSourceProductEnrichmentFromBucket({
  sourceProduct,
  ingestedAt,
  enrichmentBucket,
  existingEnrichment = null,
}) {
  const bucketEnrichment = ensureBucketEnrichment({
    enrichmentBucket,
    ingestedAt,
    existingEnrichment,
  });

  return {
    source_product_id: sourceProduct.source_product_id,
    enriched_at: ingestedAt,
    ...bucketEnrichment,
  };
}

function ensureBucketEnrichment({
  enrichmentBucket,
  ingestedAt,
  existingEnrichment = null,
}) {
  if (!enrichmentBucket.enrichment_template) {
    enrichmentBucket.enrichment_template = buildBucketEnrichmentTemplate({
      enrichmentBucket,
      ingestedAt,
      existingEnrichment,
    });
    enrichmentBucket.enrichment_runs += 1;
  }

  return {
    ...enrichmentBucket.enrichment_template,
  };
}

function buildBucketEnrichmentTemplate({
  enrichmentBucket,
  ingestedAt,
  existingEnrichment = null,
}) {
  return {
    enriched_at: ingestedAt,
    enrichment_version: 'phase1.5-deterministic-v1',
    based_on_product_name_raw: enrichmentBucket.representative_product_name_raw,
    ...buildEnrichment({
      productNameRaw: enrichmentBucket.representative_product_name_raw,
      categoryCode: enrichmentBucket.category_code,
      existingEnrichment,
    }),
  };
}

function updateEnrichmentBucket(ingestState, snapshotRecord) {
  const dedupeKey = computeEnrichmentDedupeKey(snapshotRecord);
  const existingBucket = ingestState.enrichmentBuckets.get(dedupeKey);
  if (!existingBucket) {
    ingestState.enrichmentBuckets.set(dedupeKey, {
      dedupe_key: dedupeKey,
      source_chain_name_normalized: snapshotRecord.source_chain_name_normalized,
      source_chain_name_raw: snapshotRecord.source_chain_name_raw,
      product_code: snapshotRecord.product_code,
      category_code: snapshotRecord.category_code,
      representative_product_name_raw: snapshotRecord.product_name_raw,
      representative_source_product_id: snapshotRecord.source_product_id,
      representative_source_file_name_raw: snapshotRecord.source_file_name_raw,
      sample_retail_price_raw: snapshotRecord.retail_price_raw,
      row_count: 1,
      enrichment_runs: 0,
      enrichment_template: null,
      sample_names: createLimitedSet(DEDUPE_AUDIT_NAME_SAMPLE_LIMIT),
      sample_stores: createLimitedSet(DEDUPE_AUDIT_STORE_SAMPLE_LIMIT),
      warned_potential_over_dedupe: false,
      used_fallback_key:
        !snapshotRecord.source_chain_name_normalized || !snapshotRecord.product_code,
    });
    const createdBucket = ingestState.enrichmentBuckets.get(dedupeKey);
    trackBucketSample(createdBucket, snapshotRecord);
    return;
  }

  existingBucket.row_count += 1;
  if (!existingBucket.representative_product_name_raw && snapshotRecord.product_name_raw) {
    existingBucket.representative_product_name_raw = snapshotRecord.product_name_raw;
  }
  if (!existingBucket.category_code && snapshotRecord.category_code) {
    existingBucket.category_code = snapshotRecord.category_code;
  }
  maybeLogPotentialOverDedupe(ingestState, existingBucket, snapshotRecord);
  trackBucketSample(existingBucket, snapshotRecord);
}

function getEnrichmentBucket(ingestState, snapshotRecord) {
  const dedupeKey = computeEnrichmentDedupeKey(snapshotRecord);
  const bucket = ingestState.enrichmentBuckets.get(dedupeKey);
  if (bucket) {
    return bucket;
  }

  updateEnrichmentBucket(ingestState, snapshotRecord);
  return ingestState.enrichmentBuckets.get(dedupeKey);
}

function computeEnrichmentDedupeKey(snapshotRecord) {
  if (snapshotRecord.source_chain_name_normalized && snapshotRecord.product_code) {
    return `${snapshotRecord.source_chain_name_normalized}::${snapshotRecord.product_code}`;
  }

  return `fallback::${snapshotRecord.source_product_id}`;
}

function buildCanonicalizationState({
  sourceProducts,
  enrichmentIndex,
  mappedAt,
}) {
  const chainBuckets = buildChainBucketRepresentatives({
    sourceProducts,
    enrichmentIndex,
  });
  const canonicalGroups = new Map();
  const canonicalProducts = [];
  const canonicalMappings = [];
  const canonicalWarnings = [];

  for (const bucket of chainBuckets) {
    const canonicalKey = buildCanonicalProductKey(bucket);
    let group = canonicalGroups.get(canonicalKey);
    if (!group) {
      group = createCanonicalGroup({
        canonicalKey,
        bucket,
        mappedAt,
      });
      canonicalGroups.set(canonicalKey, group);
      canonicalProducts.push(group.canonical_product);
    } else {
      mergeCanonicalGroupBucket(group, bucket, mappedAt);
    }

    maybeRecordCanonicalWarning(group, bucket, canonicalWarnings, mappedAt);

    bucket.source_product_ids.forEach((sourceProductId) => {
      canonicalMappings.push({
        source_product_id: sourceProductId,
        dedupe_key: bucket.dedupe_key,
        canonical_product_id: group.canonical_product.canonical_product_id,
        mapping_confidence: CANONICAL_CONFIDENCE_DETERMINISTIC,
        mapping_method: 'deterministic',
        mapped_at: mappedAt,
      });
    });
  }

  const canonicalGroupSample = canonicalProducts
    .map((product) => canonicalGroups.get(product.canonical_product_key))
    .slice(0, CANONICAL_GROUP_SAMPLE_LIMIT)
    .map((group) => ({
      canonical_product_id: group.canonical_product.canonical_product_id,
      canonical_product_key: group.canonical_product.canonical_product_key,
      source_product_count: group.source_product_count,
      sample_names: [...group.sample_names.values].slice(0, CANONICAL_GROUP_NAME_SAMPLE_LIMIT),
      sample_chains: [...group.sample_chains.values].slice(0, CANONICAL_GROUP_CHAIN_SAMPLE_LIMIT),
    }));

  return {
    canonicalProducts,
    canonicalMappings,
    canonicalWarnings,
    canonicalDisambiguationQueueCount: 0,
    canonicalDisambiguationPendingCount: 0,
    canonicalDisambiguationReusedDecisionCount: 0,
    canonicalProductCount: canonicalProducts.length,
    canonicalMergeCount: canonicalProducts.reduce(
      (sum, product) => sum + Math.max(0, product.source_product_count - 1),
      0
    ),
    canonicalSingletonCount: canonicalProducts.filter((product) => product.source_product_count === 1).length,
    canonicalGroupSample,
  };
}

function buildChainBucketRepresentatives({
  sourceProducts,
  enrichmentIndex,
}) {
  const bucketMap = new Map();

  sourceProducts.forEach((sourceProduct) => {
    const enrichment = enrichmentIndex.get(sourceProduct.source_product_id);
    if (!enrichment) {
      return;
    }

    const dedupeKey = computeSourceProductDedupeKey(sourceProduct);
    let bucket = bucketMap.get(dedupeKey);
    if (!bucket) {
      bucket = {
        dedupe_key: dedupeKey,
        source_product_ids: [],
        source_chain_name_normalized: sourceProduct.source_chain_name_normalized,
        source_chain_name_raw: sourceProduct.source_chain_name_raw,
        product_code: sourceProduct.product_code,
        category_code: sourceProduct.category_code,
        representative_product_name_raw: sourceProduct.latest_product_name_raw,
        representative_source_product_id: sourceProduct.source_product_id,
        brand_guess: enrichment.brand_guess || null,
        product_type_guess: enrichment.product_type_guess || null,
        size_value: enrichment.size_value ?? null,
        size_unit: enrichment.size_unit || null,
        fat_percent: enrichment.fat_percent ?? null,
        normalized_name: enrichment.normalized_name || '',
        tokens: Array.isArray(enrichment.tokens) ? enrichment.tokens : [],
        stage_marker: extractStageMarker({
          productNameRaw: sourceProduct.latest_product_name_raw,
          normalizedName: enrichment.normalized_name || '',
        }),
        count_marker: extractCountMarker({
          productNameRaw: sourceProduct.latest_product_name_raw,
          normalizedName: enrichment.normalized_name || '',
        }),
        age_band_marker: extractCanonicalAgeBand({
          productNameRaw: sourceProduct.latest_product_name_raw,
          normalizedName: enrichment.normalized_name || '',
        }),
        reserve_marker: extractReserveMarker({
          productNameRaw: sourceProduct.latest_product_name_raw,
          normalizedName: enrichment.normalized_name || '',
        }),
        year_marker: extractYearMarker({
          productNameRaw: sourceProduct.latest_product_name_raw,
          normalizedName: enrichment.normalized_name || '',
        }),
        age_statement_marker: extractAgeMarker({
          productNameRaw: sourceProduct.latest_product_name_raw,
          normalizedName: enrichment.normalized_name || '',
        }),
        volume_marker: extractVolumeMarker({
          productNameRaw: sourceProduct.latest_product_name_raw,
          normalizedName: enrichment.normalized_name || '',
        }),
        flavor_marker: extractFlavorMarker({
          productNameRaw: sourceProduct.latest_product_name_raw,
          normalizedName: enrichment.normalized_name || '',
        }),
        color_marker: extractColorMarker({
          productNameRaw: sourceProduct.latest_product_name_raw,
          normalizedName: enrichment.normalized_name || '',
        }),
        pack_variant_marker: extractPackVariant({
          productNameRaw: sourceProduct.latest_product_name_raw,
          normalizedName: enrichment.normalized_name || '',
          countMarker: null,
        }),
        range_marker: extractRangeMarker({
          productNameRaw: sourceProduct.latest_product_name_raw,
          normalizedName: enrichment.normalized_name || '',
        }),
        core_tokens: buildCanonicalCoreTokens({
          normalizedName: enrichment.normalized_name || sourceProduct.latest_product_name_raw,
          tokens: Array.isArray(enrichment.tokens) ? enrichment.tokens : [],
          brandGuess: enrichment.brand_guess || null,
          sizeValue: enrichment.size_value ?? null,
          sizeUnit: enrichment.size_unit || null,
          fatPercent: enrichment.fat_percent ?? null,
          countMarker: null,
          ageBandMarker: null,
          ageStatementMarker: null,
          reserveMarker: null,
        }),
      };
      bucket.pack_variant_marker = extractPackVariant({
        productNameRaw: sourceProduct.latest_product_name_raw,
        normalizedName: enrichment.normalized_name || '',
        countMarker: bucket.count_marker,
      });
      bucket.core_tokens = buildCanonicalCoreTokens({
        normalizedName: enrichment.normalized_name || sourceProduct.latest_product_name_raw,
        tokens: Array.isArray(enrichment.tokens) ? enrichment.tokens : [],
        brandGuess: enrichment.brand_guess || null,
        sizeValue: enrichment.size_value ?? null,
        sizeUnit: enrichment.size_unit || null,
        fatPercent: enrichment.fat_percent ?? null,
        countMarker: bucket.count_marker,
        ageBandMarker: bucket.age_band_marker,
        ageStatementMarker: bucket.age_statement_marker,
        reserveMarker: bucket.reserve_marker,
      });
      bucketMap.set(dedupeKey, bucket);
    }

    bucket.source_product_ids.push(sourceProduct.source_product_id);
  });

  return [...bucketMap.values()].sort((left, right) => left.dedupe_key.localeCompare(right.dedupe_key));
}

function buildCanonicalProductKey(bucket) {
  const parts = [
    `category:${bucket.category_code || 'unknown'}`,
    `type:${normalizeCanonicalText(bucket.product_type_guess) || 'unknown'}`,
    `brand:${normalizeCanonicalText(bucket.brand_guess) || 'unknown'}`,
    `size:${formatCanonicalNumber(bucket.size_value) || 'unknown'}:${bucket.size_unit || 'unknown'}`,
    `fat:${formatCanonicalNumber(bucket.fat_percent) || 'unknown'}`,
    `stage:${bucket.stage_marker || 'unknown'}`,
    `count:${bucket.count_marker || 'unknown'}`,
    `age:${bucket.age_band_marker || 'unknown'}`,
    `reserve:${bucket.reserve_marker || 'unknown'}`,
    `year:${bucket.year_marker || 'unknown'}`,
    `age_statement:${bucket.age_statement_marker || 'unknown'}`,
    `volume:${bucket.volume_marker || 'unknown'}`,
    `flavor:${bucket.flavor_marker || 'unknown'}`,
    `color:${bucket.color_marker || 'unknown'}`,
    `pack:${bucket.pack_variant_marker || 'unknown'}`,
    `range:${bucket.range_marker || 'unknown'}`,
    `core:${bucket.core_tokens.join('|') || normalizeCanonicalText(bucket.normalized_name) || 'unknown'}`,
  ];

  return parts.join('::');
}

function createCanonicalGroup({
  canonicalKey,
  bucket,
  mappedAt,
}) {
  const canonicalProductId = crypto
    .createHash('sha256')
    .update(canonicalKey)
    .digest('hex');
  const sampleNames = createLimitedSet(CANONICAL_GROUP_NAME_SAMPLE_LIMIT);
  const sampleChains = createLimitedSet(CANONICAL_GROUP_CHAIN_SAMPLE_LIMIT);
  addLimitedValue(sampleNames, bucket.representative_product_name_raw);
  addLimitedValue(sampleChains, bucket.source_chain_name_normalized || 'unknown');

  return {
    canonical_product: {
      canonical_product_id: canonicalProductId,
      canonical_product_key: canonicalKey,
      canonical_display_name: bucket.representative_product_name_raw,
      canonical_brand: bucket.brand_guess,
      canonical_product_type: bucket.product_type_guess,
      canonical_category_code: bucket.category_code,
      canonical_size_value: bucket.size_value,
      canonical_size_unit: bucket.size_unit,
      canonical_attributes_json: JSON.stringify({
        fat_percent: bucket.fat_percent,
        stage_marker: bucket.stage_marker,
        count_marker: bucket.count_marker,
        age_band_marker: bucket.age_band_marker,
        reserve_marker: bucket.reserve_marker,
        year_marker: bucket.year_marker,
        age_statement_marker: bucket.age_statement_marker,
        volume_marker: bucket.volume_marker,
        flavor_marker: bucket.flavor_marker,
        color_marker: bucket.color_marker,
        pack_variant_marker: bucket.pack_variant_marker,
        range_marker: bucket.range_marker,
        core_tokens: bucket.core_tokens,
      }),
      source_example_name: bucket.representative_product_name_raw,
      source_product_count: bucket.source_product_ids.length,
      created_at: mappedAt,
      updated_at: mappedAt,
    },
    sample_names: sampleNames,
    sample_chains: sampleChains,
    source_product_count: bucket.source_product_ids.length,
    warned_name_divergence: false,
    warned_size_mismatch: false,
    warned_token_divergence: false,
    baseline_bucket: bucket,
  };
}

function mergeCanonicalGroupBucket(group, bucket, mappedAt) {
  group.source_product_count += bucket.source_product_ids.length;
  group.canonical_product.source_product_count = group.source_product_count;
  group.canonical_product.updated_at = mappedAt;
  addLimitedValue(group.sample_names, bucket.representative_product_name_raw);
  addLimitedValue(group.sample_chains, bucket.source_chain_name_normalized || 'unknown');
}

function maybeRecordCanonicalWarning(group, bucket, warnings, mappedAt) {
  const baseline = group.baseline_bucket;
  if (baseline.dedupe_key === bucket.dedupe_key) {
    return;
  }

  const nameDivergence = namesDifferSignificantly(
    baseline.representative_product_name_raw,
    bucket.representative_product_name_raw
  );
  if (nameDivergence && !group.warned_name_divergence) {
    group.warned_name_divergence = true;
    warnings.push(buildCanonicalWarning({
      warning: 'potential_over_canonicalization_name_divergence',
      group,
      baseline,
      bucket,
      mappedAt,
    }));
  }

  const sizeMismatch = (
    formatCanonicalNumber(baseline.size_value) !== formatCanonicalNumber(bucket.size_value) ||
    (baseline.size_unit || null) !== (bucket.size_unit || null)
  );
  if (sizeMismatch && !group.warned_size_mismatch) {
    group.warned_size_mismatch = true;
    warnings.push(buildCanonicalWarning({
      warning: 'potential_over_canonicalization_size_mismatch',
      group,
      baseline,
      bucket,
      mappedAt,
    }));
  }

  const tokenOverlap = computeTokenOverlap(
    baseline.core_tokens.join(' '),
    bucket.core_tokens.join(' ')
  );
  if (tokenOverlap < POTENTIAL_OVER_DEDUPE_OVERLAP_THRESHOLD && !group.warned_token_divergence) {
    group.warned_token_divergence = true;
    warnings.push(buildCanonicalWarning({
      warning: 'potential_over_canonicalization_token_divergence',
      group,
      baseline,
      bucket,
      mappedAt,
    }));
  }
}

function buildCanonicalWarning({
  warning,
  group,
  baseline,
  bucket,
  mappedAt,
}) {
  const productA = buildCanonicalWarningProductSide({
    bucket: baseline,
    canonicalProduct: group.canonical_product,
  });
  const productB = buildCanonicalWarningProductSide({
    bucket,
    canonicalProduct: group.canonical_product,
  });
  const pairFingerprint = buildCanonicalDisambiguationFingerprint({
    warningReason: warning,
    productA,
    productB,
  });

  return {
    warning_id: `warn_${pairFingerprint.slice(0, 24)}`,
    warning,
    canonical_product_id: group.canonical_product.canonical_product_id,
    canonical_product_key: group.canonical_product.canonical_product_key,
    pair_fingerprint: pairFingerprint,
    product_a: productA,
    product_b: productB,
    compared_dedupe_keys: [baseline.dedupe_key, bucket.dedupe_key],
    names: [baseline.representative_product_name_raw, bucket.representative_product_name_raw],
    chains: [baseline.source_chain_name_normalized, bucket.source_chain_name_normalized],
    logged_at: mappedAt,
  };
}

function buildCanonicalWarningProductSide({
  bucket,
  canonicalProduct,
}) {
  return {
    source_product_id: bucket.representative_source_product_id || null,
    canonical_candidate_id: canonicalProduct.canonical_product_id,
    canonical_candidate_key: canonicalProduct.canonical_product_key,
    dedupe_key: bucket.dedupe_key,
    raw_name: bucket.representative_product_name_raw || null,
    normalized_core_tokens: [...bucket.core_tokens],
    source_chain_name_normalized: bucket.source_chain_name_normalized || null,
    source_chain_name_raw: bucket.source_chain_name_raw || null,
    product_code: bucket.product_code || null,
    category_code: bucket.category_code || null,
    markers: extractCanonicalMarkerSet(bucket),
  };
}

function extractCanonicalMarkerSet(bucket) {
  return {
    stage_marker: bucket.stage_marker || null,
    count_marker: bucket.count_marker || null,
    age_band_marker: bucket.age_band_marker || null,
    reserve_marker: bucket.reserve_marker || null,
    year_marker: bucket.year_marker || null,
    age_statement_marker: bucket.age_statement_marker || null,
    volume_marker: bucket.volume_marker || null,
    flavor_marker: bucket.flavor_marker || null,
    color_marker: bucket.color_marker || null,
    pack_variant_marker: bucket.pack_variant_marker || null,
    range_marker: bucket.range_marker || null,
  };
}

function buildCanonicalDisambiguationFingerprint({
  warningReason,
  productA,
  productB,
  promptVersion = 'phase14_v1',
}) {
  const left = buildCanonicalFingerprintSide(productA);
  const right = buildCanonicalFingerprintSide(productB);
  const orderedSides = [left, right].sort();
  return `fp_${crypto.createHash('sha256')
    .update(JSON.stringify({
      warning_reason: warningReason,
      prompt_version: promptVersion,
      sides: orderedSides,
    }))
    .digest('hex')}`;
}

function buildCanonicalFingerprintSide(product) {
  return JSON.stringify({
    source_product_id: product.source_product_id || null,
    dedupe_key: product.dedupe_key || null,
    canonical_candidate_id: product.canonical_candidate_id || null,
    raw_name: normalizeCanonicalText(product.raw_name || ''),
    normalized_core_tokens: [...(product.normalized_core_tokens || [])],
    source_chain_name_normalized: normalizeCanonicalText(product.source_chain_name_normalized || ''),
    product_code: product.product_code || null,
    category_code: product.category_code || null,
    markers: normalizeMarkerSet(product.markers || {}),
  });
}

function normalizeMarkerSet(markers) {
  return {
    stage_marker: markers.stage_marker || null,
    count_marker: markers.count_marker || null,
    age_band_marker: markers.age_band_marker || null,
    reserve_marker: markers.reserve_marker || null,
    year_marker: markers.year_marker || null,
    age_statement_marker: markers.age_statement_marker || null,
    volume_marker: markers.volume_marker || null,
    flavor_marker: markers.flavor_marker || null,
    color_marker: markers.color_marker || null,
    pack_variant_marker: markers.pack_variant_marker || null,
    range_marker: markers.range_marker || null,
  };
}

function hasConflictingMarker(left, right, markerName) {
  const leftValue = left?.[markerName] || null;
  const rightValue = right?.[markerName] || null;
  if (!leftValue || !rightValue) {
    return false;
  }

  return leftValue !== rightValue;
}

function hasHardDisambiguationConflict(productA, productB) {
  const left = productA?.markers || {};
  const right = productB?.markers || {};
  return [
    'volume_marker',
    'count_marker',
    'age_band_marker',
    'reserve_marker',
  ].some((markerName) => hasConflictingMarker(left, right, markerName));
}

function buildCanonicalDisambiguationQueueRecord({
  warning,
  existingQueueRecord = null,
  existingDecision = null,
  mappedAt,
}) {
  if (!warning || !warning.product_a || !warning.product_b) {
    return null;
  }

  if (hasHardDisambiguationConflict(warning.product_a, warning.product_b)) {
    return null;
  }

  return {
    warning_id: warning.warning_id || `warn_${warning.pair_fingerprint.slice(0, 24)}`,
    pair_fingerprint: warning.pair_fingerprint,
    product_a: warning.product_a,
    product_b: warning.product_b,
    warning_reason: warning.warning,
    status: existingDecision
      ? (existingDecision.decision_source === 'human' ? 'reviewed_human' : 'adjudicated_llm')
      : 'pending',
    created_at: existingQueueRecord?.created_at || mappedAt,
    last_seen_at: mappedAt,
  };
}

function getCanonicalDisambiguationDecisionByFingerprint(state, pairFingerprint) {
  const decisions = state.canonical_disambiguation_decisions || [];
  return decisions.find((decision) => decision.pair_fingerprint === pairFingerprint) || null;
}

function upsertCanonicalDisambiguationDecision(state, decision) {
  if (!decision || !decision.pair_fingerprint) {
    return null;
  }

  state.canonical_disambiguation_decisions = state.canonical_disambiguation_decisions || [];
  const decisionSource = decision.decision_source || 'deterministic_override';
  const normalizedDecision = {
    decision_id: decision.decision_id || `dec_${decisionSource}_${decision.pair_fingerprint.slice(3, 27)}`,
    decision: decision.decision || 'uncertain',
    confidence: decision.confidence || 'low',
    reason_short: decision.reason_short || '',
    decisive_features: Array.isArray(decision.decisive_features) ? decision.decisive_features : [],
    decision_source: decisionSource,
    model_name: decision.model_name || null,
    prompt_version: decision.prompt_version || 'phase14_v1',
    review_note: decision.review_note || null,
    reviewed_by: decision.reviewed_by || null,
    created_at: decision.created_at,
    pair_fingerprint: decision.pair_fingerprint,
  };

  const existingIndex = state.canonical_disambiguation_decisions.findIndex(
    (entry) => entry.decision_id === normalizedDecision.decision_id ||
      (
        entry.pair_fingerprint === normalizedDecision.pair_fingerprint &&
        entry.decision_source === normalizedDecision.decision_source
      )
  );
  if (existingIndex >= 0) {
    state.canonical_disambiguation_decisions[existingIndex] = normalizedDecision;
  } else {
    state.canonical_disambiguation_decisions.push(normalizedDecision);
  }

  state.canonical_disambiguation_decisions = sortByKey(
    state.canonical_disambiguation_decisions,
    'decision_id'
  );
  return normalizedDecision;
}

function syncCanonicalDisambiguationArtifacts({
  state,
  canonicalWarnings,
  mappedAt,
}) {
  state.canonical_disambiguation_queue = state.canonical_disambiguation_queue || [];
  state.canonical_disambiguation_decisions = state.canonical_disambiguation_decisions || [];
  const existingQueueByFingerprint = new Map(
    state.canonical_disambiguation_queue.map((record) => [record.pair_fingerprint, record])
  );
  const nextQueue = [];
  const seenFingerprints = new Set();
  let reusedDecisionCount = 0;

  canonicalWarnings.forEach((warning) => {
    const existingDecision = getCanonicalDisambiguationDecisionByFingerprint(
      state,
      warning.pair_fingerprint
    );
    if (existingDecision) {
      reusedDecisionCount += 1;
    }

    const queueRecord = buildCanonicalDisambiguationQueueRecord({
      warning,
      existingQueueRecord: existingQueueByFingerprint.get(warning.pair_fingerprint) || null,
      existingDecision,
      mappedAt,
    });
    if (queueRecord) {
      nextQueue.push(queueRecord);
      seenFingerprints.add(queueRecord.pair_fingerprint);
    }
  });

  state.canonical_disambiguation_queue.forEach((record) => {
    if (!seenFingerprints.has(record.pair_fingerprint)) {
      nextQueue.push(record);
    }
  });

  state.canonical_disambiguation_queue = sortByKey(nextQueue, 'warning_id');
  return {
    canonicalDisambiguationQueueCount: state.canonical_disambiguation_queue.length,
    canonicalDisambiguationPendingCount: state.canonical_disambiguation_queue.filter(
      (record) => record.status === 'pending'
    ).length,
    canonicalDisambiguationReusedDecisionCount: reusedDecisionCount,
  };
}

function runCanonicalDisambiguationDryRun({
  state,
  canonicalWarnings,
  mappedAt,
}) {
  const metrics = syncCanonicalDisambiguationArtifacts({
    state,
    canonicalWarnings,
    mappedAt,
  });

  return {
    queue: state.canonical_disambiguation_queue,
    pending: state.canonical_disambiguation_queue.filter((record) => record.status === 'pending'),
    decisions: state.canonical_disambiguation_decisions,
    ...metrics,
  };
}

function extractStageMarker({
  productNameRaw,
  normalizedName,
}) {
  const normalized = normalizeCanonicalText(normalizedName || productNameRaw);
  if (!/(аптамил|aptamil|nan|хумана|humana|formula|формула|адаптирано|adapted|мляко сухо|сухо мляко)/u.test(normalized)) {
    return null;
  }

  const explicitPatterns = [
    /\b(?:stage|етап|номер|no)\s*([1-4])\b/u,
    /\b([1-4])\s*(?:stage|етап)\b/u,
    /\bадаптирано\s*([1-4])\b/u,
    /\b([1-4])\b/u,
  ];

  for (const pattern of explicitPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return `stage_${match[1]}`;
    }
  }

  return null;
}

function extractCountMarker({
  productNameRaw,
  normalizedName,
}) {
  const normalized = normalizeVariantText(productNameRaw || normalizedName);
  const patterns = [
    /\bx\s*(\d{1,3})\b/u,
    /\b(\d{1,3})\s*(?:бр|Ð±Ñ€|br|pcs?|pieces?|count)\.?\b/u,
    /\bpack\s*of\s*(\d{1,3})\b/u,
    /\bset\s*of\s*(\d{1,3})\b/u,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      return String(Number.parseInt(match[1], 10));
    }
  }

  return null;
}

function extractAgeBand({
  productNameRaw,
  normalizedName,
}) {
  const normalized = normalizeVariantText(normalizedName || productNameRaw);
  const patterns = [
    /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:год|years?|yrs?|y)\b/u,
    /\b(\d{1,2})\s*\+\s*(?:год|years?|yrs?|y)?\b/u,
    /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:m|mo|mos|month|months|м|мес)\b/u,
    /\b(\d{1,2})\s*\+\s*(?:m|mo|mos|month|months|м|мес)\b/u,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }

    if (match[2]) {
      return `${match[1]}-${match[2]}`;
    }

    return `${match[1]}+`;
  }

  return null;
}

function extractCanonicalAgeBand({
  productNameRaw,
  normalizedName,
}) {
  const normalized = normalizeVariantText(productNameRaw || normalizedName);
  const explicitPatterns = [
    { pattern: /\b(\d{1,2})\s*[-â€“]\s*(\d{1,2})\s*(?:Ð³Ð¾Ð´|years?|yrs?|y)\b/u, unit: 'y', plus: false },
    { pattern: /\b(\d{1,2})\s*\+\s*(?:Ð³Ð¾Ð´|years?|yrs?|y)\b/u, unit: 'y', plus: true },
    { pattern: /\b(\d{1,2})\s*[-â€“]\s*(\d{1,2})\s*(?:m|mo|mos|month|months|Ð¼|Ð¼ÐµÑ)\b/u, unit: 'm', plus: false },
    { pattern: /\b(\d{1,2})\s*\+\s*(?:m|mo|mos|month|months|Ð¼|Ð¼ÐµÑ)\b/u, unit: 'm', plus: true },
  ];

  for (const descriptor of explicitPatterns) {
    const match = normalized.match(descriptor.pattern);
    if (match) {
      return descriptor.plus
        ? `${match[1]}+${descriptor.unit}`
        : `${match[1]}-${match[2]}${descriptor.unit}`;
    }
  }

  if (!hasAgeBandContext(normalized)) {
    return null;
  }

  const implicitPatterns = [
    { pattern: /\b(\d{1,2})\s*[-â€“]\s*(\d{1,2})\b/u, unit: 'y', plus: false },
    { pattern: /\b(\d{1,2})\s*\+(?:\s|$)/u, unit: 'y', plus: true },
  ];

  for (const descriptor of implicitPatterns) {
    const match = normalized.match(descriptor.pattern);
    if (match) {
      return descriptor.plus
        ? `${match[1]}+${descriptor.unit}`
        : `${match[1]}-${match[2]}${descriptor.unit}`;
    }
  }

  return null;
}

function hasAgeBandContext(normalizedValue) {
  return /\b(kid|kids|child|children|baby|babies|infant|infants|toddler|toddlers|junior|детск|деца|дете|беб|бебеш)\b/u.test(
    String(normalizedValue || '')
  );
}

function extractYearMarker({
  productNameRaw,
  normalizedName,
}) {
  const normalized = normalizeVariantText(productNameRaw || normalizedName);
  const match = normalized.match(/\b(19\d{2}|20\d{2})\b/u);
  return match ? match[1] : null;
}

function extractAgeMarker({
  productNameRaw,
  normalizedName,
}) {
  if (extractCanonicalAgeBand({ productNameRaw, normalizedName })) {
    return null;
  }

  const normalized = normalizeVariantText(productNameRaw || normalizedName);
  const patterns = [
    /(?:^|[^0-9+\-/])(\d{1,2})\s*(?:years?|yrs?|yo|год(?:иш(?:ен|на|но|ни))?)(?!\s*[-+/]\s*\d)/u,
    /\b(\d{1,2})\s*(?:g\.o\.|y\.o\.)\b/u,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      return `${match[1]}y`;
    }
  }

  return null;
}

function extractReserveMarker({
  productNameRaw,
  normalizedName,
}) {
  const normalized = normalizeVariantText(productNameRaw || normalizedName);
  const explicitPatterns = [
    /\b(?:reserve|reserv|reserva|aged|matured|резерв\w*|отлежал\w*)\s*(\d{1,2})\b/u,
    /\b(\d{1,2})\s*(?:yo|y\.o\.)\b/u,
  ];

  for (const pattern of explicitPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return String(Number.parseInt(match[1], 10));
    }
  }

  if (!hasAlcoholContext(normalized)) {
    return null;
  }

  const contextualPatterns = [
    /\b(\d{1,2})\s*(?:years?|yrs?)\b/u,
    /\b(\d{1,2})\s*годиш(?:ен|на|но|ни)?\b/u,
  ];

  for (const pattern of contextualPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return String(Number.parseInt(match[1], 10));
    }
  }

  return null;
}

function extractVolumeMarker({
  productNameRaw,
  normalizedName,
}) {
  const normalized = normalizeVariantText(productNameRaw || normalizedName);
  const explicit = extractExplicitVolumeMarker(normalized);
  if (explicit) {
    return explicit;
  }

  return extractContextualBareVolumeMarker(normalized);
}

function extractExplicitVolumeMarker(normalizedValue) {
  const patterns = [
    /\b(\d+(?:[.,]\d+)?)\s*(ml|мл|cl|l|л|kg|кг|g|гр)\b/u,
  ];

  for (const pattern of patterns) {
    const match = String(normalizedValue || '').match(pattern);
    if (!match) {
      continue;
    }

    const marker = normalizeVolumeValue({
      numericValue: match[1],
      unit: match[2],
    });
    if (marker) {
      return marker;
    }
  }

  return null;
}

function extractContextualBareVolumeMarker(normalizedValue) {
  const normalized = String(normalizedValue || '');
  const match = normalized.match(/\b(\d{1,2}[.,]\d{2,3})\b/u);
  if (!match) {
    return null;
  }

  if (!hasBeverageVolumeContext(normalized) && !looksLikeImplicitVolumeToken(match[1])) {
    return null;
  }

  const marker = normalizeVolumeValue({
    numericValue: match[1],
    unit: 'l',
  });

  return marker || null;
}

function hasBeverageVolumeContext(normalizedValue) {
  return /\b(wine|vino|whisk(?:e)?y|rakia|rakija|vodka|gin|rum|brandy|cognac|liqueur|likyor|beer|bira|champagne|prosecco|vermouth|вино|уиски|ракия|водка|джин|ром|бренди|коняк|ликьор|бира|просеко|вермут)\b/u.test(
    String(normalizedValue || '')
  );
}

function hasAlcoholContext(normalizedValue) {
  return hasBeverageVolumeContext(normalizedValue);
}

function looksLikeImplicitVolumeToken(value) {
  const parsed = parseVariantNumber(value);
  if (!Number.isFinite(parsed)) {
    return false;
  }

  return parsed > 0 && parsed <= 10;
}

function normalizeVolumeValue({
  numericValue,
  unit,
}) {
  const parsed = parseVariantNumber(numericValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  const normalizedUnit = normalizeCanonicalText(unit);
  if (normalizedUnit === 'ml' || normalizedUnit === 'мл') {
    return `${formatVolumeNumber(parsed)}ml`;
  }

  if (normalizedUnit === 'cl') {
    return `${formatVolumeNumber(parsed * 10)}ml`;
  }

  if (normalizedUnit === 'l' || normalizedUnit === 'л') {
    return `${formatVolumeNumber(parsed * 1000)}ml`;
  }

  if (normalizedUnit === 'g' || normalizedUnit === 'гр') {
    return `${formatVolumeNumber(parsed)}g`;
  }

  if (normalizedUnit === 'kg' || normalizedUnit === 'кг') {
    return `${formatVolumeNumber(parsed * 1000)}g`;
  }

  return null;
}

function parseVariantNumber(value) {
  const normalized = String(value || '').replace(',', '.').trim();
  if (!normalized) {
    return Number.NaN;
  }

  return Number.parseFloat(normalized);
}

function formatVolumeNumber(value) {
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }

  return String(rounded).replace(/\.0+$/u, '').replace(/(\.\d*?)0+$/u, '$1');
}

function extractFlavorMarker({
  productNameRaw,
  normalizedName,
}) {
  const normalized = normalizeCanonicalText(normalizedName || productNameRaw);
  for (const marker of KNOWN_FLAVOR_MARKERS) {
    if (normalized.includes(normalizeCanonicalText(marker))) {
      return normalizeCanonicalText(marker);
    }
  }

  return null;
}

function extractColorMarker({
  productNameRaw,
  normalizedName,
}) {
  const normalized = normalizeCanonicalText(normalizedName || productNameRaw);
  for (const marker of KNOWN_COLOR_MARKERS) {
    if (normalized.includes(normalizeCanonicalText(marker))) {
      return normalizeCanonicalText(marker);
    }
  }

  return null;
}

function extractPackVariant({
  productNameRaw,
  normalizedName,
  countMarker = null,
}) {
  if (countMarker) {
    return `count_${countMarker}`;
  }

  const normalized = normalizeCanonicalText(normalizedName || productNameRaw);
  const patterns = [
    /\b(\d{1,3})\s*(?:бр|pcs|pieces|pc|count)\b/u,
    /\bpack\s*of\s*(\d{1,3})\b/u,
    /\bset\s*of\s*(\d{1,3})\b/u,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      return `count_${match[1]}`;
    }
  }

  return null;
}

function extractRangeMarker({
  productNameRaw,
  normalizedName,
}) {
  const normalized = normalizeVariantText(productNameRaw || normalizedName);
  return extractNumericRange(normalized) || null;
}

function extractNumericRange(normalizedValue) {
  const patterns = [
    /\b(\d{2,4})\s*[-/–]\s*(\d{2,4})\s*(кг|kg|гр|г|g|gr|мл|ml|л|l)?\b/u,
  ];

  for (const pattern of patterns) {
    const match = String(normalizedValue || '').match(pattern);
    if (!match) {
      continue;
    }

    const lowerBound = match[1];
    const upperBound = match[2];
    const unit = normalizeRangeUnit(match[3] || '');
    return unit ? `${lowerBound}-${upperBound}${unit}` : `${lowerBound}-${upperBound}`;
  }

  return null;
}

function normalizeRangeUnit(value) {
  const normalized = normalizeCanonicalText(value);
  if (!normalized) {
    return '';
  }

  if (normalized === 'гр' || normalized === 'г' || normalized === 'g' || normalized === 'gr') {
    return 'g';
  }

  if (normalized === 'кг' || normalized === 'kg') {
    return 'kg';
  }

  if (normalized === 'мл' || normalized === 'ml') {
    return 'ml';
  }

  if (normalized === 'л' || normalized === 'l') {
    return 'l';
  }

  return normalized;
}

function computeSourceProductDedupeKey(sourceProduct) {
  if (sourceProduct.source_chain_name_normalized && sourceProduct.product_code) {
    return `${sourceProduct.source_chain_name_normalized}::${sourceProduct.product_code}`;
  }

  return `fallback::${sourceProduct.source_product_id}`;
}

function buildCanonicalCoreTokens({
  normalizedName,
  tokens,
  brandGuess,
  sizeValue,
  sizeUnit,
  fatPercent,
  countMarker = null,
  ageBandMarker = null,
  ageStatementMarker = null,
  reserveMarker = null,
}) {
  const brandTokens = tokenizeAuditName(brandGuess || '');
  const filteredTokens = (tokens.length > 0 ? tokens : [...tokenizeAuditName(normalizedName)])
    .map((token) => normalizeCanonicalText(token))
    .filter(Boolean)
    .filter((token) => !brandTokens.has(token))
    .filter((token) => !looksLikeNumericToken(token))
    .filter((token) => !looksLikeVolumeToken(token))
    .filter((token) => !looksLikeUnitOnlyToken(token))
    .filter((token) => !looksLikeCountContextToken(token, countMarker))
    .filter((token) => !looksLikeAgeContextToken(token, ageBandMarker, ageStatementMarker))
    .filter((token) => !looksLikeReserveContextToken(token, reserveMarker))
    .filter((token) => !looksLikeRangeToken(token))
    .filter((token) => !looksLikeSizeOrFatToken(token, { sizeUnit, fatPercent, sizeValue }));

  return [...new Set(filteredTokens)].sort();
}

function looksLikeNumericToken(token) {
  return /^\d+(?:[.,]\d+)?%?$/u.test(token);
}

function looksLikeRangeToken(token) {
  return /^\d{2,4}\s*[-/–]\s*\d{2,4}(?:[a-zа-я]+)?$/u.test(token);
}

function looksLikeVolumeToken(token) {
  return /^\d+(?:[.,]\d+)?(?:ml|cl|l|g|kg)$/u.test(normalizeCanonicalText(token));
}

function looksLikeUnitOnlyToken(token) {
  return /^(?:ml|cl|l|g|kg)$/u.test(normalizeCanonicalText(token));
}

function looksLikeCountContextToken(token, countMarker) {
  if (!countMarker) {
    return false;
  }

  const normalizedToken = normalizeCanonicalText(token);
  return /^(?:бр|br|pcs?|pieces?|count|pack|set)$/u.test(normalizedToken) ||
    /^x\d{1,3}$/u.test(normalizedToken);
}

function looksLikeAgeContextToken(token, ageBandMarker, ageStatementMarker) {
  if (!ageBandMarker && !ageStatementMarker) {
    return false;
  }

  const normalizedToken = normalizeCanonicalText(token);
  return /^(?:год|години|година|years?|yrs?|months?|month|mos?|мес|месеца|месец)$/u.test(normalizedToken);
}

function looksLikeReserveContextToken(token, reserveMarker) {
  if (!reserveMarker) {
    return false;
  }

  const normalizedToken = normalizeCanonicalText(token);
  return /^(?:reserve|reserv|reserva|aged|matured|yo|резерв|отлежала|отлежало|отлежал|отлежали)$/u.test(normalizedToken);
}

function looksLikeSizeOrFatToken(token, { sizeUnit, fatPercent, sizeValue }) {
  const normalizedToken = normalizeCanonicalText(token);
  if (!normalizedToken) {
    return false;
  }

  if (sizeUnit && normalizedToken === normalizeCanonicalText(sizeUnit)) {
    return true;
  }

  if (fatPercent !== null && fatPercent !== undefined) {
    const fatToken = formatCanonicalNumber(fatPercent);
    if (normalizedToken === fatToken || normalizedToken === `${fatToken}%`) {
      return true;
    }
  }

  if (sizeValue !== null && sizeValue !== undefined) {
    return normalizedToken === formatCanonicalNumber(sizeValue);
  }

  return false;
}

function normalizeCanonicalText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('bg-BG')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeVariantText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('bg-BG')
    .replace(/[^\p{L}\p{N}%+,./\-–]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function formatCanonicalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return Number.parseFloat(value).toString();
}

function buildDedupeAuditSample(ingestState) {
  return [...ingestState.enrichmentBuckets.values()]
    .slice(0, DEDUPE_AUDIT_SAMPLE_LIMIT)
    .map((bucket) => ({
      dedupe_key: bucket.dedupe_key,
      row_count: bucket.row_count,
      product_code: bucket.product_code,
      chain: bucket.source_chain_name_normalized,
      sample_names: [...bucket.sample_names.values],
      sample_stores: [...bucket.sample_stores.values],
    }));
}

function createLimitedSet(limit) {
  return {
    limit,
    values: new Set(),
  };
}

function addLimitedValue(container, value) {
  if (!value || container.values.size >= container.limit || container.values.has(value)) {
    return;
  }

  container.values.add(value);
}

function trackBucketSample(bucket, snapshotRecord) {
  addLimitedValue(bucket.sample_names, snapshotRecord.product_name_raw);
  addLimitedValue(bucket.sample_stores, snapshotRecord.store_name_raw);
}

function maybeLogPotentialOverDedupe(ingestState, bucket, snapshotRecord) {
  if (bucket.warned_potential_over_dedupe) {
    return;
  }

  const existingNames = [...bucket.sample_names.values];
  const nextName = snapshotRecord.product_name_raw;
  if (!nextName) {
    return;
  }

  const hasSignificantDifference = existingNames.some((name) => namesDifferSignificantly(name, nextName));
  if (!hasSignificantDifference) {
    return;
  }

  bucket.warned_potential_over_dedupe = true;
  const warning = {
    warning: 'potential_over_dedupe',
    dedupe_key: bucket.dedupe_key,
    names: [...new Set([...existingNames, nextName])].slice(0, DEDUPE_AUDIT_NAME_SAMPLE_LIMIT),
  };
  ingestState.potentialOverDedupeWarnings.push(warning);
  appendPipelineLog(ingestState.state, createPipelineLog({
    level: 'warn',
    event_type: 'potential_over_dedupe',
    message: 'Pre-enrichment dedupe bucket contains significantly different product names.',
    context: warning,
    logged_at: snapshotRecord.ingested_at,
  }));
}

function namesDifferSignificantly(left, right) {
  const normalizedLeft = normalizeAuditName(left);
  const normalizedRight = normalizeAuditName(right);
  if (!normalizedLeft || !normalizedRight || normalizedLeft === normalizedRight) {
    return false;
  }

  const lengthDelta = Math.abs(normalizedLeft.length - normalizedRight.length);
  const overlap = computeTokenOverlap(normalizedLeft, normalizedRight);
  const nonSharedTokenCount = countNonSharedTokens(normalizedLeft, normalizedRight);

  return (
    lengthDelta > POTENTIAL_OVER_DEDUPE_NAME_LENGTH_DELTA ||
    overlap < POTENTIAL_OVER_DEDUPE_OVERLAP_THRESHOLD ||
    nonSharedTokenCount >= 2
  );
}

function normalizeAuditName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('bg-BG')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function computeTokenOverlap(left, right) {
  const leftTokens = tokenizeAuditName(left);
  const rightTokens = tokenizeAuditName(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const sharedCount = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return sharedCount / Math.max(leftTokens.size, rightTokens.size);
}

function countNonSharedTokens(left, right) {
  const leftTokens = tokenizeAuditName(left);
  const rightTokens = tokenizeAuditName(right);
  const onlyLeft = [...leftTokens].filter((token) => !rightTokens.has(token)).length;
  const onlyRight = [...rightTokens].filter((token) => !leftTokens.has(token)).length;
  return onlyLeft + onlyRight;
}

function tokenizeAuditName(value) {
  return new Set(normalizeAuditName(value).split(' ').filter(Boolean));
}

function buildEnrichmentRecord({
  sourceProduct,
  productNameRaw,
  categoryCode,
  ingestedAt,
  existingEnrichment = null,
}) {
  return {
    source_product_id: sourceProduct.source_product_id,
    enriched_at: ingestedAt,
    enrichment_version: 'phase1.5-deterministic-v1',
    based_on_product_name_raw: productNameRaw,
    ...buildEnrichment({
      productNameRaw,
      categoryCode,
      existingEnrichment,
    }),
  };
}

function mapCsvRecordToSourceRow(raw) {
  const normalizedEntries = Object.entries(raw).map(([header, value]) => [
    normalizeHeaderLookup(header),
    typeof value === 'string' ? value.trim() : String(value ?? '').trim(),
  ]);
  const normalizedRecord = Object.fromEntries(normalizedEntries);

  return {
    locality_code_raw: readNormalizedValue(normalizedRecord, 'localityCode'),
    store_name_raw: readNormalizedValue(normalizedRecord, 'storeNameRaw'),
    product_name_raw: readNormalizedValue(normalizedRecord, 'productNameRaw'),
    product_code_raw: readNormalizedValue(normalizedRecord, 'productCode'),
    category_code_raw: readNormalizedValue(normalizedRecord, 'categoryCode'),
    retail_price_raw: readNormalizedValue(normalizedRecord, 'retailPrice'),
    promo_price_raw: readNormalizedValue(normalizedRecord, 'promoPrice'),
    raw_source_row: raw,
  };
}

function isImportableSourceRow(sourceRow) {
  return Boolean(
    sourceRow.locality_code_raw &&
    sourceRow.store_name_raw &&
    sourceRow.product_name_raw &&
    sourceRow.product_code_raw &&
    sourceRow.category_code_raw
  );
}

function sortByKey(items, key) {
  return items.sort((left, right) => String(left[key]).localeCompare(String(right[key])));
}

function readNormalizedValue(record, fieldName) {
  const aliases = SOURCE_HEADER_ALIASES[fieldName];
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, alias)) {
      return record[alias];
    }
  }

  return '';
}

function normalizeHeaderLookup(header) {
  return normalizeHeader(header).toLocaleLowerCase('bg-BG');
}

module.exports = {
  buildCanonicalDisambiguationFingerprint,
  buildCanonicalDisambiguationQueueRecord,
  buildCanonicalProductKey,
  buildCanonicalizationState,
  buildIngestRun,
  getCanonicalDisambiguationDecisionByFingerprint,
  importDailySnapshotCsvStream,
  importDailySnapshotZip,
  isImportableSourceRow,
  mapCsvRecordToSourceRow,
  runCanonicalDisambiguationDryRun,
  syncCanonicalDisambiguationArtifacts,
  upsertCanonicalDisambiguationDecision,
};
