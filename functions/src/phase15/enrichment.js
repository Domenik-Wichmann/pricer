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
const {
  CANONICAL_SEMANTIC_V3_PROMPT_VERSION,
  CANONICAL_SEMANTIC_V3_VERSION,
  REGISTRY_ACTIONS,
  SEMANTIC_REGISTRY_DOMAINS,
  buildRegistryContext,
  normalizeRegistryAction,
} = require('./semantic_registry');

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
    Dairy: Object.freeze(['Milk', 'Yogurt', 'Cheese', 'Sirene', 'Kashkaval', 'Butter', 'Cream']),
    Beverages: Object.freeze(['Water', 'Juice', 'Soft Drinks', 'Coffee', 'Tea', 'Beer', 'Wine', 'Spirits']),
    Snacks: Object.freeze(['Chips', 'Crackers', 'Nuts', 'Popcorn']),
    Bakery: Object.freeze(['Bread', 'Pastry', 'Cake', 'Biscuits']),
    Pantry: Object.freeze(['Pasta', 'Rice', 'Flour', 'Oil', 'Sauce', 'Canned Goods']),
    Meat: Object.freeze(['Beef', 'Pork', 'Chicken', 'Sausage']),
    'Meat & Seafood': Object.freeze(['Meat', 'Beef', 'Pork', 'Chicken', 'Fish', 'Seafood', 'Sausage']),
    Produce: Object.freeze(['Fruit', 'Vegetables', 'Herbs']),
    'Frozen Food': Object.freeze(['Frozen Meals', 'Frozen Vegetables', 'Ice Cream']),
    Condiments: Object.freeze(['Ketchup', 'Mustard', 'Mayonnaise', 'Dressing']),
    Sweets: Object.freeze(['Chocolate', 'Candy', 'Dessert']),
  }),
  Household: Object.freeze({
    Cleaning: Object.freeze(['Detergent', 'Surface Cleaner', 'Disinfectant', 'Dish Soap']),
    'Cleaning Supplies': Object.freeze(['Soap', 'Detergent', 'Disinfectant', 'Surface Cleaner']),
    'Paper Goods': Object.freeze(['Toilet Paper', 'Paper Towels', 'Tissues', 'Napkins']),
    Laundry: Object.freeze(['Laundry Detergent', 'Fabric Softener', 'Stain Remover']),
    Hygiene: Object.freeze(['Toilet Paper', 'Paper Towels', 'Tissues', 'Napkins']),
    'Kitchen Supplies': Object.freeze(['Trash Bags', 'Foil', 'Wrap', 'Dish Soap']),
    'Home Care': Object.freeze(['Air Freshener', 'Candles', 'Batteries']),
  }),
  'Personal Care': Object.freeze({
    Hygiene: Object.freeze(['Soap', 'Shower Gel', 'Deodorant', 'Wet Wipes']),
    'Hair Care': Object.freeze(['Shampoo', 'Conditioner', 'Hair Styling']),
    'Skin Care': Object.freeze(['Cream', 'Lotion', 'Sunscreen']),
    'Oral Care': Object.freeze(['Toothpaste', 'Toothbrush', 'Mouthwash']),
    'Baby Care': Object.freeze(['Diapers', 'Baby Wipes']),
  }),
  'Baby & Kids': Object.freeze({
    'Baby Food': Object.freeze(['Puree', 'Infant Formula', 'Baby Cereal', 'Baby Snacks']),
    'Baby Care': Object.freeze(['Diapers', 'Baby Wipes', 'Baby Shampoo']),
    Kids: Object.freeze(['Kids Hygiene', 'Kids Snacks']),
  }),
  'Pet Care': Object.freeze({
    'Pet Food': Object.freeze(['Cat Food', 'Dog Food', 'Pet Treats']),
    'Pet Care': Object.freeze(['Pet Hygiene', 'Litter', 'Pet Shampoo']),
  }),
  'Home Appliances': Object.freeze({
    'Cleaning Appliances': Object.freeze(['Vacuum Cleaner', 'Robot Vacuum', 'Steam Cleaner']),
    'Kitchen Appliances': Object.freeze(['Kettle', 'Coffee Machine', 'Blender']),
    'Climate Appliances': Object.freeze(['Fan', 'Heater', 'Air Purifier']),
  }),
  Health: Object.freeze({
    Medicine: Object.freeze(['Pain Relief', 'Cold Medicine', 'Allergy Medicine', 'Digestive Health']),
    'Vitamins & Supplements': Object.freeze(['Vitamins', 'Minerals', 'Protein', 'Supplements']),
    'First Aid': Object.freeze(['Bandages', 'Antiseptic', 'Medical Supplies']),
    Wellness: Object.freeze(['Herbal Remedies', 'Health Devices']),
  }),
  'Non-Food Misc': Object.freeze({
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

const V3_ENRICHMENT_KEYS = Object.freeze([
  'schema_version',
  'product_identity',
  'taxonomy_classification',
  'category',
  'packaging',
  'product_form',
  'attributes',
  'semantic_usage_profile',
  'semantic_embedding_summary',
  'registry_actions',
  'warnings',
  'confidence_overall',
  'needs_human_review',
]);

const V3_REQUIRED_ENRICHMENT_KEYS = Object.freeze(V3_ENRICHMENT_KEYS.filter((key) =>
  !['taxonomy_classification', 'semantic_usage_profile', 'semantic_embedding_summary'].includes(key)
));

const V3_PRODUCT_IDENTITY_KEYS = Object.freeze([
  'canonical_product_id',
  'canonical_name_hash',
  'observed_name',
  'observed_brand',
  'brand_confidence',
  'brand_needs_review',
]);

const V3_SEMANTIC_SECTION_KEYS = Object.freeze([
  'raw_terms',
  'description',
  'registry_match',
  'proposed_aliases',
  'proposed_new_term',
  'search_bucket',
  'confidence',
  'needs_review',
  'evidence',
]);

const V3_CATEGORY_KEYS = Object.freeze([
  'raw_terms',
  'category_path_raw',
  'registry_matches',
  'proposed_terms',
  'search_buckets',
  'needs_review',
]);

const V3_TAXONOMY_CLASSIFICATION_KEYS = Object.freeze([
  'taxonomy_path_raw',
  'taxonomy_path_term_ids',
  'taxonomy_path_labels',
  'primary_taxonomy_term_id',
  'primary_taxonomy_label',
  'raw_category_terms',
  'registry_matches',
  'proposed_terms',
  'confidence',
  'needs_review',
  'evidence',
]);

const V3_TAXONOMY_PROPOSED_TERM_KEYS = Object.freeze([
  'proposed_label',
  'parent_term_id',
  'parent_label',
  'aliases',
  'confidence',
  'evidence',
  'reason',
]);

const V3_ATTRIBUTES_KEYS = Object.freeze([
  'dairy',
  'personal_care',
  'beverage',
  'household',
  'nutrition_claims',
  'dietary_claims',
  'flavor_terms',
  'preparation_state',
  'storage',
  'quantity',
]);

const V3_SEMANTIC_USAGE_PROFILE_KEYS = Object.freeze([
  'cuisine_contexts',
  'flavor_profile',
  'culinary_roles',
  'dish_roles',
  'meal_contexts',
  'common_uses',
  'preparation_contexts',
  'pairing_suggestions',
  'substitute_terms',
  'consumer_search_intents',
  'not_for',
  'confidence',
  'evidence',
  'needs_review',
]);

const V3_FLAVOR_PROFILE_KEYS = Object.freeze([
  'primary_tastes',
  'descriptors',
  'intensity',
]);

const V3_SEMANTIC_EMBEDDING_SUMMARY_KEYS = Object.freeze([
  'summary',
  'summary_language',
  'included_aspects',
  'evidence',
  'confidence',
  'needs_review',
]);

const V3_SUMMARY_LANGUAGES = Object.freeze(['en', 'bg', 'mixed', 'unknown']);
const DEFAULT_LLM_MAX_EVIDENCE_ITEMS_PER_FIELD = 3;
const V3_SUMMARY_MAX_WORDS = 120;
const V3_SUMMARY_MAX_SENTENCES = 2;
const UNSUPPORTED_SUMMARY_CLAIM_PATTERNS = Object.freeze([
  /\borganic\b|\bbio\b/iu,
  /\blactose[-\s]?free\b/iu,
  /\bgluten[-\s]?free\b/iu,
  /\bsugar[-\s]?free\b/iu,
  /\bvegan\b/iu,
  /\bhalal\b/iu,
  /\bbaby[-\s]?safe\b/iu,
]);

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

const FOOD_CATEGORY_LABELS = new Set([
  'food_beverage',
  'dairy',
  'milk',
  'yogurt',
  'cheese',
  'sirene',
  'kashkaval',
  'beverages',
  'snacks',
  'bakery',
  'bread',
  'sweets',
  'meat',
  'beef',
  'pork',
  'chicken',
  'baby_food',
  'pet_food',
  'cat_food',
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

function buildCanonicalSemanticV3BatchPrompt(products = [], {
  state = null,
  registryContext = null,
  includeResponseJsonSchema = true,
} = {}) {
  const context = registryContext || buildRegistryContext(state, {
    domains: SEMANTIC_REGISTRY_DOMAINS,
  });
  const prompt = {
    prompt_version: CANONICAL_SEMANTIC_V3_PROMPT_VERSION,
    enrichment_version: CANONICAL_SEMANTIC_V3_VERSION,
    task: 'Extract rich canonical product semantics with raw observed meaning, registry-aware normalization, search buckets, and pending registry proposals.',
    strict_output_rules: [
      includeResponseJsonSchema
        ? 'You must return exactly this JSON schema.'
        : 'Follow the provided response_format json_schema exactly.',
      'Do not add extra top-level keys.',
      'Do not omit required keys.',
      'Use null or [] when unknown.',
      'Do not invent facts not supported by the product name or deterministic markers.',
    ],
    semantic_rules: [
      'Real-world product language is messy.',
      'Preserve raw real-world terms even when they are unfamiliar.',
      'Do not force a raw observed term into a false canonical bucket.',
      'Prefer existing registry terms when they accurately fit.',
      'Do not use a registry term if it would be false.',
      'If a raw term is meaningful but not in the registry, include it as proposed_alias or proposed_new_term.',
      'Use taxonomy_classification as the primary general product taxonomy. The schema is strict, but the taxonomy vocabulary is open-ended.',
      'taxonomy_classification.taxonomy_path_labels must be a realistic broad-to-specific human-readable path, for example Personal Care > Bath & Body > Soap > Bar Soap, Grocery > Meat & Seafood > Poultry > Chicken > Chicken Fillet, Personal Care > Hair Care > Shampoo, Garden & Outdoor > Garden Tools > Shovels, or Automotive > Car Care > Fluids > Motor Oil.',
      'Prefer existing product_taxonomy registry terms when they accurately fit; align taxonomy_path_term_ids index-for-index with taxonomy_path_labels and use null for proposed or unmatched nodes.',
      'taxonomy_classification.registry_matches must contain only product_taxonomy registry matches. Put legacy product_category or food_category matches in category.registry_matches instead.',
      'Set primary_taxonomy_label and primary_taxonomy_term_id to the deepest confident taxonomy node. Preserve raw source category words in raw_category_terms.',
      'When a needed taxonomy term is missing, add it to taxonomy_classification.proposed_terms under the best known parent. Do not force unrelated categories just to fit the registry.',
      'Do not use food_category for non-food products. Use product_taxonomy for open product taxonomy registry matches and proposals.',
      'Do not create or rely on broad boolean product-domain flags; classify through taxonomy paths and registry-backed/proposed terms.',
      'Keep the older category object backward-compatible. category.search_buckets and category_path_raw may summarize the same taxonomy path for older readers.',
      'Put dairy attributes only in attributes.dairy for dairy products. Put personal-care attributes such as target_hair_type, target_skin_type, scent, active_claims, and use_area only in attributes.personal_care for shampoo, conditioner, skin-care, oral-care, or hygiene products.',
      'Infer semantic_usage_profile conservatively from the product name, product type, category, and deterministic markers only.',
      'Use semantic_usage_profile for broad cuisine context, flavor profile, culinary/dish roles, meal contexts, common uses, preparation contexts, pairings, substitutes, consumer search intent, and not-for hints that are useful for deterministic embedding descriptions.',
      'Write semantic_embedding_summary as 1-2 rich but concise sentences, max 120 words, in English unless important Bulgarian terms should be preserved in parentheses.',
      'semantic_embedding_summary should combine product type, packaging/quantity, dairy/category/form/storage, flavor profile or texture, cuisine context, explicit or strongly implied ingredients, common use cases, dish/meal role, preparation/pairing context, and consumer-search meaning when supported.',
      'For ingredients, mention only explicit product ingredients, ingredient_hints, allergens, or conservative product-type ingredients such as cow milk for fresh milk, yogurt, sirene, or kashkaval.',
      'Keep structured fields as source of truth; semantic_embedding_summary is an additive embedding aid only.',
      'For cuisine_contexts, use broad likely contexts such as bulgarian or balkan only when strongly supported by product type or name, such as sirene or kashkaval.',
      'Do not invent specific claims such as organic, lactose-free, vegan, gluten-free, or sugar-free unless explicitly stated.',
      'Do not invent claims such as organic, lactose-free, baby-safe, halal, vegan, gluten-free, or sugar-free in semantic_embedding_summary.',
      'LLM output may propose registry actions, but it must not activate new terms.',
    ],
    evidence_limits: {
      max_items_per_evidence_array: getMaxEvidenceItemsPerField(),
    },
    semantic_usage_profile_guidance: {
      shape: 'semantic_usage_profile must preserve descriptive terms and avoid controlled-enum forcing.',
      conservative_examples: includeResponseJsonSchema ? {
        yogurt: {
          meal_contexts: ['breakfast', 'snack', 'cooking'],
          culinary_roles: ['ingredient', 'dairy base'],
          common_uses: ['eat plain', 'use in sauces', 'use in baking', 'serve with fruit'],
          flavor_profile: {
            primary_tastes: ['tangy'],
            descriptors: ['creamy', 'mild'],
            intensity: 'mild',
          },
        },
        kashkaval: {
          cuisine_contexts: ['bulgarian', 'balkan'],
          culinary_roles: ['cheese', 'topping', 'melting cheese', 'sandwich ingredient'],
          common_uses: ['grate over dishes', 'toast', 'sandwiches', 'baked dishes'],
        },
        sirene: {
          cuisine_contexts: ['bulgarian', 'balkan'],
          culinary_roles: ['cheese', 'salty dairy ingredient', 'salad ingredient'],
          common_uses: ['shopska salad', 'banitsa', 'breakfast', 'table cheese'],
        },
      } : undefined,
    },
    semantic_embedding_summary_guidance: {
      shape: {
        summary: 'string; max 2 sentences; max 120 words',
        summary_language: V3_SUMMARY_LANGUAGES,
        included_aspects: ['product_type', 'packaging_quantity', 'category_form_storage', 'flavor_texture_profile', 'cuisine_context', 'ingredients', 'common_use_cases', 'meal_or_dish_role', 'preparation_or_pairing_context', 'consumer_search_meaning'],
        evidence: `array of short strings; max ${getMaxEvidenceItemsPerField()} items`,
        confidence: 'number from 0 to 1',
        needs_review: 'boolean',
      },
      examples: includeResponseJsonSchema ? {
        fresh_milk: 'Fresh cow\'s milk in a 1 L carton/bottle, a mild refrigerated dairy drink and cooking ingredient made from cow milk for breakfast, coffee, sauces, desserts, and baking. Search-relevant contexts include milk, dairy, fresh milk, breakfast beverage, coffee ingredient, cooking ingredient, and refrigerated staple.',
        yogurt: 'Bulgarian-style yogurt (кисело мляко) in a 400 g tub, a tangy creamy fermented cow-milk dairy product for breakfast, snacks, sauces, baking, marinades, and Balkan-style cooking. Search-relevant contexts include yogurt, dairy, fermented milk, tangy creamy ingredient, breakfast, Balkan cuisine, sauce base, and cooking ingredient.',
        sirene: 'Sirene (Bulgarian white brined cheese) packaged by weight, a salty brined dairy cheese made from milk and used in Shopska salad, banitsa, breakfast plates, baked fillings, and as a table cheese. Search-relevant contexts include cheese, sirene, Bulgarian/Balkan cuisine, salty dairy ingredient, salad cheese, pastry filling, and brined cheese.',
        kashkaval: 'Kashkaval is a yellow cow-milk cheese sold packaged by weight, with a mild savory dairy flavor and melting/grating texture for sandwiches, toppings, baked dishes, and Balkan-style meals. Search-relevant contexts include cheese, kashkaval, yellow cheese, melting cheese, sandwich cheese, grating cheese, dairy, and Bulgarian/Balkan cuisine.',
      } : undefined,
    },
    registry_context: context,
    response_schema_transport: includeResponseJsonSchema ? 'prompt.response_json_schema' : 'response_format.json_schema',
    response_shape: {
      products: [{
        canonical_product_id: 'string; must exactly match one input id',
        enrichment: includeResponseJsonSchema
          ? 'canonical_semantic_v3 object matching response_json_schema products.items.properties.enrichment'
          : 'canonical_semantic_v3 object matching the provided response_format json_schema',
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
  if (includeResponseJsonSchema) {
    prompt.response_json_schema = buildCanonicalSemanticV3JsonSchema();
  }
  return prompt;
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

function validateCanonicalSemanticV3BatchResponse(response, {
  products = [],
} = {}) {
  return validateCanonicalSemanticV3BatchResponseDetailed(response, { products }).valid;
}

function validateCanonicalSemanticV3BatchResponseDetailed(response, {
  products = [],
} = {}) {
  const { rows, expectedById } = validateCanonicalSemanticV3BatchShape(response, {
    products,
  });
  const valid = [];
  const rejected = [];

  rows.forEach((entry) => {
    const id = typeof entry?.canonical_product_id === 'string' ? entry.canonical_product_id.trim() : '';
    const product = expectedById.get(id);
    try {
      const repair = normalizeCanonicalSemanticV3ForValidation(entry.enrichment, {
        canonicalProduct: product,
      });
      const enrichment = validateCanonicalSemanticV3Enrichment(repair.enrichment, {
        canonicalProduct: product,
      });
      if (repair.enrichment_repair_status !== 'clean') {
        enrichment.needs_human_review = true;
      }
      valid.push({
        canonical_product_id: id,
        enrichment,
        validation_warnings: repair.repair_warnings,
        enrichment_repair_status: repair.enrichment_repair_status,
        repair_warnings: repair.repair_warnings,
        discarded_fields: repair.discarded_fields,
      });
    } catch (error) {
      rejected.push({
        canonical_product_id: id,
        error_type: 'validation_error',
        message: error.message,
        reason: 'validation_error',
      });
    }
  });

  return {
    valid,
    rejected,
  };
}

function validateCanonicalSemanticV3BatchShape(response, {
  products = [],
} = {}) {
  const payload = parseEnrichmentPayload(response);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('v3 batch enrichment response must be an object');
  }
  const topLevelKeys = Object.keys(payload);
  const extraTopLevelKeys = topLevelKeys.filter((key) => key !== 'products');
  if (extraTopLevelKeys.length > 0) {
    throw new Error(`v3 batch enrichment response has extra top-level keys: ${extraTopLevelKeys.join(', ')}`);
  }
  const rows = payload.products;
  if (!Array.isArray(rows)) {
    throw new Error('v3 batch enrichment response must contain products[]');
  }
  if (rows.length !== products.length) {
    throw new Error(`v3 batch enrichment response count mismatch: expected ${products.length}, got ${rows.length}`);
  }

  const expectedById = new Map(products.map((product) => [product.canonical_product_id, product]));
  const seen = new Set();
  rows.forEach((entry) => {
    const keys = Object.keys(entry || {});
    const extraKeys = keys.filter((key) => !['canonical_product_id', 'enrichment'].includes(key));
    if (extraKeys.length > 0) {
      throw new Error(`v3 product response has uncontrolled fields: ${extraKeys.join(', ')}`);
    }
    const id = typeof entry?.canonical_product_id === 'string' ? entry.canonical_product_id.trim() : '';
    if (!expectedById.has(id)) {
      throw new Error(`v3 batch enrichment response returned unexpected product id: ${id || '<missing>'}`);
    }
    if (seen.has(id)) {
      throw new Error(`v3 batch enrichment response returned duplicate product id: ${id}`);
    }
    seen.add(id);
  });

  return {
    rows,
    expectedById,
  };
}

function normalizeCanonicalSemanticV3ForValidation(enrichment, {
  canonicalProduct = null,
} = {}) {
  if (!enrichment || typeof enrichment !== 'object' || Array.isArray(enrichment)) {
    throw new Error('v3 enrichment must be an object');
  }
  const repaired = JSON.parse(JSON.stringify(enrichment));
  const repairWarnings = [];
  const discardedFields = [];

  const discard = (field, originalValue, reason, normalizedValue = null) => {
    discardedFields.push(field);
    repairWarnings.push({
      field,
      original_value: originalValue,
      normalized_value: normalizedValue,
      reason,
    });
  };

  Object.keys(repaired).forEach((key) => {
    if (!V3_ENRICHMENT_KEYS.includes(key)) {
      const original = repaired[key];
      delete repaired[key];
      discard(key, original, 'dropped_uncontrolled_v3_field');
    }
  });

  repairV3TaxonomyForPartialSalvage(repaired, { discard });
  repairV3CategoryForPartialSalvage(repaired, { discard });
  repairV3SemanticSectionForPartialSalvage(repaired, 'packaging', { discard });
  repairV3SemanticSectionForPartialSalvage(repaired, 'product_form', { discard });
  repairV3OptionalUsageForPartialSalvage(repaired, { discard });
  repairV3RegistryActionsForPartialSalvage(repaired, { discard });

  const status = discardedFields.length > 0
    ? 'partial'
    : repairWarnings.length > 0
      ? 'repaired'
      : 'clean';
  if (status !== 'clean') {
    repaired.needs_human_review = true;
    if (repaired.taxonomy_classification && typeof repaired.taxonomy_classification === 'object') {
      repaired.taxonomy_classification.needs_review = true;
    }
    if (Array.isArray(repaired.warnings)) {
      repaired.warnings = dedupeRepairWarningStrings([
        ...repaired.warnings,
        ...repairWarnings.map((warning) => `${warning.reason}:${warning.field}`),
      ]);
    }
  }

  if (canonicalProduct?.canonical_product_id) {
    const identityId = typeof repaired.product_identity?.canonical_product_id === 'string'
      ? repaired.product_identity.canonical_product_id.trim()
      : '';
    if (identityId && identityId !== canonicalProduct.canonical_product_id) {
      throw new Error(`v3 product_identity.canonical_product_id mismatch: expected ${canonicalProduct.canonical_product_id}, got ${identityId}`);
    }
  }

  return {
    enrichment: repaired,
    enrichment_repair_status: status,
    repair_warnings: repairWarnings,
    discarded_fields: dedupeRepairWarningStrings(discardedFields),
  };
}

function repairV3TaxonomyForPartialSalvage(enrichment, { discard }) {
  const taxonomy = enrichment.taxonomy_classification;
  if (taxonomy === undefined || taxonomy === null || typeof taxonomy !== 'object' || Array.isArray(taxonomy)) {
    return;
  }
  const labels = Array.isArray(taxonomy.taxonomy_path_labels)
    ? taxonomy.taxonomy_path_labels.filter((entry) => typeof entry === 'string' && entry.trim())
    : [];
  if (!Array.isArray(taxonomy.taxonomy_path_labels)) {
    taxonomy.taxonomy_path_labels = labels;
    discard('taxonomy_classification.taxonomy_path_labels', taxonomy.taxonomy_path_labels, 'repaired_bad_taxonomy_path_labels', labels);
  }
  if (!Array.isArray(taxonomy.taxonomy_path_raw)) {
    taxonomy.taxonomy_path_raw = [...labels];
    discard('taxonomy_classification.taxonomy_path_raw', taxonomy.taxonomy_path_raw, 'derived_taxonomy_path_raw', taxonomy.taxonomy_path_raw);
  }
  if (!Array.isArray(taxonomy.taxonomy_path_term_ids)) {
    taxonomy.taxonomy_path_term_ids = labels.map(() => null);
    discard('taxonomy_classification.taxonomy_path_term_ids', taxonomy.taxonomy_path_term_ids, 'derived_taxonomy_path_term_ids', taxonomy.taxonomy_path_term_ids);
  }
  while (taxonomy.taxonomy_path_raw.length < labels.length) {
    taxonomy.taxonomy_path_raw.push(labels[taxonomy.taxonomy_path_raw.length]);
  }
  if (taxonomy.taxonomy_path_raw.length > labels.length) {
    const original = taxonomy.taxonomy_path_raw;
    taxonomy.taxonomy_path_raw = taxonomy.taxonomy_path_raw.slice(0, labels.length);
    discard('taxonomy_classification.taxonomy_path_raw', original, 'trimmed_taxonomy_path_raw_length', taxonomy.taxonomy_path_raw);
  }
  while (taxonomy.taxonomy_path_term_ids.length < labels.length) {
    taxonomy.taxonomy_path_term_ids.push(null);
  }
  if (taxonomy.taxonomy_path_term_ids.length > labels.length) {
    const original = taxonomy.taxonomy_path_term_ids;
    taxonomy.taxonomy_path_term_ids = taxonomy.taxonomy_path_term_ids.slice(0, labels.length);
    discard('taxonomy_classification.taxonomy_path_term_ids', original, 'trimmed_taxonomy_path_term_ids_length', taxonomy.taxonomy_path_term_ids);
  }
  if (!taxonomy.primary_taxonomy_label && labels.length > 0) {
    taxonomy.primary_taxonomy_label = labels[labels.length - 1];
    taxonomy.primary_taxonomy_term_id = taxonomy.primary_taxonomy_term_id || taxonomy.taxonomy_path_term_ids[labels.length - 1] || null;
    discard('taxonomy_classification.primary_taxonomy_label', null, 'derived_primary_taxonomy_from_path', taxonomy.primary_taxonomy_label);
  }
  if (Array.isArray(taxonomy.registry_matches)) {
    const productMatches = [];
    taxonomy.registry_matches.forEach((entry, index) => {
      if (entry === null) {
        discard(`taxonomy_classification.registry_matches[${index}]`, entry, 'dropped_null_taxonomy_registry_match');
        return;
      }
      const domain = typeof entry?.domain === 'string' ? entry.domain.trim() : '';
      if (domain && domain !== 'product_taxonomy') {
        enrichment.category = enrichment.category && typeof enrichment.category === 'object' && !Array.isArray(enrichment.category)
          ? enrichment.category
          : {};
        enrichment.category.registry_matches = Array.isArray(enrichment.category.registry_matches)
          ? enrichment.category.registry_matches
          : [];
        enrichment.category.registry_matches.push(entry);
        discard(`taxonomy_classification.registry_matches[${index}]`, entry, 'moved_non_product_taxonomy_registry_match_to_category');
        return;
      }
      productMatches.push(entry);
    });
    taxonomy.registry_matches = productMatches;
  }
  if (taxonomy.primary_taxonomy_label && labels.length > 0) {
    const normalizedLabels = new Set(labels.map(normalizeHumanTaxonomyLabel));
    if (!normalizedLabels.has(normalizeHumanTaxonomyLabel(taxonomy.primary_taxonomy_label))) {
      discard('taxonomy_classification.primary_taxonomy_label', taxonomy.primary_taxonomy_label, 'repaired_primary_taxonomy_label_path_mismatch');
    }
  }
  if (taxonomy.primary_taxonomy_term_id && Array.isArray(taxonomy.taxonomy_path_term_ids) &&
    !taxonomy.taxonomy_path_term_ids.includes(taxonomy.primary_taxonomy_term_id)) {
    discard('taxonomy_classification.primary_taxonomy_term_id', taxonomy.primary_taxonomy_term_id, 'repaired_primary_taxonomy_term_id_path_mismatch');
  }
}

function repairV3CategoryForPartialSalvage(enrichment, { discard }) {
  const category = enrichment.category;
  if (!category || typeof category !== 'object' || Array.isArray(category)) {
    return;
  }
  if (Array.isArray(category.registry_matches)) {
    const kept = [];
    category.registry_matches.forEach((entry, index) => {
      try {
        const normalized = normalizeV3RegistryMatch(entry, `category.registry_matches[${index}]`);
        if (normalized) {
          kept.push(normalized);
        } else {
          discard(`category.registry_matches[${index}]`, entry, 'dropped_null_registry_match');
        }
      } catch (error) {
        discard(`category.registry_matches[${index}]`, entry, 'dropped_invalid_registry_match');
      }
    });
    category.registry_matches = kept;
  }
}

function repairV3SemanticSectionForPartialSalvage(enrichment, fieldName, { discard }) {
  const section = enrichment[fieldName];
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    return;
  }
  Object.keys(section).forEach((key) => {
    if (!V3_SEMANTIC_SECTION_KEYS.includes(key)) {
      const original = section[key];
      delete section[key];
      discard(`${fieldName}.${key}`, original, 'dropped_uncontrolled_optional_subfield');
    }
  });
  if (section.registry_match) {
    try {
      normalizeV3RegistryMatch(section.registry_match, `${fieldName}.registry_match`);
    } catch (error) {
      const original = section.registry_match;
      section.registry_match = null;
      section.needs_review = true;
      discard(`${fieldName}.registry_match`, original, 'dropped_invalid_registry_match');
    }
  }
}

function repairV3OptionalUsageForPartialSalvage(enrichment, { discard }) {
  const usage = enrichment.semantic_usage_profile;
  if (usage === undefined || usage === null || typeof usage !== 'object' || Array.isArray(usage)) {
    if (usage !== undefined && usage !== null) {
      delete enrichment.semantic_usage_profile;
      discard('semantic_usage_profile', usage, 'dropped_invalid_optional_usage_profile');
    }
    return;
  }
  Object.keys(usage).forEach((key) => {
    if (!V3_SEMANTIC_USAGE_PROFILE_KEYS.includes(key)) {
      const original = usage[key];
      delete usage[key];
      discard(`semantic_usage_profile.${key}`, original, 'dropped_uncontrolled_optional_usage_field');
    }
  });
  for (const key of V3_SEMANTIC_USAGE_PROFILE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(usage, key)) {
      delete enrichment.semantic_usage_profile;
      discard('semantic_usage_profile', usage, 'dropped_incomplete_optional_usage_profile');
      return;
    }
  }
  [
    'cuisine_contexts',
    'culinary_roles',
    'dish_roles',
    'meal_contexts',
    'common_uses',
    'preparation_contexts',
    'pairing_suggestions',
    'substitute_terms',
    'consumer_search_intents',
    'not_for',
    'evidence',
  ].forEach((key) => {
    if (!Array.isArray(usage[key])) {
      const original = usage[key];
      usage[key] = [];
      discard(`semantic_usage_profile.${key}`, original, 'dropped_invalid_optional_usage_field', []);
    }
  });
  if (!usage.flavor_profile || typeof usage.flavor_profile !== 'object' || Array.isArray(usage.flavor_profile)) {
    const original = usage.flavor_profile;
    usage.flavor_profile = { primary_tastes: [], descriptors: [], intensity: null };
    discard('semantic_usage_profile.flavor_profile', original, 'repaired_invalid_optional_usage_field', usage.flavor_profile);
  } else {
    ['primary_tastes', 'descriptors'].forEach((key) => {
      if (!Array.isArray(usage.flavor_profile[key])) {
        const original = usage.flavor_profile[key];
        usage.flavor_profile[key] = [];
        discard(`semantic_usage_profile.flavor_profile.${key}`, original, 'dropped_invalid_optional_usage_field', []);
      }
    });
    if (typeof usage.flavor_profile.intensity !== 'string' && usage.flavor_profile.intensity !== null) {
      const original = usage.flavor_profile.intensity;
      usage.flavor_profile.intensity = null;
      discard('semantic_usage_profile.flavor_profile.intensity', original, 'dropped_invalid_optional_usage_field');
    }
  }
  if (typeof usage.confidence !== 'number' || !Number.isFinite(usage.confidence) || usage.confidence < 0 || usage.confidence > 1) {
    const original = usage.confidence;
    usage.confidence = 0;
    discard('semantic_usage_profile.confidence', original, 'dropped_invalid_optional_usage_field', 0);
  }
  if (typeof usage.needs_review !== 'boolean') {
    const original = usage.needs_review;
    usage.needs_review = true;
    discard('semantic_usage_profile.needs_review', original, 'repaired_invalid_optional_usage_field', true);
  }

  const summary = enrichment.semantic_embedding_summary;
  if (summary !== undefined && summary !== null) {
    try {
      normalizeV3SemanticEmbeddingSummary(summary, { enrichment });
    } catch (error) {
      delete enrichment.semantic_embedding_summary;
      discard('semantic_embedding_summary', summary, 'dropped_invalid_optional_embedding_summary');
    }
  }
}

function repairV3RegistryActionsForPartialSalvage(enrichment, { discard }) {
  if (!Array.isArray(enrichment.registry_actions)) {
    return;
  }
  const kept = [];
  enrichment.registry_actions.forEach((entry, index) => {
    try {
      const normalized = normalizeRegistryAction(entry);
      if (!normalized) {
        discard(`registry_actions[${index}]`, entry, 'dropped_invalid_registry_action');
        return;
      }
      kept.push(entry);
    } catch (error) {
      discard(`registry_actions[${index}]`, entry, 'dropped_invalid_registry_action');
    }
  });
  enrichment.registry_actions = kept;
}

function dedupeRepairWarningStrings(values) {
  return [...new Set((values || []).filter((value) => typeof value === 'string' && value.trim()))];
}

function validateCanonicalSemanticV3Enrichment(enrichment, {
  canonicalProduct = null,
} = {}) {
  if (!enrichment || typeof enrichment !== 'object' || Array.isArray(enrichment)) {
    throw new Error('v3 enrichment must be an object');
  }
  const extraKeys = Object.keys(enrichment).filter((key) => !V3_ENRICHMENT_KEYS.includes(key));
  if (extraKeys.length > 0) {
    throw new Error(`v3 enrichment has uncontrolled fields: ${extraKeys.join(', ')}`);
  }
  const missingKeys = V3_REQUIRED_ENRICHMENT_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(enrichment, key));
  if (missingKeys.length > 0) {
    throw new Error(`v3 enrichment missing fields: ${missingKeys.join(', ')}`);
  }
  if (enrichment.schema_version !== CANONICAL_SEMANTIC_V3_VERSION) {
    throw new Error('v3 enrichment schema_version must be canonical_semantic_v3');
  }

  const productIdentity = normalizeV3ProductIdentity(enrichment.product_identity, canonicalProduct);
  const taxonomyClassification = normalizeV3TaxonomyClassification(enrichment.taxonomy_classification);
  const category = normalizeV3Category(
    mergeTaxonomyNonProductRegistryMatchesIntoCategory(enrichment.category, enrichment.taxonomy_classification)
  );
  return {
    schema_version: CANONICAL_SEMANTIC_V3_VERSION,
    product_identity: productIdentity,
    taxonomy_classification: taxonomyClassification,
    category,
    packaging: normalizeV3SemanticSection(enrichment.packaging, 'packaging'),
    product_form: normalizeV3SemanticSection(enrichment.product_form, 'product_form'),
    attributes: normalizeV3Attributes(enrichment.attributes),
    semantic_usage_profile: normalizeV3SemanticUsageProfile(enrichment.semantic_usage_profile),
    semantic_embedding_summary: normalizeV3SemanticEmbeddingSummary(enrichment.semantic_embedding_summary, {
      enrichment,
    }),
    registry_actions: normalizeV3RegistryActions(enrichment.registry_actions),
    warnings: normalizeRichArray(enrichment.warnings, 'warnings'),
    confidence_overall: requireV3Confidence(enrichment.confidence_overall, 'confidence_overall'),
    needs_human_review: requireV3Boolean(enrichment.needs_human_review, 'needs_human_review'),
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

function normalizeV3ProductIdentity(value, canonicalProduct) {
  assertExactObjectKeys(value, V3_PRODUCT_IDENTITY_KEYS, 'v3 product_identity');
  const canonicalProductId = normalizeRequiredString(value.canonical_product_id, 'product_identity.canonical_product_id');
  if (canonicalProduct?.canonical_product_id && canonicalProductId !== canonicalProduct.canonical_product_id) {
    throw new Error(`v3 product_identity canonical_product_id mismatch: ${canonicalProductId}`);
  }
  const expectedHash = canonicalProduct ? canonicalNameHashForProduct(canonicalProduct) : null;
  const canonicalNameHash = normalizeRequiredString(value.canonical_name_hash, 'product_identity.canonical_name_hash');
  if (expectedHash && canonicalNameHash !== expectedHash) {
    throw new Error('v3 product_identity canonical_name_hash mismatch');
  }
  return {
    canonical_product_id: canonicalProductId,
    canonical_name_hash: canonicalNameHash,
    observed_name: normalizeNullableV3String(value.observed_name, 'product_identity.observed_name'),
    observed_brand: normalizeNullableV3String(value.observed_brand, 'product_identity.observed_brand'),
    brand_confidence: nullableV3Confidence(value.brand_confidence, 'product_identity.brand_confidence'),
    brand_needs_review: requireV3Boolean(value.brand_needs_review, 'product_identity.brand_needs_review'),
  };
}

function normalizeV3Category(value) {
  assertExactObjectKeys(value, V3_CATEGORY_KEYS, 'v3 category');
  return {
    raw_terms: normalizeRichArray(value.raw_terms, 'category.raw_terms'),
    category_path_raw: normalizeRichArray(value.category_path_raw, 'category.category_path_raw'),
    registry_matches: normalizeV3RegistryMatches(value.registry_matches, 'category.registry_matches'),
    proposed_terms: normalizeRichArray(value.proposed_terms, 'category.proposed_terms'),
    search_buckets: normalizeRichArray(value.search_buckets, 'category.search_buckets'),
    needs_review: requireV3Boolean(value.needs_review, 'category.needs_review'),
  };
}

function normalizeV3TaxonomyClassification(value) {
  if (value === undefined || value === null) {
    return buildEmptyV3TaxonomyClassification();
  }
  assertExactObjectKeys(value, V3_TAXONOMY_CLASSIFICATION_KEYS, 'v3 taxonomy_classification');
  const taxonomyPathRaw = normalizeV3TaxonomyLabelArray(value.taxonomy_path_raw, 'taxonomy_classification.taxonomy_path_raw');
  const taxonomyPathLabels = normalizeV3TaxonomyLabelArray(value.taxonomy_path_labels, 'taxonomy_classification.taxonomy_path_labels');
  if (taxonomyPathRaw.length !== taxonomyPathLabels.length) {
    throw new Error('v3 taxonomy_classification path raw/labels length mismatch');
  }
  const taxonomyPathTermIds = normalizeNullableStringArray(
    value.taxonomy_path_term_ids,
    'taxonomy_classification.taxonomy_path_term_ids'
  );
  if (taxonomyPathTermIds.length !== taxonomyPathLabels.length) {
    throw new Error('v3 taxonomy_classification path labels/term_ids length mismatch');
  }
  const registryMatches = normalizeV3TaxonomyRegistryMatches(value.registry_matches);
  const normalized = {
    taxonomy_path_raw: taxonomyPathRaw,
    taxonomy_path_term_ids: taxonomyPathTermIds,
    taxonomy_path_labels: taxonomyPathLabels,
    primary_taxonomy_term_id: normalizeNullableV3String(value.primary_taxonomy_term_id, 'taxonomy_classification.primary_taxonomy_term_id'),
    primary_taxonomy_label: normalizeNullableV3String(value.primary_taxonomy_label, 'taxonomy_classification.primary_taxonomy_label'),
    raw_category_terms: normalizeRichArray(value.raw_category_terms, 'taxonomy_classification.raw_category_terms'),
    registry_matches: registryMatches,
    proposed_terms: normalizeV3TaxonomyProposedTerms(value.proposed_terms),
    confidence: requireV3Confidence(value.confidence, 'taxonomy_classification.confidence'),
    needs_review: requireV3Boolean(value.needs_review, 'taxonomy_classification.needs_review'),
    evidence: normalizeV3EvidenceArray(value.evidence, 'taxonomy_classification.evidence'),
  };
  repairV3TaxonomyPrimaryAlignment(normalized);
  enforceV3TaxonomyConsistency(normalized);
  return normalized;
}

function buildEmptyV3TaxonomyClassification() {
  return {
    taxonomy_path_raw: [],
    taxonomy_path_term_ids: [],
    taxonomy_path_labels: [],
    primary_taxonomy_term_id: null,
    primary_taxonomy_label: null,
    raw_category_terms: [],
    registry_matches: [],
    proposed_terms: [],
    confidence: 0,
    needs_review: false,
    evidence: [],
  };
}

function normalizeV3TaxonomyLabelArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`v3 ${fieldName} must be an array`);
  }
  const seen = new Set();
  const normalized = [];
  value.forEach((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`v3 ${fieldName}[${index}] must be a string`);
    }
    const label = entry.trim().replace(/\s+/gu, ' ');
    const key = label.toLowerCase();
    if (label && !seen.has(key)) {
      seen.add(key);
      normalized.push(label);
    }
  });
  return normalized;
}

function normalizeNullableStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`v3 ${fieldName} must be an array`);
  }
  return value.map((entry, index) => {
    if (entry === null) {
      return null;
    }
    return normalizeNullableV3String(entry, `${fieldName}[${index}]`);
  });
}

