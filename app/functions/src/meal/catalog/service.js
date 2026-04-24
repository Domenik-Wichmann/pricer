const {
  MEAL_ACTIVE_STATUSES,
  MEAL_RUNTIME_SAFE_INGREDIENT_FIELDS,
} = require('../shared/constants');
const {
  assertNonEmptyString,
  assertPlainObject,
  normalizeFiniteNumber,
  normalizeOptionalString,
  normalizeStringArray,
  sortByKey,
  upsertByKey,
} = require('../shared/validation');

function buildIngredientFamilyRecord({
  ingredientFamilyId,
  status = 'active',
  nameBg,
  nameEn,
  aliasesBg = [],
  aliasesEn = [],
  createdAt = new Date().toISOString(),
} = {}) {
  validateMealStatus(status, 'ingredient family');

  return {
    ingredient_family_id: assertNonEmptyString(ingredientFamilyId, 'ingredientFamilyId'),
    status,
    name_bg: assertNonEmptyString(nameBg, 'nameBg'),
    name_en: assertNonEmptyString(nameEn, 'nameEn'),
    aliases_bg: normalizeStringArray(aliasesBg, 'aliasesBg'),
    aliases_en: normalizeStringArray(aliasesEn, 'aliasesEn'),
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function buildIngredientCategoryRecord({
  ingredientCategoryId,
  ingredientFamilyId,
  status = 'active',
  nameBg,
  nameEn,
  aliasesBg = [],
  aliasesEn = [],
  createdAt = new Date().toISOString(),
} = {}) {
  validateMealStatus(status, 'ingredient category');

  return {
    ingredient_category_id: assertNonEmptyString(ingredientCategoryId, 'ingredientCategoryId'),
    ingredient_family_id: assertNonEmptyString(ingredientFamilyId, 'ingredientFamilyId'),
    status,
    name_bg: assertNonEmptyString(nameBg, 'nameBg'),
    name_en: assertNonEmptyString(nameEn, 'nameEn'),
    aliases_bg: normalizeStringArray(aliasesBg, 'aliasesBg'),
    aliases_en: normalizeStringArray(aliasesEn, 'aliasesEn'),
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function buildIngredientRecord({
  ingredientId,
  status = 'active',
  nameBg,
  nameEn,
  aliasesBg = [],
  aliasesEn = [],
  ingredientFamilyId,
  ingredientCategoryId,
  defaultEdibleUnit,
  defaultPurchaseUnit,
  classification = {},
  purchaseModel = {},
  dietaryFlags = {},
  enrichment = {},
  quality = {},
  createdAt = new Date().toISOString(),
} = {}) {
  validateMealStatus(status, 'ingredient');
  assertPlainObject(classification, 'classification');
  assertPlainObject(purchaseModel, 'purchaseModel');
  assertPlainObject(dietaryFlags, 'dietaryFlags');
  assertPlainObject(enrichment, 'enrichment');
  assertPlainObject(quality, 'quality');

  const runtimeSafeFields = normalizeStringArray(
    quality.runtime_safe_fields || [],
    'quality.runtime_safe_fields'
  );
  runtimeSafeFields.forEach((field) => {
    if (!MEAL_RUNTIME_SAFE_INGREDIENT_FIELDS.includes(field)) {
      throw new Error(`quality.runtime_safe_fields contains unsupported field "${field}"`);
    }
  });

  const commonPurchaseUnits = normalizeStringArray(
    purchaseModel.common_purchase_units || [],
    'purchaseModel.common_purchase_units'
  );
  const normalizedPurchaseModel = {
    common_purchase_units: commonPurchaseUnits,
    typical_piece_weight_g: normalizeFiniteNumber(
      purchaseModel.typical_piece_weight_g,
      'purchaseModel.typical_piece_weight_g',
      { min: 0, allowNull: true }
    ),
    edible_yield_ratio: normalizeFiniteNumber(
      purchaseModel.edible_yield_ratio,
      'purchaseModel.edible_yield_ratio',
      { min: 0, max: 1, allowNull: true }
    ),
    price_basis_unit: normalizeOptionalString(
      purchaseModel.price_basis_unit || defaultPurchaseUnit,
      'purchaseModel.price_basis_unit'
    ),
    estimated_price_per_basis_unit: normalizeFiniteNumber(
      purchaseModel.estimated_price_per_basis_unit,
      'purchaseModel.estimated_price_per_basis_unit',
      { min: 0, allowNull: true }
    ),
  };

  return {
    ingredient_id: assertNonEmptyString(ingredientId, 'ingredientId'),
    status,
    name_bg: assertNonEmptyString(nameBg, 'nameBg'),
    name_en: assertNonEmptyString(nameEn, 'nameEn'),
    aliases_bg: normalizeStringArray(aliasesBg, 'aliasesBg'),
    aliases_en: normalizeStringArray(aliasesEn, 'aliasesEn'),
    ingredient_family_id: assertNonEmptyString(ingredientFamilyId, 'ingredientFamilyId'),
    ingredient_category_id: assertNonEmptyString(ingredientCategoryId, 'ingredientCategoryId'),
    default_edible_unit: assertNonEmptyString(defaultEdibleUnit, 'defaultEdibleUnit'),
    default_purchase_unit: assertNonEmptyString(defaultPurchaseUnit, 'defaultPurchaseUnit'),
    classification: {
      food_group: normalizeOptionalString(classification.food_group, 'classification.food_group'),
      culinary_roles: normalizeStringArray(classification.culinary_roles, 'classification.culinary_roles'),
      common_cuisines: normalizeStringArray(classification.common_cuisines, 'classification.common_cuisines'),
      is_staple: typeof classification.is_staple === 'boolean' ? classification.is_staple : false,
      availability_level: normalizeOptionalString(
        classification.availability_level,
        'classification.availability_level'
      ),
    },
    purchase_model: normalizedPurchaseModel,
    dietary_flags: {
      vegan: Boolean(dietaryFlags.vegan),
      vegetarian: Boolean(dietaryFlags.vegetarian),
      contains_dairy: Boolean(dietaryFlags.contains_dairy),
      contains_gluten: Boolean(dietaryFlags.contains_gluten),
      contains_nuts: Boolean(dietaryFlags.contains_nuts),
    },
    enrichment: JSON.parse(JSON.stringify(enrichment)),
    quality: {
      source: normalizeOptionalString(quality.source, 'quality.source'),
      confidence: normalizeFiniteNumber(quality.confidence, 'quality.confidence', {
        min: 0,
        max: 1,
        allowNull: true,
      }),
      runtime_safe_fields: runtimeSafeFields,
    },
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function upsertIngredientFamily(state, familyRecord) {
  state.ingredient_families = upsertByKey(
    state.ingredient_families || [],
    buildIngredientFamilyRecord(familyRecord),
    'ingredient_family_id'
  );
  return getIngredientFamilyById({
    state,
    ingredientFamilyId: familyRecord.ingredientFamilyId || familyRecord.ingredient_family_id,
  });
}

function upsertIngredientCategory(state, categoryRecord) {
  const built = buildIngredientCategoryRecord(categoryRecord);
  if (!getIngredientFamilyById({ state, ingredientFamilyId: built.ingredient_family_id })) {
    throw new Error(`unknown ingredient family "${built.ingredient_family_id}"`);
  }

  state.ingredient_categories = upsertByKey(
    state.ingredient_categories || [],
    built,
    'ingredient_category_id'
  );
  return getIngredientCategoryById({
    state,
    ingredientCategoryId: built.ingredient_category_id,
  });
}

function upsertIngredient(state, ingredientRecord) {
  const built = buildIngredientRecord(ingredientRecord);
  if (!getIngredientFamilyById({ state, ingredientFamilyId: built.ingredient_family_id })) {
    throw new Error(`unknown ingredient family "${built.ingredient_family_id}"`);
  }
  if (!getIngredientCategoryById({ state, ingredientCategoryId: built.ingredient_category_id })) {
    throw new Error(`unknown ingredient category "${built.ingredient_category_id}"`);
  }
  const knownUnits = new Set((state.units || []).map((row) => row.unit_id));
  if (!knownUnits.has(built.default_edible_unit)) {
    throw new Error(`unknown default edible unit "${built.default_edible_unit}"`);
  }
  if (!knownUnits.has(built.default_purchase_unit)) {
    throw new Error(`unknown default purchase unit "${built.default_purchase_unit}"`);
  }
  if (built.purchase_model.price_basis_unit && !knownUnits.has(built.purchase_model.price_basis_unit)) {
    throw new Error(`unknown purchase_model.price_basis_unit "${built.purchase_model.price_basis_unit}"`);
  }
  built.purchase_model.common_purchase_units.forEach((unitId) => {
    if (!knownUnits.has(unitId)) {
      throw new Error(`unknown purchase model unit "${unitId}"`);
    }
  });

  state.ingredients = upsertByKey(
    state.ingredients || [],
    built,
    'ingredient_id'
  );
  return getIngredientById({
    state,
    ingredientId: built.ingredient_id,
  });
}

function listIngredientFamilies({ state, status = null } = {}) {
  return sortByKey(
    (state?.ingredient_families || []).filter((row) => !status || row.status === status),
    'ingredient_family_id'
  );
}

function listIngredientCategories({ state, ingredientFamilyId = null, status = null } = {}) {
  return sortByKey(
    (state?.ingredient_categories || []).filter((row) => {
      if (ingredientFamilyId && row.ingredient_family_id !== ingredientFamilyId) {
        return false;
      }
      if (status && row.status !== status) {
        return false;
      }
      return true;
    }),
    'ingredient_category_id'
  );
}

function listIngredients({ state, ingredientFamilyId = null, ingredientCategoryId = null, status = null } = {}) {
  return sortByKey(
    (state?.ingredients || []).filter((row) => {
      if (ingredientFamilyId && row.ingredient_family_id !== ingredientFamilyId) {
        return false;
      }
      if (ingredientCategoryId && row.ingredient_category_id !== ingredientCategoryId) {
        return false;
      }
      if (status && row.status !== status) {
        return false;
      }
      return true;
    }),
    'ingredient_id'
  );
}

function getIngredientFamilyById({ state, ingredientFamilyId } = {}) {
  return (state?.ingredient_families || []).find(
    (row) => row.ingredient_family_id === ingredientFamilyId
  ) || null;
}

function getIngredientCategoryById({ state, ingredientCategoryId } = {}) {
  return (state?.ingredient_categories || []).find(
    (row) => row.ingredient_category_id === ingredientCategoryId
  ) || null;
}

function getIngredientById({ state, ingredientId } = {}) {
  return (state?.ingredients || []).find((row) => row.ingredient_id === ingredientId) || null;
}

function validateMealStatus(status, entityName) {
  if (!MEAL_ACTIVE_STATUSES.includes(status)) {
    throw new Error(`${entityName} status must be one of: ${MEAL_ACTIVE_STATUSES.join(', ')}`);
  }
}

module.exports = {
  buildIngredientCategoryRecord,
  buildIngredientFamilyRecord,
  buildIngredientRecord,
  getIngredientById,
  getIngredientCategoryById,
  getIngredientFamilyById,
  listIngredientCategories,
  listIngredientFamilies,
  listIngredients,
  upsertIngredient,
  upsertIngredientCategory,
  upsertIngredientFamily,
};
