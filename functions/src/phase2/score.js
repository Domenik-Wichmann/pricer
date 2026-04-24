const { normalizeInput } = require('./normalize');

function scoreCandidate(parsedItem, candidate) {
  const enrichment = candidate.enrichment;
  const normalizedQuery = parsedItem.canonical_query?.corrected_input || parsedItem.normalized_input;
  const aliasSet = new Set(enrichment.alias_candidates || []);
  const queryTokens = new Set(parsedItem.canonical_query?.expanded_tokens_bg || parsedItem.tokens_bg);
  const candidateTokens = new Set(enrichment.tokens || []);
  const sharedTokens = [...queryTokens].filter((token) => candidateTokens.has(token));
  const tokenCoverage = sharedTokens.length / Math.max(queryTokens.size, 1);

  let score = 0;
  const reasons = [];

  if (normalizedQuery === enrichment.normalized_name) {
    score += 0.45;
    reasons.push('exact_normalized_name');
  } else if (aliasSet.has(normalizedQuery)) {
    score += 0.12;
    reasons.push('exact_alias');
  }

  const phraseCanonicalMatch = parsedItem.canonical_query?.canonical_terms?.some((term) => aliasSet.has(term) || enrichment.normalized_name.includes(term));
  if (phraseCanonicalMatch) {
    score += 0.08;
    reasons.push('canonical_term_match');
  }

  score += tokenCoverage * 0.35;
  if (tokenCoverage > 0) {
    reasons.push('token_overlap');
  }

  if (enrichment.canonical_en && enrichment.canonical_en.brand) {
    const brandNormalized = normalizeInput(enrichment.canonical_en.brand);
    if (queryTokens.has(brandNormalized)) {
      score += 0.14;
      reasons.push('brand_match');
    }
  }

  if (
    typeof parsedItem.size_value === 'number' &&
    parsedItem.size_unit &&
    enrichment.size_value === parsedItem.size_value &&
    enrichment.size_unit === parsedItem.size_unit
  ) {
    score += 0.12;
    reasons.push('size_match');
  }

  if (
    typeof parsedItem.fat_percent === 'number' &&
    typeof enrichment.fat_percent === 'number' &&
    parsedItem.fat_percent === enrichment.fat_percent
  ) {
    score += 0.1;
    reasons.push('fat_match');
  }

  if (normalizedQuery.includes('\u043d\u0430\u0439-\u0435\u0432\u0442\u0438\u043d') || normalizedQuery.includes('\u0435\u0432\u0442\u0438\u043d')) {
    score += 0;
  }

  score += Math.min(enrichment.parse_confidence || 0, 1) * 0.05;

  return {
    source_product_id: candidate.source_product.source_product_id,
    score: Number(score.toFixed(4)),
    reasons,
    candidate,
    shared_tokens: sharedTokens,
  };
}

module.exports = {
  scoreCandidate,
};
