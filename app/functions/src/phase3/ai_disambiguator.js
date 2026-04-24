const { AI_DISAMBIGUATOR_MODEL, PHASE3_COST_LIMITS } = require('./constants');

function aiDisambiguate({
  parsedItem,
  scoredCandidates,
  semanticProfiles = [],
  aiBudget,
  maxCandidates = PHASE3_COST_LIMITS.max_ai_candidates_per_call,
}) {
  if (!aiBudget || aiBudget.calls_used >= aiBudget.max_calls) {
    return {
      used_ai: false,
      resolved: false,
      reason: 'budget_exhausted',
      ranked_candidates: scoredCandidates,
      ai_model: AI_DISAMBIGUATOR_MODEL,
    };
  }

  aiBudget.calls_used += 1;

  const semanticIndex = new Map(semanticProfiles.map((profile) => [profile.source_product_id, profile]));
  const reranked = scoredCandidates
    .slice(0, maxCandidates)
    .map((candidate) => {
      const semanticProfile = semanticIndex.get(candidate.source_product_id);
      const aiBoost = semanticProfile ? computeAiBoost(parsedItem, semanticProfile) : 0;

      return {
        ...candidate,
        ai_score: Number((candidate.score + aiBoost).toFixed(4)),
        ai_reasons: aiBoost > 0 ? ['semantic_alignment'] : [],
      };
    })
    .sort((left, right) => right.ai_score - left.ai_score);

  const [top, second] = reranked;
  const resolved = Boolean(top && (!second || top.ai_score - second.ai_score > 0.12) && top.ai_score >= 0.58);

  return {
    used_ai: true,
    resolved,
    reason: resolved ? 'resolved_by_ai' : 'ai_still_ambiguous',
    ranked_candidates: reranked,
    ai_model: AI_DISAMBIGUATOR_MODEL,
  };
}

function computeAiBoost(parsedItem, semanticProfile) {
  const queryTokens = new Set(parsedItem.tokens_bg || []);
  const semanticTokens = new Set((semanticProfile.semantic_terms_bg || '').split('|').filter(Boolean));
  const overlap = [...queryTokens].filter((token) => semanticTokens.has(token)).length;
  const tokenCoverage = overlap / Math.max(queryTokens.size, 1);

  let boost = tokenCoverage * 0.18;

  if (semanticProfile.semantic_brand) {
    const brandToken = semanticProfile.semantic_brand.toLowerCase();
    if (queryTokens.has(brandToken)) {
      boost += 0.22;
    }
  }

  if (
    typeof parsedItem.size_value === 'number' &&
    semanticProfile.semantic_size_value === parsedItem.size_value &&
    semanticProfile.semantic_size_unit === parsedItem.size_unit
  ) {
    boost += 0.08;
  }

  if (
    typeof parsedItem.fat_percent === 'number' &&
    semanticProfile.semantic_fat_percent === parsedItem.fat_percent
  ) {
    boost += 0.06;
  }

  return Number(boost.toFixed(4));
}

module.exports = {
  aiDisambiguate,
};
