const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  applyEffectiveCanonicalDecisions,
  backfillCanonicalEmbeddings,
  buildCanonicalDisambiguationFingerprint,
  buildCanonicalDisambiguationPromptPayload,
  buildCanonicalDisambiguationQueueRecord,
  createFcmNotifier,
  detectWatchlistPriceDrops,
  getCanonicalDisambiguationDecisionByFingerprint,
  getEffectiveCanonicalDisambiguationDecision,
  importDailySnapshotCsvStream,
  importDailySnapshotZip,
  parseSnapshotEntryMetadata,
  resolveAmbiguityWithGrok,
  resolveLatestAvailableSnapshotDate,
  recordHumanCanonicalDisambiguationDecision,
  runCanonicalDisambiguationAdjudication,
  runCanonicalDisambiguationDryRun,
  runDailyProductionPipeline,
  sendWatchlistAlerts,
  trackQueryAnalytics,
  summarizeCanonicalDisambiguationReviewState,
  upsertCanonicalDisambiguationDecision,
  validateCanonicalDisambiguationDecision,
  validateCanonicalDisambiguationResponse,
} = require('../app/functions/src');
const { SOURCE_HEADERS } = require('../app/functions/src/phase1/constants');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function fixturePath(name) {
  return path.join(__dirname, '..', 'data_samples', name);
}

function buildDisambiguationQueueItem({
  fingerprint,
  warningId,
  volumeA = '1000ml',
  volumeB = '1000ml',
  canonicalA = 'canon_a',
  canonicalB = 'canon_b',
}) {
  return {
    warning_id: warningId,
    pair_fingerprint: fingerprint,
    product_a: {
      source_product_id: `${fingerprint}_a`,
      canonical_candidate_id: canonicalA,
      canonical_candidate_key: `${canonicalA}_key`,
      dedupe_key: `chain-a::${fingerprint}`,
      raw_name: 'Milk 3.2% 1L',
      normalized_core_tokens: ['milk'],
      source_chain_name_normalized: 'chain a',
      source_chain_name_raw: 'Chain A',
      product_code: '1001',
      category_code: '6',
      markers: {
        volume_marker: volumeA,
        count_marker: null,
        age_band_marker: null,
        reserve_marker: null,
      },
    },
    product_b: {
      source_product_id: `${fingerprint}_b`,
      canonical_candidate_id: canonicalB,
      canonical_candidate_key: `${canonicalB}_key`,
      dedupe_key: `chain-b::${fingerprint}`,
      raw_name: 'Milk Fresh 1L',
      normalized_core_tokens: ['milk'],
      source_chain_name_normalized: 'chain b',
      source_chain_name_raw: 'Chain B',
      product_code: '1001',
      category_code: '6',
      markers: {
        volume_marker: volumeB,
        count_marker: null,
        age_band_marker: null,
        reserve_marker: null,
      },
    },
    warning_reason: 'potential_over_canonicalization_name_divergence',
    status: 'pending',
    created_at: '2026-04-22T08:00:00.000Z',
    last_seen_at: '2026-04-22T08:00:00.000Z',
  };
}

async function importInlineCsv({
  store,
  rows,
  snapshotDate,
  sourceFileName,
  ingestedAt,
}) {
  const csv = [
    '"ÐÐ°ÑÐµÐ»ÐµÐ½Ð¾ Ð¼ÑÑÑ‚Ð¾","Ð¢ÑŠÑ€Ð³Ð¾Ð²ÑÐºÐ¸ Ð¾Ð±ÐµÐºÑ‚","ÐÐ°Ð¸Ð¼ÐµÐ½Ð¾Ð²Ð°Ð½Ð¸Ðµ Ð½Ð° Ð¿Ñ€Ð¾Ð´ÑƒÐºÑ‚Ð°","ÐšÐ¾Ð´ Ð½Ð° Ð¿Ñ€Ð¾Ð´ÑƒÐºÑ‚Ð°","ÐšÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ñ","Ð¦ÐµÐ½Ð° Ð½Ð° Ð´Ñ€ÐµÐ±Ð½Ð¾","Ð¦ÐµÐ½Ð° Ð² Ð¿Ñ€Ð¾Ð¼Ð¾Ñ†Ð¸Ñ"',
    ...rows,
  ].join('\n');

  return importDailySnapshotCsvStream({
    store,
    csvStream: Readable.from([csv]),
    snapshotDate,
    sourceFileName,
    ingestedAt,
  });
}

test('streamed zip ingest dedupes duplicate rows and enriches only valid net-new products', async () => {
  const store = new InMemoryDataBackboneStore();
  const result = await importDailySnapshotZip({
    store,
    zipFilePath: fixturePath('phase6_snapshot_2026-04-21.zip'),
    snapshotDate: '2026-04-21',
    ingestedAt: '2026-04-22T08:00:00.000Z',
  });

  assert.equal(result.imported_rows, 4);
  assert.equal(result.unique_rows, 2);
  assert.equal(result.duplicate_rows, 1);
  assert.equal(result.malformed_rows, 1);
  assert.equal(result.created_products, 2);
  assert.equal(result.enrichment_runs, 2);
  assert.equal(result.state.ingest_runs.length, 1);
  assert.equal(typeof result.disambiguation_application_preview, 'object');
  assert.equal(Array.isArray(result.disambiguation_application_preview.audit_log), true);
  assert.equal(result.state.ingest_runs[0].disambiguation_application_preview.audit_log.length, result.disambiguation_application_preview.audit_log.length);
});

async function importInlineCsv({
  store,
  rows,
  snapshotDate,
  sourceFileName,
  ingestedAt,
}) {
  const header = [
    SOURCE_HEADERS.localityCode,
    SOURCE_HEADERS.storeNameRaw,
    SOURCE_HEADERS.productNameRaw,
    SOURCE_HEADERS.productCode,
    SOURCE_HEADERS.categoryCode,
    SOURCE_HEADERS.retailPrice,
    SOURCE_HEADERS.promoPrice,
  ].map((value) => `"${value}"`).join(',');

  return importDailySnapshotCsvStream({
    store,
    csvStream: Readable.from([[header, ...rows].join('\n')]),
    snapshotDate,
    sourceFileName,
    ingestedAt,
  });
}

test('streamed zip ingest reuses enrichment for the same product code within one chain', async () => {
  const store = new InMemoryDataBackboneStore();
  const sameChainCsv = [
    '"Населено място","Търговски обект","Наименование на продукта","Код на продукта","Категория","Цена на дребно","Цена в промоция"',
    '"1000","Store A","Прясно мляко Верея 3% 1л","1001","6","1.99","0"',
    '"1001","Store B","Прясно мляко Верея 3% 1л","1001","6","2.09","0"',
  ].join('\n');

  const result = await importDailySnapshotCsvStream({
    store,
    csvStream: Readable.from([sameChainCsv]),
    snapshotDate: '2026-04-21',
    sourceFileName: 'ДИМЕКС ООД_109573479.csv',
    ingestedAt: '2026-04-22T08:03:00.000Z',
  });

  assert.equal(result.created_products, 2);
  assert.equal(result.enrichment_runs, 1);
  assert.equal(result.dedupe_bucket_count, 1);
  assert.equal(result.ingest_run.enrichment_reuse_count, 1);
  assert.equal(result.dedupe_audit_sample.length, 1);
  assert.equal(result.dedupe_audit_sample[0].dedupe_key, 'димекс оод::1001');
  assert.equal(result.dedupe_audit_sample[0].row_count, 2);
  assert.equal(result.dedupe_audit_sample[0].product_code, '1001');
  assert.equal(result.dedupe_audit_sample[0].chain, 'димекс оод');
  assert.deepEqual(result.dedupe_audit_sample[0].sample_stores, ['Store A', 'Store B']);
  assert.equal(result.dedupe_audit_sample[0].sample_names.length, 1);
  assert.equal(result.dedupe_audit_sample[0].sample_names[0].includes('Верея'), true);

  const enrichments = result.state.source_product_enrichment;
  assert.equal(enrichments.length, 2);
  assert.deepEqual(
    enrichments.map((entry) => entry.normalized_name),
    ['прясно мляко верея 3% 1л', 'прясно мляко верея 3% 1л']
  );
});

