const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  createSavedList,
  deleteSavedList,
  getSavedList,
  handleCreateSavedListRequest,
  handleOptimizeSavedListRequest,
  importDailySnapshotCsvStream,
  listSavedLists,
  updateSavedList,
} = require('../app/functions/src');
const { SOURCE_HEADERS } = require('../app/functions/src/phase1/constants');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createCsv(rows) {
  const header = [
    SOURCE_HEADERS.localityCode,
    SOURCE_HEADERS.storeNameRaw,
    SOURCE_HEADERS.productNameRaw,
    SOURCE_HEADERS.productCode,
    SOURCE_HEADERS.categoryCode,
    SOURCE_HEADERS.retailPrice,
    SOURCE_HEADERS.promoPrice,
  ].map((value) => `"${value}"`).join(',');

  return Readable.from([[header, ...rows].join('\n')]);
}

async function createEndpointStore() {
  const store = new InMemoryDataBackboneStore();
  await importDailySnapshotCsvStream({
    store,
    csvStream: createCsv([
      '"1000","Lidl","Milk 1L","1001","6","3.00","0"',
      '"1000","Lidl","Eggs 10 Count","1002","8","8.00","0"',
    ]),
    snapshotDate: '2026-04-24',
    sourceFileName: 'LIDL.csv',
    ingestedAt: '2026-04-24T09:00:00.000Z',
    enableLlmEnrichment: false,
  });
  await importDailySnapshotCsvStream({
    store,
    csvStream: createCsv([
      '"1000","Kaufland","Milk 1L","2001","6","8.00","0"',
      '"1000","Kaufland","Eggs 10 Count","2002","8","3.00","0"',
    ]),
    snapshotDate: '2026-04-24',
    sourceFileName: 'KAUFLAND.csv',
    ingestedAt: '2026-04-24T10:00:00.000Z',
    enableLlmEnrichment: false,
  });

  return store;
}

async function createBasicList(store, overrides = {}) {
  return createSavedList({
    store,
    name: overrides.name || 'Weekly groceries',
    items: overrides.items || ['milk', '10 eggs'],
    createdAt: overrides.createdAt || '2026-04-24T12:00:00.000Z',
  });
}

function pickTruth(state) {
  return {
    canonical_products: state.canonical_products,
    canonical_product_mappings: state.canonical_product_mappings,
    canonical_enrichment_store: state.canonical_enrichment_store,
    raw_price_snapshots: state.raw_price_snapshots,
    product_daily_prices: state.product_daily_prices,
    source_products: state.source_products,
  };
}

test('create saved list normalizes string items', async () => {
  const store = new InMemoryDataBackboneStore();
  const response = await createBasicList(store);

  assert.equal(response.status, 201);
  assert.equal(response.body.list.list_id.startsWith('sl_'), true);
  assert.equal(response.body.list.name, 'Weekly groceries');
  assert.deepEqual(response.body.list.items, [
    { text: 'milk' },
    { text: '10 eggs' },
  ]);
});

test('get saved list returns stored record', async () => {
  const store = new InMemoryDataBackboneStore();
  const created = await createBasicList(store);
  const response = await getSavedList({
    store,
    listId: created.body.list.list_id,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.list, created.body.list);
});

test('update saved list supports name and object item input', async () => {
  const store = new InMemoryDataBackboneStore();
  const created = await createBasicList(store);
  const response = await updateSavedList({
    store,
    listId: created.body.list.list_id,
    updates: {
      name: 'Weekend',
      items: [{ text: 'milk' }, { text: 'eggs' }],
    },
    updatedAt: '2026-04-24T13:00:00.000Z',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.list.name, 'Weekend');
  assert.deepEqual(response.body.list.items, [{ text: 'milk' }, { text: 'eggs' }]);
  assert.equal(response.body.list.created_at, created.body.list.created_at);
  assert.equal(response.body.list.updated_at, '2026-04-24T13:00:00.000Z');
});

test('delete saved list removes record', async () => {
  const store = new InMemoryDataBackboneStore();
  const created = await createBasicList(store);
  const deleted = await deleteSavedList({
    store,
    listId: created.body.list.list_id,
  });
  const missing = await getSavedList({
    store,
    listId: created.body.list.list_id,
  });

  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted, true);
  assert.equal(missing.status, 404);
});

test('list saved lists returns all lists sorted by update time', async () => {
  const store = new InMemoryDataBackboneStore();
  await createBasicList(store, {
    name: 'First',
    createdAt: '2026-04-24T10:00:00.000Z',
  });
  await createBasicList(store, {
    name: 'Second',
    createdAt: '2026-04-24T11:00:00.000Z',
  });

  const response = await listSavedLists({ store });

  assert.equal(response.status, 200);
  assert.equal(response.body.total, 2);
  assert.deepEqual(response.body.lists.map((entry) => entry.name), ['Second', 'First']);
});

test('optimize saved list reruns basket pipeline without cached result', async () => {
  const store = await createEndpointStore();
  const created = await createBasicList(store);
  const response = await handleOptimizeSavedListRequest({
    store,
    params: {
      id: created.body.list.list_id,
    },
    body: {
      optimizer_options: {
        strategy: 'multi_store',
        include_explanation: true,
      },
    },
  });
  const state = await store.load();

  assert.equal(response.status, 200);
  assert.equal(response.body.list.list_id, created.body.list.list_id);
  assert.equal(response.body.optimizer_result.currency, 'EUR');
  assert.equal(response.body.optimizer_result.optimization_type, 'multi_store');
  assert.equal(Boolean(response.body.explanation), true);
  assert.equal(Object.prototype.hasOwnProperty.call(state.saved_lists_store[0], 'optimizer_result'), false);
});

test('invalid id handling returns not found', async () => {
  const store = new InMemoryDataBackboneStore();
  const response = await getSavedList({
    store,
    listId: 'sl_missing',
  });

  assert.equal(response.status, 404);
});

test('empty list validation rejects create request', async () => {
  const store = new InMemoryDataBackboneStore();
  const response = await handleCreateSavedListRequest({
    store,
    body: {
      name: 'Empty',
      items: [],
    },
  });

  assert.equal(response.status, 400);
});

test('saved list operations do not mutate canonical, enrichment, or price layers', async () => {
  const store = await createEndpointStore();
  const before = pickTruth(await store.load());
  const created = await createBasicList(store);
  await updateSavedList({
    store,
    listId: created.body.list.list_id,
    updates: {
      items: ['milk', 'eggs'],
    },
  });
  await handleOptimizeSavedListRequest({
    store,
    params: {
      id: created.body.list.list_id,
    },
    body: {
      optimizer_options: {
        strategy: 'multi_store',
      },
    },
  });
  const after = pickTruth(await store.load());

  assert.deepEqual(after, before);
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

  console.log(`\nPhase 17 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
