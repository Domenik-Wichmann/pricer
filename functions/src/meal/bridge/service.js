const crypto = require('node:crypto');

const {
  MEAL_DEFAULT_PRICE_FALLBACK_CONFIDENCE,
  MEAL_MAPPING_TYPES,
  MEAL_MAPPING_TYPE_PRIORITIES,
} = require('../shared/constants');
const {
  assertNonEmptyString,
  normalizeFiniteNumber,
  normalizeOptionalString,
  sortByKey,
  upsertByKey,
} = require('../shared/validation');
const { getIngredientById } = require('../catalog/service');
const {
  buildIngredientPurchaseDemand,
  convertUnitValue,
} = require('../units/service');

function buildProductIngredientMappingRecord({
  mappingId = null,
  canonicalProductId,
  ingredientId,
  mappingType = 'exact',
  confidence = 1,
  source = 'manual',
  needsReview = false,
  createdAt = new Date().toISOString(),
} = {}) {
  if (!MEAL_MAPPING_TYPES.includes(mappingType)) {
    throw new Error(`mappingType must be one of: ${MEAL_MAPPING_TYPES.join(', ')}`);
  }

  const normalizedCanonicalProductId = assertNonEmptyString(canonicalProductId, 'canonicalProductId');
  const normalizedIngredientId = assertNonEmptyString(ingredientId, 'ingredientId');
  return {
    mapping_id: mappingId || crypto.createHash('sha256')
      .update(`${normalizedCanonicalProductId}|${normalizedIngredientId}|${mappingType}`)
      .digest('hex'),
    canonical_product_id: normalizedCanonicalProductId,
    ingredient_id: normalizedIngredientId,
    mapping_type: mappingType,
    confidence: normalizeFiniteNumber(confidence, 'confidence', {
      min: 0,
      max: 1,
    }),
    source: assertNonEmptyString(source, 'source'),
    needs_review: needsReview === true,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function upsertProductIngredientMapping(state, mappingRecord) {
  const built = buildProductIngredientMappingRecord(mappingRecord);
  if (!getIngredientById({ state, ingredientId: built.ingredient_id })) {
    throw new Error(`unknown ingredient "${built.ingredient_id}"`);
  }
  const canonicalProduct = (state.canonical_products || []).find(
    (row) => row.canonical_product_id === built.canonical_product_id
  );
  if (!canonicalProduct) {
    throw new Error(`unknown canonical product "${built.canonical_product_id}"`);
  }

  state.product_ingredient_mappings = upsertByKey(
    state.product_ingredient_mappings || [],
    built,
    'mapping_id'
  );
  return built;
}

function listProductIngredientMappings({
  state,
  ingredientId = null,
  canonicalProductId = null,
  minConfidence = 0,
} = {}) {
  return sortMappings((state?.product_ingredient_mappings || []).filter((row) => {
    if (ingredientId && row.ingredient_id !== ingredientId) {
      return false;
    }
    if (canonicalProductId && row.canonical_product_id !== canonicalProductId) {
      return false;
    }
    if (row.confidence < minConfidence) {
      return false;
    }
    return true;
  }));
}

function resolveBestProductIngredientMapping({
  state,
  canonicalProductId,
  ingredientId = null,
  minConfidence = 0,
} = {}) {
  return listProductIngredientMappings({
    state,
    canonicalProductId,
    ingredientId,
    minConfidence,
  })[0] || null;
}

function estimateIngredientCost({
  state,
  ingredientId,
  quantity,
  unitId,
  localityCode = null,
  storeNameRaw = null,
  date = null,
} = {}) {
  const ingredient = getIngredientById({ state, ingredientId });
  if (!ingredient) {
    throw new Error(`unknown ingredient "${ingredientId}"`);
  }

  const purchaseDemand = buildIngredientPurchaseDemand({
    state,
    ingredientId,
    quantity,
    unitId,
  });
  const candidates = listIngredientPriceCandidates({
    state,
    ingredientId,
    localityCode,
    storeNameRaw,
    date,
  });
  const mappedCategoryCodes = collectMappedCategoryCodes({
    state,
    ingredientId,
  });
  const mappedCategoryBasisQuantities = collectMappedCategoryBasisQuantities({
    state,
    ingredientId,
    basisUnit: purchaseDemand.price_basis_unit,
  });
  const exactCandidate = chooseBestPriceCandidate(
    candidates.filter((candidate) => candidate.is_exact_store_match)
  );
  const otherStoreCandidate = chooseBestPriceCandidate(
    candidates.filter((candidate) => !candidate.is_exact_store_match)
  );
  const categoryAverage = buildCategoryAverageEstimate({
    state,
    candidates,
    categoryCodes: mappedCategoryCodes,
    categoryBasisQuantities: mappedCategoryBasisQuantities,
    basisUnit: purchaseDemand.price_basis_unit,
    roundedPurchaseBasisQuantity: purchaseDemand.rounded_required_purchase_basis_quantity,
    localityCode,
    date,
  });
  const ingredientEstimate = buildIngredientEstimate({
    ingredient,
    candidates,
    roundedPurchaseBasisQuantity: purchaseDemand.rounded_required_purchase_basis_quantity,
  });

  const selected = exactCandidate
    ? buildSelectedEstimate({
      priceSource: 'exact_local_store_price',
      unitPrice: exactCandidate.unit_price_per_basis_unit,
      roundedPurchaseBasisQuantity: purchaseDemand.rounded_required_purchase_basis_quantity,
      confidence: MEAL_DEFAULT_PRICE_FALLBACK_CONFIDENCE.exact_local_store_price,
      candidate: exactCandidate,
    })
    : otherStoreCandidate
      ? buildSelectedEstimate({
        priceSource: 'other_store_product_price',
        unitPrice: otherStoreCandidate.unit_price_per_basis_unit,
        roundedPurchaseBasisQuantity: purchaseDemand.rounded_required_purchase_basis_quantity,
        confidence: MEAL_DEFAULT_PRICE_FALLBACK_CONFIDENCE.other_store_product_price,
        candidate: otherStoreCandidate,
      })
      : categoryAverage
        ? categoryAverage
        : ingredientEstimate;

  return {
    ingredient_id: ingredientId,
    requested_quantity: quantity,
    requested_unit: unitId,
    locality_code: localityCode,
    store_name_raw: storeNameRaw,
    purchase_requirement: purchaseDemand,
    price_source: selected ? selected.price_source : null,
    confidence: selected ? selected.confidence : null,
    unit_price_per_basis_unit: selected ? selected.unit_price_per_basis_unit : null,
    estimated_total_cost: selected ? selected.estimated_total_cost : null,
    canonical_product_id: selected ? selected.canonical_product_id : null,
    source_product_id: selected ? selected.source_product_id : null,
    mapping_type: selected ? selected.mapping_type : null,
    price_basis_unit: purchaseDemand.price_basis_unit,
  };
}

function listIngredientPriceCandidates({
  state,
  ingredientId,
  localityCode = null,
  storeNameRaw = null,
  date = null,
} = {}) {
  const mappings = listProductIngredientMappings({
    state,
    ingredientId,
  });
  const canonicalProductById = new Map(
    (state?.canonical_products || []).map((row) => [row.canonical_product_id, row])
  );
  const sourceProductById = new Map(
    (state?.source_products || []).map((row) => [row.source_product_id, row])
  );
  const priceBySourceProductId = buildLatestPriceIndex({
    rows: state?.product_daily_prices || [],
    date,
  });

  return mappings.flatMap((mapping) => {
    const canonicalProduct = canonicalProductById.get(mapping.canonical_product_id);
    if (!canonicalProduct) {
      return [];
    }

    const basisQuantity = computeCanonicalProductBasisQuantity({
      state,
      canonicalProduct,
      basisUnit: getIngredientById({ state, ingredientId }).purchase_model.price_basis_unit
        || getIngredientById({ state, ingredientId }).default_purchase_unit,
    });
    if (!basisQuantity) {
      return [];
    }

    return (state?.canonical_product_mappings || [])
      .filter((row) => row.canonical_product_id === mapping.canonical_product_id)
      .map((row) => {
        const sourceProduct = sourceProductById.get(row.source_product_id);
        const priceRow = priceBySourceProductId.get(row.source_product_id);
        if (!sourceProduct || !priceRow || typeof priceRow.price_min !== 'number') {
          return null;
        }

        const unitPrice = priceRow.price_min / basisQuantity;
        return {
          mapping_id: mapping.mapping_id,
          ingredient_id: mapping.ingredient_id,
          canonical_product_id: mapping.canonical_product_id,
          source_product_id: row.source_product_id,
          mapping_type: mapping.mapping_type,
          mapping_confidence: mapping.confidence,
          category_code: sourceProduct.category_code,
          locality_code: sourceProduct.locality_code,
          store_name_raw: sourceProduct.store_name_raw,
          price_date: priceRow.date,
          price_min: priceRow.price_min,
          unit_price_per_basis_unit: roundNumber(unitPrice),
          is_exact_store_match: matchesPreferredStore({
            sourceProduct,
            localityCode,
            storeNameRaw,
          }),
        };
      })
      .filter(Boolean);
  }).sort(comparePriceCandidates);
}

function buildCategoryAverageEstimate({
  state,
  candidates,
  categoryCodes = [],
  categoryBasisQuantities = [],
  basisUnit,
  roundedPurchaseBasisQuantity,
  localityCode = null,
  date = null,
} = {}) {
  const latestCategoryRows = buildLatestCategoryAggregateIndex({
    rows: state?.category_daily_aggregates || [],
    date,
    localityCode,
  });
  const categories = [...new Set([
    ...categoryCodes,
    ...candidates.map((candidate) => candidate.category_code),
  ].filter(Boolean))];
  const priceSamples = categories.flatMap((categoryCode) => {
    const aggregate = latestCategoryRows.get(categoryCode);
    if (!aggregate || typeof aggregate.avg_price !== 'number') {
      return [];
    }

    const categoryCandidates = candidates.filter((candidate) => candidate.category_code === categoryCode);
    const averageUnitPrice = categoryCandidates.length > 0
      ? categoryCandidates.reduce(
        (sum, candidate) => sum + candidate.unit_price_per_basis_unit,
        0
      ) / categoryCandidates.length
      : deriveCategoryUnitPriceFromAggregate({
        aggregate,
        categoryCode,
        categoryBasisQuantities,
      });
    if (!Number.isFinite(averageUnitPrice) || averageUnitPrice <= 0) {
      return [];
    }

    return [averageUnitPrice];
  });

  if (priceSamples.length === 0) {
    return null;
  }

  const unitPrice = priceSamples.reduce((sum, value) => sum + value, 0) / priceSamples.length;
  return {
    price_source: 'category_average',
    confidence: MEAL_DEFAULT_PRICE_FALLBACK_CONFIDENCE.category_average,
    unit_price_per_basis_unit: roundNumber(unitPrice),
    estimated_total_cost: roundNumber(unitPrice * roundedPurchaseBasisQuantity),
    canonical_product_id: null,
    source_product_id: null,
    mapping_type: null,
    price_basis_unit: basisUnit,
  };
}

function collectMappedCategoryCodes({
  state,
  ingredientId,
} = {}) {
  const sourceProductById = new Map(
    (state?.source_products || []).map((row) => [row.source_product_id, row])
  );

  return [...new Set(
    listProductIngredientMappings({
      state,
      ingredientId,
    }).flatMap((mapping) => (
      (state?.canonical_product_mappings || [])
        .filter((row) => row.canonical_product_id === mapping.canonical_product_id)
        .map((row) => sourceProductById.get(row.source_product_id)?.category_code)
        .filter(Boolean)
    ))
  )];
}

function collectMappedCategoryBasisQuantities({
  state,
  ingredientId,
  basisUnit,
} = {}) {
  const canonicalProductById = new Map(
    (state?.canonical_products || []).map((row) => [row.canonical_product_id, row])
  );
  const sourceProductById = new Map(
    (state?.source_products || []).map((row) => [row.source_product_id, row])
  );

  return listProductIngredientMappings({
    state,
    ingredientId,
  }).flatMap((mapping) => (
    (state?.canonical_product_mappings || [])
      .filter((row) => row.canonical_product_id === mapping.canonical_product_id)
      .map((row) => {
        const categoryCode = sourceProductById.get(row.source_product_id)?.category_code;
        const canonicalProduct = canonicalProductById.get(mapping.canonical_product_id);
        if (!categoryCode || !canonicalProduct) {
          return null;
        }

        const basisQuantity = computeCanonicalProductBasisQuantity({
          state,
          canonicalProduct,
          basisUnit,
        });
        if (!basisQuantity) {
          return null;
        }

        return {
          category_code: categoryCode,
          basis_quantity: basisQuantity,
        };
      })
      .filter(Boolean)
  ));
}

function deriveCategoryUnitPriceFromAggregate({
  aggregate,
  categoryCode,
  categoryBasisQuantities,
} = {}) {
  const basisRows = (categoryBasisQuantities || []).filter((row) => row.category_code === categoryCode);
  if (basisRows.length === 0) {
    return null;
  }

  const averageBasisQuantity = basisRows.reduce((sum, row) => sum + row.basis_quantity, 0) / basisRows.length;
  if (!Number.isFinite(averageBasisQuantity) || averageBasisQuantity <= 0) {
    return null;
  }

  return aggregate.avg_price / averageBasisQuantity;
}

function buildIngredientEstimate({
  ingredient,
  candidates,
  roundedPurchaseBasisQuantity,
} = {}) {
  const explicitEstimate = ingredient.purchase_model.estimated_price_per_basis_unit;
  const unitPrice = typeof explicitEstimate === 'number'
    ? explicitEstimate
    : candidates.length > 0
      ? candidates.reduce((sum, candidate) => sum + candidate.unit_price_per_basis_unit, 0) / candidates.length
      : null;
  if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    return null;
  }

  return {
    price_source: 'ingredient_estimate',
    confidence: MEAL_DEFAULT_PRICE_FALLBACK_CONFIDENCE.ingredient_estimate,
    unit_price_per_basis_unit: roundNumber(unitPrice),
    estimated_total_cost: roundNumber(unitPrice * roundedPurchaseBasisQuantity),
    canonical_product_id: null,
    source_product_id: null,
    mapping_type: null,
    price_basis_unit: ingredient.purchase_model.price_basis_unit || ingredient.default_purchase_unit,
  };
}

function buildSelectedEstimate({
  priceSource,
  unitPrice,
  roundedPurchaseBasisQuantity,
  confidence,
  candidate,
} = {}) {
  return {
    price_source: priceSource,
    confidence,
    unit_price_per_basis_unit: roundNumber(unitPrice),
    estimated_total_cost: roundNumber(unitPrice * roundedPurchaseBasisQuantity),
    canonical_product_id: candidate.canonical_product_id,
    source_product_id: candidate.source_product_id,
    mapping_type: candidate.mapping_type,
    price_basis_unit: null,
  };
}

function computeCanonicalProductBasisQuantity({
  state,
  canonicalProduct,
  basisUnit,
} = {}) {
  if (
    typeof canonicalProduct?.canonical_size_value !== 'number'
    || !canonicalProduct?.canonical_size_unit
  ) {
    return null;
  }

  return convertUnitValue({
    value: canonicalProduct.canonical_size_value,
    fromUnitId: canonicalProduct.canonical_size_unit,
    toUnitId: basisUnit,
    state,
  });
}

function buildLatestPriceIndex({
  rows,
  date = null,
} = {}) {
  const index = new Map();
  (rows || []).forEach((row) => {
    if (date && row.date !== date) {
      return;
    }
    const existing = index.get(row.source_product_id);
    if (!existing || String(row.date).localeCompare(String(existing.date)) > 0) {
      index.set(row.source_product_id, row);
    }
  });
  return index;
}

function buildLatestCategoryAggregateIndex({
  rows,
  date = null,
} = {}) {
  const index = new Map();
  (rows || []).forEach((row) => {
    if (date && row.date !== date) {
      return;
    }
    const existing = index.get(row.category_code);
    if (!existing || String(row.date).localeCompare(String(existing.date)) > 0) {
      index.set(row.category_code, row);
    }
  });
  return index;
}

function matchesPreferredStore({
  sourceProduct,
  localityCode,
  storeNameRaw,
} = {}) {
  if (localityCode && sourceProduct.locality_code !== localityCode) {
    return false;
  }
  if (storeNameRaw && sourceProduct.store_name_raw !== storeNameRaw) {
    return false;
  }

  return Boolean(localityCode || storeNameRaw);
}

function comparePriceCandidates(left, right) {
  const priorityDelta = MEAL_MAPPING_TYPE_PRIORITIES[right.mapping_type]
    - MEAL_MAPPING_TYPE_PRIORITIES[left.mapping_type];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  if (left.is_exact_store_match !== right.is_exact_store_match) {
    return left.is_exact_store_match ? -1 : 1;
  }
  if (left.unit_price_per_basis_unit !== right.unit_price_per_basis_unit) {
    return left.unit_price_per_basis_unit - right.unit_price_per_basis_unit;
  }
  if (right.mapping_confidence !== left.mapping_confidence) {
    return right.mapping_confidence - left.mapping_confidence;
  }

  return String(left.source_product_id).localeCompare(String(right.source_product_id));
}

function chooseBestPriceCandidate(candidates) {
  return [...(candidates || [])].sort(comparePriceCandidates)[0] || null;
}

function sortMappings(mappings) {
  return [...mappings].sort((left, right) => {
    const priorityDelta = MEAL_MAPPING_TYPE_PRIORITIES[right.mapping_type]
      - MEAL_MAPPING_TYPE_PRIORITIES[left.mapping_type];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }
    return String(left.mapping_id).localeCompare(String(right.mapping_id));
  });
}

function roundNumber(value) {
  return Math.round(value * 10000) / 10000;
}

module.exports = {
  buildProductIngredientMappingRecord,
  estimateIngredientCost,
  listIngredientPriceCandidates,
  listProductIngredientMappings,
  resolveBestProductIngredientMapping,
  upsertProductIngredientMapping,
};
