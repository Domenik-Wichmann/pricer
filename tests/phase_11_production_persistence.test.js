const assert = require('node:assert/strict');

const {
  FirestoreDataBackboneStore,
  createRuntimeDataBackboneStore,
  createEmptyDataBackbone,
  importDailySnapshotText,
  runDailyAggregation,
  syncRevenueCatEntitlement,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

class FakeFirestore {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    return new FakeCollectionReference(this, name);
  }

  batch() {
    return new FakeBatch(this);
  }

  getCollectionDocs(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }

    return this.collections.get(name);
  }
}

class FakeCollectionReference {
  constructor(firestore, name) {
    this.firestore = firestore;
    this.name = name;
  }

  doc(id) {
    return new FakeDocumentReference(this.firestore, this.name, id);
  }

  async get() {
    const docs = Array.from(this.firestore.getCollectionDocs(this.name).entries())
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([id, data]) => new FakeDocumentSnapshot(id, data));
    return { docs };
  }
}

class FakeDocumentReference {
  constructor(firestore, collectionName, id) {
    this.firestore = firestore;
    this.collectionName = collectionName;
    this.id = id;
  }

  async set(data) {
    this.firestore.getCollectionDocs(this.collectionName).set(this.id, clone(data));
  }

  async delete() {
    this.firestore.getCollectionDocs(this.collectionName).delete(this.id);
  }
}

class FakeDocumentSnapshot {
  constructor(id, data) {
    this.id = id;
    this._data = clone(data);
  }

  data() {
    return clone(this._data);
  }
}

class FakeBatch {
  constructor(firestore) {
    this.firestore = firestore;
    this.operations = [];
  }

  set(ref, data) {
    this.operations.push({ type: 'set', ref, data: clone(data) });
  }

  delete(ref) {
    this.operations.push({ type: 'delete', ref });
  }

  async commit() {
    for (const operation of this.operations) {
      if (operation.type === 'set') {
        await operation.ref.set(operation.data);
      } else {
        await operation.ref.delete();
      }
    }
  }
}

test('Firestore-backed store round-trips flat collections and removes stale rows on save', async () => {
  const firestore = new FakeFirestore();
  const store = new FirestoreDataBackboneStore({
    firestore,
    collectionPrefix: 'test',
  });

  const initialState = createEmptyDataBackbone();
  initialState.raw_price_snapshots.push({
    snapshot_id: 'snap-1',
    source_product_id: 'sp-1',
    snapshot_date: '2026-04-21',
    locality_code: '65677',
    store_name_raw: 'Store A',
    product_name_raw: 'Milk',
    product_code: '1001228',
    category_code: '6',
    retail_price: 1.8,
    promo_price: 1.6,
    retail_price_raw: '1.80',
    promo_price_raw: '1.60',
    raw_source_row: { sample: 'row' },
    source_file_name: 'day1.tsv',
    row_number: 2,
    ingested_at: '2026-04-22T10:00:00.000Z',
  });
  initialState.user_tiers.push({
    user_id: 'user-1',
    tier: 'free',
    premium_active: false,
    ads_enabled: true,
    optimizer_multi_store_enabled: false,
    alerts_enabled: false,
    max_optimizer_items: 8,
    max_watchlist_items: 20,
    max_target_price_alerts: 3,
    revenuecat_customer_id: null,
    revenuecat_entitlement_id: null,
    revenuecat_product_id: null,
    entitlement_status: 'inactive',
    entitlement_source: 'default_free',
    expires_at: null,
    updated_at: '2026-04-22T10:00:00.000Z',
  });

  await store.save(initialState);
  let loaded = await store.load();
  assert.equal(loaded.raw_price_snapshots.length, 1);
  assert.equal(loaded.user_tiers.length, 1);

  const nextState = createEmptyDataBackbone();
  nextState.user_tiers.push({
    ...initialState.user_tiers[0],
    tier: 'premium',
    premium_active: true,
    ads_enabled: false,
    optimizer_multi_store_enabled: true,
    alerts_enabled: true,
  });

  await store.save(nextState);
  loaded = await store.load();
  assert.equal(loaded.raw_price_snapshots.length, 0);
  assert.equal(loaded.user_tiers.length, 1);
  assert.equal(loaded.user_tiers[0].tier, 'premium');
  assert.equal(firestore.getCollectionDocs('test_raw_price_snapshots').size, 0);
});