function normalizeV3TaxonomyProposedTerms(value) {
  if (!Array.isArray(value)) {
    throw new Error('v3 taxonomy_classification.proposed_terms must be an array');
  }
  return value.map((entry, index) => {
    assertExactObjectKeys(entry, V3_TAXONOMY_PROPOSED_TERM_KEYS, `v3 taxonomy_classification.proposed_terms[${index}]`);
    return {
      proposed_label: normalizeRequiredString(entry.proposed_label, `taxonomy_classification.proposed_terms[${index}].proposed_label`),
      parent_term_id: normalizeNullableV3String(entry.parent_term_id, `taxonomy_classification.proposed_terms[${index}].parent_term_id`),
      parent_label: normalizeNullableV3String(entry.parent_label, `taxonomy_classification.proposed_terms[${index}].parent_label`),
      aliases: normalizeRichArray(entry.aliases, `taxonomy_classification.proposed_terms[${index}].aliases`),
      confidence: requireV3Confidence(entry.confidence, `taxonomy_classification.proposed_terms[${index}].confidence`),
      evidence: normalizeV3EvidenceArray(entry.evidence, `taxonomy_classification.proposed_terms[${index}].evidence`),
      reason: normalizeNullableV3String(entry.reason, `taxonomy_classification.proposed_terms[${index}].reason`),
    };
  });
}

