const {
  DEFAULT_GROK_ENDPOINT,
  DEFAULT_GROK_MODEL,
} = require('./constants');
const {
  getCanonicalDisambiguationDecisionByFingerprint,
  upsertCanonicalDisambiguationDecision,
} = require('./ingest');

const DEFAULT_DISAMBIGUATION_PROMPT_VERSION = 'phase14_1_v1';
const DEFAULT_DISAMBIGUATION_BATCH_SIZE = 25;
const ALLOWED_DISAMBIGUATION_DECISIONS = new Set(['merge', 'distinct', 'uncertain']);
const ALLOWED_DISAMBIGUATION_CONFIDENCE = new Set(['high', 'medium', 'low']);
const HARD_CONFLICT_MARKERS = Object.freeze([
  'volume_marker',
  'count_marker',
  'age_band_marker',
  'reserve_marker',
]);

function isLlmDisambiguationEnabled(env = process.env) {
  return String(env.ENABLE_LLM_DISAMBIGUATION || '').toLowerCase() === 'true';
}

function buildCanonicalDisambiguationPromptPayload({
  queueItems,
  promptVersion = DEFAULT_DISAMBIGUATION_PROMPT_VERSION,
}) {
  return {
    prompt_version: promptVersion,
    task: 'Decide whether each unresolved pair is the same canonical product family or distinct products.',
    allowed_decisions: ['merge', 'distinct', 'uncertain'],
    allowed_confidence: ['high', 'medium', 'low'],
    instructions: [
      'Use only the provided names, core tokens, markers, category, chain, and warning reason.',
      'If uncertain, return uncertain with low or medium confidence.',
      'Do not override deterministic hard marker conflicts.',
      'Return valid JSON only with a decisions array.',
    ],
    items: queueItems.map((item) => ({
      pair_fingerprint: item.pair_fingerprint,
      warning_reason: item.warning_reason,
      product_a: buildPromptProductSide(item.product_a),
      product_b: buildPromptProductSide(item.product_b),
    })),
    response_schema: {
      decisions: [{
        pair_fingerprint: 'string',
        decision: 'merge|distinct|uncertain',
        confidence: 'high|medium|low',
        reason_short: 'string',
        decisive_features: ['string'],
      }],
    },
  };
}

function buildPromptProductSide(product) {
  return {
    raw_name: product.raw_name || null,
    normalized_core_tokens: Array.isArray(product.normalized_core_tokens)
      ? product.normalized_core_tokens
      : [],
    markers: product.markers || {},
    source_chain_name_normalized: product.source_chain_name_normalized || null,
    product_code: product.product_code || null,
    category_code: product.category_code || null,
  };
}

function validateCanonicalDisambiguationDecision(decision, expectedFingerprint = null) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    throw new Error('disambiguation decision must be an object');
  }
  if (typeof decision.pair_fingerprint !== 'string' || !decision.pair_fingerprint) {
    throw new Error('disambiguation decision missing pair_fingerprint');
  }
  if (expectedFingerprint && decision.pair_fingerprint !== expectedFingerprint) {
    throw new Error('disambiguation decision fingerprint mismatch');
  }
  if (!ALLOWED_DISAMBIGUATION_DECISIONS.has(decision.decision)) {
    throw new Error(`invalid disambiguation decision: ${decision.decision}`);
  }
  if (!ALLOWED_DISAMBIGUATION_CONFIDENCE.has(decision.confidence)) {
    throw new Error(`invalid disambiguation confidence: ${decision.confidence}`);
  }
  if (typeof decision.reason_short !== 'string' || !decision.reason_short.trim()) {
    throw new Error('disambiguation decision missing reason_short');
  }
  if (!Array.isArray(decision.decisive_features) ||
      decision.decisive_features.some((feature) => typeof feature !== 'string' || !feature.trim())) {
    throw new Error('disambiguation decision decisive_features must be a non-empty string array');
  }

  return {
    pair_fingerprint: decision.pair_fingerprint,
    decision: decision.decision,
    confidence: decision.confidence,
    reason_short: decision.reason_short.trim().slice(0, 500),
    decisive_features: decision.decisive_features.map((feature) => feature.trim()).slice(0, 20),
  };
}

