const { SEMANTIC_ENRICHMENT_VERSION } = require('./constants');

function buildSemanticProfile({
  sourceProduct,
  enrichment,
  generatedAt = new Date().toISOString(),
}) {
  const semanticTextBg = [
    sourceProduct.latest_product_name_raw,
    ...(enrichment.alias_candidates || []),
  ].filter(Boolean).join(' | ');

  const semanticTextEn = [
    enrichment.display_en,
    enrichment.canonical_en && enrichment.canonical_en.product_family,
    enrichment.canonical_en && enrichment.canonical_en.product_type,
  ].filter(Boolean).join(' | ');

  return {
    source_product_id: sourceProduct.source_product_id,
    semantic_version: SEMANTIC_ENRICHMENT_VERSION,
    semantic_summary_bg: sourceProduct.latest_product_name_raw || null,
    semantic_summary_en: enrichment.display_en || null,
    semantic_terms_bg: (enrichment.tokens || []).join('|') || null,
    semantic_terms_en: buildSemanticTermsEn(enrichment).join('|') || null,
    semantic_category: enrichment.canonical_search_category || null,
    semantic_brand: enrichment.canonical_en && enrichment.canonical_en.brand ? enrichment.canonical_en.brand : null,
    semantic_size_value: enrichment.size_value ?? null,
    semantic_size_unit: enrichment.size_unit ?? null,
    semantic_fat_percent: enrichment.fat_percent ?? null,
    semantic_text_bg: semanticTextBg || null,
    semantic_text_en: semanticTextEn || null,
    generated_at: generatedAt,
  };
}

function buildSemanticTermsEn(enrichment) {
  const terms = [];
  if (enrichment.display_en) {
    terms.push(...enrichment.display_en.toLowerCase().split(/[^\p{L}\p{N}%]+/u).filter(Boolean));
  }

  if (enrichment.canonical_en) {
    Object.values(enrichment.canonical_en)
      .filter((value) => typeof value === 'string' && value.trim() !== '')
      .forEach((value) => {
        terms.push(...value.toLowerCase().split(/[^\p{L}\p{N}%]+/u).filter(Boolean));
      });
  }

  return [...new Set(terms)];
}

module.exports = {
  buildSemanticProfile,
};
