const crypto = require('node:crypto');

const { detectWatchlistPriceDrops } = require('../phase6/alerts');
const {
  DEFAULT_GOOD_DEAL_THRESHOLD,
  DEFAULT_SIGNIFICANT_DROP_AMOUNT,
  DEFAULT_SIGNIFICANT_DROP_PERCENT,
  DEFAULT_WATCHLIST_COOLDOWN_DAYS,
} = require('./constants');

async function runWatchlistDailyEvaluation({
  store,
  watchlistEntries = [],
  date,
  createdAt = new Date().toISOString(),
  cooldownDays = DEFAULT_WATCHLIST_COOLDOWN_DAYS,
}) {
  const state = await store.load();
  const uniqueEntries = dedupeWatchlistEntries(watchlistEntries);
  const recurringByKey = new Map(
    (state.watchlist_recurring_patterns || []).map((row) => [`${row.user_id}|${row.source_product_id}`, row]),
  );
  const todayPriceByProduct = new Map(
    (state.product_daily_prices || [])
      .filter((row) => row.date === date)
      .map((row) => [row.source_product_id, row]),
  );
  const previousPriceByProduct = buildPreviousPriceIndex({
    rows: state.product_daily_prices || [],
    date,
  });
  const dropAlerts = detectWatchlistPriceDrops({
    watchlistEntries: uniqueEntries,
    state,
    date,
    createdAt,
  });
  const dropAlertByKey = new Map(
    dropAlerts.map((row) => [`${row.user_id}|${row.source_product_id}`, row]),
  );

  state.watchlist_profiles = state.watchlist_profiles || [];
  state.watchlist_insight_events = state.watchlist_insight_events || [];
  state.watchlist_daily_summaries = state.watchlist_daily_summaries || [];

  const profileByKey = new Map(
    state.watchlist_profiles.map((row) => [`${row.user_id}|${row.source_product_id}`, row]),
  );
  const nextProfiles = [];
  const insights = [];

  uniqueEntries.forEach((entry) => {
    const userId = entry.user_id || 'anonymous';
    const sourceProductId = entry.source_product_id || entry.productId || entry.product_id;
    const key = `${userId}|${sourceProductId}`;
    const today = todayPriceByProduct.get(sourceProductId);
    const previous = previousPriceByProduct.get(sourceProductId) || null;
    const recurring = recurringByKey.get(key) || null;
    const priorProfile = profileByKey.get(key) || null;
    const currentPrice = today ? today.price_min : null;
    const previousPrice = previous ? previous.price_min : null;
    const targetPrice = coerceNullableNumber(entry.target_price ?? entry.targetPrice ?? priorProfile?.target_price ?? null);
    const dropAmount = typeof currentPrice === 'number' && typeof previousPrice === 'number'
      ? Number((previousPrice - currentPrice).toFixed(2))
      : null;
    const dropPercent = typeof currentPrice === 'number' && typeof previousPrice === 'number' && previousPrice > 0
      ? Number((((previousPrice - currentPrice) / previousPrice) * 100).toFixed(2))
      : null;
    const significanceLevel = classifySignificance({
      dropAmount,
      dropPercent,
    });
    const historyStats = buildHistoryStats({
      rows: state.product_daily_prices || [],
      sourceProductId,
    });
    const goodDealFlag = typeof currentPrice === 'number' && historyStats.avg_price !== null
      ? currentPrice <= Number((historyStats.avg_price * DEFAULT_GOOD_DEAL_THRESHOLD).toFixed(2))
      : false;
    const targetHit = typeof currentPrice === 'number' && typeof targetPrice === 'number'
      ? currentPrice <= targetPrice
      : false;
    const listDiffDirection = getListDiffDirection({
      currentPrice,
      previousPrice,
    });
    const nudgeType = chooseNudgeType({
      targetHit,
      significanceLevel,
      goodDealFlag,
      recurring,
    });
    const cooldownApplied = shouldApplyCooldown({
      lastNudgeSentAt: priorProfile?.last_nudge_sent_at || null,
      createdAt,
      cooldownDays,
      nudgeType,
      previousNudgeType: priorProfile?.last_nudge_type || null,
    });
    const shouldNudge = Boolean(nudgeType) && !cooldownApplied;
    const dropAlert = dropAlertByKey.get(key) || null;

    const insight = {
      insight_id: crypto.createHash('sha256')
        .update(`${userId}|${sourceProductId}|${date}`)
        .digest('hex'),
      user_id: userId,
      source_product_id: sourceProductId,
      snapshot_date: date,
      display_name: entry.display_name || entry.displayName || priorProfile?.display_name || sourceProductId,
      current_price: currentPrice,
      previous_price: previousPrice,
      target_price: targetPrice,
      price_delta: dropAmount !== null ? Number((-dropAmount).toFixed(2)) : null,
      price_delta_percent: dropPercent !== null ? Number((-dropPercent).toFixed(2)) : null,
      drop_amount: dropAmount,
      drop_percent: dropPercent,
      significance_level: significanceLevel,
      good_deal_flag: goodDealFlag,
      is_target_hit: targetHit,
      recurring_interval_days: recurring?.recurring_interval_days ?? null,
      recurrence_confidence: recurring?.recurrence_confidence ?? 0,
      nudge_type: shouldNudge ? nudgeType : null,
      cooldown_applied: cooldownApplied,
      list_diff_direction: listDiffDirection,
      drop_alert_id: dropAlert?.alert_id || null,
      created_at: createdAt,
    };

    insights.push(insight);
    nextProfiles.push({
      watchlist_key: crypto.createHash('sha256')
        .update(`${userId}|${sourceProductId}`)
        .digest('hex'),
      user_id: userId,
      source_product_id: sourceProductId,
      display_name: insight.display_name,
      target_price: targetPrice,
      current_price: currentPrice,
      last_seen_date: date,
      recurring_interval_days: recurring?.recurring_interval_days ?? null,
      recurrence_confidence: recurring?.recurrence_confidence ?? 0,
      last_nudge_sent_at: shouldNudge ? createdAt : (priorProfile?.last_nudge_sent_at || null),
      last_nudge_type: shouldNudge ? nudgeType : (priorProfile?.last_nudge_type || null),
      last_significance_level: significanceLevel,
      last_good_deal_flag: goodDealFlag,
      last_list_diff_direction: listDiffDirection,
      device_token: entry.device_token || priorProfile?.device_token || null,
      updated_at: createdAt,
    });
  });

  const retainedProfiles = state.watchlist_profiles.filter((row) => !nextProfiles.find(
    (next) => next.user_id === row.user_id && next.source_product_id === row.source_product_id,
  ));
  state.watchlist_profiles = [...retainedProfiles, ...nextProfiles];
  state.watchlist_insight_events = [
    ...state.watchlist_insight_events.filter((row) => row.snapshot_date !== date),
    ...insights,
  ];
  state.watchlist_daily_summaries = [
    ...state.watchlist_daily_summaries.filter((row) => row.snapshot_date !== date),
    ...buildDailySummaries({
      insights,
      createdAt,
      snapshotDate: date,
    }),
  ];

  await store.save(state);
  return {
    insight_count: insights.length,
    summary_count: state.watchlist_daily_summaries.filter((row) => row.snapshot_date === date).length,
  };
}

