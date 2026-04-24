const assert = require('node:assert/strict');

const {
  applyConstraintFilters,
  handleQueryEngineRequest,
  InMemoryDataBackboneStore,
  parseQuery,
  queryEngine,
  rankQueryResults,
  syncFirestoreToSQL,
  syncFirestoreToVector,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createPhase4State() {
  return {
    raw_price_snapshots: [
      {
        snapshot_id: 'r1',
        source_product_id: 'milk-v',
        snapshot_date: '2026-04-22',
        locality_code: '1000',
        store_name_raw: 'Store A',
        product_name_raw: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0412\u0435\u0440\u0435\u044f 3% 1\u043b',
        product_code: '1001',
        category_code: '6',
        retail_price: 1.8,
        promo_price: 1.6,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
      {
        snapshot_id: 'r2',
        source_product_id: 'milk-o',
        snapshot_date: '2026-04-22',
        locality_code: '1000',
        store_name_raw: 'Store B',
        product_name_raw: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u041e\u043b\u0438\u043c\u043f\u0443\u0441 3% 1\u043b',
        product_code: '1002',
        category_code: '6',
        retail_price: 1.7,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
    ],
    source_products: [
      {
        source_product_id: 'milk-v',
        locality_code: '1000',
        store_name_raw: 'Store A',
        product_code: '1001',
        category_code: '6',
        latest_product_name_raw: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0412\u0435\u0440\u0435\u044f 3% 1\u043b',
        is_active: true,
        last_seen_date: '2026-04-22',
      },
      {
        source_product_id: 'milk-o',
        locality_code: '1000',
        store_name_raw: 'Store B',
        product_code: '1002',
        category_code: '6',
        latest_product_name_raw: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u041e\u043b\u0438\u043c\u043f\u0443\u0441 3% 1\u043b',
        is_active: true,
        last_seen_date: '2026-04-22',
      },
    ],
    source_product_enrichment: [
      {
        source_product_id: 'milk-v',
        normalized_name: '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0432\u0435\u0440\u0435\u044f 3% 1\u043b',
        tokens: ['\u043f\u0440\u044f\u0441\u043d\u043e', '\u043c\u043b\u044f\u043a\u043e', '\u0432\u0435\u0440\u0435\u044f', '3%', '1\u043b'],
        alias_candidates: ['\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 1\u043b'],
        canonical_search_category: 'milk',
        size_value: 1,
        size_unit: 'l',
        fat_percent: 3,
        parse_confidence: 1,
        canonical_en: {
          product_type: 'fresh_milk',
          product_family: 'milk',
          brand: '\u0412\u0435\u0440\u0435\u044f',
          size_value: 1,
          size_unit: 'l',
          fat_percent: 3,
        },
        display_en: 'Fresh milk Vereya 3% 1L',
      },
      {
        source_product_id: 'milk-o',
        normalized_name: '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u043e\u043b\u0438\u043c\u043f\u0443\u0441 3% 1\u043b',
        tokens: ['\u043f\u0440\u044f\u0441\u043d\u043e', '\u043c\u043b\u044f\u043a\u043e', '\u043e\u043b\u0438\u043c\u043f\u0443\u0441', '3%', '1\u043b'],
        alias_candidates: ['\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 1\u043b'],
        canonical_search_category: 'milk',
        size_value: 1,
        size_unit: 'l',
        fat_percent: 3,
        parse_confidence: 1,
        canonical_en: {
          product_type: 'fresh_milk',
          product_family: 'milk',
          brand: '\u041e\u043b\u0438\u043c\u043f\u0443\u0441',
          size_value: 1,
          size_unit: 'l',
          fat_percent: 3,
        },
        display_en: 'Fresh milk Olympus 3% 1L',
      },
    ],
    semantic_profiles: [],
    embedding_records: [
      {
        source_product_id: 'milk-v',
        embedding_model: 'phase3-hash-embedding-v1',
        embedding_dimensions: 8,
        embedding_text: 'Fresh milk Vereya 3% 1L',
        embedding_vector_json: '[0.1,0.2]',
        generated_at: '2026-04-22T12:00:00.000Z',
      },
    ],
    feedback_events: [],
    product_daily_prices: [
      {
        source_product_id: 'milk-v',
        date: '2026-04-22',
        price_avg: 1.6,
        price_min: 1.6,
        price_max: 1.6,
        store_count: 1,
        snapshot_count: 1,
      },
      {
        source_product_id: 'milk-o',
        date: '2026-04-22',
        price_avg: 1.7,
        price_min: 1.7,
        price_max: 1.7,
        store_count: 1,
        snapshot_count: 1,
      },
    ],
    category_daily_aggregates: [
      {
        category_code: '6',
        date: '2026-04-22',
        avg_price: 1.65,
        min_price: 1.6,
        max_price: 1.7,
        product_count: 2,
        snapshot_count: 2,
      },
    ],
    sql_products: [],
    sql_product_prices_daily: [],
    sql_category_aggregates: [],
    vector_index_records: [],
  };
}

test('query parsing extracts intent, price constraint, and product hints', () => {
  const parsed = parseQuery('\u0435\u0432\u0442\u0438\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u043f\u043e\u0434 2 \u0435\u0432\u0440\u043e');

  assert.equal(parsed.intent, 'cheap');
  assert.equal(parsed.constraints_price_max, 2);
  assert.equal(parsed.product_type, 'fresh_milk');
  assert.equal(parsed.category_code, '6');
});

test('constraint filtering applies price and category limits deterministically', () => {
  const rows = [
    { source_product_id: 'a', current_price: 1.5, category_code: '6', product_type: 'fresh_milk', product_family: 'milk', location_label: '1000' },
    { source_product_id: 'b', current_price: 2.5, category_code: '1', product_type: 'bread', product_family: 'bread', location_label: '1000' },
  ];
  const filtered = applyConstraintFilters({
    rows,
    parsedQuery: {
      constraints_price_max: 2,
      constraints_location: null,
      category_code: '6',
      product_type: 'fresh_milk',
    },
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].source_product_id, 'a');
});

test('ranker behavior surfaces cheaper rows higher for cheap queries', () => {
  const ranked = rankQueryResults({
    rows: [
      { source_product_id: 'milk-v', current_price: 1.6, match_score: 0.7, store_count: 1 },
      { source_product_id: 'milk-o', current_price: 1.9, match_score: 0.7, store_count: 1 },
    ],
    rankByPrice: true,
  });

  assert.equal(ranked[0].source_product_id, 'milk-v');
  assert.equal(ranked[0].rank_score > ranked[1].rank_score, true);
});

test('query engine returns flat ranked results and applied filters', async () => {
  const store = new InMemoryDataBackboneStore(createPhase4State());
  const result = await queryEngine({
    store,
    query: '\u0435\u0432\u0442\u0438\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u043f\u043e\u0434 2 \u0435\u0432\u0440\u043e',
  });

  assert.equal(result.items.length >= 1, true);
  assert.equal(result.filters_applied.price_max, 2);
  assert.equal(typeof result.items[0].match_reasons, 'string');
  assert.equal(result.items[0].current_price <= 2, true);
});

test('query engine endpoint validates missing query', async () => {
  const response = await handleQueryEngineRequest({
    store: new InMemoryDataBackboneStore(createPhase4State()),
    body: {},
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'query is required');
});

test('firestore to sql sync is idempotent and maps flat rows correctly', async () => {
  const store = new InMemoryDataBackboneStore(createPhase4State());
  const first = await syncFirestoreToSQL({ store });
  const second = await syncFirestoreToSQL({ store });

  assert.equal(first.sql_products, 2);
  assert.equal(first.sql_product_prices_daily, 2);
  assert.equal(first.sql_category_aggregates, 1);
  assert.equal(second.sql_products, 2);

  const state = await store.load();
  assert.equal(state.sql_products.length, 2);
  assert.equal(state.sql_product_prices_daily.length, 2);
  assert.equal(state.sql_category_aggregates.length, 1);
  assert.equal(Object.keys(state.sql_products[0]).includes('source_product_id'), true);
});

test('firestore to vector sync only indexes embeddings once', async () => {
  const store = new InMemoryDataBackboneStore(createPhase4State());
  const first = await syncFirestoreToVector({ store });
  const second = await syncFirestoreToVector({ store });

  assert.equal(first.inserted, 1);
  assert.equal(second.inserted, 0);

  const state = await store.load();
  assert.equal(state.vector_index_records.length, 1);
  assert.equal(state.vector_index_records[0].embedding_model, 'phase3-hash-embedding-v1');
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

  console.log(`\nPhase 4 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