function repairV3TaxonomyPrimaryAlignment(value) {
  const primaryLabel = normalizeUsableTaxonomyLabel(value.primary_taxonomy_label);
  const primaryTermId = normalizeUsableProductTaxonomyTermId(value.primary_taxonomy_term_id);
  const labelIndex = primaryLabel
    ? value.taxonomy_path_labels.findIndex((label) => normalizeHumanTaxonomyLabel(label) === normalizeHumanTaxonomyLabel(primaryLabel))
    : -1;
  const termIndex = primaryTermId ? value.taxonomy_path_term_ids.indexOf(primaryTermId) : -1;

  if (primaryLabel && labelIndex < 0) {
    value.taxonomy_path_labels.push(primaryLabel);
    value.taxonomy_path_raw.push(primaryLabel);
    value.taxonomy_path_term_ids.push(primaryTermId || null);
  } else if (primaryTermId && termIndex < 0) {
    if (labelIndex >= 0) {
      value.taxonomy_path_term_ids[labelIndex] = primaryTermId;
    } else if (value.taxonomy_path_term_ids.length > 0) {
      value.taxonomy_path_term_ids[value.taxonomy_path_term_ids.length - 1] = primaryTermId;
    } else {
      value.taxonomy_path_labels.push(primaryLabel || primaryTermId);
      value.taxonomy_path_raw.push(primaryLabel || primaryTermId);
      value.taxonomy_path_term_ids.push(primaryTermId);
    }
  }

  const leafIndex = value.taxonomy_path_labels.length - 1;
  if (leafIndex >= 0) {
    if (!primaryLabel) {
      value.primary_taxonomy_label = value.taxonomy_path_labels[leafIndex];
    } else {
      value.primary_taxonomy_label = primaryLabel;
    }
    if (!primaryTermId) {
      value.primary_taxonomy_term_id = normalizeUsableProductTaxonomyTermId(value.taxonomy_path_term_ids[leafIndex]);
    } else {
      value.primary_taxonomy_term_id = primaryTermId;
    }
  } else {
    value.primary_taxonomy_label = primaryLabel;
    value.primary_taxonomy_term_id = primaryTermId;
  }
}

