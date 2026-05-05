const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  ENRICHMENT_PROMPT_VERSION,
  InMemoryDataBackboneStore,
  RICH_CANONICAL_ENRICHMENT_VERSION,
  buildEnrichmentLlmProviderConfig,
  buildRichCanonicalEnrichmentBatchPrompt,
  buildEnrichmentPrompt,
  extractExplicitDietAndAttributeTags,
  getEnrichmentByFingerprint,
  importDailySnapshotCsvStream,
  normalizeDietOrAttributeTag,
  requestCanonicalEnrichmentBatch,
  runCanonicalEnrichmentHealthcheck,
  runCanonicalEnrichmentPilot,
  selectEnrichmentPilotCandidates,
  storeEnrichment,
  validateEnrichmentResponse,
  validateRichCanonicalEnrichmentBatchResponse,
  validateRichCanonicalEnrichmentResponse,
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

function buildValidRichEnrichment(overrides = {}) {
  return {
    ...buildValidEnrichment({
      enrichment_source: 'llm',
      enrichment_version: RICH_CANONICAL_ENRICHMENT_VERSION,
    }),
    normalized_display_name_bg: null,
    normalized_display_name_en: null,
    brand_normalized: 'vereya',
    brand_candidates: [],
    manufacturer_or_brand_owner: null,
    product_family: 'dairy',
    product_type: 'milk',
    product_form: 'liquid',
    category: 'dairy',
    subcategory: 'milk',
    category_path: ['food & beverage', 'dairy', 'milk'],
    comparable_product_class: 'fresh milk',
    variant_group_key: null,
    variant_attributes: [],
    is_food: true,
    is_beverage: false,
    is_alcohol: false,
    is_baby_product: false,
    is_pet_product: false,
    is_household: false,
    is_personal_care: false,
    is_medicine_or_supplement: false,
    storage_type: 'refrigerated',
    meal_role: ['breakfast', 'staple'],
    preparation_required: false,
    ready_to_eat: true,
    cooking_use: [],
    pantry_staple_score: 0.6,
    likely_dairy: true,
    likely_meat: false,
    likely_vegetarian: true,
    likely_vegan: false,
    gluten_related: null,
    sugar_free: null,
    low_fat: true,
    wholegrain: null,
    organic_bio: null,
    allergen_hints: ['milk'],
    ingredient_hints: [],
    size_marker: null,
    package_quantity: 1,
    package_unit: 'pcs',
    total_quantity: 1000,
    total_unit: 'ml',
    multipack_count: null,
    unit_quantity: 1000,
    unit_quantity_unit: 'ml',
    serving_context: 'family carton',
    dairy_type: 'milk',
    milk_source: 'cow',
    fat_percent: 1.5,
    uht_or_fresh: 'fresh',
    lactose_free: null,
    plain_or_flavored: 'plain',
    beverage_type: 'unknown',
    carbonated: false,
    caffeine_related: false,
    alcohol_percent: null,
    baby_stage: 'unknown',
    age_min_months: null,
    age_max_months: null,
    age_band_label: null,
    formula_stage: null,
    baby_food_type: null,
    synonym_terms: [],
    negative_match_hints: [],
    do_not_match_queries: [],
    should_match_queries: ['milk', '\u043c\u043b\u044f\u043a\u043e'],
    disambiguation_notes: [],
    shopping_family_id: 'milk',
    clarification_attributes: ['fat_percent', 'size'],
    likely_user_choice_attributes: ['brand', 'fat_percent', 'size'],
    brand_preference_relevance: true,
    size_preference_relevance: true,
    flavor_preference_relevance: false,
    data_quality_status: 'valid',
    data_quality_reasons: [],
    ambiguous_fields: [],
    needs_human_review: false,
    llm_uncertainty_reasons: [],
    explanation_short: 'Fresh cow milk inferred from the canonical product name.',
    reviewed_status: 'unreviewed',
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

test('rich v2 schema validates conservative milk semantics', () => {
  const normalized = validateRichCanonicalEnrichmentResponse(buildValidRichEnrichment());

  assert.equal(normalized.enrichment_version, RICH_CANONICAL_ENRICHMENT_VERSION);
  assert.equal(normalized.is_food, true);
  assert.equal(normalized.is_personal_care, false);
  assert.equal(normalized.dairy_type, 'milk');
  assert.equal(normalized.uht_or_fresh, 'fresh');
  assert.equal(normalized.beverage_type, 'unknown');
  assert.equal(normalized.likely_dairy, true);
});

test('rich v2 product_form semi-solid near miss normalizes to null with warning', () => {
  const validationWarnings = [];
  const normalized = validateRichCanonicalEnrichmentResponse(buildValidRichEnrichment({
    product_form: 'semi-solid',
  }), { validationWarnings });

  assert.equal(normalized.product_form, null);
  assert.deepEqual(validationWarnings, [{
    field: 'product_form',
    original_value: 'semi-solid',
    normalized_value: null,
    reason: 'unsupported_near_miss_product_form',
  }]);
  assert.throws(
    () => validateEnrichmentResponse(buildValidEnrichment({ product_form: 'semi-solid' })),
    /invalid product_form/
  );
});

test('rich v2 schema separates milk shampoo and Milka chocolate from dairy milk', () => {
  const shampoo = validateRichCanonicalEnrichmentResponse(buildValidRichEnrichment({
    base_product: 'shampoo',
    category_l1: 'Personal Care',
    category_l2: 'Hair Care',
    category_l3: 'Shampoo',
    category_l4: null,
    category: 'personal care',
    subcategory: 'shampoo',
    product_family: 'personal care',
    product_type: 'shampoo',
    product_form: 'liquid',
    packaging: 'bottle',
    attributes: [],
    allergens: [],
    usage_context: ['hair care'],
    is_food: false,
    is_personal_care: true,
    storage_type: 'shelf_stable',
    meal_role: [],
    ready_to_eat: null,
    likely_dairy: false,
    likely_vegetarian: null,
    dairy_type: 'unknown',
    milk_source: 'unknown',
    fat_percent: null,
    uht_or_fresh: 'unknown',
    low_fat: null,
    plain_or_flavored: 'unknown',
    should_match_queries: ['shampoo'],
    do_not_match_queries: ['milk'],
    shopping_family_id: 'personal_care_shampoo',
    explanation_short: 'Milk wording is personal-care scent/marketing context, not food dairy.',
  }));
  const chocolate = validateRichCanonicalEnrichmentResponse(buildValidRichEnrichment({
    base_product: 'chocolate',
    category_l2: 'Sweets',
    category_l3: 'Chocolate',
    category_l4: null,
    category: 'sweets',
    subcategory: 'chocolate',
    product_family: 'sweets',
    product_type: 'chocolate',
    product_form: 'solid',
    packaging: 'wrapper',
    brand: 'Milka',
    brand_normalized: 'milka',
    flavor: ['milk chocolate'],
    flavor_terms: ['chocolate'],
    attributes: [],
    usage_context: ['snack'],
    storage_type: 'shelf_stable',
    meal_role: ['snack', 'dessert'],
    likely_dairy: null,
    dairy_type: 'unknown',
    milk_source: 'unknown',
    fat_percent: null,
    uht_or_fresh: 'unknown',
    low_fat: null,
    plain_or_flavored: 'unknown',
    shopping_family_id: 'chocolate',
    explanation_short: 'Milka is a chocolate brand, not a milk product.',
  }));

  assert.equal(shampoo.is_food, false);
  assert.equal(shampoo.is_personal_care, true);
  assert.equal(shampoo.dairy_type, 'unknown');
  assert.equal(chocolate.product_type, 'chocolate');
  assert.equal(chocolate.dairy_type, 'unknown');
});

test('rich v2 schema separates cola beverage from collagen shampoo', () => {
  const cola = validateRichCanonicalEnrichmentResponse(buildValidRichEnrichment({
    base_product: 'cola',
    category_l2: 'Beverages',
    category_l3: 'Soft Drinks',
    category_l4: null,
    category: 'beverages',
    subcategory: 'soft drinks',
    product_family: 'beverages',
    product_type: 'soft drink',
    brand: 'Coca-Cola',
    brand_normalized: 'coca-cola',
    flavor: ['cola'],
    flavor_terms: ['cola'],
    attributes: ['sparkling'],
    allergens: [],
    usage_context: ['refreshment'],
    is_beverage: true,
    storage_type: 'shelf_stable',
    meal_role: ['drink'],
    likely_dairy: false,
    dairy_type: 'unknown',
    milk_source: 'unknown',
    fat_percent: null,
    uht_or_fresh: 'unknown',
    low_fat: null,
    beverage_type: 'cola',
    carbonated: true,
    caffeine_related: true,
    shopping_family_id: 'cola_soft_drink',
  }));
  const collagenShampoo = validateRichCanonicalEnrichmentResponse(buildValidRichEnrichment({
    base_product: 'shampoo',
    category_l1: 'Personal Care',
    category_l2: 'Hair Care',
    category_l3: 'Shampoo',
    category_l4: null,
    category: 'personal care',
    subcategory: 'shampoo',
    product_family: 'personal care',
    product_type: 'shampoo',
    product_form: 'liquid',
    packaging: 'bottle',
    flavor: [],
    flavor_terms: [],
    attributes: ['collagen'],
    allergens: [],
    usage_context: ['hair care'],
    is_food: false,
    is_beverage: false,
    is_personal_care: true,
    storage_type: 'shelf_stable',
    meal_role: [],
    likely_dairy: false,
    likely_vegetarian: null,
    dairy_type: 'unknown',
    milk_source: 'unknown',
    fat_percent: null,
    uht_or_fresh: 'unknown',
    low_fat: null,
    beverage_type: 'unknown',
    carbonated: null,
    caffeine_related: null,
    do_not_match_queries: ['cola'],
    shopping_family_id: 'personal_care_shampoo',
  }));

  assert.equal(cola.is_beverage, true);
  assert.equal(cola.beverage_type, 'cola');
  assert.equal(collagenShampoo.is_beverage, false);
  assert.equal(collagenShampoo.is_personal_care, true);
  assert.equal(collagenShampoo.beverage_type, 'unknown');
});

test('rich batch prompt and validator require one result per canonical product id', () => {
  const products = [
    {
      canonical_product_id: 'cp_milk',
      canonical_display_name: 'Fresh Milk 1L',
      source_example_name: 'Fresh Milk 1L',
      canonical_attributes_json: JSON.stringify({ volume_marker: '1000ml' }),
    },
    {
      canonical_product_id: 'cp_cola',
      canonical_display_name: 'Coca-Cola Original 1L',
      source_example_name: 'Coca-Cola Original 1L',
    },
  ];
  const prompt = buildRichCanonicalEnrichmentBatchPrompt(products);
  const expectedProductForms = [
    'liquid',
    'solid',
    'powder',
    'gel',
    'cream',
    'paste',
    'spray',
    'tablet',
    'capsule',
    'granules',
    'frozen',
  ];

  assert.equal(prompt.response_shape.products[0].canonical_product_id.includes('must exactly match'), true);
  assert.deepEqual(prompt.allowed_enums.product_form, expectedProductForms);
  assert.equal(prompt.allowed_enums.product_form.includes('semi-solid'), false);
  assert.equal(prompt.response_shape.products[0].enrichment.product_form, `${expectedProductForms.join('|')}|null`);
  assert.equal(
    prompt.scope_rules.some((rule) => rule.includes('Controlled enum fields must use only the listed values')),
    true
  );
  const validated = validateRichCanonicalEnrichmentBatchResponse({
    products: [
      { canonical_product_id: 'cp_milk', enrichment: buildValidRichEnrichment() },
      {
        canonical_product_id: 'cp_cola',
        enrichment: buildValidRichEnrichment({
          base_product: 'cola',
          category_l2: 'Beverages',
          category_l3: 'Soft Drinks',
          category_l4: null,
          category: 'beverages',
          subcategory: 'soft drinks',
          product_family: 'beverages',
          product_type: 'soft drink',
          brand: 'Coca-Cola',
          brand_normalized: 'coca-cola',
          flavor: ['cola'],
          flavor_terms: ['cola'],
          attributes: ['sparkling'],
          allergens: [],
          usage_context: ['refreshment'],
          is_beverage: true,
          dairy_type: 'unknown',
          milk_source: 'unknown',
          fat_percent: null,
          uht_or_fresh: 'unknown',
          low_fat: null,
          beverage_type: 'cola',
          carbonated: true,
          caffeine_related: true,
        }),
      },
    ],
  }, { products });

  assert.equal(validated.length, 2);
  assert.throws(
    () => validateRichCanonicalEnrichmentBatchResponse({
      products: [{ canonical_product_id: 'cp_milk', enrichment: buildValidRichEnrichment() }],
    }, { products }),
    /count mismatch/
  );
  assert.throws(
    () => validateRichCanonicalEnrichmentBatchResponse({
      products: [
        { canonical_product_id: 'cp_milk', enrichment: buildValidRichEnrichment() },
        { canonical_product_id: 'cp_extra', enrichment: buildValidRichEnrichment() },
      ],
    }, { products }),
    /unexpected product id/
  );
});

test('focused enrichment pilot selector finds only targeted semantic-search candidates', () => {
  const state = {
    canonical_products: [
      {
        canonical_product_id: 'cp_chips',
        canonical_display_name: 'Crunchy potato chips 90 g',
        source_example_name: 'Crunchy potato chips 90 g',
      },
      {
        canonical_product_id: 'cp_detergent',
        canonical_display_name: 'Laundry detergent 1 l',
        source_example_name: 'Laundry detergent 1 l',
      },
    ],
    canonical_enrichment_store: [],
  };

  const candidates = selectEnrichmentPilotCandidates({
    state,
    query: 'snacks',
    limit: 10,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].canonical_product_id, 'cp_chips');
  assert.equal(candidates[0].pilot_match.groups.includes('cookies_snacks_sweets'), true);
});

test('LLM enrichment pilot dry-run writes nothing and reports cost estimate', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [{
      canonical_product_id: 'cp_cola',
      canonical_display_name: 'Coca-Cola Original 1L',
      source_example_name: 'Coca-Cola Original 1L',
      canonical_brand: 'Coca-Cola',
    }],
    canonical_enrichment_store: [],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_PILOT_QUERY: 'cola',
      PRICER_ENRICHMENT_DRY_RUN: 'true',
      PRICER_ENRICHMENT_PILOT_LIMIT: '5',
    },
  });
  const after = await store.load();

  assert.equal(summary.dry_run, true);
  assert.equal(summary.selected_count, 1);
  assert.equal(summary.actual_writes, 0);
  assert.equal(summary.estimated_tokens > 0, true);
  assert.equal(after.canonical_enrichment_store.length, 0);
});