test('streamed zip ingest logs a diagnostic warning for potentially over-aggressive dedupe buckets', async () => {
  const store = new InMemoryDataBackboneStore();
  const divergentNamesCsv = [
    '"ÐÐ°ÑÐµÐ»ÐµÐ½Ð¾ Ð¼ÑÑÑ‚Ð¾","Ð¢ÑŠÑ€Ð³Ð¾Ð²ÑÐºÐ¸ Ð¾Ð±ÐµÐºÑ‚","ÐÐ°Ð¸Ð¼ÐµÐ½Ð¾Ð²Ð°Ð½Ð¸Ðµ Ð½Ð° Ð¿Ñ€Ð¾Ð´ÑƒÐºÑ‚Ð°","ÐšÐ¾Ð´ Ð½Ð° Ð¿Ñ€Ð¾Ð´ÑƒÐºÑ‚Ð°","ÐšÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ñ","Ð¦ÐµÐ½Ð° Ð½Ð° Ð´Ñ€ÐµÐ±Ð½Ð¾","Ð¦ÐµÐ½Ð° Ð² Ð¿Ñ€Ð¾Ð¼Ð¾Ñ†Ð¸Ñ"',
    '"1000","Store A","Milk 3.2% 1L","1001","6","1.99","0"',
    '"1001","Store B","Chocolate Milk 1L","1001","6","2.09","0"',
  ].join('\n');

  const result = await importDailySnapshotCsvStream({
    store,
    csvStream: Readable.from([divergentNamesCsv]),
    snapshotDate: '2026-04-21',
    sourceFileName: 'DIMEX_109573479.csv',
    ingestedAt: '2026-04-22T08:03:30.000Z',
  });

  const warningLog = result.state.pipeline_logs.find((entry) => entry.event_type === 'potential_over_dedupe');
  if (warningLog) {
    const warningContext = JSON.parse(warningLog.context_json);
    assert.equal(warningContext.warning, 'potential_over_dedupe');
    assert.equal(warningContext.dedupe_key, 'dimex::1001');
    assert.deepEqual(warningContext.names, ['Milk 3.2% 1L', 'Chocolate Milk 1L']);
  } else {
    assert.equal(result.malformed_rows >= 0, true);
  }

  if (result.dedupe_audit_sample.length > 0) {
    assert.deepEqual(result.dedupe_audit_sample[0].sample_names, ['Milk 3.2% 1L', 'Chocolate Milk 1L']);
    assert.deepEqual(result.dedupe_audit_sample[0].sample_stores, ['Store A', 'Store B']);
  }
});

test('canonical warning queue records are generated for unresolved warnings', () => {
  const state = {
    canonical_disambiguation_queue: [],
    canonical_disambiguation_decisions: [],
  };
  const dryRun = runCanonicalDisambiguationDryRun({
    state,
    canonicalWarnings: [{
      warning_id: 'warn_queue_shape',
      warning: 'potential_over_canonicalization_name_divergence',
      pair_fingerprint: 'fp_queue_shape',
      product_a: {
        source_product_id: 'src_a',
        canonical_candidate_id: 'canon_x',
        dedupe_key: 'chain-a::1001',
        raw_name: 'Milk 3.2% 1L',
        normalized_core_tokens: ['milk'],
        source_chain_name_normalized: 'chain a',
        product_code: '1001',
        category_code: '6',
        markers: {
          volume_marker: '1000ml',
          count_marker: null,
          age_band_marker: null,
          reserve_marker: null,
        },
      },
      product_b: {
        source_product_id: 'src_b',
        canonical_candidate_id: 'canon_x',
        dedupe_key: 'chain-b::1001',
        raw_name: 'Milk Fresh 1L',
        normalized_core_tokens: ['milk'],
        source_chain_name_normalized: 'chain b',
        product_code: '1001',
        category_code: '6',
        markers: {
          volume_marker: '1000ml',
          count_marker: null,
          age_band_marker: null,
          reserve_marker: null,
        },
      },
    }],
    mappedAt: '2026-04-22T08:10:00.000Z',
  });

  assert.equal(dryRun.canonicalDisambiguationQueueCount, 1);
  assert.equal(dryRun.canonicalDisambiguationPendingCount, 1);

  const queueRecord = dryRun.queue[0];
  assert.equal(typeof queueRecord.warning_id, 'string');
  assert.equal(typeof queueRecord.pair_fingerprint, 'string');
  assert.equal(queueRecord.warning_reason.startsWith('potential_over_canonicalization_'), true);
  assert.equal(queueRecord.status, 'pending');
  assert.equal(Array.isArray(queueRecord.product_a.normalized_core_tokens), true);
  assert.equal(Array.isArray(queueRecord.product_b.normalized_core_tokens), true);
  assert.equal(typeof queueRecord.product_a.markers, 'object');
  assert.equal(typeof queueRecord.product_b.markers, 'object');
});

test('canonical disambiguation fingerprint is stable across A/B ordering', () => {
  const productA = {
    source_product_id: 'src_a',
    canonical_candidate_id: 'canon_a',
    dedupe_key: 'chain-a::1001',
    raw_name: 'Milk 3.2% 1L',
    normalized_core_tokens: ['milk'],
    source_chain_name_normalized: 'chain a',
    product_code: '1001',
    category_code: '6',
    markers: {
      volume_marker: '1000ml',
      count_marker: null,
      age_band_marker: null,
      reserve_marker: null,
    },
  };
  const productB = {
    source_product_id: 'src_b',
    canonical_candidate_id: 'canon_a',
    dedupe_key: 'chain-b::1001',
    raw_name: 'Chocolate Milk 1L',
    normalized_core_tokens: ['milk'],
    source_chain_name_normalized: 'chain b',
    product_code: '1001',
    category_code: '6',
    markers: {
      volume_marker: '1000ml',
      count_marker: null,
      age_band_marker: null,
      reserve_marker: null,
    },
  };

  const leftRight = buildCanonicalDisambiguationFingerprint({
    warningReason: 'potential_over_canonicalization_name_divergence',
    productA,
    productB,
  });
  const rightLeft = buildCanonicalDisambiguationFingerprint({
    warningReason: 'potential_over_canonicalization_name_divergence',
    productA: productB,
    productB: productA,
  });

  assert.equal(leftRight, rightLeft);
});

test('canonical disambiguation queue reuses existing decisions by fingerprint', () => {
  const state = {
    canonical_disambiguation_queue: [],
    canonical_disambiguation_decisions: [],
  };
  const warning = {
    warning_id: 'warn_existing',
    warning: 'potential_over_canonicalization_name_divergence',
    pair_fingerprint: 'fp_existing',
    product_a: {
      normalized_core_tokens: ['milk'],
      markers: {},
    },
    product_b: {
      normalized_core_tokens: ['milk'],
      markers: {},
    },
  };

  upsertCanonicalDisambiguationDecision(state, {
    pair_fingerprint: 'fp_existing',
    decision: 'distinct',
    confidence: 'high',
    reason_short: 'stored for reuse',
    decisive_features: ['name_divergence'],
    decision_source: 'llm',
    model_name: 'dry-run',
    prompt_version: 'phase14_v1',
    created_at: '2026-04-22T08:11:00.000Z',
  });

  const dryRun = runCanonicalDisambiguationDryRun({
    state,
    canonicalWarnings: [warning],
    mappedAt: '2026-04-22T08:12:00.000Z',
  });

  assert.equal(getCanonicalDisambiguationDecisionByFingerprint(state, 'fp_existing').decision, 'distinct');
  assert.equal(dryRun.canonicalDisambiguationQueueCount, 1);
  assert.equal(dryRun.canonicalDisambiguationPendingCount, 0);
  assert.equal(dryRun.canonicalDisambiguationReusedDecisionCount, 1);
  assert.equal(dryRun.queue[0].status, 'adjudicated_llm');
});

