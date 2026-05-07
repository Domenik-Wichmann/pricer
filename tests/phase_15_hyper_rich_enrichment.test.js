const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  CANONICAL_SEMANTIC_V3_VERSION,
  ENRICHMENT_PROMPT_VERSION,
  InMemoryDataBackboneStore,
  RICH_CANONICAL_ENRICHMENT_VERSION,
  buildBatchEnrichmentPrompt,
  buildCanonicalSemanticV3BatchPrompt,
  buildProviderResponseFormat,
  buildEnrichmentLlmProviderConfig,
  buildLlmRetryConfig,
  buildRegistryContext,
  buildRichCanonicalEnrichmentBatchPrompt,
  buildEnrichmentPrompt,
  buildSeedSemanticTermRegistry,
  createSemanticTermId,
  extractExplicitDietAndAttributeTags,
  getEnrichmentByFingerprint,
  handleSearchCanonicalProductsRequest,
  importDailySnapshotCsvStream,
  inferPriceNormalization,
  normalizeDietOrAttributeTag,
  requestCanonicalEnrichmentBatch,
  runCanonicalEnrichmentHealthcheck,
  runCanonicalEnrichmentPilot,
  selectEnrichmentPilotCandidates,
  storeEnrichment,
  validateCanonicalSemanticV3BatchResponse,
  validateCanonicalSemanticV3Enrichment,
  validateEnrichmentResponse,
  validateRichCanonicalEnrichmentBatchResponse,
  validateRichCanonicalEnrichmentResponse,
} = require('../app/functions/src');
const { SOURCE_HEADERS } = require('../app/functions/src/phase1/constants');
const {
  debugCanonicalEnrichment,
  parseArgs: parseDebugEnrichmentArgs,
} = require('../scripts/debug_canonical_enrichment');

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

function phase15ProductFixture(id, name, productType = null, brand = null) {
  return {
    canonical_product_id: id,
    canonical_display_name: name,
    canonical_brand: brand,
    canonical_product_type: productType,
    canonical_category_code: null,
    canonical_attributes_json: JSON.stringify({}),
    source_example_name: name,
    source_product_count: 1,
  };
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

function buildValidV3Enrichment(product, overrides = {}) {
  const productId = product.canonical_product_id;
  return {
    schema_version: CANONICAL_SEMANTIC_V3_VERSION,
    product_identity: {
      canonical_product_id: productId,
      canonical_name_hash: canonicalNameHashForTest(product),
      observed_name: product.canonical_display_name || product.source_example_name || null,
      observed_brand: product.canonical_brand || null,
      brand_confidence: product.canonical_brand ? 0.9 : null,
      brand_needs_review: false,
    },
    taxonomy_classification: buildValidTaxonomyClassification({
      labels: ['Grocery', 'Dairy', 'Yogurt'],
      termLabels: ['grocery', 'dairy', 'yogurt'],
      rawTerms: ['dairy', 'yogurt'],
      evidence: ['yogurt product name'],
    }),
    category: {
      raw_terms: ['dairy'],
      category_path_raw: ['food', 'dairy', 'yogurt'],
      registry_matches: [{
        domain: 'food_category',
        term_id: createSemanticTermId('food_category', 'dairy'),
        canonical_label: 'dairy',
        confidence: 0.9,
        evidence: ['dairy wording'],
      }],
      proposed_terms: [],
      search_buckets: ['dairy'],
      needs_review: false,
    },
    packaging: {
      raw_terms: ['\u043a\u043e\u0444\u0438\u0447\u043a\u0430'],
      description: 'small plastic yogurt cup/tub',
      registry_match: {
        domain: 'packaging',
        term_id: createSemanticTermId('packaging', 'tub'),
        canonical_label: 'tub',
        confidence: 0.91,
        evidence: ['\u043a\u043e\u0444\u0438\u0447\u043a\u0430'],
      },
      proposed_aliases: ['\u043a\u043e\u0444\u0438\u0447\u043a\u0430'],
      proposed_new_term: null,
      search_bucket: 'tub',
      confidence: 0.91,
      needs_review: false,
      evidence: ['\u043a\u043e\u0444\u0438\u0447\u043a\u0430'],
    },
    product_form: {
      raw_terms: ['semi-solid'],
      description: 'semi-solid cultured dairy texture',
      registry_match: {
        domain: 'product_form',
        term_id: createSemanticTermId('product_form', 'semi-solid'),
        canonical_label: 'semi-solid',
        confidence: 0.8,
        evidence: ['semi-solid'],
      },
      proposed_aliases: [],
      proposed_new_term: null,
      search_bucket: 'semi-solid',
      confidence: 0.8,
      needs_review: false,
      evidence: ['semi-solid'],
    },
    attributes: {
      dairy: { dairy_type: 'yogurt', milk_source: 'cow' },
      personal_care: {},
      beverage: {},
      household: {},
      nutrition_claims: [],
      dietary_claims: [],
      flavor_terms: [],
      preparation_state: [],
      storage: { storage_type: 'refrigerated' },
      quantity: {},
    },
    semantic_usage_profile: buildValidSemanticUsageProfile(),
    semantic_embedding_summary: buildValidSemanticEmbeddingSummary(),
    registry_actions: [{
      action: 'propose_alias',
      domain: 'packaging',
      existing_term_id: createSemanticTermId('packaging', 'tub'),
      proposed_label: null,
      proposed_alias: '\u043a\u043e\u0444\u0438\u0447\u043a\u0430',
      parent_term_id: null,
      confidence: 0.91,
      evidence: ['\u043a\u043e\u0444\u0438\u0447\u043a\u0430'],
      reason: 'Bulgarian raw term is used for a small yogurt tub/cup in this product name.',
    }],
    warnings: [],
    confidence_overall: 0.88,
    needs_human_review: false,
    ...overrides,
  };
}

function buildValidTaxonomyClassification({
  labels = ['Grocery'],
  termLabels = ['grocery'],
  rawTerms = [],
  proposedTerms = [],
  confidence = 0.9,
  needsReview = false,
  evidence = ['taxonomy supported by product name'],
} = {}) {
  const termIds = labels.map((label, index) => {
    const termLabel = termLabels[index];
    return termLabel ? createSemanticTermId('product_taxonomy', termLabel) : null;
  });
  return {
    taxonomy_path_raw: labels,
    taxonomy_path_term_ids: termIds,
    taxonomy_path_labels: labels,
    primary_taxonomy_term_id: termIds[termIds.length - 1] || null,
    primary_taxonomy_label: labels[labels.length - 1] || null,
    raw_category_terms: rawTerms,
    registry_matches: labels.map((label, index) => ({
      domain: 'product_taxonomy',
      term_id: termIds[index],
      canonical_label: termLabels[index] || label,
      confidence,
      evidence: [label],
    })).filter((match) => match.term_id),
    proposed_terms: proposedTerms,
    confidence,
    needs_review: needsReview,
    evidence,
  };
}

function buildValidSemanticUsageProfile(overrides = {}) {
  return {
    cuisine_contexts: [],
    flavor_profile: {
      primary_tastes: ['tangy'],
      descriptors: ['creamy', 'mild'],
      intensity: 'mild',
    },
    culinary_roles: ['ingredient', 'dairy base'],
    dish_roles: [],
    meal_contexts: ['breakfast', 'snack', 'cooking'],
    common_uses: ['eat plain', 'use in sauces', 'use in baking', 'serve with fruit'],
    preparation_contexts: ['no preparation required'],
    pairing_suggestions: ['fruit', 'honey', 'cereal'],
    substitute_terms: ['sour cream'],
    consumer_search_intents: ['yogurt', 'plain yogurt', '\u043a\u0438\u0441\u0435\u043b\u043e \u043c\u043b\u044f\u043a\u043e'],
    not_for: [],
    confidence: 0.82,
    evidence: ['yogurt wording'],
    needs_review: false,
    ...overrides,
  };
}

function buildValidSemanticEmbeddingSummary(overrides = {}) {
  return {
    summary: 'Bulgarian-style yogurt (кисело мляко) in a 400 g tub, a tangy creamy fermented cow-milk dairy product for breakfast, snacks, sauces, baking, marinades, and Balkan-style cooking. Search-relevant contexts include yogurt, dairy, fermented milk, tangy creamy ingredient, breakfast, Balkan cuisine, sauce base, and cooking ingredient.',
    summary_language: 'mixed',
    included_aspects: [
      'product_type',
      'packaging_quantity',
      'category_form_storage',
      'flavor_texture_profile',
      'cuisine_context',
      'ingredients',
      'common_use_cases',
      'consumer_search_meaning',
    ],
    evidence: ['yogurt wording', '400 g', 'tub'],
    confidence: 0.84,
    needs_review: false,
    ...overrides,
  };
}

function canonicalNameHashForTest(product) {
  return require('node:crypto')
    .createHash('sha256')
    .update([
      product?.canonical_product_id || '',
      product?.canonical_display_name || '',
      product?.source_example_name || '',
    ].join('|'))
    .digest('hex');
}

function buildProviderSuccessResponse(content = { products: [] }) {
  return new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify(content),
      },
    }],
  }), { status: 200 });
}

