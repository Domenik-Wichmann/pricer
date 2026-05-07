const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildCompactCurrentOfferBaselineRecord,
  buildCurrentOfferFingerprint,
  buildCurrentOfferFingerprints,
  buildRichCurrentOfferBaselineRecord,
  buildOfferChangeEvents,
  buildIncrementalWriterPlan,
  buildSnapshotManifest,
  diffCurrentOffers,
} = require('../app/functions/src');
const {
  applyIncrementalWriter,
  buildDailyDiffDiagnostics,
  loadExistingFingerprintsFromJson,
  resolveIncrementalDiffOptions,
  runIncrementalSnapshotDiff,
} = require('../scripts/diff_phase6_snapshot_firestore');
const {
  exportCurrentOfferFingerprintBaseline,
} = require('../scripts/export_phase6_current_offer_fingerprints');
const {
  runHistoricalSnapshotPublish,
} = require('../scripts/ingest_phase6_snapshot_firestore');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function offer(overrides = {}) {
  return {
    offer_id: 'offer_src_1',
    source_product_id: 'src_1',
    canonical_product_id: 'cp_1',
    current_price: 2.49,
    retail_price: 2.49,
    promo_price: null,
    unit_price: null,
    is_sale: false,
    is_promotion: false,
    chain_id: 'chain-a',
    chain_name: 'Chain A',
    retailer: 'Chain A',
    store_id: '1000::chain-a',
    store_name: 'Chain A Sofia',
    locality_code: '1000',
    source_file_name: 'CHAIN_A.csv',
    source_file_name_raw: 'CHAIN_A.csv',
    source_file_stem: 'CHAIN_A',
    source_chain_name_normalized: 'chain-a',
    snapshot_date: '2026-05-05',
    updated_at: '2026-05-05T09:00:00.000Z',
    ...overrides,
  };
}

function fixturePath(name) {
  return path.join(__dirname, '..', 'data_samples', name);
}