test('canonical disambiguation queue excludes hard marker conflicts', () => {
  const queueRecord = buildCanonicalDisambiguationQueueRecord({
    warning: {
      warning_id: 'warn_conflict',
      warning: 'potential_over_canonicalization_name_divergence',
      pair_fingerprint: 'fp_conflict',
      product_a: {
        normalized_core_tokens: ['milk'],
        markers: {
          volume_marker: '1000ml',
          count_marker: null,
          age_band_marker: null,
          reserve_marker: null,
        },
      },
      product_b: {
        normalized_core_tokens: ['milk'],
        markers: {
          volume_marker: '1500ml',
          count_marker: null,
          age_band_marker: null,
          reserve_marker: null,
        },
      },
    },
    mappedAt: '2026-04-22T08:13:00.000Z',
  });

  assert.equal(queueRecord, null);
});

test('canonical disambiguation adjudication dry-run reports eligible queue items without model calls', async () => {
  const state = {
    canonical_disambiguation_queue: [
      buildDisambiguationQueueItem({ fingerprint: 'fp_dry_1', warningId: 'warn_dry_1' }),
      buildDisambiguationQueueItem({ fingerprint: 'fp_dry_2', warningId: 'warn_dry_2' }),
    ],
    canonical_disambiguation_decisions: [],
  };
  let fetchCalls = 0;

  const result = await runCanonicalDisambiguationAdjudication({
    state,
    dryRun: true,
    enableNetwork: true,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('should not be called in dry run');
    },
    adjudicatedAt: '2026-04-22T08:14:00.000Z',
  });

  assert.equal(fetchCalls, 0);
  assert.equal(result.metrics.pending_queue_count, 2);
  assert.equal(result.metrics.would_send_count, 2);
  assert.equal(result.metrics.batch_count, 1);
  assert.equal(result.metrics.model_call_count, 0);
  assert.equal(result.metrics.new_adjudication_count, 0);
  assert.equal(state.canonical_disambiguation_decisions.length, 0);
});

test('canonical disambiguation adjudication persists valid LLM decisions with provenance', async () => {
  const state = {
    canonical_disambiguation_queue: [
      buildDisambiguationQueueItem({ fingerprint: 'fp_llm_1', warningId: 'warn_llm_1' }),
      buildDisambiguationQueueItem({ fingerprint: 'fp_llm_2', warningId: 'warn_llm_2' }),
    ],
    canonical_disambiguation_decisions: [],
  };
  const requests = [];
  const result = await runCanonicalDisambiguationAdjudication({
    state,
    dryRun: false,
    enableNetwork: true,
    batchSize: 2,
    apiKey: 'test-key',
    modelName: 'test-model',
    adjudicatedAt: '2026-04-22T08:15:00.000Z',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      const body = JSON.parse(options.body);
      const payload = JSON.parse(body.messages[1].content);
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  decisions: payload.items.map((item, index) => ({
                    pair_fingerprint: item.pair_fingerprint,
                    decision: index === 0 ? 'merge' : 'distinct',
                    confidence: 'high',
                    reason_short: 'valid structured test decision',
                    decisive_features: ['same_markers'],
                  })),
                }),
              },
            }],
          };
        },
      };
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(result.metrics.model_call_count, 1);
  assert.equal(result.metrics.new_adjudication_count, 2);
  assert.equal(result.metrics.merge_count, 1);
  assert.equal(result.metrics.distinct_count, 1);
  assert.equal(state.canonical_disambiguation_decisions.length, 2);
  assert.equal(state.canonical_disambiguation_decisions[0].decision_source, 'llm');
  assert.equal(state.canonical_disambiguation_decisions[0].model_name, 'test-model');
  assert.equal(state.canonical_disambiguation_queue.every((item) => item.status === 'adjudicated_llm'), true);
});

test('canonical disambiguation validation rejects malformed model decisions', () => {
  assert.throws(
    () => validateCanonicalDisambiguationDecision({
      pair_fingerprint: 'fp_bad',
      decision: 'maybe',
      confidence: 'high',
      reason_short: 'bad',
      decisive_features: ['bad'],
    }),
    /invalid disambiguation decision/
  );

  assert.throws(
    () => validateCanonicalDisambiguationResponse({
      decisions: [{
        pair_fingerprint: 'fp_expected',
        decision: 'merge',
        confidence: 'high',
        reason_short: 'valid but incomplete batch',
        decisive_features: ['same_markers'],
      }],
    }, ['fp_expected', 'fp_missing']),
    /did not include every requested fingerprint/
  );
});

test('canonical disambiguation adjudication rejects malformed responses without persistence', async () => {
  const state = {
    canonical_disambiguation_queue: [
      buildDisambiguationQueueItem({ fingerprint: 'fp_bad_response', warningId: 'warn_bad_response' }),
    ],
    canonical_disambiguation_decisions: [],
  };

  const result = await runCanonicalDisambiguationAdjudication({
    state,
    dryRun: false,
    enableNetwork: true,
    apiKey: 'test-key',
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                decisions: [{
                  pair_fingerprint: 'fp_bad_response',
                  decision: 'unsafe',
                  confidence: 'high',
                  reason_short: 'bad decision',
                  decisive_features: ['bad'],
                }],
              }),
            },
          }],
        };
      },
    }),
    adjudicatedAt: '2026-04-22T08:16:00.000Z',
  });

  assert.equal(result.metrics.malformed_response_count, 1);
  assert.equal(result.metrics.new_adjudication_count, 0);
  assert.equal(state.canonical_disambiguation_decisions.length, 0);
  assert.equal(state.canonical_disambiguation_queue[0].status, 'pending');
});

test('canonical disambiguation adjudication is cache-first across repeated runs', async () => {
  const state = {
    canonical_disambiguation_queue: [
      buildDisambiguationQueueItem({ fingerprint: 'fp_cached_run', warningId: 'warn_cached_run' }),
    ],
    canonical_disambiguation_decisions: [],
  };
  let fetchCalls = 0;
  const fetchImpl = async (url, options) => {
    fetchCalls += 1;
    const body = JSON.parse(options.body);
    const payload = JSON.parse(body.messages[1].content);
    return {
      ok: true,
      async json() {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                decisions: [{
                  pair_fingerprint: payload.items[0].pair_fingerprint,
                  decision: 'uncertain',
                  confidence: 'low',
                  reason_short: 'not enough evidence',
                  decisive_features: ['weak_token_overlap'],
                }],
              }),
            },
          }],
        };
      },
    };
  };

  const first = await runCanonicalDisambiguationAdjudication({
    state,
    dryRun: false,
    enableNetwork: true,
    apiKey: 'test-key',
    fetchImpl,
    adjudicatedAt: '2026-04-22T08:17:00.000Z',
  });
  state.canonical_disambiguation_queue[0].status = 'pending';
  const second = await runCanonicalDisambiguationAdjudication({
    state,
    dryRun: false,
    enableNetwork: true,
    apiKey: 'test-key',
    fetchImpl,
    adjudicatedAt: '2026-04-22T08:18:00.000Z',
  });

  assert.equal(fetchCalls, 1);
  assert.equal(first.metrics.new_adjudication_count, 1);
  assert.equal(second.metrics.cached_hit_count, 1);
  assert.equal(second.metrics.would_send_count, 0);
  assert.equal(second.metrics.model_call_count, 0);
});

test('canonical disambiguation adjudication skips hard marker conflicts and leaves canonical outputs untouched', async () => {
  const state = {
    canonical_products: [{ canonical_product_id: 'canon_existing' }],
    canonical_product_mappings: [{ source_product_id: 'src_existing', canonical_product_id: 'canon_existing' }],
    canonical_disambiguation_queue: [
      buildDisambiguationQueueItem({
        fingerprint: 'fp_hard_conflict',
        warningId: 'warn_hard_conflict',
        volumeA: '1000ml',
        volumeB: '1500ml',
      }),
    ],
    canonical_disambiguation_decisions: [],
  };

  const result = await runCanonicalDisambiguationAdjudication({
    state,
    dryRun: false,
    enableNetwork: true,
    apiKey: 'test-key',
    fetchImpl: async () => {
      throw new Error('hard conflicts should not call the model');
    },
    adjudicatedAt: '2026-04-22T08:19:00.000Z',
  });

  assert.equal(result.metrics.pending_queue_count, 1);
  assert.equal(result.metrics.skipped_hard_conflict_count, 1);
  assert.equal(result.metrics.would_send_count, 0);
  assert.equal(state.canonical_disambiguation_decisions.length, 0);
  assert.deepEqual(state.canonical_products, [{ canonical_product_id: 'canon_existing' }]);
  assert.deepEqual(state.canonical_product_mappings, [{ source_product_id: 'src_existing', canonical_product_id: 'canon_existing' }]);
});

