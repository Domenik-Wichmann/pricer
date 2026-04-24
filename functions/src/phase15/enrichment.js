const {
  DEFAULT_GROK_ENDPOINT,
  DEFAULT_GROK_MODEL,
} = require('../phase6/constants');
const {
  getEnrichmentByFingerprint,
  storeEnrichment,
} = require('../phase1/store');

const ENRICHMENT_PROMPT_VERSION = 'v1';
const DEFAULT_ENRICHMENT_SAMPLE_LIMIT = 100;

const ENRICHMENT_SCHEMA_KEYS = Object.freeze([
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
  'attributes',
  'diet_tags',
  'allergens',
  'usage_context',
]);

const NULLABLE_STRING_FIELDS = Object.freeze([
  'category_l3',
  'category_l4',
  'brand',
  'product_line',
  'product_form',
  'packaging',
  'quality_tier',
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

function validateEnrichmentResponse(response) {
  const payload = parseEnrichmentPayload(response);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('enrichment response must be an object');
  }

  const keys = Object.keys(payload).sort();
  const expectedKeys = [...ENRICHMENT_SCHEMA_KEYS].sort();
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
    category_l1: categoryL1,
    category_l2: categoryL2,
    category_l3: categoryL3,
    category_l4: categoryL4,
    brand: normalizeNullableString(payload.brand, 'brand'),
    product_line: normalizeNullableString(payload.product_line, 'product_line'),
    flavor: normalizeArrayField(payload.flavor, 'flavor'),
    attributes: normalizeArrayField(payload.attributes, 'attributes'),
    diet_tags: normalizeArrayField(payload.diet_tags, 'diet_tags'),
    allergens: normalizeArrayField(payload.allergens, 'allergens'),
    product_form: normalizeNullableControlledValue(payload.product_form, ALLOWED_PRODUCT_FORMS, 'product_form'),
    packaging: normalizeNullableControlledValue(payload.packaging, ALLOWED_PACKAGING, 'packaging'),
    usage_context: normalizeArrayField(payload.usage_context, 'usage_context'),
    quality_tier: normalizeNullableControlledValue(payload.quality_tier, ALLOWED_QUALITY_TIERS, 'quality_tier'),
    confidence: Math.round(confidence * 10000) / 10000,
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

  return normalized;
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
      const enrichment = validateEnrichmentResponse(response);
      const record = storeEnrichment(state, canonicalFingerprint, enrichment, {
        modelName,
        promptVersion,
        createdAt: mappedAt,
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
  if (NULLABLE_STRING_FIELDS.includes(key)) {
    return 'string|null';
  }
  if (key === 'confidence') {
    return 'number 0..1';
  }
  return 'string';
}

module.exports = {
  CATEGORY_TREE,
  ENRICHMENT_PROMPT_VERSION,
  buildEnrichmentPrompt,
  isLlmEnrichmentEnabled,
  requestCanonicalEnrichment,
  syncCanonicalEnrichmentArtifacts,
  validateEnrichmentResponse,
};
