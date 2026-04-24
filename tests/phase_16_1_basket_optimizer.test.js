const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  handleOptimizeBasketSingleStoreRequest,
  optimizeBasketSingleStore,
} = require('../app/functions/src');

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
  price,
  stale = false,
  source = `${chainId}-${price}`,
}) {
  return {
    chain_id: chainId,
    chain_name: chainName,
    store_id: `${chainId}-store`,
    store_name: `${chainName} Store`,
    price,
    currency: 'EUR',
    snapshot_date: stale ? '2026-04-01' : '2026-04-24',
    is_stale: stale,
    source,
  };
}

function baseBasketPlan(overrides = {}) {
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

function basePriceLookup(overrides = {}) {
  return {
    price_mode: 'latest',
    currency: 'EUR',
    items: [
      priceItem('cp_milk', [
        record({ chainId: 'chain-a', chainName: 'Chain A', price: 3 }),
        record({ chainId: 'chain-b', chainName: 'Chain B', price: 5 }),
      ]),
      priceItem('cp_eggs', [
        record({ chainId: 'chain-b', chainName: 'Chain B', price: 33 }),
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

test('complete single-store basket wins over incomplete cheaper basket due to penalty', () => {
  const result = optimizeBasketSingleStore({
    basketPlan: baseBasketPlan(),
    priceLookup: basePriceLookup(),
    options: {
      missing_item_penalty: 999,
    },
  });

  assert.equal(result.optimization_type, 'single_store');
  assert.equal(result.best_option.chain_id, 'chain-b');
  assert.equal(result.best_option.actual_total, 38);
  assert.equal(result.best_option.score_total, 38);
  assert.equal(result.best_option.missing_item_count, 0);
  assert.equal(result.alternatives[0].chain_id, 'chain-a');
  assert.equal(result.alternatives[0].actual_total, 3);
  assert.equal(result.alternatives[0].score_total, 1002);
});

test('actual_total excludes penalty while score_total includes penalty for missing prices', () => {
  const result = optimizeBasketSingleStore({
    basketPlan: baseBasketPlan(),
    priceLookup: basePriceLookup(),
    options: {
      missing_item_penalty: 50,
    },
  });
  const incomplete = result.alternatives.find((option) => option.chain_id === 'chain-a');

  assert.equal(incomplete.actual_total, 3);
  assert.equal(incomplete.score_total, 53);
  assert.equal(incomplete.items.find((item) => item.canonical_product_id === 'cp_eggs').unit_price, null);
});

test('missing prices are explicit in option item warnings', () => {
  const result = optimizeBasketSingleStore({
    basketPlan: baseBasketPlan(),
    priceLookup: basePriceLookup(),
  });
  const incomplete = result.alternatives.find((option) => option.chain_id === 'chain-a');

  assert.equal(incomplete.missing_item_count, 1);
  assert.equal(incomplete.warnings.some((warning) => warning.code === 'missing_price'), true);
});

test('requested quantity multiplies line totals and actual totals', () => {
  const result = optimizeBasketSingleStore({
    basketPlan: baseBasketPlan({
      ready_items: [readyItem('cp_milk', 'Milk 1L', '2x milk', 2)],
    }),
    priceLookup: basePriceLookup({
      items: [
        priceItem('cp_milk', [
          record({ chainId: 'chain-a', chainName: 'Chain A', price: 3 }),
        ]),
      ],
    }),
  });

  assert.equal(result.best_option.items[0].line_total, 6);
  assert.equal(result.best_option.actual_total, 6);
});

test('stale prices are excluded by default and counted as stale missing items', () => {
  const result = optimizeBasketSingleStore({
    basketPlan: baseBasketPlan({
      ready_items: [
        readyItem('cp_milk', 'Milk 1L', 'milk'),
        readyItem('cp_bread', 'Bread', 'bread'),
      ],
    }),
    priceLookup: basePriceLookup({
      items: [
        priceItem('cp_milk', [
          record({ chainId: 'chain-a', chainName: 'Chain A', price: 3 }),
        ]),
        priceItem('cp_bread', [
          record({ chainId: 'chain-a', chainName: 'Chain A', price: 2, stale: true }),
        ]),
      ],
    }),
  });

  assert.equal(result.best_option.chain_id, 'chain-a');
  assert.equal(result.best_option.stale_item_count, 1);
  assert.equal(result.best_option.missing_item_count, 1);
  assert.equal(result.best_option.warnings.some((warning) => warning.code === 'stale_price_excluded'), true);
});

test('stale-only candidate chains still produce explicit stale warnings', () => {
  const result = optimizeBasketSingleStore({
    basketPlan: baseBasketPlan({
      ready_items: [readyItem('cp_bread', 'Bread', 'bread')],
    }),
    priceLookup: basePriceLookup({
      items: [
        priceItem('cp_bread', [
          record({ chainId: 'chain-a', chainName: 'Chain A', price: 2, stale: true }),
        ]),
      ],
    }),
  });

  assert.equal(result.summary.candidate_chain_count, 1);
  assert.equal(result.best_option.stale_item_count, 1);
  assert.equal(result.best_option.actual_total, 0);
  assert.equal(result.best_option.score_total, 999);
});

test('planner-blocked basket plans prevent optimization', () => {
  const result = optimizeBasketSingleStore({
    basketPlan: baseBasketPlan({
      optimization_ready: false,
      unresolved_items: [{
        input_text: 'unknown item',
      }],
    }),
    priceLookup: basePriceLookup(),
  });

  assert.equal(result.optimization_ready, false);
  assert.equal(result.best_option, null);
  assert.equal(result.warnings.some((warning) => warning.code === 'basket_plan_not_ready'), true);
});

test('ambiguous cheapest-candidate policy auto-selects the cheapest candidate per chain', () => {
  const result = optimizeBasketSingleStore({
    basketPlan: baseBasketPlan({
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
    priceLookup: basePriceLookup({
      items: [
        priceItem('cp_milk', [
          record({ chainId: 'chain-a', chainName: 'Chain A', price: 3 }),
        ]),
        priceItem('cp_chocolate_milk', [
          record({ chainId: 'chain-a', chainName: 'Chain A', price: 4 }),
        ]),
        priceItem('cp_whole_milk', [
          record({ chainId: 'chain-a', chainName: 'Chain A', price: 2 }),
        ]),
      ],
    }),
    options: {
      ambiguous_policy: 'cheapest_candidate',
    },
  });
  const selectedAmbiguous = result.best_option.items.find((item) => item.type === 'ambiguous');

  assert.equal(result.requires_user_confirmation, false);
  assert.equal(selectedAmbiguous.canonical_product_id, 'cp_whole_milk');
  assert.equal(result.best_option.warnings.some((warning) => warning.code === 'ambiguous_candidate_auto_selected'), true);
});

test('require-confirmation ambiguous policy blocks ambiguous optimization', () => {
  const result = optimizeBasketSingleStore({
    basketPlan: baseBasketPlan({
      ambiguous_items: [{
        input_text: 'milk variant',
        requested_quantity: 1,
        carried_candidates: [
          { canonical_product_id: 'cp_chocolate_milk', canonical_name: 'Chocolate Milk' },
        ],
      }],
    }),
    priceLookup: basePriceLookup(),
    options: {
      ambiguous_policy: 'require_confirmation',
    },
  });

  assert.equal(result.optimization_ready, false);
  assert.equal(result.requires_user_confirmation, true);
  assert.equal(result.best_option, null);
});

test('optimizer output currency is EUR', () => {
  const result = optimizeBasketSingleStore({
    basketPlan: baseBasketPlan(),
    priceLookup: basePriceLookup(),
  });

  assert.equal(result.currency, 'EUR');
  assert.equal(result.best_option.currency, 'EUR');
});

test('optimizer does not mutate basket plan or price lookup inputs', () => {
  const basketPlan = baseBasketPlan();
  const priceLookup = basePriceLookup();
  const before = JSON.parse(JSON.stringify({ basketPlan, priceLookup }));

  optimizeBasketSingleStore({
    basketPlan,
    priceLookup,
  });

  assert.deepEqual(basketPlan, before.basketPlan);
  assert.deepEqual(priceLookup, before.priceLookup);
});

test('basket optimize endpoint validates bad optimizer input', async () => {
  const response = await handleOptimizeBasketSingleStoreRequest({
    store: new InMemoryDataBackboneStore(),
    body: {
      items: ['milk'],
      optimizer_options: {
        ambiguous_policy: 'invent_best',
      },
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'invalid ambiguous_policy');
});

test('deterministic tie-breaking uses chain id after score coverage and actual total tie', () => {
  const result = optimizeBasketSingleStore({
    basketPlan: baseBasketPlan({
      ready_items: [readyItem('cp_milk', 'Milk 1L', 'milk')],
    }),
    priceLookup: basePriceLookup({
      items: [
        priceItem('cp_milk', [
          record({ chainId: 'z-chain', chainName: 'Z Chain', price: 3 }),
          record({ chainId: 'a-chain', chainName: 'A Chain', price: 3 }),
        ]),
      ],
    }),
  });

  assert.equal(result.best_option.chain_id, 'a-chain');
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

  console.log(`\nPhase 16.1 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