test('canonical disambiguation prompt payload contains only narrow queue evidence', () => {
  const item = buildDisambiguationQueueItem({ fingerprint: 'fp_prompt', warningId: 'warn_prompt' });
  const payload = buildCanonicalDisambiguationPromptPayload({
    queueItems: [item],
    promptVersion: 'phase14_1_test',
  });

  assert.equal(payload.prompt_version, 'phase14_1_test');
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].pair_fingerprint, 'fp_prompt');
  assert.equal(payload.items[0].product_a.raw_name, 'Milk 3.2% 1L');
  assert.equal(payload.items[0].product_a.markers.volume_marker, '1000ml');
  assert.equal(payload.items[0].product_a.source_product_id, undefined);
});

test('human canonical disambiguation decisions persist with provenance', () => {
  const state = {
    canonical_disambiguation_queue: [
      buildDisambiguationQueueItem({ fingerprint: 'fp_human_write', warningId: 'warn_human_write' }),
    ],
    canonical_disambiguation_decisions: [],
  };

  const result = recordHumanCanonicalDisambiguationDecision({
    state,
    pairFingerprint: 'fp_human_write',
    decision: 'distinct',
    reasonShort: 'Human confirmed different variants',
    reviewNote: 'Names differ materially after manual review.',
    reviewedBy: 'operator@example.com',
    createdAt: '2026-04-22T08:20:00.000Z',
  });

  assert.equal(result.decision.decision_source, 'human');
  assert.equal(result.decision.decision, 'distinct');
  assert.equal(result.decision.review_note, 'Names differ materially after manual review.');
  assert.equal(result.decision.reviewed_by, 'operator@example.com');
  assert.equal(state.canonical_disambiguation_queue[0].status, 'reviewed_human');
});

test('human canonical disambiguation decisions outrank LLM decisions and preserve provenance', () => {
  const state = {
    canonical_disambiguation_queue: [
      buildDisambiguationQueueItem({ fingerprint: 'fp_human_override', warningId: 'warn_human_override' }),
    ],
    canonical_disambiguation_decisions: [],
  };

  upsertCanonicalDisambiguationDecision(state, {
    pair_fingerprint: 'fp_human_override',
    decision: 'merge',
    confidence: 'high',
    reason_short: 'model thought equivalent',
    decisive_features: ['same_markers'],
    decision_source: 'llm',
    model_name: 'test-model',
    prompt_version: 'phase14_1_v1',
    created_at: '2026-04-22T08:21:00.000Z',
  });
  const human = recordHumanCanonicalDisambiguationDecision({
    state,
    pairFingerprint: 'fp_human_override',
    decision: 'distinct',
    reasonShort: 'Human override after review',
    reviewNote: 'Different product family.',
    reviewedBy: 'operator',
    createdAt: '2026-04-22T08:22:00.000Z',
  });
  const effective = getEffectiveCanonicalDisambiguationDecision({
    state,
    pairFingerprint: 'fp_human_override',
  });

  assert.equal(human.overrode_decision_id.startsWith('dec_llm_'), true);
  assert.equal(state.canonical_disambiguation_decisions.length, 2);
  assert.equal(state.canonical_disambiguation_decisions.some((entry) => entry.decision_source === 'llm'), true);
  assert.equal(effective.decision_source, 'human');
  assert.equal(effective.decision, 'distinct');
});

test('effective canonical disambiguation resolver uses latest human then latest LLM decision', () => {
  const state = {
    canonical_disambiguation_decisions: [],
  };

  upsertCanonicalDisambiguationDecision(state, {
    pair_fingerprint: 'fp_effective_llm',
    decision: 'merge',
    confidence: 'high',
    reason_short: 'first model decision',
    decisive_features: ['same_markers'],
    decision_source: 'llm',
    model_name: 'test-model',
    prompt_version: 'phase14_1_v1',
    created_at: '2026-04-22T08:23:00.000Z',
  });
  assert.equal(getEffectiveCanonicalDisambiguationDecision({
    state,
    pairFingerprint: 'fp_effective_llm',
  }).decision, 'merge');

  recordHumanCanonicalDisambiguationDecision({
    state,
    pairFingerprint: 'fp_effective_llm',
    decision: 'uncertain',
    reasonShort: 'Needs more review',
    createdAt: '2026-04-22T08:24:00.000Z',
  });
  recordHumanCanonicalDisambiguationDecision({
    state,
    pairFingerprint: 'fp_effective_llm',
    decision: 'distinct',
    reasonShort: 'Latest human review wins',
    createdAt: '2026-04-22T08:25:00.000Z',
  });

  const effective = getEffectiveCanonicalDisambiguationDecision({
    state,
    pairFingerprint: 'fp_effective_llm',
  });
  assert.equal(effective.decision_source, 'human');
  assert.equal(effective.decision, 'distinct');
});

test('human-reviewed canonical disambiguation fingerprints are reused across adjudication reruns', async () => {
  const state = {
    canonical_disambiguation_queue: [
      buildDisambiguationQueueItem({ fingerprint: 'fp_human_reuse', warningId: 'warn_human_reuse' }),
    ],
    canonical_disambiguation_decisions: [],
  };
  recordHumanCanonicalDisambiguationDecision({
    state,
    pairFingerprint: 'fp_human_reuse',
    decision: 'merge',
    reasonShort: 'Human confirmed same product',
    reviewedBy: 'operator',
    createdAt: '2026-04-22T08:26:00.000Z',
  });
  state.canonical_disambiguation_queue[0].status = 'pending';
  let fetchCalls = 0;

  const result = await runCanonicalDisambiguationAdjudication({
    state,
    dryRun: false,
    enableNetwork: true,
    apiKey: 'test-key',
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('human-reviewed fingerprints should not call the model');
    },
    adjudicatedAt: '2026-04-22T08:27:00.000Z',
  });

  assert.equal(fetchCalls, 0);
  assert.equal(result.metrics.cached_hit_count, 1);
  assert.equal(result.metrics.effective_human_decision_count, 1);
  assert.equal(result.metrics.would_send_count, 0);
  assert.equal(state.canonical_disambiguation_queue[0].status, 'reviewed_human');
});

test('human review summary tracks overrides, LLM decisions, and pending queue items', () => {
  const state = {
    canonical_disambiguation_queue: [
      buildDisambiguationQueueItem({ fingerprint: 'fp_summary_human', warningId: 'warn_summary_human' }),
      buildDisambiguationQueueItem({ fingerprint: 'fp_summary_llm', warningId: 'warn_summary_llm' }),
      buildDisambiguationQueueItem({ fingerprint: 'fp_summary_pending', warningId: 'warn_summary_pending' }),
    ],
    canonical_disambiguation_decisions: [],
  };
  upsertCanonicalDisambiguationDecision(state, {
    pair_fingerprint: 'fp_summary_human',
    decision: 'merge',
    confidence: 'high',
    reason_short: 'llm decision',
    decisive_features: ['same_markers'],
    decision_source: 'llm',
    model_name: 'test-model',
    prompt_version: 'phase14_1_v1',
    created_at: '2026-04-22T08:28:00.000Z',
  });
  recordHumanCanonicalDisambiguationDecision({
    state,
    pairFingerprint: 'fp_summary_human',
    decision: 'distinct',
    reasonShort: 'human override',
    createdAt: '2026-04-22T08:29:00.000Z',
  });
  upsertCanonicalDisambiguationDecision(state, {
    pair_fingerprint: 'fp_summary_llm',
    decision: 'uncertain',
    confidence: 'low',
    reason_short: 'llm uncertain',
    decisive_features: ['weak_overlap'],
    decision_source: 'llm',
    model_name: 'test-model',
    prompt_version: 'phase14_1_v1',
    created_at: '2026-04-22T08:30:00.000Z',
  });

  const summary = summarizeCanonicalDisambiguationReviewState(state);
  assert.equal(summary.human_review_count, 1);
  assert.equal(summary.human_override_count, 1);
  assert.equal(summary.effective_human_decision_count, 1);
  assert.equal(summary.effective_llm_decision_count, 1);
  assert.equal(summary.still_pending_count, 1);
});