function normalizeUsableTaxonomyLabel(value) {
  const label = normalizeNullableV3String(value, 'taxonomy_classification.primary_taxonomy_label');
  return label && normalizeHumanTaxonomyLabel(label) ? label : null;
}

function normalizeUsableProductTaxonomyTermId(value) {
  const termId = normalizeNullableV3String(value, 'taxonomy_classification.primary_taxonomy_term_id');
  if (!termId || !/^sem_product_taxonomy_[a-z0-9_]+$/u.test(termId)) {
    return null;
  }
  return termId;
}

function enforceV3TaxonomyConsistency(value) {
  if (value.taxonomy_path_labels.length > 0 && value.primary_taxonomy_label) {
    const labels = new Set(value.taxonomy_path_labels.map(normalizeHumanTaxonomyLabel));
    if (!labels.has(normalizeHumanTaxonomyLabel(value.primary_taxonomy_label))) {
      throw new Error('v3 taxonomy_classification primary_taxonomy_label must appear in taxonomy_path_labels');
    }
  }
  if (value.primary_taxonomy_term_id && !value.taxonomy_path_term_ids.includes(value.primary_taxonomy_term_id)) {
    throw new Error('v3 taxonomy_classification primary_taxonomy_term_id must appear in taxonomy_path_term_ids');
  }
  const pathText = value.taxonomy_path_labels.map(normalizeHumanTaxonomyLabel).join(' > ');
  const evidenceText = [
    ...value.evidence,
    ...value.raw_category_terms,
    ...value.taxonomy_path_raw,
    ...value.taxonomy_path_labels,
  ].map(normalizeHumanTaxonomyLabel).join(' ');
  if (
    value.confidence >= 0.85 &&
    /\b(dairy|milk|yogurt|cheese)\b/u.test(pathText) &&
    /\b(shampoo|conditioner|hair care|soap|bar soap|shower gel)\b/u.test(evidenceText)
  ) {
    throw new Error('v3 taxonomy_classification contains impossible high-confidence personal-care/dairy contradiction');
  }
}

