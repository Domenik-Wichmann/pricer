const assert = require('node:assert/strict');

const {
  handleGetEntitlementStatusRequest,
  handleOptimizeBasketRequest,
  handleSetTargetPriceRequest,
  handleSyncRevenueCatEntitlementRequest,
  InMemoryDataBackboneStore,
  sendWatchlistAlerts,
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
      },
    ],
    source_products: [
      { source_product_id: 'milk-a', locality_code: '1000', store_name_raw: 'Store A', product_code: '1001', category_code: '6', latest_product_name_raw: 'Прясно мляко Верея 3% 1л', is_active: true, last_seen_date: '2026-04-22' },
      { source_product_id: 'milk-b', locality_code: '1000', store_name_raw: 'Store B', product_code: '1002', category_code: '6', latest_product_name_raw: 'Прясно мляко Олимпус 3% 1л', is_active: true, last_seen_date: '2026-04-22' },
      { source_product_id: 'eggs-a', locality_code: '1000', store_name_raw: 'Store A', product_code: '3001', category_code: '8', latest_product_name_raw: 'Яйца M 10 бр', is_active: true, last_seen_date: '2026-04-22' },
      { source_product_id: 'eggs-c', locality_code: '1000', store_name_raw: 'Store C', product_code: '3002', category_code: '8', latest_product_name_raw: 'Яйца M 10 бр', is_active: true, last_seen_date: '2026-04-22' },
    ],
    source_product_enrichment: [
      { source_product_id: 'milk-a', normalized_name: 'прясно мляко верея 3% 1л', tokens: ['прясно', 'мляко', 'верея', '3%', '1л'], alias_candidates: ['мляко'], canonical_search_category: 'milk', parse_confidence: 1, canonical_en: { product_type: 'fresh_milk', product_family: 'milk', brand: 'Vereya', size_value: 1, size_unit: 'l', fat_percent: 3 }, display_en: 'Fresh milk Vereya 3% 1L' },
      { source_product_id: 'milk-b', normalized_name: 'прясно мляко олимпус 3% 1л', tokens: ['прясно', 'мляко', 'олимпус', '3%', '1л'], alias_candidates: ['мляко'], canonical_search_category: 'milk', parse_confidence: 1, canonical_en: { product_type: 'fresh_milk', product_family: 'milk', brand: 'Olympus', size_value: 1, size_unit: 'l', fat_percent: 3 }, display_en: 'Fresh milk Olympus 3% 1L' },
      { source_product_id: 'eggs-a', normalized_name: 'яйца m 10 бр', tokens: ['яйца', 'm', '10', 'бр'], alias_candidates: ['яйца'], canonical_search_category: 'eggs', parse_confidence: 1, canonical_en: { product_type: 'eggs', product_family: 'eggs', brand: null, size_value: 10, size_unit: 'count', fat_percent: null }, display_en: 'Eggs M 10' },
      { source_product_id: 'eggs-c', normalized_name: 'яйца m 10 бр', tokens: ['яйца', 'm', '10', 'бр'], alias_candidates: ['яйца'], canonical_search_category: 'eggs', parse_confidence: 1, canonical_en: { product_type: 'eggs', product_family: 'eggs', brand: null, size_value: 10, size_unit: 'count', fat_percent: null }, display_en: 'Eggs M 10' },
    ],
    semantic_profiles: [],
    embedding_records: [],
    feedback_events: [],
    product_daily_prices: [
      {
        source_product_id: 'milk-a',
        date: '2026-04-21',
        price_avg: 2.2,
        price_min: 2.2,
        price_max: 2.2,
        store_count: 1,
        snapshot_count: 1,
      },
      {
        source_product_id: 'milk-a',
        date: '2026-04-22',
        price_avg: 1.8,
        price_min: 1.8,
        price_max: 1.8,
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
    watchlist_profiles: [],
    watchlist_recurring_patterns: [],
    watchlist_insight_events: [],
    watchlist_daily_summaries: [],
    demand_logs: [],
    demand_aggregates: [],
    demand_embeddings: [],
    demand_clusters: [],
    user_tiers: [],
    revenuecat_events: [],
  };
}