function validateCanonicalDisambiguationResponse(payload, expectedFingerprints) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('disambiguation response must be an object');
  }
  if (!Array.isArray(payload.decisions)) {
    throw new Error('disambiguation response missing decisions array');
  }

  const expected = new Set(expectedFingerprints);
  const seen = new Set();
  const decisions = payload.decisions.map((decision) => {
    const normalized = validateCanonicalDisambiguationDecision(decision);
    if (!expected.has(normalized.pair_fingerprint)) {
      throw new Error(`unexpected disambiguation fingerprint: ${normalized.pair_fingerprint}`);
    }
    if (seen.has(normalized.pair_fingerprint)) {
      throw new Error(`duplicate disambiguation fingerprint: ${normalized.pair_fingerprint}`);
    }
    seen.add(normalized.pair_fingerprint);
    return normalized;
  });

  if (seen.size !== expected.size) {
    throw new Error('disambiguation response did not include every requested fingerprint');
  }

  return decisions;
}

function recordHumanCanonicalDisambiguationDecision({
  state,
  pairFingerprint,
  decision,
  reasonShort,
  reviewNote = null,
  reviewedBy = null,
  createdAt = new Date().toISOString(),
}) {
  if (!state) {
    throw new Error('state is required to record a human disambiguation decision');
  }

  const normalized = validateCanonicalDisambiguationDecision({
    pair_fingerprint: pairFingerprint,
    decision,
    confidence: 'high',
    reason_short: reasonShort,
    decisive_features: ['human_review'],
  });

  const previousEffective = getEffectiveCanonicalDisambiguationDecision({
    state,
    pairFingerprint,
  });
  const persisted = upsertCanonicalDisambiguationDecision(state, {
    ...normalized,
    decision_source: 'human',
    model_name: null,
    prompt_version: null,
    review_note: reviewNote,
    reviewed_by: reviewedBy,
    created_at: createdAt,
  });

  const queueItem = (state.canonical_disambiguation_queue || []).find(
    (item) => item.pair_fingerprint === pairFingerprint
  );
  if (queueItem) {
    queueItem.status = 'reviewed_human';
    queueItem.last_seen_at = createdAt;
  }

  return {
    decision: persisted,
    previous_effective_decision: previousEffective,
    overrode_decision_id: previousEffective && previousEffective.decision_source !== 'human'
      ? previousEffective.decision_id
      : null,
  };
}

function getEffectiveCanonicalDisambiguationDecision({
  state,
  pairFingerprint,
}) {
  const decisions = (state?.canonical_disambiguation_decisions || [])
    .filter((decision) => decision.pair_fingerprint === pairFingerprint);
  if (decisions.length === 0) {
    return null;
  }

  return latestDecisionBySource(decisions, 'human') ||
    latestDecisionBySource(decisions, 'llm') ||
    latestDecisionBySource(decisions, 'deterministic_override') ||
    null;
}

function applyEffectiveCanonicalDecisions({
  canonicalProducts = [],
  canonicalDisambiguationQueue = [],
  candidatePairs = null,
  getEffectiveDecision,
  dryRun = true,
  apply = false,
} = {}) {
  const pairs = (candidatePairs || canonicalDisambiguationQueue || [])
    .slice()
    .sort((left, right) => String(left.pair_fingerprint).localeCompare(String(right.pair_fingerprint)));
  const result = {
    applied_merges: [],
    blocked_merges: [],
    skipped_conflicts: [],
    unchanged_pairs: [],
    audit_log: [],
  };
  if (apply) {
    result.applied_grouping_map = {};
  }

  const canonicalProductIds = new Set(
    canonicalProducts.map((product) => product.canonical_product_id).filter(Boolean)
  );

  pairs.forEach((pair) => {
    const pairFingerprint = pair.pair_fingerprint;
    const decision = getEffectiveDecision ? getEffectiveDecision(pairFingerprint, pair) : null;
    const conflict = findHardMarkerConflict(pair);
    const canonicalIdA = pair.product_a?.canonical_candidate_id || null;
    const canonicalIdB = pair.product_b?.canonical_candidate_id || null;
    const baseAudit = {
      pair_fingerprint: pairFingerprint,
      decision: decision?.decision || null,
      decision_source: decision?.decision_source || null,
      allowed: false,
      reason: 'no_effective_decision',
      conflict_type: null,
      action: 'none',
    };

    if (decision?.decision === 'merge') {
      if (conflict) {
        const audit = {
          ...baseAudit,
          reason: 'deterministic_hard_marker_conflict',
          conflict_type: conflict,
          action: 'skip',
        };
        result.skipped_conflicts.push(pair);
        result.audit_log.push(audit);
        return;
      }

      const audit = {
        ...baseAudit,
        allowed: true,
        reason: dryRun ? 'merge_preview_only' : 'merge_allowed_for_applied_view',
        action: 'merge',
      };
      result.applied_merges.push(pair);
      if (apply && canonicalIdA && canonicalIdB) {
        result.applied_grouping_map[canonicalIdA] = canonicalProductIds.has(canonicalIdB)
          ? canonicalIdB
          : canonicalIdB;
      }
      result.audit_log.push(audit);
      return;
    }

    if (decision?.decision === 'distinct') {
      const audit = {
        ...baseAudit,
        allowed: true,
        reason: 'effective_decision_blocks_merge',
        action: 'block',
      };
      result.blocked_merges.push(pair);
      result.audit_log.push(audit);
      return;
    }

    const audit = {
      ...baseAudit,
      allowed: true,
      reason: decision?.decision === 'uncertain' ? 'effective_decision_uncertain' : 'no_effective_decision',
      action: 'none',
    };
    result.unchanged_pairs.push(pair);
    result.audit_log.push(audit);
  });

  return result;
}

