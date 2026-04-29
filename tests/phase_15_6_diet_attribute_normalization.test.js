const assert = require('node:assert/strict');

const {
  extractExplicitDietAndAttributeTags,
  InMemoryDataBackboneStore,
  importDailySnapshotCsvStream,
  normalizeDietAndAttributeTags,
  normalizeDietOrAttributeTag,
  validateEnrichmentResponse,
} = require('../app/functions/src');
const { SOURCE_HEADERS } = require('../app/functions/src/phase1/constants');
const { Readable } = require('node:stream');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function validEnrichment(overrides = {}) {
  return {
    base_product: 'milk',
    product_line: null,
    brand: null,
    flavor: [],
    attributes: [],
    diet_tags: [],
    allergens: [],
    product_form: 'liquid',
    packaging: 'carton',
    usage_context: ['breakfast'],
    quality_tier: null,
    category_l1: 'food & beverage',
    category_l2: 'dairy',
    category_l3: 'milk',
    category_l4: null,
    confidence: 0.9,
    ...overrides,
  };
}

function assertClaims(text, expectedDietTags, expectedAttributes) {
  const claims = extractExplicitDietAndAttributeTags(text);
  assert.deepEqual(claims.diet_tags, expectedDietTags);
  assert.deepEqual(claims.attributes, expectedAttributes);
  expectedDietTags.concat(expectedAttributes).forEach((tag) => {
    assert.equal(
      claims.evidence.some((entry) => entry.tag === tag),
      true,
      `expected evidence for ${tag}`
    );
  });
  return claims;
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
  ].join(',');
  return Readable.from([`${header}\n${rows.join('\n')}\n`]);
}

test('English explicit claims normalize to controlled tags', () => {
  assertClaims('Organic milk', [], ['organic']);
  assertClaims('Vegan cheese', ['vegan'], []);
  assertClaims('Gluten-free bread', [], ['gluten_free']);
});

test('Bulgarian explicit claims normalize to controlled tags', () => {
  assertClaims('Био мляко', [], ['organic']);
  assertClaims('Веган сирене', ['vegan'], []);
  assertClaims('Без глутен хляб', [], ['gluten_free']);
});

test('German explicit claims normalize to controlled tags', () => {
  assertClaims('Bio Milch', [], ['organic']);
  assertClaims('Vegan Käse', ['vegan'], []);
  assertClaims('Glutenfrei Brot', [], ['gluten_free']);
});

test('additional aliases cover lactose-free sugar-free low-fat and high-protein', () => {
  const claims = assertClaims(
    'lactose-free laktosefrei без лактоза sugar free zuckerfrei без захар low-fat fettarm нискомаслен high protein proteinreich високо протеинов',
    [],
    ['lactose_free', 'sugar_free', 'low_fat', 'high_protein']
  );
  assert.equal(claims.evidence.length >= 4, true);
});

test('mixed-language strings dedupe repeated claims', () => {
  const claims = extractExplicitDietAndAttributeTags(
    'Bio organic био vegan веган gluten free без глутен glutenfrei'
  );

  assert.deepEqual(claims.diet_tags, ['vegan']);
  assert.deepEqual(claims.attributes, ['organic', 'gluten_free']);
});

test('extractor does not infer diet claims from product category words', () => {
  const claims = extractExplicitDietAndAttributeTags('Plain tofu protein snack');

  assert.deepEqual(claims.diet_tags, []);
  assert.deepEqual(claims.attributes, []);
  assert.deepEqual(claims.evidence, []);
});

test('LLM diet and attribute outputs normalize to controlled vocabulary only', () => {
  const normalized = validateEnrichmentResponse(validEnrichment({
    attributes: ['bio', 'gluten free', 'low fat', 'sparkling', 'unknown claim'],
    diet_tags: ['vegetarisch', 'vegan', 'unmapped diet'],
  }));

  assert.deepEqual(normalized.attributes, ['organic', 'gluten_free', 'low_fat']);
  assert.deepEqual(normalized.diet_tags, ['vegetarian', 'vegan']);
  assert.equal(normalizeDietOrAttributeTag('biologisch', 'attributes'), 'organic');
  assert.equal(normalizeDietOrAttributeTag('unmapped diet', 'diet_tags'), null);
});

test('standalone normalizer dedupes and ignores unmapped tags', () => {
  assert.deepEqual(
    normalizeDietAndAttributeTags({
      dietTags: ['vegan', 'веган', 'tofu'],
      attributes: ['bio', 'organic', 'sparkling'],
    }),
    {
      diet_tags: ['vegan'],
      attributes: ['organic'],
    }
  );
});

test('enrichment merge remains additive and preserves canonical grouping', async () => {
  const store = new InMemoryDataBackboneStore();
  const result = await importDailySnapshotCsvStream({
    store,
    csvStream: createCsv([
      '"1000","Store A","Био веган шоколад без глутен","1506","6","4.99","0"',
    ]),
    snapshotDate: '2026-04-26',
    sourceFileName: 'phase15_6.csv',
    ingestedAt: '2026-04-26T15:06:00.000Z',
    enableLlmEnrichment: true,
    canonicalEnrichmentClient: async () => validEnrichment({
      base_product: 'chocolate',
      category_l2: 'sweets',
      category_l3: 'chocolate',
      attributes: ['bio', 'gluten free', 'sparkling'],
      diet_tags: ['веган'],
      allergens: [],
      product_form: 'solid',
      packaging: 'wrapper',
      usage_context: ['snack'],
    }),
  });

  const state = result.state;
  const productSnapshot = JSON.stringify(state.canonical_products);
  const mappingSnapshot = JSON.stringify(state.canonical_product_mappings);
  const record = state.canonical_enrichment_store[0];

  assert.deepEqual(record.enrichment.diet_tags, ['vegan']);
  assert.deepEqual(record.enrichment.attributes, ['organic', 'gluten_free']);
  assert.equal(record.explicit_claim_evidence.some((entry) => entry.tag === 'organic'), true);
  assert.equal(record.explicit_claim_evidence.some((entry) => entry.tag === 'gluten_free'), true);
  assert.equal(record.explicit_claim_evidence.some((entry) => entry.tag === 'vegan'), true);
  assert.equal(JSON.stringify(state.canonical_products), productSnapshot);
  assert.equal(JSON.stringify(state.canonical_product_mappings), mappingSnapshot);
});

async function run() {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }

  console.log(`\nPhase 15.6 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
