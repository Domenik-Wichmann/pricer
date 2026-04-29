const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  buildMarketTrendSummary,
  handleMarketOverviewRequest,
  handleMarketTrendsRequest,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createStore() {
  return new InMemoryDataBackboneStore({
    canonical_products: [
      product('cp_milk', 'Milk', 'BrandUp'),
      product('cp_yogurt', 'Yogurt', 'BrandDown'),
      product('cp_beef', 'Beef', 'BrandFlat'),
      product('cp_pasta', 'Pasta', 'BrandNoHistory'),
    ],
    canonical_product_mappings: [
      mapping('cp_milk', 'sp_milk'),
      mapping('cp_yogurt', 'sp_yogurt'),
      mapping('cp_beef', 'sp_beef'),
      mapping('cp_pasta', 'sp_pasta'),
    ],
    canonical_enrichment_store: [
      enrichment('cp_milk', {
        category_l1: 'Food & Beverage',
        category_l2: 'Dairy',
        category_l3: 'Milk',
        brand: 'BrandUp',
        base_product: 'Milk',
      }),
      enrichment('cp_yogurt', {
        category_l1: 'Food & Beverage',
        category_l2: 'Dairy',
        category_l3: 'Yogurt',
        brand: 'BrandDown',
        base_product: 'Yogurt',
      }),
      enrichment('cp_beef', {
        category_l1: 'Food & Beverage',
        category_l2: 'Meat',
        category_l3: 'Beef',
        brand: 'BrandFlat',
        base_product: 'Beef',
      }),
      enrichment('cp_pasta', {
        category_l1: 'Food & Beverage',
        category_l2: 'Pantry',
        category_l3: 'Pasta',
        brand: 'BrandNoHistory',
        base_product: 'Pasta',
      }),
    ],
    product_daily_prices: [
      price('sp_milk', '2026-04-14', 8),
      price('sp_milk', '2026-04-20', 20),
      price('sp_milk', '2026-04-24', 10),
      price('sp_yogurt', '2026-04-14', 10),
      price('sp_yogurt', '2026-04-24', 8),
      price('sp_beef', '2026-04-14', 10),
      price('sp_beef', '2026-04-24', 10),
      price('sp_pasta', '2026-04-24', 5),
    ],
  });
}

function product(canonicalProductId, name, brand) {
  return {
    canonical_product_id: canonicalProductId,
    canonical_display_name: name,
    canonical_brand: brand,
  };
}

function mapping(canonicalProductId, sourceProductId) {
  return {
    canonical_product_id: canonicalProductId,
    source_product_id: sourceProductId,
  };
}

function enrichment(canonicalProductId, fields) {
  return {
    canonical_fingerprint: canonicalProductId,
    enrichment: fields,
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

function pickTruth(state) {
  return {
    canonical_products: state.canonical_products,
    canonical_product_mappings: state.canonical_product_mappings,
    canonical_enrichment_store: state.canonical_enrichment_store,
    product_daily_prices: state.product_daily_prices,
  };
}

test('groups market trends by enrichment category', async () => {
  const response = await buildMarketTrendSummary({
    store: createStore(),
    group_by: 'category_l2',
    window: 'last_7d',
  });
  const dairy = response.groups.find((group) => group.key === 'Dairy');

  assert.equal(response.group_by, 'category_l2');
  assert.equal(dairy.product_count, 2);
  assert.equal(dairy.priced_product_count, 2);
  assert.equal(dairy.average_price_current, 9);
  assert.equal(dairy.average_price_previous, 9);
  assert.equal(dairy.trend, 'flat');
});

test('groups market trends by brand and base product', async () => {
  const store = createStore();
  const byBrand = await buildMarketTrendSummary({
    store,
    group_by: 'brand',
    window: 'last_7d',
  });
  const byBaseProduct = await buildMarketTrendSummary({
    store,
    group_by: 'base_product',
    window: 'last_7d',
  });

  assert.equal(byBrand.groups.find((group) => group.key === 'BrandUp').trend, 'up');
  assert.equal(byBrand.groups.find((group) => group.key === 'BrandDown').trend, 'down');
  assert.equal(byBaseProduct.groups.find((group) => group.key === 'Beef').trend, 'flat');
});

test('classifies insufficient data when previous period is missing', async () => {
  const response = await buildMarketTrendSummary({
    store: createStore(),
    group_by: 'brand',
    window: 'last_7d',
  });
  const group = response.groups.find((entry) => entry.key === 'BrandNoHistory');

  assert.equal(group.average_price_current, 5);
  assert.equal(group.average_price_previous, null);
  assert.equal(group.change_percent, null);
  assert.equal(group.trend, 'insufficient_data');
});

test('computes deal density from good deal classifications', async () => {
  const response = await buildMarketTrendSummary({
    store: createStore(),
    group_by: 'category_l2',
    window: 'last_7d',
  });
  const dairy = response.groups.find((group) => group.key === 'Dairy');

  assert.equal(dairy.deal_count, 1);
  assert.equal(dairy.deal_density, 0.5);
});

test('filters trends by enrichment category fields', async () => {
  const response = await buildMarketTrendSummary({
    store: createStore(),
    group_by: 'category_l3',
    window: 'last_7d',
    filters: {
      category_l2: 'Dairy',
    },
  });

  assert.deepEqual(response.groups.map((group) => group.key).sort(), ['Milk', 'Yogurt']);
});

test('market trend summary does not mutate source data', async () => {
  const store = createStore();
  const before = pickTruth(await store.load());
  await buildMarketTrendSummary({
    store,
    group_by: 'category_l2',
    window: 'last_7d',
  });
  await handleMarketTrendsRequest({
    store,
    body: {
      group_by: 'brand',
      window: 'last_7d',
    },
  });
  const after = pickTruth(await store.load());

  assert.deepEqual(after, before);
});

test('market trends API validates request shape and options', async () => {
  const store = createStore();
  const badBody = await handleMarketTrendsRequest({
    store,
    body: [],
  });
  const badGroup = await handleMarketTrendsRequest({
    store,
    body: {
      group_by: 'store',
      window: 'last_7d',
    },
  });
  const badWindow = await handleMarketTrendsRequest({
    store,
    body: {
      group_by: 'brand',
      window: 'yesterday',
    },
  });

  assert.equal(badBody.status, 400);
  assert.equal(badGroup.status, 400);
  assert.equal(badWindow.status, 400);
});

test('market overview returns top-level category trends', async () => {
  const response = await handleMarketOverviewRequest({
    store: createStore(),
    body: {
      window: 'last_7d',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.group_by, 'category_l1');
  assert.equal(response.body.groups[0].key, 'Food & Beverage');
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

  console.log(`\nPhase 17.4 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
