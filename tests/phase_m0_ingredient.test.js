const assert = require('node:assert/strict');

const {
  createEmptyDataBackbone,
  getIngredientById,
  listIngredientCategories,
  listIngredientFamilies,
  listIngredients,
  seedDefaultMealUnits,
  upsertIngredient,
  upsertIngredientCategory,
  upsertIngredientFamily,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createMealState() {
  const state = createEmptyDataBackbone();
  seedDefaultMealUnits(state, {
    createdAt: '2026-04-23T09:00:00.000Z',
  });
  upsertIngredientFamily(state, {
    ingredientFamilyId: 'family_vegetable',
    nameBg: 'зеленчуци',
    nameEn: 'vegetables',
    aliasesBg: ['зеленчук'],
    aliasesEn: ['vegetable'],
    createdAt: '2026-04-23T09:01:00.000Z',
  });
  upsertIngredientCategory(state, {
    ingredientCategoryId: 'category_nightshade',
    ingredientFamilyId: 'family_vegetable',
    nameBg: 'нощни сенници',
    nameEn: 'nightshades',
    aliasesBg: ['доматови'],
    aliasesEn: ['nightshade'],
    createdAt: '2026-04-23T09:02:00.000Z',
  });
  return state;
}

test('empty backbone exposes meal foundation collections', () => {
  const state = createEmptyDataBackbone();

  assert.deepEqual(state.ingredient_families, []);
  assert.deepEqual(state.ingredient_categories, []);
  assert.deepEqual(state.ingredients, []);
  assert.deepEqual(state.product_ingredient_mappings, []);
  assert.deepEqual(state.units, []);
  assert.deepEqual(state.unit_conversions, []);
  assert.deepEqual(state.ingredient_unit_rules, []);
});

test('ingredient records can be stored and queried with localized names and runtime-safe fields', () => {
  const state = createMealState();
  upsertIngredient(state, {
    ingredientId: 'ingredient_tomato',
    nameBg: 'домат',
    nameEn: 'tomato',
    aliasesBg: ['домати'],
    aliasesEn: ['tomatoes'],
    ingredientFamilyId: 'family_vegetable',
    ingredientCategoryId: 'category_nightshade',
    defaultEdibleUnit: 'g',
    defaultPurchaseUnit: 'kg',
    classification: {
      food_group: 'vegetable',
      culinary_roles: ['base', 'fresh_element'],
      common_cuisines: ['bulgarian', 'mediterranean'],
      is_staple: true,
      availability_level: 'high',
    },
    purchaseModel: {
      common_purchase_units: ['kg', 'g', 'piece'],
      typical_piece_weight_g: 120,
      edible_yield_ratio: 0.92,
      price_basis_unit: 'kg',
      estimated_price_per_basis_unit: 4.8,
    },
    dietaryFlags: {
      vegan: true,
      vegetarian: true,
    },
    enrichment: {
      flavor_profile: {
        acidity: 'medium',
      },
    },
    quality: {
      source: 'llm_enriched',
      confidence: 0.82,
      runtime_safe_fields: ['classification', 'purchase_model', 'dietary_flags'],
    },
    createdAt: '2026-04-23T09:03:00.000Z',
  });

  assert.equal(listIngredientFamilies({ state }).length, 1);
  assert.equal(listIngredientCategories({ state }).length, 1);
  assert.equal(listIngredients({ state }).length, 1);

  const ingredient = getIngredientById({
    state,
    ingredientId: 'ingredient_tomato',
  });
  assert.equal(ingredient.name_bg, 'домат');
  assert.equal(ingredient.name_en, 'tomato');
  assert.deepEqual(ingredient.aliases_en, ['tomatoes']);
  assert.equal(ingredient.purchase_model.price_basis_unit, 'kg');
  assert.equal(ingredient.purchase_model.estimated_price_per_basis_unit, 4.8);
  assert.deepEqual(ingredient.quality.runtime_safe_fields, [
    'classification',
    'purchase_model',
    'dietary_flags',
  ]);
});

test('ingredient validation rejects unsupported runtime-safe fields', () => {
  const state = createMealState();

  assert.throws(() => {
    upsertIngredient(state, {
      ingredientId: 'ingredient_invalid',
      nameBg: 'невалиден',
      nameEn: 'invalid',
      ingredientFamilyId: 'family_vegetable',
      ingredientCategoryId: 'category_nightshade',
      defaultEdibleUnit: 'g',
      defaultPurchaseUnit: 'kg',
      quality: {
        runtime_safe_fields: ['classification', 'semantic_traits'],
      },
    });
  }, /unsupported field "semantic_traits"/);
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

  console.log(`\nPhase M0 ingredient tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
