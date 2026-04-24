const assert = require('node:assert/strict');

const {
  handleCantFindThisRequest,
  InMemoryDataBackboneStore,
  queryEngine,
  rebuildDemandAggregates,
  rebuildDemandClusters,
  rebuildDemandEmbeddings,
  runDemandIntelligenceJobs,
  getTopDemand,
  getTrendingDemand,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createState() {
  return {
    raw_price_snapshots: [
      {
        snapshot_id: 'r1',
        source_product_id: 'milk-a',
        snapshot_date: '2026-04-22',
        locality_code: '1000',
        store_name_raw: 'Store A',
        product_name_raw: 'Прясно мляко Верея 3% 1л',
        product_code: '1001',
        category_code: '6',
        retail_price: 2.2,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
    ],
    source_products: [
      {
        source_product_id: 'milk-a',
        locality_code: '1000',
        store_name_raw: 'Store A',
        product_code: '1001',
        category_code: '6',
        latest_product_name_raw: 'Прясно мляко Верея 3% 1л',
        is_active: true,
        last_seen_date: '2026-04-22',
      },
    ],
    source_product_enrichment: [
      {
        source_product_id: 'milk-a',
        normalized_name: 'прясно мляко верея 3% 1л',
        tokens: ['прясно', 'мляко', 'верея', '3%', '1л'],
        alias_candidates: ['мляко'],
        canonical_search_category: 'milk',
        parse_confidence: 1,
        canonical_en: {
          product_type: 'fresh_milk',
          product_family: 'milk',
          brand: 'Vereya',
          size_value: 1,
          size_unit: 'l',
          fat_percent: 3,
        },
        display_en: 'Fresh milk Vereya 3% 1L',
      },
    ],
    semantic_profiles: [],
    embedding_records: [],
    feedback_events: [],
    product_daily_prices: [
      {
        source_product_id: 'milk-a',
        date: '2026-04-22',
        price_avg: 2.2,
        price_min: 2.2,
        price_max: 2.2,
        store_count: 1,
        snapshot_count: 1,
      },
    ],
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

test('query flow logs unmatched searches with normalized demand fields', async () => {
  const store = new InMemoryDataBackboneStore(createState());

  const result = await queryEngine({
    store,
    query: 'безглутенов хляб',
    localityCode: '1000',
    city: 'Sofia',
    userId: 'u-1',
    createdAt: '2026-04-22T08:00:00.000Z',
  });

  assert.equal(result.items.length, 0);

  const state = await store.load();
  assert.equal(state.demand_logs.length, 1);
  assert.equal(state.demand_logs[0].normalized_query, 'безглутенов хляб');
  assert.equal(state.demand_logs[0].city, 'Sofia');
  assert.equal(state.analytics_events.length, 1);
  assert.equal(state.analytics_events[0].event_type, 'demand_unmatched_logged');
});

test('matched query results do not create demand logs', async () => {
  const store = new InMemoryDataBackboneStore(createState());

  const result = await queryEngine({
    store,
    query: 'мляко',
    localityCode: '1000',
    city: 'Sofia',
    createdAt: '2026-04-22T08:00:00.000Z',
  });

  assert.equal(result.items.length > 0, true);
  const state = await store.load();
  assert.equal(state.demand_logs.length, 0);
});

test('manual cant-find-this feedback stores feedback and demand log together', async () => {
  const store = new InMemoryDataBackboneStore(createState());

  const response = await handleCantFindThisRequest({
    store,
    body: {
      query: 'оризови спагети',
      raw_item_input: 'оризови спагети',
      locality_code: '1000',
      city: 'Sofia',
      user_id: 'u-2',
      notes: 'checked three stores',
      created_at: '2026-04-22T09:00:00.000Z',
    },
  });

  assert.equal(response.status, 200);

  const state = await store.load();
  assert.equal(state.feedback_events.length, 1);
  assert.equal(state.feedback_events[0].feedback_type, 'cant_find_this');
  assert.equal(state.demand_logs.length, 1);
  assert.equal(state.demand_logs[0].demand_source, 'manual_feedback');
  assert.equal(state.analytics_events[0].event_type, 'demand_manual_feedback_logged');
});

test('aggregation merges duplicate demand queries and tracks manual versus automatic frequency', async () => {
  const store = new InMemoryDataBackboneStore(createState());

  await queryEngine({
    store,
    query: 'безглутенов хляб',
    localityCode: '1000',
    city: 'Sofia',
    createdAt: '2026-04-15T08:00:00.000Z',
  });
  await queryEngine({
    store,
    query: 'безглутенов хляб',
    localityCode: '1000',
    city: 'Sofia',
    createdAt: '2026-04-22T08:00:00.000Z',
  });
  await handleCantFindThisRequest({
    store,
    body: {
      query: 'безглутенов хляб',
      locality_code: '1000',
      city: 'Sofia',
      created_at: '2026-04-22T09:00:00.000Z',
    },
  });

  const summary = await rebuildDemandAggregates({ store });
  const state = await store.load();

  assert.equal(summary.aggregate_count, 1);
  assert.equal(state.demand_aggregates.length, 1);
  assert.equal(state.demand_aggregates[0].frequency, 3);
  assert.equal(state.demand_aggregates[0].automatic_frequency, 2);
  assert.equal(state.demand_aggregates[0].manual_frequency, 1);
});

test('embedding backfill and clustering group similar demand queries in a batch pass', async () => {
  const store = new InMemoryDataBackboneStore(createState());

  await handleCantFindThisRequest({
    store,
    body: {
      query: 'безглутенов хляб',
      locality_code: '1000',
      city: 'Sofia',
      created_at: '2026-04-22T09:00:00.000Z',
    },
  });
  await handleCantFindThisRequest({
    store,
    body: {
      query: 'хляб без глутен',
      locality_code: '1000',
      city: 'Sofia',
      created_at: '2026-04-22T09:05:00.000Z',
    },
  });

  await rebuildDemandAggregates({ store });
  await rebuildDemandEmbeddings({
    store,
    generatedAt: '2026-04-22T10:00:00.000Z',
  });
  await rebuildDemandClusters({
    store,
    similarityThreshold: 0.6,
    generatedAt: '2026-04-22T10:00:00.000Z',
  });

  const state = await store.load();
  assert.equal(state.demand_embeddings.length, 2);
  assert.equal(state.demand_clusters.length, 1);
  assert.equal(state.demand_aggregates[0].cluster_id, state.demand_aggregates[1].cluster_id);
});

test('top-demand and trending endpoints return frequency-based ranked results', async () => {
  const store = new InMemoryDataBackboneStore(createState());

  await handleCantFindThisRequest({
    store,
    body: {
      query: 'тахан',
      locality_code: '1000',
      city: 'Sofia',
      created_at: '2026-04-10T09:00:00.000Z',
    },
  });
  await handleCantFindThisRequest({
    store,
    body: {
      query: 'безглутенов хляб',
      locality_code: '1000',
      city: 'Sofia',
      created_at: '2026-04-21T09:00:00.000Z',
    },
  });
  await handleCantFindThisRequest({
    store,
    body: {
      query: 'безглутенов хляб',
      locality_code: '1000',
      city: 'Sofia',
      created_at: '2026-04-22T09:00:00.000Z',
    },
  });

  await runDemandIntelligenceJobs({
    store,
    generatedAt: '2026-04-22T10:00:00.000Z',
    similarityThreshold: 0.6,
  });

  const top = await getTopDemand({
    store,
    localityCode: '1000',
    city: 'Sofia',
    limit: 5,
  });
  const trending = await getTrendingDemand({
    store,
    localityCode: '1000',
    city: 'Sofia',
    limit: 5,
    now: '2026-04-22T12:00:00.000Z',
    recentDays: 3,
    previousDays: 7,
  });

  assert.equal(top[0].normalized_query, 'безглутенов хляб');
  assert.equal(top[0].frequency, 2);
  assert.equal(trending[0].normalized_query, 'безглутенов хляб');
  assert.equal(trending[0].recent_frequency, 2);
  assert.equal(trending[0].previous_frequency, 0);
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

  console.log(`\nPhase 7 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