function findHardMarkerConflict(pair) {
  const left = pair?.product_a?.markers || {};
  const right = pair?.product_b?.markers || {};
  for (const markerName of HARD_CONFLICT_MARKERS) {
    const leftValue = left[markerName] || null;
    const rightValue = right[markerName] || null;
    if (leftValue && rightValue && leftValue !== rightValue) {
      return markerName.replace(/_marker$/u, '');
    }
  }

  return null;
}

function latestDecisionBySource(decisions, source) {
  return decisions
    .filter((decision) => decision.decision_source === source)
    .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
    [0] || null;
}

function parseCanonicalDisambiguationModelPayload(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('disambiguation model response missing content');
  }

  return JSON.parse(stripJsonCodeFence(content.trim()));
}

function stripJsonCodeFence(content) {
  return content
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
}

async function requestCanonicalDisambiguationBatch({
  queueItems,
  fetchImpl = fetch,
  apiKey = process.env.XAI_API_KEY,
  endpoint = DEFAULT_GROK_ENDPOINT,
  model = process.env.XAI_GROK_MODEL || DEFAULT_GROK_MODEL,
  promptVersion = DEFAULT_DISAMBIGUATION_PROMPT_VERSION,
}) {
  if (!apiKey) {
    throw new Error('XAI_API_KEY is required for LLM disambiguation');
  }

  const promptPayload = buildCanonicalDisambiguationPromptPayload({
    queueItems,
    promptVersion,
  });
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
          content: 'You adjudicate product-pair canonicalization. Return JSON only. If unsure, choose uncertain.',
        },
        {
          role: 'user',
          content: JSON.stringify(promptPayload),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`disambiguation request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const parsed = parseCanonicalDisambiguationModelPayload(payload);
  return validateCanonicalDisambiguationResponse(
    parsed,
    queueItems.map((item) => item.pair_fingerprint)
  );
}

async function runCanonicalDisambiguationAdjudication({
  store = null,
  state = null,
  dryRun = true,
  enableNetwork = isLlmDisambiguationEnabled(),
  batchSize = DEFAULT_DISAMBIGUATION_BATCH_SIZE,
  fetchImpl = fetch,
  apiKey = process.env.XAI_API_KEY,
  endpoint = DEFAULT_GROK_ENDPOINT,
  modelName = process.env.XAI_GROK_MODEL || DEFAULT_GROK_MODEL,
  promptVersion = DEFAULT_DISAMBIGUATION_PROMPT_VERSION,
  adjudicatedAt = new Date().toISOString(),
} = {}) {
  const workingState = state || await store.load();
  workingState.canonical_disambiguation_queue = workingState.canonical_disambiguation_queue || [];
  workingState.canonical_disambiguation_decisions = workingState.canonical_disambiguation_decisions || [];

  const metrics = createDisambiguationMetrics();
  const pendingQueue = workingState.canonical_disambiguation_queue
    .filter((record) => record.status === 'pending')
    .sort((left, right) => String(left.pair_fingerprint).localeCompare(String(right.pair_fingerprint)));
  metrics.pending_queue_count = pendingQueue.length;

  const eligible = [];
  for (const item of pendingQueue) {
    const cachedDecision = getEffectiveCanonicalDisambiguationDecision({
      state: workingState,
      pairFingerprint: item.pair_fingerprint,
    }) || getCanonicalDisambiguationDecisionByFingerprint(workingState, item.pair_fingerprint);
    if (cachedDecision) {
      metrics.cached_hit_count += 1;
      item.status = cachedDecision.decision_source === 'human' ? 'reviewed_human' : 'adjudicated_llm';
      item.last_seen_at = adjudicatedAt;
      continue;
    }

    if (hasQueueItemHardConflict(item)) {
      metrics.skipped_hard_conflict_count += 1;
      continue;
    }

    eligible.push(item);
  }

  metrics.would_send_count = eligible.length;
  const batches = chunkArray(eligible, Math.max(1, batchSize));
  metrics.batch_count = batches.length;

  if (!dryRun && enableNetwork) {
    for (const batch of batches) {
      metrics.model_call_count += 1;
      let decisions;
      try {
        decisions = await requestCanonicalDisambiguationBatch({
          queueItems: batch,
          fetchImpl,
          apiKey,
          endpoint,
          model: modelName,
          promptVersion,
        });
      } catch (error) {
        metrics.malformed_response_count += batch.length;
        metrics.errors.push(error.message);
        continue;
      }

      for (const decision of decisions) {
        const persisted = upsertCanonicalDisambiguationDecision(workingState, {
          ...decision,
          decision_source: 'llm',
          model_name: modelName,
          prompt_version: promptVersion,
          created_at: adjudicatedAt,
        });
        if (!persisted) {
          metrics.malformed_response_count += 1;
          continue;
        }

        const queueItem = workingState.canonical_disambiguation_queue.find(
          (item) => item.pair_fingerprint === persisted.pair_fingerprint
        );
        if (queueItem) {
          queueItem.status = 'adjudicated_llm';
          queueItem.last_seen_at = adjudicatedAt;
        }

        metrics.new_adjudication_count += 1;
        incrementDecisionMetric(metrics, persisted.decision);
      }
    }
  }

  Object.assign(metrics, summarizeCanonicalDisambiguationReviewState(workingState));

  if (store && !dryRun) {
    await store.save(workingState);
  }

  return {
    dry_run: dryRun,
    network_enabled: Boolean(enableNetwork),
    prompt_version: promptVersion,
    model_name: modelName,
    metrics,
    pending_items: eligible,
    state: workingState,
  };
}

function createDisambiguationMetrics() {
  return {
    pending_queue_count: 0,
    cached_hit_count: 0,
    would_send_count: 0,
    batch_count: 0,
    model_call_count: 0,
    new_adjudication_count: 0,
    merge_count: 0,
    distinct_count: 0,
    uncertain_count: 0,
    malformed_response_count: 0,
    skipped_hard_conflict_count: 0,
    human_review_count: 0,
    human_override_count: 0,
    effective_human_decision_count: 0,
    effective_llm_decision_count: 0,
    still_pending_count: 0,
    errors: [],
  };
}

function summarizeCanonicalDisambiguationReviewState(state) {
  const queue = state?.canonical_disambiguation_queue || [];
  const fingerprints = [...new Set(queue.map((item) => item.pair_fingerprint))];
  const summary = {
    human_review_count: 0,
    human_override_count: 0,
    effective_human_decision_count: 0,
    effective_llm_decision_count: 0,
    still_pending_count: 0,
  };

  fingerprints.forEach((pairFingerprint) => {
    const effective = getEffectiveCanonicalDisambiguationDecision({ state, pairFingerprint });
    if (!effective) {
      summary.still_pending_count += 1;
      return;
    }

    if (effective.decision_source === 'human') {
      summary.effective_human_decision_count += 1;
      summary.human_review_count += 1;
      const hasLlm = (state.canonical_disambiguation_decisions || []).some(
        (decision) => decision.pair_fingerprint === pairFingerprint && decision.decision_source === 'llm'
      );
      if (hasLlm) {
        summary.human_override_count += 1;
      }
    } else if (effective.decision_source === 'llm') {
      summary.effective_llm_decision_count += 1;
    }
  });

  return summary;
}

function incrementDecisionMetric(metrics, decision) {
  if (decision === 'merge') {
    metrics.merge_count += 1;
  } else if (decision === 'distinct') {
    metrics.distinct_count += 1;
  } else if (decision === 'uncertain') {
    metrics.uncertain_count += 1;
  }
}

function hasQueueItemHardConflict(item) {
  const left = item?.product_a?.markers || {};
  const right = item?.product_b?.markers || {};
  return HARD_CONFLICT_MARKERS.some((markerName) => {
    const leftValue = left[markerName] || null;
    const rightValue = right[markerName] || null;
    return Boolean(leftValue && rightValue && leftValue !== rightValue);
  });
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

module.exports = {
  DEFAULT_DISAMBIGUATION_PROMPT_VERSION,
  applyEffectiveCanonicalDecisions,
  buildCanonicalDisambiguationPromptPayload,
  isLlmDisambiguationEnabled,
  parseCanonicalDisambiguationModelPayload,
  recordHumanCanonicalDisambiguationDecision,
  requestCanonicalDisambiguationBatch,
  runCanonicalDisambiguationAdjudication,
  getEffectiveCanonicalDisambiguationDecision,
  summarizeCanonicalDisambiguationReviewState,
  validateCanonicalDisambiguationDecision,
  validateCanonicalDisambiguationResponse,
};