function buildSocketClosedError() {
  return new TypeError('fetch failed', {
    cause: Object.assign(new Error('other side closed'), {
      name: 'SocketError',
      code: 'UND_ERR_SOCKET',
    }),
  });
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

test('price normalization infers selling units without fake package quantities', () => {
  const chicken = inferPriceNormalization({
    canonicalProduct: {
      canonical_display_name: '\u041f\u0438\u043b\u0435\u0448\u043a\u043e \u0444\u0438\u043b\u0435 \u043e\u0445\u043b\u0430\u0434\u0435\u043d\u043e',
      source_example_name: '\u041f\u0438\u043b\u0435\u0448\u043a\u043e \u0444\u0438\u043b\u0435 \u043e\u0445\u043b\u0430\u0434\u0435\u043d\u043e',
      canonical_attributes_json: JSON.stringify({}),
    },
  });
  assert.equal(chicken.explicit_quantity_detected, false);
  assert.equal(chicken.inferred_selling_unit, 'kg');
  assert.equal(chicken.comparison_basis, 'per_kg');
  assert.equal(chicken.explicit_quantity, null);
  assert.equal(chicken.price_per_comparison_basis, null);

  const produce = inferPriceNormalization({
    canonicalProduct: {
      canonical_display_name: '\u0414\u043e\u043c\u0430\u0442\u0438 \u0440\u043e\u0437\u043e\u0432\u0438',
      source_example_name: '\u0414\u043e\u043c\u0430\u0442\u0438 \u0440\u043e\u0437\u043e\u0432\u0438',
      canonical_product_type: 'produce',
      canonical_attributes_json: JSON.stringify({}),
    },
  });
  assert.equal(produce.explicit_quantity_detected, false);
  assert.equal(produce.inferred_selling_unit, 'kg');
  assert.equal(produce.comparison_basis, 'per_kg');

  const cheese = inferPriceNormalization({
    canonicalProduct: {
      canonical_display_name: '\u0421\u0438\u0440\u0435\u043d\u0435 400\u0433\u0440',
      source_example_name: '\u0421\u0438\u0440\u0435\u043d\u0435 400\u0433\u0440',
      canonical_attributes_json: JSON.stringify({
        size_marker: {
          raw_text: '400\u0433\u0440',
          quantity: 400,
          unit: 'g',
          total_quantity: 400,
          total_unit: 'g',
          normalized_display: '400 g',
        },
      }),
    },
    currentPrice: 4.8,
  });
  assert.equal(cheese.explicit_quantity_detected, true);
  assert.equal(cheese.explicit_quantity.total_quantity, 400);
  assert.equal(cheese.comparison_basis, 'per_kg');
  assert.equal(cheese.price_per_comparison_basis, 12);

  const shampoo = inferPriceNormalization({
    canonicalProduct: {
      canonical_display_name: '\u0428\u0430\u043c\u043f\u043e\u0430\u043d 250\u043c\u043b',
      source_example_name: '\u0428\u0430\u043c\u043f\u043e\u0430\u043d 250\u043c\u043b',
      canonical_attributes_json: JSON.stringify({
        size_marker: {
          raw_text: '250\u043c\u043b',
          quantity: 250,
          unit: 'ml',
          total_quantity: 250,
          total_unit: 'ml',
          normalized_display: '250 ml',
        },
      }),
    },
    currentPrice: 3.5,
  });
  assert.equal(shampoo.explicit_quantity_detected, true);
  assert.equal(shampoo.comparison_basis, 'per_liter');
  assert.equal(shampoo.price_per_comparison_basis, 14);

  const ambiguous = inferPriceNormalization({
    canonicalProduct: {
      canonical_display_name: 'Premium breakfast classic',
      source_example_name: 'Premium breakfast classic',
      canonical_attributes_json: JSON.stringify({}),
    },
  });
  assert.equal(ambiguous.inferred_selling_unit, 'unknown');
  assert.equal(ambiguous.comparison_basis, 'unknown');
  assert.equal(ambiguous.needs_uom_review, true);
});

test('base-product selection weights rank raw chicken above processed baby puree', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [
      phase15ProductFixture('cp_baby_chicken_puree', '\u0411\u0435\u0431\u0435\u0448\u043a\u043e \u043f\u044e\u0440\u0435 \u0441 \u043f\u0438\u043b\u0435\u0448\u043a\u043e \u043c\u0435\u0441\u043e 190 \u0433', 'baby_food'),
      phase15ProductFixture('cp_raw_chicken_fillet', '\u041f\u0418\u041b\u0415\u0428\u041a\u041e \u0424\u0418\u041b\u0415 \u041e\u0425\u041b\u0410\u0414\u0415\u041d\u041e', 'chicken'),
    ],
    canonical_enrichment_store: [],
    gap_signal_store: [],
  });

  const response = await handleSearchCanonicalProductsRequest({
    store,
    body: { query: '\u043f\u0438\u043b\u0435\u0448\u043a\u043e', limit: 5 },
  });
  const babyPuree = response.body.results.find((item) => item.canonical_product_id === 'cp_baby_chicken_puree');

  assert.equal(response.status, 200);
  assert.equal(response.body.results[0].canonical_product_id, 'cp_raw_chicken_fillet');
  assert.equal(response.body.results[0].search_debug.guardrail_reasons.includes('base_product_boost'), true);
  assert.equal(babyPuree.search_debug.guardrail_reasons.includes('processed_product_demotion'), true);
  assert.equal(babyPuree.search_debug.guardrail_reasons.includes('baby_food_demotion'), true);
  assert.equal(babyPuree.search_debug.demotion_reason, 'processed_product_demotion');
});

test('rich enrichment accepts generalized product taxonomy paths beyond dairy food', () => {
  const cases = [
    ['shampoo', 'Personal Care', 'Hair Care', 'Shampoo', { is_food: false, is_personal_care: true, likely_dairy: false }],
    ['conditioner', 'Personal Care', 'Hair Care', 'Conditioner', { is_food: false, is_personal_care: true, likely_dairy: false }],
    ['yogurt', 'Food & Beverage', 'Dairy', 'Yogurt', { dairy_type: 'yogurt' }],
    ['sirene', 'Food & Beverage', 'Dairy', 'Sirene', { dairy_type: 'sirene' }],
    ['beef', 'Food & Beverage', 'Meat', 'Beef', { likely_meat: true, likely_dairy: false }],
    ['bread', 'Food & Beverage', 'Bakery', 'Bread', { likely_dairy: false, gluten_related: true }],
    ['vacuum cleaner', 'Home Appliances', 'Cleaning Appliances', 'Vacuum Cleaner', { is_food: false, likely_dairy: false }],
  ];

  cases.forEach(([baseProduct, categoryL1, categoryL2, categoryL3, overrides]) => {
    const normalized = validateRichCanonicalEnrichmentResponse(buildValidRichEnrichment({
      base_product: baseProduct,
      product_type: baseProduct,
      product_family: categoryL2,
      category: categoryL2,
      subcategory: categoryL3,
      category_l1: categoryL1,
      category_l2: categoryL2,
      category_l3: categoryL3,
      category_l4: null,
      category_path: [categoryL1, categoryL2, categoryL3],
      is_beverage: false,
      dairy_type: 'unknown',
      milk_source: 'unknown',
      fat_percent: null,
      uht_or_fresh: 'unknown',
      lactose_free: null,
      plain_or_flavored: 'unknown',
      ...overrides,
    }));

    assert.equal(normalized.category_l1, categoryL1.toLowerCase());
    assert.equal(normalized.category_l2, categoryL2.toLowerCase());
    assert.equal(normalized.category_l3, categoryL3.toLowerCase());
  });
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

test('v3 prompt includes exact schema, registry context, and flexible vocabulary rules', () => {
  const products = [{
    canonical_product_id: 'cp_yogurt_cup',
    canonical_display_name: '\u0419\u043e\u0433\u0443\u0440\u0442 \u043a\u043e\u0444\u0438\u0447\u043a\u0430 400 \u0433',
    source_example_name: '\u0419\u043e\u0433\u0443\u0440\u0442 \u043a\u043e\u0444\u0438\u0447\u043a\u0430 400 \u0433',
  }];
  const prompt = buildCanonicalSemanticV3BatchPrompt(products);

  assert.equal(prompt.enrichment_version, CANONICAL_SEMANTIC_V3_VERSION);
  assert.equal(prompt.response_json_schema.required.includes('products'), true);
  assert.equal(prompt.registry_context.product_category.some((term) => term.canonical_label === 'personal_care'), true);
  assert.equal(prompt.registry_context.product_category.some((term) => term.canonical_label === 'shampoo'), true);
  assert.equal(prompt.registry_context.packaging.some((term) => term.canonical_label === 'tub'), true);
  assert.equal(prompt.registry_context.product_form.some((term) => term.canonical_label === 'semi_solid'), true);
  assert.equal(prompt.strict_output_rules.some((rule) => rule.includes('Do not add extra top-level keys')), true);
  assert.equal(prompt.semantic_rules.some((rule) => rule.includes('Do not force')), true);
  assert.equal(prompt.semantic_rules.some((rule) => rule.includes('proposed_alias')), true);
  assert.equal(prompt.semantic_rules.some((rule) => rule.includes('semantic_usage_profile')), true);
  assert.equal(prompt.semantic_rules.some((rule) => rule.includes('semantic_embedding_summary')), true);
  assert.equal(prompt.semantic_rules.some((rule) => rule.includes('Use taxonomy_classification')), true);
  assert.equal(prompt.semantic_rules.some((rule) => rule.includes('taxonomy_classification.registry_matches must contain only product_taxonomy')), true);
  assert.equal(prompt.semantic_rules.some((rule) => rule.includes('Do not use food_category for non-food products')), true);
  assert.equal(prompt.semantic_rules.some((rule) => rule.includes('Personal Care > Hair Care > Shampoo')), true);
  assert.equal(prompt.semantic_rules.some((rule) => rule.includes('Garden & Outdoor > Garden Tools > Shovels')), true);
  assert.equal(prompt.semantic_rules.some((rule) => rule.includes('attributes.personal_care')), true);
  assert.equal(prompt.semantic_rules.some((rule) => rule.includes('explicit or strongly implied ingredients')), true);
  assert.equal(prompt.semantic_embedding_summary_guidance.shape.summary.includes('120 words'), true);
  assert.equal(prompt.semantic_embedding_summary_guidance.shape.included_aspects.includes('ingredients'), true);
  assert.equal(prompt.semantic_rules.some((rule) => rule.includes('Do not invent specific claims')), true);
  assert.equal(prompt.evidence_limits.max_items_per_evidence_array, 3);
  assert.equal(prompt.semantic_usage_profile_guidance.conservative_examples.yogurt.common_uses.includes('use in sauces'), true);
  assert.equal(prompt.semantic_embedding_summary_guidance.examples.sirene.includes('made from milk'), true);
  assert.equal(prompt.semantic_embedding_summary_guidance.examples.kashkaval.includes('melting/grating texture'), true);
  assert.equal(
    prompt.response_json_schema.properties.products.items.properties.enrichment.properties.semantic_usage_profile
      .properties.flavor_profile.properties.descriptors.type,
    'array'
  );
  assert.equal(
    prompt.response_json_schema.properties.products.items.properties.enrichment.properties.semantic_embedding_summary
      .properties.evidence.maxItems,
    3
  );
  const attributeSchema = prompt.response_json_schema.properties.products.items.properties.enrichment
    .properties.attributes.properties;
  assert.equal(attributeSchema.personal_care.type, 'object');
  assert.equal(attributeSchema.household.type, 'object');
  const taxonomyMatchSchema = prompt.response_json_schema.properties.products.items.properties.enrichment
    .properties.taxonomy_classification.properties.registry_matches.items;
  assert.deepEqual(taxonomyMatchSchema.properties.domain.enum, ['product_taxonomy']);
});

test('v3 pilot prompt uses bounded relevant registry context and response_format schema transport', () => {
  const products = [{
    canonical_product_id: 'cp_plain_milk_v3_prompt',
    canonical_display_name: 'Fresh Milk 1L',
    source_example_name: 'Fresh Milk 1L',
    pilot_match: {
      groups: ['milk_dairy_eval'],
      matched_terms: ['milk'],
      selection_reasons: ['query_term_match'],
    },
  }];
  const batch = buildBatchEnrichmentPrompt(products, {
    enrichmentVersion: CANONICAL_SEMANTIC_V3_VERSION,
    env: {
      PRICER_REGISTRY_CONTEXT_MAX_TERMS_PER_DOMAIN: '3',
      PRICER_REGISTRY_CONTEXT_MAX_TOTAL_TERMS: '10',
    },
  });
  const domains = Object.keys(batch.prompt.registry_context)
    .filter((domain) => batch.prompt.registry_context[domain].length > 0);
  const termCount = Object.values(batch.prompt.registry_context)
    .reduce((total, terms) => total + terms.length, 0);

  assert.equal(batch.prompt.response_json_schema, undefined);
  assert.equal(batch.prompt.response_schema_transport, 'response_format.json_schema');
  assert.equal(batch.prompt.strict_output_rules.some((rule) => rule.includes('response_format json_schema')), true);
  assert.equal(batch.prompt.semantic_embedding_summary_guidance.examples, undefined);
  assert.equal(domains.includes('dairy_type'), true);
  assert.equal(domains.includes('milk_source'), true);
  assert.equal(domains.includes('flavor'), false);
  assert.equal(domains.includes('dietary_claim'), false);
  assert.equal(termCount <= 10, true);
  assert.equal(batch.prompt.registry_context.dairy_type.every((term) => term.status === 'active'), true);
});

test('v3 validation preserves messy raw terms without forcing unsafe buckets', () => {
  const product = {
    canonical_product_id: 'cp_packeted_yogurt',
    canonical_display_name: '\u0419\u043e\u0433\u0443\u0440\u0442 \u043f\u0430\u043a\u0435\u0442\u0438\u0440\u0430\u043d\u043e \u043a\u043e\u0444\u0438\u0447\u043a\u0430',
    source_example_name: '\u0419\u043e\u0433\u0443\u0440\u0442 \u043f\u0430\u043a\u0435\u0442\u0438\u0440\u0430\u043d\u043e \u043a\u043e\u0444\u0438\u0447\u043a\u0430',
  };
  const enrichment = buildValidV3Enrichment(product, {
    packaging: {
      ...buildValidV3Enrichment(product).packaging,
      raw_terms: ['\u043f\u0430\u043a\u0435\u0442\u0438\u0440\u0430\u043d\u043e', '\u043a\u043e\u0444\u0438\u0447\u043a\u0430'],
      registry_match: null,
      proposed_aliases: [],
      proposed_new_term: null,
      search_bucket: null,
      needs_review: true,
      evidence: ['\u043f\u0430\u043a\u0435\u0442\u0438\u0440\u0430\u043d\u043e may mean packaged rather than packet'],
    },
    needs_human_review: true,
    warnings: ['Packaging wording preserved without unsafe packet mapping.'],
    registry_actions: [{
      action: 'needs_review',
      domain: 'packaging',
      existing_term_id: null,
      proposed_label: null,
      proposed_alias: null,
      parent_term_id: null,
      confidence: 0.7,
      evidence: ['\u043f\u0430\u043a\u0435\u0442\u0438\u0440\u0430\u043d\u043e'],
      reason: 'Term may indicate packaged state rather than packet packaging.',
    }],
  });
  const validated = validateCanonicalSemanticV3BatchResponse({
    products: [{ canonical_product_id: product.canonical_product_id, enrichment }],
  }, { products: [product] });

  assert.equal(validated[0].enrichment.packaging.raw_terms.includes('\u043f\u0430\u043a\u0435\u0442\u0438\u0440\u0430\u043d\u043e'), true);
  assert.equal(validated[0].enrichment.packaging.registry_match, null);
  assert.equal(validated[0].enrichment.packaging.needs_review, true);
});

test('v3 taxonomy maps shampoo through product_category and rejects non-food food_category proposals', () => {
  const product = {
    canonical_product_id: 'cp_shampoo_v3_taxonomy',
    canonical_display_name: 'Herbal Shampoo 400 ml',
    source_example_name: 'Herbal Shampoo 400 ml',
  };
  const category = {
    raw_terms: ['personal care', 'hair care', 'shampoo'],
    category_path_raw: ['Personal Care', 'Hair Care', 'Shampoo'],
    registry_matches: [
      {
        domain: 'product_category',
        term_id: createSemanticTermId('product_category', 'personal_care'),
        canonical_label: 'personal_care',
        confidence: 0.94,
        evidence: ['shampoo'],
      },
      {
        domain: 'product_category',
        term_id: createSemanticTermId('product_category', 'hair_care'),
        canonical_label: 'hair_care',
        confidence: 0.93,
        evidence: ['shampoo'],
      },
      {
        domain: 'product_category',
        term_id: createSemanticTermId('product_category', 'shampoo'),
        canonical_label: 'shampoo',
        confidence: 0.96,
        evidence: ['Shampoo'],
      },
    ],
    proposed_terms: [],
    search_buckets: ['personal care', 'hair care', 'shampoo'],
    needs_review: false,
  };
  const enrichment = buildValidV3Enrichment(product, {
    category,
    attributes: {
      dairy: {},
      personal_care: {
        target_hair_type: 'normal hair',
        target_skin_type: null,
        scent: 'herbal',
        active_claims: ['cleansing'],
        use_area: 'hair',
      },
      beverage: {},
      household: {},
      nutrition_claims: [],
      dietary_claims: [],
      flavor_terms: [],
      preparation_state: [],
      storage: {},
      quantity: { total_quantity: 400, total_unit: 'ml' },
    },
    registry_actions: [{
      action: 'use_existing',
      domain: 'product_category',
      existing_term_id: createSemanticTermId('product_category', 'shampoo'),
      proposed_label: null,
      proposed_alias: null,
      parent_term_id: createSemanticTermId('product_category', 'hair_care'),
      confidence: 0.96,
      evidence: ['Shampoo'],
      reason: 'shampoo is a hair care product',
    }],
  });

  const normalized = validateCanonicalSemanticV3Enrichment(enrichment, { canonicalProduct: product });
  assert.deepEqual(normalized.category.category_path_raw, ['personal care', 'hair care', 'shampoo']);
  assert.equal(normalized.category.registry_matches[0].domain, 'product_category');
  assert.equal(normalized.attributes.dairy.dairy_type, undefined);
  assert.equal(normalized.attributes.personal_care.use_area, 'hair');
  assert.deepEqual(normalized.attributes.personal_care.active_claims, ['cleansing']);

  assert.throws(
    () => validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(product, {
      category: {
        ...category,
        registry_matches: [{
          domain: 'food_category',
          term_id: createSemanticTermId('food_category', 'hair_care'),
          canonical_label: 'hair_care',
          confidence: 0.9,
          evidence: ['bad shampoo category'],
        }],
      },
    }), { canonicalProduct: product }),
    /food_category cannot contain non-food term/
  );

  assert.throws(
    () => validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(product, {
      registry_actions: [{
        action: 'propose_new_term',
        domain: 'food_category',
        existing_term_id: null,
        proposed_label: 'hair care',
        proposed_alias: null,
        parent_term_id: null,
        confidence: 0.8,
        evidence: ['bad proposal'],
        reason: 'hair care is not food',
      }],
    }), { canonicalProduct: product }),
    /invalid action or domain/
  );
});

