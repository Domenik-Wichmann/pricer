const { BG_CATEGORY_HINTS, PRODUCT_TYPE_HINTS_BG } = require('./constants');

function inferCategoryCodes(queryTokens) {
  const codes = new Set();
  for (const token of queryTokens) {
    const hintedCodes = BG_CATEGORY_HINTS[token];
    if (hintedCodes) {
      hintedCodes.forEach((code) => codes.add(code));
    }
  }

  return [...codes];
}

function inferProductType(queryTokens) {
  for (const token of queryTokens) {
    if (PRODUCT_TYPE_HINTS_BG[token]) {
      return PRODUCT_TYPE_HINTS_BG[token];
    }
  }

  return null;
}

function filterCandidates({
  parsedItem,
  sourceProducts,
  sourceProductEnrichment,
}) {
  const enrichmentIndex = new Map(sourceProductEnrichment.map((entry) => [entry.source_product_id, entry]));
  const effectiveTokens = getEffectiveQueryTokens(parsedItem);
  const categoryCodes = inferCategoryCodes(effectiveTokens);
  const inferredProductType = inferProductType(effectiveTokens)
    || parsedItem.canonical_query?.canonical_product_types?.[0]
    || null;

  let candidates = sourceProducts
    .filter((product) => product.is_active !== false)
    .map((product) => ({
      source_product: product,
      enrichment: enrichmentIndex.get(product.source_product_id),
    }))
    .filter((candidate) => candidate.enrichment);

  if (categoryCodes.length > 0) {
    const categoryFiltered = candidates.filter((candidate) => categoryCodes.includes(candidate.source_product.category_code));
    if (categoryFiltered.length > 0) {
      candidates = categoryFiltered;
    }
  }

  if (inferredProductType) {
    const typeFiltered = candidates.filter((candidate) => candidate.enrichment.canonical_en && candidate.enrichment.canonical_en.product_type === inferredProductType);
    if (typeFiltered.length > 0) {
      candidates = typeFiltered;
    }
  }

  const tokenFiltered = candidates.filter((candidate) => hasAnyTokenOverlap(effectiveTokens, candidate.enrichment));
  if (tokenFiltered.length > 0) {
    candidates = tokenFiltered;
  }

  return candidates;
}

function hasAnyTokenOverlap(queryTokens, enrichment) {
  const candidateTokens = new Set([
    ...(enrichment.tokens || []),
    ...flattenAliasTokens(enrichment.alias_candidates || []),
    ...flattenCanonicalTokens(enrichment.canonical_en || {}),
  ]);

  return queryTokens.some((token) => candidateTokens.has(token));
}

function flattenAliasTokens(aliases) {
  return aliases.flatMap((alias) => alias.split(/[^\p{L}\p{N}%]+/u).filter(Boolean));
}

function flattenCanonicalTokens(canonicalEn) {
  return Object.values(canonicalEn)
    .filter((value) => typeof value === 'string')
    .flatMap((value) => value.toLowerCase().split(/[^\p{L}\p{N}%]+/u).filter(Boolean));
}

function getEffectiveQueryTokens(parsedItem) {
  const canonicalTokens = parsedItem.canonical_query?.expanded_tokens_bg || [];
  if (canonicalTokens.length > 0) {
    return canonicalTokens;
  }

  return parsedItem.tokens_bg;
}

module.exports = {
  filterCandidates,
  inferCategoryCodes,
  inferProductType,
};
