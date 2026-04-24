const {
  DEFAULT_GROK_ENDPOINT,
  DEFAULT_GROK_MODEL,
  DEFAULT_MAX_GROK_CALLS,
} = require('./constants');

function isGrokConfigured(env = process.env) {
  return Boolean(env.XAI_API_KEY);
}

async function chooseCandidateWithGrok({
  queryText,
  candidates,
  fetchImpl = fetch,
  apiKey = process.env.XAI_API_KEY,
  endpoint = DEFAULT_GROK_ENDPOINT,
  model = process.env.XAI_GROK_MODEL || DEFAULT_GROK_MODEL,
}) {
  if (!apiKey) {
    return {
      used_grok: false,
      resolved: false,
      reason: 'grok_not_configured',
      selected_source_product_id: null,
    };
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'Return only one source_product_id from the candidate list. If no safe choice exists, return AMBIGUOUS.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            query_text: queryText,
            candidates: candidates.map((candidate) => ({
              source_product_id: candidate.source_product_id,
              product_name_raw: candidate.product_name_raw,
              display_en: candidate.display_en,
              store_name_raw: candidate.store_name_raw,
              category_code: candidate.category_code,
            })),
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`grok request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content?.trim() || '';
  const chosen = candidates.find((candidate) => content.includes(candidate.source_product_id));

  return {
    used_grok: true,
    resolved: Boolean(chosen),
    reason: chosen ? 'resolved_by_grok' : 'grok_returned_ambiguous',
    grok_model: model,
    selected_source_product_id: chosen ? chosen.source_product_id : null,
    raw_response_text: content,
  };
}

async function resolveAmbiguityWithGrok({
  queryText,
  matchItem,
  budget = {
    max_calls: DEFAULT_MAX_GROK_CALLS,
    calls_used: 0,
  },
  fetchImpl = fetch,
  apiKey = process.env.XAI_API_KEY,
  endpoint = DEFAULT_GROK_ENDPOINT,
  model = process.env.XAI_GROK_MODEL || DEFAULT_GROK_MODEL,
}) {
  if (!matchItem?.ambiguity?.should_escalate || !Array.isArray(matchItem.matched_products) || matchItem.matched_products.length < 2) {
    return {
      ...matchItem,
      grok_decision: {
        used_grok: false,
        resolved: false,
        reason: 'not_ambiguous',
        selected_source_product_id: null,
      },
    };
  }

  if (budget.calls_used >= budget.max_calls) {
    return {
      ...matchItem,
      grok_decision: {
        used_grok: false,
        resolved: false,
        reason: 'budget_exhausted',
        selected_source_product_id: null,
      },
    };
  }

  budget.calls_used += 1;

  const decision = await chooseCandidateWithGrok({
    queryText,
    candidates: matchItem.matched_products,
    fetchImpl,
    apiKey,
    endpoint,
    model,
  });

  if (!decision.resolved) {
    return {
      ...matchItem,
      grok_decision: decision,
    };
  }

  const selected = matchItem.matched_products.filter(
    (candidate) => candidate.source_product_id === decision.selected_source_product_id
  );

  return {
    ...matchItem,
    ambiguity: {
      status: 'matched',
      should_escalate: false,
      reason: decision.reason,
    },
    matched_products: selected,
    grok_decision: decision,
  };
}

module.exports = {
  chooseCandidateWithGrok,
  isGrokConfigured,
  resolveAmbiguityWithGrok,
};
