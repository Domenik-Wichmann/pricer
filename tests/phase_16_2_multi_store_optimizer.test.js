const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  handleOptimizeBasketSingleStoreRequest,
  importDailySnapshotCsvStream,
  optimizeBasketMultiStore,
  optimizeBasketSingleStore,
} = require('../app/functions/src');
const { SOURCE_HEADERS } = require('../app/functions/src/phase1/constants');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function readyItem(canonicalProductId, canonicalName, inputText = canonicalName, quantity = 1) {
  return {
    canonical_product_id: canonicalProductId,
    canonical_name: canonicalName,
    input_text: inputText,
    quantity,
    requested_quantity: quantity,
  };
}

function priceItem(canonicalProductId, records) {
  return {
    canonical_product_id: canonicalProductId,
    price_records: records,
    best_price: records.find((record) => !record.is_stale) || null,
    price_status: records.some((record) => !record.is_stale)
      ? 'priced'
      : records.length > 0
        ? 'stale'
        : 'missing',
  };
}

function record({
  chainId,
  chainName = chainId,
  storeId = `${chainId}-store`,
  storeName = `${chainName} Store`,
  price,
  stale = false,
  source = `${storeId}-${price}`,
}) {
  return {
    chain_id: chainId,
    chain_name: chainName,
    store_id: storeId,
    store_name: storeName,
    price,
    currency: 'EUR',
    snapshot_date: stale ? '2026-04-01' : '2026-04-24',
    is_stale: stale,
    source,
  };
}

function basketPlan(overrides = {}) {
  return {
    layer_mode: 'canonical_with_enrichment',
    optimization_ready: true,
    requires_user_confirmation: false,
    ready_items: [
      readyItem('cp_milk', 'Milk 1L', 'milk'),
      readyItem('cp_eggs', 'Eggs 10 Count', '10 eggs'),
    ],
    ambiguous_items: [],
    unresolved_items: [],
    summary: {
      total_items: 2,
      ready_count: 2,
      ambiguous_count: 0,
      unresolved_count: 0,
    },
    ...overrides,
  };
}

function splitPriceLookup(overrides = {}) {
  return {
    price_mode: 'latest',
    currency: 'EUR',
    items: [
      priceItem('cp_milk', [
        record({ chainId: 'store-a', chainName: 'Store A', price: 10 }),
        record({ chainId: 'store-b', chainName: 'Store B', price: 2 }),
      ]),
      priceItem('cp_eggs', [
        record({ chainId: 'store-a', chainName: 'Store A', price: 2 }),
        record({ chainId: 'store-b', chainName: 'Store B', price: 10 }),
      ]),
    ],
    summary: {
      requested_count: 2,
      priced_count: 2,
      stale_count: 0,
      missing_count: 0,
    },
    ...overrides,
  };
}

function optimizeMulti({
  plan = basketPlan(),
  lookup = splitPriceLookup(),
  options = {},
} = {}) {
  const single = optimizeBasketSingleStore({
    basketPlan: plan,
    priceLookup: lookup,
    options,
  });
  return optimizeBasketMultiStore({
    basketPlan: plan,
    priceLookup: lookup,
    singleStoreResult: single,
    options: {
      strategy: 'multi_store',
      ...options,
    },
  });
}

function createCsv(rows) {
  const header = [
    SOURCE_HEADERS.localityCode,
    SOURCE_HEADERS.storeNameRaw,
    SOURCE_HEADERS.productNameRaw,
    SOURCE_HEADERS.productCode,
    SOURCE_HEADERS.categoryCode,
    SOURCE_HEADERS.retailPrice,
    SOURCE_HEADERS.promoPrice,
  ].map((value) => `"${value}"`).join(',');

  return Readable.from([[header, ...rows].join('\n')]);
}

async function createEndpointStore() {
  const store = new InMemoryDataBackboneStore();
  await importDailySnapshotCsvStream({
    store,
    csvStream: createCsv([
      '"1000","Store A","Milk 1L","1001","6","3.00","0"',
      '"1000","Store A","Eggs 10 Count","1002","8","8.00","0"',
    ]),
    snapshotDate: '2026-04-24',
    sourceFileName: 'STORE_A.csv',
    ingestedAt: '2026-04-24T09:00:00.000Z',
    enableLlmEnrichment: false,
  });
  await importDailySnapshotCsvStream({
    store,
    csvStream: createCsv([
      '"1000","Store B","Milk 1L","2001","6","8.00","0"',
      '"1000","Store B","Eggs 10 Count","2002","8","3.00","0"',
    ]),
    snapshotDate: '2026-04-24',
    sourceFileName: 'STORE_B.csv',
    ingestedAt: '2026-04-24T10:00:00.000Z',
    enableLlmEnrichment: false,
  });

  return store;
}

