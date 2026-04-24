const crypto = require('node:crypto');

const { MEAL_UNIT_TYPES } = require('../shared/constants');
const {
  assertNonEmptyString,
  normalizeFiniteNumber,
  normalizeOptionalString,
  sortByKey,
  upsertByKey,
} = require('../shared/validation');
const { getIngredientById } = require('../catalog/service');

function buildUnitRecord({
  unitId,
  unitType,
  allowFractional = true,
  createdAt = new Date().toISOString(),
} = {}) {
  if (!MEAL_UNIT_TYPES.includes(unitType)) {
    throw new Error(`unitType must be one of: ${MEAL_UNIT_TYPES.join(', ')}`);
  }

  return {
    unit_id: assertNonEmptyString(unitId, 'unitId'),
    unit_type: unitType,
    allow_fractional: allowFractional === true,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function buildUnitConversionRecord({
  conversionId = null,
  fromUnitId,
  toUnitId,
  factor,
  createdAt = new Date().toISOString(),
} = {}) {
  const from = assertNonEmptyString(fromUnitId, 'fromUnitId');
  const to = assertNonEmptyString(toUnitId, 'toUnitId');
  return {
    conversion_id: conversionId || crypto.createHash('sha256')
      .update(`${from}|${to}`)
      .digest('hex'),
    from_unit_id: from,
    to_unit_id: to,
    factor: normalizeFiniteNumber(factor, 'factor', { min: 0 }),
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function buildIngredientUnitRuleRecord({
  ingredientRuleId = null,
  ingredientId,
  pieceToGrams = null,
  edibleYieldRatio = null,
  notes = null,
  createdAt = new Date().toISOString(),
} = {}) {
  const normalizedIngredientId = assertNonEmptyString(ingredientId, 'ingredientId');
  return {
    ingredient_rule_id: ingredientRuleId || crypto.createHash('sha256')
      .update(normalizedIngredientId)
      .digest('hex'),
    ingredient_id: normalizedIngredientId,
    piece_to_grams: normalizeFiniteNumber(pieceToGrams, 'pieceToGrams', {
      min: 0,
      allowNull: true,
    }),
    edible_yield_ratio: normalizeFiniteNumber(edibleYieldRatio, 'edibleYieldRatio', {
      min: 0,
      max: 1,
      allowNull: true,
    }),
    notes: normalizeOptionalString(notes, 'notes'),
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function upsertUnit(state, unitRecord) {
  state.units = upsertByKey(
    state.units || [],
    buildUnitRecord(unitRecord),
    'unit_id'
  );
  return getUnitById({
    state,
    unitId: unitRecord.unitId || unitRecord.unit_id,
  });
}

function upsertUnitConversion(state, conversionRecord) {
  const built = buildUnitConversionRecord(conversionRecord);
  const fromUnit = getUnitById({ state, unitId: built.from_unit_id });
  const toUnit = getUnitById({ state, unitId: built.to_unit_id });
  if (!fromUnit) {
    throw new Error(`unknown from unit "${built.from_unit_id}"`);
  }
  if (!toUnit) {
    throw new Error(`unknown to unit "${built.to_unit_id}"`);
  }
  if (fromUnit.unit_type !== toUnit.unit_type) {
    throw new Error('unit conversions must stay within the same unit type');
  }

  state.unit_conversions = upsertByKey(
    state.unit_conversions || [],
    built,
    'conversion_id'
  );
  return built;
}

function upsertIngredientUnitRule(state, ruleRecord) {
  const built = buildIngredientUnitRuleRecord(ruleRecord);
  if (!getIngredientById({ state, ingredientId: built.ingredient_id })) {
    throw new Error(`unknown ingredient "${built.ingredient_id}"`);
  }

  state.ingredient_unit_rules = upsertByKey(
    state.ingredient_unit_rules || [],
    built,
    'ingredient_rule_id'
  );
  return getIngredientUnitRuleByIngredientId({
    state,
    ingredientId: built.ingredient_id,
  });
}

function seedDefaultMealUnits(state, {
  createdAt = new Date().toISOString(),
} = {}) {
  [
    { unitId: 'g', unitType: 'mass' },
    { unitId: 'kg', unitType: 'mass' },
    { unitId: 'ml', unitType: 'volume' },
    { unitId: 'l', unitType: 'volume' },
    { unitId: 'piece', unitType: 'count', allowFractional: false },
    { unitId: 'pack', unitType: 'derived', allowFractional: false },
  ].forEach((descriptor) => {
    upsertUnit(state, {
      ...descriptor,
      createdAt,
    });
  });

  [
    { fromUnitId: 'kg', toUnitId: 'g', factor: 1000 },
    { fromUnitId: 'l', toUnitId: 'ml', factor: 1000 },
  ].forEach((descriptor) => {
    upsertUnitConversion(state, {
      ...descriptor,
      createdAt,
    });
  });

  return listUnits({ state });
}

function listUnits({ state, unitType = null } = {}) {
  return sortByKey(
    (state?.units || []).filter((row) => !unitType || row.unit_type === unitType),
    'unit_id'
  );
}

function getUnitById({ state, unitId } = {}) {
  return (state?.units || []).find((row) => row.unit_id === unitId) || null;
}

function getIngredientUnitRuleByIngredientId({ state, ingredientId } = {}) {
  return (state?.ingredient_unit_rules || []).find((row) => row.ingredient_id === ingredientId) || null;
}

function convertUnitValue({
  value,
  fromUnitId,
  toUnitId,
  state = null,
  unitConversions = null,
} = {}) {
  const numericValue = normalizeFiniteNumber(value, 'value', { min: 0 });
  const from = assertNonEmptyString(fromUnitId, 'fromUnitId');
  const to = assertNonEmptyString(toUnitId, 'toUnitId');
  if (from === to) {
    return numericValue;
  }

  const conversions = unitConversions || state?.unit_conversions || [];
  const graph = buildConversionGraph(conversions);
  const visited = new Set([from]);
  const queue = [{
    unitId: from,
    factor: 1,
  }];

  while (queue.length > 0) {
    const current = queue.shift();
    const edges = graph.get(current.unitId) || [];
    for (const edge of edges) {
      if (visited.has(edge.toUnitId)) {
        continue;
      }

      const nextFactor = current.factor * edge.factor;
      if (edge.toUnitId === to) {
        return numericValue * nextFactor;
      }

      visited.add(edge.toUnitId);
      queue.push({
        unitId: edge.toUnitId,
        factor: nextFactor,
      });
    }
  }

  throw new Error(`no unit conversion path found from "${from}" to "${to}"`);
}

function convertIngredientQuantityToEdible({
  state,
  ingredientId,
  quantity,
  unitId,
} = {}) {
  const ingredient = getIngredientById({ state, ingredientId });
  if (!ingredient) {
    throw new Error(`unknown ingredient "${ingredientId}"`);
  }

  const normalizedQuantity = normalizeFiniteNumber(quantity, 'quantity', { min: 0 });
  const sourceUnitId = assertNonEmptyString(unitId, 'unitId');
  const rule = getIngredientUnitRuleByIngredientId({ state, ingredientId });
  const edibleUnitId = ingredient.default_edible_unit;

  if (sourceUnitId === 'piece') {
    if (!rule || typeof rule.piece_to_grams !== 'number') {
      throw new Error(`ingredient "${ingredientId}" is missing piece_to_grams conversion`);
    }
    const grams = normalizedQuantity * rule.piece_to_grams;
    const edibleQuantity = edibleUnitId === 'g'
      ? grams
      : convertUnitValue({
        value: grams,
        fromUnitId: 'g',
        toUnitId: edibleUnitId,
        state,
      });
    return {
      ingredient_id: ingredientId,
      source_quantity: normalizedQuantity,
      source_unit: sourceUnitId,
      edible_quantity: roundNumber(edibleQuantity),
      edible_unit: edibleUnitId,
      conversion_source: 'ingredient_piece_rule',
    };
  }

  return {
    ingredient_id: ingredientId,
    source_quantity: normalizedQuantity,
    source_unit: sourceUnitId,
    edible_quantity: roundNumber(convertUnitValue({
      value: normalizedQuantity,
      fromUnitId: sourceUnitId,
      toUnitId: edibleUnitId,
      state,
    })),
    edible_unit: edibleUnitId,
    conversion_source: sourceUnitId === edibleUnitId
      ? 'already_edible_unit'
      : 'generic_unit_conversion',
  };
}

function convertEdibleQuantityToPurchase({
  state,
  ingredientId,
  edibleQuantity,
  edibleUnitId = null,
} = {}) {
  const ingredient = getIngredientById({ state, ingredientId });
  if (!ingredient) {
    throw new Error(`unknown ingredient "${ingredientId}"`);
  }

  const normalizedEdibleQuantity = normalizeFiniteNumber(edibleQuantity, 'edibleQuantity', { min: 0 });
  const rule = getIngredientUnitRuleByIngredientId({ state, ingredientId });
  const normalizedEdibleUnitId = edibleUnitId || ingredient.default_edible_unit;
  const priceBasisUnit = ingredient.purchase_model.price_basis_unit || ingredient.default_purchase_unit;
  const purchaseUnit = ingredient.default_purchase_unit;
  const edibleYieldRatio = rule?.edible_yield_ratio
    || ingredient.purchase_model.edible_yield_ratio
    || 1;

  const edibleBasisQuantity = convertUnitValue({
    value: normalizedEdibleQuantity,
    fromUnitId: normalizedEdibleUnitId,
    toUnitId: priceBasisUnit,
    state,
  });
  const rawPurchaseBasisQuantity = edibleBasisQuantity / edibleYieldRatio;
  const rawPurchaseQuantity = purchaseUnit === priceBasisUnit
    ? rawPurchaseBasisQuantity
    : convertUnitValue({
      value: rawPurchaseBasisQuantity,
      fromUnitId: priceBasisUnit,
      toUnitId: purchaseUnit,
      state,
    });
  const roundedPurchaseQuantity = roundUpPurchaseQuantity({
    state,
    quantity: rawPurchaseQuantity,
    unitId: purchaseUnit,
  });
  const roundedPurchaseBasisQuantity = purchaseUnit === priceBasisUnit
    ? roundedPurchaseQuantity
    : convertUnitValue({
      value: roundedPurchaseQuantity,
      fromUnitId: purchaseUnit,
      toUnitId: priceBasisUnit,
      state,
    });

  return {
    ingredient_id: ingredientId,
    edible_quantity: roundNumber(normalizedEdibleQuantity),
    edible_unit: normalizedEdibleUnitId,
    price_basis_unit: priceBasisUnit,
    raw_required_purchase_basis_quantity: roundNumber(rawPurchaseBasisQuantity),
    rounded_required_purchase_basis_quantity: roundNumber(roundedPurchaseBasisQuantity),
    purchase_quantity: roundNumber(roundedPurchaseQuantity),
    purchase_unit: purchaseUnit,
    edible_yield_ratio: edibleYieldRatio,
  };
}

function buildIngredientPurchaseDemand({
  state,
  ingredientId,
  quantity,
  unitId,
} = {}) {
  const edible = convertIngredientQuantityToEdible({
    state,
    ingredientId,
    quantity,
    unitId,
  });
  const purchase = convertEdibleQuantityToPurchase({
    state,
    ingredientId,
    edibleQuantity: edible.edible_quantity,
    edibleUnitId: edible.edible_unit,
  });

  return {
    ingredient_id: ingredientId,
    source_quantity: edible.source_quantity,
    source_unit: edible.source_unit,
    edible_quantity: edible.edible_quantity,
    edible_unit: edible.edible_unit,
    price_basis_unit: purchase.price_basis_unit,
    raw_required_purchase_basis_quantity: purchase.raw_required_purchase_basis_quantity,
    rounded_required_purchase_basis_quantity: purchase.rounded_required_purchase_basis_quantity,
    purchase_quantity: purchase.purchase_quantity,
    purchase_unit: purchase.purchase_unit,
    edible_yield_ratio: purchase.edible_yield_ratio,
  };
}

function roundUpPurchaseQuantity({ state, quantity, unitId } = {}) {
  const unit = getUnitById({ state, unitId });
  if (!unit) {
    throw new Error(`unknown unit "${unitId}"`);
  }
  if (quantity <= 0) {
    return 0;
  }

  if (unit.allow_fractional) {
    return Math.ceil(quantity);
  }

  return Math.ceil(quantity);
}

function buildConversionGraph(conversions) {
  const graph = new Map();
  (conversions || []).forEach((conversion) => {
    addEdge(graph, conversion.from_unit_id, conversion.to_unit_id, conversion.factor);
    addEdge(graph, conversion.to_unit_id, conversion.from_unit_id, 1 / conversion.factor);
  });
  return graph;
}

function addEdge(graph, fromUnitId, toUnitId, factor) {
  const edges = graph.get(fromUnitId) || [];
  edges.push({
    toUnitId,
    factor,
  });
  graph.set(fromUnitId, edges);
}

function roundNumber(value) {
  return Math.round(value * 10000) / 10000;
}

module.exports = {
  buildIngredientPurchaseDemand,
  buildIngredientUnitRuleRecord,
  buildUnitConversionRecord,
  buildUnitRecord,
  convertEdibleQuantityToPurchase,
  convertIngredientQuantityToEdible,
  convertUnitValue,
  getIngredientUnitRuleByIngredientId,
  getUnitById,
  listUnits,
  seedDefaultMealUnits,
  upsertIngredientUnitRule,
  upsertUnit,
  upsertUnitConversion,
};
