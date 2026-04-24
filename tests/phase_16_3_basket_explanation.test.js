const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  buildBasketOptimizationExplanation,
  handleOptimizeBasketSingleStoreRequest,
  importDailySnapshotCsvStream,
} = require('../app/functions/src');
const { SOURCE_HEADERS } = require('../app/functions/src/phase1/constants');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function singleStoreResult(overrides = {}) {
  return {
    optimization_type: 'single_store',
    currency: 'EUR',
    optimization_ready: true,
    requires_user_confirmation: false,
    best_option: {
      chain_id: 'lidl',
      chain_name: 'Lidl',
      store_id: null,
      store_name: null,
      actual_total: 12,
      score_total: 12,
      currency: 'EUR',
      coverage_ratio: 1,
      priced_item_count: 2,
      missing_item_count: 0,
      stale_item_count: 0,
      items: [
        {
          type: 'ready',
          input_text: 'milk',
          canonical_product_id: 'cp_milk',
          canonical_name: 'Milk',
          quantity: 1,
          unit_price: 5,
          line_total: 5,
          currency: 'EUR',
          price_status: 'priced',
          warnings: [],
        },
        {
          type: 'ready',
          input_text: 'eggs',
          canonical_product_id: 'cp_eggs',
          canonical_name: 'Eggs',
          quantity: 1,
          unit_price: 7,
          line_total: 7,
          currency: 'EUR',
          price_status: 'priced',
          warnings: [],
        },
      ],
      warnings: [],
    },
    alternatives: [],
    summary: {},
    warnings: [],
    ...overrides,
  };
}

function multiStoreResult() {
  return {
    optimization_type: 'multi_store',
    currency: 'EUR',
    recommended_strategy: 'multi_store',
    best_single_store_option: singleStoreResult().best_option,
    best_multi_store_option: {
      store_count: 2,
      actual_total: 8,
      score_total: 8,
      currency: 'EUR',
      coverage_ratio: 1,
      priced_item_count: 2,
      missing_item_count: 0,
      stale_item_count: 0,
      savings_vs_best_single_store: 4,
      stores: [
        {
          chain_id: 'lidl',
          chain_name: 'Lidl',
          store_id: null,
          store_name: null,
          actual_total: 3,
          items: [{ input_text: 'milk', line_total: 3, price_status: 'priced' }],
        },
        {
          chain_id: 'kaufland',
          chain_name: 'Kaufland',
          store_id: null,
          store_name: null,
          actual_total: 5,
          items: [{ input_text: 'eggs', line_total: 5, price_status: 'priced' }],
        },
      ],
      items: [
        { input_text: 'milk', price_status: 'priced', line_total: 3, warnings: [] },
        { input_text: 'eggs', price_status: 'priced', line_total: 5, warnings: [] },
      ],
      warnings: [],
    },
    alternatives: [],
    summary: {},
    warnings: [],
  };
}

function basketPlan(overrides = {}) {
  return {
    optimization_ready: true,
    ready_items: [],
    ambiguous_items: [],
    unresolved_items: [],
    ...overrides,
  };
}

function priceLookup() {
  return {
    currency: 'EUR',
    items: [],
    summary: {},
  };
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
      '"1000","Lidl","Milk 1L","1001","6","3.00","0"',
      '"1000","Lidl","Eggs 10 Count","1002","8","8.00","0"',
    ]),
    snapshotDate: '2026-04-24',
    sourceFileName: 'LIDL.csv',
    ingestedAt: '2026-04-24T09:00:00.000Z',
    enableLlmEnrichment: false,
  });
  await importDailySnapshotCsvStream({
    store,
    csvStream: createCsv([
      '"1000","Kaufland","Milk 1L","2001","6","8.00","0"',
      '"1000","Kaufland","Eggs 10 Count","2002","8","3.00","0"',
    ]),
    snapshotDate: '2026-04-24',
    sourceFileName: 'KAUFLAND.csv',
    ingestedAt: '2026-04-24T10:00:00.000Z',
    enableLlmEnrichment: false,
  });

  return store;
}

