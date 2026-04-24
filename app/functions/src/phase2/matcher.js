const { aggregateCurrentPrices } = require('./aggregate');
const { detectAmbiguity } = require('./ambiguity');
const { filterCandidates } = require('./filter');
const { parseQueryItem, splitQueryItems } = require('./normalize');
const { scoreCandidate } = require('./score');
const { aiDisambiguate } = require('../phase3/ai_disambiguator');
const { PHASE3_COST_LIMITS } = require('../phase3/constants');

function matchQueryAgainstState({
  query,
  state,
  topN = 5,
  enableAiFallback = false,
  aiBudget = null,
}) {
  const items = splitQueryItems(query).map((rawItem) => matchSingleItem({
    rawItem,
    state,
    topN,
    enableAiFallback,
    aiBudget,
  }));

  return {
    raw_input: query,
    items,
  };
}

function matchSingleItem({
  rawItem,
  state,
  topN = 5,
  enableAiFallback = false,
  aiBudget = null,
}) {
  const parsedItem = parseQueryItem(rawItem, {
    canonicalTerms: state.canonical_terms || [],
    synonymMap: state.synonym_map || [],
  });
  const filteredCandidates = filterCandidates({
    parsedItem,
    sourceProducts: state.source_products,
    sourceProductEnrichment: state.source_product_enrichment,
  });

  const scoredCandidates = filteredCandidates
    .map((candidate) => scoreCandidate(parsedItem, candidate))
    .sort((left, right) => right.score - left.score)
    .slice(0, topN);

  let ambiguity = detectAmbiguity(scoredCandidates);
  let matchedCandidates = ambiguity.status === 'unmatched'
    ? []
    : scoredCandidates;
  let aiDecision = null;

  if (enableAiFallback && ambiguity.should_escalate && matchedCandidates.length > 0) {
    aiDecision = aiDisambiguate({
      parsedItem,
      scoredCandidates: matchedCandidates,
      semanticProfiles: state.semantic_profiles || [],
      aiBudget: aiBudget || {
        max_calls: PHASE3_COST_LIMITS.max_ai_calls_per_request,
        calls_used: 0,
      },
    });

    matchedCandidates = aiDecision.ranked_candidates;
    if (aiDecision.resolved) {
      ambiguity = {
        status: 'matched',
        should_escalate: false,
        reason: aiDecision.reason,
      };
    }
  }

  const pricedCandidateIds = ambiguity.status === 'matched' && matchedCandidates.length > 0
    ? [matchedCandidates[0].source_product_id]
    : matchedCandidates.map((entry) => entry.source_product_id);

  const priceAggregation = aggregateCurrentPrices({
    sourceProductIds: pricedCandidateIds,
    rawPriceSnapshots: state.raw_price_snapshots,
    sourceProducts: state.source_products,
  });

  return {
    raw_input: rawItem,
    parsed_item: parsedItem,
    ambiguity,
    ai_decision: aiDecision,
    matched_products: matchedCandidates.map((entry) => ({
      source_product_id: entry.source_product_id,
      score: typeof entry.ai_score === 'number' ? entry.ai_score : entry.score,
      reasons: typeof entry.ai_score === 'number'
        ? [...entry.reasons, ...entry.ai_reasons]
        : entry.reasons,
      store_name_raw: entry.candidate.source_product.store_name_raw,
      locality_code: entry.candidate.source_product.locality_code,
      product_name_raw: entry.candidate.source_product.latest_product_name_raw,
      category_code: entry.candidate.source_product.category_code,
      canonical_en: entry.candidate.enrichment.canonical_en || null,
      display_en: entry.candidate.enrichment.display_en || null,
    })),
    cheapest_store_result: priceAggregation.cheapest,
    price_comparison: priceAggregation.stores,
  };
}

module.exports = {
  matchQueryAgainstState,
  matchSingleItem,
};
