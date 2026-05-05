const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildCompactCurrentOfferBaselineRecord,
  buildCurrentOfferFingerprint,
  buildCurrentOfferFingerprints,
  buildOfferChangeEvents,
  buildSnapshotManifest,
  diffCurrentOffers,
} = require('../app/functions/src');
const {
  loadExistingFingerprintsFromJson,
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
              queryState.startAfterId = doc.id;
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

  assert.equal(diff.counts.metadata_changed, 1);
  assert.deepEqual(diff.affected_canonical_product_ids, ['cp_1']);
  assert.equal(diff.summaries_to_update, 1);
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

test('baseline JSONL loader feeds incremental diff without Firestore reads', () => {
  const baseline = buildCompactCurrentOfferBaselineRecord(offer(), {
    generatedAt: '2026-05-05T10:00:00.000Z',
  });
  const baselinePath = tempFilePath('baseline.jsonl');
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline)}\n`);
  const loaded = loadExistingFingerprintsFromJson(baselinePath);
  const diff = diffCurrentOffers({
    nextOffers: [offer()],
    existingFingerprints: loaded,
  });

  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].offer_fingerprint, baseline.offer_fingerprint);
  assert.equal(diff.counts.unchanged, 1);
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