test('single-store explanation headline names the recommended chain', () => {
  const explanation = buildBasketOptimizationExplanation({
    basketPlan: basketPlan(),
    priceLookup: priceLookup(),
    optimizerResult: singleStoreResult(),
  });

  assert.equal(explanation.headline, 'Best option: Lidl');
  assert.equal(explanation.store_summaries.length, 1);
});

test('multi-store explanation headline names both chains', () => {
  const explanation = buildBasketOptimizationExplanation({
    basketPlan: basketPlan(),
    priceLookup: priceLookup(),
    optimizerResult: multiStoreResult(),
  });

  assert.equal(explanation.headline, 'Best option: Lidl + Kaufland');
  assert.equal(explanation.store_summaries.length, 2);
});

test('savings text appears when multi-store saves money', () => {
  const explanation = buildBasketOptimizationExplanation({
    basketPlan: basketPlan(),
    priceLookup: priceLookup(),
    optimizerResult: multiStoreResult(),
  });

  assert.equal(explanation.savings.amount, 4);
  assert.equal(explanation.summary_text.includes('saving €4.00'), true);
});

test('missing item note is generated from optimizer warnings', () => {
  const result = singleStoreResult();
  result.best_option.missing_item_count = 1;
  result.best_option.coverage_ratio = 0.5;
  result.best_option.items.push({
    type: 'ready',
    input_text: 'bread',
    price_status: 'missing',
    warnings: [{ code: 'missing_price', input_text: 'bread' }],
  });
  result.best_option.warnings = [{ code: 'missing_price', input_text: 'bread' }];
  const explanation = buildBasketOptimizationExplanation({
    basketPlan: basketPlan(),
    priceLookup: priceLookup(),
    optimizerResult: result,
  });

  assert.equal(explanation.item_notes.some((note) => note.type === 'missing_price'), true);
});

test('ambiguous auto-selection note is generated', () => {
  const result = singleStoreResult();
  result.best_option.items[0].warnings = [{
    code: 'ambiguous_candidate_auto_selected',
    input_text: 'milk',
  }];
  const explanation = buildBasketOptimizationExplanation({
    basketPlan: basketPlan(),
    priceLookup: priceLookup(),
    optimizerResult: result,
  });

  assert.equal(explanation.item_notes.some((note) => note.type === 'ambiguous_auto_selected'), true);
});

test('limitations include travel not included for multi-store explanations', () => {
  const explanation = buildBasketOptimizationExplanation({
    basketPlan: basketPlan(),
    priceLookup: priceLookup(),
    optimizerResult: multiStoreResult(),
  });

  assert.equal(explanation.limitations.some((limitation) => limitation.type === 'travel_not_included'), true);
});

test('include_explanation true adds explanation to endpoint result', async () => {
  const response = await handleOptimizeBasketSingleStoreRequest({
    store: await createEndpointStore(),
    body: {
      items: ['milk', 'eggs'],
      optimizer_options: {
        strategy: 'multi_store',
        include_explanation: true,
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.explanation.headline.startsWith('Best option:'), true);
});

test('include_explanation omitted preserves old endpoint response shape', async () => {
  const response = await handleOptimizeBasketSingleStoreRequest({
    store: await createEndpointStore(),
    body: {
      items: ['milk'],
    },
  });

  assert.equal(response.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(response.body, 'explanation'), false);
});

test('explanation currency remains EUR', () => {
  const explanation = buildBasketOptimizationExplanation({
    basketPlan: basketPlan(),
    priceLookup: priceLookup(),
    optimizerResult: multiStoreResult(),
  });

  assert.equal(explanation.currency, 'EUR');
});

test('explanation builder does not mutate optimizer result', () => {
  const result = multiStoreResult();
  const before = JSON.parse(JSON.stringify(result));

  buildBasketOptimizationExplanation({
    basketPlan: basketPlan(),
    priceLookup: priceLookup(),
    optimizerResult: result,
  });

  assert.deepEqual(result, before);
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

  console.log(`\nPhase 16.3 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
