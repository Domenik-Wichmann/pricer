const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_PROGRESS_EVERY,
  createProgressReporter,
  createProgressState,
  publishCollection,
  resolveProgressEvery,
  writeProgressState,
} = require('../scripts/publish_phase6_latest_firestore');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pricer-publish-progress-'));
}

function createFakeFirestore({ existingIds = [] } = {}) {
  const writes = [];
  let commits = 0;
  const collectionRef = {
    select() {
      return {
        async get() {
          return {
            docs: existingIds.map((id) => ({ id })),
          };
        },
      };
    },
    doc(id) {
      return { id };
    },
  };

  return {
    writes,
    get commits() {
      return commits;
    },
    collectionId: null,
    collection(id) {
      this.collectionId = id;
      return collectionRef;
    },
    batch() {
      return {
        set(documentRef, payload) {
          writes.push({ documentRef, payload });
        },
        async commit() {
          commits += 1;
        },
      };
    },
  };
}

test('progress interval parsing falls back to default for unsafe values', () => {
  assert.equal(resolveProgressEvery('25'), 25);
  assert.equal(resolveProgressEvery('0'), DEFAULT_PROGRESS_EVERY);
  assert.equal(resolveProgressEvery('-10'), DEFAULT_PROGRESS_EVERY);
  assert.equal(resolveProgressEvery('not-a-number'), DEFAULT_PROGRESS_EVERY);
  assert.equal(resolveProgressEvery(undefined), DEFAULT_PROGRESS_EVERY);
});

test('progress state and writer produce the expected heartbeat JSON shape', () => {
  const tempDir = createTempDir();
  const filePath = path.join(tempDir, 'heartbeat.json');
  const state = createProgressState({
    runId: 'run-1',
    startedAt: '2026-05-05T10:00:00.000Z',
    snapshotDate: '2026-05-04',
    currentPhase: 'publish_collection',
    currentCollection: 'current_product_offers',
    selectedCollections: ['current_product_offers'],
    dryRun: true,
    skipExisting: true,
    collectionPrefix: 'prod',
    recordsTotal: 2,
    recordsWritten: 1,
    recordsSkipped: 1,
    failedWrites: 0,
    lastMessage: 'testing heartbeat',
  });

  writeProgressState(filePath, state);
  const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert.deepEqual(saved, {
    run_id: 'run-1',
    started_at: '2026-05-05T10:00:00.000Z',
    updated_at: '2026-05-05T10:00:00.000Z',
    snapshot_date: '2026-05-04',
    current_phase: 'publish_collection',
    current_collection: 'current_product_offers',
    selected_collections: ['current_product_offers'],
    dry_run: true,
    skip_existing: true,
    collection_prefix: 'prod',
    records_total: 2,
    records_written: 1,
    records_skipped: 1,
    failed_writes: 0,
    last_message: 'testing heartbeat',
    finished_at: null,
    status: 'running',
    error: null,
  });
});

test('dry-run publish records progress but does not write or commit Firestore batches', async () => {
  const tempDir = createTempDir();
  const filePath = path.join(tempDir, 'heartbeat.json');
  const logs = [];
  const progress = createProgressReporter({
    runId: 'run-dry',
    filePath,
    logger: (line) => logs.push(line),
    now: () => new Date('2026-05-05T10:00:00.000Z'),
    initialState: createProgressState({
      runId: 'run-dry',
      startedAt: '2026-05-05T10:00:00.000Z',
      selectedCollections: ['raw_price_snapshots'],
      dryRun: true,
      skipExisting: true,
      collectionPrefix: 'prod',
      lastMessage: 'test start',
    }),
  });
  const firestore = createFakeFirestore({ existingIds: ['snapshot-existing'] });
  const records = [
    { snapshot_id: 'snapshot-existing', retail_price: 1 },
    { snapshot_id: 'snapshot-new', retail_price: 2 },
  ];

  const result = await publishCollection({
    firestore,
    collectionPrefix: 'prod',
    collectionName: 'raw_price_snapshots',
    records,
    skipExisting: true,
    dryRun: true,
    progress,
    progressEvery: 1,
  });
  const heartbeat = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert.equal(firestore.collectionId, 'prod_raw_price_snapshots');
  assert.equal(firestore.writes.length, 0);
  assert.equal(firestore.commits, 0);
  assert.deepEqual(result, {
    collection: 'prod_raw_price_snapshots',
    input_records: 2,
    existing_records: 1,
    written_records: 1,
    skipped_existing_records: 1,
    dry_run: true,
    failed_writes: 0,
  });
  assert.equal(heartbeat.current_collection, 'raw_price_snapshots');
  assert.equal(heartbeat.records_total, 2);
  assert.equal(heartbeat.records_written, 1);
  assert.equal(heartbeat.records_skipped, 1);
  assert.equal(heartbeat.failed_writes, 0);
  assert.equal(heartbeat.status, 'running');
  assert.ok(logs.some((line) => line.includes('START publish raw_price_snapshots')));
  assert.ok(logs.some((line) => line.includes('Publish progress final for raw_price_snapshots')));
});

test('progress reporter records failed status and safe error details', () => {
  const tempDir = createTempDir();
  const filePath = path.join(tempDir, 'failed-heartbeat.json');
  const logs = [];
  const progress = createProgressReporter({
    runId: 'run-failed',
    filePath,
    logger: (line) => logs.push(line),
    now: () => new Date('2026-05-05T10:00:00.000Z'),
    initialState: createProgressState({
      runId: 'run-failed',
      startedAt: '2026-05-05T10:00:00.000Z',
      lastMessage: 'test failure path',
    }),
  });

  progress.fail(new Error('planned failure'));
  const heartbeat = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert.equal(heartbeat.status, 'failed');
  assert.equal(heartbeat.finished_at, '2026-05-05T10:00:00.000Z');
  assert.equal(heartbeat.error.message, 'planned failure');
  assert.ok(heartbeat.error.stack.includes('planned failure'));
  assert.ok(logs.some((line) => line.includes('Publisher failed.')));
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

  console.log(`\nPhase 6 publisher progress tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