test('RevenueCat sync stores premium entitlement and analytics event', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  const response = await handleSyncRevenueCatEntitlementRequest({
    store,
    body: {
      user_id: 'user-1',
      revenuecat_customer_id: 'rc_123',
      entitlement_id: 'premium',
      product_id: 'premium_monthly',
      is_active: true,
      updated_at: '2026-04-22T12:00:00.000Z',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.tier, 'premium');

  const state = await store.load();
  assert.equal(state.user_tiers.length, 1);
  assert.equal(state.revenuecat_events.length, 1);
  assert.equal(state.analytics_events[0].event_type, 'subscription_status_changed');
});

test('entitlement status defaults to free when no synced record exists', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  const response = await handleGetEntitlementStatusRequest({
    store,
    body: {
      user_id: 'user-free',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.tier, 'free');
  assert.equal(response.body.premium_active, false);
});

test('free tier blocks explicit multi-store optimizer requests', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  const response = await handleOptimizeBasketRequest({
    store,
    body: {
      user_id: 'user-free',
      query: 'мляко, яйца',
      require_multi_store: true,
    },
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'premium_required');
});

test('premium tier allows multi-store optimizer requests', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  await handleSyncRevenueCatEntitlementRequest({
    store,
    body: {
      user_id: 'user-pro',
      is_active: true,
      product_id: 'premium_monthly',
    },
  });

  const response = await handleOptimizeBasketRequest({
    store,
    body: {
      user_id: 'user-pro',
      query: 'мляко, яйца',
      require_multi_store: true,
      preferences: {
        price_weight: 1,
        store_weight: 0.2,
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.entitlement.tier, 'premium');
  assert.equal(response.body.multi_store_plan !== null, true);
});

test('free tier blocks target-price alerts endpoint', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  await handleSyncRevenueCatEntitlementRequest({
    store,
    body: {
      user_id: 'user-free',
      is_active: false,
      product_id: 'premium_monthly',
    },
  });

  const response = await handleSetTargetPriceRequest({
    store,
    body: {
      user_id: 'user-free',
      source_product_id: 'milk-a',
      target_price: 1.7,
    },
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.feature, 'alerts');
});

test('alert sending skips blocked free-tier users and queues premium users', async () => {
  const store = new InMemoryDataBackboneStore(createState());
  await handleSyncRevenueCatEntitlementRequest({
    store,
    body: {
      user_id: 'user-free',
      is_active: false,
      product_id: 'premium_monthly',
    },
  });
  await handleSyncRevenueCatEntitlementRequest({
    store,
    body: {
      user_id: 'user-pro',
      is_active: true,
      product_id: 'premium_monthly',
    },
  });

  const result = await sendWatchlistAlerts({
    store,
    alerts: [
      {
        alert_id: 'a-free',
        user_id: 'user-free',
        source_product_id: 'milk-a',
        display_name: 'Milk',
        snapshot_date: '2026-04-22',
        current_price: 1.8,
        previous_price: 2.2,
        target_price: 1.9,
        device_token: null,
      },
      {
        alert_id: 'a-pro',
        user_id: 'user-pro',
        source_product_id: 'milk-a',
        display_name: 'Milk',
        snapshot_date: '2026-04-22',
        current_price: 1.8,
        previous_price: 2.2,
        target_price: 1.9,
        device_token: null,
      },
    ],
    sentAt: '2026-04-22T12:00:00.000Z',
  });

  const blocked = result.state.notification_events.find((entry) => entry.alert_id === 'a-free');
  const queued = result.state.notification_events.find((entry) => entry.alert_id === 'a-pro');
  const blockedAlert = result.state.watchlist_alert_events.find((entry) => entry.alert_id === 'a-free');

  assert.equal(blocked.status, 'blocked');
  assert.equal(queued.status, 'queued');
  assert.equal(blockedAlert.notification_status, 'blocked_entitlement');
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

  console.log(`\nPhase 10 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