function mergeTaxonomyNonProductRegistryMatchesIntoCategory(category, taxonomyClassification) {
  if (!category || typeof category !== 'object' || Array.isArray(category)) {
    return category;
  }
  const taxonomyMatches = Array.isArray(taxonomyClassification?.registry_matches)
    ? taxonomyClassification.registry_matches
    : [];
  const movableMatches = taxonomyMatches
    .map((entry, index) => normalizeMovableTaxonomyRegistryMatch(entry, index))
    .filter(Boolean);
  if (movableMatches.length === 0) {
    return category;
  }
  const existingMatches = Array.isArray(category.registry_matches) ? category.registry_matches : [];
  const seen = new Set(existingMatches.map(registryMatchDedupeKey));
  const mergedMatches = [...existingMatches];
  movableMatches.forEach((match) => {
    const key = registryMatchDedupeKey(match);
    if (!seen.has(key)) {
      seen.add(key);
      mergedMatches.push(match);
    }
  });
  return {
    ...category,
    registry_matches: mergedMatches,
  };
}

function normalizeV3TaxonomyRegistryMatches(value) {
  if (!Array.isArray(value)) {
    throw new Error('v3 taxonomy_classification.registry_matches must be an array');
  }
  return value
    .map((entry, index) => {
      if (entry === null) {
        return null;
      }
      const domain = typeof entry?.domain === 'string' ? entry.domain.trim() : '';
      if (domain !== 'product_taxonomy') {
        return null;
      }
      return normalizeV3RegistryMatch(entry, `taxonomy_classification.registry_matches[${index}]`);
    })
    .filter(Boolean);
}

