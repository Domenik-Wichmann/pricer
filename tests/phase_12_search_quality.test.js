const assert = require('node:assert/strict');

const {
  buildCanonicalQueryObject,
  buildCanonicalTermRecord,
  buildDemandLogRecord,
  buildSynonymRecord,
  InMemoryDataBackboneStore,
  matchQueryAgainstState,
  rebuildDemandAggregates,
  runSearchQualityFeedbackLoop,
  seedSearchQualityDefaults,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createSearchQualityState() {
  const milkTerm = buildCanonicalTermRecord({
    canonicalValue: 'мляко',
    categoryHint: 'milk',
    productTypeHint: 'fresh_milk',
    createdAt: '2026-04-22T12:00:00.000Z',
  });
  const breadTerm = buildCanonicalTermRecord({
    canonicalValue: 'хляб',
    categoryHint: 'bread',
    productTypeHint: 'bread',
    createdAt: '2026-04-22T12:00:00.000Z',
  });

  return {
    raw_price_snapshots: [
      {
        snapshot_id: 'snap-1',
        source_product_id: 'milk-v',
        snapshot_date: '2026-04-22',
        locality_code: '65677',
        store_name_raw: 'Store 1',
        product_name_raw: 'Прясно мляко Верея 3% 1л',
        product_code: '1001228',
        category_code: '6',
        retail_price: 1.66,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
      {
        snapshot_id: 'snap-2',
        source_product_id: 'bread-y',
        snapshot_date: '2026-04-22',
        locality_code: '65677',
        store_name_raw: 'Store 2',
        product_name_raw: 'Бял хляб Яневи 650гр.',
        product_code: '17',
        category_code: '1',
        retail_price: 0.92,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
    ],
    source_products: [
      {
        source_product_id: 'milk-v',
        locality_code: '65677',
        store_name_raw: 'Store 1',
        product_code: '1001228',
        category_code: '6',
        latest_product_name_raw: 'Прясно мляко Верея 3% 1л',
        last_seen_date: '2026-04-22',
        is_active: true,
      },
      {
        source_product_id: 'bread-y',
        locality_code: '65677',
        store_name_raw: 'Store 2',
        product_code: '17',
        category_code: '1',
        latest_product_name_raw: 'Бял хляб Яневи 650гр.',
        last_seen_date: '2026-04-22',
        is_active: true,
      },
    ],
    source_product_enrichment: [
      {
        source_product_id: 'milk-v',
        normalized_name: 'прясно мляко верея 3% 1л',
        tokens: ['прясно', 'мляко', 'верея', '3%', '1л'],
        alias_candidates: [
          'прясно мляко верея 3% 1л',
          'прясно мляко',
        ],
        canonical_search_category: 'milk',
        size_value: 1,
        size_unit: 'l',
        fat_percent: 3,
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
      {
        source_product_id: 'bread-y',
        normalized_name: 'бял хляб яневи 650гр',
        tokens: ['бял', 'хляб', 'яневи', '650гр'],
        alias_candidates: [
          'бял хляб яневи 650гр',
          'бял хляб',
        ],
        canonical_search_category: 'bread',
        size_value: 650,
        size_unit: 'g',
        fat_percent: null,
        parse_confidence: 0.95,
        canonical_en: {
          product_type: 'bread',
          product_family: 'bread',
          brand: 'Yanevi',
          size_value: 650,
          size_unit: 'g',
          fat_percent: null,
        },
        display_en: 'Bread Yanevi 650g',
      },
    ],
    canonical_terms: [milkTerm, breadTerm],
    synonym_map: [
      buildSynonymRecord({
        synonymText: 'самун',
        canonicalTerm: breadTerm,
        createdAt: '2026-04-22T12:00:00.000Z',
      }),
    ],
    demand_logs: [],
    demand_aggregates: [],
  };
}

test('canonical query object applies fuzzy correction conservatively for simple typos', () => {
  const state = createSearchQualityState();
  const canonical = buildCanonicalQueryObject({
    rawInput: 'мляко и хлб',
    canonicalTerms: state.canonical_terms,
    synonymMap: state.synonym_map,
  });

  assert.equal(canonical.corrected_tokens_bg.includes('мляко'), true);
  assert.equal(canonical.corrected_tokens_bg.includes('хляб'), true);
  assert.equal(canonical.applied_rewrites.some((entry) => entry.rule === 'fuzzy_correction'), true);
});

test('canonical query object expands configured synonyms into canonical tokens', () => {
  const state = createSearchQualityState();
  const canonical = buildCanonicalQueryObject({
    rawInput: 'самун',
    canonicalTerms: state.canonical_terms,
    synonymMap: state.synonym_map,
  });

  assert.equal(canonical.expanded_tokens_bg.includes('хляб'), true);
  assert.equal(canonical.canonical_terms.includes('хляб'), true);
});

test('matcher improves accuracy when canonical synonym expansion is available', () => {
  const result = matchQueryAgainstState({
    query: 'самун 650гр',
    state: createSearchQualityState(),
  });

  assert.equal(result.items[0].ambiguity.status, 'matched');
  assert.equal(result.items[0].matched_products[0].source_product_id, 'bread-y');
});

test('feedback loop learns deterministic typo synonyms from demand aggregates', async () => {
  const state = createSearchQualityState();
  state.demand_logs = [
    buildDemandLogRecord({
      rawQuery: 'млеко',
      demandSource: 'automatic_unmatched',
      querySource: 'query_engine_zero_results',
      createdAt: '2026-04-22T12:00:00.000Z',
    }),
    buildDemandLogRecord({
      rawQuery: 'млеко',
      demandSource: 'automatic_unmatched',
      querySource: 'query_engine_zero_results',
      createdAt: '2026-04-22T12:05:00.000Z',
    }),
  ];

  const store = new InMemoryDataBackboneStore(state);
  await rebuildDemandAggregates({ store });
  const learned = await runSearchQualityFeedbackLoop({ store });
  const nextState = await store.load();

  assert.equal(learned.learned_synonyms, 1);
  assert.equal(nextState.synonym_map.some((row) => row.synonym_text === 'млеко' && row.canonical_value === 'мляко'), true);
});

test('default seeding is idempotent and preserves existing search quality records', async () => {
  const store = new InMemoryDataBackboneStore(createSearchQualityState());
  const first = await seedSearchQualityDefaults({ store, createdAt: '2026-04-22T12:00:00.000Z' });
  const second = await seedSearchQualityDefaults({ store, createdAt: '2026-04-22T12:00:00.000Z' });

  assert.equal(first.canonical_terms.length, second.canonical_terms.length);
  assert.equal(first.synonym_map.length, second.synonym_map.length);
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

  console.log(`\nPhase 12 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