async function buildWatchlistSummary({
  store,
  userId,
}) {
  const state = await store.load();
  const profiles = (state.watchlist_profiles || [])
    .filter((row) => row.user_id === userId)
    .sort((left, right) => (left.display_name || '').localeCompare(right.display_name || ''));
  const latestSummary = (state.watchlist_daily_summaries || [])
    .filter((row) => row.user_id === userId)
    .sort((left, right) => right.snapshot_date.localeCompare(left.snapshot_date))[0] || null;

  return {
    user_id: userId,
    item_count: profiles.length,
    good_deal_count: profiles.filter((row) => row.last_good_deal_flag).length,
    target_hit_count: profiles.filter((row) => typeof row.target_price === 'number' && typeof row.current_price === 'number' && row.current_price <= row.target_price).length,
    summary_date: latestSummary ? latestSummary.snapshot_date : null,
    latest_daily_summary: latestSummary,
    items: profiles,
  };
}

async function getWatchlistInsights({
  store,
  userId,
  snapshotDate = null,
}) {
  const state = await store.load();
  return (state.watchlist_insight_events || [])
    .filter((row) => row.user_id === userId && (!snapshotDate || row.snapshot_date === snapshotDate))
    .sort((left, right) => {
      if (right.snapshot_date !== left.snapshot_date) {
        return right.snapshot_date.localeCompare(left.snapshot_date);
      }

      return (left.display_name || '').localeCompare(right.display_name || '');
    });
}

async function setTargetPrice({
  store,
  userId,
  sourceProductId,
  targetPrice,
  displayName = null,
  updatedAt = new Date().toISOString(),
}) {
  const state = await store.load();
  state.watchlist_profiles = state.watchlist_profiles || [];
  const nextTargetPrice = coerceNullableNumber(targetPrice);
  const existing = state.watchlist_profiles.find(
    (row) => row.user_id === userId && row.source_product_id === sourceProductId,
  );

  if (existing) {
    existing.target_price = nextTargetPrice;
    existing.display_name = displayName || existing.display_name;
    existing.updated_at = updatedAt;
  } else {
    state.watchlist_profiles.push({
      watchlist_key: crypto.createHash('sha256')
        .update(`${userId}|${sourceProductId}`)
        .digest('hex'),
      user_id: userId,
      source_product_id: sourceProductId,
      display_name: displayName || sourceProductId,
      target_price: nextTargetPrice,
      current_price: null,
      last_seen_date: null,
      recurring_interval_days: null,
      recurrence_confidence: 0,
      last_nudge_sent_at: null,
      last_nudge_type: null,
      last_significance_level: 'none',
      last_good_deal_flag: false,
      last_list_diff_direction: 'same',
      device_token: null,
      updated_at: updatedAt,
    });
  }

  await store.save(state);
  return state.watchlist_profiles.find(
    (row) => row.user_id === userId && row.source_product_id === sourceProductId,
  );
}

