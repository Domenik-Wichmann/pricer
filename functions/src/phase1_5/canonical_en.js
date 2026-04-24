const { PRODUCT_FAMILY_BY_TYPE, PRODUCT_TYPE_BY_BG_KEYWORD } = require('./constants');

function buildCanonicalEn(enrichment) {
  const productType = detectProductType(enrichment);
  const productFamily = PRODUCT_FAMILY_BY_TYPE[productType] || inferFamily(productType, enrichment);

  return {
    product_type: productType,
    product_family: productFamily,
    brand: enrichment.brand_guess || null,
    size_value: enrichment.size_value ?? null,
    size_unit: enrichment.size_unit ?? null,
    fat_percent: enrichment.fat_percent ?? null,
  };
}

function detectProductType(enrichment) {
  if (enrichment.product_type_guess) {
    return enrichment.product_type_guess;
  }

  const normalizedName = enrichment.normalized_name || '';
  for (const [keyword, productType] of Object.entries(PRODUCT_TYPE_BY_BG_KEYWORD)) {
    if (normalizedName.includes(keyword)) {
      return productType;
    }
  }

  return null;
}

function inferFamily(productType, enrichment) {
  if (productType) {
    return null;
  }

  if (enrichment.canonical_search_category === 'milk') {
    return 'milk';
  }

  if (enrichment.canonical_search_category === 'bread') {
    return 'bread';
  }

  if (enrichment.canonical_search_category === 'pastry') {
    return 'pastry';
  }

  return null;
}

module.exports = {
  buildCanonicalEn,
};
