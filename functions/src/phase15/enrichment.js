const {
  DEFAULT_GROK_ENDPOINT,
  DEFAULT_GROK_MODEL,
} = require('../phase6/constants');
const {
  getEnrichmentByFingerprint,
  storeEnrichment,
} = require('../phase1/store');
const {
  extractExplicitDietAndAttributeTags,
  mergeDietAndAttributeClaims,
  normalizeDietAndAttributeTags,
} = require('./diet_attribute_normalization');

const ENRICHMENT_PROMPT_VERSION = 'v1';
const RICH_CANONICAL_ENRICHMENT_VERSION = 'canonical_semantic_v2';
const RICH_CANONICAL_PROMPT_VERSION = 'canonical_semantic_v2_prompt_v1';
const DEFAULT_ENRICHMENT_SAMPLE_LIMIT = 100;

const ENRICHMENT_SCHEMA_KEYS = Object.freeze([
  'base_product',
  'product_type',
  'product_family',
  'category',
  'subcategory',
  'category_l1',
  'category_l2',
  'category_l3',
  'category_l4',
  'is_food',
  'is_beverage',
  'is_personal_care',
  'brand',
  'brand_normalized',
  'product_line',
  'flavor',
  'flavor_terms',
  'attributes',
  'diet_tags',
  'allergens',
  'product_form',
  'packaging',
  'usage_context',
  'search_aliases_bg',
  'search_aliases_en',
  'exclusion_terms',
  'quality_tier',
  'confidence',
  'enrichment_source',
  'enrichment_version',
]);

const REQUIRED_ENRICHMENT_SCHEMA_KEYS = Object.freeze([
  'base_product',
  'category_l1',
  'category_l2',
  'category_l3',
  'category_l4',
  'brand',
  'product_line',
  'flavor',
  'attributes',
  'diet_tags',
  'allergens',
  'product_form',
  'packaging',
  'usage_context',
  'quality_tier',
  'confidence',
]);

const ARRAY_FIELDS = Object.freeze([
  'flavor',
  'flavor_terms',
  'attributes',
  'diet_tags',
  'allergens',
  'usage_context',
  'search_aliases_bg',
  'search_aliases_en',
  'exclusion_terms',
]);

const NULLABLE_STRING_FIELDS = Object.freeze([
  'category_l3',
  'category_l4',
  'product_type',
  'product_family',
  'category',
  'subcategory',
  'brand',
  'brand_normalized',
  'product_line',
  'product_form',
  'packaging',
  'quality_tier',
  'enrichment_source',
  'enrichment_version',
]);

const BOOLEAN_FIELDS = Object.freeze([
  'is_food',
  'is_beverage',
  'is_personal_care',
]);

const CATEGORY_TREE = Object.freeze({
  'Food & Beverage': Object.freeze({
    Dairy: Object.freeze(['Milk', 'Yogurt', 'Cheese', 'Butter', 'Cream']),
    Beverages: Object.freeze(['Water', 'Juice', 'Soft Drinks', 'Coffee', 'Tea', 'Beer', 'Wine', 'Spirits']),
    Snacks: Object.freeze(['Chips', 'Crackers', 'Nuts', 'Popcorn']),
    Bakery: Object.freeze(['Bread', 'Pastry', 'Cake', 'Biscuits']),
    Pantry: Object.freeze(['Pasta', 'Rice', 'Flour', 'Oil', 'Sauce', 'Canned Goods']),
    'Meat & Seafood': Object.freeze(['Meat', 'Fish', 'Seafood', 'Sausage']),
    Produce: Object.freeze(['Fruit', 'Vegetables', 'Herbs']),
    'Frozen Food': Object.freeze(['Frozen Meals', 'Frozen Vegetables', 'Ice Cream']),
    Condiments: Object.freeze(['Ketchup', 'Mustard', 'Mayonnaise', 'Dressing']),
    Sweets: Object.freeze(['Chocolate', 'Candy', 'Dessert']),
  }),
  Household: Object.freeze({
    'Cleaning Supplies': Object.freeze(['Soap', 'Detergent', 'Disinfectant', 'Surface Cleaner']),
    'Paper Goods': Object.freeze(['Toilet Paper', 'Paper Towels', 'Tissues', 'Napkins']),
    Laundry: Object.freeze(['Laundry Detergent', 'Fabric Softener', 'Stain Remover']),
    'Kitchen Supplies': Object.freeze(['Trash Bags', 'Foil', 'Wrap', 'Dish Soap']),
    'Home Care': Object.freeze(['Air Freshener', 'Candles', 'Batteries']),
  }),
  'Personal Care': Object.freeze({
    Hygiene: Object.freeze(['Soap', 'Shower Gel', 'Deodorant', 'Wet Wipes']),
    'Hair Care': Object.freeze(['Shampoo', 'Conditioner', 'Hair Styling']),
    'Skin Care': Object.freeze(['Cream', 'Lotion', 'Sunscreen']),
    'Oral Care': Object.freeze(['Toothpaste', 'Toothbrush', 'Mouthwash']),
    'Baby Care': Object.freeze(['Diapers', 'Baby Wipes', 'Baby Food', 'Infant Formula']),
  }),
  Health: Object.freeze({
    Medicine: Object.freeze(['Pain Relief', 'Cold Medicine', 'Allergy Medicine', 'Digestive Health']),
    'Vitamins & Supplements': Object.freeze(['Vitamins', 'Minerals', 'Protein', 'Supplements']),
    'First Aid': Object.freeze(['Bandages', 'Antiseptic', 'Medical Supplies']),
    Wellness: Object.freeze(['Herbal Remedies', 'Health Devices']),
  }),
  'Non-Food Misc': Object.freeze({
    'Pet Supplies': Object.freeze(['Pet Food', 'Pet Treats', 'Pet Care']),
    Stationery: Object.freeze(['Paper', 'Pens', 'Office Supplies']),
    Electronics: Object.freeze(['Batteries', 'Light Bulbs', 'Small Electronics']),
    Other: Object.freeze(['Miscellaneous']),
  }),
});