test('v3 taxonomy_classification accepts open registry-backed product taxonomy paths', () => {
  const cases = [
    {
      name: 'soap',
      product: { canonical_product_id: 'cp_tax_soap', canonical_display_name: '\u0421\u0430\u043f\u0443\u043d, \u0442\u0432\u044a\u0440\u0434 \u0422\u0435\u043e \u0431\u0435\u0431\u0435 75\u0433\u0440.' },
      labels: ['Personal Care', 'Bath & Body', 'Soap', 'Bar Soap'],
      termLabels: ['personal_care', 'bath_body', 'soap', 'bar_soap'],
    },
    {
      name: 'shampoo',
      product: { canonical_product_id: 'cp_tax_shampoo', canonical_display_name: '\u0428\u0430\u043c\u043f\u043e\u0430\u043d \u0437\u0430 \u043d\u043e\u0440\u043c\u0430\u043b\u043d\u0430 \u043a\u043e\u0441\u0430 \u0424\u0440\u0443\u043a\u0442\u0438\u0441 250 \u043c\u043b.' },
      labels: ['Personal Care', 'Hair Care', 'Shampoo'],
      termLabels: ['personal_care', 'hair_care', 'shampoo'],
    },
    {
      name: 'chicken fillet',
      product: { canonical_product_id: 'cp_tax_chicken', canonical_display_name: '\u041f\u0418\u041b\u0415\u0428\u041a\u041e \u0424\u0418\u041b\u0415 \u041e\u0425\u041b\u0410\u0414\u0415\u041d\u041e' },
      labels: ['Grocery', 'Meat & Seafood', 'Poultry', 'Chicken', 'Chicken Fillet'],
      termLabels: ['grocery', 'meat_seafood', 'poultry', 'chicken', null],
      proposedTerms: [{
        proposed_label: 'Chicken Fillet',
        parent_term_id: createSemanticTermId('product_taxonomy', 'chicken'),
        parent_label: 'Chicken',
        aliases: ['chicken breast fillet'],
        confidence: 0.88,
        evidence: ['\u041f\u0418\u041b\u0415\u0428\u041a\u041e \u0424\u0418\u041b\u0415'],
        reason: 'Specific cut is not yet seeded.',
      }],
    },
    {
      name: 'bread',
      product: { canonical_product_id: 'cp_tax_bread', canonical_display_name: '\u0425\u043b\u044f\u0431 \u0431\u044f\u043b 700\u0433' },
      labels: ['Grocery', 'Bread & Bakery'],
      termLabels: ['grocery', 'bread_bakery'],
    },
    {
      name: 'motor oil',
      product: { canonical_product_id: 'cp_tax_motor_oil', canonical_display_name: '\u041c\u043e\u0442\u043e\u0440\u043d\u043e \u043c\u0430\u0441\u043b\u043e 5W-30' },
      labels: ['Automotive', 'Car Care', 'Fluids', 'Motor Oil'],
      termLabels: ['automotive', 'car_care', 'fluids', 'motor_oil'],
    },
    {
      name: 'garden shovel',
      product: { canonical_product_id: 'cp_tax_shovel', canonical_display_name: '\u0413\u0440\u0430\u0434\u0438\u043d\u0441\u043a\u0430 \u043b\u043e\u043f\u0430\u0442\u0430' },
      labels: ['Garden & Outdoor', 'Garden Tools', 'Shovels'],
      termLabels: ['garden_outdoor', 'garden_tools', 'shovels'],
    },
  ];

  cases.forEach((fixture) => {
    const enrichment = buildValidV3Enrichment(fixture.product, {
      taxonomy_classification: buildValidTaxonomyClassification({
        labels: fixture.labels,
        termLabels: fixture.termLabels,
        rawTerms: [fixture.name],
        proposedTerms: fixture.proposedTerms || [],
        evidence: [fixture.product.canonical_display_name],
      }),
    });
    const normalized = validateCanonicalSemanticV3Enrichment(enrichment, { canonicalProduct: fixture.product });
    assert.deepEqual(normalized.taxonomy_classification.taxonomy_path_labels, fixture.labels);
    assert.equal(normalized.taxonomy_classification.primary_taxonomy_label, fixture.labels[fixture.labels.length - 1]);
    assert.equal(normalized.taxonomy_classification.taxonomy_path_term_ids.length, fixture.labels.length);
  });
});

test('v3 taxonomy_classification filters misplaced non-product registry matches from chicken run', () => {
  const product = {
    canonical_product_id: 'cp_tax_chicken_run_regression',
    canonical_display_name: '\u041f\u0418\u041b\u0415\u0428\u041a\u041e \u0424\u0418\u041b\u0415 \u041e\u0425\u041b\u0410\u0414\u0415\u041d\u041e',
    source_example_name: '\u041f\u0418\u041b\u0415\u0428\u041a\u041e \u0424\u0418\u041b\u0415 \u041e\u0425\u041b\u0410\u0414\u0415\u041d\u041e',
  };
  const enrichment = buildValidV3Enrichment(product, {
    taxonomy_classification: {
      ...buildValidTaxonomyClassification({
        labels: ['Grocery', 'Meat & Seafood', 'Poultry', 'Chicken'],
        termLabels: ['grocery', 'meat_seafood', 'poultry', 'chicken'],
        rawTerms: ['\u043f\u0438\u043b\u0435\u0448\u043a\u043e', 'chicken fillet'],
        evidence: ['\u041f\u0418\u041b\u0415\u0428\u041a\u041e \u0424\u0418\u041b\u0415'],
      }),
      registry_matches: [
        {
          domain: 'product_taxonomy',
          term_id: createSemanticTermId('product_taxonomy', 'chicken'),
          canonical_label: 'chicken',
          confidence: 0.95,
          evidence: ['\u041f\u0418\u041b\u0415\u0428\u041a\u041e'],
        },
        {
          domain: 'food_category',
          term_id: createSemanticTermId('food_category', 'chicken'),
          canonical_label: 'chicken',
          confidence: 0.9,
          evidence: ['chicken'],
        },
        {
          domain: 'food_category',
          term_id: null,
          canonical_label: null,
          confidence: 0.3,
          evidence: ['ambiguous model spillover'],
        },
      ],
    },
  });

  const normalized = validateCanonicalSemanticV3Enrichment(enrichment, { canonicalProduct: product });
  assert.deepEqual(
    normalized.taxonomy_classification.registry_matches.map((match) => match.domain),
    ['product_taxonomy']
  );
  assert.equal(
    normalized.category.registry_matches.some((match) => match.domain === 'food_category' && match.canonical_label === 'chicken'),
    true
  );
  assert.equal(
    normalized.category.registry_matches.some((match) => match.domain === 'food_category' && !match.term_id && !match.canonical_label),
    false
  );
});

