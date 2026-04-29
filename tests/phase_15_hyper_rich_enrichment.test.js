const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  ENRICHMENT_PROMPT_VERSION,
  InMemoryDataBackboneStore,
  buildEnrichmentPrompt,
  extractExplicitDietAndAttributeTags,
  getEnrichmentByFingerprint,
  importDailySnapshotCsvStream,
  normalizeDietOrAttributeTag,
  storeEnrichment,
  validateEnrichmentResponse,
} = require('../app/functions/src');
const { SOURCE_HEADERS } = require('../app/functions/src/phase1/constants');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
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

async function importInlineCsv({
  store,
  rows,
  canonicalEnrichmentClient = null,
  enableLlmEnrichment = false,
  ingestedAt,
}) {
  return importDailySnapshotCsvStream({
    store,
    csvStream: createCsv(rows),
    snapshotDate: '2026-04-23',
    sourceFileName: 'CHAIN_A_100.csv',
    ingestedAt,
    canonicalEnrichmentClient,
    enableLlmEnrichment,
  });
}

function buildValidEnrichment(overrides = {}) {
  return {
    base_product: 'Milk',
    category_l1: 'Food & Beverage',
    category_l2: 'Dairy',
    category_l3: 'Milk',
    category_l4: 'Low Fat',
    brand: 'Vereya',
    product_line: null,
    flavor: ['Chocolate', 'chocolate'],
    attributes: [' Low Fat ', 'low fat'],
    diet_tags: [],
    allergens: ['Milk'],
    product_form: 'Liquid',
    packaging: 'Carton',
    usage_context: ['Breakfast', 'snack'],
    quality_tier: 'Premium',
    confidence: 0.91,
    ...overrides,
  };
}

test('new canonical fingerprint triggers enrichment LLM and caches the validated result', async () => {
  const store = new InMemoryDataBackboneStore();
  const calls = [];
  const result = await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Low Fat Chocolate Milk 1L","1001","6","2.99","0"',
    ],
    canonicalEnrichmentClient: async (payload) => {
      calls.push(payload);
      return buildValidEnrichment();
    },
    enableLlmEnrichment: true,
    ingestedAt: '2026-04-23T10:00:00.000Z',
  });

  assert.equal(calls.length, 1);
  assert.equal(result.canonical_enrichment_created_count, 1);
  assert.equal(result.canonical_enrichment_model_call_count, 1);
  assert.equal(result.state.canonical_enrichment_store.length, 1);
  assert.equal(calls[0].prompt.prompt_version, ENRICHMENT_PROMPT_VERSION);
  assert.equal(calls[0].prompt.input.product_name, 'Low Fat Chocolate Milk 1L');
  assert.deepEqual(
    [...calls[0].prompt.input.tokens].sort(),
    ['chocolate', 'fat', 'low', 'milk']
  );

  const enrichmentRecord = result.state.canonical_enrichment_store[0];
  assert.equal(enrichmentRecord.prompt_version, ENRICHMENT_PROMPT_VERSION);
  assert.equal(enrichmentRecord.enrichment.base_product, 'milk');
  assert.deepEqual(enrichmentRecord.enrichment.flavor, ['chocolate']);
  assert.deepEqual(enrichmentRecord.enrichment.attributes, ['low_fat']);
  assert.equal(getEnrichmentByFingerprint(result.state, enrichmentRecord.canonical_fingerprint).enrichment.packaging, 'carton');
});

test('explicit EN diet and attribute claims normalize with evidence', () => {
  const claims = extractExplicitDietAndAttributeTags('Organic vegan gluten-free chocolate');

  assert.deepEqual(claims.diet_tags, ['vegan']);
  assert.deepEqual(claims.attributes, ['organic', 'gluten_free']);
  assert.deepEqual(claims.evidence.map((entry) => entry.tag), ['vegan', 'organic', 'gluten_free']);
});

test('explicit BG diet and attribute claims normalize with evidence', () => {
  const claims = extractExplicitDietAndAttributeTags('Био веган шоколад без глутен');

  assert.deepEqual(claims.diet_tags, ['vegan']);
  assert.deepEqual(claims.attributes, ['organic', 'gluten_free']);
  assert.equal(claims.evidence.some((entry) => entry.matched_text === 'Био'), true);
  assert.equal(claims.evidence.some((entry) => entry.matched_text === 'без глутен'), true);
});