const CATEGORY_L4_VALUES = Object.freeze([
  'fresh',
  'uht',
  'whole',
  'low fat',
  'skimmed',
  'regular',
  'organic',
  'sugar free',
  'gluten free',
  'scented',
  'unscented',
  'premium',
  'budget',
]);

const PRODUCT_FORMS = Object.freeze([
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
]);

const PACKAGING_VALUES = Object.freeze([
  'bottle',
  'carton',
  'bag',
  'box',
  'can',
  'jar',
  'tube',
  'packet',
  'wrapper',
  'tray',
  'roll',
  'blister',
  'sachet',
  'tub',
]);

const QUALITY_TIERS = Object.freeze([
  'premium',
  'budget',
  'standard',
  'economy',
  'mid-tier',
]);

const ALLOWED_CATEGORY_L1 = normalizedSet(Object.keys(CATEGORY_TREE));
const ALLOWED_CATEGORY_L2 = normalizedSet(
  Object.values(CATEGORY_TREE).flatMap((category) => Object.keys(category))
);
const ALLOWED_CATEGORY_L3 = normalizedSet(
  Object.values(CATEGORY_TREE).flatMap((category) => Object.values(category).flat())
);
const ALLOWED_CATEGORY_L4 = normalizedSet(CATEGORY_L4_VALUES);
const ALLOWED_PRODUCT_FORMS = normalizedSet(PRODUCT_FORMS);
const ALLOWED_PACKAGING = normalizedSet(PACKAGING_VALUES);
const ALLOWED_QUALITY_TIERS = normalizedSet(QUALITY_TIERS);

const RICH_STRING_FIELDS = Object.freeze([
  'normalized_display_name_bg',
  'normalized_display_name_en',
  'manufacturer_or_brand_owner',
  'comparable_product_class',
  'variant_group_key',
  'serving_context',
  'dairy_type',
  'milk_source',
  'uht_or_fresh',
  'plain_or_flavored',
  'beverage_type',
  'age_band_label',
  'formula_stage',
  'baby_food_type',
  'shopping_family_id',
  'data_quality_status',
  'explanation_short',
  'reviewed_status',
  'size_marker',
]);

const RICH_ARRAY_FIELDS = Object.freeze([
  'brand_candidates',
  'category_path',
  'variant_attributes',
  'meal_role',
  'cooking_use',
  'diet_tags',
  'allergen_hints',
  'ingredient_hints',
  'synonym_terms',
  'negative_match_hints',
  'do_not_match_queries',
  'should_match_queries',
  'disambiguation_notes',
  'clarification_attributes',
  'likely_user_choice_attributes',
  'data_quality_reasons',
  'ambiguous_fields',
  'llm_uncertainty_reasons',
]);

const RICH_BOOLEAN_FIELDS = Object.freeze([
  'is_alcohol',
  'is_baby_product',
  'is_pet_product',
  'is_household',
  'is_medicine_or_supplement',
  'preparation_required',
  'ready_to_eat',
  'likely_dairy',
  'likely_meat',
  'likely_vegetarian',
  'likely_vegan',
  'gluten_related',
  'sugar_free',
  'low_fat',
  'wholegrain',
  'organic_bio',
  'lactose_free',
  'carbonated',
  'caffeine_related',
  'brand_preference_relevance',
  'size_preference_relevance',
  'flavor_preference_relevance',
  'needs_human_review',
]);

const RICH_NUMBER_FIELDS = Object.freeze([
  'pantry_staple_score',
  'package_quantity',
  'total_quantity',
  'multipack_count',
  'unit_quantity',
  'fat_percent',
  'alcohol_percent',
  'age_min_months',
  'age_max_months',
]);

const RICH_SCHEMA_KEYS = Object.freeze([
  'canonical_name_hash',
  'enrichment_source',
  'enrichment_version',
  'confidence',
  ...RICH_STRING_FIELDS,
  ...RICH_ARRAY_FIELDS,
  ...RICH_BOOLEAN_FIELDS,
  ...RICH_NUMBER_FIELDS,
  'storage_type',
  'package_unit',
  'total_unit',
  'unit_quantity_unit',
  'baby_stage',
]);

const RICH_ALLOWED_KEYS = Object.freeze([...new Set([
  ...ENRICHMENT_SCHEMA_KEYS,
  ...RICH_SCHEMA_KEYS,
])]);