test('v3 taxonomy_classification repairs chicken primary label and term id path mismatches', () => {
  const product = {
    canonical_product_id: 'cp_tax_chicken_primary_repair',
    canonical_display_name: '\u041f\u0418\u041b\u0415\u0428\u041a\u041e \u0424\u0418\u041b\u0415 \u041e\u0425\u041b\u0410\u0414\u0415\u041d\u041e',
    source_example_name: '\u041f\u0418\u041b\u0415\u0428\u041a\u041e \u0424\u0418\u041b\u0415 \u041e\u0425\u041b\u0410\u0414\u0415\u041d\u041e',
  };

  const missingPrimaryLabel = buildValidTaxonomyClassification({
    labels: ['Grocery', 'Meat & Seafood', 'Poultry', 'Chicken'],
    termLabels: ['grocery', 'meat_seafood', 'poultry', 'chicken'],
    rawTerms: ['\u043f\u0438\u043b\u0435\u0448\u043a\u043e \u0444\u0438\u043b\u0435', 'chicken fillet'],
    evidence: ['\u041f\u0418\u041b\u0415\u0428\u041a\u041e \u0424\u0418\u041b\u0415'],
  });
  missingPrimaryLabel.primary_taxonomy_term_id = null;
  missingPrimaryLabel.primary_taxonomy_label = 'Chicken Fillet';
  missingPrimaryLabel.proposed_terms = [{
    proposed_label: 'Chicken Fillet',
    parent_term_id: createSemanticTermId('product_taxonomy', 'chicken'),
    parent_label: 'Chicken',
    aliases: ['chicken breast fillet', '\u043f\u0438\u043b\u0435\u0448\u043a\u043e \u0444\u0438\u043b\u0435'],
    confidence: 0.88,
    evidence: ['\u041f\u0418\u041b\u0415\u0428\u041a\u041e \u0424\u0418\u041b\u0415'],
    reason: 'Specific cut is not yet seeded.',
  }];

  const repairedLabel = validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(product, {
    taxonomy_classification: missingPrimaryLabel,
  }), { canonicalProduct: product }).taxonomy_classification;

  assert.equal(repairedLabel.primary_taxonomy_label, 'Chicken Fillet');
  assert.equal(repairedLabel.taxonomy_path_labels.includes('Chicken Fillet'), true);
  assert.equal(repairedLabel.taxonomy_path_labels.length, repairedLabel.taxonomy_path_term_ids.length);
  assert.equal(repairedLabel.taxonomy_path_raw.length, repairedLabel.taxonomy_path_labels.length);

  const missingPrimaryTermId = buildValidTaxonomyClassification({
    labels: ['Grocery', 'Meat & Seafood', 'Poultry', 'Chicken'],
    termLabels: ['grocery', 'meat_seafood', 'poultry', null],
    rawTerms: ['\u043f\u0438\u043b\u0435\u0448\u043a\u043e', 'chicken'],
    evidence: ['\u041f\u0418\u041b\u0415\u0428\u041a\u041e'],
  });
  missingPrimaryTermId.primary_taxonomy_label = 'Chicken';
  missingPrimaryTermId.primary_taxonomy_term_id = createSemanticTermId('product_taxonomy', 'chicken');

  const repairedTermId = validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(product, {
    taxonomy_classification: missingPrimaryTermId,
  }), { canonicalProduct: product }).taxonomy_classification;

  assert.equal(repairedTermId.primary_taxonomy_label, 'Chicken');
  assert.equal(repairedTermId.primary_taxonomy_term_id, createSemanticTermId('product_taxonomy', 'chicken'));
  assert.equal(
    repairedTermId.taxonomy_path_term_ids[repairedTermId.taxonomy_path_labels.indexOf('Chicken')],
    createSemanticTermId('product_taxonomy', 'chicken')
  );

  const unusablePrimary = buildValidTaxonomyClassification({
    labels: ['Grocery', 'Meat & Seafood', 'Poultry', 'Chicken'],
    termLabels: ['grocery', 'meat_seafood', 'poultry', 'chicken'],
  });
  unusablePrimary.primary_taxonomy_label = null;
  unusablePrimary.primary_taxonomy_term_id = createSemanticTermId('food_category', 'chicken');

  const derivedPrimary = validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(product, {
    taxonomy_classification: unusablePrimary,
  }), { canonicalProduct: product }).taxonomy_classification;

  assert.equal(derivedPrimary.primary_taxonomy_label, 'Chicken');
  assert.equal(derivedPrimary.primary_taxonomy_term_id, createSemanticTermId('product_taxonomy', 'chicken'));
});

test('v3 taxonomy_classification proposes unknown niche terms without failing', () => {
  const product = {
    canonical_product_id: 'cp_tax_unknown_niche',
    canonical_display_name: 'Specialized soldering flux pen',
  };
  const enrichment = buildValidV3Enrichment(product, {
    taxonomy_classification: buildValidTaxonomyClassification({
      labels: ['Tools & Hardware', 'Soldering Supplies', 'Flux Pen'],
      termLabels: ['tools_hardware', null, null],
      rawTerms: ['soldering flux pen'],
      proposedTerms: [{
        proposed_label: 'Soldering Supplies',
        parent_term_id: createSemanticTermId('product_taxonomy', 'tools_hardware'),
        parent_label: 'Tools & Hardware',
        aliases: ['soldering accessories'],
        confidence: 0.82,
        evidence: ['soldering flux pen'],
        reason: 'Specific hardware branch is not in the starter taxonomy.',
      }, {
        proposed_label: 'Flux Pen',
        parent_term_id: null,
        parent_label: 'Soldering Supplies',
        aliases: ['soldering flux pen'],
        confidence: 0.78,
        evidence: ['flux pen'],
        reason: 'Specific product type is not in the registry.',
      }],
      confidence: 0.82,
      needsReview: true,
      evidence: ['Specialized soldering flux pen'],
    }),
  });

  const normalized = validateCanonicalSemanticV3Enrichment(enrichment, { canonicalProduct: product });
  assert.equal(normalized.taxonomy_classification.proposed_terms.length, 2);
  assert.equal(normalized.taxonomy_classification.needs_review, true);
});

test('v3 taxonomy_classification rejects malformed paths and high-confidence contradictions', () => {
  const product = {
    canonical_product_id: 'cp_tax_bad',
    canonical_display_name: 'Shampoo 250 ml',
  };

  assert.throws(
    () => validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(product, {
      taxonomy_classification: {
        ...buildValidTaxonomyClassification({ labels: ['Personal Care', 'Hair Care'], termLabels: ['personal_care', 'hair_care'] }),
        taxonomy_path_term_ids: [createSemanticTermId('product_taxonomy', 'personal_care')],
      },
    }), { canonicalProduct: product }),
    /path labels\/term_ids length mismatch/
  );

  assert.throws(
    () => validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(product, {
      taxonomy_classification: buildValidTaxonomyClassification({
        labels: ['Grocery', 'Dairy'],
        termLabels: ['grocery', 'dairy'],
        rawTerms: ['shampoo'],
        confidence: 0.92,
        evidence: ['shampoo'],
      }),
    }), { canonicalProduct: product }),
    /personal-care\/dairy contradiction/
  );
});

test('v3 validation accepts older v3 payloads without semantic usage profile', () => {
  const product = {
    canonical_product_id: 'cp_legacy_v3_yogurt',
    canonical_display_name: 'Plain Yogurt 400g',
    source_example_name: 'Plain Yogurt 400g',
  };
  const legacyPayload = buildValidV3Enrichment(product);
  delete legacyPayload.taxonomy_classification;
  delete legacyPayload.semantic_usage_profile;
  delete legacyPayload.semantic_embedding_summary;

  const normalized = validateCanonicalSemanticV3Enrichment(legacyPayload, {
    canonicalProduct: product,
  });

  assert.deepEqual(normalized.semantic_usage_profile.common_uses, []);
  assert.deepEqual(normalized.semantic_usage_profile.flavor_profile.descriptors, []);
  assert.equal(normalized.semantic_usage_profile.confidence, 0);
  assert.equal(normalized.semantic_embedding_summary.summary, '');
  assert.equal(normalized.semantic_embedding_summary.summary_language, 'unknown');
  assert.deepEqual(normalized.taxonomy_classification.taxonomy_path_labels, []);
});

test('v3 semantic embedding summary accepts fresh milk embedding prose', () => {
  const product = {
    canonical_product_id: 'cp_summary_fresh_milk',
    canonical_display_name: 'Fresh Milk 1L',
    source_example_name: 'Fresh Milk 1L',
  };
  const normalized = validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(product, {
    attributes: {
      dairy: { dairy_type: 'milk', milk_source: 'cow', uht_or_fresh: 'fresh' },
      personal_care: {},
      beverage: {},
      household: {},
      nutrition_claims: [],
      dietary_claims: [],
      flavor_terms: [],
      preparation_state: [],
      storage: { storage_type: 'refrigerated' },
      quantity: { total_quantity: 1000, total_unit: 'ml' },
    },
      semantic_embedding_summary: buildValidSemanticEmbeddingSummary({
      summary: 'Fresh cow milk in a 1 L carton or bottle, a mild refrigerated dairy drink and cooking ingredient made from cow milk for breakfast, coffee, sauces, desserts, and baking. Search-relevant contexts include milk, dairy, fresh milk, breakfast beverage, coffee ingredient, cooking ingredient, and refrigerated staple.',
      summary_language: 'en',
      included_aspects: ['product_type', 'packaging_quantity', 'category_form_storage', 'flavor_texture_profile', 'ingredients', 'common_use_cases', 'consumer_search_meaning'],
      evidence: ['fresh milk', '1 L', 'refrigerated'],
      confidence: 0.82,
    }),
  }), { canonicalProduct: product });

  assert.equal(normalized.semantic_embedding_summary.summary.includes('Fresh cow milk'), true);
  assert.equal(normalized.semantic_embedding_summary.evidence.length, 3);
});

test('v3 semantic embedding summary accepts yogurt, sirene, and kashkaval prose', () => {
  const yogurtProduct = {
    canonical_product_id: 'cp_summary_yogurt',
    canonical_display_name: 'Кисело мляко кофичка 400g',
    source_example_name: 'Кисело мляко кофичка 400g',
  };
  const sireneProduct = {
    canonical_product_id: 'cp_summary_sirene',
    canonical_display_name: 'Sirene Bulgarian Cheese 400g',
    source_example_name: 'Sirene Bulgarian Cheese 400g',
  };
  const kashkavalProduct = {
    canonical_product_id: 'cp_summary_kashkaval',
    canonical_display_name: 'Kashkaval Cheese 400g',
    source_example_name: 'Kashkaval Cheese 400g',
  };

  const yogurt = validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(yogurtProduct, {
    semantic_embedding_summary: buildValidSemanticEmbeddingSummary(),
  }), { canonicalProduct: yogurtProduct });
  const sirene = validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(sireneProduct, {
      semantic_embedding_summary: buildValidSemanticEmbeddingSummary({
      summary: 'Sirene (Bulgarian white brined cheese) packaged by weight, a salty brined dairy cheese made from milk and used in Shopska salad, banitsa, breakfast plates, baked fillings, and as a table cheese. Search-relevant contexts include cheese, sirene, Bulgarian/Balkan cuisine, salty dairy ingredient, salad cheese, pastry filling, and brined cheese.',
      summary_language: 'en',
      included_aspects: ['product_type', 'category_form_storage', 'flavor_texture_profile', 'cuisine_context', 'ingredients', 'common_use_cases', 'meal_or_dish_role', 'consumer_search_meaning'],
      evidence: ['sirene', 'cheese'],
      confidence: 0.86,
    }),
  }), { canonicalProduct: sireneProduct });
  const kashkaval = validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(kashkavalProduct, {
      semantic_embedding_summary: buildValidSemanticEmbeddingSummary({
      summary: 'Kashkaval is a yellow cow-milk cheese sold packaged by weight, with a mild savory dairy flavor and melting/grating texture for sandwiches, toppings, baked dishes, and Balkan-style meals. Search-relevant contexts include cheese, kashkaval, yellow cheese, melting cheese, sandwich cheese, grating cheese, dairy, and Bulgarian/Balkan cuisine.',
      summary_language: 'en',
      included_aspects: ['product_type', 'packaging_quantity', 'flavor_texture_profile', 'cuisine_context', 'ingredients', 'common_use_cases', 'consumer_search_meaning'],
      evidence: ['kashkaval', 'cheese'],
      confidence: 0.85,
    }),
  }), { canonicalProduct: kashkavalProduct });

  assert.equal(yogurt.semantic_embedding_summary.summary.includes('кисело мляко'), true);
  assert.equal(sirene.semantic_embedding_summary.summary.includes('Shopska salad'), true);
  assert.equal(kashkaval.semantic_embedding_summary.summary.includes('melting'), true);
});