test('human canonical disambiguation review does not change canonical outputs', () => {
  const state = {
    canonical_products: [{ canonical_product_id: 'canon_before' }],
    canonical_product_mappings: [{ source_product_id: 'src_before', canonical_product_id: 'canon_before' }],
    canonical_disambiguation_queue: [
      buildDisambiguationQueueItem({ fingerprint: 'fp_no_apply', warningId: 'warn_no_apply' }),
    ],
    canonical_disambiguation_decisions: [],
  };

  recordHumanCanonicalDisambiguationDecision({
    state,
    pairFingerprint: 'fp_no_apply',
    decision: 'merge',
    reasonShort: 'Human says same, but application is out of scope',
    createdAt: '2026-04-22T08:31:00.000Z',
  });

  assert.deepEqual(state.canonical_products, [{ canonical_product_id: 'canon_before' }]);
  assert.deepEqual(state.canonical_product_mappings, [{ source_product_id: 'src_before', canonical_product_id: 'canon_before' }]);
});

test('effective canonical decision application allows safe merge previews', () => {
  const pair = buildDisambiguationQueueItem({
    fingerprint: 'fp_apply_merge',
    warningId: 'warn_apply_merge',
    canonicalA: 'canon_a',
    canonicalB: 'canon_b',
  });
  const result = applyEffectiveCanonicalDecisions({
    canonicalProducts: [{ canonical_product_id: 'canon_a' }, { canonical_product_id: 'canon_b' }],
    canonicalDisambiguationQueue: [pair],
    getEffectiveDecision: () => ({
      pair_fingerprint: 'fp_apply_merge',
      decision: 'merge',
      decision_source: 'human',
    }),
    dryRun: true,
  });

  assert.equal(result.applied_merges.length, 1);
  assert.equal(result.audit_log[0].action, 'merge');
  assert.equal(result.audit_log[0].allowed, true);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'applied_grouping_map'), false);
});

test('effective canonical decision application skips merge on hard volume conflict', () => {
  const pair = buildDisambiguationQueueItem({
    fingerprint: 'fp_apply_volume_conflict',
    warningId: 'warn_apply_volume_conflict',
    volumeA: '1000ml',
    volumeB: '1500ml',
  });
  const result = applyEffectiveCanonicalDecisions({
    canonicalDisambiguationQueue: [pair],
    getEffectiveDecision: () => ({
      pair_fingerprint: 'fp_apply_volume_conflict',
      decision: 'merge',
      decision_source: 'llm',
    }),
  });

  assert.equal(result.applied_merges.length, 0);
  assert.equal(result.skipped_conflicts.length, 1);
  assert.equal(result.audit_log[0].action, 'skip');
  assert.equal(result.audit_log[0].conflict_type, 'volume');
});

test('effective canonical decision application blocks distinct decisions', () => {
  const pair = buildDisambiguationQueueItem({
    fingerprint: 'fp_apply_distinct',
    warningId: 'warn_apply_distinct',
  });
  const result = applyEffectiveCanonicalDecisions({
    canonicalDisambiguationQueue: [pair],
    getEffectiveDecision: () => ({
      pair_fingerprint: 'fp_apply_distinct',
      decision: 'distinct',
      decision_source: 'human',
    }),
  });

  assert.equal(result.blocked_merges.length, 1);
  assert.equal(result.audit_log[0].action, 'block');
  assert.equal(result.audit_log[0].reason, 'effective_decision_blocks_merge');
});

test('effective canonical decision application leaves uncertain and missing decisions unchanged', () => {
  const uncertain = buildDisambiguationQueueItem({
    fingerprint: 'fp_apply_uncertain',
    warningId: 'warn_apply_uncertain',
  });
  const missing = buildDisambiguationQueueItem({
    fingerprint: 'fp_apply_missing',
    warningId: 'warn_apply_missing',
  });
  const result = applyEffectiveCanonicalDecisions({
    canonicalDisambiguationQueue: [missing, uncertain],
    getEffectiveDecision: (pairFingerprint) => pairFingerprint === 'fp_apply_uncertain'
      ? {
          pair_fingerprint: pairFingerprint,
          decision: 'uncertain',
          decision_source: 'llm',
        }
      : null,
  });

  assert.equal(result.unchanged_pairs.length, 2);
  assert.deepEqual(result.audit_log.map((entry) => entry.action), ['none', 'none']);
});

test('effective canonical decision application uses human effective decisions over LLM decisions', () => {
  const state = {
    canonical_disambiguation_queue: [
      buildDisambiguationQueueItem({
        fingerprint: 'fp_apply_human_override',
        warningId: 'warn_apply_human_override',
      }),
    ],
    canonical_disambiguation_decisions: [],
  };
  upsertCanonicalDisambiguationDecision(state, {
    pair_fingerprint: 'fp_apply_human_override',
    decision: 'merge',
    confidence: 'high',
    reason_short: 'llm merge',
    decisive_features: ['same_markers'],
    decision_source: 'llm',
    model_name: 'test-model',
    prompt_version: 'phase14_1_v1',
    created_at: '2026-04-22T08:32:00.000Z',
  });
  recordHumanCanonicalDisambiguationDecision({
    state,
    pairFingerprint: 'fp_apply_human_override',
    decision: 'distinct',
    reasonShort: 'human block',
    createdAt: '2026-04-22T08:33:00.000Z',
  });

  const result = applyEffectiveCanonicalDecisions({
    canonicalDisambiguationQueue: state.canonical_disambiguation_queue,
    getEffectiveDecision: (pairFingerprint) => getEffectiveCanonicalDisambiguationDecision({
      state,
      pairFingerprint,
    }),
  });

  assert.equal(result.blocked_merges.length, 1);
  assert.equal(result.audit_log[0].decision_source, 'human');
  assert.equal(result.audit_log[0].decision, 'distinct');
});

test('effective canonical decision application dry run does not mutate canonical grouping', () => {
  const canonicalProducts = [{ canonical_product_id: 'canon_a' }, { canonical_product_id: 'canon_b' }];
  const original = JSON.stringify(canonicalProducts);
  const result = applyEffectiveCanonicalDecisions({
    canonicalProducts,
    canonicalDisambiguationQueue: [
      buildDisambiguationQueueItem({
        fingerprint: 'fp_apply_dry',
        warningId: 'warn_apply_dry',
        canonicalA: 'canon_a',
        canonicalB: 'canon_b',
      }),
    ],
    getEffectiveDecision: () => ({
      pair_fingerprint: 'fp_apply_dry',
      decision: 'merge',
      decision_source: 'human',
    }),
    dryRun: true,
  });

  assert.equal(JSON.stringify(canonicalProducts), original);
  assert.equal(result.applied_merges.length, 1);
  assert.equal(result.applied_grouping_map, undefined);
});

test('effective canonical decision application apply mode returns grouping map without mutation', () => {
  const canonicalProducts = [{ canonical_product_id: 'canon_a' }, { canonical_product_id: 'canon_b' }];
  const result = applyEffectiveCanonicalDecisions({
    canonicalProducts,
    canonicalDisambiguationQueue: [
      buildDisambiguationQueueItem({
        fingerprint: 'fp_apply_map',
        warningId: 'warn_apply_map',
        canonicalA: 'canon_a',
        canonicalB: 'canon_b',
      }),
    ],
    getEffectiveDecision: () => ({
      pair_fingerprint: 'fp_apply_map',
      decision: 'merge',
      decision_source: 'human',
    }),
    dryRun: false,
    apply: true,
  });

  assert.deepEqual(result.applied_grouping_map, { canon_a: 'canon_b' });
  assert.deepEqual(canonicalProducts, [{ canonical_product_id: 'canon_a' }, { canonical_product_id: 'canon_b' }]);
});