test('real pilot guard prevents accidental LLM call when RUN_LLM is not true', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [{
      canonical_product_id: 'cp_cola',
      canonical_display_name: 'Coca-Cola Original 1L',
      source_example_name: 'Coca-Cola Original 1L',
      canonical_brand: 'Coca-Cola',
    }],
    canonical_enrichment_store: [],
  });
  let calls = 0;

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_PILOT_QUERY: 'cola',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'false',
      PRICER_ENRICHMENT_PILOT_LIMIT: '5',
    },
    canonicalEnrichmentBatchClient: async () => {
      calls += 1;
      return [];
    },
  });
  const after = await store.load();

  assert.equal(summary.real_run_opted_in, false);
  assert.equal(summary.actual_writes, 0);
  assert.equal(summary.errors[0].message.includes('PRICER_ENRICHMENT_RUN_LLM=true'), true);
  assert.equal(calls, 0);
  assert.equal(after.canonical_enrichment_store.length, 0);
});

test('real pilot records semi-solid product_form as null with run warning', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [{
      canonical_product_id: 'cp_milk_semisolid',
      canonical_display_name: 'Fresh Milk Semi 1L',
      source_example_name: 'Fresh Milk Semi 1L',
    }],
    canonical_enrichment_store: [],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_PILOT_QUERY: 'milk',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      PRICER_ENRICHMENT_PILOT_BATCH_SIZE: '5',
      PRICER_ENRICHMENT_PILOT_NOW: '2026-05-05T10:20:00.000Z',
    },
    canonicalEnrichmentBatchClient: async ({ products }) => products.map((product) => ({
      canonical_product_id: product.canonical_product_id,
      enrichment: buildValidRichEnrichment({
        product_form: 'semi solid',
      }),
    })),
  });
  const after = await store.load();

  assert.equal(summary.actual_writes, 1);
  assert.equal(summary.rejected_count, 0);
  assert.equal(summary.validation_warnings.length, 1);
  assert.deepEqual(summary.validation_warnings[0], {
    canonical_product_id: 'cp_milk_semisolid',
    batch_index: 1,
    field: 'product_form',
    original_value: 'semi solid',
    normalized_value: null,
    reason: 'unsupported_near_miss_product_form',
  });
  assert.equal(after.canonical_enrichment_store[0].enrichment.product_form, null);
});