test('v3 semantic embedding summary rejects false claims and overlong prose', () => {
  const product = {
    canonical_product_id: 'cp_summary_false_claims',
    canonical_display_name: 'Fresh Milk 1L',
    source_example_name: 'Fresh Milk 1L',
  };

  assert.throws(
    () => validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(product, {
      semantic_embedding_summary: buildValidSemanticEmbeddingSummary({
        summary: 'Fresh organic lactose-free milk in a 1 L carton for breakfast and cooking.',
      }),
    }), { canonicalProduct: product }),
    /unsupported claim/
  );

  assert.throws(
    () => validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(product, {
      semantic_embedding_summary: buildValidSemanticEmbeddingSummary({
        summary: 'Fresh milk in a 1 L carton. It is used for breakfast and coffee. It is also useful in cooking.',
      }),
    }), { canonicalProduct: product }),
    /max sentence count/
  );
});

test('v3 semantic usage profile preserves conservative yogurt richness', () => {
  const product = {
    canonical_product_id: 'cp_usage_yogurt',
    canonical_display_name: 'Plain Yogurt 400g',
    source_example_name: 'Plain Yogurt 400g',
  };

  const normalized = validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(product, {
    semantic_usage_profile: buildValidSemanticUsageProfile({
      meal_contexts: ['Breakfast', 'snack', 'Cooking'],
      culinary_roles: ['Ingredient', 'dairy base'],
      common_uses: ['eat plain', 'use in sauces', 'use in baking', 'serve with fruit'],
      flavor_profile: {
        primary_tastes: ['Tangy'],
        descriptors: ['Creamy', 'Mild'],
        intensity: 'mild',
      },
      confidence: 0.84,
      evidence: ['plain yogurt'],
    }),
  }), { canonicalProduct: product });

  assert.deepEqual(normalized.semantic_usage_profile.meal_contexts, ['breakfast', 'snack', 'cooking']);
  assert.deepEqual(normalized.semantic_usage_profile.culinary_roles, ['ingredient', 'dairy base']);
  assert.equal(normalized.semantic_usage_profile.common_uses.includes('use in sauces'), true);
  assert.deepEqual(normalized.semantic_usage_profile.flavor_profile.descriptors, ['creamy', 'mild']);
  assert.equal(normalized.semantic_usage_profile.confidence, 0.84);
});

test('v3 semantic usage profile supports sirene and kashkaval culinary roles', () => {
  const sireneProduct = {
    canonical_product_id: 'cp_usage_sirene',
    canonical_display_name: 'Sirene Bulgarian Cheese 400g',
    source_example_name: 'Sirene Bulgarian Cheese 400g',
  };
  const kashkavalProduct = {
    canonical_product_id: 'cp_usage_kashkaval',
    canonical_display_name: 'Kashkaval Cheese 400g',
    source_example_name: 'Kashkaval Cheese 400g',
  };

  const sirene = validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(sireneProduct, {
    semantic_usage_profile: buildValidSemanticUsageProfile({
      cuisine_contexts: ['Bulgarian', 'Balkan'],
      culinary_roles: ['cheese', 'salty dairy ingredient', 'salad ingredient'],
      common_uses: ['shopska salad', 'banitsa', 'breakfast', 'table cheese'],
      flavor_profile: {
        primary_tastes: ['salty'],
        descriptors: ['brined', 'crumbly'],
        intensity: 'medium',
      },
      pairing_suggestions: ['tomatoes', 'cucumber', 'bread'],
      consumer_search_intents: ['sirene', 'bulgarian cheese'],
      confidence: 0.87,
      evidence: ['sirene', 'bulgarian cheese'],
    }),
  }), { canonicalProduct: sireneProduct });
  const kashkaval = validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(kashkavalProduct, {
    semantic_usage_profile: buildValidSemanticUsageProfile({
      cuisine_contexts: ['Bulgarian', 'Balkan'],
      culinary_roles: ['cheese', 'topping', 'melting cheese', 'sandwich ingredient'],
      common_uses: ['grate over dishes', 'toast', 'sandwiches', 'baked dishes'],
      preparation_contexts: ['grate', 'slice', 'melt'],
      flavor_profile: {
        primary_tastes: ['savory'],
        descriptors: ['mild', 'creamy'],
        intensity: 'medium',
      },
      confidence: 0.85,
      evidence: ['kashkaval', 'cheese'],
    }),
  }), { canonicalProduct: kashkavalProduct });

  assert.deepEqual(sirene.semantic_usage_profile.cuisine_contexts, ['bulgarian', 'balkan']);
  assert.equal(sirene.semantic_usage_profile.common_uses.includes('shopska salad'), true);
  assert.equal(sirene.semantic_usage_profile.culinary_roles.includes('salad ingredient'), true);
  assert.equal(kashkaval.semantic_usage_profile.culinary_roles.includes('melting cheese'), true);
  assert.equal(kashkaval.semantic_usage_profile.common_uses.includes('baked dishes'), true);
});

test('v3 semantic usage profile keeps fresh milk conservative', () => {
  const product = {
    canonical_product_id: 'cp_usage_fresh_milk',
    canonical_display_name: 'Fresh Milk 1L',
    source_example_name: 'Fresh Milk 1L',
  };

  const normalized = validateCanonicalSemanticV3Enrichment(buildValidV3Enrichment(product, {
    attributes: {
      dairy: { dairy_type: 'milk', milk_source: 'cow', uht_or_fresh: 'fresh' },
      personal_care: {},
      beverage: {},
      household: {},
      nutrition_claims: [],
      dietary_claims: [],
      flavor_terms: [],
      preparation_state: [],
      storage: { storage_type: 'refrigerated' },
      quantity: { total_quantity: 1000, total_unit: 'ml' },
    },
    semantic_usage_profile: buildValidSemanticUsageProfile({
      cuisine_contexts: [],
      flavor_profile: {
        primary_tastes: ['mild'],
        descriptors: ['creamy'],
        intensity: 'mild',
      },
      culinary_roles: ['drink', 'dairy ingredient'],
      meal_contexts: ['breakfast', 'cooking', 'baking'],
      common_uses: ['drink plain', 'add to coffee', 'use in baking', 'use in sauces'],
      substitute_terms: [],
      consumer_search_intents: ['fresh milk', 'milk'],
      not_for: ['plant-based milk', 'lactose-free milk'],
      confidence: 0.78,
      evidence: ['fresh milk'],
    }),
  }), { canonicalProduct: product });

  assert.deepEqual(normalized.semantic_usage_profile.cuisine_contexts, []);
  assert.equal(normalized.semantic_usage_profile.common_uses.includes('add to coffee'), true);
  assert.equal(normalized.semantic_usage_profile.not_for.includes('lactose-free milk'), true);
  assert.equal(normalized.attributes.dairy.lactose_free, undefined);
  assert.equal(normalized.semantic_usage_profile.needs_review, false);
});

test('v3 structured output request body includes strict json_schema by default', () => {
  const responseFormat = buildProviderResponseFormat({
    env: {},
    enrichmentVersion: CANONICAL_SEMANTIC_V3_VERSION,
  });

  assert.equal(responseFormat.type, 'json_schema');
  assert.equal(responseFormat.json_schema.name, 'canonical_semantic_v3_batch');
  assert.equal(responseFormat.json_schema.strict, true);
  assert.equal(responseFormat.json_schema.schema.required.includes('products'), true);
});

test('v3 provider request sends response_format when enabled', async () => {
  const product = {
    canonical_product_id: 'cp_structured_v3',
    canonical_display_name: 'Fresh Milk 1L',
    source_example_name: 'Fresh Milk 1L',
  };
  let requestBody = null;
  const response = await requestCanonicalEnrichmentBatch({
    prompt: buildCanonicalSemanticV3BatchPrompt([product]),
    products: [product],
    enrichmentVersion: CANONICAL_SEMANTIC_V3_VERSION,
    env: {
      XAI_API_KEY: 'test-key',
      PRICER_ENRICHMENT_MODEL: 'test-model',
      PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
    },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              products: [{
                canonical_product_id: product.canonical_product_id,
                enrichment: buildValidV3Enrichment(product),
              }],
            }),
          },
        }],
      }), { status: 200 });
    },
  });

  assert.equal(requestBody.response_format.type, 'json_schema');
  assert.equal(requestBody.response_format.json_schema.strict, true);
  assert.equal(requestBody.messages[1].content.includes('response_json_schema'), false);
  const outboundPrompt = JSON.parse(requestBody.messages[1].content);
  assert.equal(outboundPrompt.response_schema_transport, 'response_format.json_schema');
  assert.equal(outboundPrompt.semantic_usage_profile_guidance.conservative_examples, undefined);
  assert.equal(outboundPrompt.semantic_embedding_summary_guidance.examples, undefined);
  assert.equal(response.attempt_history[0].duration_ms >= 0, true);
  assert.equal(response.attempt_history[0].request_body_char_count > 0, true);
  assert.equal(response.attempt_history[0].prompt_char_count > 0, true);
  assert.equal(response.attempt_history[0].json_schema_char_count > 0, true);
  assert.equal(response.attempt_history[0].response_format_json_schema_included, true);
  assert.equal(response.products[0].canonical_product_id, 'cp_structured_v3');
});

test('provider request succeeds first try without retry metadata noise', async () => {
  let calls = 0;
  const response = await requestCanonicalEnrichmentBatch({
    prompt: { products: [] },
    products: [],
    env: {
      XAI_API_KEY: 'test-key',
      PRICER_ENRICHMENT_MODEL: 'test-model',
      PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
    },
    fetchImpl: async () => {
      calls += 1;
      return buildProviderSuccessResponse({ products: [] });
    },
  });

  assert.equal(calls, 1);
  assert.equal(response.provider_attempt_count, 1);
  assert.equal(response.retry_count, 0);
  assert.equal(response.retryable_error_count, 0);
  assert.equal(response.attempt_history[0].success, true);
});

test('provider request retries UND_ERR_SOCKET then succeeds', async () => {
  let calls = 0;
  const response = await requestCanonicalEnrichmentBatch({
    prompt: { products: [] },
    products: [],
    env: {
      XAI_API_KEY: 'test-key',
      PRICER_ENRICHMENT_MODEL: 'test-model',
      PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
      PRICER_LLM_RETRY_BASE_MS: '0',
    },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        throw buildSocketClosedError();
      }
      return buildProviderSuccessResponse({ products: [] });
    },
  });

  assert.equal(calls, 2);
  assert.equal(response.provider_attempt_count, 2);
  assert.equal(response.retry_count, 1);
  assert.equal(response.retryable_error_count, 1);
  assert.equal(response.attempt_history[0].cause_code, 'UND_ERR_SOCKET');
  assert.equal(response.attempt_history[0].duration_ms >= 0, true);
  assert.equal(response.attempt_history[0].request_body_char_count > 0, true);
  assert.equal(response.attempt_history[0].estimated_request_tokens > 0, true);
});

