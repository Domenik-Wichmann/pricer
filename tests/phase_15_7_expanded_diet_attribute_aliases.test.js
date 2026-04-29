const assert = require('node:assert/strict');

const {
  extractExplicitDietAndAttributeTags,
  normalizeDietAndAttributeTags,
  validateEnrichmentResponse,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function validEnrichment(overrides = {}) {
  return {
    base_product: 'bread',
    product_line: null,
    brand: null,
    flavor: [],
    attributes: [],
    diet_tags: [],
    allergens: [],
    product_form: 'solid',
    packaging: 'bag',
    usage_context: ['breakfast'],
    quality_tier: null,
    category_l1: 'food & beverage',
    category_l2: 'bakery',
    category_l3: 'bread',
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
}

test('Turkish aliases normalize to controlled tags', () => {
  assertClaims(
    'organik vegan vejetaryen glutensiz laktozsuz şekersiz ilave şekersiz az yağlı yüksek proteinli bitkisel bazlı helal koşer tam tahıllı',
    ['vegan', 'vegetarian'],
    [
      'organic',
      'gluten_free',
      'lactose_free',
      'sugar_free',
      'low_fat',
      'high_protein',
      'plant_based',
      'halal',
      'kosher',
      'no_added_sugar',
      'wholegrain',
    ]
  );
});

test('Russian aliases normalize to controlled tags', () => {
  assertClaims(
    'органик веганский вегетарианская без глютена без лактозы без сахара без добавленного сахара обезжиренный высокобелковый на растительной основе халяль кошерный цельнозерновой',
    ['vegan', 'vegetarian'],
    [
      'organic',
      'gluten_free',
      'lactose_free',
      'sugar_free',
      'low_fat',
      'high_protein',
      'plant_based',
      'halal',
      'kosher',
      'no_added_sugar',
      'wholegrain',
    ]
  );
});

test('Ukrainian aliases normalize to controlled tags', () => {
  assertClaims(
    'органік веганський вегетаріанська без глютену без лактози без цукру без доданого цукру знежирений високобілковий на рослинній основі халяль кошерний цільнозерновий',
    ['vegan', 'vegetarian'],
    [
      'organic',
      'gluten_free',
      'lactose_free',
      'sugar_free',
      'low_fat',
      'high_protein',
      'plant_based',
      'halal',
      'kosher',
      'no_added_sugar',
      'wholegrain',
    ]
  );
});

test('Dutch aliases normalize to controlled tags', () => {
  assertClaims(
    'biologisch veganistisch vegetarisch glutenvrij lactosevrij suikervrij zonder toegevoegde suiker vetarm eiwitrijk plantaardig halal koosjer volkoren',
    ['vegan', 'vegetarian'],
    [
      'organic',
      'gluten_free',
      'lactose_free',
      'sugar_free',
      'low_fat',
      'high_protein',
      'plant_based',
      'halal',
      'kosher',
      'no_added_sugar',
      'wholegrain',
    ]
  );
});

test('Spanish aliases normalize to controlled tags', () => {
  assertClaims(
    'orgánico vegano vegetariana sin gluten sin lactosa sin azúcar sin azúcar añadido bajo en grasa alto en proteína de origen vegetal halal kosher integral',
    ['vegan', 'vegetarian'],
    [
      'organic',
      'gluten_free',
      'lactose_free',
      'sugar_free',
      'low_fat',
      'high_protein',
      'plant_based',
      'halal',
      'kosher',
      'no_added_sugar',
      'wholegrain',
    ]
  );
});

test('unaccented aliases normalize where reviewed variants exist', () => {
  assertClaims(
    'organico ecologico sin azucar sin azucar anadido alto en proteina tam bugday dusuk yagli gluten icermez laktoz icermez seker icermez',
    [],
    [
      'organic',
      'gluten_free',
      'lactose_free',
      'sugar_free',
      'low_fat',
      'high_protein',
      'no_added_sugar',
      'wholegrain',
    ]
  );
});

test('LLM-style expanded aliases normalize and ignore unmapped values', () => {
  const normalized = validateEnrichmentResponse(validEnrichment({
    attributes: ['organik', 'glutenvrij', 'sin lactosa', 'zonder suiker', 'tam tahilli', 'low sugar'],
    diet_tags: ['vejetaryen', 'vegana', 'plant based diet'],
  }));

  assert.deepEqual(normalized.attributes, [
    'organic',
    'gluten_free',
    'lactose_free',
    'sugar_free',
    'wholegrain',
  ]);
  assert.deepEqual(normalized.diet_tags, ['vegetarian', 'vegan']);
});

test('false positives do not match substrings inside unrelated words', () => {
  const claims = extractExplicitDietAndAttributeTags(
    'biography organikogurt glutensizlik suikervrijheid veganoscope integralidad'
  );

  assert.deepEqual(claims.diet_tags, []);
  assert.deepEqual(claims.attributes, []);
  assert.deepEqual(claims.evidence, []);
});

test('false positives do not infer from tofu natural or low sugar claims', () => {
  const claims = extractExplicitDietAndAttributeTags('Natural tofu low sugar snack');

  assert.deepEqual(claims.diet_tags, []);
  assert.deepEqual(claims.attributes, []);
  assert.deepEqual(claims.evidence, []);
});

test('standalone normalizer keeps only controlled aliases', () => {
  const normalized = normalizeDietAndAttributeTags({
    dietTags: ['веганская', 'vegetariana', 'tofu'],
    attributes: ['біо', 'libre de gluten', 'mager', 'natural', 'low sugar'],
  });

  assert.deepEqual(normalized.diet_tags, ['vegan', 'vegetarian']);
  assert.deepEqual(normalized.attributes, ['organic', 'gluten_free', 'low_fat']);
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

  console.log(`\nPhase 15.7 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
