const crypto = require('node:crypto');

const CANONICAL_SEMANTIC_V3_VERSION = 'canonical_semantic_v3';
const CANONICAL_SEMANTIC_V3_PROMPT_VERSION = 'canonical_semantic_v3_prompt_v1';

const SEMANTIC_REGISTRY_DOMAINS = Object.freeze([
  'packaging',
  'product_form',
  'product_taxonomy',
  'product_category',
  'food_category',
  'dairy_type',
  'milk_source',
  'quality_tier',
  'storage_type',
  'flavor',
  'dietary_claim',
  'material',
  'preparation_state',
]);

const REGISTRY_ACTIONS = Object.freeze([
  'use_existing',
  'propose_alias',
  'propose_new_term',
  'propose_relationship',
  'needs_review',
]);

const PROPOSAL_ACTIONS = Object.freeze([
  'propose_alias',
  'propose_new_term',
  'propose_relationship',
]);

const FOOD_CATEGORY_CANONICAL_LABELS = new Set([
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

const PRODUCT_TAXONOMY_TOP_LEVEL_LABELS = Object.freeze([
  'grocery',
  'personal_care',
  'household',
  'baby_kids',
  'pet_care',
  'automotive',
  'sports_outdoors',
  'tools_hardware',
  'garden_outdoor',
  'electronics',
  'home_appliances',
  'clothing',
  'health',
  'office_school',
]);

const DEFAULT_REGISTRY_SEED_TERMS = Object.freeze([
  termSeed('packaging', 'bottle', ['bottle'], 'Rigid container with a narrow neck, typically for liquids.'),
  termSeed('packaging', 'carton', ['carton'], 'Folded paperboard or laminated carton, often used for milk or juice.'),
  termSeed('packaging', 'bag', ['bag'], 'Flexible bag container.'),
  termSeed('packaging', 'box', ['box'], 'Rigid or semi-rigid box container.'),
  termSeed('packaging', 'can', ['can', 'tin'], 'Sealed metal can.'),
  termSeed('packaging', 'jar', ['jar'], 'Rigid jar with a lid, usually glass or plastic.'),
  termSeed('packaging', 'tube', ['tube'], 'Squeezable tube container.'),
  termSeed('packaging', 'packet', ['packet', 'sachet'], 'Small sealed packet or sachet.', { status: 'active' }),
  termSeed('packaging', 'wrapper', ['wrapper'], 'Wrapper around a bar, snack, or bakery item.'),
  termSeed('packaging', 'tray', ['tray'], 'Tray packaging, often with film or wrap.'),
  termSeed('packaging', 'roll', ['roll'], 'Roll format packaging or product presentation.'),
  termSeed('packaging', 'blister', ['blister'], 'Blister pack.'),
  termSeed('packaging', 'tub', ['tub', 'cup', '\u043a\u043e\u0444\u0438\u0447\u043a\u0430'], 'Rigid or semi-rigid open-top container, often used for yogurt, dairy, dips, or spreads.'),
  termSeed('product_form', 'liquid', ['liquid'], 'Pourable liquid product form.'),
  termSeed('product_form', 'solid', ['solid'], 'Solid product form.'),
  termSeed('product_form', 'powder', ['powder'], 'Powdered product form.'),
  termSeed('product_form', 'gel', ['gel'], 'Gel product form.'),
  termSeed('product_form', 'cream', ['cream'], 'Cream product form.'),
  termSeed('product_form', 'paste', ['paste'], 'Paste product form.'),
  termSeed('product_form', 'spray', ['spray'], 'Spray product form.'),
  termSeed('product_form', 'tablet', ['tablet'], 'Tablet product form.'),
  termSeed('product_form', 'capsule', ['capsule'], 'Capsule product form.'),
  termSeed('product_form', 'granules', ['granules'], 'Granulated product form.'),
  termSeed('product_form', 'frozen', ['frozen'], 'Frozen product form or state.'),
  termSeed('product_form', 'semi-solid', ['semi-solid', 'semi solid'], 'Semi-solid texture that should not be forced into solid, cream, gel, or paste without evidence.', { status: 'proposed' }),
  termSeed('product_taxonomy', 'grocery', ['grocery', 'groceries', 'food'], 'Broad grocery department for food and drink products.', { display_label: 'Grocery' }),
  termSeed('product_taxonomy', 'personal_care', ['personal care', 'hygiene'], 'Broad department for body, hair, skin, hygiene, and oral care products.', { display_label: 'Personal Care' }),
  termSeed('product_taxonomy', 'household', ['household'], 'Broad department for household cleaning, paper, laundry, and home care supplies.', { display_label: 'Household' }),
  termSeed('product_taxonomy', 'baby_kids', ['baby kids', 'baby & kids', 'baby and kids'], 'Broad department for baby and children products.', { display_label: 'Baby & Kids' }),
  termSeed('product_taxonomy', 'pet_care', ['pet care'], 'Broad department for pet food, treats, and care products.', { display_label: 'Pet Care' }),
  termSeed('product_taxonomy', 'automotive', ['automotive', 'auto', 'car'], 'Broad department for car care, vehicle fluids, accessories, and maintenance products.', { display_label: 'Automotive' }),
  termSeed('product_taxonomy', 'sports_outdoors', ['sports outdoors', 'sports & outdoors'], 'Broad department for sports, fitness, and outdoor recreation products.', { display_label: 'Sports & Outdoors' }),
  termSeed('product_taxonomy', 'tools_hardware', ['tools hardware', 'tools & hardware'], 'Broad department for tools, hardware, repair, and building supplies.', { display_label: 'Tools & Hardware' }),
  termSeed('product_taxonomy', 'garden_outdoor', ['garden outdoor', 'garden & outdoor', 'garden'], 'Broad department for gardening, yard, and outdoor-living products.', { display_label: 'Garden & Outdoor' }),
  termSeed('product_taxonomy', 'electronics', ['electronics'], 'Broad department for electronics and related accessories.', { display_label: 'Electronics' }),
  termSeed('product_taxonomy', 'home_appliances', ['home appliances', 'appliances'], 'Broad department for household appliances and devices.', { display_label: 'Home Appliances' }),
  termSeed('product_taxonomy', 'clothing', ['clothing', 'apparel'], 'Broad department for clothing and apparel.', { display_label: 'Clothing' }),
  termSeed('product_taxonomy', 'health', ['health'], 'Broad department for medicine, supplements, first aid, and wellness products.', { display_label: 'Health' }),
  termSeed('product_taxonomy', 'office_school', ['office school', 'office & school', 'stationery'], 'Broad department for office, school, and stationery products.', { display_label: 'Office & School' }),
  termSeed('product_taxonomy', 'meat_seafood', ['meat seafood', 'meat & seafood'], 'Grocery department for meat, poultry, fish, and seafood.', { display_label: 'Meat & Seafood', parent_term_id: createSemanticTermId('product_taxonomy', 'grocery') }),
  termSeed('product_taxonomy', 'dairy', ['dairy'], 'Grocery department for milk-derived and dairy products.', { display_label: 'Dairy', parent_term_id: createSemanticTermId('product_taxonomy', 'grocery') }),
  termSeed('product_taxonomy', 'bread_bakery', ['bread bakery', 'bread & bakery', 'bakery'], 'Grocery department for bread and baked goods.', { display_label: 'Bread & Bakery', parent_term_id: createSemanticTermId('product_taxonomy', 'grocery') }),
  termSeed('product_taxonomy', 'beverages', ['beverages', 'drinks'], 'Grocery department for drinkable products.', { display_label: 'Beverages', parent_term_id: createSemanticTermId('product_taxonomy', 'grocery') }),
  termSeed('product_taxonomy', 'snacks_sweets', ['snacks sweets', 'snacks & sweets'], 'Grocery department for snacks, sweets, biscuits, and confectionery.', { display_label: 'Snacks & Sweets', parent_term_id: createSemanticTermId('product_taxonomy', 'grocery') }),
  termSeed('product_taxonomy', 'pantry', ['pantry'], 'Grocery department for shelf-stable staples and cooking ingredients.', { display_label: 'Pantry', parent_term_id: createSemanticTermId('product_taxonomy', 'grocery') }),
  termSeed('product_taxonomy', 'produce', ['produce', 'fruit', 'vegetables'], 'Grocery department for fruit, vegetables, and herbs.', { display_label: 'Produce', parent_term_id: createSemanticTermId('product_taxonomy', 'grocery') }),
  termSeed('product_taxonomy', 'frozen_food', ['frozen food'], 'Grocery department for frozen food products.', { display_label: 'Frozen Food', parent_term_id: createSemanticTermId('product_taxonomy', 'grocery') }),
  termSeed('product_taxonomy', 'poultry', ['poultry'], 'Meat and seafood department branch for poultry products.', { display_label: 'Poultry', parent_term_id: createSemanticTermId('product_taxonomy', 'meat_seafood') }),
  termSeed('product_taxonomy', 'chicken', ['chicken', '\u043f\u0438\u043b\u0435\u0448\u043a\u043e'], 'Poultry branch for chicken products.', { display_label: 'Chicken', parent_term_id: createSemanticTermId('product_taxonomy', 'poultry') }),
  termSeed('product_taxonomy', 'bath_body', ['bath body', 'bath & body'], 'Personal-care branch for bathing, body cleansing, and body-care products.', { display_label: 'Bath & Body', parent_term_id: createSemanticTermId('product_taxonomy', 'personal_care') }),
  termSeed('product_taxonomy', 'hair_care', ['hair care'], 'Personal-care branch for hair washing, conditioning, and styling.', { display_label: 'Hair Care', parent_term_id: createSemanticTermId('product_taxonomy', 'personal_care') }),
  termSeed('product_taxonomy', 'oral_care', ['oral care'], 'Personal-care branch for teeth and mouth care.', { display_label: 'Oral Care', parent_term_id: createSemanticTermId('product_taxonomy', 'personal_care') }),
  termSeed('product_taxonomy', 'skin_care', ['skin care'], 'Personal-care branch for skin-care products.', { display_label: 'Skin Care', parent_term_id: createSemanticTermId('product_taxonomy', 'personal_care') }),
  termSeed('product_taxonomy', 'deodorant', ['deodorant'], 'Personal-care branch for deodorant and antiperspirant products.', { display_label: 'Deodorant', parent_term_id: createSemanticTermId('product_taxonomy', 'personal_care') }),
  termSeed('product_taxonomy', 'soap', ['soap', '\u0441\u0430\u043f\u0443\u043d'], 'Bath and body branch for soap cleansing products.', { display_label: 'Soap', parent_term_id: createSemanticTermId('product_taxonomy', 'bath_body') }),
  termSeed('product_taxonomy', 'bar_soap', ['bar soap', 'hard soap', '\u0442\u0432\u044a\u0440\u0434 \u0441\u0430\u043f\u0443\u043d'], 'Soap branch for solid bar soap products.', { display_label: 'Bar Soap', parent_term_id: createSemanticTermId('product_taxonomy', 'soap') }),
  termSeed('product_taxonomy', 'shower_gel', ['shower gel'], 'Soap branch for shower gel body-cleansing products.', { display_label: 'Shower Gel', parent_term_id: createSemanticTermId('product_taxonomy', 'soap') }),
  termSeed('product_taxonomy', 'shampoo', ['shampoo', '\u0448\u0430\u043c\u043f\u043e\u0430\u043d'], 'Hair-care branch for shampoo products.', { display_label: 'Shampoo', parent_term_id: createSemanticTermId('product_taxonomy', 'hair_care') }),
  termSeed('product_taxonomy', 'conditioner', ['conditioner', 'hair conditioner', '\u0431\u0430\u043b\u0441\u0430\u043c'], 'Hair-care branch for conditioner products.', { display_label: 'Conditioner', parent_term_id: createSemanticTermId('product_taxonomy', 'hair_care') }),
  termSeed('product_taxonomy', 'car_care', ['car care'], 'Automotive branch for car care, maintenance, and consumable vehicle products.', { display_label: 'Car Care', parent_term_id: createSemanticTermId('product_taxonomy', 'automotive') }),
  termSeed('product_taxonomy', 'fluids', ['fluids', 'vehicle fluids'], 'Car-care branch for vehicle fluids.', { display_label: 'Fluids', parent_term_id: createSemanticTermId('product_taxonomy', 'car_care') }),
  termSeed('product_taxonomy', 'motor_oil', ['motor oil', 'engine oil'], 'Vehicle fluid for engine lubrication.', { display_label: 'Motor Oil', parent_term_id: createSemanticTermId('product_taxonomy', 'fluids') }),
  termSeed('product_taxonomy', 'garden_tools', ['garden tools'], 'Garden and outdoor branch for hand tools used in gardening.', { display_label: 'Garden Tools', parent_term_id: createSemanticTermId('product_taxonomy', 'garden_outdoor') }),
  termSeed('product_taxonomy', 'shovels', ['shovels', 'shovel', '\u043b\u043e\u043f\u0430\u0442\u0430'], 'Garden tools branch for shovels.', { display_label: 'Shovels', parent_term_id: createSemanticTermId('product_taxonomy', 'garden_tools') }),
  termSeed('product_category', 'food_beverage', ['food beverage', 'food & beverage', 'food', 'beverage'], 'Broad department for edible foods and beverages.'),
  termSeed('product_category', 'personal_care', ['personal care'], 'Broad department for body, hair, skin, hygiene, and oral care products.'),
  termSeed('product_category', 'household', ['household'], 'Broad department for household cleaning, paper, laundry, and home care supplies.'),
  termSeed('product_category', 'baby_kids', ['baby kids', 'baby & kids', 'baby and kids'], 'Broad department for baby and kids products.'),
  termSeed('product_category', 'pet_care', ['pet care'], 'Broad department for pet food, treats, and care products.'),
  termSeed('product_category', 'home_appliances', ['home appliances', 'appliances'], 'Broad department for household appliances and devices.'),
  termSeed('product_category', 'health', ['health'], 'Broad department for medicine, supplements, first aid, and wellness products.'),
  termSeed('product_category', 'non_food_misc', ['non food misc', 'non-food misc', 'miscellaneous'], 'Fallback broad department for non-food products that do not fit a more specific department.'),
  termSeed('product_category', 'hair_care', ['hair care'], 'Personal-care product family for hair washing, conditioning, and styling.', { parent_term_id: createSemanticTermId('product_category', 'personal_care') }),
  termSeed('product_category', 'shampoo', ['shampoo', '\u0448\u0430\u043c\u043f\u043e\u0430\u043d'], 'Hair-care product used to wash hair.', { parent_term_id: createSemanticTermId('product_category', 'hair_care') }),
  termSeed('product_category', 'conditioner', ['conditioner', 'hair conditioner', '\u0431\u0430\u043b\u0441\u0430\u043c'], 'Hair-care product used after shampoo to condition hair.', { parent_term_id: createSemanticTermId('product_category', 'hair_care') }),
  termSeed('product_category', 'dairy', ['dairy', 'milk products'], 'Milk-derived and dairy products.', { parent_term_id: createSemanticTermId('product_category', 'food_beverage') }),
  termSeed('product_category', 'milk', ['milk', '\u043c\u043b\u044f\u043a\u043e'], 'Milk product family.', { parent_term_id: createSemanticTermId('product_category', 'dairy') }),
  termSeed('product_category', 'yogurt', ['yogurt', 'yoghurt', '\u043a\u0438\u0441\u0435\u043b\u043e \u043c\u043b\u044f\u043a\u043e'], 'Cultured yogurt product family.', { parent_term_id: createSemanticTermId('product_category', 'dairy') }),
  termSeed('product_category', 'cheese', ['cheese'], 'Cheese product family.', { parent_term_id: createSemanticTermId('product_category', 'dairy') }),
  termSeed('product_category', 'sirene', ['sirene', '\u0441\u0438\u0440\u0435\u043d\u0435'], 'Bulgarian brined white cheese.', { parent_term_id: createSemanticTermId('product_category', 'cheese') }),
  termSeed('product_category', 'kashkaval', ['kashkaval', '\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b'], 'Yellow cheese common in Bulgaria.', { parent_term_id: createSemanticTermId('product_category', 'cheese') }),
  termSeed('product_category', 'meat', ['meat'], 'Meat product family.', { parent_term_id: createSemanticTermId('product_category', 'food_beverage') }),
  termSeed('product_category', 'beef', ['beef'], 'Beef meat products.', { parent_term_id: createSemanticTermId('product_category', 'meat') }),
  termSeed('product_category', 'pork', ['pork'], 'Pork meat products.', { parent_term_id: createSemanticTermId('product_category', 'meat') }),
  termSeed('product_category', 'chicken', ['chicken'], 'Chicken meat products.', { parent_term_id: createSemanticTermId('product_category', 'meat') }),
  termSeed('product_category', 'bakery', ['bakery'], 'Bread and baked goods.', { parent_term_id: createSemanticTermId('product_category', 'food_beverage') }),
  termSeed('product_category', 'bread', ['bread', '\u0445\u043b\u044f\u0431'], 'Bread products.', { parent_term_id: createSemanticTermId('product_category', 'bakery') }),
  termSeed('product_category', 'cleaning', ['cleaning'], 'Household cleaning product family.', { parent_term_id: createSemanticTermId('product_category', 'household') }),
  termSeed('product_category', 'detergent', ['detergent'], 'Cleaning or laundry detergent products.', { parent_term_id: createSemanticTermId('product_category', 'cleaning') }),
  termSeed('product_category', 'oral_care', ['oral care'], 'Personal-care product family for teeth and mouth care.', { parent_term_id: createSemanticTermId('product_category', 'personal_care') }),
  termSeed('product_category', 'toothpaste', ['toothpaste', '\u043f\u0430\u0441\u0442\u0430 \u0437\u0430 \u0437\u044a\u0431\u0438'], 'Oral-care paste for cleaning teeth.', { parent_term_id: createSemanticTermId('product_category', 'oral_care') }),
  termSeed('product_category', 'cleaning_appliances', ['cleaning appliances'], 'Home appliance family for cleaning devices.', { parent_term_id: createSemanticTermId('product_category', 'home_appliances') }),
  termSeed('product_category', 'vacuum_cleaner', ['vacuum cleaner', 'vacuum'], 'Cleaning appliance for vacuuming floors and surfaces.', { parent_term_id: createSemanticTermId('product_category', 'cleaning_appliances') }),
  termSeed('product_category', 'baby_food', ['baby food'], 'Baby food products.', { parent_term_id: createSemanticTermId('product_category', 'baby_kids') }),
  termSeed('product_category', 'puree', ['puree', 'pur\u00e9e'], 'Baby-food or fruit/vegetable puree products.', { parent_term_id: createSemanticTermId('product_category', 'baby_food') }),
  termSeed('product_category', 'pet_food', ['pet food'], 'Pet food product family.', { parent_term_id: createSemanticTermId('product_category', 'pet_care') }),
  termSeed('product_category', 'cat_food', ['cat food'], 'Pet food for cats.', { parent_term_id: createSemanticTermId('product_category', 'pet_food') }),
  termSeed('food_category', 'food_beverage', ['food beverage', 'food & beverage', 'food', 'beverage'], 'Legacy food-only broad category for edible foods and beverages.'),
  termSeed('food_category', 'dairy', ['dairy', 'milk products'], 'Milk-derived and dairy products.'),
  termSeed('food_category', 'beverages', ['beverages', 'drinks'], 'Drinkable products.'),
  termSeed('food_category', 'snacks', ['snacks'], 'Snack foods.'),
  termSeed('food_category', 'bakery', ['bakery'], 'Bread and baked goods.'),
  termSeed('food_category', 'bread', ['bread', '\u0445\u043b\u044f\u0431'], 'Bread products.'),
  termSeed('food_category', 'sweets', ['sweets', 'desserts'], 'Sweet foods and desserts.'),
  termSeed('food_category', 'meat', ['meat'], 'Meat products.'),
  termSeed('food_category', 'beef', ['beef'], 'Beef meat products.'),
  termSeed('food_category', 'pork', ['pork'], 'Pork meat products.'),
  termSeed('food_category', 'chicken', ['chicken'], 'Chicken meat products.'),
  termSeed('dairy_type', 'milk', ['milk', '\u043c\u043b\u044f\u043a\u043e'], 'Milk as a dairy beverage or ingredient.'),
  termSeed('dairy_type', 'yogurt', ['yogurt', 'yoghurt', '\u043a\u0438\u0441\u0435\u043b\u043e \u043c\u043b\u044f\u043a\u043e'], 'Cultured yogurt.'),
  termSeed('dairy_type', 'cheese', ['cheese'], 'Cheese.'),
  termSeed('dairy_type', 'sirene', ['sirene', '\u0441\u0438\u0440\u0435\u043d\u0435'], 'Bulgarian brined white cheese.'),
  termSeed('dairy_type', 'kashkaval', ['kashkaval', '\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b'], 'Yellow cheese common in Bulgaria.'),
  termSeed('milk_source', 'cow', ['cow'], 'Cow milk source.'),
  termSeed('milk_source', 'sheep', ['sheep'], 'Sheep milk source.'),
  termSeed('milk_source', 'goat', ['goat'], 'Goat milk source.'),
  termSeed('milk_source', 'mixed', ['mixed'], 'Mixed animal milk source.'),
  termSeed('milk_source', 'plant_based', ['plant based', 'plant-based'], 'Plant-based milk alternative source.'),
  termSeed('quality_tier', 'premium', ['premium'], 'Premium quality or positioning.'),
  termSeed('quality_tier', 'budget', ['budget'], 'Budget quality or positioning.'),
  termSeed('quality_tier', 'standard', ['standard'], 'Standard quality or positioning.'),
  termSeed('quality_tier', 'economy', ['economy'], 'Economy quality or positioning.'),
  termSeed('quality_tier', 'mid-tier', ['mid-tier', 'mid tier'], 'Mid-tier quality or positioning.'),
  termSeed('storage_type', 'shelf_stable', ['shelf stable', 'ambient'], 'Shelf-stable storage.'),
  termSeed('storage_type', 'refrigerated', ['refrigerated', 'fresh'], 'Requires or implies chilled storage.'),
  termSeed('storage_type', 'frozen', ['frozen'], 'Frozen storage.'),
  termSeed('flavor', 'plain', ['plain', 'natural'], 'Plain or unflavored variant.'),
  termSeed('flavor', 'chocolate', ['chocolate', '\u0448\u043e\u043a\u043e\u043b\u0430\u0434'], 'Chocolate flavor.'),
  termSeed('flavor', 'vanilla', ['vanilla'], 'Vanilla flavor.'),
  termSeed('flavor', 'strawberry', ['strawberry'], 'Strawberry flavor.'),
  termSeed('dietary_claim', 'organic', ['organic', 'bio', '\u0431\u0438\u043e'], 'Organic or bio claim.'),
  termSeed('dietary_claim', 'vegan', ['vegan'], 'Vegan claim.'),
  termSeed('dietary_claim', 'vegetarian', ['vegetarian'], 'Vegetarian claim.'),
  termSeed('dietary_claim', 'gluten_free', ['gluten free', 'gluten-free'], 'Gluten-free claim.'),
  termSeed('dietary_claim', 'lactose_free', ['lactose free', 'lactose-free'], 'Lactose-free claim.'),
  termSeed('dietary_claim', 'sugar_free', ['sugar free', 'sugar-free'], 'Sugar-free claim.'),
  termSeed('material', 'plastic', ['plastic'], 'Plastic material.'),
  termSeed('material', 'glass', ['glass'], 'Glass material.'),
  termSeed('material', 'paperboard', ['paperboard', 'carton board'], 'Paperboard material.'),
  termSeed('material', 'metal', ['metal', 'aluminum', 'steel'], 'Metal material.'),
  termSeed('preparation_state', 'ready_to_eat', ['ready to eat', 'ready-to-eat'], 'Ready to eat without preparation.'),
  termSeed('preparation_state', 'requires_cooking', ['requires cooking', 'cook before eating'], 'Requires cooking.'),
  termSeed('preparation_state', 'fresh', ['fresh'], 'Fresh state.'),
  termSeed('preparation_state', 'uht', ['uht'], 'Ultra-high-temperature processed state.'),
]);

function termSeed(domain, canonicalLabel, aliases, definition, overrides = {}) {
  return Object.freeze({
    domain,
    canonical_label: canonicalLabel,
    display_label: overrides.display_label || canonicalLabel,
    definition,
    aliases,
    parent_term_id: overrides.parent_term_id || null,
    related_term_ids: overrides.related_term_ids || [],
    status: overrides.status || 'active',
    source: overrides.source || 'seed',
    confidence: overrides.confidence ?? 1,
    evidence_examples: overrides.evidence_examples || [],
  });
}

function buildSeedSemanticTermRegistry({ now = new Date().toISOString() } = {}) {
  return DEFAULT_REGISTRY_SEED_TERMS.map((seed) => ({
    term_id: createSemanticTermId(seed.domain, seed.canonical_label),
    domain: seed.domain,
    canonical_label: normalizeRegistryLabel(seed.canonical_label),
    display_label: seed.display_label,
    definition: seed.definition,
    aliases: dedupeStrings(seed.aliases),
    parent_term_id: seed.parent_term_id,
    related_term_ids: dedupeStrings(seed.related_term_ids),
    status: seed.status,
    source: seed.source,
    confidence: clampConfidence(seed.confidence),
    evidence_examples: seed.evidence_examples,
    created_at: now,
    updated_at: now,
  }));
}

function seedSemanticTermRegistry(state, { now = new Date().toISOString() } = {}) {
  state.semantic_term_registry = state.semantic_term_registry || [];
  const existingIds = new Set(state.semantic_term_registry.map((record) => record.term_id));
  const created = [];
  buildSeedSemanticTermRegistry({ now }).forEach((record) => {
    if (!existingIds.has(record.term_id)) {
      state.semantic_term_registry.push(record);
      existingIds.add(record.term_id);
      created.push(record);
    }
  });
  state.semantic_term_registry.sort((left, right) => left.term_id.localeCompare(right.term_id));
  return created;
}

function buildRegistryContext(state, {
  domains = SEMANTIC_REGISTRY_DOMAINS,
  limitPerDomain = 40,
  maxTotalTerms = null,
  relevantText = '',
  proposedMode = 'all',
} = {}) {
  const domainSet = new Set(domains);
  const normalizedRelevantText = normalizeRegistrySearchText(relevantText);
  const totalLimit = Number.isFinite(maxTotalTerms) && maxTotalTerms > 0 ? Math.floor(maxTotalTerms) : null;
  const rows = [
    ...buildSeedSemanticTermRegistry({ now: 'seed' }),
    ...(state?.semantic_term_registry || []),
  ];
  const byId = new Map();
  rows.forEach((row) => {
    if (!domainSet.has(row.domain) || !['active', 'proposed'].includes(row.status)) {
      return;
    }
    const relevanceScore = scoreRegistryTermRelevance(row, normalizedRelevantText);
    if (row.status === 'proposed' && proposedMode === 'relevant' && relevanceScore <= 0) {
      return;
    }
    if (row.status === 'proposed' && proposedMode === 'none') {
      return;
    }
    const existing = byId.get(row.term_id);
    const rowWithScore = {
      ...row,
      _relevance_score: relevanceScore,
    };
    if (!existing || statusPriority(row.status) < statusPriority(existing.status)) {
      byId.set(row.term_id, rowWithScore);
    } else if (!existing || relevanceScore > (existing._relevance_score || 0)) {
      byId.set(row.term_id, rowWithScore);
    } else if (
      statusPriority(row.status) === statusPriority(existing.status) &&
      relevanceScore === (existing._relevance_score || 0) &&
      existing.created_at === 'seed' &&
      row.created_at !== 'seed'
    ) {
      byId.set(row.term_id, rowWithScore);
    }
  });
  const buckets = {};
  domains.forEach((domain) => {
    buckets[domain] = [];
  });
  [...byId.values()]
    .sort(compareRegistryContextRows)
    .forEach((row) => {
      if (buckets[row.domain] && buckets[row.domain].length < limitPerDomain) {
        buckets[row.domain].push(formatRegistryContextRow(row));
      }
    });

  if (buckets.product_taxonomy) {
    buckets.product_taxonomy = selectProductTaxonomyContextRows([...byId.values()], {
      limit: limitPerDomain,
      normalizedRelevantText,
    });
  }

  const grouped = {};
  domains.forEach((domain) => {
    grouped[domain] = [];
  });

  let written = 0;
  let offset = 0;
  while (!totalLimit || written < totalLimit) {
    let wroteAny = false;
    for (const domain of domains) {
      const row = buckets[domain]?.[offset];
      if (!row) {
        continue;
      }
      grouped[domain].push(row);
      written += 1;
      wroteAny = true;
      if (totalLimit && written >= totalLimit) {
        break;
      }
    }
    if (!wroteAny) {
      break;
    }
    offset += 1;
  }

  return grouped;
}

function formatRegistryContextRow(row) {
  return {
    term_id: row.term_id,
    canonical_label: row.canonical_label,
    display_label: row.display_label || row.canonical_label,
    parent_term_id: row.parent_term_id || null,
    aliases: dedupeStrings(row.aliases),
    definition: row.definition || null,
    status: row.status,
  };
}

function selectProductTaxonomyContextRows(rows, {
  limit,
  normalizedRelevantText = '',
} = {}) {
  const taxonomyRows = rows
    .filter((row) => row.domain === 'product_taxonomy')
    .sort(compareRegistryContextRows);
  const byId = new Map(taxonomyRows.map((row) => [row.term_id, row]));
  const selected = new Map();

  taxonomyRows
    .filter((row) => PRODUCT_TAXONOMY_TOP_LEVEL_LABELS.includes(row.canonical_label))
    .forEach((row) => selected.set(row.term_id, row));

  taxonomyRows
    .filter((row) => (row._relevance_score || 0) > 0)
    .forEach((row) => {
      selected.set(row.term_id, row);
      let parentId = row.parent_term_id;
      while (parentId && byId.has(parentId)) {
        const parent = byId.get(parentId);
        selected.set(parent.term_id, parent);
        parentId = parent.parent_term_id;
      }
    });

  if (selected.size < Math.min(limit, taxonomyRows.length)) {
    const relevantTopLevelIds = new Set(
      [...selected.values()]
        .filter((row) => !row.parent_term_id)
        .map((row) => row.term_id)
    );
    taxonomyRows
      .filter((row) => row.parent_term_id && relevantTopLevelIds.has(findTopLevelParentId(row, byId)))
      .forEach((row) => {
        if (selected.size < limit && ((row._relevance_score || 0) > 0 || normalizedRelevantText)) {
          selected.set(row.term_id, row);
        }
      });
  }

  const topLevelCount = PRODUCT_TAXONOMY_TOP_LEVEL_LABELS.length;
  return [...selected.values()]
    .sort(compareRegistryContextRows)
    .slice(0, Math.max(limit, topLevelCount))
    .map(formatRegistryContextRow);
}

function findTopLevelParentId(row, byId) {
  let current = row;
  while (current?.parent_term_id && byId.has(current.parent_term_id)) {
    current = byId.get(current.parent_term_id);
  }
  return current?.term_id || null;
}

function compareRegistryContextRows(left, right) {
  if (left.domain !== right.domain) {
    return left.domain.localeCompare(right.domain);
  }
  const status = statusPriority(left.status) - statusPriority(right.status);
  if (status !== 0) {
    return status;
  }
  const relevance = (right._relevance_score || 0) - (left._relevance_score || 0);
  if (relevance !== 0) {
    return relevance;
  }
  return String(left.canonical_label).localeCompare(String(right.canonical_label));
}

function statusPriority(status) {
  return status === 'active' ? 0 : 1;
}

function scoreRegistryTermRelevance(row, normalizedRelevantText) {
  if (!normalizedRelevantText) {
    return 0;
  }
  let score = 0;
  const candidates = [
    row.canonical_label,
    row.display_label,
    ...(Array.isArray(row.aliases) ? row.aliases : []),
  ];
  candidates.forEach((candidate) => {
    const normalized = normalizeRegistrySearchText(candidate);
    if (!normalized) {
      return;
    }
    if (normalizedRelevantText === normalized) {
      score = Math.max(score, 4);
    } else if (normalizedRelevantText.includes(` ${normalized} `)) {
      score = Math.max(score, normalized.length > 3 ? 3 : 1);
    } else if (normalized.length > 3 && normalizedRelevantText.includes(normalized)) {
      score = Math.max(score, 2);
    }
  });
  return score;
}

function normalizeRegistrySearchText(value) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized ? ` ${normalized} ` : '';
}

function createSemanticTermId(domain, label) {
  return `sem_${normalizeRegistryLabel(domain)}_${normalizeRegistryLabel(label)}`.replace(/[^a-z0-9_]+/gu, '_');
}

function createSemanticProposalId(proposal) {
  return `semprop_${shortHash([
    proposal.domain,
    proposal.action,
    proposal.existing_term_id || '',
    proposal.proposed_label || '',
    proposal.proposed_alias || '',
    proposal.parent_term_id || '',
  ].join('|'))}`;
}

function writeRegistryProposalsFromActions(state, {
  actions = [],
  evidenceProductIds = [],
  now = new Date().toISOString(),
} = {}) {
  state.semantic_term_registry_proposals = state.semantic_term_registry_proposals || [];
  const existingByKey = new Map(
    state.semantic_term_registry_proposals.map((proposal) => [proposalDedupKey(proposal), proposal])
  );
  const written = [];

  actions.forEach((action) => {
    const normalized = normalizeRegistryAction(action);
    if (!normalized || !PROPOSAL_ACTIONS.includes(normalized.action)) {
      return;
    }
    const proposal = {
      proposal_id: '',
      domain: normalized.domain,
      action: normalized.action,
      proposed_label: normalized.proposed_label,
      proposed_alias: normalized.proposed_alias,
      proposed_aliases: dedupeStrings(normalized.proposed_aliases),
      existing_term_id: normalized.existing_term_id,
      parent_term_id: normalized.parent_term_id,
      parent_label: normalized.parent_label,
      evidence_product_ids: dedupeStrings([
        ...evidenceProductIds,
        ...(normalized.evidence_product_ids || []),
      ]),
      evidence_terms: dedupeStrings(normalized.evidence_terms || normalized.evidence || []),
      confidence: normalized.confidence,
      status: 'pending',
      created_at: now,
      updated_at: now,
    };
    proposal.proposal_id = createSemanticProposalId(proposal);
    const key = proposalDedupKey(proposal);
    if (existingByKey.has(key)) {
      return;
    }
    existingByKey.set(key, proposal);
    state.semantic_term_registry_proposals.push(proposal);
    written.push(proposal);
  });

  state.semantic_term_registry_proposals.sort((left, right) => left.proposal_id.localeCompare(right.proposal_id));
  return written;
}

function writeTaxonomyTermProposals(state, {
  taxonomyClassification = null,
  evidenceProductIds = [],
  now = new Date().toISOString(),
} = {}) {
  const proposedTerms = taxonomyClassification?.proposed_terms;
  if (!Array.isArray(proposedTerms) || proposedTerms.length === 0) {
    return [];
  }
  const actions = proposedTerms.map((term) => {
    if (!term || typeof term !== 'object' || Array.isArray(term)) {
      return null;
    }
    return {
      action: 'propose_new_term',
      domain: 'product_taxonomy',
      existing_term_id: null,
      proposed_label: term.proposed_label,
      proposed_alias: null,
      proposed_aliases: term.aliases,
      parent_term_id: term.parent_term_id,
      parent_label: term.parent_label,
      confidence: term.confidence,
      evidence: term.evidence,
      evidence_product_ids: evidenceProductIds,
      reason: term.reason,
    };
  }).filter(Boolean);

  return writeRegistryProposalsFromActions(state, {
    actions,
    evidenceProductIds,
    now,
  });
}

function normalizeRegistryAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return null;
  }
  const normalized = {
    action: normalizeRegistryLabel(action.action),
    domain: normalizeRegistryLabel(action.domain),
    existing_term_id: normalizeNullableString(action.existing_term_id),
    proposed_label: normalizeNullableString(action.proposed_label),
    proposed_alias: normalizeNullableString(action.proposed_alias),
    proposed_aliases: dedupeStrings(action.proposed_aliases),
    parent_term_id: normalizeNullableString(action.parent_term_id),
    parent_label: normalizeNullableString(action.parent_label),
    confidence: clampConfidence(action.confidence),
    evidence: normalizeEvidence(action.evidence),
    evidence_product_ids: dedupeStrings(action.evidence_product_ids),
    evidence_terms: dedupeStrings(action.evidence_terms),
    reason: normalizeNullableString(action.reason),
  };
  if (!REGISTRY_ACTIONS.includes(normalized.action) || !SEMANTIC_REGISTRY_DOMAINS.includes(normalized.domain)) {
    return null;
  }
  if (normalized.domain === 'food_category' && !isAllowedFoodCategoryAction(normalized)) {
    return null;
  }
  return normalized;
}