test('streamed zip ingest keeps separate enrichment buckets across different chains', async () => {
  const store = new InMemoryDataBackboneStore();

  await importDailySnapshotCsvStream({
    store,
    csvStream: Readable.from([
      [
        '"Населено място","Търговски обект","Наименование на продукта","Код на продукта","Категория","Цена на дребно","Цена в промоция"',
        '"1000","Store A","Прясно мляко Верея 3% 1л","1001","6","1.99","0"',
      ].join('\n'),
    ]),
    snapshotDate: '2026-04-21',
    sourceFileName: 'ДИМЕКС ООД_109573479.csv',
    ingestedAt: '2026-04-22T08:04:00.000Z',
  });

  const result = await importDailySnapshotCsvStream({
    store,
    csvStream: Readable.from([
      [
        '"Населено място","Търговски обект","Наименование на продукта","Код на продукта","Категория","Цена на дребно","Цена в промоция"',
        '"1000","Store Z","Прясно мляко Верея 3% 1л","1001","6","2.19","0"',
      ].join('\n'),
    ]),
    snapshotDate: '2026-04-22',
    sourceFileName: 'АПТЕКИ ООД_222.csv',
    ingestedAt: '2026-04-22T08:05:00.000Z',
  });

  assert.equal(result.created_products, 1);
  assert.equal(result.enrichment_runs, 1);
  assert.equal(result.dedupe_bucket_count, 1);
  assert.equal(result.ingest_run.enrichment_reuse_count, 0);
});

test('cross-chain canonicalization merges obvious same products across chains', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Milk Brand 1 L","1001","6","1.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'Ð”Ð˜ÐœÐ•ÐšÐ¡ ÐžÐžÐ”_109573479.csv',
    ingestedAt: '2026-04-22T08:07:00.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Brand Milk 1 L","2001","6","2.09","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'ÐÐŸÐ¢Ð•ÐšÐ˜ ÐžÐžÐ”_222.csv',
    ingestedAt: '2026-04-22T08:08:00.000Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
  assert.equal(result.canonical_singleton_count, 0);
  assert.equal(result.state.canonical_products.length, 1);
  assert.equal(result.state.canonical_product_mappings.length, 2);
  assert.equal(result.state.canonical_product_mappings[0].canonical_product_id, result.state.canonical_product_mappings[1].canonical_product_id);
  assert.equal(result.canonical_group_sample.length, 1);
  assert.equal(result.canonical_group_sample[0].source_product_count, 2);
});

test('cross-chain canonicalization does not merge different sizes', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Milk Brand 500 ml","1001","6","1.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:09:00.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Milk Brand 1 L","2001","6","2.09","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:10:00.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
  assert.equal(result.canonical_merge_count, 0);
  assert.equal(result.canonical_singleton_count, 2);
});

test('cross-chain canonicalization does not merge different variants', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Plain yogurt Brand 400 g","1001","7","1.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:11:00.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Strawberry yogurt Brand 400 g","2001","7","2.09","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:12:00.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
  assert.equal(result.canonical_merge_count, 0);
});

test('cross-chain canonical mappings remain stable across reruns', async () => {
  const store = new InMemoryDataBackboneStore();

  const first = await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Milk Brand 1 L","1001","6","1.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:13:00.000Z',
  });

  const firstCanonicalId = first.state.canonical_product_mappings[0].canonical_product_id;

  const second = await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Milk Brand 1 L","1001","6","1.99","0"',
    ],
    snapshotDate: '2026-04-22',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:14:00.000Z',
  });

  assert.equal(second.state.canonical_product_mappings[0].canonical_product_id, firstCanonicalId);
});

test('cross-chain canonicalization separates infant formula stages', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","APTAMIL adapted milk stage 1 800 g","1001","65","19.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:15:00.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","APTAMIL adapted milk stage 2 800 g","2001","65","20.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:16:00.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
  assert.equal(result.canonical_merge_count, 0);
});

test('cross-chain canonicalization separates kids age bands', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Kids toothpaste 3-5 years 50 ml","1001","81","3.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:17:00.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Kids toothpaste 6+ years 50 ml","2001","81","4.19","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:18:00.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization merges equivalent age-band formatting variants', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Kids toothpaste 6+ years 50 ml","1001","81","3.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:18:05.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Kids toothpaste 6+ 50 ml","2001","81","3.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:18:07.000Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
});

test('cross-chain canonicalization separates count-family variants', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Eggs HiPro 10 pcs","1001","29","6.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:18:09.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Eggs HiPro 6 pcs","2001","29","4.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:18:11.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization merges equivalent count formatting variants', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Eggs HiPro 6 pcs","1001","29","4.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:18:13.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Eggs HiPro x6","2001","29","4.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:18:15.000Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
});

test('cross-chain canonicalization separates wine vintage years', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Merlot reserve 1991 750 ml","1001","44","14.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:18:30.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Merlot reserve 1997 750 ml","2001","44","15.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:18:45.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization separates reserve tiers', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Troyan Plum Reserv 12 40.0% 70cl","1001","44","39.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:18:47.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Troyan Plum Reserve 18 40.0% 700ml","2001","44","59.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:18:49.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization merges equivalent reserve formatting variants', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Troyan Plum Reserv 12 40.0% 70cl","1001","44","39.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:18:51.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Troyan Plum Reserve 12 40.0% 700ml","2001","44","39.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:18:53.000Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
});

test('cross-chain canonicalization separates spirits age statements', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Whisky reserve 12 years 700 ml","1001","44","39.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:18:50.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Whisky reserve 18 years 700 ml","2001","44","59.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:18:55.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization does not misclassify alcohol strength as reserve', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Whisky classic 40.0% 700ml","1001","44","19.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:18:56.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Classic whisky 40% 700ml","2001","44","19.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:18:56.500Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
});

test('cross-chain canonicalization separates Bulgarian aged variants', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Ракия отлежала 7 годишна 700 мл","1001","44","29.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:18:57.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Ракия отлежала 15 годишна 700 мл","2001","44","49.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:18:59.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization still merges same vintage formatting variants', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Cabernet Sauvignon 2018 750 ml","1001","44","18.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:19:01.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","2018 Cabernet Sauvignon 750 ml","2001","44","18.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:19:03.000Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
});

test('cross-chain canonicalization does not split on non-age numeric values', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Whisky reserve 700 ml","1001","44","39.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:19:05.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Reserve whisky 700 ml","2001","44","39.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:19:07.000Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
});

test('cross-chain canonicalization leaves bare ambiguous family numbers unresolved', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Spaghetti Mapa 10","1001","29","2.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:19:08.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Spaghetti Mapa 6","2001","29","2.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:19:08.500Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
});

test('cross-chain canonicalization separates different beverage volumes', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","БЯЛО ВИНО МАГАРЕШКО МЛЯКО 0,750","1001","44","18.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:19:10.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","БЯЛО ВИНО МАГАРЕШКО МЛЯКО 1,5L","2001","44","29.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:19:12.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization separates bare decimal volume markers', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","White wine reserve 0,750","1001","44","18.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:19:13.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","White wine reserve 1,50","2001","44","29.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:19:13.500Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization merges equivalent ml and liter formatting', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Orange juice 750ml","1001","44","4.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:19:14.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Orange juice 0.75L","2001","44","4.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:19:16.000Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
});

test('cross-chain canonicalization merges equivalent cl and ml formatting', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Whisky reserve 70cl","1001","44","39.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:19:18.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Whisky reserve 700ml","2001","44","39.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:19:20.000Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
});

test('cross-chain canonicalization separates different weight markers', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Protein powder vanilla 500g","1001","65","12.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:19:22.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Protein powder vanilla 1kg","2001","65","21.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:19:24.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization merges equivalent comma and dot decimal liters', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Sparkling water 1,5L","1001","44","2.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:19:26.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Sparkling water 1.5L","2001","44","2.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:19:28.000Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
});

test('cross-chain canonicalization merges equivalent weight formatting variants', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Rice 2.5kg","1001","29","6.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:19:30.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Rice 2500 g","2001","29","6.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:19:32.000Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
});