test('provider request retries 503 then succeeds', async () => {
  let calls = 0;
  const response = await requestCanonicalEnrichmentBatch({
    prompt: { products: [] },
    products: [],
    env: {
      XAI_API_KEY: 'test-key',
      PRICER_ENRICHMENT_MODEL: 'test-model',
      PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
      PRICER_LLM_RETRY_BASE_MS: '0',
    },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('temporary unavailable', { status: 503, statusText: 'Service Unavailable' });
      }
      return buildProviderSuccessResponse({ products: [] });
    },
  });

  assert.equal(calls, 2);
  assert.equal(response.attempt_history[0].status, 503);
  assert.equal(response.retry_count, 1);
});

test('provider request retries 429 then succeeds', async () => {
  let calls = 0;
  const response = await requestCanonicalEnrichmentBatch({
    prompt: { products: [] },
    products: [],
    env: {
      XAI_API_KEY: 'test-key',
      PRICER_ENRICHMENT_MODEL: 'test-model',
      PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
      PRICER_LLM_RETRY_BASE_MS: '0',
    },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('rate limited', { status: 429, statusText: 'Too Many Requests' });
      }
      return buildProviderSuccessResponse({ products: [] });
    },
  });

  assert.equal(calls, 2);
  assert.equal(response.attempt_history[0].status, 429);
  assert.equal(response.retry_count, 1);
});

test('provider request does not retry 400 invalid API key style errors', async () => {
  let calls = 0;
  await assert.rejects(
    () => requestCanonicalEnrichmentBatch({
      prompt: { products: [] },
      products: [],
      env: {
        XAI_API_KEY: 'test-key',
        PRICER_ENRICHMENT_MODEL: 'test-model',
        PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
        PRICER_LLM_MAX_RETRIES: '0',
      },
      fetchImpl: async () => {
        calls += 1;
        return new Response('invalid api key', { status: 400, statusText: 'Bad Request' });
      },
    }),
    (error) => {
      assert.equal(calls, 1);
      assert.equal(error.error_type, 'provider_http_error');
      assert.equal(error.status, 400);
      assert.equal(Boolean(error.exhausted_retries), false);
      assert.equal(error.provider_attempt_count, 1);
      return true;
    }
  );
});

test('provider request reports retry exhaustion with attempt history', async () => {
  let calls = 0;
  await assert.rejects(
    () => requestCanonicalEnrichmentBatch({
      prompt: { products: [] },
      products: [],
      env: {
        XAI_API_KEY: 'test-key',
        PRICER_ENRICHMENT_MODEL: 'test-model',
        PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
        PRICER_LLM_MAX_RETRIES: '2',
        PRICER_LLM_RETRY_BASE_MS: '0',
      },
      fetchImpl: async () => {
        calls += 1;
        throw buildSocketClosedError();
      },
    }),
    (error) => {
      assert.equal(calls, 3);
      assert.equal(error.error_type, 'provider_network_error');
      assert.equal(error.exhausted_retries, true);
      assert.equal(error.provider_attempt_count, 3);
      assert.equal(error.retry_count, 2);
      assert.equal(error.retryable_error_count, 3);
      assert.equal(error.attempt_history.length, 3);
      return true;
    }
  );
});

test('provider network failures classify huge local request bodies as possible bloat', async () => {
  await assert.rejects(
    () => requestCanonicalEnrichmentBatch({
      prompt: { products: [], oversized_context: 'x'.repeat(2000) },
      products: [],
      env: {
        XAI_API_KEY: 'test-key',
        PRICER_ENRICHMENT_MODEL: 'test-model',
        PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
        PRICER_LLM_MAX_RETRIES: '0',
        PRICER_LLM_REQUEST_BLOAT_CHAR_THRESHOLD: '500',
      },
      fetchImpl: async () => {
        throw buildSocketClosedError();
      },
    }),
    (error) => {
      assert.equal(error.error_type, 'possible_local_request_bloat');
      assert.equal(error.attempt_history[0].error_type, 'possible_local_request_bloat');
      assert.equal(error.attempt_history[0].request_size_classification, 'possible_local_request_bloat');
      assert.equal(error.attempt_history[0].request_body_char_count > 500, true);
      assert.equal(error.attempt_history[0].duration_ms >= 0, true);
      return true;
    }
  );
});

test('provider request timeout abort is retryable and reported', async () => {
  let calls = 0;
  await assert.rejects(
    () => requestCanonicalEnrichmentBatch({
      prompt: { products: [] },
      products: [],
      env: {
        XAI_API_KEY: 'test-key',
        PRICER_ENRICHMENT_MODEL: 'test-model',
        PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
        PRICER_LLM_MAX_RETRIES: '1',
        PRICER_LLM_RETRY_BASE_MS: '0',
        PRICER_LLM_REQUEST_TIMEOUT_MS: '1',
      },
      fetchImpl: async (_url, options) => {
        calls += 1;
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
          });
        });
      },
    }),
    (error) => {
      assert.equal(calls, 2);
      assert.equal(error.error_type, 'provider_network_error');
      assert.equal(error.exhausted_retries, true);
      assert.equal(error.timed_out, true);
      assert.equal(error.timeout_ms, 1);
      assert.equal(error.attempt_history.every((entry) => entry.timed_out), true);
      return true;
    }
  );
});

test('v3 response_format remains included on every retry', async () => {
  const product = {
    canonical_product_id: 'cp_retry_format_v3',
    canonical_display_name: 'Fresh Milk 1L',
    source_example_name: 'Fresh Milk 1L',
  };
  const requestBodies = [];
  let calls = 0;

  const response = await requestCanonicalEnrichmentBatch({
    prompt: buildCanonicalSemanticV3BatchPrompt([product]),
    products: [product],
    enrichmentVersion: CANONICAL_SEMANTIC_V3_VERSION,
    env: {
      XAI_API_KEY: 'test-key',
      PRICER_ENRICHMENT_MODEL: 'test-model',
      PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
      PRICER_LLM_RETRY_BASE_MS: '0',
    },
    fetchImpl: async (_url, options) => {
      calls += 1;
      requestBodies.push(JSON.parse(options.body));
      if (calls === 1) {
        throw buildSocketClosedError();
      }
      return buildProviderSuccessResponse({
        products: [{
          canonical_product_id: product.canonical_product_id,
          enrichment: buildValidV3Enrichment(product),
        }],
      });
    },
  });

  assert.equal(calls, 2);
  assert.equal(response.retry_count, 1);
  assert.equal(requestBodies.length, 2);
  assert.equal(requestBodies.every((body) => body.response_format?.type === 'json_schema'), true);
  assert.equal(requestBodies.every((body) => body.response_format?.json_schema?.strict === true), true);
});

test('real pilot summary includes provider retry attempt metrics', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [{
      canonical_product_id: 'cp_retry_summary',
      canonical_display_name: 'Fresh Milk 1L',
      source_example_name: 'Fresh Milk 1L',
    }],
    canonical_enrichment_store: [],
  });
  let calls = 0;

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_PILOT_QUERY: 'milk',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      XAI_API_KEY: 'test-key',
      PRICER_ENRICHMENT_MODEL: 'test-model',
      PRICER_ENRICHMENT_ENDPOINT: 'https://api.x.ai/v1/chat/completions',
      PRICER_LLM_RETRY_BASE_MS: '0',
    },
    canonicalEnrichmentBatchClient: async (args) => requestCanonicalEnrichmentBatch({
      ...args,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          throw buildSocketClosedError();
        }
        return buildProviderSuccessResponse({
          products: [{
            canonical_product_id: 'cp_retry_summary',
            enrichment: buildValidRichEnrichment(),
          }],
        });
      },
    }),
  });

  assert.equal(summary.actual_writes, 1);
  assert.equal(summary.provider_attempt_count, 2);
  assert.equal(summary.retry_count, 1);
  assert.equal(summary.retryable_error_count, 1);
  assert.equal(summary.provider_attempt_history.length, 1);
  assert.equal(summary.provider_attempt_history[0].attempts[0].cause_code, 'UND_ERR_SOCKET');
});

test('v3 real pilot writes enrichment, seeds registry, and creates pending proposals only', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [{
      canonical_product_id: 'cp_yogurt_cup_v3',
      canonical_display_name: '\u0419\u043e\u0433\u0443\u0440\u0442 \u043a\u043e\u0444\u0438\u0447\u043a\u0430 400 \u0433',
      source_example_name: '\u0419\u043e\u0433\u0443\u0440\u0442 \u043a\u043e\u0444\u0438\u0447\u043a\u0430 400 \u0433',
    }],
    canonical_enrichment_store: [],
    semantic_term_registry: [],
    semantic_term_registry_proposals: [],
    canonical_enrichment_failed_responses: [],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_VERSION: CANONICAL_SEMANTIC_V3_VERSION,
      PRICER_ENRICHMENT_PILOT_QUERY: '\u0439\u043e\u0433\u0443\u0440\u0442',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      PRICER_ENRICHMENT_PILOT_NOW: '2026-05-05T11:00:00.000Z',
    },
    canonicalEnrichmentBatchClient: async ({ products }) => ({
      products: products.map((product) => ({
        canonical_product_id: product.canonical_product_id,
        enrichment: buildValidV3Enrichment(product),
      })),
    }),
  });
  const after = await store.load();

  assert.equal(summary.enrichment_version, CANONICAL_SEMANTIC_V3_VERSION);
  assert.equal(summary.actual_writes, 1);
  assert.equal(summary.registry_seed_writes > 0, true);
  assert.equal(summary.registry_proposal_writes, 1);
  assert.equal(after.canonical_enrichment_store[0].enrichment.schema_version, CANONICAL_SEMANTIC_V3_VERSION);
  assert.equal(after.semantic_term_registry.some((term) => term.status === 'active' && term.canonical_label === 'tub'), true);
  assert.equal(after.semantic_term_registry_proposals.length, 1);
  assert.equal(after.semantic_term_registry_proposals[0].status, 'pending');
  assert.equal(after.semantic_term_registry.some((term) => term.source === 'llm_proposed'), false);
});

test('v3 duplicate registry proposals are deduped across sibling actions', async () => {
  const product = {
    canonical_product_id: 'cp_yogurt_cup_dedupe',
    canonical_display_name: '\u0419\u043e\u0433\u0443\u0440\u0442 \u043a\u043e\u0444\u0438\u0447\u043a\u0430',
    source_example_name: '\u0419\u043e\u0433\u0443\u0440\u0442 \u043a\u043e\u0444\u0438\u0447\u043a\u0430',
  };
  const duplicateAction = {
    action: 'propose_alias',
    domain: 'packaging',
    existing_term_id: createSemanticTermId('packaging', 'tub'),
    proposed_label: null,
    proposed_alias: '\u043a\u043e\u0444\u0438\u0447\u043a\u0430',
    parent_term_id: null,
    confidence: 0.91,
    evidence: ['\u043a\u043e\u0444\u0438\u0447\u043a\u0430'],
    reason: 'duplicate proposal should dedupe',
  };
  const store = new InMemoryDataBackboneStore({
    canonical_products: [product],
    canonical_enrichment_store: [],
    semantic_term_registry: [],
    semantic_term_registry_proposals: [],
    canonical_enrichment_failed_responses: [],
  });

  await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_VERSION: CANONICAL_SEMANTIC_V3_VERSION,
      PRICER_ENRICHMENT_PILOT_QUERY: '\u0439\u043e\u0433\u0443\u0440\u0442',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      PRICER_ENRICHMENT_PILOT_NOW: '2026-05-05T11:05:00.000Z',
    },
    canonicalEnrichmentBatchClient: async ({ products }) => ({
      products: products.map((entry) => ({
        canonical_product_id: entry.canonical_product_id,
        enrichment: buildValidV3Enrichment(entry, {
          registry_actions: [duplicateAction, duplicateAction],
        }),
      })),
    }),
  });
  const after = await store.load();

  assert.equal(after.semantic_term_registry_proposals.length, 1);
});