function normalizeMovableTaxonomyRegistryMatch(entry, index) {
  if (entry === null || !entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }
  const domain = typeof entry.domain === 'string' ? entry.domain.trim() : '';
  if (!domain || domain === 'product_taxonomy') {
    return null;
  }
  try {
    const normalized = normalizeV3RegistryMatch(entry, `taxonomy_classification.registry_matches[${index}]`);
    if (!normalized.term_id && !normalized.canonical_label) {
      return null;
    }
    return normalized;
  } catch (_error) {
    return null;
  }
}

function registryMatchDedupeKey(match) {
  return [
    match?.domain || '',
    match?.term_id || '',
    normalizeHumanTaxonomyLabel(match?.canonical_label),
  ].join('|');
}

function normalizeHumanTaxonomyLabel(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeV3SemanticSection(value, fieldName) {
  assertExactObjectKeys(value, V3_SEMANTIC_SECTION_KEYS, `v3 ${fieldName}`);
  return {
    raw_terms: normalizeRichArray(value.raw_terms, `${fieldName}.raw_terms`),
    description: normalizeNullableV3String(value.description, `${fieldName}.description`),
    registry_match: normalizeV3RegistryMatch(value.registry_match, `${fieldName}.registry_match`),
    proposed_aliases: normalizeRichArray(value.proposed_aliases, `${fieldName}.proposed_aliases`),
    proposed_new_term: normalizeNullableV3String(value.proposed_new_term, `${fieldName}.proposed_new_term`),
    search_bucket: normalizeNullableV3String(value.search_bucket, `${fieldName}.search_bucket`),
    confidence: requireV3Confidence(value.confidence, `${fieldName}.confidence`),
    needs_review: requireV3Boolean(value.needs_review, `${fieldName}.needs_review`),
    evidence: normalizeV3EvidenceArray(value.evidence, `${fieldName}.evidence`),
  };
}

function normalizeV3Attributes(value) {
  assertExactObjectKeys(value, V3_ATTRIBUTES_KEYS, 'v3 attributes');
  return {
    dairy: normalizeV3LooseObject(value.dairy, 'attributes.dairy'),
    personal_care: normalizeV3LooseObject(value.personal_care, 'attributes.personal_care'),
    beverage: normalizeV3LooseObject(value.beverage, 'attributes.beverage'),
    household: normalizeV3LooseObject(value.household, 'attributes.household'),
    nutrition_claims: normalizeRichArray(value.nutrition_claims, 'attributes.nutrition_claims'),
    dietary_claims: normalizeRichArray(value.dietary_claims, 'attributes.dietary_claims'),
    flavor_terms: normalizeRichArray(value.flavor_terms, 'attributes.flavor_terms'),
    preparation_state: normalizeRichArray(value.preparation_state, 'attributes.preparation_state'),
    storage: normalizeV3LooseObject(value.storage, 'attributes.storage'),
    quantity: normalizeV3LooseObject(value.quantity, 'attributes.quantity'),
  };
}

function normalizeV3SemanticUsageProfile(value) {
  if (value === undefined) {
    return buildEmptyV3SemanticUsageProfile();
  }
  assertExactObjectKeys(value, V3_SEMANTIC_USAGE_PROFILE_KEYS, 'v3 semantic_usage_profile');
  return {
    cuisine_contexts: normalizeRichArray(value.cuisine_contexts, 'semantic_usage_profile.cuisine_contexts'),
    flavor_profile: normalizeV3FlavorProfile(value.flavor_profile),
    culinary_roles: normalizeRichArray(value.culinary_roles, 'semantic_usage_profile.culinary_roles'),
    dish_roles: normalizeRichArray(value.dish_roles, 'semantic_usage_profile.dish_roles'),
    meal_contexts: normalizeRichArray(value.meal_contexts, 'semantic_usage_profile.meal_contexts'),
    common_uses: normalizeRichArray(value.common_uses, 'semantic_usage_profile.common_uses'),
    preparation_contexts: normalizeRichArray(value.preparation_contexts, 'semantic_usage_profile.preparation_contexts'),
    pairing_suggestions: normalizeRichArray(value.pairing_suggestions, 'semantic_usage_profile.pairing_suggestions'),
    substitute_terms: normalizeRichArray(value.substitute_terms, 'semantic_usage_profile.substitute_terms'),
    consumer_search_intents: normalizeRichArray(value.consumer_search_intents, 'semantic_usage_profile.consumer_search_intents'),
    not_for: normalizeRichArray(value.not_for, 'semantic_usage_profile.not_for'),
    confidence: requireV3Confidence(value.confidence, 'semantic_usage_profile.confidence'),
    evidence: normalizeV3EvidenceArray(value.evidence, 'semantic_usage_profile.evidence'),
    needs_review: requireV3Boolean(value.needs_review, 'semantic_usage_profile.needs_review'),
  };
}

function normalizeV3FlavorProfile(value) {
  assertExactObjectKeys(value, V3_FLAVOR_PROFILE_KEYS, 'v3 semantic_usage_profile.flavor_profile');
  return {
    primary_tastes: normalizeRichArray(value.primary_tastes, 'semantic_usage_profile.flavor_profile.primary_tastes'),
    descriptors: normalizeRichArray(value.descriptors, 'semantic_usage_profile.flavor_profile.descriptors'),
    intensity: normalizeNullableV3String(value.intensity, 'semantic_usage_profile.flavor_profile.intensity'),
  };
}

function buildEmptyV3SemanticUsageProfile() {
  return {
    cuisine_contexts: [],
    flavor_profile: {
      primary_tastes: [],
      descriptors: [],
      intensity: null,
    },
    culinary_roles: [],
    dish_roles: [],
    meal_contexts: [],
    common_uses: [],
    preparation_contexts: [],
    pairing_suggestions: [],
    substitute_terms: [],
    consumer_search_intents: [],
    not_for: [],
    confidence: 0,
    evidence: [],
    needs_review: false,
  };
}

function normalizeV3SemanticEmbeddingSummary(value, {
  enrichment = null,
} = {}) {
  if (value === undefined || value === null) {
    return buildEmptyV3SemanticEmbeddingSummary();
  }
  assertExactObjectKeys(value, V3_SEMANTIC_EMBEDDING_SUMMARY_KEYS, 'v3 semantic_embedding_summary');
  const summary = normalizeRequiredSummaryString(value.summary);
  enforceV3SummaryLength(summary);
  enforceV3SummaryNoUnsupportedClaims(summary, enrichment);
  const summaryLanguage = normalizeRequiredString(value.summary_language, 'semantic_embedding_summary.summary_language');
  if (!V3_SUMMARY_LANGUAGES.includes(summaryLanguage)) {
    throw new Error(`v3 semantic_embedding_summary.summary_language is unsupported: ${summaryLanguage}`);
  }
  return {
    summary,
    summary_language: summaryLanguage,
    included_aspects: normalizeRichArray(value.included_aspects, 'semantic_embedding_summary.included_aspects'),
    evidence: normalizeV3EvidenceArray(value.evidence, 'semantic_embedding_summary.evidence'),
    confidence: requireV3Confidence(value.confidence, 'semantic_embedding_summary.confidence'),
    needs_review: requireV3Boolean(value.needs_review, 'semantic_embedding_summary.needs_review'),
  };
}

function buildEmptyV3SemanticEmbeddingSummary() {
  return {
    summary: '',
    summary_language: 'unknown',
    included_aspects: [],
    evidence: [],
    confidence: 0,
    needs_review: false,
  };
}

function normalizeV3RegistryActions(value) {
  if (!Array.isArray(value)) {
    throw new Error('v3 registry_actions must be an array');
  }
  if (value.length > 40) {
    throw new Error('v3 registry_actions has too many entries');
  }
  return value.map((entry, index) => {
    const extraKeys = Object.keys(entry || {}).filter((key) => ![
      'action',
      'domain',
      'existing_term_id',
      'proposed_label',
      'proposed_alias',
      'parent_term_id',
      'confidence',
      'evidence',
      'reason',
    ].includes(key));
    if (extraKeys.length > 0) {
      throw new Error(`v3 registry_actions[${index}] has uncontrolled fields: ${extraKeys.join(', ')}`);
    }
    const normalized = normalizeRegistryAction(entry);
    if (!normalized) {
      throw new Error(`v3 registry_actions[${index}] has invalid action or domain`);
    }
    return {
      action: normalized.action,
      domain: normalized.domain,
      existing_term_id: normalized.existing_term_id,
      proposed_label: normalized.proposed_label,
      proposed_alias: normalized.proposed_alias,
      parent_term_id: normalized.parent_term_id,
      confidence: normalized.confidence,
      evidence: normalizeV3EvidenceArray(normalized.evidence, `registry_actions[${index}].evidence`),
      reason: normalized.reason,
    };
  });
}

function normalizeV3RegistryMatches(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`v3 ${fieldName} must be an array`);
  }
  return value.map((entry, index) => normalizeV3RegistryMatch(entry, `${fieldName}[${index}]`));
}