function tempJsonFile(value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricer-incremental-test-'));
  const filePath = path.join(dir, 'baseline.json');
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function tempFilePath(fileName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricer-incremental-test-'));
  return path.join(dir, fileName);
}

function createFakeBaselineFirestore(offers) {
  const writes = [];
  const sortedDocs = [...offers]
    .map((data) => ({ id: data.offer_id, data: () => data }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const collectionRefs = new Map();

  function collection(collectionId) {
    if (!collectionRefs.has(collectionId)) {
      collectionRefs.set(collectionId, {
        doc(documentId) {
          return {
            id: documentId,
            set(data) {
              writes.push({ collectionId, documentId, data });
            },
          };
        },
        orderBy() {
          const queryState = {
            limitValue: sortedDocs.length,
            startAfterId: null,
          };
          const query = {
            limit(value) {
              queryState.limitValue = value;
              return query;
            },
            startAfter(doc) {
              queryState.startAfterId = typeof doc === 'string' ? doc : doc.id;
              return query;
            },
            async get() {
              const startIndex = queryState.startAfterId
                ? sortedDocs.findIndex((doc) => doc.id === queryState.startAfterId) + 1
                : 0;
              const docs = sortedDocs.slice(startIndex, startIndex + queryState.limitValue);
              return {
                docs,
                empty: docs.length === 0,
              };
            },
          };
          return query;
        },
      });
    }
    return collectionRefs.get(collectionId);
  }

  return {
    writes,
    collection,
    batch() {
      const operations = [];
      return {
        set(ref, data) {
          operations.push({ ref, data });
        },
        async commit() {
          operations.forEach((operation) => operation.ref.set(operation.data));
        },
      };
    },
  };
}

test('fingerprint unchanged offer is skipped', () => {
  const existing = buildCurrentOfferFingerprint(offer(), {
    generatedAt: '2026-05-05T09:00:00.000Z',
  });
  const diff = diffCurrentOffers({
    nextOffers: [offer()],
    existingFingerprints: [existing],
    generatedAt: '2026-05-05T10:00:00.000Z',
  });

  assert.equal(diff.counts.unchanged, 1);
  assert.equal(diff.estimated_writes.current_product_offers, 0);
  assert.equal(diff.summaries_to_update, 0);
});

test('price-changed offer is written and flags only affected canonical summary', () => {
  const existing = buildCurrentOfferFingerprints([
    offer(),
    offer({ source_product_id: 'src_2', offer_id: 'offer_src_2', canonical_product_id: 'cp_2' }),
  ]);
  const diff = diffCurrentOffers({
    nextOffers: [
      offer(),
      offer({ source_product_id: 'src_2', offer_id: 'offer_src_2', canonical_product_id: 'cp_2', current_price: 2.99, retail_price: 2.99 }),
    ],
    existingFingerprints: existing,
  });

  assert.equal(diff.counts.price_changed, 1);
  assert.deepEqual(diff.affected_canonical_product_ids, ['cp_2']);
  assert.equal(diff.estimated_writes.current_product_offers, 1);
  assert.equal(diff.estimated_writes.canonical_current_offer_summary, 1);
});

test('promo-changed offer is written and flagged separately from price changes', () => {
  const existing = buildCurrentOfferFingerprints([offer()]);
  const diff = diffCurrentOffers({
    nextOffers: [offer({ is_sale: true, is_promotion: true })],
    existingFingerprints: existing,
  });

  assert.equal(diff.counts.price_changed, 0);
  assert.equal(diff.counts.promo_changed, 1);
  assert.equal(diff.estimated_writes.offer_change_events, 1);
});

test('new offer is written and gets a deterministic change event id', () => {
  const diff = diffCurrentOffers({
    nextOffers: [offer({ source_product_id: 'src_new', offer_id: 'offer_src_new' })],
    existingFingerprints: [],
  });
  const firstEvents = buildOfferChangeEvents({
    diff,
    snapshotDate: '2026-05-05',
    generatedAt: '2026-05-05T10:00:00.000Z',
  });
  const secondEvents = buildOfferChangeEvents({
    diff,
    snapshotDate: '2026-05-05',
    generatedAt: '2026-05-05T10:00:00.000Z',
  });

  assert.equal(diff.counts.new, 1);
  assert.equal(firstEvents[0].event_type, 'new_offer');
  assert.equal(firstEvents[0].event_id, secondEvents[0].event_id);
});

test('removed or missing offer is reported but not deleted by default', () => {
  const existing = buildCurrentOfferFingerprints([
    offer({ source_product_id: 'src_removed', offer_id: 'offer_src_removed', canonical_product_id: 'cp_removed' }),
  ]);
  const diff = diffCurrentOffers({
    nextOffers: [],
    existingFingerprints: existing,
  });

  assert.equal(diff.counts.missing_removed, 1);
  assert.equal(diff.estimated_writes.deletes, 0);
  assert.equal(diff.estimated_writes.current_product_offers, 0);
  assert.deepEqual(diff.affected_canonical_product_ids, ['cp_removed']);
});

test('metadata-only changes update only affected canonical summaries', () => {
  const existing = buildCurrentOfferFingerprints([
    offer({ source_product_id: 'src_1', canonical_product_id: 'cp_1' }),
    offer({ source_product_id: 'src_2', offer_id: 'offer_src_2', canonical_product_id: 'cp_2' }),
  ]);
  const diff = diffCurrentOffers({
    nextOffers: [
      offer({ source_product_id: 'src_1', canonical_product_id: 'cp_1', store_name: 'Chain A Updated' }),
      offer({ source_product_id: 'src_2', offer_id: 'offer_src_2', canonical_product_id: 'cp_2' }),
    ],
    existingFingerprints: existing,
  });

  assert.equal(diff.counts.metadata_changed_only, 1);
  assert.equal(diff.change_category_report.metadata_changed_only.count, 1);
  assert.deepEqual(
    diff.change_category_report.metadata_changed_only.sample_examples[0].change_reasons,
    ['metadata.store_name']
  );
  assert.deepEqual(diff.affected_canonical_product_ids, ['cp_1']);
  assert.equal(diff.summaries_to_update, 1);
  assert.equal(diff.estimated_writes.offer_change_events, 0);
});

test('change category report separates price, promo, canonical mapping, metadata, and other policy flags', () => {
  const existing = buildCurrentOfferFingerprints([
    offer({ source_product_id: 'src_price', offer_id: 'offer_src_price', canonical_product_id: 'cp_price' }),
    offer({ source_product_id: 'src_promo', offer_id: 'offer_src_promo', canonical_product_id: 'cp_promo' }),
    offer({ source_product_id: 'src_meta', offer_id: 'offer_src_meta', canonical_product_id: 'cp_meta' }),
    offer({ source_product_id: 'src_mapping', offer_id: 'offer_src_mapping', canonical_product_id: 'cp_old' }),
  ]);
  const diff = diffCurrentOffers({
    nextOffers: [
      offer({ source_product_id: 'src_price', offer_id: 'offer_src_price', canonical_product_id: 'cp_price', current_price: 2.99, retail_price: 2.99 }),
      offer({ source_product_id: 'src_promo', offer_id: 'offer_src_promo', canonical_product_id: 'cp_promo', is_sale: true, is_promotion: true }),
      offer({ source_product_id: 'src_meta', offer_id: 'offer_src_meta', canonical_product_id: 'cp_meta', store_name: 'Updated Store' }),
      offer({ source_product_id: 'src_mapping', offer_id: 'offer_src_mapping', canonical_product_id: 'cp_new' }),
      offer({ source_product_id: 'src_new', offer_id: 'offer_src_new', canonical_product_id: 'cp_new_offer' }),
    ],
    existingFingerprints: existing,
  });

  assert.equal(diff.counts.new_offers, 1);
  assert.equal(diff.counts.price_changed, 1);
  assert.equal(diff.counts.promo_changed, 1);
  assert.equal(diff.counts.metadata_changed_only, 1);
  assert.equal(diff.counts.canonical_mapping_changed, 1);
  assert.equal(diff.change_category_report.price_changed.requires_offer_change_events_write, true);
  assert.equal(diff.change_category_report.metadata_changed_only.requires_offer_change_events_write, false);
  assert.equal(diff.change_category_report.canonical_mapping_changed.sample_examples[0].previous_canonical_product_id, 'cp_old');
  assert.deepEqual(diff.change_category_report.canonical_mapping_changed.sample_examples[0].change_reasons, ['canonical.canonical_product_id']);
});

test('event policy estimates suppress metadata-only events by default and expose variants', () => {
  const existing = buildCurrentOfferFingerprints([
    offer({ source_product_id: 'src_price', offer_id: 'offer_src_price', canonical_product_id: 'cp_price' }),
    offer({ source_product_id: 'src_meta', offer_id: 'offer_src_meta', canonical_product_id: 'cp_meta' }),
  ]);
  const defaultDiff = diffCurrentOffers({
    nextOffers: [
      offer({ source_product_id: 'src_price', offer_id: 'offer_src_price', canonical_product_id: 'cp_price', current_price: 2.99, retail_price: 2.99 }),
      offer({ source_product_id: 'src_meta', offer_id: 'offer_src_meta', canonical_product_id: 'cp_meta', store_name: 'Updated Store' }),
    ],
    existingFingerprints: existing,
  });
  const auditDiff = diffCurrentOffers({
    nextOffers: [
      offer({ source_product_id: 'src_price', offer_id: 'offer_src_price', canonical_product_id: 'cp_price', current_price: 2.99, retail_price: 2.99 }),
      offer({ source_product_id: 'src_meta', offer_id: 'offer_src_meta', canonical_product_id: 'cp_meta', store_name: 'Updated Store' }),
    ],
    existingFingerprints: existing,
    eventPolicy: 'all_changes',
  });
  const noEventDiff = diffCurrentOffers({
    nextOffers: [
      offer({ source_product_id: 'src_price', offer_id: 'offer_src_price', canonical_product_id: 'cp_price', current_price: 2.99, retail_price: 2.99 }),
      offer({ source_product_id: 'src_meta', offer_id: 'offer_src_meta', canonical_product_id: 'cp_meta', store_name: 'Updated Store' }),
    ],
    existingFingerprints: existing,
    eventPolicy: 'none',
  });

  assert.equal(defaultDiff.event_policy, 'price_promo_availability');
  assert.equal(defaultDiff.estimated_writes.offer_change_events, 1);
  assert.equal(defaultDiff.estimated_writes.metadata_only_events_suppressed, true);
  assert.equal(defaultDiff.estimated_write_policy_variants.full_audit_policy.offer_change_events, 2);
  assert.equal(defaultDiff.estimated_write_policy_variants.price_event_policy.offer_change_events, 1);
  assert.equal(defaultDiff.estimated_write_policy_variants.current_state_only_policy.offer_change_events, 0);
  assert.equal(auditDiff.estimated_writes.offer_change_events, 2);
  assert.equal(noEventDiff.estimated_writes.offer_change_events, 0);
});

test('incremental diff options default and validate event policy env', () => {
  const baseEnv = {
    PRICER_SNAPSHOT_DATE: '2026-05-05',
    PRICER_FIRESTORE_PROJECT_ID: 'pricer-ee440',
    PRICER_FIRESTORE_COLLECTION_PREFIX: 'prod',
  };
  const defaults = resolveIncrementalDiffOptions(baseEnv);
  const none = resolveIncrementalDiffOptions({
    ...baseEnv,
    PRICER_INCREMENTAL_EVENT_POLICY: 'none',
  });

  assert.equal(defaults.eventPolicy, 'price_promo_availability');
  assert.equal(none.eventPolicy, 'none');
  assert.throws(
    () => resolveIncrementalDiffOptions({
      ...baseEnv,
      PRICER_INCREMENTAL_EVENT_POLICY: 'metadata_only',
    }),
    /PRICER_INCREMENTAL_EVENT_POLICY/u
  );
});

test('daily diff diagnostics report top chains, samples, prices, mappings, and churn heuristic', () => {
  const missingOffer = offer({
    source_product_id: 'src_old',
    offer_id: 'offer_src_old',
    canonical_product_id: 'cp_old',
    source_product_name_raw: 'Milk 1L',
    category_code: 'dairy',
    chain_name: 'Chain A',
    retailer: 'Chain A',
    store_id: '1000::chain-a',
    store_name: 'Chain A Sofia',
  });
  const existing = [
    buildCurrentOfferFingerprint(offer({
      source_product_id: 'src_price',
      offer_id: 'offer_src_price',
      canonical_product_id: 'cp_price',
      source_product_name_raw: 'Bread',
      category_code: 'bakery',
      chain_name: 'Chain B',
      retailer: 'Chain B',
      current_price: 2.49,
      retail_price: 2.49,
    })),
    buildCurrentOfferFingerprint(offer({
      source_product_id: 'src_mapping',
      offer_id: 'offer_src_mapping',
      canonical_product_id: 'cp_before',
      source_product_name_raw: 'Cheese',
      category_code: 'dairy',
      chain_name: 'Chain A',
      retailer: 'Chain A',
    })),
    buildCurrentOfferFingerprint(missingOffer),
  ];
  existing[2].source_product_name_raw = missingOffer.source_product_name_raw;
  existing[2].category_code = missingOffer.category_code;
  existing[2].chain_name = missingOffer.chain_name;
  existing[2].retailer = missingOffer.retailer;
  existing[2].store_id = missingOffer.store_id;
  existing[2].store_name = missingOffer.store_name;

  const nextOffers = [
    offer({
      source_product_id: 'src_price',
      offer_id: 'offer_src_price',
      canonical_product_id: 'cp_price',
      source_product_name_raw: 'Bread',
      category_code: 'bakery',
      chain_name: 'Chain B',
      retailer: 'Chain B',
      current_price: 2.99,
      retail_price: 2.99,
    }),
    offer({
      source_product_id: 'src_mapping',
      offer_id: 'offer_src_mapping',
      canonical_product_id: 'cp_after',
      source_product_name_raw: 'Cheese',
      category_code: 'dairy',
      chain_name: 'Chain A',
      retailer: 'Chain A',
    }),
    offer({
      source_product_id: 'src_new',
      offer_id: 'offer_src_new',
      canonical_product_id: 'cp_old',
      source_product_name_raw: 'Milk 1L',
      category_code: 'dairy',
      chain_name: 'Chain A',
      retailer: 'Chain A',
      store_id: '1000::chain-a',
      store_name: 'Chain A Sofia',
    }),
  ];
  const diff = diffCurrentOffers({
    nextOffers,
    existingFingerprints: existing,
  });

  const diagnostics = buildDailyDiffDiagnostics({
    diff,
    nextOffers,
    existingFingerprints: existing,
  });

  assert.equal(diagnostics.new_offers.top_chains_or_retailers[0].value, 'Chain A');
  assert.equal(diagnostics.new_offers.top_categories[0].value, 'dairy');
  assert.equal(diagnostics.missing_removed.similar_new_offer_heuristic.available, true);
  assert.equal(diagnostics.missing_removed.similar_new_offer_heuristic.likely_same_real_offer_pairs, 1);
  assert.equal(diagnostics.missing_removed.similar_new_offer_heuristic.likely_same_real_offer_with_new_id, 1);
  assert.equal(diagnostics.missing_removed.similar_new_offer_heuristic.sample_pairs[0].source_product_id_changed, true);
  assert.equal(diagnostics.canonical_mapping_changed.samples[0].previous_canonical_product_id, 'cp_before');
  assert.equal(diagnostics.canonical_mapping_changed.samples[0].next_canonical_product_id, 'cp_after');
  assert.equal(diagnostics.price_changed.samples[0].previous_current_price, 2.49);
  assert.equal(diagnostics.price_changed.samples[0].next_current_price, 2.99);
});

test('rich baseline record carries old-side diagnostic fields for replacement analysis', () => {
  const baseline = buildRichCurrentOfferBaselineRecord(offer({
    source_product_id: 'src_rich',
    offer_id: 'offer_src_rich',
    source_product_name_raw: 'BILLA Milk 1L',
    canonical_name: 'Milk',
    category_code: 'dairy',
    chain_name: 'BILLA',
    retailer: 'BILLA',
    store_id: '1000::billa',
    store_name: 'BILLA Sofia',
    locality_code: '1000',
    region: 'Sofia',
    product_code: '12345',
  }), {
    generatedAt: '2026-05-05T10:00:00.000Z',
  });

  assert.equal(baseline.baseline_mode, 'rich');
  assert.equal(baseline.offer_fingerprint.length, 64);
  assert.equal(baseline.source_product_name_raw, 'BILLA Milk 1L');
  assert.equal(baseline.canonical_name, 'Milk');
  assert.equal(baseline.category_code, 'dairy');
  assert.equal(baseline.retailer, 'BILLA');
  assert.equal(baseline.store_name, 'BILLA Sofia');
  assert.equal(baseline.locality_code, '1000');
  assert.equal(baseline.product_code, '12345');
});

test('rich JSONL baseline loader preserves diagnostic fields and Billa replacement heuristic uses them', async () => {
  const missing = buildRichCurrentOfferBaselineRecord(offer({
    source_product_id: 'billa_old',
    offer_id: 'offer_billa_old',
    canonical_product_id: 'cp_milk',
    source_product_name_raw: 'Milk 1L',
    category_code: 'dairy',
    chain_name: 'BILLA',
    retailer: 'BILLA',
    store_id: '1000::billa',
    store_name: 'BILLA Sofia',
  }));
  const baselinePath = tempFilePath('rich-baseline.jsonl');
  fs.writeFileSync(baselinePath, `${JSON.stringify(missing)}\n`);
  const loaded = await loadExistingFingerprintsFromJson(baselinePath, { logger: () => {} });
  const nextOffers = [
    offer({
      source_product_id: 'billa_new',
      offer_id: 'offer_billa_new',
      canonical_product_id: 'cp_milk',
      source_product_name_raw: 'Milk 1L',
      category_code: 'dairy',
      chain_name: 'BILLA',
      retailer: 'BILLA',
      store_id: '1000::billa',
      store_name: 'BILLA Sofia',
    }),
  ];
  const diff = diffCurrentOffers({
    nextOffers,
    existingFingerprints: loaded.rows,
  });
  const diagnostics = buildDailyDiffDiagnostics({
    diff,
    nextOffers,
    existingFingerprints: loaded.rows,
  });

  assert.equal(loaded.rows[0].baseline_mode, 'rich');
  assert.equal(loaded.rows[0].source_product_name_raw, 'Milk 1L');
  assert.equal(diagnostics.baseline_detail_availability.compact_baseline_likely, false);
  assert.equal(diagnostics.missing_removed.similar_new_offer_heuristic.available, true);
  assert.equal(diagnostics.missing_removed.similar_new_offer_heuristic.likely_same_real_offer_with_new_id, 1);
  assert.equal(diagnostics.missing_removed.similar_new_offer_heuristic.likely_genuinely_new, 0);
  assert.equal(diagnostics.missing_removed.similar_new_offer_heuristic.likely_genuinely_removed, 0);
  assert.equal(diagnostics.billa_diagnostics.billa_new_count, 1);
  assert.equal(diagnostics.billa_diagnostics.billa_missing_count, 1);
  assert.equal(diagnostics.billa_diagnostics.billa_likely_replacements, 1);
  assert.equal(diagnostics.billa_diagnostics.source_product_id_changed_while_product_store_looks_same, true);
});

test('daily diff diagnostics mark replacement heuristic unavailable for compact baselines', () => {
  const existing = [
    buildCompactCurrentOfferBaselineRecord(offer({
      source_product_id: 'src_old',
      canonical_product_id: 'cp_old',
    })),
  ];
  const nextOffers = [
    offer({
      source_product_id: 'src_new',
      offer_id: 'offer_src_new',
      canonical_product_id: 'cp_new',
      source_product_name_raw: 'Milk 1L',
      category_code: 'dairy',
      chain_name: 'Chain A',
    }),
  ];
  const diff = diffCurrentOffers({
    nextOffers,
    existingFingerprints: existing,
  });

  const diagnostics = buildDailyDiffDiagnostics({
    diff,
    nextOffers,
    existingFingerprints: existing,
  });

  assert.equal(diagnostics.baseline_detail_availability.compact_baseline_likely, true);
  assert.equal(diagnostics.missing_removed.similar_new_offer_heuristic.available, false);
  assert.match(diagnostics.missing_removed.similar_new_offer_heuristic.reason, /compact baseline/u);
});

test('historical mode does not touch current read model by default', async () => {
  const result = await runHistoricalSnapshotPublish({
    snapshotDate: '2026-04-21',
    snapshotUrl: 'https://example.test/2026-04-21.zip',
    zipFilePath: fixturePath('phase6_snapshot_2026-04-21.zip'),
    projectId: 'pricer-ee440',
    databaseId: '(default)',
    collectionPrefix: 'prod',
    targetCollections: ['raw_price_snapshots', 'product_daily_prices', 'ingest_runs', 'pipeline_logs'],
    dryRun: true,
    now: '2026-05-05T10:00:00.000Z',
  });

  assert.equal(result.publish.current_product_offers, undefined);
  assert.equal(result.publish.canonical_current_offer_summary, undefined);
  assert.equal(result.destructive_deletes, false);
});

test('incremental dry-run writes nothing and produces a manifest from a local baseline', async () => {
  const baselinePath = tempJsonFile({ current_offer_fingerprints: [] });
  const result = await runIncrementalSnapshotDiff({
    snapshotDate: '2026-04-21',
    snapshotUrl: 'https://example.test/2026-04-21.zip',
    zipFilePath: fixturePath('phase6_snapshot_2026-04-21.zip'),
    projectId: 'pricer-ee440',
    databaseId: '(default)',
    collectionPrefix: 'prod',
    baselinePath,
    now: '2026-05-05T10:00:00.000Z',
  });

  assert.equal(result.dry_run, true);
  assert.equal(result.writes_performed, 0);
  assert.equal(result.comparison.mode, 'local_baseline_file');
  assert.equal(Object.prototype.hasOwnProperty.call(result.comparison, 'existing_fingerprints'), false);
  assert.equal(result.manifest.snapshot_date, '2026-04-21');
  assert.equal(result.estimated_firestore_reads.firestore, 0);
});

test('deterministic fingerprint and manifest ids make reruns idempotent', () => {
  const firstFingerprint = buildCurrentOfferFingerprint(offer(), {
    generatedAt: '2026-05-05T10:00:00.000Z',
  });
  const secondFingerprint = buildCurrentOfferFingerprint(offer(), {
    generatedAt: '2026-05-05T11:00:00.000Z',
  });
  const diff = diffCurrentOffers({
    nextOffers: [offer()],
    existingFingerprints: [],
  });
  const firstManifest = buildSnapshotManifest({
    snapshotDate: '2026-05-05',
    collectionPrefix: 'prod',
    diff,
  });
  const secondManifest = buildSnapshotManifest({
    snapshotDate: '2026-05-05',
    collectionPrefix: 'prod',
    diff,
  });

  assert.equal(firstFingerprint.fingerprint_hash, secondFingerprint.fingerprint_hash);
  assert.equal(firstManifest.manifest_id, secondManifest.manifest_id);
});

test('compact baseline record carries only diff-ready fields and aliases offer_fingerprint', () => {
  const baseline = buildCompactCurrentOfferBaselineRecord(offer(), {
    generatedAt: '2026-05-05T10:00:00.000Z',
  });
  const full = buildCurrentOfferFingerprint(offer(), {
    generatedAt: '2026-05-05T10:00:00.000Z',
  });

  assert.equal(baseline.source_product_id, 'src_1');
  assert.equal(baseline.offer_fingerprint, full.fingerprint_hash);
  assert.equal(baseline.price, 2.49);
  assert.equal(baseline.is_sale, false);
  assert.equal(baseline.snapshot_date, '2026-05-05');
  assert.equal(Object.prototype.hasOwnProperty.call(baseline, 'fingerprint_payload'), false);
});

test('baseline JSONL loader streams rows, ignores blanks, and feeds incremental diff without Firestore reads', async () => {
  const baseline = buildCompactCurrentOfferBaselineRecord(offer(), {
    generatedAt: '2026-05-05T10:00:00.000Z',
  });
  const baselinePath = tempFilePath('baseline.jsonl');
  fs.writeFileSync(baselinePath, `\n${JSON.stringify(baseline)}\n\n`);
  const loaded = await loadExistingFingerprintsFromJson(baselinePath, {
    progressEvery: 1,
    logger: () => {},
  });
  const diff = diffCurrentOffers({
    nextOffers: [offer()],
    existingFingerprints: loaded.rows,
  });

  assert.equal(loaded.rows.length, 1);
  assert.equal(loaded.rows[0].offer_fingerprint, baseline.offer_fingerprint);
  assert.equal(loaded.report.format, 'jsonl');
  assert.equal(loaded.report.lines_read, 3);
  assert.equal(loaded.report.blank_lines, 2);
  assert.equal(loaded.report.loaded_fingerprints, 1);
  assert.equal(diff.counts.unchanged, 1);
});

test('baseline JSONL loader reports malformed line numbers clearly', async () => {
  const baselinePath = tempFilePath('bad-baseline.jsonl');
  fs.writeFileSync(baselinePath, `${JSON.stringify({ source_product_id: 'src_ok', offer_fingerprint: 'abc' })}\n{bad json}\n`);

  await assert.rejects(
    () => loadExistingFingerprintsFromJson(baselinePath, { logger: () => {} }),
    (error) => {
      assert.match(error.message, /bad-baseline\.jsonl:2/u);
      assert.match(error.message, /Malformed JSONL baseline/u);
      return true;
    }
  );
});

test('baseline loader keeps small JSON format support and reports duplicate source ids', async () => {
  const first = buildCurrentOfferFingerprint(offer({
    source_product_id: 'src_dup',
    offer_id: 'offer_src_dup_a',
    current_price: 2.49,
    retail_price: 2.49,
  }));
  const second = buildCurrentOfferFingerprint(offer({
    source_product_id: 'src_dup',
    offer_id: 'offer_src_dup_b',
    current_price: 2.99,
    retail_price: 2.99,
  }));
  const baselinePath = tempJsonFile({
    current_offer_fingerprints: [first, second],
  });

  const loaded = await loadExistingFingerprintsFromJson(baselinePath, { logger: () => {} });

  assert.equal(loaded.rows.length, 1);
  assert.equal(loaded.rows[0].offer_id, 'offer_src_dup_b');
  assert.equal(loaded.report.format, 'json');
  assert.equal(loaded.report.duplicate_source_product_ids, 1);
  assert.equal(loaded.report.duplicate_handling, 'last_row_wins_by_source_product_id');
});

test('baseline JSONL duplicate source ids use last row deterministically and report count', async () => {
  const first = buildCompactCurrentOfferBaselineRecord(offer({
    source_product_id: 'src_dup',
    offer_id: 'offer_src_dup_a',
    current_price: 2.49,
    retail_price: 2.49,
  }));
  const second = buildCompactCurrentOfferBaselineRecord(offer({
    source_product_id: 'src_dup',
    offer_id: 'offer_src_dup_b',
    current_price: 2.99,
    retail_price: 2.99,
  }));
  const baselinePath = tempFilePath('duplicate-baseline.jsonl');
  fs.writeFileSync(baselinePath, `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);

  const loaded = await loadExistingFingerprintsFromJson(baselinePath, { logger: () => {} });

  assert.equal(loaded.rows.length, 1);
  assert.equal(loaded.rows[0].price, 2.99);
  assert.equal(loaded.report.duplicate_source_product_ids, 1);
});

test('baseline export reads current offers by pages and writes local JSONL only by default', async () => {
  const outputPath = tempFilePath('export.jsonl');
  const firestore = createFakeBaselineFirestore([
    offer({ offer_id: 'offer_b', source_product_id: 'src_b', canonical_product_id: 'cp_b' }),
    offer({ offer_id: 'offer_a', source_product_id: 'src_a', canonical_product_id: 'cp_a' }),
  ]);
  const result = await exportCurrentOfferFingerprintBaseline({
    projectId: 'pricer-ee440',
    databaseId: '(default)',
    collectionPrefix: 'prod',
    outputPath,
    limit: null,
    batchSize: 1,
    progressEvery: 1,
    firestore,
    logger: () => {},
    now: '2026-05-05T10:00:00.000Z',
  });
  const lines = fs.readFileSync(outputPath, 'utf8').trim().split(/\r?\n/u).map((line) => JSON.parse(line));

  assert.equal(result.processed_current_product_offers, 2);
  assert.equal(result.exported_fingerprints, 2);
  assert.equal(result.firestore_writes_enabled, false);
  assert.equal(firestore.writes.length, 0);
  assert.deepEqual(lines.map((row) => row.source_product_id), ['src_a', 'src_b']);
  assert.equal(lines.every((row) => typeof row.offer_fingerprint === 'string'), true);
});

test('baseline export rich mode writes local JSONL diagnostics without Firestore writes', async () => {
  const outputPath = tempFilePath('export-rich.jsonl');
  const firestore = createFakeBaselineFirestore([
    offer({
      offer_id: 'offer_a',
      source_product_id: 'src_a',
      canonical_product_id: 'cp_a',
      source_product_name_raw: 'Milk 1L',
      category_code: 'dairy',
      chain_name: 'BILLA',
      retailer: 'BILLA',
      store_id: '1000::billa',
    }),
  ]);
  const result = await exportCurrentOfferFingerprintBaseline({
    projectId: 'pricer-ee440',
    databaseId: '(default)',
    collectionPrefix: 'prod',
    outputPath,
    baselineMode: 'rich',
    firestore,
    logger: () => {},
    now: '2026-05-05T10:00:00.000Z',
  });
  const [line] = fs.readFileSync(outputPath, 'utf8').trim().split(/\r?\n/u).map((entry) => JSON.parse(entry));

  assert.equal(result.baseline_mode, 'rich');
  assert.equal(result.firestore_writes_enabled, false);
  assert.equal(firestore.writes.length, 0);
  assert.equal(line.baseline_mode, 'rich');
  assert.equal(line.source_product_name_raw, 'Milk 1L');
  assert.equal(line.category_code, 'dairy');
  assert.equal(line.retailer, 'BILLA');
});

test('baseline export can append from a source-product resume id', async () => {
  const outputPath = tempFilePath('export-resume.jsonl');
  fs.writeFileSync(outputPath, `${JSON.stringify({ source_product_id: 'src_a', offer_fingerprint: 'old' })}\n`);
  const firestore = createFakeBaselineFirestore([
    offer({ offer_id: 'offer_a', source_product_id: 'src_a', canonical_product_id: 'cp_a' }),
    offer({ offer_id: 'offer_b', source_product_id: 'src_b', canonical_product_id: 'cp_b' }),
  ]);
  const result = await exportCurrentOfferFingerprintBaseline({
    projectId: 'pricer-ee440',
    databaseId: '(default)',
    collectionPrefix: 'prod',
    outputPath,
    startAfterDocumentId: 'offer_a',
    appendOutput: true,
    firestore,
    logger: () => {},
    now: '2026-05-05T10:00:00.000Z',
  });
  const lines = fs.readFileSync(outputPath, 'utf8').trim().split(/\r?\n/u).map((entry) => JSON.parse(entry));

  assert.equal(result.append_output, true);
  assert.equal(result.start_after_document_id, 'offer_a');
  assert.equal(result.processed_current_product_offers, 1);
  assert.deepEqual(lines.map((row) => row.source_product_id), ['src_a', 'src_b']);
});

test('fingerprint collection backfill mode is dry-run by default', async () => {
  const outputPath = tempFilePath('backfill-dry-run.jsonl');
  const firestore = createFakeBaselineFirestore([
    offer({ offer_id: 'offer_a', source_product_id: 'src_a', canonical_product_id: 'cp_a' }),
  ]);
  const result = await exportCurrentOfferFingerprintBaseline({
    projectId: 'pricer-ee440',
    databaseId: '(default)',
    collectionPrefix: 'prod',
    outputPath,
    backfillFirestore: true,
    backfillDryRun: true,
    firestore,
    logger: () => {},
    now: '2026-05-05T10:00:00.000Z',
  });

  assert.equal(result.backfill_dry_run, true);
  assert.equal(result.backfill_records_to_write, 1);
  assert.equal(result.firestore_writes_enabled, false);
  assert.equal(firestore.writes.length, 0);
});

test('diff estimates changed writes instead of full current-offer rewrites', () => {
  const existing = buildCurrentOfferFingerprints([
    offer({ source_product_id: 'src_1', canonical_product_id: 'cp_1' }),
    offer({ source_product_id: 'src_2', offer_id: 'offer_src_2', canonical_product_id: 'cp_2' }),
    offer({ source_product_id: 'src_3', offer_id: 'offer_src_3', canonical_product_id: 'cp_3' }),
  ]);
  const diff = diffCurrentOffers({
    nextOffers: [
      offer({ source_product_id: 'src_1', canonical_product_id: 'cp_1' }),
      offer({ source_product_id: 'src_2', offer_id: 'offer_src_2', canonical_product_id: 'cp_2', current_price: 3.49, retail_price: 3.49 }),
      offer({ source_product_id: 'src_3', offer_id: 'offer_src_3', canonical_product_id: 'cp_3' }),
    ],
    existingFingerprints: existing,
  });

  assert.equal(diff.scanned_next_offers, 3);
  assert.equal(diff.estimated_writes.current_product_offers, 1);
  assert.ok(diff.estimated_writes.current_product_offers < diff.scanned_next_offers);
});

test('high-write real writer refuses without catch-up acknowledgement', () => {
  const diff = diffCurrentOffers({
    nextOffers: [
      offer({ source_product_id: 'src_1', canonical_product_id: 'cp_1' }),
      offer({ source_product_id: 'src_2', offer_id: 'offer_src_2', canonical_product_id: 'cp_2' }),
    ],
    existingFingerprints: [],
  });
  const plan = buildIncrementalWriterPlan({
    diff,
    dryRun: false,
    highWriteThreshold: 1,
  });

  assert.equal(plan.high_write, true);
  assert.equal(plan.can_write, false);
  assert.match(plan.refusal_reason, /ALLOW_HIGH_WRITE_CATCHUP=true/u);
});

test('high-write dry-run stays no-write but reports catch-up gate status', () => {
  const diff = diffCurrentOffers({
    nextOffers: [
      offer({ source_product_id: 'src_billa_1', canonical_product_id: 'cp_billa_1', chain_name: 'BILLA', retailer: 'BILLA' }),
      offer({ source_product_id: 'src_billa_2', offer_id: 'offer_src_billa_2', canonical_product_id: 'cp_billa_2', chain_name: 'BILLA', retailer: 'BILLA' }),
    ],
    existingFingerprints: [],
  });
  const plan = buildIncrementalWriterPlan({
    diff,
    dryRun: true,
    highWriteThreshold: 1,
  });

  assert.equal(plan.dry_run, true);
  assert.equal(plan.high_write, true);
  assert.equal(plan.can_write, false);
  assert.equal(plan.refusal_reason, null);
});

test('high-write real writer is allowed with catch-up acknowledgement and writes new Billa-like offers', async () => {
  const now = '2026-05-05T10:00:00.000Z';
  const existing = buildCurrentOfferFingerprints([
    offer({ source_product_id: 'src_same', offer_id: 'offer_src_same', canonical_product_id: 'cp_same' }),
  ]);
  const nextOffers = [
    offer({ source_product_id: 'src_same', offer_id: 'offer_src_same', canonical_product_id: 'cp_same' }),
    offer({
      source_product_id: 'src_billa_new',
      offer_id: 'offer_src_billa_new',
      canonical_product_id: 'cp_billa',
      chain_name: 'BILLA',
      retailer: 'BILLA',
      source_chain_name_normalized: 'billa',
    }),
  ];
  const diff = diffCurrentOffers({
    nextOffers,
    existingFingerprints: existing,
    generatedAt: now,
  });
  const plan = buildIncrementalWriterPlan({
    diff,
    dryRun: false,
    allowHighWriteCatchup: true,
    highWriteThreshold: 1,
  });
  const manifest = buildSnapshotManifest({
    snapshotDate: '2026-05-05',
    collectionPrefix: 'prod',
    diff,
  });
  const firestore = createFakeBaselineFirestore([]);
  const result = await applyIncrementalWriter({
    firestore,
    collectionPrefix: 'prod',
    diff,
    manifest,
    writerPlan: plan,
    nextOffers,
    currentOfferSummaries: [
      { canonical_product_id: 'cp_billa', offer_count: 1, updated_at: now },
      { canonical_product_id: 'cp_same', offer_count: 1, updated_at: now },
    ],
    existingFingerprints: existing,
    snapshotDate: '2026-05-05',
    eventPolicy: 'price_promo_availability',
    now,
    dryRun: false,
  });

  const writesByCollection = firestore.writes.reduce((counts, write) => {
    counts[write.collectionId] = (counts[write.collectionId] || 0) + 1;
    return counts;
  }, {});
  assert.equal(plan.can_write, true);
  assert.equal(result.firestore_writes_enabled, true);
  assert.equal(writesByCollection.prod_current_product_offers, 1);
  assert.equal(writesByCollection.prod_current_offer_fingerprints, 1);
  assert.equal(writesByCollection.prod_offer_change_events, 1);
  assert.equal(writesByCollection.prod_canonical_current_offer_summary, 1);
  assert.equal(writesByCollection.prod_snapshot_manifests, 1);
  assert.equal(
    firestore.writes.find((write) => write.collectionId === 'prod_current_product_offers').data.source_product_id,
    'src_billa_new'
  );
  assert.equal(
    firestore.writes.find((write) => write.collectionId === 'prod_canonical_current_offer_summary').data.canonical_product_id,
    'cp_billa'
  );
});

test('incremental writer keeps missing_removed report-only and never deletes by default', () => {
  const existing = buildCurrentOfferFingerprints([
    offer({ source_product_id: 'src_removed', offer_id: 'offer_src_removed', canonical_product_id: 'cp_removed' }),
  ]);
  const diff = diffCurrentOffers({
    nextOffers: [],
    existingFingerprints: existing,
  });
  const plan = buildIncrementalWriterPlan({
    diff,
    dryRun: false,
    allowHighWriteCatchup: true,
  });

  assert.equal(plan.missing_removed_count, 1);
  assert.equal(plan.missing_removed_action, 'report_only');
  assert.equal(diff.estimated_writes.deletes, 0);
  assert.equal(plan.changed_current_offer_count, 0);
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

  console.log(`\nPhase 6 incremental ingest diff tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
