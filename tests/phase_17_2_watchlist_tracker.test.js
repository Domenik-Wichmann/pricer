const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  addWatchlistItem,
  buildWatchlistPriceView,
  getWatchlistItem,
  handleAddWatchlistItemRequest,
  listWatchlistItems,
  removeWatchlistItem,
  updateWatchlistItem,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function owner(id) {
  return {
    owner_id: id,
    owner_type: 'user',
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

function createStore() {
  return new InMemoryDataBackboneStore({
    canonical_products: [
      {
        canonical_product_id: 'cp_coffee',
        canonical_display_name: 'Coffee 250g',
      },
      {
        canonical_product_id: 'cp_tea',
        canonical_display_name: 'Tea',
      },
      {
        canonical_product_id: 'cp_missing',
        canonical_display_name: 'Missing price product',
      },
    ],
    canonical_product_mappings: [
      {
        canonical_product_id: 'cp_coffee',
        source_product_id: 'sp_coffee_lidl',
      },
      {
        canonical_product_id: 'cp_tea',
        source_product_id: 'sp_tea_lidl',
      },
    ],
    source_products: [
      {
        source_product_id: 'sp_coffee_lidl',
        source_chain_name_raw: 'Lidl',
        source_chain_name_normalized: 'lidl',
        store_name_raw: 'Lidl Sofia',
        locality_code: '1000',
      },
      {
        source_product_id: 'sp_tea_lidl',
        source_chain_name_raw: 'Lidl',
        source_chain_name_normalized: 'lidl',
        store_name_raw: 'Lidl Sofia',
        locality_code: '1000',
      },
    ],
    raw_price_snapshots: [
      {
        snapshot_id: 'snap_coffee',
        source_product_id: 'sp_coffee_lidl',
        source_chain_name_raw: 'Lidl',
        source_chain_name_normalized: 'lidl',
        store_name_raw: 'Lidl Sofia',
        locality_code: '1000',
        retail_price: 4.99,
        promo_price: 0,
        snapshot_date: '2026-04-24',
        ingested_at: '2026-04-24T10:00:00.000Z',
      },
      {
        snapshot_id: 'snap_tea',
        source_product_id: 'sp_tea_lidl',
        source_chain_name_raw: 'Lidl',
        source_chain_name_normalized: 'lidl',
        store_name_raw: 'Lidl Sofia',
        locality_code: '1000',
        retail_price: 2.50,
        promo_price: 0,
        snapshot_date: '2026-04-24',
        ingested_at: '2026-04-24T10:00:00.000Z',
      },
    ],
  });
}

async function createWatch(store, ownerContext = owner('user-1'), canonicalProductId = 'cp_coffee') {
  return addWatchlistItem({
    store,
    ownerContext,
    input: {
      canonical_product_id: canonicalProductId,
      label: 'Coffee',
      target_price: 4.5,
      notes: 'Buy when cheap',
    },
    createdAt: '2026-04-24T12:00:00.000Z',
  });
}

function pickTruth(state) {
  return {
    canonical_products: state.canonical_products,
    canonical_product_mappings: state.canonical_product_mappings,
    source_products: state.source_products,
    raw_price_snapshots: state.raw_price_snapshots,
    product_daily_prices: state.product_daily_prices,
  };
}

test('add watchlist item creates owner-scoped record', async () => {
  const store = createStore();
  const response = await createWatch(store);

  assert.equal(response.status, 201);
  assert.equal(response.body.item.watch_id.startsWith('wl_'), true);
  assert.equal(response.body.item.owner_id, 'user-1');
  assert.equal(response.body.item.owner_type, 'user');
  assert.equal(response.body.item.canonical_product_id, 'cp_coffee');
  assert.equal(response.body.item.label, 'Coffee');
  assert.equal(response.body.item.target_price, 4.5);
});

test('duplicate watchlist add is idempotent for same owner and canonical product', async () => {
  const store = createStore();
  const first = await createWatch(store);
  const second = await addWatchlistItem({
    store,
    ownerContext: owner('user-1'),
    input: {
      canonical_product_id: 'cp_coffee',
      label: 'Different label',
    },
    createdAt: '2026-04-24T13:00:00.000Z',
  });

  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.item.watch_id, first.body.item.watch_id);
  assert.equal(second.body.item.label, 'Coffee');
});

test('list watchlist only returns owner items', async () => {
  const store = createStore();
  await createWatch(store, owner('user-1'), 'cp_coffee');
  await createWatch(store, owner('user-2'), 'cp_tea');

  const response = await listWatchlistItems({
    store,
    ownerContext: owner('user-1'),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.total, 1);
  assert.equal(response.body.items[0].owner_id, 'user-1');
});

test('get watchlist item blocks another owner', async () => {
  const store = createStore();
  const created = await createWatch(store, owner('user-1'));
  const response = await getWatchlistItem({
    store,
    ownerContext: owner('user-2'),
    watchId: created.body.item.watch_id,
  });

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'watchlist item not found');
});

test('update watchlist item blocks another owner', async () => {
  const store = createStore();
  const created = await createWatch(store, owner('user-1'));
  const blocked = await updateWatchlistItem({
    store,
    ownerContext: owner('user-2'),
    watchId: created.body.item.watch_id,
    updates: {
      label: 'Blocked',
    },
  });
  const allowed = await getWatchlistItem({
    store,
    ownerContext: owner('user-1'),
    watchId: created.body.item.watch_id,
  });

  assert.equal(blocked.status, 404);
  assert.equal(allowed.body.item.label, 'Coffee');
});

test('delete watchlist item blocks another owner', async () => {
  const store = createStore();
  const created = await createWatch(store, owner('user-1'));
  const blocked = await removeWatchlistItem({
    store,
    ownerContext: owner('user-2'),
    watchId: created.body.item.watch_id,
  });
  const stillThere = await getWatchlistItem({
    store,
    ownerContext: owner('user-1'),
    watchId: created.body.item.watch_id,
  });

  assert.equal(blocked.status, 404);
  assert.equal(stillThere.status, 200);
});

test('price tracker view includes best price', async () => {
  const store = createStore();
  await createWatch(store, owner('user-1'), 'cp_coffee');

  const response = await buildWatchlistPriceView({
    store,
    ownerContext: owner('user-1'),
    options: {
      max_age_days: 30,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.currency, 'EUR');
  assert.equal(response.body.items[0].product.canonical_name, 'Coffee 250g');
  assert.equal(response.body.items[0].price.price_status, 'priced');
  assert.equal(response.body.items[0].price.best_price.price, 4.99);
  assert.equal(response.body.items[0].price.best_price.currency, 'EUR');
});

test('price tracker view shows missing for watched product without current price', async () => {
  const store = createStore();
  await createWatch(store, owner('user-1'), 'cp_missing');

  const response = await buildWatchlistPriceView({
    store,
    ownerContext: owner('user-1'),
    options: {
      max_age_days: 30,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items[0].price.price_status, 'missing');
  assert.equal(response.body.items[0].price.best_price, null);
  assert.deepEqual(response.body.items[0].price.price_records, []);
});

test('watchlist records do not store price snapshots', async () => {
  const store = createStore();
  const created = await createWatch(store, owner('user-1'), 'cp_coffee');
  await buildWatchlistPriceView({
    store,
    ownerContext: owner('user-1'),
    options: {
      max_age_days: 30,
    },
  });
  const state = await store.load();
  const record = state.watchlist_store.find((item) => item.watch_id === created.body.item.watch_id);

  assert.deepEqual(Object.keys(record).sort(), [
    'canonical_product_id',
    'created_at',
    'label',
    'notes',
    'owner_id',
    'owner_type',
    'target_price',
    'updated_at',
    'watch_id',
  ]);
});

test('watchlist tracker does not mutate canonical or price data', async () => {
  const store = createStore();
  const before = pickTruth(await store.load());
  const created = await handleAddWatchlistItemRequest({
    store,
    req: requestWithOwner('user-1'),
    body: {
      canonical_product_id: 'cp_coffee',
      label: 'Coffee',
    },
  });
  await updateWatchlistItem({
    store,
    ownerContext: owner('user-1'),
    watchId: created.body.item.watch_id,
    updates: {
      target_price: 4.4,
    },
  });
  await buildWatchlistPriceView({
    store,
    ownerContext: owner('user-1'),
    options: {
      max_age_days: 30,
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

  console.log(`\nPhase 17.2 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