test('real pilot rejects one invalid item while writing valid siblings', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [
      {
        canonical_product_id: 'cp_good_milk',
        canonical_display_name: 'Fresh Milk 1L',
        source_example_name: 'Fresh Milk 1L',
      },
      {
        canonical_product_id: 'cp_bad_milk',
        canonical_display_name: 'Fresh Milk Bad 1L',
        source_example_name: 'Fresh Milk Bad 1L',
      },
    ],
    canonical_enrichment_store: [],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_PILOT_QUERY: 'milk',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      PRICER_ENRICHMENT_PILOT_BATCH_SIZE: '10',
      PRICER_ENRICHMENT_PILOT_NOW: '2026-05-05T10:25:00.000Z',
    },
    canonicalEnrichmentBatchClient: async ({ products }) => products.map((product) => ({
      canonical_product_id: product.canonical_product_id,
      enrichment: buildValidRichEnrichment(product.canonical_product_id === 'cp_bad_milk'
        ? { product_form: 'foam' }
        : {}),
    })),
  });
  const after = await store.load();

  assert.equal(summary.actual_writes, 1);
  assert.equal(summary.rejected_count, 1);
  assert.deepEqual(summary.rejected_product_ids, ['cp_bad_milk']);
  assert.equal(summary.rejected_items[0].field, 'product_form');
  assert.equal(summary.rejected_items[0].original_value, 'foam');
  assert.equal(summary.rejected_items[0].reason, 'invalid_controlled_value');
  assert.equal(after.canonical_enrichment_store.length, 1);
  assert.equal(after.canonical_enrichment_store[0].canonical_product_id, 'cp_good_milk');
});