test('v3 real pilot writes taxonomy proposed terms with aliases and dedupes by parent', async () => {
  const product = {
    canonical_product_id: 'cp_tax_proposal_pilot',
    canonical_display_name: 'Specialized soldering flux pen',
    source_example_name: 'Specialized soldering flux pen',
  };
  const proposedTerm = {
    proposed_label: 'Flux Pen',
    parent_term_id: createSemanticTermId('product_taxonomy', 'tools_hardware'),
    parent_label: 'Tools & Hardware',
    aliases: ['soldering flux pen', 'flux marker'],
    confidence: 0.81,
    evidence: ['flux pen'],
    reason: 'Niche tool consumable not in starter taxonomy.',
  };
  const store = new InMemoryDataBackboneStore({
    canonical_products: [product],
    canonical_enrichment_store: [],
    semantic_term_registry: [],
    semantic_term_registry_proposals: [],
    canonical_enrichment_failed_responses: [],
  });

  await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_VERSION: CANONICAL_SEMANTIC_V3_VERSION,
      PRICER_ENRICHMENT_PILOT_QUERY: 'flux pen',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      PRICER_ENRICHMENT_PILOT_NOW: '2026-05-05T11:08:00.000Z',
    },
    canonicalEnrichmentBatchClient: async ({ products }) => ({
      products: products.map((entry) => ({
        canonical_product_id: entry.canonical_product_id,
        enrichment: buildValidV3Enrichment(entry, {
          registry_actions: [],
          taxonomy_classification: buildValidTaxonomyClassification({
            labels: ['Tools & Hardware', 'Flux Pen'],
            termLabels: ['tools_hardware', null],
            rawTerms: ['flux pen'],
            proposedTerms: [proposedTerm, proposedTerm],
            confidence: 0.81,
            needsReview: true,
            evidence: ['Specialized soldering flux pen'],
          }),
        }),
      })),
    }),
  });
  const after = await store.load();

  assert.equal(after.semantic_term_registry_proposals.length, 1);
  assert.equal(after.semantic_term_registry_proposals[0].domain, 'product_taxonomy');
  assert.deepEqual(after.semantic_term_registry_proposals[0].proposed_aliases, ['soldering flux pen', 'flux marker']);
  assert.equal(after.semantic_term_registry.some((term) => term.source === 'llm_proposed'), false);
});

test('v3 malformed provider JSON is quarantined and not written', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [{
      canonical_product_id: 'cp_bad_json_v3',
      canonical_display_name: 'Fresh Milk 1L',
      source_example_name: 'Fresh Milk 1L',
    }],
    canonical_enrichment_store: [],
    semantic_term_registry: [],
    semantic_term_registry_proposals: [],
    canonical_enrichment_failed_responses: [],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_VERSION: CANONICAL_SEMANTIC_V3_VERSION,
      PRICER_ENRICHMENT_PILOT_QUERY: 'milk',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      PRICER_ENRICHMENT_PILOT_NOW: '2026-05-05T11:10:00.000Z',
    },
    canonicalEnrichmentBatchClient: async () => {
      const error = new SyntaxError('Unexpected token');
      error.error_type = 'provider_response_error';
      error.parse_error = 'Unexpected token';
      error.raw_content_redacted = '```json\n{"products":[\n```';
      throw error;
    },
  });
  const after = await store.load();

  assert.equal(summary.actual_writes, 0);
  assert.equal(summary.failed_response_writes, 1);
  assert.equal(after.canonical_enrichment_store.length, 0);
  assert.equal(after.canonical_enrichment_failed_responses.length, 1);
  assert.equal(after.canonical_enrichment_failed_responses[0].raw_content_redacted.includes('products'), true);
});

test('v3 partial salvage repairs taxonomy primary mismatch and writes reviewable enrichment', async () => {
  const product = {
    canonical_product_id: 'cp_v3_repair_taxonomy_primary',
    canonical_display_name: 'Fresh Milk 1L',
    source_example_name: 'Fresh Milk 1L',
  };
  const store = new InMemoryDataBackboneStore({
    canonical_products: [product],
    canonical_enrichment_store: [],
    semantic_term_registry: [],
    semantic_term_registry_proposals: [],
    canonical_enrichment_failed_responses: [],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_VERSION: CANONICAL_SEMANTIC_V3_VERSION,
      PRICER_ENRICHMENT_PILOT_QUERY: 'milk',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      PRICER_ENRICHMENT_PILOT_NOW: '2026-05-05T11:20:00.000Z',
    },
    canonicalEnrichmentBatchClient: async ({ products }) => ({
      products: products.map((entry) => ({
        canonical_product_id: entry.canonical_product_id,
        enrichment: buildValidV3Enrichment(entry, {
          taxonomy_classification: {
            ...buildValidTaxonomyClassification({
              labels: ['Grocery', 'Dairy'],
              termLabels: ['grocery', 'dairy'],
              rawTerms: ['milk'],
            }),
            primary_taxonomy_label: 'Fresh Milk',
            primary_taxonomy_term_id: null,
          },
        }),
      })),
    }),
  });
  const after = await store.load();

  assert.equal(summary.actual_writes, 1);
  assert.equal(summary.rejected_count, 0);
  assert.equal(summary.validation_warnings.some((warning) =>
    warning.reason === 'repaired_primary_taxonomy_label_path_mismatch'), true);
  assert.equal(after.canonical_enrichment_store[0].enrichment_repair_status, 'partial');
  assert.equal(after.canonical_enrichment_store[0].needs_human_review, true);
  assert.equal(
    after.canonical_enrichment_store[0].enrichment.taxonomy_classification.primary_taxonomy_label,
    'Fresh Milk'
  );
});

test('v3 partial salvage moves misplaced food category registry match and writes', async () => {
  const product = {
    canonical_product_id: 'cp_v3_repair_food_category_match',
    canonical_display_name: 'Fresh Milk 1L',
    source_example_name: 'Fresh Milk 1L',
  };
  const misplacedMatch = {
    domain: 'food_category',
    term_id: createSemanticTermId('food_category', 'dairy'),
    canonical_label: 'dairy',
    confidence: 0.84,
    evidence: ['milk'],
  };
  const store = new InMemoryDataBackboneStore({
    canonical_products: [product],
    canonical_enrichment_store: [],
    semantic_term_registry: [],
    semantic_term_registry_proposals: [],
    canonical_enrichment_failed_responses: [],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_VERSION: CANONICAL_SEMANTIC_V3_VERSION,
      PRICER_ENRICHMENT_PILOT_QUERY: 'milk',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      PRICER_ENRICHMENT_PILOT_NOW: '2026-05-05T11:21:00.000Z',
    },
    canonicalEnrichmentBatchClient: async ({ products }) => ({
      products: products.map((entry) => ({
        canonical_product_id: entry.canonical_product_id,
        enrichment: buildValidV3Enrichment(entry, {
          taxonomy_classification: {
            ...buildValidTaxonomyClassification(),
            registry_matches: [
              ...buildValidTaxonomyClassification().registry_matches,
              misplacedMatch,
            ],
          },
          category: {
            ...buildValidV3Enrichment(entry).category,
            registry_matches: [],
          },
        }),
      })),
    }),
  });
  const after = await store.load();

  assert.equal(summary.actual_writes, 1);
  assert.equal(summary.rejected_count, 0);
  assert.equal(summary.validation_warnings.some((warning) =>
    warning.reason === 'moved_non_product_taxonomy_registry_match_to_category'), true);
  assert.equal(after.canonical_enrichment_store[0].enrichment.category.registry_matches[0].domain, 'food_category');
});

test('v3 partial salvage drops invalid optional usage field and writes', async () => {
  const product = {
    canonical_product_id: 'cp_v3_repair_usage_field',
    canonical_display_name: 'Fresh Milk 1L',
    source_example_name: 'Fresh Milk 1L',
  };
  const usage = buildValidSemanticUsageProfile();
  usage.common_uses = 'breakfast';
  const store = new InMemoryDataBackboneStore({
    canonical_products: [product],
    canonical_enrichment_store: [],
    semantic_term_registry: [],
    semantic_term_registry_proposals: [],
    canonical_enrichment_failed_responses: [],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_VERSION: CANONICAL_SEMANTIC_V3_VERSION,
      PRICER_ENRICHMENT_PILOT_QUERY: 'milk',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      PRICER_ENRICHMENT_PILOT_NOW: '2026-05-05T11:22:00.000Z',
    },
    canonicalEnrichmentBatchClient: async ({ products }) => ({
      products: products.map((entry) => ({
        canonical_product_id: entry.canonical_product_id,
        enrichment: buildValidV3Enrichment(entry, {
          semantic_usage_profile: usage,
        }),
      })),
    }),
  });
  const after = await store.load();

  assert.equal(summary.actual_writes, 1);
  assert.equal(summary.rejected_count, 0);
  assert.equal(summary.validation_warnings.some((warning) =>
    warning.field === 'semantic_usage_profile.common_uses' &&
    warning.reason === 'dropped_invalid_optional_usage_field'), true);
  assert.deepEqual(after.canonical_enrichment_store[0].enrichment.semantic_usage_profile.common_uses, []);
  assert.equal(after.canonical_enrichment_store[0].enrichment_repair_status, 'partial');
});

test('v3 wrong product id remains fatal and rejects without salvage write', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [{
      canonical_product_id: 'cp_v3_wrong_id_expected',
      canonical_display_name: 'Fresh Milk 1L',
      source_example_name: 'Fresh Milk 1L',
    }],
    canonical_enrichment_store: [],
    semantic_term_registry: [],
    semantic_term_registry_proposals: [],
    canonical_enrichment_failed_responses: [],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_VERSION: CANONICAL_SEMANTIC_V3_VERSION,
      PRICER_ENRICHMENT_PILOT_QUERY: 'milk',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
    },
    canonicalEnrichmentBatchClient: async ({ products }) => ({
      products: products.map((entry) => ({
        canonical_product_id: `${entry.canonical_product_id}_wrong`,
        enrichment: buildValidV3Enrichment(entry),
      })),
    }),
  });
  const after = await store.load();

  assert.equal(summary.actual_writes, 0);
  assert.equal(summary.rejected_count, 1);
  assert.equal(summary.rejected_items[0].reason, 'batch_validation_error');
  assert.equal(after.canonical_enrichment_store.length, 0);
});

test('v3 malformed JSON returned from provider client is quarantined', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [{
      canonical_product_id: 'cp_v3_bad_json_string',
      canonical_display_name: 'Fresh Milk 1L',
      source_example_name: 'Fresh Milk 1L',
    }],
    canonical_enrichment_store: [],
    semantic_term_registry: [],
    semantic_term_registry_proposals: [],
    canonical_enrichment_failed_responses: [],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_VERSION: CANONICAL_SEMANTIC_V3_VERSION,
      PRICER_ENRICHMENT_PILOT_QUERY: 'milk',
      PRICER_ENRICHMENT_DRY_RUN: 'false',
      PRICER_ENRICHMENT_RUN_LLM: 'true',
      PRICER_ENRICHMENT_PILOT_NOW: '2026-05-05T11:23:00.000Z',
    },
    canonicalEnrichmentBatchClient: async () => '```json\n{"products":[\n```',
  });
  const after = await store.load();

  assert.equal(summary.actual_writes, 0);
  assert.equal(summary.failed_response_writes, 1);
  assert.equal(after.canonical_enrichment_failed_responses.length, 1);
  assert.equal(after.canonical_enrichment_store.length, 0);
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

