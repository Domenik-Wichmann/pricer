const assert = require('node:assert/strict');

const {
  buildIngredientPurchaseDemand,
  convertEdibleQuantityToPurchase,
  convertIngredientQuantityToEdible,
  convertUnitValue,
  createEmptyDataBackbone,
  seedDefaultMealUnits,
  upsertIngredient,
  upsertIngredientCategory,
  upsertIngredientFamily,
  upsertIngredientUnitRule,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createConversionState() {
  const state = createEmptyDataBackbone();
  seedDefaultMealUnits(state, {
    createdAt: '2026-04-23T10:00:00.000Z',
  });
  upsertIngredientFamily(state, {
    ingredientFamilyId: 'family_vegetable',
    nameBg: 'зеленчуци',
    nameEn: 'vegetables',
    createdAt: '2026-04-23T10:01:00.000Z',
  });
  upsertIngredientCategory(state, {
    ingredientCategoryId: 'category_allium',
    ingredientFamilyId: 'family_vegetable',
    nameBg: 'лукови',
    nameEn: 'alliums',
    createdAt: '2026-04-23T10:02:00.000Z',
  });
  upsertIngredient(state, {
    ingredientId: 'ingredient_onion',
    nameBg: 'лук',
    nameEn: 'onion',
    ingredientFamilyId: 'family_vegetable',
    ingredientCategoryId: 'category_allium',
    defaultEdibleUnit: 'g',
    defaultPurchaseUnit: 'kg',
    purchaseModel: {
      common_purchase_units: ['kg', 'piece'],
      edible_yield_ratio: 0.9,
      price_basis_unit: 'kg',
    },
    quality: {
      runtime_safe_fields: ['purchase_model'],
    },
    createdAt: '2026-04-23T10:03:00.000Z',
  });
  upsertIngredientUnitRule(state, {
    ingredientId: 'ingredient_onion',
    pieceToGrams: 120,
    edibleYieldRatio: 0.9,
    createdAt: '2026-04-23T10:04:00.000Z',
  });
  return state;
}

test('generic unit conversions stay deterministic across seeded base units', () => {
  const state = createConversionState();

  assert.equal(convertUnitValue({
    state,
    value: 1.5,
    fromUnitId: 'kg',
    toUnitId: 'g',
  }), 1500);
  assert.equal(convertUnitValue({
    state,
    value: 2,
    fromUnitId: 'l',
    toUnitId: 'ml',
  }), 2000);
});

test('ingredient piece rules convert recipe quantities into edible quantities', () => {
  const state = createConversionState();
  const edible = convertIngredientQuantityToEdible({
    state,
    ingredientId: 'ingredient_onion',
    quantity: 2,
    unitId: 'piece',
  });

  assert.equal(edible.edible_quantity, 240);
  assert.equal(edible.edible_unit, 'g');
  assert.equal(edible.conversion_source, 'ingredient_piece_rule');
});

test('edible quantities round conservatively into purchasable quantities', () => {
  const state = createConversionState();
  const purchase = convertEdibleQuantityToPurchase({
    state,
    ingredientId: 'ingredient_onion',
    edibleQuantity: 240,
    edibleUnitId: 'g',
  });

  assert.equal(purchase.raw_required_purchase_basis_quantity, 0.2667);
  assert.equal(purchase.rounded_required_purchase_basis_quantity, 1);
  assert.equal(purchase.purchase_quantity, 1);
  assert.equal(purchase.purchase_unit, 'kg');
  assert.equal(purchase.edible_yield_ratio, 0.9);
});

test('purchase-demand helper preserves the full recipe to basket-ready chain', () => {
  const state = createConversionState();
  const demand = buildIngredientPurchaseDemand({
    state,
    ingredientId: 'ingredient_onion',
    quantity: 2,
    unitId: 'piece',
  });

  assert.equal(demand.source_quantity, 2);
  assert.equal(demand.source_unit, 'piece');
  assert.equal(demand.edible_quantity, 240);
  assert.equal(demand.raw_required_purchase_basis_quantity, 0.2667);
  assert.equal(demand.purchase_quantity, 1);
  assert.equal(demand.purchase_unit, 'kg');
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

  console.log(`\nPhase M0 conversion tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