function isAllowedFoodCategoryAction(action) {
  const labels = [
    action.existing_term_id ? action.existing_term_id.replace(/^sem_food_category_/u, '') : '',
    action.proposed_label,
    action.proposed_alias,
    action.parent_term_id ? action.parent_term_id.replace(/^sem_food_category_/u, '') : '',
  ]
    .map(normalizeRegistryLabel)
    .filter(Boolean);
  if (labels.length === 0) {
    return true;
  }
  return labels.every((label) => FOOD_CATEGORY_CANONICAL_LABELS.has(label));
}

function proposalDedupKey(proposal) {
  if (proposal.domain === 'product_taxonomy' && proposal.action === 'propose_new_term') {
    return [
      proposal.domain,
      normalizeNullableString(proposal.proposed_label) || '',
      normalizeNullableString(proposal.parent_term_id) || '',
    ].join('|');
  }
  return [
    proposal.domain,
    proposal.action,
    normalizeNullableString(proposal.existing_term_id) || '',
    normalizeNullableString(proposal.proposed_label) || '',
    normalizeNullableString(proposal.proposed_alias) || '',
    normalizeNullableString(proposal.parent_term_id) || '',
  ].join('|');
}

function buildFailedEnrichmentResponseRecord({
  runId,
  batchIndex,
  productIds = [],
  provider = 'xai',
  model = null,
  errorType = 'provider_response_error',
  parseError = null,
  rawContent = '',
  now = new Date().toISOString(),
} = {}) {
  const rawContentRedacted = redactProviderContent(rawContent);
  return {
    failed_response_id: `enrich_fail_${shortHash([
      runId || '',
      batchIndex ?? '',
      productIds.join(','),
      rawContentRedacted,
      now,
    ].join('|'))}`,
    run_id: runId || null,
    batch_index: batchIndex ?? null,
    product_ids: dedupeStrings(productIds),
    provider,
    model,
    error_type: errorType,
    parse_error: parseError ? String(parseError).slice(0, 500) : null,
    raw_content_redacted: rawContentRedacted,
    created_at: now,
  };
}