test('explicit DE diet and attribute claims normalize with evidence', () => {
  const claims = extractExplicitDietAndAttributeTags('Bio vegan Schokolade glutenfrei');

  assert.deepEqual(claims.diet_tags, ['vegan']);
  assert.deepEqual(claims.attributes, ['organic', 'gluten_free']);
});

test('lactose-free and sugar-free normalize across EN BG and DE aliases', () => {
  const claims = extractExplicitDietAndAttributeTags(
    'lactose free sugar-free без лактоза без захар laktosefrei zuckerfrei'
  );

  assert.deepEqual(claims.attributes, ['lactose_free', 'sugar_free']);
});

test('low-fat and high-protein normalize across EN BG and DE aliases', () => {
  const claims = extractExplicitDietAndAttributeTags(
    'low fat high-protein нискомаслен високо протеинов fettarm proteinreich'
  );

  assert.deepEqual(claims.attributes, ['low_fat', 'high_protein']);
});

test('LLM-style diet and attribute synonyms normalize into controlled tags', () => {
  const normalized = validateEnrichmentResponse(buildValidEnrichment({
    attributes: ['bio', 'gluten free', 'low fat', 'high protein', 'sparkling'],
    diet_tags: ['vegan', 'vegetarisch'],
  }));

  assert.deepEqual(normalized.attributes, ['organic', 'gluten_free', 'low_fat', 'high_protein']);
  assert.deepEqual(normalized.diet_tags, ['vegan', 'vegetarian']);
  assert.equal(normalizeDietOrAttributeTag('biologisch', 'attributes'), 'organic');
});

test('extractor does not infer diet or attributes from category-like text alone', () => {
  const claims = extractExplicitDietAndAttributeTags('Chocolate category dairy snacks');

  assert.deepEqual(claims.diet_tags, []);
  assert.deepEqual(claims.attributes, []);
  assert.deepEqual(claims.evidence, []);
});

test('duplicate explicit and LLM claims are deduped during enrichment', async () => {
  const store = new InMemoryDataBackboneStore();
  const result = await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Био веган шоколад без глутен","1101","6","4.99","0"',
    ],
    canonicalEnrichmentClient: async () => buildValidEnrichment({
      base_product: 'chocolate',
      category_l1: 'Food & Beverage',
      category_l2: 'Sweets',
      category_l3: 'Chocolate',
      category_l4: 'organic',
      attributes: ['bio', 'gluten free', 'organic'],
      diet_tags: ['vegan', 'веган'],
      allergens: [],
      product_form: 'solid',
      packaging: 'wrapper',
    }),
    enableLlmEnrichment: true,
    ingestedAt: '2026-04-23T10:12:00.000Z',
  });

  const enrichmentRecord = result.state.canonical_enrichment_store[0];
  assert.deepEqual(enrichmentRecord.enrichment.diet_tags, ['vegan']);
  assert.deepEqual(enrichmentRecord.enrichment.attributes, ['organic', 'gluten_free']);
  assert.equal(enrichmentRecord.explicit_claim_evidence.length, 3);
});

test('existing canonical fingerprint reuses cached enrichment without a second LLM call', async () => {
  const store = new InMemoryDataBackboneStore();

  const first = await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Low Fat Chocolate Milk 1L","1001","6","2.99","0"',
    ],
    ingestedAt: '2026-04-23T10:05:00.000Z',
  });
  const fingerprint = first.state.canonical_products[0].canonical_product_id;
  const state = await store.load();
  state.canonical_enrichment_store = [];
  storeEnrichment(state, fingerprint, validateEnrichmentResponse(buildValidEnrichment()), {
    modelName: 'seed-model',
    promptVersion: ENRICHMENT_PROMPT_VERSION,
    createdAt: '2026-04-23T09:00:00.000Z',
  });
  await store.save(state);

  let calls = 0;
  const second = await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Low Fat Chocolate Milk 1L","1001","6","2.99","0"',
    ],
    canonicalEnrichmentClient: async () => {
      calls += 1;
      return buildValidEnrichment();
    },
    enableLlmEnrichment: true,
    ingestedAt: '2026-04-23T10:06:00.000Z',
  });

  assert.equal(calls, 0);
  assert.equal(second.canonical_enrichment_created_count, 0);
  assert.equal(second.canonical_enrichment_reused_count, 1);
  assert.equal(second.canonical_enrichment_model_call_count, 0);
});

