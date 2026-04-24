const assert = require('node:assert/strict');

const {
  handleOptimizeBasketRequest,
  InMemoryDataBackboneStore,
  optimizeBasket,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createState() {
  return {
    raw_price_snapshots: [
      {
        snapshot_id: 'm1',
        source_product_id: 'milk-a',
        snapshot_date: '2026-04-22',
        locality_code: '1000',
        store_name_raw: 'Store A',
        product_name_raw: 'Прясно мляко Верея 3% 1л',
        product_code: '1001',
        category_code: '6',
        retail_price: 2.0,
        promo_price: 1.8,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
      {
        snapshot_id: 'm2',
        source_product_id: 'milk-b',
        snapshot_date: '2026-04-22',
        locality_code: '1000',
        store_name_raw: 'Store B',
        product_name_raw: 'Прясно мляко Олимпус 3% 1л',
        product_code: '1002',
        category_code: '6',
        retail_price: 1.7,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
      {
        snapshot_id: 'b1',
        source_product_id: 'bread-a',
        snapshot_date: '2026-04-22',
        locality_code: '1000',
        store_name_raw: 'Store A',
        product_name_raw: 'Хляб Добруджа 700г',
        product_code: '2001',
        category_code: '1',
        retail_price: 1.1,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
      {
        snapshot_id: 'b2',
        source_product_id: 'bread-b',
        snapshot_date: '2026-04-22',
        locality_code: '1000',
        store_name_raw: 'Store B',
        product_name_raw: 'Хляб Добруджа 700г',
        product_code: '2002',
        category_code: '1',
        retail_price: 1.4,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
      {
        snapshot_id: 'e1',
        source_product_id: 'eggs-a',
        snapshot_date: '2026-04-22',
        locality_code: '1000',
        store_name_raw: 'Store A',
        product_name_raw: 'Яйца M 10 бр',
        product_code: '3001',
        category_code: '8',
        retail_price: 4.5,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
      {
        snapshot_id: 'e2',
        source_product_id: 'eggs-c',
        snapshot_date: '2026-04-22',
        locality_code: '1000',
        store_name_raw: 'Store C',
        product_name_raw: 'Яйца M 10 бр',
        product_code: '3002',
        category_code: '8',
        retail_price: 3.0,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      }
    ],
    source_products: [
      { source_product_id: 'milk-a', locality_code: '1000', store_name_raw: 'Store A', product_code: '1001', category_code: '6', latest_product_name_raw: 'Прясно мляко Верея 3% 1л', is_active: true, last_seen_date: '2026-04-22' },
      { source_product_id: 'milk-b', locality_code: '1000', store_name_raw: 'Store B', product_code: '1002', category_code: '6', latest_product_name_raw: 'Прясно мляко Олимпус 3% 1л', is_active: true, last_seen_date: '2026-04-22' },
      { source_product_id: 'bread-a', locality_code: '1000', store_name_raw: 'Store A', product_code: '2001', category_code: '1', latest_product_name_raw: 'Хляб Добруджа 700г', is_active: true, last_seen_date: '2026-04-22' },
      { source_product_id: 'bread-b', locality_code: '1000', store_name_raw: 'Store B', product_code: '2002', category_code: '1', latest_product_name_raw: 'Хляб Добруджа 700г', is_active: true, last_seen_date: '2026-04-22' },
      { source_product_id: 'eggs-a', locality_code: '1000', store_name_raw: 'Store A', product_code: '3001', category_code: '8', latest_product_name_raw: 'Яйца M 10 бр', is_active: true, last_seen_date: '2026-04-22' },
      { source_product_id: 'eggs-c', locality_code: '1000', store_name_raw: 'Store C', product_code: '3002', category_code: '8', latest_product_name_raw: 'Яйца M 10 бр', is_active: true, last_seen_date: '2026-04-22' }
    ],
    source_product_enrichment: [
      { source_product_id: 'milk-a', normalized_name: 'прясно мляко верея 3% 1л', tokens: ['прясно', 'мляко', 'верея', '3%', '1л'], alias_candidates: ['мляко'], canonical_search_category: 'milk', parse_confidence: 1, canonical_en: { product_type: 'fresh_milk', product_family: 'milk', brand: 'Vereya', size_value: 1, size_unit: 'l', fat_percent: 3 }, display_en: 'Fresh milk Vereya 3% 1L' },
      { source_product_id: 'milk-b', normalized_name: 'прясно мляко олимпус 3% 1л', tokens: ['прясно', 'мляко', 'олимпус', '3%', '1л'], alias_candidates: ['мляко'], canonical_search_category: 'milk', parse_confidence: 1, canonical_en: { product_type: 'fresh_milk', product_family: 'milk', brand: 'Olympus', size_value: 1, size_unit: 'l', fat_percent: 3 }, display_en: 'Fresh milk Olympus 3% 1L' },
      { source_product_id: 'bread-a', normalized_name: 'хляб добруджа 700г', tokens: ['хляб', 'добруджа', '700г'], alias_candidates: ['хляб'], canonical_search_category: 'bread', parse_confidence: 1, canonical_en: { product_type: 'bread', product_family: 'bread', brand: null, size_value: 700, size_unit: 'g', fat_percent: null }, display_en: 'Bread 700g' },
      { source_product_id: 'bread-b', normalized_name: 'хляб добруджа 700г', tokens: ['хляб', 'добруджа', '700г'], alias_candidates: ['хляб'], canonical_search_category: 'bread', parse_confidence: 1, canonical_en: { product_type: 'bread', product_family: 'bread', brand: null, size_value: 700, size_unit: 'g', fat_percent: null }, display_en: 'Bread 700g' },
      { source_product_id: 'eggs-a', normalized_name: 'яйца m 10 бр', tokens: ['яйца', 'm', '10', 'бр'], alias_candidates: ['яйца'], canonical_search_category: 'eggs', parse_confidence: 1, canonical_en: { product_type: 'eggs', product_family: 'eggs', brand: null, size_value: 10, size_unit: 'count', fat_percent: null }, display_en: 'Eggs M 10' },
      { source_product_id: 'eggs-c', normalized_name: 'яйца m 10 бр', tokens: ['яйца', 'm', '10', 'бр'], alias_candidates: ['яйца'], canonical_search_category: 'eggs', parse_confidence: 1, canonical_en: { product_type: 'eggs', product_family: 'eggs', brand: null, size_value: 10, size_unit: 'count', fat_percent: null }, display_en: 'Eggs M 10' }
    ],
    semantic_profiles: [],
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
    demand_logs: [],
    demand_aggregates: [],
    demand_embeddings: [],
    demand_clusters: [],
  };
}

test('single-store optimization picks the cheapest common store plan', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  const result = await optimizeBasket({
    store,
    query: 'мляко, хляб',
  });

  assert.equal(result.single_store_plan.stores[0], 'Store A');
  assert.equal(result.single_store_plan.total_cost, 2.9);
  assert.equal(result.recommended_plan.plan_type, 'single_store');
});

test('multi-store optimization finds a cheaper split basket when allowed', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  const result = await optimizeBasket({
    store,
    query: 'мляко, яйца',
    preferences: {
      price_weight: 1,
      store_weight: 0.2,
    },
  });

  assert.equal(result.single_store_plan.stores[0], 'Store A');
  assert.equal(result.single_store_plan.total_cost, 6.3);
  assert.equal(result.multi_store_plan.total_cost, 4.7);
  assert.equal(result.recommended_plan.plan_type, 'multi_store');
  assert.deepEqual(result.recommended_plan.stores, ['Store B', 'Store C']);
});

test('store preference weighting can favor fewer stores over lower total price', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  const result = await optimizeBasket({
    store,
    query: 'мляко, яйца',
    preferences: {
      price_weight: 1,
      store_weight: 2.5,
    },
  });

  assert.equal(result.recommended_plan.plan_type, 'single_store');
  assert.deepEqual(result.recommended_plan.stores, ['Store A']);
});

test('candidate store and combination limits bound the search space deterministically', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  const result = await optimizeBasket({
    store,
    query: 'мляко, хляб, яйца',
    limits: {
      max_store_candidates: 2,
      max_store_combination_size: 2,
      max_store_combinations: 1,
    },
  });

  assert.equal(result.candidate_store_count, 2);
  assert.equal(result.multi_store_plan.stores.length <= 2, true);
});

test('optimizer carries unmatched items without failing the whole request', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  const result = await optimizeBasket({
    store,
    query: 'мляко, крокодил',
  });

  assert.equal(result.item_results[1].matched, false);
  assert.equal(result.recommended_plan.unmatched_item_count, 1);
  assert.equal(result.recommended_plan.items.length, 1);
});

test('optimize basket endpoint validates missing query', async () => {
  const response = await handleOptimizeBasketRequest({
    store: new InMemoryDataBackboneStore(createState()),
    body: {},
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'query is required');
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

  console.log(`\nPhase 8 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
