const PRICE_NORMALIZATION_RULES_VERSION = 'phase15_price_normalization_v1';

const SELLING_UNITS = Object.freeze(['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'unknown']);
const COMPARISON_BASES = Object.freeze(['per_kg', 'per_liter', 'per_piece', 'per_pack', 'unknown']);

const MASS_KEYWORDS = Object.freeze([
  'meat',
  'beef',
  'pork',
  'chicken',
  'fish',
  'seafood',
  'deli',
  'ham',
  'salami',
  'sausage',
  'produce',
  'fruit',
  'vegetable',
  'cheese',
  'sirene',
  'kashkaval',
  '\u043c\u0435\u0441\u043e',
  '\u0442\u0435\u043b\u0435\u0448\u043a\u043e',
  '\u0441\u0432\u0438\u043d\u0441\u043a\u043e',
  '\u043f\u0438\u043b\u0435\u0448\u043a\u043e',
  '\u0444\u0438\u043b\u0435',
  '\u0440\u0438\u0431\u0430',
  '\u043c\u043e\u0440\u0441\u043a\u0438',
  '\u0434\u0435\u043b\u0438\u043a\u0430\u0442\u0435\u0441',
  '\u0448\u0443\u043d\u043a\u0430',
  '\u0441\u0430\u043b\u0430\u043c',
  '\u043d\u0430\u0434\u0435\u043d\u0438\u0446',
  '\u043a\u0430\u0439\u043c\u0430',
  '\u043f\u043b\u043e\u0434',
  '\u043f\u043b\u043e\u0434\u043e\u0432\u0435',
  '\u0437\u0435\u043b\u0435\u043d\u0447\u0443\u043a',
  '\u0437\u0435\u043b\u0435\u043d\u0447\u0443\u0446\u0438',
  '\u0434\u043e\u043c\u0430\u0442',
  '\u0434\u043e\u043c\u0430\u0442\u0438',
  '\u043a\u0440\u0430\u0441\u0442\u0430\u0432\u0438\u0446',
  '\u044f\u0431\u044a\u043b\u043a',
  '\u0431\u0430\u043d\u0430\u043d',
  '\u0441\u0438\u0440\u0435\u043d\u0435',
  '\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b',
]);

const LOOSE_LIQUID_KEYWORDS = Object.freeze([
  'draft',
  'draught',
  'tap',
  'loose',
  '\u043d\u0430\u043b\u0438\u0432\u043d',
  '\u043d\u0430\u0441\u0438\u043f\u043d',
  '\u0440\u0430\u0437\u043b\u0438\u0432\u043d',
]);

const PIECE_KEYWORDS = Object.freeze([
  'egg',
  'eggs',
  '\u044f\u0439\u0446\u0435',
  '\u044f\u0439\u0446\u0430',
  '\u0431\u0440',
  '\u0431\u0440\u043e\u0439',
  '\u0431\u0440\u043e\u044f',
]);

const PACKAGED_HINT_KEYWORDS = Object.freeze([
  'pack',
  'package',
  'boxed',
  'bottle',
  'carton',
  'shampoo',
  '\u043f\u0430\u043a\u0435\u0442',
  '\u043f\u0430\u043a\u0435\u0442\u0438\u0440\u0430\u043d',
  '\u0431\u0443\u0442\u0438\u043b\u043a\u0430',
  '\u043a\u0443\u0442\u0438\u044f',
  '\u0448\u0430\u043c\u043f\u043e\u0430\u043d',
]);

function inferPriceNormalization({
  canonicalProduct = null,
  enrichment = null,
  markers = null,
  currentPrice = null,
} = {}) {
  const parsedMarkers = markers || parseCanonicalAttributes(canonicalProduct?.canonical_attributes_json);
  const sizeMarker = normalizeSizeMarker(parsedMarkers.size_marker || enrichment?.size_marker || null);
  const text = normalizeText([
    canonicalProduct?.canonical_display_name,
    canonicalProduct?.source_example_name,
    canonicalProduct?.canonical_product_type,
    canonicalProduct?.canonical_category_code,
    enrichment?.base_product,
    enrichment?.product_type,
    enrichment?.product_family,
    enrichment?.category,
    enrichment?.subcategory,
    enrichment?.category_l1,
    enrichment?.category_l2,
    enrichment?.category_l3,
    enrichment?.dairy_type,
    enrichment?.beverage_type,
    enrichment?.packaging,
    ...(Array.isArray(enrichment?.search_aliases_bg) ? enrichment.search_aliases_bg : []),
    ...(Array.isArray(enrichment?.search_aliases_en) ? enrichment.search_aliases_en : []),
    ...(Array.isArray(enrichment?.synonym_terms) ? enrichment.synonym_terms : []),
  ].join(' '));

  if (sizeMarker) {
    return buildExplicitQuantityNormalization({ sizeMarker, currentPrice });
  }

  const looseLiquidEvidence = matchingKeywords(text, LOOSE_LIQUID_KEYWORDS);
  if (looseLiquidEvidence.length > 0 && /\b(beer|wine|oil|milk|juice|water|\u0431\u0438\u0440\u0430|\u0432\u0438\u043d\u043e|\u043e\u043b\u0438\u043e|\u043c\u043b\u044f\u043a\u043e|\u0441\u043e\u043a|\u0432\u043e\u0434\u0430)\b/u.test(text)) {
    return buildInferredNormalization({
      inferredSellingUnit: 'l',
      comparisonBasis: 'per_liter',
      confidence: 0.78,
      reason: `strong loose/draft liquid evidence: ${looseLiquidEvidence.join(', ')}`,
      needsReview: false,
    });
  }

  const pieceEvidence = matchingKeywords(text, PIECE_KEYWORDS);
  if (pieceEvidence.length > 0 && /\b(egg|eggs|\u044f\u0439\u0446[ае])\b/u.test(text)) {
    return buildInferredNormalization({
      inferredSellingUnit: 'pcs',
      comparisonBasis: 'per_piece',
      confidence: 0.74,
      reason: `strong count-item evidence: ${pieceEvidence.join(', ')}`,
      needsReview: false,
    });
  }

  const massEvidence = matchingKeywords(text, MASS_KEYWORDS);
  if (massEvidence.length > 0) {
    return buildInferredNormalization({
      inferredSellingUnit: 'kg',
      comparisonBasis: 'per_kg',
      confidence: 0.82,
      reason: `deterministic loose-weight category/name evidence: ${massEvidence.slice(0, 4).join(', ')}`,
      needsReview: false,
    });
  }

  const packagedEvidence = matchingKeywords(text, PACKAGED_HINT_KEYWORDS);
  return buildInferredNormalization({
    inferredSellingUnit: packagedEvidence.length > 0 ? 'pack' : 'unknown',
    comparisonBasis: packagedEvidence.length > 0 ? 'per_pack' : 'unknown',
    confidence: packagedEvidence.length > 0 ? 0.44 : 0.2,
    reason: packagedEvidence.length > 0
      ? `packaged/no explicit size evidence: ${packagedEvidence.slice(0, 3).join(', ')}`
      : 'no explicit quantity and no strong deterministic selling-unit evidence',
    needsReview: true,
  });
}

function buildExplicitQuantityNormalization({ sizeMarker, currentPrice }) {
  const totalUnit = normalizeUnit(sizeMarker.total_unit || sizeMarker.unit);
  const totalQuantity = normalizePositiveNumber(sizeMarker.total_quantity ?? sizeMarker.quantity);
  let inferredSellingUnit = 'unknown';
  let comparisonBasis = 'unknown';
  let comparisonUnitQuantity = null;

  if (totalUnit === 'g' || totalUnit === 'kg') {
    inferredSellingUnit = totalUnit;
    comparisonBasis = 'per_kg';
    comparisonUnitQuantity = totalUnit === 'kg' ? totalQuantity : totalQuantity / 1000;
  } else if (totalUnit === 'ml' || totalUnit === 'l') {
    inferredSellingUnit = totalUnit;
    comparisonBasis = 'per_liter';
    comparisonUnitQuantity = totalUnit === 'l' ? totalQuantity : totalQuantity / 1000;
  } else if (totalUnit === 'pcs') {
    inferredSellingUnit = 'pcs';
    comparisonBasis = 'per_piece';
    comparisonUnitQuantity = totalQuantity;
  }

  return {
    explicit_quantity_detected: true,
    inferred_selling_unit: normalizeSellingUnit(inferredSellingUnit),
    comparison_basis: normalizeComparisonBasis(comparisonBasis),
    uom_inference_confidence: 1,
    uom_inference_reason: `explicit deterministic size marker: ${sizeMarker.normalized_display || sizeMarker.display || sizeMarker.raw_text || totalUnit}`,
    needs_uom_review: false,
    explicit_quantity: {
      quantity: totalQuantity,
      unit: totalUnit || null,
      total_quantity: totalQuantity,
      total_unit: totalUnit || null,
      pack_count: normalizePositiveNumber(sizeMarker.pack_count),
      unit_quantity: normalizePositiveNumber(sizeMarker.unit_quantity),
      unit_quantity_unit: normalizeUnit(sizeMarker.unit_quantity_unit) || null,
      normalized_display: sizeMarker.normalized_display || sizeMarker.display || null,
    },
    price_per_comparison_basis: computePricePerComparisonBasis({
      currentPrice,
      comparisonBasis,
      comparisonUnitQuantity,
    }),
    rules_version: PRICE_NORMALIZATION_RULES_VERSION,
  };
}

function buildInferredNormalization({
  inferredSellingUnit,
  comparisonBasis,
  confidence,
  reason,
  needsReview,
}) {
  return {
    explicit_quantity_detected: false,
    inferred_selling_unit: normalizeSellingUnit(inferredSellingUnit),
    comparison_basis: normalizeComparisonBasis(comparisonBasis),
    uom_inference_confidence: confidence,
    uom_inference_reason: reason,
    needs_uom_review: needsReview,
    explicit_quantity: null,
    price_per_comparison_basis: null,
    rules_version: PRICE_NORMALIZATION_RULES_VERSION,
  };
}

function computePricePerComparisonBasis({
  currentPrice,
  comparisonBasis,
  comparisonUnitQuantity,
}) {
  const price = normalizePositiveNumber(currentPrice);
  if (!price || !comparisonUnitQuantity || !['per_kg', 'per_liter', 'per_piece'].includes(comparisonBasis)) {
    return null;
  }
  return roundMoney(price / comparisonUnitQuantity);
}

function normalizeSizeMarker(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const unit = normalizeUnit(value.total_unit || value.unit);
  const totalQuantity = normalizePositiveNumber(value.total_quantity ?? value.quantity);
  if (!unit || !totalQuantity) {
    return null;
  }
  return {
    ...value,
    total_unit: unit,
    total_quantity: totalQuantity,
  };
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

function matchingKeywords(text, keywords) {
  return keywords.filter((keyword) => {
    const normalized = normalizeText(keyword);
    return normalized && text.includes(normalized);
  });
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeUnit(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['g', 'kg', 'ml', 'l', 'pcs'].includes(normalized)) {
    return normalized;
  }
  return null;
}

function normalizeSellingUnit(value) {
  return SELLING_UNITS.includes(value) ? value : 'unknown';
}

function normalizeComparisonBasis(value) {
  return COMPARISON_BASES.includes(value) ? value : 'unknown';
}

function normalizePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

module.exports = {
  PRICE_NORMALIZATION_RULES_VERSION,
  inferPriceNormalization,
};