const STORAGE_TYPES = Object.freeze(['shelf_stable', 'refrigerated', 'frozen', 'unknown']);
const QUANTITY_UNITS = Object.freeze(['g', 'kg', 'ml', 'l', 'pcs', 'unknown']);
const BABY_STAGES = Object.freeze(['stage_1', 'stage_2', 'stage_3', 'stage_4', 'unknown']);
const DATA_QUALITY_STATUSES = Object.freeze(['valid', 'warning', 'ambiguous', 'needs_review', 'invalid', 'unknown']);
const REVIEWED_STATUSES = Object.freeze(['unreviewed', 'reviewed', 'needs_review', 'rejected']);
const DAIRY_TYPES = Object.freeze(['milk', 'yogurt', 'cheese', 'sirene', 'kashkaval', 'butter', 'cream', 'unknown']);
const MILK_SOURCES = Object.freeze(['cow', 'sheep', 'goat', 'mixed', 'plant_based', 'unknown']);
const UHT_OR_FRESH = Object.freeze(['fresh', 'uht', 'unknown']);
const PLAIN_OR_FLAVORED = Object.freeze(['plain', 'flavored', 'unknown']);
const BEVERAGE_TYPES = Object.freeze([
  'water',
  'soft_drink',
  'cola',
  'juice',
  'energy_drink',
  'coffee',
  'tea',
  'alcohol',
  'unknown',
]);

function isLlmEnrichmentEnabled(env = process.env) {
  const raw = String(env.ENABLE_LLM_ENRICHMENT || '').trim().toLowerCase();
  if (!raw) {
    return true;
  }

  return raw === 'true';
}

function buildEnrichmentPrompt(productName, tokens = [], markers = {}) {
  return {
    prompt_version: ENRICHMENT_PROMPT_VERSION,
    task: 'Extract strict structured product meaning for one canonical product fingerprint.',
    input: {
      product_name: productName,
      tokens: normalizeArray(tokens),
      deterministic_markers: markers || {},
    },
    allowed_categories: CATEGORY_TREE,
    allowed_category_l4: CATEGORY_L4_VALUES,
    allowed_product_form: PRODUCT_FORMS,
    allowed_packaging: PACKAGING_VALUES,
    allowed_quality_tier: QUALITY_TIERS,
    instructions: [
      'Return valid JSON only.',
      'Follow the response schema exactly and do not invent fields.',
      'Choose category_l1, category_l2, category_l3, and category_l4 only from the allowed lists; use null for unknown optional category levels.',
      'Use deterministic markers only as read-only context. Do not override or restate volume, count, age band, or reserve markers.',
      'Infer base_product, category hierarchy, flavor, attributes, and usage_context from the product name and tokens.',
      'Only include diet_tags and diet or attribute claims such as organic, vegan, gluten free, lactose free, sugar free, low fat, or high protein when they are explicitly present in the product name or tokens.',
      'Use null for unknown nullable string fields and [] for unknown arrays.',
    ],
    response_schema: Object.fromEntries(ENRICHMENT_SCHEMA_KEYS.map((key) => [key, schemaHintForKey(key)])),
    example: {
      input: 'Low Fat Chocolate Milk 1L',
      output: {
        base_product: 'milk',
        category_l1: 'Food & Beverage',
        category_l2: 'Dairy',
        category_l3: 'Milk',
        category_l4: 'low fat',
        brand: null,
        product_line: null,
        flavor: ['chocolate'],
        attributes: ['low fat'],
        diet_tags: [],
        allergens: ['milk'],
        product_form: 'liquid',
        packaging: null,
        usage_context: ['breakfast', 'snack'],
        quality_tier: null,
        confidence: 0.92,
      },
    },
  };
}

function buildRichCanonicalEnrichmentBatchPrompt(products = []) {
  const responseSchema = Object.fromEntries(RICH_ALLOWED_KEYS.map((key) => [key, schemaHintForRichKey(key)]));
  return {
    prompt_version: RICH_CANONICAL_PROMPT_VERSION,
    enrichment_version: RICH_CANONICAL_ENRICHMENT_VERSION,
    task: 'Classify canonical product semantics for search, shopping intent, meal planning, basket optimization, filtering, and analytics.',
    scope_rules: [
      'This is metadata enrichment only.',
      'Do not merge canonical products.',
      'Do not change product ids, source rows, offers, prices, mappings, or canonical grouping.',
      'Return one product result for every input canonical_product_id and no extra products.',
      'Use null, unknown, false, or [] when the product name and deterministic markers do not strongly support a value.',
      'Do not invent brands, manufacturers, flavors, ingredients, dietary claims, package quantities, or nutrition claims.',
      'Distinguish fresh milk from yogurt, baby formula, milk-scented or milk-wording body care/shampoo, and Milka chocolate.',
      'Distinguish cola beverages from collagen, chocolate/шоколад substring matches, and shampoo/personal-care scent/flavor wording.',
      'Use validation-friendly enum values exactly where an enum is listed.',
      'Controlled enum fields must use only the listed values. Do not invent enum values; use null when unsure and null is allowed.',
    ],
    allowed_categories: CATEGORY_TREE,
    allowed_enums: {
      product_form: PRODUCT_FORMS,
      storage_type: STORAGE_TYPES,
      package_unit: QUANTITY_UNITS,
      total_unit: QUANTITY_UNITS,
      unit_quantity_unit: QUANTITY_UNITS,
      baby_stage: BABY_STAGES,
      data_quality_status: DATA_QUALITY_STATUSES,
      reviewed_status: REVIEWED_STATUSES,
      dairy_type: DAIRY_TYPES,
      milk_source: MILK_SOURCES,
      uht_or_fresh: UHT_OR_FRESH,
      plain_or_flavored: PLAIN_OR_FLAVORED,
      beverage_type: BEVERAGE_TYPES,
    },
    response_shape: {
      products: [{
        canonical_product_id: 'string; must exactly match one input id',
        enrichment: responseSchema,
      }],
    },
    products: products.map((product) => {
      const markers = parseCanonicalAttributes(product.canonical_attributes_json);
      return {
        canonical_product_id: product.canonical_product_id,
        canonical_name: product.canonical_display_name || null,
        source_example_name: product.source_example_name || null,
        canonical_brand: product.canonical_brand || null,
        canonical_product_type: product.canonical_product_type || null,
        canonical_category_code: product.canonical_category_code || null,
        deterministic_markers: {
          volume_marker: markers.volume_marker || null,
          count_marker: markers.count_marker || null,
          age_band_marker: markers.age_band_marker || null,
          reserve_marker: markers.reserve_marker || null,
          size_marker: markers.size_marker || null,
          core_tokens: markers.core_tokens || [],
        },
        canonical_name_hash: canonicalNameHashForProduct(product),
      };
    }),
  };
}