test('invalid enrichment output is rejected and does not get cached', async () => {
  const store = new InMemoryDataBackboneStore();
  const result = await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Low Fat Chocolate Milk 1L","1001","6","2.99","0"',
    ],
    canonicalEnrichmentClient: async () => ({
      category_l1: 'Food & Beverage',
      category_l2: 'Dairy',
      category_l3: 'Milk',
      category_l4: null,
      brand: null,
      product_line: null,
      flavor: [],
      attributes: [],
      diet_tags: [],
      allergens: [],
      product_form: 'liquid',
      packaging: 'carton',
      usage_context: [],
      quality_tier: null,
      confidence: 0.8,
    }),
    enableLlmEnrichment: true,
    ingestedAt: '2026-04-23T10:10:00.000Z',
  });

  assert.equal(result.canonical_enrichment_rejected_count, 1);
  assert.equal(result.state.canonical_enrichment_store.length, 0);
  assert.match(result.canonical_enrichment_errors[0].message, /base_product|missing fields/);
});

test('schema enforcement normalizes values and rejects uncontrolled fields', () => {
  const normalized = validateEnrichmentResponse(buildValidEnrichment());
  assert.equal(normalized.category_l1, 'food & beverage');
  assert.equal(normalized.category_l2, 'dairy');
  assert.equal(normalized.category_l3, 'milk');
  assert.equal(normalized.product_form, 'liquid');
  assert.deepEqual(normalized.usage_context, ['breakfast', 'snack']);

  assert.throws(
    () => validateEnrichmentResponse({
      ...buildValidEnrichment(),
      surprise_field: 'not allowed',
    }),
    /uncontrolled fields/
  );
});

test('category constraints are enforced', () => {
  assert.throws(
    () => validateEnrichmentResponse(buildValidEnrichment({
      category_l1: 'Health',
      category_l2: 'Dairy',
    })),
    /invalid category_l2/
  );
});

test('enrichment remains additive and does not affect canonical grouping', async () => {
  const rows = [
    '"1000","Store A","Low Fat Chocolate Milk 1L","1001","6","2.99","0"',
    '"1001","Store B","Low Fat Chocolate Milk 1L","2001","6","3.09","0"',
  ];
  const withoutEnrichmentStore = new InMemoryDataBackboneStore();
  const withEnrichmentStore = new InMemoryDataBackboneStore();

  const withoutEnrichment = await importInlineCsv({
    store: withoutEnrichmentStore,
    rows,
    ingestedAt: '2026-04-23T10:15:00.000Z',
  });
  const withEnrichment = await importInlineCsv({
    store: withEnrichmentStore,
    rows,
    canonicalEnrichmentClient: async () => buildValidEnrichment(),
    enableLlmEnrichment: true,
    ingestedAt: '2026-04-23T10:16:00.000Z',
  });

  assert.equal(withoutEnrichment.canonical_product_count, 1);
  assert.equal(withEnrichment.canonical_product_count, 1);
  assert.equal(withoutEnrichment.canonical_merge_count, 1);
  assert.equal(withEnrichment.canonical_merge_count, 1);
  assert.equal(
    withoutEnrichment.state.canonical_products[0].canonical_product_id,
    withEnrichment.state.canonical_products[0].canonical_product_id
  );
  assert.equal(withEnrichment.state.canonical_products[0].enrichment, undefined);
});

test('buildEnrichmentPrompt exposes the controlled category tree and strict schema', () => {
  const prompt = buildEnrichmentPrompt('Low Fat Chocolate Milk 1L', ['milk', 'chocolate'], {
    volume_marker: '1000ml',
    count_marker: null,
    age_band_marker: null,
    reserve_marker: null,
  });

  assert.equal(prompt.prompt_version, ENRICHMENT_PROMPT_VERSION);
  assert.equal(prompt.allowed_categories['Food & Beverage'].Dairy.includes('Milk'), true);
  assert.equal(typeof prompt.response_schema.base_product, 'string');
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

  console.log(`\nPhase 15 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