function normalizeV3RegistryMatch(value, fieldName) {
  if (value === null) {
    return null;
  }
  assertExactObjectKeys(value, ['domain', 'term_id', 'canonical_label', 'confidence', 'evidence'], `v3 ${fieldName}`);
  const domain = normalizeRequiredString(value.domain, `${fieldName}.domain`);
  if (!SEMANTIC_REGISTRY_DOMAINS.includes(domain)) {
    throw new Error(`v3 ${fieldName}.domain is unsupported: ${domain}`);
  }
  const canonicalLabel = normalizeNullableV3String(value.canonical_label, `${fieldName}.canonical_label`);
  if (domain === 'food_category' && !isAllowedFoodCategoryLabel(canonicalLabel, value.term_id)) {
    throw new Error(`v3 ${fieldName}.domain food_category cannot contain non-food term: ${canonicalLabel || value.term_id}`);
  }
  return {
    domain,
    term_id: normalizeNullableV3String(value.term_id, `${fieldName}.term_id`),
    canonical_label: canonicalLabel,
    confidence: requireV3Confidence(value.confidence, `${fieldName}.confidence`),
    evidence: normalizeV3EvidenceArray(value.evidence, `${fieldName}.evidence`),
  };
}

function isAllowedFoodCategoryLabel(canonicalLabel, termId) {
  const labels = [
    canonicalLabel,
    termId ? String(termId).replace(/^sem_food_category_/u, '') : '',
  ]
    .map((value) => String(value || '')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\p{L}]+/gu, '_')
      .replace(/^_+|_+$/gu, ''))
    .filter(Boolean);
  if (labels.length === 0) {
    return true;
  }
  return labels.every((label) => FOOD_CATEGORY_LABELS.has(label));
}

function normalizeV3LooseObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`v3 ${fieldName} must be an object`);
  }
  return JSON.parse(JSON.stringify(value));
}