function redactProviderContent(content) {
  return String(content || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gu, 'Bearer [REDACTED]')
    .replace(/"api[_-]?key"\s*:\s*"[^"]+"/giu, '"api_key":"[REDACTED]"')
    .replace(/xai-[A-Za-z0-9._-]+/gu, '[REDACTED_KEY]')
    .slice(0, 4000);
}

function normalizeRegistryLabel(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\p{L}]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
}

function normalizeNullableString(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().replace(/\s+/gu, ' ');
  return normalized || null;
}

function normalizeEvidence(value) {
  if (Array.isArray(value)) {
    return dedupeStrings(value);
  }
  const scalar = normalizeNullableString(value);
  return scalar ? [scalar] : [];
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    if (typeof value !== 'string') {
      return;
    }
    const normalized = value.trim().replace(/\s+/gu, ' ');
    const key = normalized.toLowerCase();
    if (normalized && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  });
  return result;
}

function clampConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Math.round(value * 10000) / 10000;
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
}

module.exports = {
  CANONICAL_SEMANTIC_V3_PROMPT_VERSION,
  CANONICAL_SEMANTIC_V3_VERSION,
  DEFAULT_REGISTRY_SEED_TERMS,
  REGISTRY_ACTIONS,
  SEMANTIC_REGISTRY_DOMAINS,
  buildFailedEnrichmentResponseRecord,
  buildRegistryContext,
  buildSeedSemanticTermRegistry,
  createSemanticProposalId,
  createSemanticTermId,
  normalizeRegistryAction,
  redactProviderContent,
  seedSemanticTermRegistry,
  writeTaxonomyTermProposals,
  writeRegistryProposalsFromActions,
};