function validateEnrichmentResponse(response) {
  const payload = parseEnrichmentPayload(response);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('enrichment response must be an object');
  }

  const keys = Object.keys(payload).sort();
  const expectedKeys = [...REQUIRED_ENRICHMENT_SCHEMA_KEYS].sort();
  const extraKeys = keys.filter((key) => !ENRICHMENT_SCHEMA_KEYS.includes(key));
  const missingKeys = expectedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(payload, key));
  if (extraKeys.length > 0) {
    throw new Error(`enrichment response has uncontrolled fields: ${extraKeys.join(', ')}`);
  }
  if (missingKeys.length > 0) {
    throw new Error(`enrichment response missing fields: ${missingKeys.join(', ')}`);
  }

  const baseProduct = normalizeScalar(payload.base_product);
  if (!baseProduct) {
    throw new Error('enrichment response missing base_product');
  }

  const categoryL1 = normalizeRequiredControlledValue(
    payload.category_l1,
    ALLOWED_CATEGORY_L1,
    'category_l1'
  );
  const categoryL2 = normalizeRequiredControlledValue(
    payload.category_l2,
    allowedCategoryL2ForL1(categoryL1),
    'category_l2'
  );
  const categoryL3 = normalizeNullableControlledValue(
    payload.category_l3,
    allowedCategoryL3ForL2(categoryL1, categoryL2),
    'category_l3'
  );
  const categoryL4 = normalizeNullableControlledValue(payload.category_l4, ALLOWED_CATEGORY_L4, 'category_l4');

  const confidence = payload.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('enrichment response confidence must be a number from 0 to 1');
  }

  const normalized = {
    base_product: baseProduct,
    product_type: normalizeNullableString(payload.product_type ?? baseProduct, 'product_type'),
    product_family: normalizeNullableString(payload.product_family ?? payload.category_l2, 'product_family'),
    category: normalizeNullableString(payload.category ?? payload.category_l2, 'category'),
    subcategory: normalizeNullableString(payload.subcategory ?? payload.category_l3, 'subcategory'),
    category_l1: categoryL1,
    category_l2: categoryL2,
    category_l3: categoryL3,
    category_l4: categoryL4,
    is_food: normalizeBooleanField(payload.is_food, categoryL1 === 'food & beverage'),
    is_beverage: normalizeBooleanField(payload.is_beverage, categoryL2 === 'beverages'),
    is_personal_care: normalizeBooleanField(payload.is_personal_care, categoryL1 === 'personal care'),
    brand: normalizeNullableString(payload.brand, 'brand'),
    brand_normalized: normalizeNullableString(payload.brand_normalized ?? payload.brand, 'brand_normalized'),
    product_line: normalizeNullableString(payload.product_line, 'product_line'),
    flavor: normalizeArrayField(payload.flavor, 'flavor'),
    flavor_terms: normalizeArrayField(payload.flavor_terms ?? payload.flavor, 'flavor_terms'),
    attributes: normalizeDietAndAttributeTags({
      attributes: normalizeArrayField(payload.attributes, 'attributes'),
    }).attributes,
    diet_tags: normalizeDietAndAttributeTags({
      dietTags: normalizeArrayField(payload.diet_tags, 'diet_tags'),
    }).diet_tags,
    allergens: normalizeArrayField(payload.allergens, 'allergens'),
    product_form: normalizeNullableControlledValue(payload.product_form, ALLOWED_PRODUCT_FORMS, 'product_form'),
    packaging: normalizeNullableControlledValue(payload.packaging, ALLOWED_PACKAGING, 'packaging'),
    usage_context: normalizeArrayField(payload.usage_context, 'usage_context'),
    search_aliases_bg: normalizeArrayField(payload.search_aliases_bg ?? [], 'search_aliases_bg'),
    search_aliases_en: normalizeArrayField(payload.search_aliases_en ?? [], 'search_aliases_en'),
    exclusion_terms: normalizeArrayField(payload.exclusion_terms ?? [], 'exclusion_terms'),
    quality_tier: normalizeNullableControlledValue(payload.quality_tier, ALLOWED_QUALITY_TIERS, 'quality_tier'),
    confidence: Math.round(confidence * 10000) / 10000,
    enrichment_source: normalizeNullableString(payload.enrichment_source ?? null, 'enrichment_source'),
    enrichment_version: normalizeNullableString(payload.enrichment_version ?? ENRICHMENT_PROMPT_VERSION, 'enrichment_version'),
  };

  NULLABLE_STRING_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(normalized, field)) {
      throw new Error(`enrichment response missing nullable field: ${field}`);
    }
  });

  ARRAY_FIELDS.forEach((field) => {
    if (!Array.isArray(normalized[field])) {
      throw new Error(`enrichment response field must be an array: ${field}`);
    }
  });
  BOOLEAN_FIELDS.forEach((field) => {
    if (typeof normalized[field] !== 'boolean') {
      throw new Error(`enrichment response field must be boolean: ${field}`);
    }
  });

  return normalized;
}

