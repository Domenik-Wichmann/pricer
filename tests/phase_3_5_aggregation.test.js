const assert = require('node:assert/strict');

const {
  buildCategoryDailyAggregates,
  buildProductDailyPrices,
  getCategoryTrends,
  getProductHistory,
  InMemoryDataBackboneStore,
  runDailyAggregation,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createAggregationState() {
  return {
    raw_price_snapshots: [
      {
        snapshot_id: 's1',
        source_product_id: 'milk-1',
        snapshot_date: '2026-04-21',
        locality_code: '65677',
        store_name_raw: 'Store A',
        product_name_raw: 'Milk 1',
        product_code: '100',
        category_code: '6',
        retail_price: 1.6,
        promo_price: 0,
        ingested_at: '2026-04-21T10:00:00.000Z',
      },
      {
        snapshot_id: 's2',
        source_product_id: 'milk-1',
        snapshot_date: '2026-04-21',
        locality_code: '65677',
        store_name_raw: 'Store B',
        product_name_raw: 'Milk 1',
        product_code: '100',
        category_code: '6',
        retail_price: 1.8,
        promo_price: 1.5,
        ingested_at: '2026-04-21T10:00:00.000Z',
      },
      {
        snapshot_id: 's3',
        source_product_id: 'bread-1',
        snapshot_date: '2026-04-21',
        locality_code: '65677',
        store_name_raw: 'Store A',
        product_name_raw: 'Bread 1',
        product_code: '200',
        category_code: '1',
        retail_price: 0.92,
        promo_price: 0,
        ingested_at: '2026-04-21T10:00:00.000Z',
      },
      {
        snapshot_id: 's4',
        source_product_id: 'milk-1',
        snapshot_date: '2026-04-22',
        locality_code: '65677',
        store_name_raw: 'Store A',
        product_name_raw: 'Milk 1',
        product_code: '100',
        category_code: '6',
        retail_price: 1.7,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
    ],
    source_products: [],
    source_product_enrichment: [],
    semantic_profiles: [],
    embedding_records: [],
    feedback_events: [],
    product_daily_prices: [],
    category_daily_aggregates: [],
  };
}

test('daily aggregation computes correct product and category avg/min/max counts', async () => {
  const store = new InMemoryDataBackboneStore(createAggregationState());
  const result = await runDailyAggregation({
    store,
    date: '2026-04-21',
  });

  assert.equal(result.skipped, false);
  assert.equal(result.product_rows, 2);
  assert.equal(result.category_rows, 2);

  const state = await store.load();
  const milkHistory = state.product_daily_prices.find((row) => row.source_product_id === 'milk-1');
  const dairyAggregate = state.category_daily_aggregates.find((row) => row.category_code === '6');

  assert.deepEqual(milkHistory, {
    source_product_id: 'milk-1',
    date: '2026-04-21',
    price_avg: 1.55,
    price_min: 1.5,
    price_max: 1.6,
    store_count: 2,
    snapshot_count: 2,
  });
  assert.deepEqual(dairyAggregate, {
    category_code: '6',
    date: '2026-04-21',
    avg_price: 1.55,
    min_price: 1.5,
    max_price: 1.6,
    product_count: 1,
    snapshot_count: 2,
  });
});

test('daily aggregation is idempotent and append-only for the same date', async () => {
  const store = new InMemoryDataBackboneStore(createAggregationState());
  const first = await runDailyAggregation({
    store,
    date: '2026-04-21',
  });
  const second = await runDailyAggregation({
    store,
    date: '2026-04-21',
  });

  assert.equal(first.skipped, false);
  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'already_aggregated');

  const state = await store.load();
  assert.equal(state.product_daily_prices.length, 2);
  assert.equal(state.category_daily_aggregates.length, 2);
});

test('product history endpoint returns ordered history rows', async () => {
  const store = new InMemoryDataBackboneStore(createAggregationState());
  await runDailyAggregation({ store, date: '2026-04-21' });
  await runDailyAggregation({ store, date: '2026-04-22' });

  const history = await getProductHistory({
    store,
    sourceProductId: 'milk-1',
  });

  assert.equal(history.length, 2);
  assert.equal(history[0].date, '2026-04-21');
  assert.equal(history[1].date, '2026-04-22');
});

test('product history uses scoped product_daily_prices query', async () => {
  const store = new InMemoryDataBackboneStore(createAggregationState());
  await runDailyAggregation({ store, date: '2026-04-21' });
  const calls = [];
  const scopedStore = {
    async load() {
      calls.push({ type: 'load' });
      throw new Error('full store load should not be used for product history');
    },
    async queryCollection(collectionName, options) {
      calls.push({ type: 'queryCollection', collectionName, options });
      return store.queryCollection(collectionName, options);
    },
  };

  const history = await getProductHistory({
    store: scopedStore,
    sourceProductId: 'milk-1',
  });

  assert.equal(history.length, 1);
  assert.deepEqual(calls, [{
    type: 'queryCollection',
    collectionName: 'product_daily_prices',
    options: {
      fieldName: 'source_product_id',
      value: 'milk-1',
    },
  }]);
});

test('category trends endpoint returns ordered category aggregate rows', async () => {
  const store = new InMemoryDataBackboneStore(createAggregationState());
  await runDailyAggregation({ store, date: '2026-04-21' });
  await runDailyAggregation({ store, date: '2026-04-22' });

  const trends = await getCategoryTrends({
    store,
    categoryCode: '6',
  });

  assert.equal(trends.length, 2);
  assert.equal(trends[0].category_code, '6');
  assert.equal(trends[0].date, '2026-04-21');
  assert.equal(trends[1].date, '2026-04-22');
});

test('large product and category groups aggregate without call stack overflow', () => {
  const rowCount = 200000;
  const snapshots = [];

  // The publisher can encounter a very large category in one daily snapshot.
  // This synthetic group is intentionally above V8's practical argument-spread
  // limit, so old Math.min(...prices) / Math.max(...prices) code would throw.
  for (let index = 0; index < rowCount; index += 1) {
    snapshots.push({
      snapshot_id: `large-${index}`,
      source_product_id: 'bulk-product-1',
      snapshot_date: '2026-04-21',
      locality_code: '65677',
      store_name_raw: 'Bulk Store',
      product_name_raw: 'Bulk Product',
      product_code: 'bulk-1',
      category_code: 'bulk-category',
      retail_price: index === rowCount - 1 ? 3 : 2,
      promo_price: index === 0 ? 1 : 0,
      ingested_at: '2026-04-21T10:00:00.000Z',
    });
  }

  const productRows = buildProductDailyPrices({
    snapshots,
    targetDate: '2026-04-21',
  });
  const categoryRows = buildCategoryDailyAggregates({
    snapshots,
    targetDate: '2026-04-21',
  });

  assert.deepEqual(productRows, [{
    source_product_id: 'bulk-product-1',
    date: '2026-04-21',
    price_avg: 2,
    price_min: 1,
    price_max: 3,
    store_count: 1,
    snapshot_count: rowCount,
  }]);
  assert.deepEqual(categoryRows, [{
    category_code: 'bulk-category',
    date: '2026-04-21',
    avg_price: 2,
    min_price: 1,
    max_price: 3,
    product_count: 1,
    snapshot_count: rowCount,
  }]);
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

  console.log(`\nPhase 3.5 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
