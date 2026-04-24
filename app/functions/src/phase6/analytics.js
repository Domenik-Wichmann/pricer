const crypto = require('node:crypto');

function buildAnalyticsEvent({
  event_type,
  user_id = 'anonymous',
  query_text = null,
  raw_input = null,
  source_product_id = null,
  metadata = {},
  created_at = new Date().toISOString(),
}) {
  return {
    analytics_event_id: crypto
      .createHash('sha256')
      .update(`${event_type}|${user_id}|${query_text || ''}|${source_product_id || ''}|${created_at}`)
      .digest('hex'),
    event_type,
    user_id,
    query_text,
    raw_input,
    source_product_id,
    metadata_json: JSON.stringify(metadata),
    created_at,
  };
}

async function trackAnalyticsEvent({
  store,
  eventType,
  userId = 'anonymous',
  queryText = null,
  rawInput = null,
  sourceProductId = null,
  metadata = {},
  createdAt = new Date().toISOString(),
}) {
  const state = await store.load();
  const event = buildAnalyticsEvent({
    event_type: eventType,
    user_id: userId,
    query_text: queryText,
    raw_input: rawInput,
    source_product_id: sourceProductId,
    metadata,
    created_at: createdAt,
  });
  state.analytics_events = state.analytics_events || [];
  state.analytics_events.push(event);
  await store.save(state);
  return event;
}

async function trackQueryAnalytics({
  store,
  userId = 'anonymous',
  queryText,
  queryResult,
  createdAt = new Date().toISOString(),
}) {
  const events = [];
  events.push(await trackAnalyticsEvent({
    store,
    eventType: 'search_query',
    userId,
    queryText,
    rawInput: queryText,
    metadata: {
      item_count: Array.isArray(queryResult.items) ? queryResult.items.length : 0,
    },
    createdAt,
  }));

  const unmatchedItems = Array.isArray(queryResult?.items)
    ? queryResult.items.filter((item) => item.ambiguity?.status === 'unmatched')
    : [];

  for (const item of unmatchedItems) {
    events.push(await trackAnalyticsEvent({
      store,
      eventType: 'unmatched_query',
      userId,
      queryText,
      rawInput: item.raw_input || queryText,
      metadata: {
        reason: item.ambiguity?.reason || 'unmatched',
      },
      createdAt,
    }));
  }

  return events;
}

module.exports = {
  buildAnalyticsEvent,
  trackAnalyticsEvent,
  trackQueryAnalytics,
};
