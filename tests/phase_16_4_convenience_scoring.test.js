const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  applyBasketConvenienceScoring,
  handleOptimizeBasketSingleStoreRequest,
  importDailySnapshotCsvStream,
} = require('../app/functions/src');
const { SOURCE_HEADERS } = require('../app/functions/src/phase1/constants');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function option({
  chainId,
  chainName = chainId,
  actualTotal,
  stores = null,
}) {
  if (stores) {
    return {
      store_count: stores.length,
      actual_total: actualTotal,
      score_total: actualTotal,
      currency: 'EUR',
      coverage_ratio: 1,
      priced_item_count: 2,
      missing_item_count: 0,
      stale_item_count: 0,
      stores,
      warnings: [],
    };
  }

  return {
    chain_id: chainId,
    chain_name: chainName,
    store_id: null,
    store_name: null,
    actual_total: actualTotal,
    score_total: actualTotal,
    currency: 'EUR',
    coverage_ratio: 1,
    priced_item_count: 2,
    missing_item_count: 0,
    stale_item_count: 0,
    items: [],
    warnings: [],
  };
}

function multiOptimizerResult({
  singleTotal = 10,
  multiTotal = 9,
  recommendedStrategy = 'multi_store',
} = {}) {
  return {
    optimization_type: 'multi_store',
    currency: 'EUR',
    recommended_strategy: recommendedStrategy,
    best_single_store_option: option({
      chainId: 'lidl',
      chainName: 'Lidl',
      actualTotal: singleTotal,
    }),
    best_multi_store_option: option({
      actualTotal: multiTotal,
      stores: [
        {
          chain_id: 'lidl',
          chain_name: 'Lidl',
          store_id: null,
          store_name: null,
          actual_total: 4,
          items: [],
        },
        {
          chain_id: 'kaufland',
          chain_name: 'Kaufland',
          store_id: null,
          store_name: null,
          actual_total: multiTotal - 4,
          items: [],
        },
      ],
    }),
    alternatives: [],
    summary: {},
    warnings: [],
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

test('actual_total remains unchanged after convenience scoring', () => {
  const result = multiOptimizerResult();
  const scored = applyBasketConvenienceScoring({
    optimizerResult: result,
    convenienceOptions: {
      extra_store_penalty: 2,
    },
  });

  assert.equal(scored.optimizer_result.best_multi_store_option.actual_total, 9);
  assert.equal(result.best_multi_store_option.actual_total, 9);
});

test('effective_total includes convenience penalties', () => {
  const scored = applyBasketConvenienceScoring({
    optimizerResult: multiOptimizerResult(),
    convenienceOptions: {
      extra_store_penalty: 2,
    },
  });
  const multiScore = scored.convenience.option_scores.find((entry) => entry.strategy === 'multi_store');

  assert.equal(multiScore.actual_total, 9);
  assert.equal(multiScore.convenience_penalty, 2);
  assert.equal(multiScore.estimated_travel_cost, 0);
  assert.equal(multiScore.effective_total, 11);
});

test('recommendation can flip from multi-store to single-store', () => {
  const scored = applyBasketConvenienceScoring({
    optimizerResult: multiOptimizerResult({ singleTotal: 10, multiTotal: 9 }),
    convenienceOptions: {
      extra_store_penalty: 2,
    },
  });

  assert.equal(scored.convenience.recommended_strategy_before_convenience, 'multi_store');
  assert.equal(scored.convenience.recommended_strategy_after_convenience, 'single_store');
});

test('multi-store still wins when savings exceed convenience penalty', () => {
  const scored = applyBasketConvenienceScoring({
    optimizerResult: multiOptimizerResult({ singleTotal: 15, multiTotal: 9 }),
    convenienceOptions: {
      extra_store_penalty: 2,
    },
  });

  assert.equal(scored.convenience.recommended_strategy_after_convenience, 'multi_store');
});

test('preferred chains avoid non-preferred penalty for preferred stores', () => {
  const scored = applyBasketConvenienceScoring({
    optimizerResult: multiOptimizerResult(),
    userContext: {
      preferred_chain_ids: ['lidl'],
    },
    convenienceOptions: {
      extra_store_penalty: 0,
      non_preferred_chain_penalty: 1,
    },
  });
  const singleScore = scored.convenience.option_scores.find((entry) => entry.strategy === 'single_store');
  const multiScore = scored.convenience.option_scores.find((entry) => entry.strategy === 'multi_store');

  assert.equal(singleScore.penalty_breakdown.some((penalty) => penalty.type === 'non_preferred_chain'), false);
  assert.equal(multiScore.penalty_breakdown.some((penalty) => penalty.type === 'non_preferred_chain'), true);
});

test('avoided chain receives large penalty but remains visible', () => {
  const scored = applyBasketConvenienceScoring({
    optimizerResult: multiOptimizerResult(),
    userContext: {
      avoid_chain_ids: ['kaufland'],
    },
    convenienceOptions: {
      avoided_chain_penalty: 500,
    },
  });
  const multiScore = scored.convenience.option_scores.find((entry) => entry.strategy === 'multi_store');

  assert.equal(multiScore.penalty_breakdown.some((penalty) => penalty.type === 'avoided_chain'), true);
  assert.equal(scored.convenience.option_scores.some((entry) => entry.strategy === 'multi_store'), true);
});

test('max_store_count affects recommendation', () => {
  const scored = applyBasketConvenienceScoring({
    optimizerResult: multiOptimizerResult({ singleTotal: 10, multiTotal: 9 }),
    userContext: {
      max_store_count: 1,
    },
    convenienceOptions: {
      extra_store_penalty: 2,
    },
  });
  const multiScore = scored.convenience.option_scores.find((entry) => entry.strategy === 'multi_store');

  assert.equal(multiScore.penalty_breakdown.some((penalty) => penalty.type === 'user_max_store_count_exceeded'), true);
  assert.equal(scored.convenience.recommended_strategy_after_convenience, 'single_store');
});

test('include_convenience_scoring omitted preserves previous response shape', async () => {
  const response = await handleOptimizeBasketSingleStoreRequest({
    store: await createEndpointStore(),
    body: {
      items: ['milk'],
      optimizer_options: {
        include_explanation: true,
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(response.body, 'convenience'), false);
  assert.equal(response.body.explanation.convenience, null);
});

test('explanation includes convenience-adjusted total when enabled', async () => {
  const response = await handleOptimizeBasketSingleStoreRequest({
    store: await createEndpointStore(),
    body: {
      items: ['milk', 'eggs'],
      optimizer_options: {
        strategy: 'multi_store',
        include_explanation: true,
        include_convenience_scoring: true,
      },
      user_context: {
        single_store_preferred: true,
      },
      convenience_options: {
        extra_store_penalty: 2,
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.convenience.applied, true);
  assert.equal(response.body.explanation.summary_text.includes('Convenience-adjusted total'), true);
  assert.equal(response.body.explanation.limitations.some((limitation) => limitation.type === 'distance_not_modeled'), true);
});

test('convenience currency remains EUR', () => {
  const scored = applyBasketConvenienceScoring({
    optimizerResult: multiOptimizerResult(),
  });

  assert.equal(scored.convenience.currency, 'EUR');
  assert.equal(scored.convenience.best_effective_option.currency, 'EUR');
});

test('convenience scoring does not mutate optimizer input', () => {
  const result = multiOptimizerResult();
  const before = JSON.parse(JSON.stringify(result));

  applyBasketConvenienceScoring({
    optimizerResult: result,
    userContext: {
      avoid_chain_ids: ['kaufland'],
    },
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

  console.log(`\nPhase 16.4 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