test('two-store split beats single-store and is recommended', () => {
  const result = optimizeMulti({
    options: {
      minimum_savings: 0.5,
    },
  });

  assert.equal(result.optimization_type, 'multi_store');
  assert.equal(result.recommended_strategy, 'multi_store');
  assert.equal(result.best_single_store_option.actual_total, 12);
  assert.equal(result.best_multi_store_option.actual_total, 4);
  assert.equal(result.best_multi_store_option.savings_vs_best_single_store, 8);
});

test('tiny savings below threshold does not recommend multi-store', () => {
  const result = optimizeMulti({
    lookup: splitPriceLookup({
      items: [
        priceItem('cp_milk', [
          record({ chainId: 'store-a', chainName: 'Store A', price: 5 }),
          record({ chainId: 'store-b', chainName: 'Store B', price: 4.8 }),
        ]),
        priceItem('cp_eggs', [
          record({ chainId: 'store-a', chainName: 'Store A', price: 5 }),
          record({ chainId: 'store-b', chainName: 'Store B', price: 6 }),
        ]),
      ],
    }),
    options: {
      minimum_savings: 0.5,
    },
  });

  assert.equal(result.best_multi_store_option.savings_vs_best_single_store, 0.2);
  assert.equal(result.recommended_strategy, 'single_store');
});

test('multi-store with worse coverage does not beat single-store recommendation', () => {
  const plan = basketPlan();
  const lookup = splitPriceLookup({
      items: [
        priceItem('cp_milk', [
          record({ chainId: 'store-a', chainName: 'Store A', price: 50 }),
          record({ chainId: 'store-b', chainName: 'Store B', price: 1 }),
          record({ chainId: 'store-c', chainName: 'Store C', price: 1 }),
        ]),
        priceItem('cp_eggs', [
          record({ chainId: 'store-a', chainName: 'Store A', price: 50 }),
        ]),
      ],
    });
  const result = optimizeBasketMultiStore({
    basketPlan: plan,
    priceLookup: lookup,
    singleStoreResult: {
      optimization_type: 'single_store',
      currency: 'EUR',
      optimization_ready: true,
      requires_user_confirmation: false,
      best_option: {
        chain_id: 'store-a',
        actual_total: 100,
        score_total: 100,
        coverage_ratio: 1,
      },
      alternatives: [],
      summary: {},
      warnings: [],
    },
    options: {
      strategy: 'multi_store',
      missing_item_penalty: 0,
      minimum_savings: 1,
    },
  });

  assert.equal(result.best_multi_store_option.coverage_ratio < result.best_single_store_option.coverage_ratio, true);
  assert.equal(result.recommended_strategy, 'single_store');
});

test('missing-item penalty affects score_total but not actual_total', () => {
  const result = optimizeMulti({
    lookup: splitPriceLookup({
      items: [
        priceItem('cp_milk', [
          record({ chainId: 'store-a', chainName: 'Store A', price: 2 }),
          record({ chainId: 'store-b', chainName: 'Store B', price: 3 }),
        ]),
        priceItem('cp_eggs', []),
      ],
    }),
    options: {
      missing_item_penalty: 25,
    },
  });

  assert.equal(result.best_multi_store_option.actual_total, 2);
  assert.equal(result.best_multi_store_option.score_total, 27);
});

test('max_stores equals 2 bounds evaluated combinations', () => {
  const result = optimizeMulti({
    plan: basketPlan({
      ready_items: [readyItem('cp_milk', 'Milk 1L', 'milk')],
    }),
    lookup: splitPriceLookup({
      items: [
        priceItem('cp_milk', [
          record({ chainId: 'store-a', price: 1 }),
          record({ chainId: 'store-b', price: 2 }),
          record({ chainId: 'store-c', price: 3 }),
          record({ chainId: 'store-d', price: 4 }),
        ]),
      ],
    }),
    options: {
      max_stores: 2,
    },
  });

  assert.equal(result.summary.candidate_store_count, 4);
  assert.equal(result.summary.evaluated_combination_count, 6);
});

