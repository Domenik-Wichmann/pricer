const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  buildHomeSummary,
  handleHomeSummaryRequest,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
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

function createStore() {
  return new InMemoryDataBackboneStore({
    canonical_products: [
      product('cp_coffee', 'Coffee'),
      product('cp_tea', 'Tea'),
      product('cp_milk', 'Milk'),
      product('cp_missing', 'Missing Product'),
    ],
    canonical_product_mappings: [
      mapping('cp_coffee', 'sp_coffee_lidl'),
      mapping('cp_coffee', 'sp_coffee_kaufland'),
      mapping('cp_tea', 'sp_tea_lidl'),
      mapping('cp_tea', 'sp_tea_kaufland'),
      mapping('cp_milk', 'sp_milk_lidl'),
    ],
    canonical_enrichment_store: [
      enrichment('cp_coffee', 'Pantry', 'Coffee', 'Coffee', 'Roast Co'),
      enrichment('cp_tea', 'Pantry', 'Tea', 'Tea', 'Tea Co'),
      enrichment('cp_milk', 'Dairy', 'Milk', 'Milk', 'Dairy Co'),
      enrichment('cp_missing', 'Pantry', 'Other', 'Missing Product', 'None'),
    ],
    raw_price_snapshots: [
      snapshot('snap_coffee_lidl', 'sp_coffee_lidl', 'Lidl', 2),
      snapshot('snap_coffee_kaufland', 'sp_coffee_kaufland', 'Kaufland', 4),
      snapshot('snap_tea_lidl', 'sp_tea_lidl', 'Lidl', 1),
      snapshot('snap_tea_kaufland', 'sp_tea_kaufland', 'Kaufland', 3),
      snapshot('snap_milk_lidl', 'sp_milk_lidl', 'Lidl', 5),
    ],
    product_daily_prices: [
      price('sp_coffee_lidl', '2026-03-25', 2),
      price('sp_coffee_lidl', '2026-04-24', 2),
      price('sp_tea_lidl', '2026-03-25', 1),
      price('sp_tea_lidl', '2026-04-24', 1),
      price('sp_milk_lidl', '2026-03-25', 4),
      price('sp_milk_lidl', '2026-04-24', 5),
    ],
    watchlist_store: [
      watch('wl_user_coffee', 'user-1', 'cp_coffee', 'Coffee', 2.5, '2026-04-24T12:00:00.000Z'),
      watch('wl_user_missing', 'user-1', 'cp_missing', 'Missing Product', null, '2026-04-24T11:00:00.000Z'),
      watch('wl_other_tea', 'user-2', 'cp_tea', 'Tea', 1.5, '2026-04-24T13:00:00.000Z'),
    ],
    saved_lists_store: [
      savedList('sl_user_weekly', 'user-1', 'Weekly groceries', ['coffee', 'milk'], '2026-04-24T12:00:00.000Z'),
      savedList('sl_user_party', 'user-1', 'Party list', ['tea'], '2026-04-24T11:00:00.000Z'),
      savedList('sl_other', 'user-2', 'Other owner list', ['tea'], '2026-04-24T13:00:00.000Z'),
    ],
    basket_analytics_store: [
      {
        analytics_id: 'internal_metric',
        health_status: 'critical',
      },
    ],
  });
}

function product(canonicalProductId, name) {
  return {
    canonical_product_id: canonicalProductId,
    canonical_display_name: name,
  };
}

function mapping(canonicalProductId, sourceProductId) {
  return {
    canonical_product_id: canonicalProductId,
    source_product_id: sourceProductId,
  };
}

function enrichment(canonicalProductId, categoryL2, categoryL3, baseProduct, brand) {
  return {
    canonical_fingerprint: canonicalProductId,
    enrichment: {
      category_l1: 'Food & Beverage',
      category_l2: categoryL2,
      category_l3: categoryL3,
      base_product: baseProduct,
      brand,
    },
  };
}

function snapshot(snapshotId, sourceProductId, chainName, price) {
  return {
    snapshot_id: snapshotId,
    source_product_id: sourceProductId,
    source_chain_name_raw: chainName,
    source_chain_name_normalized: chainName.toLowerCase(),
    store_name_raw: `${chainName} Sofia`,
    locality_code: '1000',
    retail_price: price,
    promo_price: 0,
    snapshot_date: '2026-04-24',
    ingested_at: '2026-04-24T10:00:00.000Z',
  };
}

function price(sourceProductId, date, value) {
  return {
    source_product_id: sourceProductId,
    date,
    price_avg: value,
    price_min: value,
    price_max: value,
    store_count: 1,
    snapshot_count: 1,
  };
}

function watch(watchId, ownerId, canonicalProductId, label, targetPrice, updatedAt) {
  const record = {
    watch_id: watchId,
    owner_id: ownerId,
    owner_type: 'user',
    canonical_product_id: canonicalProductId,
    label,
    created_at: updatedAt,
    updated_at: updatedAt,
  };
  if (targetPrice !== null) {
    record.target_price = targetPrice;
  }
  return record;
}

function savedList(listId, ownerId, name, itemTexts, updatedAt) {
  return {
    list_id: listId,
    owner_id: ownerId,
    owner_type: 'user',
    name,
    items: itemTexts.map((text) => ({ text })),
    created_at: updatedAt,
    updated_at: updatedAt,
  };
}