function buildDailySummaries({
  insights,
  createdAt,
  snapshotDate,
}) {
  const grouped = new Map();

  insights.forEach((insight) => {
    const existing = grouped.get(insight.user_id) || {
      user_id: insight.user_id,
      snapshot_date: snapshotDate,
      item_count: 0,
      drop_count: 0,
      target_hit_count: 0,
      good_deal_count: 0,
      nudge_count: 0,
      summary_items: [],
      created_at: createdAt,
    };

    existing.item_count += 1;
    if (insight.drop_amount && insight.drop_amount > 0) {
      existing.drop_count += 1;
    }
    if (insight.is_target_hit) {
      existing.target_hit_count += 1;
    }
    if (insight.good_deal_flag) {
      existing.good_deal_count += 1;
    }
    if (insight.nudge_type) {
      existing.nudge_count += 1;
    }

    existing.summary_items.push({
      source_product_id: insight.source_product_id,
      display_name: insight.display_name,
      current_price: insight.current_price,
      list_diff_direction: insight.list_diff_direction,
      nudge_type: insight.nudge_type,
    });

    grouped.set(insight.user_id, existing);
  });

  return Array.from(grouped.values()).map((entry) => ({
    summary_id: crypto.createHash('sha256')
      .update(`${entry.user_id}|${entry.snapshot_date}`)
      .digest('hex'),
    user_id: entry.user_id,
    snapshot_date: entry.snapshot_date,
    item_count: entry.item_count,
    drop_count: entry.drop_count,
    target_hit_count: entry.target_hit_count,
    good_deal_count: entry.good_deal_count,
    nudge_count: entry.nudge_count,
    summary_json: JSON.stringify(entry.summary_items),
    created_at: entry.created_at,
  }));
}

function buildPreviousPriceIndex({
  rows,
  date,
}) {
  const index = new Map();
  rows.forEach((row) => {
    if (row.date >= date) {
      return;
    }

    const existing = index.get(row.source_product_id);
    if (!existing || existing.date < row.date) {
      index.set(row.source_product_id, row);
    }
  });
  return index;
}

function buildHistoryStats({
  rows,
  sourceProductId,
}) {
  const relevant = rows.filter((row) => row.source_product_id === sourceProductId);
  if (relevant.length === 0) {
    return {
      avg_price: null,
      min_price: null,
    };
  }

  const avgPrice = relevant.reduce((sum, row) => sum + row.price_min, 0) / relevant.length;
  const minPrice = relevant.reduce((current, row) => Math.min(current, row.price_min), relevant[0].price_min);

  return {
    avg_price: Number(avgPrice.toFixed(2)),
    min_price: Number(minPrice.toFixed(2)),
  };
}

function chooseNudgeType({
  targetHit,
  significanceLevel,
  goodDealFlag,
  recurring,
}) {
  if (targetHit) {
    return 'target_price_hit';
  }

  if (significanceLevel === 'major' || significanceLevel === 'significant') {
    return 'significant_drop';
  }

  if (goodDealFlag) {
    return 'good_deal';
  }

  if (recurring && recurring.recurrence_confidence >= 0.7 && recurring.recurring_interval_days) {
    return 'recurring_window';
  }

  return null;
}

function shouldApplyCooldown({
  lastNudgeSentAt,
  createdAt,
  cooldownDays,
  nudgeType,
  previousNudgeType,
}) {
  if (!nudgeType || !lastNudgeSentAt) {
    return false;
  }

  if (previousNudgeType && previousNudgeType !== nudgeType) {
    return false;
  }

  const previous = new Date(lastNudgeSentAt);
  const current = new Date(createdAt);
  const deltaDays = (current - previous) / 86400000;
  return deltaDays < cooldownDays;
}

function classifySignificance({
  dropAmount,
  dropPercent,
}) {
  if (typeof dropAmount !== 'number' || dropAmount <= 0) {
    return 'none';
  }

  if (dropPercent >= 12 || dropAmount >= 1) {
    return 'major';
  }

  if (dropPercent >= DEFAULT_SIGNIFICANT_DROP_PERCENT || dropAmount >= DEFAULT_SIGNIFICANT_DROP_AMOUNT) {
    return 'significant';
  }

  return 'minor';
}

function getListDiffDirection({
  currentPrice,
  previousPrice,
}) {
  if (typeof currentPrice !== 'number' || typeof previousPrice !== 'number') {
    return 'same';
  }

  if (currentPrice < previousPrice) {
    return 'down';
  }

  if (currentPrice > previousPrice) {
    return 'up';
  }

  return 'same';
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

function coerceNullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

module.exports = {
  buildWatchlistSummary,
  getWatchlistInsights,
  runWatchlistDailyEvaluation,
  setTargetPrice,
};
