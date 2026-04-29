const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  createSavedList,
  getSavedList,
  handleCreateSavedListRequest,
  handleOptimizeBasketSingleStoreRequest,
  handleOptimizeSavedListRequest,
  importDailySnapshotCsvStream,
  listSavedLists,
  updateSavedList,
  deleteSavedList,
  resolveOwnerContextFromRequest,
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

function owner(id) {
  return {
    owner_id: id,
    owner_type: 'user',
    locality_code: null,
    chain_id: null,
    chain_name: null,
    store_id: null,
    store_name: null,
  };
}

function requestWithOwner(id, type = 'user') {
  return {
    headers: {
      'x-pricer-owner-id': id,
      'x-pricer-owner-type': type,
    },
  };
}

async function createOwnedList(store, ownerContext, name = 'Weekly groceries') {
  return createSavedList({
    store,
    ownerContext,
    name,
    items: ['milk', 'eggs'],
    createdAt: `2026-04-24T12:00:0${name.length % 10}.000Z`,
  });
}

test('missing owner defaults to anonymous ownership', async () => {
  const store = new InMemoryDataBackboneStore();
  const response = await createSavedList({
    store,
    name: 'Anonymous list',
    items: ['milk'],
    createdAt: '2026-04-24T12:00:00.000Z',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.list.owner_id, 'anonymous');
  assert.equal(response.body.list.owner_type, 'anonymous');
});

test('request headers create explicit owner context', async () => {
  const store = new InMemoryDataBackboneStore();
  const response = await handleCreateSavedListRequest({
    store,
    req: requestWithOwner('user-1'),
    body: {
      name: 'Owned list',
      items: ['milk'],
    },
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.list.owner_id, 'user-1');
  assert.equal(response.body.list.owner_type, 'user');
  assert.deepEqual(resolveOwnerContextFromRequest(requestWithOwner('user-1')), owner('user-1'));
});

test('list saved lists only returns records for the owner', async () => {
  const store = new InMemoryDataBackboneStore();
  await createOwnedList(store, owner('user-1'), 'User one');
  await createOwnedList(store, owner('user-2'), 'User two');

  const response = await listSavedLists({
    store,
    ownerContext: owner('user-1'),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.total, 1);
  assert.equal(response.body.lists[0].owner_id, 'user-1');
});

test('get saved list blocks another owner with bounded not found', async () => {
  const store = new InMemoryDataBackboneStore();
  const created = await createOwnedList(store, owner('user-1'));
  const response = await getSavedList({
    store,
    ownerContext: owner('user-2'),
    listId: created.body.list.list_id,
  });

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'saved list not found');
});

test('update saved list blocks another owner', async () => {
  const store = new InMemoryDataBackboneStore();
  const created = await createOwnedList(store, owner('user-1'));
  const blocked = await updateSavedList({
    store,
    ownerContext: owner('user-2'),
    listId: created.body.list.list_id,
    updates: {
      name: 'Blocked update',
    },
  });
  const allowed = await getSavedList({
    store,
    ownerContext: owner('user-1'),
    listId: created.body.list.list_id,
  });

  assert.equal(blocked.status, 404);
  assert.equal(allowed.body.list.name, 'Weekly groceries');
});

test('delete saved list blocks another owner without deleting it', async () => {
  const store = new InMemoryDataBackboneStore();
  const created = await createOwnedList(store, owner('user-1'));
  const blocked = await deleteSavedList({
    store,
    ownerContext: owner('user-2'),
    listId: created.body.list.list_id,
  });
  const stillThere = await getSavedList({
    store,
    ownerContext: owner('user-1'),
    listId: created.body.list.list_id,
  });

  assert.equal(blocked.status, 404);
  assert.equal(stillThere.status, 200);
});

test('optimize saved list blocks another owner', async () => {
  const store = await createEndpointStore();
  const created = await createOwnedList(store, owner('user-1'));
  const response = await handleOptimizeSavedListRequest({
    store,
    req: requestWithOwner('user-2'),
    params: {
      id: created.body.list.list_id,
    },
    body: {
      optimizer_options: {
        strategy: 'multi_store',
      },
    },
  });

  assert.equal(response.status, 404);
});

test('old ownerless records remain readable as anonymous only', async () => {
  const store = new InMemoryDataBackboneStore({
    saved_lists_store: [{
      list_id: 'sl_old',
      name: 'Old anonymous',
      items: [{ text: 'milk' }],
      created_at: '2026-04-24T12:00:00.000Z',
      updated_at: '2026-04-24T12:00:00.000Z',
    }],
  });

  const anonymous = await getSavedList({ store, listId: 'sl_old' });
  const otherOwner = await getSavedList({
    store,
    ownerContext: owner('user-1'),
    listId: 'sl_old',
  });

  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.body.list.owner_id, undefined);
  assert.equal(otherOwner.status, 404);
});

test('saved-list optimization preserves optimizer behavior', async () => {
  const store = await createEndpointStore();
  const created = await createOwnedList(store, owner('user-1'));
  const body = {
    items: created.body.list.items,
    optimizer_options: {
      strategy: 'multi_store',
      include_explanation: true,
    },
  };
  const direct = await handleOptimizeBasketSingleStoreRequest({ store, body });
  const viaList = await handleOptimizeSavedListRequest({
    store,
    req: requestWithOwner('user-1'),
    params: {
      id: created.body.list.list_id,
    },
    body: {
      optimizer_options: body.optimizer_options,
    },
  });

  assert.equal(viaList.status, 200);
  assert.deepEqual(viaList.body.optimizer_result, direct.body.optimizer_result);
  assert.deepEqual(viaList.body.resolved_items, direct.body.resolved_items);
});

test('saved lists persist owner and user input only', async () => {
  const store = await createEndpointStore();
  const created = await createOwnedList(store, owner('user-1'));
  await handleOptimizeSavedListRequest({
    store,
    req: requestWithOwner('user-1'),
    params: {
      id: created.body.list.list_id,
    },
    body: {
      optimizer_options: {
        strategy: 'multi_store',
      },
    },
  });
  const state = await store.load();
  const record = state.saved_lists_store[0];

  assert.deepEqual(Object.keys(record).sort(), [
    'created_at',
    'items',
    'list_id',
    'name',
    'owner_id',
    'owner_type',
    'updated_at',
  ]);
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

  console.log(`\nPhase 17.1 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
