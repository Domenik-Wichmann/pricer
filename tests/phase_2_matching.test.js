const assert = require('node:assert/strict');

const {
  handleQueryServiceRequest,
  InMemoryDataBackboneStore,
  matchQueryAgainstState,
  normalizeInput,
  parseQueryItem,
  queryPriceComparison,
  scoreCandidate,
  splitQueryItems,
  tokenizeInput,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createMatchingState() {
  return {
    raw_price_snapshots: [
      {
        snapshot_id: 'snap-1',
        source_product_id: 'milk-v',
        snapshot_date: '2026-04-22',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 1',
        product_name_raw: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0412\u0435\u0440\u0435\u044f 3% 1\u043b',
        product_code: '1001228',
        category_code: '6',
        retail_price: 1.66,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
      {
        snapshot_id: 'snap-2',
        source_product_id: 'milk-o',
        snapshot_date: '2026-04-22',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 2',
        product_name_raw: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u041e\u043b\u0438\u043c\u043f\u0443\u0441 3,7% 1\u043b',
        product_code: '1001602',
        category_code: '6',
        retail_price: 1.72,
        promo_price: 1.59,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
      {
        snapshot_id: 'snap-3',
        source_product_id: 'bread-y',
        snapshot_date: '2026-04-22',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 1',
        product_name_raw: '\u0411\u044f\u043b \u0445\u043b\u044f\u0431 \u042f\u043d\u0435\u0432\u0438 650\u0433\u0440.',
        product_code: '17',
        category_code: '1',
        retail_price: 0.92,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
      {
        snapshot_id: 'snap-4',
        source_product_id: 'bread-h',
        snapshot_date: '2026-04-22',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 2',
        product_name_raw: '\u0411\u044f\u043b \u0445\u043b\u044f\u0431 \u0425\u0430\u0441\u043a\u043e\u0432\u043e 650\u0433\u0440.',
        product_code: '3',
        category_code: '1',
        retail_price: 0.89,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
      {
        snapshot_id: 'snap-5',
        source_product_id: 'pastry-b',
        snapshot_date: '2026-04-22',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 3',
        product_name_raw: '\u0422\u043e\u0447\u0435\u043d\u0438 \u043a\u043e\u0440\u0438 \u0411\u0435\u043b\u0430 400\u0433\u0440.',
        product_code: '35',
        category_code: '5',
        retail_price: 1.79,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
    ],
    source_products: [
      {
        source_product_id: 'milk-v',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 1',
        product_code: '1001228',
        category_code: '6',
        latest_product_name_raw: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0412\u0435\u0440\u0435\u044f 3% 1\u043b',
        last_seen_date: '2026-04-22',
        is_active: true,
      },
      {
        source_product_id: 'milk-o',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 2',
        product_code: '1001602',
        category_code: '6',
        latest_product_name_raw: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u041e\u043b\u0438\u043c\u043f\u0443\u0441 3,7% 1\u043b',
        last_seen_date: '2026-04-22',
        is_active: true,
      },
      {
        source_product_id: 'bread-y',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 1',
        product_code: '17',
        category_code: '1',
        latest_product_name_raw: '\u0411\u044f\u043b \u0445\u043b\u044f\u0431 \u042f\u043d\u0435\u0432\u0438 650\u0433\u0440.',
        last_seen_date: '2026-04-22',
        is_active: true,
      },
      {
        source_product_id: 'bread-h',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 2',
        product_code: '3',
        category_code: '1',
        latest_product_name_raw: '\u0411\u044f\u043b \u0445\u043b\u044f\u0431 \u0425\u0430\u0441\u043a\u043e\u0432\u043e 650\u0433\u0440.',
        last_seen_date: '2026-04-22',
        is_active: true,
      },
      {
        source_product_id: 'pastry-b',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 3',
        product_code: '35',
        category_code: '5',
        latest_product_name_raw: '\u0422\u043e\u0447\u0435\u043d\u0438 \u043a\u043e\u0440\u0438 \u0411\u0435\u043b\u0430 400\u0433\u0440.',
        last_seen_date: '2026-04-22',
        is_active: true,
      },
    ],
    source_product_enrichment: [
      {
        source_product_id: 'milk-v',
        normalized_name: '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0432\u0435\u0440\u0435\u044f 3% 1\u043b',
        tokens: ['\u043f\u0440\u044f\u0441\u043d\u043e', '\u043c\u043b\u044f\u043a\u043e', '\u0432\u0435\u0440\u0435\u044f', '3%', '1\u043b'],
        alias_candidates: [
          '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0432\u0435\u0440\u0435\u044f 3% 1\u043b',
          '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 3% 1\u043b',
          '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e',
        ],
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
        normalized_name: '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u043e\u043b\u0438\u043c\u043f\u0443\u0441 3 7% 1\u043b',
        tokens: ['\u043f\u0440\u044f\u0441\u043d\u043e', '\u043c\u043b\u044f\u043a\u043e', '\u043e\u043b\u0438\u043c\u043f\u0443\u0441', '3', '7%', '1\u043b'],
        alias_candidates: [
          '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u043e\u043b\u0438\u043c\u043f\u0443\u0441 3 7% 1\u043b',
          '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 1\u043b',
          '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e',
        ],
        canonical_search_category: 'milk',
        size_value: 1,
        size_unit: 'l',
        fat_percent: 3.7,
        parse_confidence: 1,
        canonical_en: {
          product_type: 'fresh_milk',
          product_family: 'milk',
          brand: '\u041e\u043b\u0438\u043c\u043f\u0443\u0441',
          size_value: 1,
          size_unit: 'l',
          fat_percent: 3.7,
        },
        display_en: 'Fresh milk Olympus 3.7% 1L',
      },
      {
        source_product_id: 'bread-y',
        normalized_name: '\u0431\u044f\u043b \u0445\u043b\u044f\u0431 \u044f\u043d\u0435\u0432\u0438 650\u0433\u0440',
        tokens: ['\u0431\u044f\u043b', '\u0445\u043b\u044f\u0431', '\u044f\u043d\u0435\u0432\u0438', '650\u0433\u0440'],
        alias_candidates: [
          '\u0431\u044f\u043b \u0445\u043b\u044f\u0431 \u044f\u043d\u0435\u0432\u0438 650\u0433\u0440',
          '\u0431\u044f\u043b \u0445\u043b\u044f\u0431 650\u0433\u0440',
        ],
        canonical_search_category: 'bread',
        size_value: 650,
        size_unit: 'g',
        fat_percent: null,
        parse_confidence: 0.9,
        canonical_en: {
          product_type: 'bread',
          product_family: 'bread',
          brand: '\u042f\u043d\u0435\u0432\u0438',
          size_value: 650,
          size_unit: 'g',
          fat_percent: null,
        },
        display_en: 'Bread Yanevi 650g',
      },
      {
        source_product_id: 'bread-h',
        normalized_name: '\u0431\u044f\u043b \u0445\u043b\u044f\u0431 \u0445\u0430\u0441\u043a\u043e\u0432\u043e 650\u0433\u0440',
        tokens: ['\u0431\u044f\u043b', '\u0445\u043b\u044f\u0431', '\u0445\u0430\u0441\u043a\u043e\u0432\u043e', '650\u0433\u0440'],
        alias_candidates: [
          '\u0431\u044f\u043b \u0445\u043b\u044f\u0431 \u0445\u0430\u0441\u043a\u043e\u0432\u043e 650\u0433\u0440',
          '\u0431\u044f\u043b \u0445\u043b\u044f\u0431 650\u0433\u0440',
        ],
        canonical_search_category: 'bread',
        size_value: 650,
        size_unit: 'g',
        fat_percent: null,
        parse_confidence: 0.9,
        canonical_en: {
          product_type: 'bread',
          product_family: 'bread',
          brand: '\u0425\u0430\u0441\u043a\u043e\u0432\u043e',
          size_value: 650,
          size_unit: 'g',
          fat_percent: null,
        },
        display_en: 'Bread Haskovo 650g',
      },
      {
        source_product_id: 'pastry-b',
        normalized_name: '\u0442\u043e\u0447\u0435\u043d\u0438 \u043a\u043e\u0440\u0438 \u0431\u0435\u043b\u0430 400\u0433\u0440',
        tokens: ['\u0442\u043e\u0447\u0435\u043d\u0438', '\u043a\u043e\u0440\u0438', '\u0431\u0435\u043b\u0430', '400\u0433\u0440'],
        alias_candidates: [
          '\u0442\u043e\u0447\u0435\u043d\u0438 \u043a\u043e\u0440\u0438 \u0431\u0435\u043b\u0430 400\u0433\u0440',
          '\u0442\u043e\u0447\u0435\u043d\u0438 \u043a\u043e\u0440\u0438 400\u0433\u0440',
        ],
        canonical_search_category: 'pastry',
        size_value: 400,
        size_unit: 'g',
        fat_percent: null,
        parse_confidence: 0.85,
        canonical_en: {
          product_type: 'pastry_sheets',
          product_family: 'pastry',
          brand: '\u0411\u0435\u043b\u0430',
          size_value: 400,
          size_unit: 'g',
          fat_percent: null,
        },
        display_en: 'Pastry sheets Bella 400g',
      },
    ],
  };
}

test('input normalization and tokenization preserve Bulgarian matching terms', () => {
  assert.equal(normalizeInput('  Прясно   мляко, Верея! '), '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0432\u0435\u0440\u0435\u044f');
  assert.deepEqual(splitQueryItems('\u043c\u043b\u044f\u043a\u043e, \u0445\u043b\u044f\u0431\n\u043a\u043e\u0440\u0438'), ['\u043c\u043b\u044f\u043a\u043e', '\u0445\u043b\u044f\u0431', '\u043a\u043e\u0440\u0438']);
  assert.deepEqual(tokenizeInput('\u0418\u0441\u043a\u0430\u043c \u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0412\u0435\u0440\u0435\u044f 3% 1\u043b'), [
    '\u043f\u0440\u044f\u0441\u043d\u043e',
    '\u043c\u043b\u044f\u043a\u043e',
    '\u0432\u0435\u0440\u0435\u044f',
    '3%',
    '1\u043b',
  ]);
});

test('matching correctness selects the expected product for a specific Bulgarian query', () => {
  const result = matchQueryAgainstState({
    query: '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0432\u0435\u0440\u0435\u044f 3% 1\u043b',
    state: createMatchingState(),
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].ambiguity.status, 'matched');
  assert.equal(result.items[0].matched_products[0].source_product_id, 'milk-v');
  assert.equal(result.items[0].cheapest_store_result.source_product_id, 'milk-v');
});

test('scoring behavior rewards exact and attribute matches over looser candidates', () => {
  const state = createMatchingState();
  const parsedItem = parseQueryItem('\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0432\u0435\u0440\u0435\u044f 3% 1\u043b');
  const exactCandidate = {
    source_product: state.source_products.find((row) => row.source_product_id === 'milk-v'),
    enrichment: state.source_product_enrichment.find((row) => row.source_product_id === 'milk-v'),
  };
  const looseCandidate = {
    source_product: state.source_products.find((row) => row.source_product_id === 'milk-o'),
    enrichment: state.source_product_enrichment.find((row) => row.source_product_id === 'milk-o'),
  };

  const exactScore = scoreCandidate(parsedItem, exactCandidate);
  const looseScore = scoreCandidate(parsedItem, looseCandidate);

  assert.equal(exactScore.score > looseScore.score, true);
  assert.equal(exactScore.reasons.includes('exact_normalized_name'), true);
  assert.equal(exactScore.reasons.includes('brand_match'), true);
});

test('price aggregation returns cheapest current store result for matched products', async () => {
  const store = new InMemoryDataBackboneStore(createMatchingState());
  const result = await queryPriceComparison({
    store,
    query: '\u0431\u044f\u043b \u0445\u043b\u044f\u0431 650\u0433\u0440',
  });

  assert.equal(result.items[0].ambiguity.status, 'ambiguous');
  assert.equal(result.items[0].price_comparison.length >= 2, true);
  assert.equal(result.items[0].cheapest_store_result.store_name_raw, '\u0421\u0442\u043e\u0440 2');
  assert.equal(result.items[0].cheapest_store_result.effective_price, 0.89);
});

test('ambiguity detection flags close deterministic candidates without invoking AI', () => {
  const result = matchQueryAgainstState({
    query: '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 1\u043b',
    state: createMatchingState(),
  });

  assert.equal(result.items[0].ambiguity.status, 'ambiguous');
  assert.equal(result.items[0].ambiguity.should_escalate, true);
  assert.equal(['close_scores', 'low_confidence'].includes(result.items[0].ambiguity.reason), true);
});

test('query service endpoint returns matched products and cheapest store results', async () => {
  const store = new InMemoryDataBackboneStore(createMatchingState());
  const response = await handleQueryServiceRequest({
    store,
    body: {
      query: '\u0442\u043e\u0447\u0435\u043d\u0438 \u043a\u043e\u0440\u0438',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items[0].matched_products[0].source_product_id, 'pastry-b');
  assert.equal(response.body.items[0].cheapest_store_result.store_name_raw, '\u0421\u0442\u043e\u0440 3');
});

test('query service endpoint validates missing query input', async () => {
  const response = await handleQueryServiceRequest({
    store: new InMemoryDataBackboneStore(createMatchingState()),
    body: {},
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'query is required');
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

  console.log(`\nPhase 2 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