function validateRichCanonicalEnrichmentResponse(response, {
  canonicalProduct = null,
  validationWarnings = null,
} = {}) {
  const parsedPayload = parseEnrichmentPayload(response);
  const payload = normalizeRichNearMissPayload(parsedPayload, validationWarnings);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('rich enrichment response must be an object');
  }

  const extraKeys = Object.keys(payload).filter((key) => !RICH_ALLOWED_KEYS.includes(key));
  if (extraKeys.length > 0) {
    throw new Error(`rich enrichment response has uncontrolled fields: ${extraKeys.join(', ')}`);
  }

  const legacyPayload = {};
  ENRICHMENT_SCHEMA_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      legacyPayload[key] = payload[key];
    }
  });
  const normalized = validateEnrichmentResponse({
    ...legacyPayload,
    enrichment_source: payload.enrichment_source || legacyPayload.enrichment_source || 'llm',
    enrichment_version: payload.enrichment_version || RICH_CANONICAL_ENRICHMENT_VERSION,
  });

  normalized.enrichment_version = normalizeNullableString(
    payload.enrichment_version || RICH_CANONICAL_ENRICHMENT_VERSION,
    'enrichment_version'
  );
  if (normalized.enrichment_version !== RICH_CANONICAL_ENRICHMENT_VERSION) {
    throw new Error(`invalid enrichment_version: ${payload.enrichment_version}`);
  }
  normalized.enrichment_source = normalizeNullableString(payload.enrichment_source || 'llm', 'enrichment_source');
  normalized.canonical_name_hash = normalizeNullableString(
    payload.canonical_name_hash || (canonicalProduct ? canonicalNameHashForProduct(canonicalProduct) : null),
    'canonical_name_hash'
  );

  RICH_STRING_FIELDS.forEach((field) => {
    normalized[field] = normalizeRichString(payload[field], field);
  });
  RICH_ARRAY_FIELDS.forEach((field) => {
    normalized[field] = normalizeRichArray(payload[field], field);
  });
  RICH_BOOLEAN_FIELDS.forEach((field) => {
    normalized[field] = normalizeRichBoolean(payload[field], field);
  });
  RICH_NUMBER_FIELDS.forEach((field) => {
    normalized[field] = normalizeRichNumber(payload[field], field);
  });

  normalized.storage_type = normalizeRichEnum(payload.storage_type, STORAGE_TYPES, 'storage_type');
  normalized.package_unit = normalizeRichEnum(payload.package_unit, QUANTITY_UNITS, 'package_unit');
  normalized.total_unit = normalizeRichEnum(payload.total_unit, QUANTITY_UNITS, 'total_unit');
  normalized.unit_quantity_unit = normalizeRichEnum(payload.unit_quantity_unit, QUANTITY_UNITS, 'unit_quantity_unit');
  normalized.baby_stage = normalizeRichEnum(payload.baby_stage, BABY_STAGES, 'baby_stage');
  normalized.data_quality_status = normalizeRichEnum(
    payload.data_quality_status || 'unknown',
    DATA_QUALITY_STATUSES,
    'data_quality_status'
  );
  normalized.reviewed_status = normalizeRichEnum(
    payload.reviewed_status || 'unreviewed',
    REVIEWED_STATUSES,
    'reviewed_status'
  );
  normalized.dairy_type = normalizeRichEnum(payload.dairy_type, DAIRY_TYPES, 'dairy_type');
  normalized.milk_source = normalizeRichEnum(payload.milk_source, MILK_SOURCES, 'milk_source');
  normalized.uht_or_fresh = normalizeRichEnum(payload.uht_or_fresh, UHT_OR_FRESH, 'uht_or_fresh');
  normalized.plain_or_flavored = normalizeRichEnum(payload.plain_or_flavored, PLAIN_OR_FLAVORED, 'plain_or_flavored');
  normalized.beverage_type = normalizeRichEnum(payload.beverage_type, BEVERAGE_TYPES, 'beverage_type');

  validateRichSemanticConsistency(normalized);
  return normalized;
}

function validateRichCanonicalEnrichmentBatchResponse(response, {
  products = [],
} = {}) {
  const { rows, expectedById } = validateRichCanonicalEnrichmentBatchShape(response, {
    products,
  });
  return rows.map((entry) => {
    const id = typeof entry?.canonical_product_id === 'string' ? entry.canonical_product_id.trim() : '';
    const product = expectedById.get(id);
    return {
      canonical_product_id: id,
      enrichment: validateRichCanonicalEnrichmentResponse(entry.enrichment, {
        canonicalProduct: product,
      }),
    };
  });
}

function validateRichCanonicalEnrichmentBatchResponseDetailed(response, {
  products = [],
} = {}) {
  const { rows, expectedById } = validateRichCanonicalEnrichmentBatchShape(response, {
    products,
  });
  const valid = [];
  const rejected = [];

  rows.forEach((entry) => {
    const id = typeof entry?.canonical_product_id === 'string' ? entry.canonical_product_id.trim() : '';
    const product = expectedById.get(id);
    const validationWarnings = [];
    try {
      valid.push({
        canonical_product_id: id,
        enrichment: validateRichCanonicalEnrichmentResponse(entry.enrichment, {
          canonicalProduct: product,
          validationWarnings,
        }),
        validation_warnings: validationWarnings,
      });
    } catch (error) {
      rejected.push({
        canonical_product_id: id,
        error_type: 'validation_error',
        message: error.message,
        ...summarizeRejectedEnrichmentField(error, entry?.enrichment),
      });
    }
  });

  return {
    valid,
    rejected,
  };
}