test('runtime store selection keeps test and dev local while allowing explicit Firestore production mode', async () => {
  const memoryStore = await createRuntimeDataBackboneStore({
    env: {
      NODE_ENV: 'test',
    },
  });
  assert.equal(memoryStore.constructor.name, 'InMemoryDataBackboneStore');

  const jsonStore = await createRuntimeDataBackboneStore({
    env: {
      NODE_ENV: 'development',
      PRICER_STATE_FILE: 'tmp/dev-state.json',
    },
  });
  assert.equal(jsonStore.constructor.name, 'JsonFileDataBackboneStore');

  const firestoreStore = await createRuntimeDataBackboneStore({
    env: {
      NODE_ENV: 'production',
      PRICER_STORE_BACKEND: 'firestore',
      PRICER_FIRESTORE_COLLECTION_PREFIX: 'prod',
    },
    firestore: new FakeFirestore(),
  });
  assert.equal(firestoreStore.constructor.name, 'FirestoreDataBackboneStore');
  assert.equal(firestoreStore.collectionPrefix, 'prod');
});

test('production Firestore runtime rejects legacy full load and save by default', async () => {
  const store = await createRuntimeDataBackboneStore({
    env: {
      NODE_ENV: 'production',
      PRICER_STORE_BACKEND: 'firestore',
      PRICER_FIRESTORE_COLLECTION_PREFIX: 'prod',
    },
    firestore: new FakeFirestore(),
  });

  await assert.rejects(
    () => store.load(),
    /Full Firestore runtime load is disabled/
  );
  await assert.rejects(
    () => store.save(createEmptyDataBackbone()),
    /Full Firestore runtime save is disabled/
  );
});

test('Firestore-backed runtime keeps existing ingest, aggregation, and entitlement flows idempotent', async () => {
  const store = new FirestoreDataBackboneStore({
    firestore: new FakeFirestore(),
    collectionPrefix: 'pipeline',
  });
  const sourceText = [
    'Населено място\tТърговски обект\tНаименование на продукта\tКод на продукта\tКатегория\tЦена на дребно\tЦена в промоция',
    '65677\tХранителна борса Сарандиев\tПрясно мляко Верея 3% 1л\t1001228\t6\t1.66\t0',
  ].join('\n');

  await importDailySnapshotText({
    store,
    sourceText,
    snapshotDate: '2026-04-21',
    sourceFileName: 'day1.tsv',
    ingestedAt: '2026-04-22T10:00:00.000Z',
  });

  const firstAggregation = await runDailyAggregation({
    store,
    date: '2026-04-21',
  });
  const secondAggregation = await runDailyAggregation({
    store,
    date: '2026-04-21',
  });
  const tier = await syncRevenueCatEntitlement({
    store,
    userId: 'user-9',
    revenueCatCustomerId: 'rc-9',
    productId: 'premium_monthly',
    isActive: true,
    updatedAt: '2026-04-22T11:00:00.000Z',
  });

  const loaded = await store.load();
  assert.equal(firstAggregation.skipped, false);
  assert.equal(secondAggregation.skipped, true);
  assert.equal(loaded.product_daily_prices.length, 1);
  assert.equal(loaded.user_tiers.length, 1);
  assert.equal(loaded.revenuecat_events.length, 1);
  assert.equal(tier.tier, 'premium');
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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

  console.log(`\nPhase 11 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
