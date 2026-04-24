const assert = require('node:assert/strict');

const {
  createEmptyDataBackbone,
  estimateIngredientCost,
  listIngredientPriceCandidates,
  resolveBestProductIngredientMapping,
  seedDefaultMealUnits,
  upsertIngredient,
  upsertIngredientCategory,
  upsertIngredientFamily,
  upsertProductIngredientMapping,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createMappingState() {
  const state = createEmptyDataBackbone();
  seedDefaultMealUnits(state, {
    createdAt: '2026-04-23T11:00:00.000Z',
  });
  upsertIngredientFamily(state, {
    ingredientFamilyId: 'family_vegetable',
    nameBg: 'зеленчуци',
    nameEn: 'vegetables',
    createdAt: '2026-04-23T11:01:00.000Z',
  });
  upsertIngredientCategory(state, {
    ingredientCategoryId: 'category_nightshade',
    ingredientFamilyId: 'family_vegetable',
    nameBg: 'нощни сенници',
    nameEn: 'nightshades',
    createdAt: '2026-04-23T11:02:00.000Z',
  });
  upsertIngredient(state, {
    ingredientId: 'ingredient_tomato',
    nameBg: 'домат',
    nameEn: 'tomato',
    ingredientFamilyId: 'family_vegetable',
    ingredientCategoryId: 'category_nightshade',
    defaultEdibleUnit: 'g',
    defaultPurchaseUnit: 'kg',
    purchaseModel: {
      common_purchase_units: ['kg'],
      edible_yield_ratio: 0.92,
      price_basis_unit: 'kg',
      estimated_price_per_basis_unit: 7.5,
    },
    dietaryFlags: {
      vegan: true,
      vegetarian: true,
    },
    quality: {
      runtime_safe_fields: ['purchase_model', 'dietary_flags'],
    },
    createdAt: '2026-04-23T11:03:00.000Z',
  });

  state.canonical_products = [
    {
      canonical_product_id: 'cp_tomato_1kg',
      canonical_display_name: 'Tomatoes 1kg',
      canonical_size_value: 1,
      canonical_size_unit: 'kg',
      canonical_attributes_json: {},
      source_product_count: 1,
      created_at: '2026-04-23T11:04:00.000Z',
      updated_at: '2026-04-23T11:04:00.000Z',
    },
    {
      canonical_product_id: 'cp_tomato_500g',
      canonical_display_name: 'Tomatoes 500g',
      canonical_size_value: 500,
      canonical_size_unit: 'g',
      canonical_attributes_json: {},
      source_product_count: 1,
      created_at: '2026-04-23T11:04:30.000Z',
      updated_at: '2026-04-23T11:04:30.000Z',
    },
  ];
  state.canonical_product_mappings = [
    {
      source_product_id: 'sp_store_a',
      dedupe_key: 'a',
      canonical_product_id: 'cp_tomato_1kg',
      mapping_confidence: 0.98,
      mapping_method: 'deterministic',
      mapped_at: '2026-04-23T11:05:00.000Z',
    },
    {
      source_product_id: 'sp_store_b',
      dedupe_key: 'b',
      canonical_product_id: 'cp_tomato_500g',
      mapping_confidence: 0.9,
      mapping_method: 'deterministic',
      mapped_at: '2026-04-23T11:05:30.000Z',
    },
  ];
  state.source_products = [
    {
      source_product_id: 'sp_store_a',
      locality_code: '1000',
      store_name_raw: 'Store A',
      product_code: '1001',
      category_code: '6',
    },
    {
      source_product_id: 'sp_store_b',
      locality_code: '1000',
      store_name_raw: 'Store B',
      product_code: '1002',
      category_code: '6',
    },
  ];
  state.product_daily_prices = [
    {
      source_product_id: 'sp_store_a',
      date: '2026-04-23',
      price_min: 4,
    },
    {
      source_product_id: 'sp_store_b',
      date: '2026-04-23',
      price_min: 3,
    },
  ];
  state.category_daily_aggregates = [
    {
      category_code: '6',
      date: '2026-04-23',
      avg_price: 4.2,
      min_price: 3,
      max_price: 5,
      product_count: 2,
      snapshot_count: 2,
    },
  ];

  upsertProductIngredientMapping(state, {
    canonicalProductId: 'cp_tomato_1kg',
    ingredientId: 'ingredient_tomato',
    mappingType: 'exact',
    confidence: 0.95,
    source: 'deterministic_rule',
    createdAt: '2026-04-23T11:06:00.000Z',
  });
  upsertProductIngredientMapping(state, {
    canonicalProductId: 'cp_tomato_500g',
    ingredientId: 'ingredient_tomato',
    mappingType: 'category',
    confidence: 0.74,
    source: 'deterministic_rule',
    createdAt: '2026-04-23T11:06:30.000Z',
  });

  return state;
}

test('mapping resolution prefers stronger mapping types before weaker ones', () => {
  const state = createMappingState();
  const best = resolveBestProductIngredientMapping({
    state,
    ingredientId: 'ingredient_tomato',
    canonicalProductId: 'cp_tomato_1kg',
  });

  assert.equal(best.mapping_type, 'exact');
  assert.equal(best.canonical_product_id, 'cp_tomato_1kg');
});

test('price candidates expose normalized unit prices for mapped products', () => {
  const state = createMappingState();
  const candidates = listIngredientPriceCandidates({
    state,
    ingredientId: 'ingredient_tomato',
    localityCode: '1000',
    date: '2026-04-23',
  });

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].source_product_id, 'sp_store_a');
  assert.equal(candidates[0].unit_price_per_basis_unit, 4);
  assert.equal(candidates[1].unit_price_per_basis_unit, 6);
});