test('real pilot rejects a globally invalid batch shape without writing any siblings', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [
      {
        canonical_product_id: 'cp_shape_milk_a',
        canonical_display_name: 'Fresh Milk A 1L',
        source_example_name: 'Fresh Milk A 1L',
      },
      {
        canonical_product_id: 'cp_shape_milk_b',
        canonical_display_name: 'Fresh Milk B 1L',
        source_example_name: 'Fresh Milk B 1L',
      },
    ],
    canonical_enrichment_store: [],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_PILOT_QUERY: 'milk',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      PRICER_ENRICHMENT_PILOT_BATCH_SIZE: '10',
    },
    canonicalEnrichmentBatchClient: async () => ({ not_products: [] }),
  });
  const after = await store.load();

  assert.equal(summary.actual_writes, 0);
  assert.equal(summary.rejected_count, 2);
  assert.deepEqual(summary.rejected_product_ids.sort(), ['cp_shape_milk_a', 'cp_shape_milk_b']);
  assert.equal(summary.rejected_items.every((entry) => entry.reason === 'batch_validation_error'), true);
  assert.equal(after.canonical_enrichment_store.length, 0);
});

test('enrichment healthcheck validates provider config without making a live request by default', async () => {
  let fetchCalls = 0;
  const summary = await runCanonicalEnrichmentHealthcheck({
    env: {
      XAI_API_KEY: 'test-key',
      PRICER_ENRICHMENT_MODEL: 'test-model',
      PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('should not call fetch in config-only healthcheck');
    },
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.provider, 'xai');
  assert.equal(summary.endpoint, 'https://api.x.ai/v1/chat/completions');
  assert.equal(summary.endpoint_host, 'api.x.ai');
  assert.equal(summary.model, 'test-model');
  assert.equal(summary.api_key_present, true);
  assert.equal(summary.live_request_made, false);
  assert.equal(fetchCalls, 0);
});

test('enrichment healthcheck reports missing API key without printing secrets or calling fetch', async () => {
  let fetchCalls = 0;
  const summary = await runCanonicalEnrichmentHealthcheck({
    env: {
      PRICER_ENRICHMENT_MODEL: 'test-model',
      PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('should not call fetch when config is invalid');
    },
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.api_key_present, false);
  assert.equal(summary.errors.some((entry) => entry.message === 'XAI_API_KEY is missing'), true);
  assert.equal(JSON.stringify(summary).includes('test-key'), false);
  assert.equal(fetchCalls, 0);
});

test('provider config uses PRICER_ENRICHMENT_MODEL fallback for real pilot calls', () => {
  const config = buildEnrichmentLlmProviderConfig({
    XAI_API_KEY: 'test-key',
    PRICER_ENRICHMENT_MODEL: 'fallback-model',
    PRICER_ENRICHMENT_ENDPOINT: 'https://example.test/v1/chat/completions',
  });

  assert.equal(config.provider, 'xai');
  assert.equal(config.endpoint_host, 'example.test');
  assert.equal(config.model, 'fallback-model');
  assert.equal(config.api_key_present, true);
  assert.equal(config.endpoint_valid, true);
});

test('real pilot request reports network fetch failure cause details', async () => {
  const networkError = new TypeError('fetch failed', {
    cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.x.ai'), { code: 'ENOTFOUND' }),
  });

  await assert.rejects(
    () => requestCanonicalEnrichmentBatch({
      prompt: { products: [] },
      products: [],
      env: {
        XAI_API_KEY: 'test-key',
        PRICER_ENRICHMENT_MODEL: 'test-model',
        PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
      },
      batchIndex: 2,
      fetchImpl: async () => {
        throw networkError;
      },
    }),
    (error) => {
      assert.equal(error.error_type, 'provider_network_error');
      assert.equal(error.provider, 'xai');
      assert.equal(error.endpoint_host, 'api.x.ai');
      assert.equal(error.model, 'test-model');
      assert.equal(error.batch_index, 2);
      assert.equal(error.cause.code, 'ENOTFOUND');
      return true;
    }
  );
});

test('real pilot request reports non-2xx status and response body', async () => {
  await assert.rejects(
    () => requestCanonicalEnrichmentBatch({
      prompt: { products: [] },
      products: [],
      env: {
        XAI_API_KEY: 'test-key',
        XAI_GROK_MODEL: 'test-model',
        XAI_GROK_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
      },
      batchIndex: 1,
      fetchImpl: async () => new Response('{"error":"bad model"}', {
        status: 400,
        statusText: 'Bad Request',
      }),
    }),
    (error) => {
      assert.equal(error.error_type, 'provider_http_error');
      assert.equal(error.status, 400);
      assert.equal(error.status_text, 'Bad Request');
      assert.match(error.response_body, /bad model/);
      return true;
    }
  );
});

test('pilot skips existing same canonical id name hash and v2 version', async () => {
  const product = {
    canonical_product_id: 'cp_cola',
    canonical_display_name: 'Coca-Cola Original 1L',
    source_example_name: 'Coca-Cola Original 1L',
    canonical_brand: 'Coca-Cola',
  };
  const hash = require('node:crypto')
    .createHash('sha256')
    .update('cp_cola|Coca-Cola Original 1L|Coca-Cola Original 1L')
    .digest('hex');
  const store = new InMemoryDataBackboneStore({
    canonical_products: [product],
    canonical_enrichment_store: [{
      canonical_fingerprint: 'cp_cola',
      canonical_product_id: 'cp_cola',
      canonical_name_hash: hash,
      enrichment_version: RICH_CANONICAL_ENRICHMENT_VERSION,
      enrichment: buildValidRichEnrichment({
        canonical_name_hash: hash,
        base_product: 'cola',
        category_l2: 'Beverages',
        category_l3: 'Soft Drinks',
        category_l4: null,
        category: 'beverages',
        subcategory: 'soft drinks',
        product_family: 'beverages',
        product_type: 'soft drink',
        brand: 'Coca-Cola',
        brand_normalized: 'coca-cola',
        flavor: ['cola'],
        flavor_terms: ['cola'],
        attributes: ['sparkling'],
        allergens: [],
        usage_context: ['refreshment'],
        is_beverage: true,
        dairy_type: 'unknown',
        milk_source: 'unknown',
        fat_percent: null,
        uht_or_fresh: 'unknown',
        low_fat: null,
        beverage_type: 'cola',
        carbonated: true,
        caffeine_related: true,
      }),
    }],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_PILOT_QUERY: 'cola',
      PRICER_ENRICHMENT_DRY_RUN: 'true',
      PRICER_ENRICHMENT_PILOT_LIMIT: '5',
    },
  });

  assert.equal(summary.selected_count, 0);
  assert.equal(summary.skipped_same_cache_count, 1);
  assert.equal(summary.quality_report.skipped_same_cache_count, 1);
});

test('real pilot updates only canonical_enrichment_store when explicitly opted in', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [{
      canonical_product_id: 'cp_cola',
      canonical_display_name: 'Coca-Cola Original 1L',
      source_example_name: 'Coca-Cola Original 1L',
      canonical_brand: 'Coca-Cola',
    }],
    canonical_product_mappings: [{
      source_product_id: 'sp_cola',
      canonical_product_id: 'cp_cola',
    }],
    source_products: [{
      source_product_id: 'sp_cola',
      latest_product_name_raw: 'Coca-Cola Original 1L',
    }],
    canonical_enrichment_store: [],
  });
  const before = await store.load();
  const immutableBefore = JSON.parse(JSON.stringify({
    canonical_products: before.canonical_products,
    canonical_product_mappings: before.canonical_product_mappings,
    source_products: before.source_products,
  }));

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_PILOT_QUERY: 'cola',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      PRICER_ENRICHMENT_PILOT_LIMIT: '5',
      PRICER_ENRICHMENT_PILOT_NOW: '2026-05-05T10:00:00.000Z',
    },
    canonicalEnrichmentBatchClient: async ({ products }) => products.map((product) => ({
      canonical_product_id: product.canonical_product_id,
      enrichment: buildValidEnrichment({
        base_product: 'cola',
        product_type: 'soft drink',
        product_family: 'beverages',
        category_l2: 'Beverages',
        category_l3: 'Soft Drinks',
        category_l4: null,
        brand: 'Coca-Cola',
        brand_normalized: 'coca-cola',
        product_line: 'Coca-Cola',
        flavor: ['cola'],
        flavor_terms: ['cola'],
        attributes: [],
        allergens: [],
        product_form: 'liquid',
        packaging: 'bottle',
        usage_context: ['refreshment'],
        search_aliases_bg: ['\u043a\u043e\u043a\u0430 \u043a\u043e\u043b\u0430', '\u043a\u043e\u043a\u0430-\u043a\u043e\u043b\u0430', '\u043a\u043e\u043b\u0430'],
        search_aliases_en: ['coca cola', 'coca-cola', 'coke', 'cola'],
        is_beverage: true,
      }),
    })),
  });
  const after = await store.load();

  assert.equal(summary.actual_writes, 1);
  assert.equal(summary.rejected_count, 0);
  assert.equal(after.canonical_enrichment_store.length, 1);
  assert.equal(after.canonical_enrichment_store[0].canonical_fingerprint, 'cp_cola');
  assert.equal(after.canonical_enrichment_store[0].enrichment.product_type, 'soft drink');
  assert.deepEqual({
    canonical_products: after.canonical_products,
    canonical_product_mappings: after.canonical_product_mappings,
    source_products: after.source_products,
  }, immutableBefore);
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