test('focused enrichment pilot treats mixed-language query words as separate candidate terms', () => {
  const state = {
    canonical_products: [
      {
        canonical_product_id: 'cp_bg_milk',
        canonical_display_name: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 1\u043b',
        source_example_name: '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 1\u043b',
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
    query: 'milk \u043c\u043b\u044f\u043a\u043e',
    limit: 10,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].canonical_product_id, 'cp_bg_milk');
  assert.equal(candidates[0].pilot_match.matched_terms.includes('\u043c\u043b\u044f\u043a\u043e'), true);
});

test('pilot selector uses existing v3 enrichment attributes object without crashing', () => {
  const product = {
    canonical_product_id: 'cp_v3_yogurt',
    canonical_display_name: 'Plain product 400 g',
    source_example_name: 'Plain product 400 g',
  };
  const hash = canonicalNameHashForTest(product);
  const state = {
    canonical_products: [product],
    canonical_enrichment_store: [{
      canonical_fingerprint: product.canonical_product_id,
      canonical_product_id: product.canonical_product_id,
      canonical_name_hash: hash,
      enrichment_version: CANONICAL_SEMANTIC_V3_VERSION,
      enrichment: buildValidV3Enrichment(product),
    }],
  };

  const candidates = selectEnrichmentPilotCandidates({
    state,
    query: '\u043a\u043e\u0444\u0438\u0447\u043a\u0430',
    limit: 10,
    enrichmentVersion: RICH_CANONICAL_ENRICHMENT_VERSION,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].canonical_product_id, product.canonical_product_id);
  assert.equal(candidates[0].pilot_match.selection_reasons.includes('existing_enrichment_context'), true);
});

test('pilot selector keeps v2 enrichment attributes array evidence working', () => {
  const product = {
    canonical_product_id: 'cp_v2_cola',
    canonical_display_name: 'Plain product 1L',
    source_example_name: 'Plain product 1L',
  };
  const hash = canonicalNameHashForTest(product);
  const state = {
    canonical_products: [product],
    canonical_enrichment_store: [{
      canonical_fingerprint: product.canonical_product_id,
      canonical_product_id: product.canonical_product_id,
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
        attributes: ['sparkling'],
        flavor: ['cola'],
        flavor_terms: ['cola'],
        allergens: [],
        usage_context: ['refreshment'],
        is_beverage: true,
        beverage_type: 'cola',
        carbonated: true,
        caffeine_related: true,
      }),
    }],
  };

  const candidates = selectEnrichmentPilotCandidates({
    state,
    query: 'sparkling',
    limit: 10,
    enrichmentVersion: CANONICAL_SEMANTIC_V3_VERSION,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].canonical_product_id, product.canonical_product_id);
});

test('pilot selection reports malformed enrichment attributes as run warning', async () => {
  const product = {
    canonical_product_id: 'cp_bad_attrs_milk',
    canonical_display_name: 'Fresh Milk 1L',
    source_example_name: 'Fresh Milk 1L',
  };
  const hash = canonicalNameHashForTest(product);
  const store = new InMemoryDataBackboneStore({
    canonical_products: [product],
    canonical_enrichment_store: [{
      canonical_fingerprint: product.canonical_product_id,
      canonical_product_id: product.canonical_product_id,
      canonical_name_hash: hash,
      enrichment_version: CANONICAL_SEMANTIC_V3_VERSION,
      enrichment: buildValidV3Enrichment(product, {
        attributes: 'not-a-supported-shape',
      }),
    }],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_PILOT_QUERY: 'milk',
      PRICER_ENRICHMENT_DRY_RUN: 'true',
      PRICER_ENRICHMENT_PILOT_LIMIT: '5',
      PRICER_ENRICHMENT_VERSION: CANONICAL_SEMANTIC_V3_VERSION,
    },
  });

  assert.equal(summary.dry_run, true);
  assert.equal(summary.skipped_same_cache_count, 1);
  assert.equal(summary.run_warnings.some((warning) =>
    warning.canonical_product_id === product.canonical_product_id &&
    warning.field === 'attributes' &&
    warning.reason === 'unexpected_attributes_shape' &&
    warning.observed_type === 'string'
  ), true);
});

test('v3 dry-run summary reports prompt, request, schema, registry, and request count metrics', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [{
      canonical_product_id: 'cp_metrics_milk_v3',
      canonical_display_name: 'Fresh Milk 1L',
      source_example_name: 'Fresh Milk 1L',
    }],
    canonical_enrichment_store: [],
    semantic_term_registry: [],
    semantic_term_registry_proposals: [],
    canonical_enrichment_failed_responses: [],
  });

  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: {
      PRICER_ENRICHMENT_VERSION: CANONICAL_SEMANTIC_V3_VERSION,
      PRICER_ENRICHMENT_PILOT_QUERY: 'milk',
      PRICER_ENRICHMENT_DRY_RUN: 'true',
      PRICER_ENRICHMENT_PILOT_LIMIT: '5',
      PRICER_REGISTRY_CONTEXT_MAX_TOTAL_TERMS: '12',
    },
  });

  assert.equal(summary.selected_count, 1);
  assert.equal(summary.total_request_count, 1);
  assert.equal(summary.prompt_char_count > 0, true);
  assert.equal(summary.request_body_char_count > summary.prompt_char_count, true);
  assert.equal(summary.estimated_prompt_tokens > 0, true);
  assert.equal(summary.estimated_request_tokens >= summary.estimated_prompt_tokens, true);
  assert.equal(summary.registry_context_term_count <= 12, true);
  assert.equal(summary.registry_context_domains.includes('dairy_type'), true);
  assert.equal(summary.json_schema_char_count > 0, true);
  assert.equal(summary.response_format_json_schema_included, true);
  assert.equal(summary.per_batch_token_estimate.length, 1);
  assert.equal(summary.per_batch_token_estimate[0].response_format_json_schema_included, true);
});

test('enrichment debug command formats v3 inspection fields by canonical product id', async () => {
  const product = {
    canonical_product_id: 'cp_debug_yogurt',
    canonical_display_name: '\u041a\u0438\u0441\u0435\u043b\u043e \u043c\u043b\u044f\u043a\u043e \u043a\u043e\u0444\u0438\u0447\u043a\u0430 400g',
    source_example_name: '\u041a\u0438\u0441\u0435\u043b\u043e \u043c\u043b\u044f\u043a\u043e \u043a\u043e\u0444\u0438\u0447\u043a\u0430 400g',
  };
  const enrichment = buildValidV3Enrichment(product, {
    attributes: {
      dairy: { dairy_type: 'yogurt', milk_source: 'cow', fat_percent: 3.6 },
      personal_care: {},
      beverage: {},
      household: {},
      nutrition_claims: [],
      dietary_claims: [],
      flavor_terms: [],
      preparation_state: [],
      storage: { storage_type: 'refrigerated' },
      quantity: { total_quantity: 400, total_unit: 'g' },
    },
    updated_at: undefined,
  });
  const store = new InMemoryDataBackboneStore({
    canonical_products: [product],
    canonical_enrichment_store: [{
      canonical_fingerprint: product.canonical_product_id,
      canonical_product_id: product.canonical_product_id,
      canonical_name_hash: canonicalNameHashForTest(product),
      enrichment_version: CANONICAL_SEMANTIC_V3_VERSION,
      enrichment,
      model_name: 'test-model',
      updated_at: '2026-05-05T12:00:00.000Z',
    }],
  });

  const result = await debugCanonicalEnrichment({
    store,
    canonicalProductIds: [product.canonical_product_id],
  });

  assert.equal(result.mode, 'by_id');
  assert.equal(result.result_count, 1);
  assert.equal(result.results[0].canonical_product_id, product.canonical_product_id);
  assert.equal(result.results[0].canonical_name, product.canonical_display_name);
  assert.equal(result.results[0].enrichment_version, CANONICAL_SEMANTIC_V3_VERSION);
  assert.deepEqual(result.results[0].taxonomy.taxonomy_path_labels, ['Grocery', 'Dairy', 'Yogurt']);
  assert.equal(result.results[0].taxonomy.primary_taxonomy, 'Yogurt');
  assert.equal(result.results[0].taxonomy.registry_matches[0].domain, 'product_taxonomy');
  assert.equal(result.results[0].taxonomy.confidence, 0.9);
  assert.deepEqual(result.results[0].category_summary.category_path, ['food', 'dairy', 'yogurt']);
  assert.deepEqual(result.results[0].packaging.raw_terms, ['\u043a\u043e\u0444\u0438\u0447\u043a\u0430']);
  assert.equal(result.results[0].packaging.registry_match.canonical_label, 'tub');
  assert.equal(result.results[0].product_form.description, 'semi-solid cultured dairy texture');
  assert.equal(result.results[0].dairy_attributes.dairy_type, 'yogurt');
  assert.equal(result.results[0].dairy_attributes.fat_percent, 3.6);
  assert.equal(result.results[0].semantic_usage_profile.common_uses.includes('use in sauces'), true);
  assert.deepEqual(result.results[0].semantic_usage_profile.flavor_profile.descriptors, ['creamy', 'mild']);
  assert.equal(result.results[0].semantic_usage_profile.confidence, 0.82);
  assert.equal(result.results[0].semantic_embedding_summary.summary.includes('кисело мляко'), true);
  assert.equal(result.results[0].semantic_embedding_summary.summary_language, 'mixed');
  assert.equal(result.results[0].quantity_storage_attributes.quantity.total_quantity, 400);
  assert.equal(result.results[0].quantity_storage_attributes.storage.storage_type, 'refrigerated');
  assert.equal(result.results[0].registry_actions.length, 1);
  assert.equal(result.results[0].needs_human_review, false);
  assert.equal(result.results[0].confidence_overall, 0.88);
});

test('enrichment debug command supports latest records filtered by version', async () => {
  const oldProduct = {
    canonical_product_id: 'cp_debug_old',
    canonical_display_name: 'Old Milk',
    source_example_name: 'Old Milk',
  };
  const newProduct = {
    canonical_product_id: 'cp_debug_new',
    canonical_display_name: 'New Milk',
    source_example_name: 'New Milk',
  };
  const v2Product = {
    canonical_product_id: 'cp_debug_v2',
    canonical_display_name: 'V2 Milk',
    source_example_name: 'V2 Milk',
  };
  const store = new InMemoryDataBackboneStore({
    canonical_products: [oldProduct, newProduct, v2Product],
    canonical_enrichment_store: [
      {
        canonical_fingerprint: oldProduct.canonical_product_id,
        canonical_product_id: oldProduct.canonical_product_id,
        enrichment_version: CANONICAL_SEMANTIC_V3_VERSION,
        enrichment: buildValidV3Enrichment(oldProduct),
        updated_at: '2026-05-05T10:00:00.000Z',
      },
      {
        canonical_fingerprint: newProduct.canonical_product_id,
        canonical_product_id: newProduct.canonical_product_id,
        enrichment_version: CANONICAL_SEMANTIC_V3_VERSION,
        enrichment: buildValidV3Enrichment(newProduct),
        updated_at: '2026-05-05T12:00:00.000Z',
      },
      {
        canonical_fingerprint: v2Product.canonical_product_id,
        canonical_product_id: v2Product.canonical_product_id,
        enrichment_version: RICH_CANONICAL_ENRICHMENT_VERSION,
        enrichment: buildValidRichEnrichment(),
        updated_at: '2026-05-05T13:00:00.000Z',
      },
    ],
  });

  const result = await debugCanonicalEnrichment({
    store,
    latest: 1,
    version: CANONICAL_SEMANTIC_V3_VERSION,
  });

  assert.equal(result.mode, 'latest');
  assert.equal(result.latest, 1);
  assert.equal(result.version, CANONICAL_SEMANTIC_V3_VERSION);
  assert.deepEqual(result.results.map((entry) => entry.canonical_product_id), ['cp_debug_new']);
  assert.deepEqual(parseDebugEnrichmentArgs(['--latest', '10', '--version', CANONICAL_SEMANTIC_V3_VERSION]), {
    canonicalProductIds: [],
    latest: 10,
    version: CANONICAL_SEMANTIC_V3_VERSION,
  });
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

test('provider retry config defaults enrichment LLM timeout to five minutes', () => {
  const config = buildLlmRetryConfig({});

  assert.equal(config.requestTimeoutMs, 300000);
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