function validateRichCanonicalEnrichmentBatchShape(response, {
  products = [],
} = {}) {
  const payload = parseEnrichmentPayload(response);
  const rows = Array.isArray(payload) ? payload : payload?.products;
  if (!Array.isArray(rows)) {
    throw new Error('rich batch enrichment response must contain products[]');
  }
  if (rows.length !== products.length) {
    throw new Error(`rich batch enrichment response count mismatch: expected ${products.length}, got ${rows.length}`);
  }

  const expectedById = new Map(products.map((product) => [product.canonical_product_id, product]));
  const seen = new Set();
  rows.forEach((entry) => {
    const id = typeof entry?.canonical_product_id === 'string' ? entry.canonical_product_id.trim() : '';
    if (!expectedById.has(id)) {
      throw new Error(`rich batch enrichment response returned unexpected product id: ${id || '<missing>'}`);
    }
    if (seen.has(id)) {
      throw new Error(`rich batch enrichment response returned duplicate product id: ${id}`);
    }
    seen.add(id);
  });

  return {
    rows,
    expectedById,
  };
}

async function syncCanonicalEnrichmentArtifacts({
  state,
  canonicalProducts = [],
  mappedAt = new Date().toISOString(),
  canonicalEnrichmentClient = null,
  enableNetwork = isLlmEnrichmentEnabled(),
  fetchImpl = fetch,
  apiKey = process.env.XAI_API_KEY,
  endpoint = DEFAULT_GROK_ENDPOINT,
  modelName = process.env.XAI_GROK_MODEL || DEFAULT_GROK_MODEL,
  promptVersion = ENRICHMENT_PROMPT_VERSION,
  sampleLimit = DEFAULT_ENRICHMENT_SAMPLE_LIMIT,
} = {}) {
  state.canonical_enrichment_store = state.canonical_enrichment_store || [];
  const metrics = createEnrichmentMetrics();
  const enrichmentByFingerprint = new Map(
    state.canonical_enrichment_store.map((record) => [record.canonical_fingerprint, record])
  );
  const samples = [];

  for (const product of canonicalProducts) {
    const canonicalFingerprint = product.canonical_product_id;
    if (!canonicalFingerprint) {
      continue;
    }

    const cached = enrichmentByFingerprint.get(canonicalFingerprint) ||
      getEnrichmentByFingerprint(state, canonicalFingerprint);
    if (cached) {
      metrics.reused_count += 1;
      pushEnrichmentSample(samples, product, cached, sampleLimit);
      continue;
    }

    const prompt = buildPromptForCanonicalProduct(product);
    if (!canonicalEnrichmentClient && !enableNetwork) {
      metrics.offline_missing_count += 1;
      metrics.errors.push({
        canonical_fingerprint: canonicalFingerprint,
        message: 'llm_enrichment_disabled',
      });
      continue;
    }

    if (!canonicalEnrichmentClient && !apiKey) {
      metrics.offline_missing_count += 1;
      metrics.errors.push({
        canonical_fingerprint: canonicalFingerprint,
        message: 'missing_xai_api_key',
      });
      continue;
    }

    metrics.model_call_count += 1;
    try {
      const response = canonicalEnrichmentClient
        ? await canonicalEnrichmentClient({
          canonical_fingerprint: canonicalFingerprint,
          canonical_product: product,
          prompt,
        })
        : await requestCanonicalEnrichment({
          prompt,
          fetchImpl,
          apiKey,
          endpoint,
          modelName,
        });
      const explicitClaims = extractExplicitDietAndAttributeTags(getExplicitClaimSourceText(product));
      const enrichment = mergeDietAndAttributeClaims(
        validateEnrichmentResponse(response),
        explicitClaims
      );
      const record = storeEnrichment(state, canonicalFingerprint, enrichment, {
        modelName,
        promptVersion,
        createdAt: mappedAt,
        explicitClaimEvidence: explicitClaims.evidence,
      });
      enrichmentByFingerprint.set(canonicalFingerprint, record);
      metrics.created_count += 1;
      pushEnrichmentSample(samples, product, record, sampleLimit);
    } catch (error) {
      metrics.rejected_count += 1;
      metrics.errors.push({
        canonical_fingerprint: canonicalFingerprint,
        message: error.message,
      });
    }
  }

  metrics.total_count = state.canonical_enrichment_store.length;
  metrics.coverage_count = canonicalProducts.filter(
    (product) => enrichmentByFingerprint.has(product.canonical_product_id)
  ).length;
  metrics.sample = samples;

  return metrics;
}

function getExplicitClaimSourceText(product) {
  return [
    product?.canonical_display_name,
    product?.source_example_name,
  ].filter(Boolean).join(' ');
}

