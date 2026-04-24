const crypto = require('node:crypto');

async function recomputeWatchlistRecurringPatterns({
  store,
  watchlistEntries = [],
  computedAt = new Date().toISOString(),
}) {
  const state = await store.load();
  const uniqueEntries = dedupeWatchlistEntries(watchlistEntries);

  state.watchlist_recurring_patterns = uniqueEntries.map((entry) => buildRecurringPattern({
    state,
    entry,
    computedAt,
  }));
  await store.save(state);

  return {
    recurring_pattern_count: state.watchlist_recurring_patterns.length,
  };
}

function buildRecurringPattern({
  state,
  entry,
  computedAt,
}) {
  const userId = entry.user_id || 'anonymous';
  const sourceProductId = entry.source_product_id || entry.productId || entry.product_id;
  const rows = (state.product_daily_prices || [])
    .filter((row) => row.source_product_id === sourceProductId)
    .sort((left, right) => left.date.localeCompare(right.date));
  const triggerDates = [];

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const dropPercent = previous.price_min > 0
      ? ((previous.price_min - current.price_min) / previous.price_min) * 100
      : 0;

    if (current.price_min < previous.price_min && dropPercent >= 1) {
      triggerDates.push(current.date);
    }
  }

  const intervals = [];
  for (let index = 1; index < triggerDates.length; index += 1) {
    intervals.push(daysBetween(triggerDates[index - 1], triggerDates[index]));
  }

  const averageInterval = intervals.length > 0
    ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length)
    : null;
  const confidence = intervals.length > 0
    ? Number(Math.max(0, 1 - normalizedVariance(intervals)).toFixed(4))
    : 0;

  return {
    recurrence_id: crypto.createHash('sha256')
      .update(`${userId}|${sourceProductId}`)
      .digest('hex'),
    user_id: userId,
    source_product_id: sourceProductId,
    recurring_interval_days: averageInterval,
    recurrence_confidence: confidence,
    price_observation_count: rows.length,
    trigger_event_count: triggerDates.length,
    latest_trigger_date: triggerDates[triggerDates.length - 1] || null,
    updated_at: computedAt,
  };
}

function dedupeWatchlistEntries(entries) {
  const seen = new Map();
  entries.forEach((entry) => {
    const userId = entry.user_id || 'anonymous';
    const sourceProductId = entry.source_product_id || entry.productId || entry.product_id;
    if (!sourceProductId) {
      return;
    }

    seen.set(`${userId}|${sourceProductId}`, entry);
  });

  return Array.from(seen.values());
}

function normalizedVariance(values) {
  if (values.length <= 1) {
    return 1;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) {
    return 1;
  }

  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.min(1, variance / (mean ** 2));
}

function daysBetween(leftDate, rightDate) {
  const left = new Date(`${leftDate}T00:00:00.000Z`);
  const right = new Date(`${rightDate}T00:00:00.000Z`);
  return Math.round((right - left) / 86400000);
}

module.exports = {
  buildRecurringPattern,
  recomputeWatchlistRecurringPatterns,
};