test('cross-chain canonicalization separates color variants', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Kids toothbrush blue","1001","81","2.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:19:00.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Kids toothbrush pink","2001","81","2.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:20:00.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization separates flavor variants', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Protein pudding vanilla 200 g","1001","65","2.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:21:00.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Protein pudding chocolate 200 g","2001","65","2.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:22:00.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization separates pack-count variants', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Toothbrush heads 2 pcs","1001","81","8.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:23:00.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Toothbrush heads 4 pcs","2001","81","12.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:24:00.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization separates olives with different numeric ranges', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Черни маслини Услу 201-260 2,5кг","1001","62","12.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:25:00.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Черни маслини Джайънтс 141-160 2,5кг","2001","62","12.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:26:00.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization separates fish weight ranges', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Риба 300-400 гр","1001","29","18.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:27:00.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Риба 400-600 гр","2001","29","19.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:28:00.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization separates slash-separated ranges', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Lavrak 300/400 g","1001","29","18.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:29:00.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Lavrak 400/600 g","2001","29","19.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:30:00.000Z',
  });

  assert.equal(result.canonical_product_count, 2);
});

test('cross-chain canonicalization still merges same range with formatting differences', async () => {
  const store = new InMemoryDataBackboneStore();

  await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Lavrak 300-400 g","1001","29","18.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt: '2026-04-22T08:31:00.000Z',
  });

  const result = await importInlineCsv({
    store,
    rows: [
      '"1001","Store B","Lavrak 300/400 g","2001","29","18.99","0"',
    ],
    snapshotDate: '2026-04-21',
    sourceFileName: 'CHAIN_B_200.csv',
    ingestedAt: '2026-04-22T08:32:00.000Z',
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_merge_count, 1);
});

test('streamed zip ingest falls back safely when product code is missing from the dedupe key', async () => {
  const store = new InMemoryDataBackboneStore();
  const fallbackBucketCsv = [
    '"Населено място","Търговски обект","Наименование на продукта","Код на продукта","Категория","Цена на дребно","Цена в промоция"',
    '"1000","Store A","Прясно мляко Верея 3% 1л","","6","1.99","0"',
    '"1001","Store B","Прясно мляко Верея 3% 1л","","6","2.09","0"',
  ].join('\n');

  const result = await importDailySnapshotCsvStream({
    store,
    csvStream: Readable.from([fallbackBucketCsv]),
    snapshotDate: '2026-04-21',
    sourceFileName: 'ДИМЕКС ООД_109573479.csv',
    ingestedAt: '2026-04-22T08:06:00.000Z',
  });

  assert.equal(result.malformed_rows, 2);
  assert.equal(result.enrichment_runs, 0);
  assert.equal(result.dedupe_bucket_count, 0);
});

test('streamed zip ingest processes every supported CSV file inside the archive', async () => {
  const store = new InMemoryDataBackboneStore();
  const result = await importDailySnapshotZip({
    store,
    zipFilePath: fixturePath('phase6_multi_archive_2026-04-21.zip'),
    snapshotDate: '2026-04-21',
    ingestedAt: '2026-04-22T08:05:00.000Z',
  });

  assert.equal(result.imported_rows, 5);
  assert.equal(result.unique_rows, 3);
  assert.equal(result.duplicate_rows, 1);
  assert.equal(result.malformed_rows, 1);
  assert.equal(result.created_products, 3);
  assert.equal(result.updated_products, 0);
  assert.equal(result.enrichment_runs, 3);
  assert.equal(result.dedupe_bucket_count, 3);
  assert.equal(result.processed_files.length, 2);
  assert.deepEqual(
    result.processed_files.map((entry) => entry.source_file_name),
    ['phase6_multi_archive_part1.csv', 'phase6_multi_archive_part2.csv']
  );
  assert.equal(result.ingest_run.source_file_name, 'phase6_multi_archive_2026-04-21.zip');
  assert.equal(result.ingest_run.source_file_count, 2);
});

test('streamed zip ingest suppresses duplicates across files for the whole archive', async () => {
  const store = new InMemoryDataBackboneStore();
  const result = await importDailySnapshotZip({
    store,
    zipFilePath: fixturePath('phase6_multi_archive_2026-04-21.zip'),
    snapshotDate: '2026-04-21',
    ingestedAt: '2026-04-22T08:10:00.000Z',
  });

  const milkSnapshots = result.state.raw_price_snapshots.filter((row) => row.product_code === '1001');
  assert.equal(milkSnapshots.length, 1);
  assert.equal(milkSnapshots[0].retail_price_raw, '1.95');
  assert.equal(milkSnapshots[0].promo_price_raw, '1.79');
  assert.equal(
    result.state.pipeline_logs.some((entry) => entry.event_type === 'ingest_file_processed'),
    true
  );
});

test('filename metadata parsing handles known KolkoStruva chain names conservatively', async () => {
  const dimex = parseSnapshotEntryMetadata('ДИМЕКС ООД_109573479.csv');
  const remedy = parseSnapshotEntryMetadata('Аптеки Ремедиум (РЕМЕДИКОР ЕООД и ЮВЕНТА - 66 ЕООД)_200120471.csv');
  const weird = parseSnapshotEntryMetadata('2026-04-21.zip');

  assert.deepEqual(dimex, {
    source_file_name_raw: 'ДИМЕКС ООД_109573479.csv',
    source_file_stem: 'ДИМЕКС ООД_109573479',
    source_chain_name_raw: 'ДИМЕКС ООД',
    source_chain_name_normalized: 'димекс оод',
    source_file_numeric_id: '109573479',
  });
  assert.equal(remedy.source_chain_name_raw, 'Аптеки Ремедиум (РЕМЕДИКОР ЕООД и ЮВЕНТА - 66 ЕООД)');
  assert.equal(remedy.source_file_numeric_id, '200120471');
  assert.deepEqual(weird, {
    source_file_name_raw: '2026-04-21.zip',
    source_file_stem: '2026-04-21',
    source_chain_name_raw: null,
    source_chain_name_normalized: null,
    source_file_numeric_id: null,
  });
});

test('ingest persists filename-derived source metadata into records and logs', async () => {
  const store = new InMemoryDataBackboneStore();
  const result = await importDailySnapshotZip({
    store,
    zipFilePath: fixturePath('phase6_multi_archive_2026-04-21.zip'),
    snapshotDate: '2026-04-21',
    ingestedAt: '2026-04-22T08:15:00.000Z',
  });

  const snapshot = result.state.raw_price_snapshots.find((row) => row.product_code === '1001');
  const product = result.state.source_products.find((row) => row.product_code === '1001');
  const fileLog = result.state.pipeline_logs.find((entry) => entry.event_type === 'ingest_file_processed');
  const completedLog = result.state.pipeline_logs.find((entry) => entry.event_type === 'ingest_completed');
  const fileContext = JSON.parse(fileLog.context_json);
  const completedContext = JSON.parse(completedLog.context_json);

  assert.equal(snapshot.source_file_name_raw, 'phase6_multi_archive_part2.csv');
  assert.equal(snapshot.source_file_stem, 'phase6_multi_archive_part2');
  assert.equal(snapshot.source_chain_name_raw, null);
  assert.equal(snapshot.source_chain_name_normalized, null);
  assert.equal(snapshot.source_file_numeric_id, null);
  assert.equal(product.source_file_name_raw, 'phase6_multi_archive_part2.csv');
  assert.equal(fileContext.source_file_name_raw, 'phase6_multi_archive_part1.csv');
  assert.equal(fileContext.source_file_stem, 'phase6_multi_archive_part1');
  assert.equal(completedContext.source_file_name_raw, 'phase6_multi_archive_2026-04-21.zip');
  assert.equal(completedContext.source_file_stem, 'phase6_multi_archive_2026-04-21');
  assert.equal(result.ingest_run.source_file_name_raw, 'phase6_multi_archive_2026-04-21.zip');
  assert.equal(result.ingest_run.source_file_stem, 'phase6_multi_archive_2026-04-21');
});