test('ingredient cost uses exact local store price when available', () => {
  const state = createMappingState();
  const estimate = estimateIngredientCost({
    state,
    ingredientId: 'ingredient_tomato',
    quantity: 500,
    unitId: 'g',
    localityCode: '1000',
    storeNameRaw: 'Store A',
    date: '2026-04-23',
  });

  assert.equal(estimate.price_source, 'exact_local_store_price');
  assert.equal(estimate.source_product_id, 'sp_store_a');
  assert.equal(estimate.unit_price_per_basis_unit, 4);
  assert.equal(estimate.estimated_total_cost, 4);
});

test('ingredient cost falls back to other-store mapped product price when local exact match is absent', () => {
  const state = createMappingState();
  const estimate = estimateIngredientCost({
    state,
    ingredientId: 'ingredient_tomato',
    quantity: 500,
    unitId: 'g',
    localityCode: '9999',
    storeNameRaw: 'Missing Store',
    date: '2026-04-23',
  });

  assert.equal(estimate.price_source, 'other_store_product_price');
  assert.equal(estimate.source_product_id, 'sp_store_a');
  assert.equal(estimate.unit_price_per_basis_unit, 4);
});

test('ingredient cost falls back to category averages before ingredient estimates', () => {
  const state = createMappingState();
  state.product_daily_prices = [];

  const estimate = estimateIngredientCost({
    state,
    ingredientId: 'ingredient_tomato',
    quantity: 500,
    unitId: 'g',
    date: '2026-04-23',
  });

  assert.equal(estimate.price_source, 'category_average');
  assert.equal(estimate.unit_price_per_basis_unit, 5.6);
  assert.equal(estimate.estimated_total_cost, 5.6);
});

test('ingredient estimate is the final fallback when no mapped product prices or category averages exist', () => {
  const state = createMappingState();
  state.product_daily_prices = [];
  state.category_daily_aggregates = [];

  const estimate = estimateIngredientCost({
    state,
    ingredientId: 'ingredient_tomato',
    quantity: 500,
    unitId: 'g',
    date: '2026-04-23',
  });

  assert.equal(estimate.price_source, 'ingredient_estimate');
  assert.equal(estimate.unit_price_per_basis_unit, 7.5);
  assert.equal(estimate.estimated_total_cost, 7.5);
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

  console.log(`\nPhase M0 mapping tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