async function requestCanonicalEnrichment({
  prompt,
  fetchImpl = fetch,
  apiKey = process.env.XAI_API_KEY,
  endpoint = DEFAULT_GROK_ENDPOINT,
  modelName = process.env.XAI_GROK_MODEL || DEFAULT_GROK_MODEL,
}) {
  if (!apiKey) {
    throw new Error('XAI_API_KEY is required for LLM enrichment');
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'You enrich canonical product meaning. Return strict JSON only.',
        },
        {
          role: 'user',
          content: JSON.stringify(prompt),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`enrichment request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('enrichment model response missing content');
  }

  return parseEnrichmentPayload(content);
}

function buildPromptForCanonicalProduct(product) {
  const attributes = parseCanonicalAttributes(product.canonical_attributes_json);
  return buildEnrichmentPrompt(
    product.canonical_display_name || product.source_example_name || '',
    attributes.core_tokens || [],
    {
      volume_marker: attributes.volume_marker || null,
      count_marker: attributes.count_marker || null,
      age_band_marker: attributes.age_band_marker || null,
      reserve_marker: attributes.reserve_marker || null,
    }
  );
}

function parseCanonicalAttributes(value) {
  if (!value || typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function canonicalNameHashForProduct(product) {
  const crypto = require('node:crypto');
  return crypto
    .createHash('sha256')
    .update([
      product?.canonical_product_id || '',
      product?.canonical_display_name || '',
      product?.source_example_name || '',
    ].join('|'))
    .digest('hex');
}

function parseEnrichmentPayload(response) {
  if (typeof response === 'string') {
    return JSON.parse(stripJsonCodeFence(response.trim()));
  }

  return response;
}

function stripJsonCodeFence(content) {
  return content
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
}

function createEnrichmentMetrics() {
  return {
    total_count: 0,
    coverage_count: 0,
    created_count: 0,
    reused_count: 0,
    model_call_count: 0,
    rejected_count: 0,
    offline_missing_count: 0,
    errors: [],
    sample: [],
  };
}

function pushEnrichmentSample(samples, product, record, limit) {
  if (samples.length >= limit) {
    return;
  }

  samples.push({
    canonical_fingerprint: record.canonical_fingerprint,
    canonical_product_id: product.canonical_product_id,
    canonical_display_name: product.canonical_display_name || null,
    enrichment: record.enrichment,
  });
}

function allowedCategoryL2ForL1(categoryL1) {
  const canonicalL1 = resolveControlledDisplayValue(categoryL1, Object.keys(CATEGORY_TREE));
  return normalizedSet(Object.keys(CATEGORY_TREE[canonicalL1] || {}));
}

function allowedCategoryL3ForL2(categoryL1, categoryL2) {
  const canonicalL1 = resolveControlledDisplayValue(categoryL1, Object.keys(CATEGORY_TREE));
  const l2Values = Object.keys(CATEGORY_TREE[canonicalL1] || {});
  const canonicalL2 = resolveControlledDisplayValue(categoryL2, l2Values);
  return normalizedSet((CATEGORY_TREE[canonicalL1] || {})[canonicalL2] || []);
}

function normalizeRequiredControlledValue(value, allowed, fieldName) {
  const normalized = normalizeScalar(value);
  if (!normalized) {
    throw new Error(`enrichment response missing ${fieldName}`);
  }
  if (!allowed.has(normalized)) {
    throw new Error(`invalid ${fieldName}: ${value}`);
  }
  return normalized;
}

function normalizeNullableControlledValue(value, allowed, fieldName) {
  if (value === null) {
    return null;
  }
  const normalized = normalizeNullableString(value, fieldName);
  if (normalized === null) {
    return null;
  }
  if (!allowed.has(normalized)) {
    throw new Error(`invalid ${fieldName}: ${value}`);
  }
  return normalized;
}

function normalizeNullableString(value, fieldName) {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`enrichment response ${fieldName} must be a string or null`);
  }
  return normalizeScalar(value) || null;
}

function normalizeArrayField(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`enrichment response ${fieldName} must be an array`);
  }

  return normalizeArray(value);
}

function normalizeBooleanField(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return Boolean(defaultValue);
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  throw new Error('enrichment response boolean fields must be true or false');
}

function normalizeArray(value) {
  const seen = new Set();
  const normalized = [];
  (Array.isArray(value) ? value : []).forEach((entry) => {
    if (typeof entry !== 'string') {
      return;
    }

    const item = normalizeScalar(entry);
    if (item && !seen.has(item)) {
      seen.add(item);
      normalized.push(item);
    }
  });

  return normalized;
}

function normalizeScalar(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function normalizedSet(values) {
  return new Set(values.map((value) => normalizeScalar(value)).filter(Boolean));
}

function resolveControlledDisplayValue(normalizedValue, displayValues) {
  const target = normalizeScalar(normalizedValue);
  return displayValues.find((value) => normalizeScalar(value) === target) || null;
}

function schemaHintForKey(key) {
  if (ARRAY_FIELDS.includes(key)) {
    return 'string[]';
  }
  if (BOOLEAN_FIELDS.includes(key)) {
    return 'boolean';
  }
  if (NULLABLE_STRING_FIELDS.includes(key)) {
    return 'string|null';
  }
  if (key === 'confidence') {
    return 'number 0..1';
  }
  return 'string';
}

function schemaHintForRichKey(key) {
  if (RICH_ARRAY_FIELDS.includes(key) || ARRAY_FIELDS.includes(key)) {
    return 'bounded string[]';
  }
  if (RICH_BOOLEAN_FIELDS.includes(key) || BOOLEAN_FIELDS.includes(key)) {
    return 'boolean|null for rich optional fields';
  }
  if (RICH_NUMBER_FIELDS.includes(key)) {
    return 'number|null';
  }
  if (key === 'confidence') {
    return 'number 0..1';
  }
  if (key === 'product_form') {
    return `${PRODUCT_FORMS.join('|')}|null`;
  }
  if (key === 'storage_type') {
    return STORAGE_TYPES.join('|');
  }
  if (['package_unit', 'total_unit', 'unit_quantity_unit'].includes(key)) {
    return QUANTITY_UNITS.join('|');
  }
  if (key === 'baby_stage') {
    return BABY_STAGES.join('|');
  }
  if (key === 'data_quality_status') {
    return DATA_QUALITY_STATUSES.join('|');
  }
  if (key === 'reviewed_status') {
    return REVIEWED_STATUSES.join('|');
  }
  if (key === 'dairy_type') {
    return DAIRY_TYPES.join('|');
  }
  if (key === 'milk_source') {
    return MILK_SOURCES.join('|');
  }
  if (key === 'uht_or_fresh') {
    return UHT_OR_FRESH.join('|');
  }
  if (key === 'plain_or_flavored') {
    return PLAIN_OR_FLAVORED.join('|');
  }
  if (key === 'beverage_type') {
    return BEVERAGE_TYPES.join('|');
  }
  return schemaHintForKey(key);
}

function normalizeRichString(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`rich enrichment response ${fieldName} must be a string or null`);
  }
  const normalized = normalizeScalar(value);
  if (!normalized || normalized === 'unknown') {
    return normalized || null;
  }
  if (normalized.length > 160) {
    throw new Error(`rich enrichment response ${fieldName} exceeds max length`);
  }
  return normalized;
}

function normalizeRichArray(value, fieldName) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`rich enrichment response ${fieldName} must be an array`);
  }
  if (value.length > 24) {
    throw new Error(`rich enrichment response ${fieldName} has too many entries`);
  }
  return normalizeArray(value).slice(0, 24).filter((entry) => entry.length <= 120);
}

function normalizeRichBoolean(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`rich enrichment response ${fieldName} must be boolean or null`);
  }
  return value;
}

function normalizeRichNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`rich enrichment response ${fieldName} must be a finite number or null`);
  }
  if (['pantry_staple_score'].includes(fieldName) && (value < 0 || value > 1)) {
    throw new Error(`rich enrichment response ${fieldName} must be from 0 to 1`);
  }
  if (['age_min_months', 'age_max_months'].includes(fieldName) && (value < 0 || value > 240)) {
    throw new Error(`rich enrichment response ${fieldName} must be a plausible month age`);
  }
  if (value < 0 && !['alcohol_percent'].includes(fieldName)) {
    throw new Error(`rich enrichment response ${fieldName} must be nonnegative`);
  }
  return Math.round(value * 10000) / 10000;
}

function normalizeRichEnum(value, allowedValues, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`rich enrichment response ${fieldName} must be a string enum or null`);
  }
  const normalized = normalizeScalar(value);
  if (!normalized) {
    return null;
  }
  const allowed = normalizedSet(allowedValues);
  if (!allowed.has(normalized)) {
    throw new Error(`invalid ${fieldName}: ${value}`);
  }
  return normalized;
}

function normalizeRichNearMissPayload(payload, validationWarnings = null) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const originalProductForm = payload.product_form;
  if (isUnsupportedProductFormNearMiss(originalProductForm)) {
    if (Array.isArray(validationWarnings)) {
      validationWarnings.push({
        field: 'product_form',
        original_value: originalProductForm,
        normalized_value: null,
        reason: 'unsupported_near_miss_product_form',
      });
    }
    return {
      ...payload,
      product_form: null,
    };
  }

  return payload;
}

function isUnsupportedProductFormNearMiss(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = normalizeScalar(value);
  return normalized === 'semi-solid' || normalized === 'semi solid';
}

function summarizeRejectedEnrichmentField(error, enrichment) {
  const message = String(error?.message || '');
  const invalidMatch = message.match(/^invalid\s+([a-z0-9_]+):\s*(.+)$/iu);
  if (invalidMatch) {
    const field = invalidMatch[1];
    return {
      field,
      original_value: safeRejectedValue(enrichment?.[field] ?? invalidMatch[2]),
      reason: 'invalid_controlled_value',
    };
  }

  const typeMatch = message.match(/rich enrichment response\s+([a-z0-9_]+)\s+must/iu);
  if (typeMatch) {
    const field = typeMatch[1];
    return {
      field,
      original_value: safeRejectedValue(enrichment?.[field]),
      reason: 'invalid_field_type',
    };
  }

  return {
    reason: 'validation_error',
  };
}

function safeRejectedValue(value) {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value).slice(0, 240);
}

function validateRichSemanticConsistency(enrichment) {
  if (enrichment.is_personal_care === true && enrichment.is_food === true) {
    throw new Error('rich enrichment cannot mark the same product as personal care and food');
  }
  if (enrichment.beverage_type === 'cola' && enrichment.is_beverage === false) {
    throw new Error('rich enrichment cola beverage_type requires is_beverage true');
  }
  if (enrichment.dairy_type === 'milk' && enrichment.is_personal_care === true) {
    throw new Error('rich enrichment milk dairy_type cannot be personal care');
  }
}

module.exports = {
  CATEGORY_TREE,
  ENRICHMENT_PROMPT_VERSION,
  RICH_CANONICAL_ENRICHMENT_VERSION,
  RICH_CANONICAL_PROMPT_VERSION,
  RICH_ALLOWED_KEYS,
  buildRichCanonicalEnrichmentBatchPrompt,
  buildEnrichmentPrompt,
  isLlmEnrichmentEnabled,
  requestCanonicalEnrichment,
  syncCanonicalEnrichmentArtifacts,
  validateRichCanonicalEnrichmentBatchResponse,
  validateRichCanonicalEnrichmentBatchResponseDetailed,
  validateRichCanonicalEnrichmentResponse,
  validateEnrichmentResponse,
  extractExplicitDietAndAttributeTags,
  normalizeDietAndAttributeTags,
};