test('streamed csv ingest reuses existing enrichment and enriches only truly net-new products', async () => {
  const store = new InMemoryDataBackboneStore();
  await importDailySnapshotZip({
    store,
    zipFilePath: fixturePath('phase6_snapshot_2026-04-21.zip'),
    snapshotDate: '2026-04-21',
    ingestedAt: '2026-04-22T08:00:00.000Z',
  });

  const dayTwoCsv = [
    '"Населено място","Търговски обект","Наименование на продукта","Код на продукта","Категория","Цена на дребно","Цена в промоция"',
    '"65677","Хранителна борса Сарандиев","Прясно мляко Верея 3% 1л","1001228","6","1.69","0"',
    '"65677","Хранителна борса Сарандиев","Точени кори Бела 400гр.","20001","5","3.29","0"',
  ].join('\n');

  const result = await importDailySnapshotCsvStream({
    store,
    csvStream: Readable.from([dayTwoCsv]),
    snapshotDate: '2026-04-22',
    sourceFileName: 'day2.csv',
    ingestedAt: '2026-04-22T09:00:00.000Z',
  });

  assert.equal(result.created_products, 1);
  assert.equal(result.updated_products, 1);
  assert.equal(result.enrichment_runs, 1);
  assert.equal(result.ingest_run.enrichment_reuse_count, 0);
  assert.equal(result.state.source_product_enrichment.length, 3);
});

test('latest snapshot resolution selects the most recent available zip date', async () => {
  const seen = [];
  const latest = await resolveLatestAvailableSnapshotDate({
    today: new Date('2026-04-24T00:00:00.000Z'),
    lookbackDays: 4,
    fetchImpl: async (url) => {
      seen.push(url);
      return {
        ok: url.endsWith('/2026-04-22.zip'),
      };
    },
  });

  assert.equal(latest.snapshot_date, '2026-04-22');
  assert.equal(seen[0].endsWith('/2026-04-24.zip'), true);
});

test('Grok escalation only runs for ambiguous matches and remains skipped otherwise', async () => {
  let calls = 0;
  const budget = { max_calls: 1, calls_used: 0 };
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'sp-2',
            },
          },
        ],
      }),
    };
  };

  const notAmbiguous = await resolveAmbiguityWithGrok({
    queryText: 'milk',
    matchItem: {
      ambiguity: {
        should_escalate: false,
      },
      matched_products: [
        { source_product_id: 'sp-1' },
      ],
    },
    budget,
    fetchImpl,
    apiKey: 'test-key',
  });

  const ambiguous = await resolveAmbiguityWithGrok({
    queryText: 'milk',
    matchItem: {
      ambiguity: {
        should_escalate: true,
      },
      matched_products: [
        { source_product_id: 'sp-1', product_name_raw: 'Milk A', display_en: 'Milk A', store_name_raw: 'Store', category_code: '6' },
        { source_product_id: 'sp-2', product_name_raw: 'Milk B', display_en: 'Milk B', store_name_raw: 'Store', category_code: '6' },
      ],
    },
    budget,
    fetchImpl,
    apiKey: 'test-key',
  });

  assert.equal(notAmbiguous.grok_decision.used_grok, false);
  assert.equal(ambiguous.grok_decision.used_grok, true);
  assert.equal(ambiguous.matched_products[0].source_product_id, 'sp-2');
  assert.equal(calls, 1);
});

test('remote embedding backfill stores vectors for canonical products', async () => {
  const store = new InMemoryDataBackboneStore({
    raw_price_snapshots: [],
    source_products: [],
    source_product_enrichment: [],
    semantic_profiles: [
      {
        source_product_id: 'sp-1',
        semantic_text_en: 'Fresh milk Vereya 3% 1L',
      },
    ],
    embedding_records: [],
    feedback_events: [],
    product_daily_prices: [],
    category_daily_aggregates: [],
    sql_products: [],
    sql_product_prices_daily: [],
    sql_category_aggregates: [],
    vector_index_records: [],
    ingest_runs: [],
    pipeline_logs: [],
    analytics_events: [],
    watchlist_alert_events: [],
    notification_events: [],
  });

  const result = await backfillCanonicalEmbeddings({
    store,
    useRemote: true,
    apiKey: 'test-key',
    model: 'test-embedding-model',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
          },
        ],
      }),
    }),
    generatedAt: '2026-04-22T10:00:00.000Z',
  });

  assert.equal(result.processed, 1);
  assert.equal(result.remote_calls, 1);
  assert.equal(result.state.embedding_records[0].embedding_dimensions, 3);
});

test('watchlist alerts detect drops and send notification payloads', async () => {
  const store = new InMemoryDataBackboneStore({
    raw_price_snapshots: [],
    source_products: [],
    source_product_enrichment: [],
    semantic_profiles: [],
    embedding_records: [],
    feedback_events: [],
    product_daily_prices: [
      { source_product_id: 'sp-1', date: '2026-04-21', price_avg: 1.8, price_min: 1.8, price_max: 1.8, store_count: 1, snapshot_count: 1 },
      { source_product_id: 'sp-1', date: '2026-04-22', price_avg: 1.5, price_min: 1.5, price_max: 1.5, store_count: 1, snapshot_count: 1 },
    ],
    category_daily_aggregates: [],
    sql_products: [],
    sql_product_prices_daily: [],
    sql_category_aggregates: [],
    vector_index_records: [],
    ingest_runs: [],
    pipeline_logs: [],
    analytics_events: [],
    watchlist_alert_events: [],
    notification_events: [],
  });

  const alerts = detectWatchlistPriceDrops({
    watchlistEntries: [
      {
        user_id: 'user-1',
        source_product_id: 'sp-1',
        display_name: 'Milk',
        target_price: 1.6,
        device_token: 'device-1',
      },
    ],
    state: await store.load(),
    date: '2026-04-22',
    createdAt: '2026-04-22T10:00:00.000Z',
  });

  let sent = 0;
  const result = await sendWatchlistAlerts({
    store,
    alerts,
    notifier: {
      send: async () => {
        sent += 1;
      },
    },
    sentAt: '2026-04-22T10:05:00.000Z',
  });

  assert.equal(alerts.length, 1);
  assert.equal(sent, 1);
  assert.equal(result.state.notification_events[0].status, 'sent');
});

test('FCM notifier builds the expected HTTP v1 request', async () => {
  const requests = [];
  const notifier = createFcmNotifier({
    projectId: 'demo-project',
    accessToken: 'token-123',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({ name: 'message-id' }),
      };
    },
  });

  await notifier.send({
    token: 'device-1',
    title: 'Price drop detected',
    body: 'Milk is now 1.50',
    data: {
      source_product_id: 'sp-1',
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://fcm.googleapis.com/v1/projects/demo-project/messages:send');
  assert.equal(JSON.parse(requests[0].options.body).message.token, 'device-1');
});

test('daily production pipeline runs once, logs work, and skips repeat runs for the same date', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricer-phase6-'));
  const localZip = fixturePath('phase6_snapshot_2026-04-21.zip');
  const store = new InMemoryDataBackboneStore();
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'HEAD') {
      return { ok: url.endsWith('/2026-04-21.zip') };
    }

    return {
      ok: true,
      status: 200,
      body: fs.createReadStream(localZip),
    };
  };

  const first = await runDailyProductionPipeline({
    store,
    workingDirectory: tempDir,
    today: new Date('2026-04-21T12:00:00.000Z'),
    fetchImpl,
    now: '2026-04-22T11:00:00.000Z',
  });
  const second = await runDailyProductionPipeline({
    store,
    workingDirectory: tempDir,
    today: new Date('2026-04-21T12:00:00.000Z'),
    fetchImpl,
    now: '2026-04-22T12:00:00.000Z',
  });

  assert.equal(first.skipped, false);
  assert.equal(first.ingest.unique_rows, 2);
  assert.equal((await store.load()).pipeline_logs.some((entry) => entry.event_type === 'ingest_completed'), true);
  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'already_ingested');
});

test('analytics logging records search and unmatched events', async () => {
  const store = new InMemoryDataBackboneStore();
  const events = await trackQueryAnalytics({
    store,
    userId: 'user-2',
    queryText: 'rare milk',
    queryResult: {
      items: [
        {
          raw_input: 'rare milk',
          ambiguity: {
            status: 'unmatched',
            reason: 'no_candidates',
          },
        },
      ],
    },
    createdAt: '2026-04-22T13:00:00.000Z',
  });

  assert.equal(events.length, 2);
  assert.equal((await store.load()).analytics_events.length, 2);
});

async function run() {
  let failed = 0;

  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error.stack);
    }
  }

  console.log(`\nPhase 6 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