function pickMutableTruth(state) {
  return {
    raw_price_snapshots: state.raw_price_snapshots,
    product_daily_prices: state.product_daily_prices,
    canonical_products: state.canonical_products,
    canonical_product_mappings: state.canonical_product_mappings,
    canonical_enrichment_store: state.canonical_enrichment_store,
    watchlist_store: state.watchlist_store,
    saved_lists_store: state.saved_lists_store,
  };
}

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectKeys(entry, keys));
    return keys;
  }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      keys.add(key);
      collectKeys(value[key], keys);
    });
  }
  return keys;
}

test('home summary returns expected top-level shape', async () => {
  const summary = await buildHomeSummary({
    store: createStore(),
    owner_context: owner('user-1'),
    generatedAt: '2026-04-24T12:30:00.000Z',
  });

  assert.deepEqual(Object.keys(summary).sort(), [
    'generated_at',
    'market_highlights',
    'owner',
    'quick_actions',
    'saved_lists',
    'top_deals',
    'watchlist_highlights',
  ]);
  assert.deepEqual(summary.owner, owner('user-1'));
  assert.equal(summary.generated_at, '2026-04-24T12:30:00.000Z');
  assert.equal(Array.isArray(summary.top_deals), true);
});

test('home summary includes owner-scoped watchlist highlights', async () => {
  const summary = await buildHomeSummary({
    store: createStore(),
    owner_context: owner('user-1'),
  });

  assert.deepEqual(
    summary.watchlist_highlights.map((item) => item.watch_id).sort(),
    ['wl_user_coffee', 'wl_user_missing']
  );
  assert.equal(summary.watchlist_highlights.find((item) => item.watch_id === 'wl_user_coffee').highlight_type, 'target_hit');
  assert.equal(summary.watchlist_highlights.find((item) => item.watch_id === 'wl_user_missing').highlight_type, 'missing_price');
});

test('home summary includes owner-scoped saved lists only', async () => {
  const summary = await buildHomeSummary({
    store: createStore(),
    owner_context: owner('user-1'),
  });

  assert.deepEqual(summary.saved_lists.map((list) => list.list_id), ['sl_user_weekly', 'sl_user_party']);
  assert.equal(summary.saved_lists[0].item_count, 2);
  assert.equal(summary.saved_lists[0].action, 'optimize_saved_list');
});

test('home summary does not expose internal health metrics', async () => {
  const summary = await buildHomeSummary({
    store: createStore(),
    owner_context: owner('user-1'),
  });
  const keys = collectKeys(summary);

  assert.equal(keys.has('basket_analytics_store'), false);
  assert.equal(keys.has('analytics_id'), false);
  assert.equal(keys.has('health_status'), false);
  assert.equal(keys.has('diagnostics'), false);
});

test('empty data returns safe empty arrays and quick actions', async () => {
  const summary = await buildHomeSummary({
    store: new InMemoryDataBackboneStore(),
    owner_context: owner('user-1'),
  });

  assert.deepEqual(summary.top_deals, []);
  assert.deepEqual(summary.watchlist_highlights, []);
  assert.deepEqual(summary.market_highlights, []);
  assert.deepEqual(summary.saved_lists, []);
  assert.equal(summary.quick_actions.length, 3);
});

test('home summary respects limits', async () => {
  const summary = await buildHomeSummary({
    store: createStore(),
    owner_context: owner('user-1'),
    options: {
      deal_limit: 1,
      watchlist_limit: 1,
      saved_list_limit: 1,
      market_limit: 1,
    },
  });

  assert.equal(summary.top_deals.length, 1);
  assert.equal(summary.watchlist_highlights.length, 1);
  assert.equal(summary.saved_lists.length, 1);
  assert.equal(summary.market_highlights.length, 1);
});

test('home summary includes quick actions', async () => {
  const summary = await buildHomeSummary({
    store: createStore(),
    owner_context: owner('user-1'),
  });

  assert.deepEqual(summary.quick_actions, [
    { type: 'search_product', label: 'Search products' },
    { type: 'optimize_basket', label: 'Optimize a basket' },
    { type: 'view_watchlist', label: 'View watchlist' },
  ]);
});

test('home summary endpoint uses owner headers and query limits', async () => {
  const response = await handleHomeSummaryRequest({
    store: createStore(),
    query: {
      saved_list_limit: '1',
      watchlist_limit: '1',
    },
    req: {
      headers: {
        'x-pricer-owner-id': 'user-1',
        'x-pricer-owner-type': 'user',
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.owner, owner('user-1'));
  assert.equal(response.body.saved_lists.length, 1);
  assert.equal(response.body.watchlist_highlights.length, 1);
});

test('home summary does not mutate underlying stores', async () => {
  const store = createStore();
  const before = pickMutableTruth(await store.load());
  await buildHomeSummary({
    store,
    owner_context: owner('user-1'),
  });
  await handleHomeSummaryRequest({
    store,
    query: {
      deal_limit: '1',
    },
    req: {
      headers: {
        'x-pricer-owner-id': 'user-1',
        'x-pricer-owner-type': 'user',
      },
    },
  });
  const after = pickMutableTruth(await store.load());

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

  console.log(`\nPhase 17.5 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
