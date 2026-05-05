const assert = require('node:assert/strict');
const path = require('node:path');

const {
  InMemoryDataBackboneStore,
  buildDocumentId,
  createPlannedAdminIngestJob,
  handleCreateAdminIngestJobRequest,
  importDailySnapshotZip,
  planHistoricalIngest,
} = require('../app/functions/src');
const {
  publishCollection,
  runHistoricalSnapshotPublish,
} = require('../scripts/ingest_phase6_snapshot_firestore');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function fixturePath(name) {
  return path.join(__dirname, '..', 'data_samples', name);
}

function createFakeFirestore(existingIds = []) {
  const writes = [];
  const deletes = [];
  const collections = [];
  const existing = new Set(existingIds);

  return {
    writes,
    deletes,
    collections,
    collection(collectionId) {
      collections.push(collectionId);
      return {
        doc(documentId) {
          return {
            id: documentId,
            async get() {
              return { exists: existing.has(documentId) };
            },
            set(data) {
              writes.push({ collectionId, documentId, data });
              existing.add(documentId);
            },
            delete() {
              deletes.push({ collectionId, documentId });
            },
          };
        },
      };
    },
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

test('historical snapshot dry-run writes nothing and does not build current read models by default', async () => {
  const result = await runHistoricalSnapshotPublish({
    snapshotDate: '2026-04-21',
    snapshotUrl: 'https://example.test/2026-04-21.zip',
    zipFilePath: fixturePath('phase6_snapshot_2026-04-21.zip'),
    projectId: 'pricer-ee440',
    databaseId: '(default)',
    collectionPrefix: 'prod',
    targetCollections: ['raw_price_snapshots', 'product_daily_prices', 'ingest_runs', 'pipeline_logs'],
    dryRun: true,
    now: '2026-05-03T12:00:00.000Z',
  });

  assert.equal(result.dry_run, true);
  assert.equal(result.destructive_deletes, false);
  assert.equal(result.full_store_load_save_production_path, false);
  assert.equal(result.publish.raw_price_snapshots.written_records, 0);
  assert.equal(result.publish.product_daily_prices.written_records, 0);
  assert.equal(result.publish.current_product_offers, undefined);
  assert.equal(result.ingest.unique_rows, 2);
});

test('historical date produces deterministic raw and daily price document ids', async () => {
  const firstStore = new InMemoryDataBackboneStore();
  const secondStore = new InMemoryDataBackboneStore();
  const options = {
    zipFilePath: fixturePath('phase6_snapshot_2026-04-21.zip'),
    snapshotDate: '2026-04-21',
    sourceUrl: 'https://example.test/2026-04-21.zip',
  };

  const first = await importDailySnapshotZip({
    store: firstStore,
    ...options,
    ingestedAt: '2026-05-03T12:00:00.000Z',
  });
  const second = await importDailySnapshotZip({
    store: secondStore,
    ...options,
    ingestedAt: '2026-05-03T12:30:00.000Z',
  });

  const firstRawIds = first.state.raw_price_snapshots.map((row) => buildDocumentId('raw_price_snapshots', row));
  const secondRawIds = second.state.raw_price_snapshots.map((row) => buildDocumentId('raw_price_snapshots', row));
  assert.deepEqual(firstRawIds, secondRawIds);
});

test('historical publisher respects collection prefix and never deletes records', async () => {
  const firestore = createFakeFirestore();
  const records = [{
    source_product_id: 'src_1',
    date: '2026-04-21',
    price_avg: 1,
    price_min: 1,
    price_max: 1,
    store_count: 1,
    snapshot_count: 1,
  }];

  const result = await publishCollection({
    firestore,
    collectionPrefix: 'prod',
    collectionName: 'product_daily_prices',
    records,
    skipExisting: true,
    dryRun: false,
  });

  assert.deepEqual(firestore.collections, ['prod_product_daily_prices']);
  assert.equal(firestore.writes.length, 1);
  assert.equal(firestore.deletes.length, 0);
  assert.equal(result.written_records, 1);
});

test('repeat publish skips existing deterministic document ids', async () => {
  const record = {
    source_product_id: 'src_1',
    date: '2026-04-21',
    price_avg: 1,
    price_min: 1,
    price_max: 1,
    store_count: 1,
    snapshot_count: 1,
  };
  const existingId = buildDocumentId('product_daily_prices', record);
  const firestore = createFakeFirestore([existingId]);

  const result = await publishCollection({
    firestore,
    collectionPrefix: 'prod',
    collectionName: 'product_daily_prices',
    records: [record],
    skipExisting: true,
    dryRun: false,
  });

  assert.equal(result.skipped_existing_records, 1);
  assert.equal(result.written_records, 0);
  assert.equal(firestore.writes.length, 0);
});

test('admin ingest endpoint creates planned job records only', async () => {
  const store = new InMemoryDataBackboneStore();
  const response = await handleCreateAdminIngestJobRequest({
    store,
    body: {
      snapshot_date: '2026-04-21',
      source_type: 'url',
      source_url: 'https://example.test/2026-04-21.zip',
      dry_run: true,
      target_collections: ['raw_price_snapshots', 'product_daily_prices'],
      firestore_prefix: 'prod',
    },
    req: {
      headers: {
        'x-pricer-admin-id': 'operator-test',
      },
    },
  });
  const state = await store.load();

  assert.equal(response.status, 201);
  assert.equal(state.admin_ingest_jobs.length, 1);
  assert.equal(state.admin_ingest_jobs[0].status, 'planned');
  assert.equal(state.admin_ingest_jobs[0].created_by, 'operator-test');
  assert.equal(state.raw_price_snapshots.length, 0);
});

test('admin ingest plan warns when current read model targets are selected', () => {
  const plan = planHistoricalIngest({
    body: {
      snapshot_date: '2026-04-21',
      source_type: 'url',
      source_url: 'https://example.test/2026-04-21.zip',
      target_collections: ['raw_price_snapshots', 'current_product_offers'],
      dry_run: true,
    },
  });

  assert.equal(plan.command.includes('npm run phase6:ingest-snapshot'), true);
  assert.equal(plan.warnings.some((warning) => warning.includes('Current read-model')), true);
});

test('planned ingest job model stores required operator metadata fields', async () => {
  const store = new InMemoryDataBackboneStore();
  const job = await createPlannedAdminIngestJob({
    store,
    body: {
      snapshot_date: '2026-04-21',
      source_type: 'local_path',
      local_path: 'C:\\dev\\Pricer\\data_samples\\phase6_snapshot_2026-04-21.zip',
      dry_run: true,
      target_collections: ['raw_price_snapshots', 'product_daily_prices'],
      firestore_prefix: 'prod',
    },
    createdBy: 'operator-test',
    createdAt: '2026-05-03T12:00:00.000Z',
  });

  assert.equal(typeof job.job_id, 'string');
  assert.equal(job.snapshot_date, '2026-04-21');
  assert.equal(job.source_type, 'local_path');
  assert.equal(job.status, 'planned');
  assert.equal(job.dry_run, true);
  assert.deepEqual(job.target_collections, ['product_daily_prices', 'raw_price_snapshots']);
  assert.equal(job.firestore_prefix, 'prod');
  assert.equal(typeof job.command_hash, 'string');
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

  console.log(`\nPhase 6 historical ingest/admin tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
