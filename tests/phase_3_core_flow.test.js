const assert = require('node:assert/strict');

const {
  collectFeedback,
  generateEmbeddingRecord,
  InMemoryDataBackboneStore,
  matchQueryAgainstState,
  runEmbeddingGenerationJob,
  runSemanticEnrichmentJob,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createPhase3State() {
  return {
    raw_price_snapshots: [
      {
        snapshot_id: 'snap-a',
        source_product_id: 'milk-a',
        snapshot_date: '2026-04-22',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 A',
        product_name_raw: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0412\u0435\u0440\u0435\u044f 3% 1\u043b',
        product_code: '1001228',
        category_code: '6',
        retail_price: 1.66,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
      {
        snapshot_id: 'snap-b',
        source_product_id: 'milk-b',
        snapshot_date: '2026-04-22',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 B',
        product_name_raw: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u041e\u043b\u0438\u043c\u043f\u0443\u0441 3% 1\u043b',
        product_code: '1001229',
        category_code: '6',
        retail_price: 1.64,
        promo_price: 0,
        ingested_at: '2026-04-22T10:00:00.000Z',
      },
    ],
    source_products: [
      {
        source_product_id: 'milk-a',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 A',
        product_code: '1001228',
        category_code: '6',
        latest_product_name_raw: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0412\u0435\u0440\u0435\u044f 3% 1\u043b',
        last_seen_date: '2026-04-22',
        is_active: true,
      },
      {
        source_product_id: 'milk-b',
        locality_code: '65677',
        store_name_raw: '\u0421\u0442\u043e\u0440 B',
        product_code: '1001229',
        category_code: '6',
        latest_product_name_raw: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u041e\u043b\u0438\u043c\u043f\u0443\u0441 3% 1\u043b',
        last_seen_date: '2026-04-22',
        is_active: true,
      },
    ],
    source_product_enrichment: [
      {
        source_product_id: 'milk-a',
        normalized_name: '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 3% 1\u043b',
        tokens: ['\u043f\u0440\u044f\u0441\u043d\u043e', '\u043c\u043b\u044f\u043a\u043e', '3%', '1\u043b'],
        alias_candidates: ['\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 1\u043b'],
        canonical_search_category: 'milk',
        size_value: 1,
        size_unit: 'l',
        fat_percent: 3,
        parse_confidence: 0.95,
        canonical_en: {
          product_type: 'fresh_milk',
          product_family: 'milk',
          brand: null,
          size_value: 1,
          size_unit: 'l',
          fat_percent: 3,
        },
        display_en: 'Fresh milk 3% 1L',
      },
      {
        source_product_id: 'milk-b',
        normalized_name: '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 3% 1\u043b',
        tokens: ['\u043f\u0440\u044f\u0441\u043d\u043e', '\u043c\u043b\u044f\u043a\u043e', '3%', '1\u043b'],
        alias_candidates: ['\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 1\u043b'],
        canonical_search_category: 'milk',
        size_value: 1,
        size_unit: 'l',
        fat_percent: 3,
        parse_confidence: 0.95,
        canonical_en: {
          product_type: 'fresh_milk',
          product_family: 'milk',
          brand: null,
          size_value: 1,
          size_unit: 'l',
          fat_percent: 3,
        },
        display_en: 'Fresh milk 3% 1L',
      },
    ],
    semantic_profiles: [
      {
        source_product_id: 'milk-a',
        semantic_version: 'phase3-semantic-v1',
        semantic_summary_bg: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0412\u0435\u0440\u0435\u044f 3% 1\u043b',
        semantic_summary_en: 'Fresh milk Vereya 3% 1L',
        semantic_terms_bg: '\u043f\u0440\u044f\u0441\u043d\u043e|\u043c\u043b\u044f\u043a\u043e|\u0432\u0435\u0440\u0435\u044f|3%|1\u043b',
        semantic_terms_en: 'fresh|milk|vereya|3%|1l',
        semantic_category: 'milk',
        semantic_brand: '\u0412\u0435\u0440\u0435\u044f',
        semantic_size_value: 1,
        semantic_size_unit: 'l',
        semantic_fat_percent: 3,
        semantic_text_bg: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0412\u0435\u0440\u0435\u044f 3% 1\u043b',
        semantic_text_en: 'Fresh milk Vereya 3% 1L',
        generated_at: '2026-04-22T11:00:00.000Z',
      },
      {
        source_product_id: 'milk-b',
        semantic_version: 'phase3-semantic-v1',
        semantic_summary_bg: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u041e\u043b\u0438\u043c\u043f\u0443\u0441 3% 1\u043b',
        semantic_summary_en: 'Fresh milk Olympus 3% 1L',
        semantic_terms_bg: '\u043f\u0440\u044f\u0441\u043d\u043e|\u043c\u043b\u044f\u043a\u043e|\u043e\u043b\u0438\u043c\u043f\u0443\u0441|3%|1\u043b',
        semantic_terms_en: 'fresh|milk|olympus|3%|1l',
        semantic_category: 'milk',
        semantic_brand: '\u041e\u043b\u0438\u043c\u043f\u0443\u0441',
        semantic_size_value: 1,
        semantic_size_unit: 'l',
        semantic_fat_percent: 3,
        semantic_text_bg: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u041e\u043b\u0438\u043c\u043f\u0443\u0441 3% 1\u043b',
        semantic_text_en: 'Fresh milk Olympus 3% 1L',
        generated_at: '2026-04-22T11:00:00.000Z',
      },
    ],
    embedding_records: [],
    feedback_events: [],
  };
}

test('ai ambiguity resolution reranks close deterministic candidates only after ambiguity', () => {
  const result = matchQueryAgainstState({
    query: '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0432\u0435\u0440\u0435\u044f 3% 1\u043b',
    state: createPhase3State(),
    enableAiFallback: true,
  });

  assert.equal(result.items[0].ai_decision.used_ai, true);
  assert.equal(result.items[0].ambiguity.status, 'matched');
  assert.equal(result.items[0].ambiguity.reason, 'resolved_by_ai');
  assert.equal(result.items[0].matched_products[0].source_product_id, 'milk-a');
});

test('semantic enrichment batch job stores flat SQL-compatible semantic records', async () => {
  const state = createPhase3State();
  state.semantic_profiles = [];
  const store = new InMemoryDataBackboneStore(state);

  const result = await runSemanticEnrichmentJob({
    store,
    generatedAt: '2026-04-22T12:00:00.000Z',
  });

  assert.equal(result.processed, 2);
  assert.equal(result.state.semantic_profiles[0].semantic_text_bg.includes('|'), true);
  assert.equal(typeof result.state.semantic_profiles[0].semantic_terms_bg, 'string');
  assert.equal(result.state.semantic_profiles[0].semantic_version, 'phase3-semantic-v1');
});

test('embedding generation stores flat embedding records without overwriting existing ones', async () => {
  const store = new InMemoryDataBackboneStore(createPhase3State());

  const first = await runEmbeddingGenerationJob({
    store,
    generatedAt: '2026-04-22T12:30:00.000Z',
  });
  const second = await runEmbeddingGenerationJob({
    store,
    generatedAt: '2026-04-22T13:00:00.000Z',
  });

  assert.equal(first.processed, 2);
  assert.equal(second.processed, 0);
  assert.equal(first.state.embedding_records[0].embedding_model, 'phase3-hash-embedding-v1');
  assert.equal(typeof first.state.embedding_records[0].embedding_vector_json, 'string');
  assert.equal(JSON.parse(first.state.embedding_records[0].embedding_vector_json).length, 8);
});

test('feedback collector captures flat feedback events', async () => {
  const store = new InMemoryDataBackboneStore(createPhase3State());

  const feedback = await collectFeedback({
    store,
    feedback: {
      user_id: 'user-1',
      query_text: '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e',
      raw_item_input: '\u043c\u043b\u044f\u043a\u043e',
      resolved_source_product_id: 'milk-a',
      feedback_type: 'match_quality',
      feedback_value: 'thumbs_up',
      locality_code: '65677',
      notes: 'good match',
    },
    recordedAt: '2026-04-22T14:00:00.000Z',
  });

  const state = await store.load();
  assert.equal(state.feedback_events.length, 1);
  assert.equal(feedback.feedback_type, 'match_quality');
  assert.equal(feedback.feedback_value, 'thumbs_up');
  assert.equal(feedback.resolved_source_product_id, 'milk-a');
});

test('direct embedding generator returns deterministic storage payload', () => {
  const record = generateEmbeddingRecord({
    sourceProductId: 'milk-a',
    semanticProfile: createPhase3State().semantic_profiles[0],
    generatedAt: '2026-04-22T15:00:00.000Z',
  });

  assert.equal(record.source_product_id, 'milk-a');
  assert.equal(record.embedding_dimensions, 8);
  assert.equal(record.generated_at, '2026-04-22T15:00:00.000Z');
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

  console.log(`\nPhase 3 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
