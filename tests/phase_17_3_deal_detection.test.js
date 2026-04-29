const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  addWatchlistItem,
  buildWatchlistPriceView,
  classifyProductDeal,
  handleDealCheckRequest,
  handleOptimizeBasketSingleStoreRequest,
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

function priceRecord(price) {
  return {
    price,
    currency: 'EUR',
    chain_id: `chain-${price}`,
    store_id: `store-${price}`,
    snapshot_date: '2026-04-24',
    is_stale: false,
  };
}

function createStore() {
  return new InMemoryDataBackboneStore({
    canonical_products: [
      {
        canonical_product_id: 'cp_coffee',
        canonical_display_name: 'Coffee',
      },
      {
        canonical_product_id: 'cp_tea',
        canonical_display_name: 'Tea',
      },
    ],
    canonical_product_mappings: [
      {
        canonical_product_id: 'cp_coffee',
        source_product_id: 'sp_coffee_lidl',
      },
      {
        canonical_product_id: 'cp_coffee',
        source_product_id: 'sp_coffee_kaufland',
      },
      {
        canonical_product_id: 'cp_tea',
        source_product_id: 'sp_tea_lidl',
      },
      {
        canonical_product_id: 'cp_tea',
        source_product_id: 'sp_tea_kaufland',
      },
    ],
    source_products: [
      sourceProduct('sp_coffee_lidl', 'Lidl'),
      sourceProduct('sp_coffee_kaufland', 'Kaufland'),
      sourceProduct('sp_tea_lidl', 'Lidl'),
      sourceProduct('sp_tea_kaufland', 'Kaufland'),
    ],
    raw_price_snapshots: [
      snapshot('snap_coffee_lidl', 'sp_coffee_lidl', 'Lidl', 2.49),
      snapshot('snap_coffee_kaufland', 'sp_coffee_kaufland', 'Kaufland', 3.99),
      snapshot('snap_tea_lidl', 'sp_tea_lidl', 'Lidl', 4.20),
      snapshot('snap_tea_kaufland', 'sp_tea_kaufland', 'Kaufland', 3.00),
    ],
  });
}

function sourceProduct(sourceProductId, chainName) {
  return {
    source_product_id: sourceProductId,
    source_chain_name_raw: chainName,
    source_chain_name_normalized: chainName.toLowerCase(),
    store_name_raw: `${chainName} Sofia`,
    locality_code: '1000',
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

function pickPriceTruth(state) {
  return {
    raw_price_snapshots: state.raw_price_snapshots,
    product_daily_prices: state.product_daily_prices,
    source_products: state.source_products,
    canonical_product_mappings: state.canonical_product_mappings,
  };
}

test('classifies good deal below recent average threshold', () => {
  const deal = classifyProductDeal({
    price_records: [priceRecord(2.49), priceRecord(3.99)],
    current_price: 2.49,
  });

  assert.equal(deal.deal_level, 'good');
  assert.equal(deal.comparison.avg_price, 3.24);
  assert.match(deal.reason, /below recent average/);
});

test('classifies expensive price above recent average threshold', () => {
  const deal = classifyProductDeal({
    price_records: [priceRecord(2.49), priceRecord(3.99)],
    current_price: 3.99,
  });

  assert.equal(deal.deal_level, 'expensive');
  assert.match(deal.reason, /above recent average/);
});

test('classifies normal price near recent average', () => {
  const deal = classifyProductDeal({
    price_records: [priceRecord(3), priceRecord(3.2), priceRecord(3.4)],
    current_price: 3.2,
  });

  assert.equal(deal.deal_level, 'normal');
  assert.equal(deal.deal_score, 0.5);
});

test('missing history defaults to normal', () => {
  const deal = classifyProductDeal({
    price_records: [],
    current_price: 3.2,
  });

  assert.equal(deal.deal_level, 'normal');
  assert.equal(deal.reason, 'not enough recent price history');
  assert.equal(deal.comparison.avg_price, null);
});

test('target price hit is detected', () => {
  const deal = classifyProductDeal({
    price_records: [priceRecord(2.49), priceRecord(3.99)],
    current_price: 2.49,
    target_price: 2.50,
  });

  assert.equal(deal.target_hit, true);
});

test('watchlist price view includes deal signal', async () => {
  const store = createStore();
  await addWatchlistItem({
    store,
    ownerContext: owner('user-1'),
    input: {
      canonical_product_id: 'cp_coffee',
      label: 'Coffee',
      target_price: 2.50,
    },
    createdAt: '2026-04-24T12:00:00.000Z',
  });

  const response = await buildWatchlistPriceView({
    store,
    ownerContext: owner('user-1'),
    options: {
      max_age_days: 30,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items[0].deal.deal_level, 'good');
  assert.equal(response.body.items[0].deal.target_hit, true);
});

test('basket optimize output includes item deals and summary', async () => {
  const store = createStore();
  const response = await handleOptimizeBasketSingleStoreRequest({
    store,
    body: {
      items: ['coffee', 'tea'],
      price_options: {
        max_age_days: 30,
      },
      optimizer_options: {
        strategy: 'single_store',
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(Boolean(response.body.optimizer_result.best_option.items[0].deal), true);
  assert.equal(typeof response.body.optimizer_result.basket_deal_summary.good_deals_count, 'number');
});

test('standalone deal check endpoint returns product deal classifications', async () => {
  const store = createStore();
  const response = await handleDealCheckRequest({
    store,
    body: {
      canonical_product_ids: ['cp_coffee', 'cp_tea'],
      target_prices: {
        cp_coffee: 2.5,
      },
      price_options: {
        max_age_days: 30,
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 2);
  assert.equal(response.body.items.find((item) => item.canonical_product_id === 'cp_coffee').deal.target_hit, true);
  assert.equal(typeof response.body.summary.good_deals_count, 'number');
});

test('deal detection does not mutate price data', async () => {
  const store = createStore();
  const before = pickPriceTruth(await store.load());
  await buildWatchlistPriceView({
    store,
    ownerContext: owner('user-1'),
    options: {
      max_age_days: 30,
    },
  });
  await handleDealCheckRequest({
    store,
    body: {
      canonical_product_ids: ['cp_coffee'],
      price_options: {
        max_age_days: 30,
      },
    },
  });
  const after = pickPriceTruth(await store.load());

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

  console.log(`\nPhase 17.3 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