function assertExactObjectKeys(value, expectedKeys, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  const extraKeys = Object.keys(value).filter((key) => !expectedKeys.includes(key));
  if (extraKeys.length > 0) {
    throw new Error(`${fieldName} has uncontrolled fields: ${extraKeys.join(', ')}`);
  }
  const missingKeys = expectedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (missingKeys.length > 0) {
    throw new Error(`${fieldName} missing fields: ${missingKeys.join(', ')}`);
  }
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`v3 ${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeNullableV3String(value, fieldName) {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`v3 ${fieldName} must be a string or null`);
  }
  const normalized = value.trim().replace(/\s+/gu, ' ');
  return normalized || null;
}

function requireV3Boolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new Error(`v3 ${fieldName} must be boolean`);
  }
  return value;
}

function requireV3Confidence(value, fieldName) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`v3 ${fieldName} must be a number from 0 to 1`);
  }
  return Math.round(value * 10000) / 10000;
}

function normalizeV3EvidenceArray(value, fieldName) {
  return normalizeRichArray(value, fieldName).slice(0, getMaxEvidenceItemsPerField());
}

function getMaxEvidenceItemsPerField(env = process.env) {
  const parsed = Number.parseInt(env.PRICER_LLM_MAX_EVIDENCE_ITEMS_PER_FIELD, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LLM_MAX_EVIDENCE_ITEMS_PER_FIELD;
}

function normalizeRequiredSummaryString(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('v3 semantic_embedding_summary.summary must be a non-empty string');
  }
  return value.trim().replace(/\s+/gu, ' ');
}

function enforceV3SummaryLength(summary) {
  const words = summary.split(/\s+/u).filter(Boolean);
  if (words.length > V3_SUMMARY_MAX_WORDS) {
    throw new Error('v3 semantic_embedding_summary.summary exceeds max word count');
  }
  const sentences = summary
    .split(/[.!?]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length > V3_SUMMARY_MAX_SENTENCES) {
    throw new Error('v3 semantic_embedding_summary.summary exceeds max sentence count');
  }
}

function enforceV3SummaryNoUnsupportedClaims(summary, enrichment) {
  const supportedText = JSON.stringify({
    attributes: enrichment?.attributes || {},
    semantic_usage_profile: enrichment?.semantic_usage_profile || {},
    category: enrichment?.category || {},
    warnings: enrichment?.warnings || [],
  }).toLowerCase();
  for (const pattern of UNSUPPORTED_SUMMARY_CLAIM_PATTERNS) {
    if (pattern.test(summary) && !pattern.test(supportedText)) {
      throw new Error('v3 semantic_embedding_summary.summary contains unsupported claim wording');
    }
  }
}

function nullableV3Confidence(value, fieldName) {
  if (value === null) {
    return null;
  }
  return requireV3Confidence(value, fieldName);
}

function buildCanonicalSemanticV3JsonSchema() {
  const evidenceMaxItems = getMaxEvidenceItemsPerField();
  const registryMatchSchema = {
    type: ['object', 'null'],
    additionalProperties: false,
    required: ['domain', 'term_id', 'canonical_label', 'confidence', 'evidence'],
    properties: {
      domain: { type: 'string', enum: SEMANTIC_REGISTRY_DOMAINS },
      term_id: { type: ['string', 'null'] },
      canonical_label: { type: ['string', 'null'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      evidence: { type: 'array', maxItems: evidenceMaxItems, items: { type: 'string' } },
    },
  };
  const taxonomyRegistryMatchSchema = {
    ...registryMatchSchema,
    type: 'object',
    properties: {
      ...registryMatchSchema.properties,
      domain: { type: 'string', enum: ['product_taxonomy'] },
    },
  };
  const semanticSectionSchema = {
    type: 'object',
    additionalProperties: false,
    required: V3_SEMANTIC_SECTION_KEYS,
    properties: {
      raw_terms: { type: 'array', items: { type: 'string' } },
      description: { type: ['string', 'null'] },
      registry_match: registryMatchSchema,
      proposed_aliases: { type: 'array', items: { type: 'string' } },
      proposed_new_term: { type: ['string', 'null'] },
      search_bucket: { type: ['string', 'null'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      needs_review: { type: 'boolean' },
      evidence: { type: 'array', maxItems: evidenceMaxItems, items: { type: 'string' } },
    },
  };
  const taxonomyProposedTermSchema = {
    type: 'object',
    additionalProperties: false,
    required: V3_TAXONOMY_PROPOSED_TERM_KEYS,
    properties: {
      proposed_label: { type: 'string', minLength: 1 },
      parent_term_id: { type: ['string', 'null'] },
      parent_label: { type: ['string', 'null'] },
      aliases: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      evidence: { type: 'array', maxItems: evidenceMaxItems, items: { type: 'string' } },
      reason: { type: ['string', 'null'] },
    },
  };
  const taxonomyClassificationSchema = {
    type: 'object',
    additionalProperties: false,
    required: V3_TAXONOMY_CLASSIFICATION_KEYS,
    properties: {
      taxonomy_path_raw: { type: 'array', items: { type: 'string' } },
      taxonomy_path_term_ids: { type: 'array', items: { type: ['string', 'null'] } },
      taxonomy_path_labels: { type: 'array', items: { type: 'string' } },
      primary_taxonomy_term_id: { type: ['string', 'null'] },
      primary_taxonomy_label: { type: ['string', 'null'] },
      raw_category_terms: { type: 'array', items: { type: 'string' } },
      registry_matches: {
        type: 'array',
        items: taxonomyRegistryMatchSchema,
      },
      proposed_terms: {
        type: 'array',
        items: taxonomyProposedTermSchema,
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      needs_review: { type: 'boolean' },
      evidence: { type: 'array', maxItems: evidenceMaxItems, items: { type: 'string' } },
    },
  };
  const flavorProfileSchema = {
    type: 'object',
    additionalProperties: false,
    required: V3_FLAVOR_PROFILE_KEYS,
    properties: {
      primary_tastes: { type: 'array', items: { type: 'string' } },
      descriptors: { type: 'array', items: { type: 'string' } },
      intensity: { type: ['string', 'null'] },
    },
  };
  const semanticUsageProfileSchema = {
    type: 'object',
    additionalProperties: false,
    required: V3_SEMANTIC_USAGE_PROFILE_KEYS,
    properties: {
      cuisine_contexts: { type: 'array', items: { type: 'string' } },
      flavor_profile: flavorProfileSchema,
      culinary_roles: { type: 'array', items: { type: 'string' } },
      dish_roles: { type: 'array', items: { type: 'string' } },
      meal_contexts: { type: 'array', items: { type: 'string' } },
      common_uses: { type: 'array', items: { type: 'string' } },
      preparation_contexts: { type: 'array', items: { type: 'string' } },
      pairing_suggestions: { type: 'array', items: { type: 'string' } },
      substitute_terms: { type: 'array', items: { type: 'string' } },
      consumer_search_intents: { type: 'array', items: { type: 'string' } },
      not_for: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      evidence: { type: 'array', maxItems: evidenceMaxItems, items: { type: 'string' } },
      needs_review: { type: 'boolean' },
    },
  };
  const semanticEmbeddingSummarySchema = {
    type: 'object',
    additionalProperties: false,
    required: V3_SEMANTIC_EMBEDDING_SUMMARY_KEYS,
    properties: {
      summary: { type: 'string', minLength: 1 },
      summary_language: { type: 'string', enum: V3_SUMMARY_LANGUAGES },
      included_aspects: { type: 'array', items: { type: 'string' } },
      evidence: { type: 'array', maxItems: evidenceMaxItems, items: { type: 'string' } },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      needs_review: { type: 'boolean' },
    },
  };

  return {
    type: 'object',
    additionalProperties: false,
    required: ['products'],
    properties: {
      products: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['canonical_product_id', 'enrichment'],
          properties: {
            canonical_product_id: { type: 'string' },
            enrichment: {
              type: 'object',
              additionalProperties: false,
              required: V3_ENRICHMENT_KEYS,
              properties: {
                schema_version: { type: 'string', const: CANONICAL_SEMANTIC_V3_VERSION },
                product_identity: {
                  type: 'object',
                  additionalProperties: false,
                  required: V3_PRODUCT_IDENTITY_KEYS,
                  properties: {
                    canonical_product_id: { type: 'string' },
                    canonical_name_hash: { type: 'string' },
                    observed_name: { type: ['string', 'null'] },
                    observed_brand: { type: ['string', 'null'] },
                    brand_confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
                    brand_needs_review: { type: 'boolean' },
                  },
                },
                taxonomy_classification: taxonomyClassificationSchema,
                category: {
                  type: 'object',
                  additionalProperties: false,
                  required: V3_CATEGORY_KEYS,
                  properties: {
                    raw_terms: { type: 'array', items: { type: 'string' } },
                    category_path_raw: { type: 'array', items: { type: 'string' } },
                    registry_matches: {
                      type: 'array',
                      items: registryMatchSchema,
                    },
                    proposed_terms: { type: 'array', items: { type: 'string' } },
                    search_buckets: { type: 'array', items: { type: 'string' } },
                    needs_review: { type: 'boolean' },
                  },
                },
                packaging: semanticSectionSchema,
                product_form: semanticSectionSchema,
                attributes: {
                  type: 'object',
                  additionalProperties: false,
                  required: V3_ATTRIBUTES_KEYS,
                  properties: {
                    dairy: { type: 'object' },
                    personal_care: { type: 'object' },
                    beverage: { type: 'object' },
                    household: { type: 'object' },
                    nutrition_claims: { type: 'array', items: { type: 'string' } },
                    dietary_claims: { type: 'array', items: { type: 'string' } },
                    flavor_terms: { type: 'array', items: { type: 'string' } },
                    preparation_state: { type: 'array', items: { type: 'string' } },
                    storage: { type: 'object' },
                    quantity: { type: 'object' },
                  },
                },
                semantic_usage_profile: semanticUsageProfileSchema,
                semantic_embedding_summary: semanticEmbeddingSummarySchema,
                registry_actions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['action', 'domain', 'existing_term_id', 'proposed_label', 'proposed_alias', 'parent_term_id', 'confidence', 'evidence', 'reason'],
                    properties: {
                      action: { type: 'string', enum: REGISTRY_ACTIONS },
                      domain: { type: 'string', enum: SEMANTIC_REGISTRY_DOMAINS },
                      existing_term_id: { type: ['string', 'null'] },
                      proposed_label: { type: ['string', 'null'] },
                      proposed_alias: { type: ['string', 'null'] },
                      parent_term_id: { type: ['string', 'null'] },
                      confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
                      evidence: { type: 'array', maxItems: evidenceMaxItems, items: { type: 'string' } },
                      reason: { type: ['string', 'null'] },
                    },
                  },
                },
                warnings: { type: 'array', items: { type: 'string' } },
                confidence_overall: { type: 'number', minimum: 0, maximum: 1 },
                needs_human_review: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  };
}

module.exports = {
  CATEGORY_TREE,
  CANONICAL_SEMANTIC_V3_PROMPT_VERSION,
  CANONICAL_SEMANTIC_V3_VERSION,
  ENRICHMENT_PROMPT_VERSION,
  RICH_CANONICAL_ENRICHMENT_VERSION,
  RICH_CANONICAL_PROMPT_VERSION,
  RICH_ALLOWED_KEYS,
  buildCanonicalSemanticV3BatchPrompt,
  buildCanonicalSemanticV3JsonSchema,
  buildRichCanonicalEnrichmentBatchPrompt,
  buildEnrichmentPrompt,
  isLlmEnrichmentEnabled,
  requestCanonicalEnrichment,
  syncCanonicalEnrichmentArtifacts,
  validateCanonicalSemanticV3BatchResponse,
  validateCanonicalSemanticV3BatchResponseDetailed,
  validateCanonicalSemanticV3Enrichment,
  validateRichCanonicalEnrichmentBatchResponse,
  validateRichCanonicalEnrichmentBatchResponseDetailed,
  validateRichCanonicalEnrichmentResponse,
  validateEnrichmentResponse,
  extractExplicitDietAndAttributeTags,
  normalizeDietAndAttributeTags,
};