test('deterministic multi-store tie-breaking uses store id order', () => {
  const result = optimizeMulti({
    plan: basketPlan({
      ready_items: [readyItem('cp_milk', 'Milk 1L', 'milk')],
    }),
    lookup: splitPriceLookup({
      items: [
        priceItem('cp_milk', [
          record({ chainId: 'z-store', price: 1 }),
          record({ chainId: 'a-store', price: 1 }),
          record({ chainId: 'm-store', price: 1 }),
        ]),
      ],
    }),
  });

  assert.equal(result.best_multi_store_option.stores[0].chain_id, 'a-store');
});

test('ambiguous cheapest candidate works across store combinations', () => {
  const result = optimizeMulti({
    plan: basketPlan({
      ready_items: [readyItem('cp_milk', 'Milk 1L', 'milk')],
      ambiguous_items: [{
        input_text: 'milk variant',
        requested_quantity: 1,
        carried_candidates: [
          { canonical_product_id: 'cp_chocolate_milk', canonical_name: 'Chocolate Milk' },
          { canonical_product_id: 'cp_whole_milk', canonical_name: 'Whole Milk' },
        ],
      }],
    }),
    lookup: splitPriceLookup({
      items: [
        priceItem('cp_milk', [
          record({ chainId: 'store-a', price: 4 }),
          record({ chainId: 'store-b', price: 3 }),
        ]),
        priceItem('cp_chocolate_milk', [
          record({ chainId: 'store-a', price: 8 }),
        ]),
        priceItem('cp_whole_milk', [
          record({ chainId: 'store-b', price: 2 }),
        ]),
      ],
    }),
  });
  const ambiguous = result.best_multi_store_option.items.find((item) => item.type === 'ambiguous');

  assert.equal(ambiguous.canonical_product_id, 'cp_whole_milk');
  assert.equal(result.best_multi_store_option.warnings.some((warning) => warning.code === 'ambiguous_candidate_auto_selected'), true);
});

test('stale prices are excluded by default in multi-store options', () => {
  const result = optimizeMulti({
    plan: basketPlan({
      ready_items: [readyItem('cp_milk', 'Milk 1L', 'milk')],
    }),
    lookup: splitPriceLookup({
      items: [
        priceItem('cp_milk', [
          record({ chainId: 'store-a', price: 1, stale: true }),
          record({ chainId: 'store-b', price: 3 }),
        ]),
      ],
    }),
  });

  assert.equal(result.best_multi_store_option.stale_item_count, 0);
  assert.equal(result.best_multi_store_option.actual_total, 3);
});

test('basket optimize endpoint remains single-store by default', async () => {
  const response = await handleOptimizeBasketSingleStoreRequest({
    store: await createEndpointStore(),
    body: {
      items: ['milk'],
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.optimizer_result.optimization_type, 'single_store');
});

test('basket optimize endpoint returns combined multi-store result when requested', async () => {
  const response = await handleOptimizeBasketSingleStoreRequest({
    store: await createEndpointStore(),
    body: {
      items: ['milk', 'eggs'],
      optimizer_options: {
        strategy: 'multi_store',
        max_stores: 2,
        minimum_savings: 0.5,
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.optimizer_result.optimization_type, 'multi_store');
  assert.equal(response.body.optimizer_result.best_single_store_option !== undefined, true);
  assert.equal(response.body.optimizer_result.best_multi_store_option !== undefined, true);
});

test('multi-store output currency remains EUR', () => {
  const result = optimizeMulti();

  assert.equal(result.currency, 'EUR');
  assert.equal(result.best_multi_store_option.currency, 'EUR');
});

test('multi-store optimizer does not mutate basket plan or price lookup inputs', () => {
  const plan = basketPlan();
  const lookup = splitPriceLookup();
  const before = JSON.parse(JSON.stringify({ plan, lookup }));

  optimizeMulti({
    plan,
    lookup,
  });

  assert.deepEqual(plan, before.plan);
  assert.deepEqual(lookup, before.lookup);
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

  console.log(`\nPhase 16.2 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
