const crypto = require('node:crypto');

const { collectFeedback } = require('../phase3/feedback_collector');
const { normalizeInput, tokenizeInput } = require('../phase2/normalize');
const { trackAnalyticsEvent } = require('../phase6/analytics');

async function captureUnmatchedQuery({
  store,
  query,
  localityCode = null,
  city = null,
  userId = 'anonymous',
  queryResult,
  createdAt = new Date().toISOString(),
}) {
  if (!query || normalizeInput(query) === '') {
    return null;
  }

  if (queryResult && Array.isArray(queryResult.items) && queryResult.items.length > 0) {
    return null;
  }

  const state = await store.load();
  state.demand_logs = state.demand_logs || [];
  const record = buildDemandLogRecord({
    rawQuery: query,
    localityCode,
    city,
    demandSource: 'automatic_unmatched',
    querySource: 'query_engine_zero_results',
    userId,
    createdAt,
    metadata: {
      result_count: Array.isArray(queryResult?.items) ? queryResult.items.length : 0,
    },
  });

  state.demand_logs.push(record);
  await store.save(state);

  await trackAnalyticsEvent({
    store,
    eventType: 'demand_unmatched_logged',
    userId,
    queryText: query,
    rawInput: query,
    metadata: {
      locality_code: localityCode,
      city,
      demand_key: record.demand_key,
    },
    createdAt,
  });

  return record;
}

async function captureManualDemandFeedback({
  store,
  queryText,
  rawItemInput = null,
  localityCode = null,
  city = null,
  userId = 'anonymous',
  notes = null,
  createdAt = new Date().toISOString(),
}) {
  const rawQuery = rawItemInput || queryText;
  if (!rawQuery || normalizeInput(rawQuery) === '') {
    return {
      feedbackRecord: null,
      demandLog: null,
    };
  }

  const feedbackRecord = await collectFeedback({
    store,
    feedback: {
      user_id: userId,
      query_text: queryText || rawQuery,
      raw_item_input: rawItemInput || rawQuery,
      resolved_source_product_id: null,
      feedback_type: 'cant_find_this',
      feedback_value: 'reported',
      notes,
      locality_code: localityCode,
    },
    recordedAt: createdAt,
  });

  const state = await store.load();
  state.demand_logs = state.demand_logs || [];
  const demandLog = buildDemandLogRecord({
    rawQuery,
    localityCode,
    city,
    demandSource: 'manual_feedback',
    querySource: 'cant_find_this',
    userId,
    createdAt,
    metadata: {
      feedback_id: feedbackRecord.feedback_id,
      notes,
    },
  });

  state.demand_logs.push(demandLog);
  await store.save(state);

  await trackAnalyticsEvent({
    store,
    eventType: 'demand_manual_feedback_logged',
    userId,
    queryText: queryText || rawQuery,
    rawInput: rawQuery,
    metadata: {
      locality_code: localityCode,
      city,
      feedback_id: feedbackRecord.feedback_id,
      demand_key: demandLog.demand_key,
    },
    createdAt,
  });

  return {
    feedbackRecord,
    demandLog,
  };
}

function buildDemandLogRecord({
  rawQuery,
  localityCode = null,
  city = null,
  demandSource,
  querySource,
  userId = 'anonymous',
  createdAt = new Date().toISOString(),
  metadata = {},
}) {
  const normalizedQuery = normalizeInput(rawQuery);
  const tokens = tokenizeInput(rawQuery);
  const demandKey = buildDemandKey({
    normalizedQuery,
    localityCode,
    city,
  });

  return {
    demand_log_id: crypto.createHash('sha256')
      .update([
        demandSource,
        querySource,
        userId,
        rawQuery,
        localityCode || '',
        city || '',
        createdAt,
      ].join('|'))
      .digest('hex'),
    demand_key: demandKey,
    raw_query: rawQuery,
    normalized_query: normalizedQuery,
    tokens_bg: tokens.join('|'),
    locality_code: localityCode,
    city,
    demand_source: demandSource,
    query_source: querySource,
    user_id: userId,
    metadata_json: JSON.stringify(metadata || {}),
    created_at: createdAt,
  };
}

function buildDemandKey({
  normalizedQuery,
  localityCode = null,
  city = null,
}) {
  return crypto.createHash('sha256')
    .update([
      normalizedQuery || '',
      localityCode || '',
      city || '',
    ].join('|'))
    .digest('hex');
}

module.exports = {
  buildDemandKey,
  buildDemandLogRecord,
  captureManualDemandFeedback,
  captureUnmatchedQuery,
};
