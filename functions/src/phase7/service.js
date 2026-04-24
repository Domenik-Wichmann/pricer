const { captureManualDemandFeedback } = require('./demand_logger');

async function getTopDemand({
  store,
  localityCode = null,
  city = null,
  limit = 10,
}) {
  const state = await store.load();
  return (state.demand_aggregates || [])
    .filter((row) => filterByLocation({ row, localityCode, city }))
    .sort((left, right) => {
      if (right.frequency !== left.frequency) {
        return right.frequency - left.frequency;
      }

      return right.last_seen_at.localeCompare(left.last_seen_at);
    })
    .slice(0, limit);
}

async function getTrendingDemand({
  store,
  localityCode = null,
  city = null,
  limit = 10,
  now = new Date().toISOString(),
  recentDays = 7,
  previousDays = 7,
}) {
  const state = await store.load();
  const logs = (state.demand_logs || []).filter((row) => filterByLocation({ row, localityCode, city }));
  const recentStart = shiftIsoDate(now, -(recentDays - 1));
  const previousStart = shiftIsoDate(recentStart, -previousDays);
  const previousEnd = shiftIsoDate(recentStart, -1);
  const grouped = new Map();

  logs.forEach((log) => {
    const bucket = grouped.get(log.demand_key) || {
      demand_key: log.demand_key,
      normalized_query: log.normalized_query,
      locality_code: log.locality_code || null,
      city: log.city || null,
      recent_frequency: 0,
      previous_frequency: 0,
      latest_raw_query: log.raw_query,
      last_seen_at: log.created_at,
    };

    const logDate = log.created_at.slice(0, 10);
    if (logDate >= recentStart && logDate <= now.slice(0, 10)) {
      bucket.recent_frequency += 1;
    } else if (logDate >= previousStart && logDate <= previousEnd) {
      bucket.previous_frequency += 1;
    }

    if (log.created_at >= bucket.last_seen_at) {
      bucket.last_seen_at = log.created_at;
      bucket.latest_raw_query = log.raw_query;
    }

    grouped.set(log.demand_key, bucket);
  });

  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      trend_delta: row.recent_frequency - row.previous_frequency,
      trend_score: row.previous_frequency === 0
        ? row.recent_frequency
        : Number((row.recent_frequency / row.previous_frequency).toFixed(2)),
    }))
    .filter((row) => row.recent_frequency > 0)
    .sort((left, right) => {
      if (right.trend_delta !== left.trend_delta) {
        return right.trend_delta - left.trend_delta;
      }

      if (right.recent_frequency !== left.recent_frequency) {
        return right.recent_frequency - left.recent_frequency;
      }

      return right.last_seen_at.localeCompare(left.last_seen_at);
    })
    .slice(0, limit);
}

async function handleCantFindThisRequest({
  store,
  body,
}) {
  if (!body || typeof body.query !== 'string' || body.query.trim() === '') {
    return {
      status: 400,
      body: {
        error: 'query is required',
      },
    };
  }

  const result = await captureManualDemandFeedback({
    store,
    queryText: body.query,
    rawItemInput: typeof body.raw_item_input === 'string' ? body.raw_item_input : null,
    localityCode: typeof body.locality_code === 'string' ? body.locality_code : null,
    city: typeof body.city === 'string' ? body.city : null,
    userId: typeof body.user_id === 'string' ? body.user_id : 'anonymous',
    notes: typeof body.notes === 'string' ? body.notes : null,
    createdAt: typeof body.created_at === 'string' ? body.created_at : new Date().toISOString(),
  });

  return {
    status: 200,
    body: result,
  };
}

async function handleGetTopDemandRequest({
  store,
  body = {},
}) {
  return {
    status: 200,
    body: {
      items: await getTopDemand({
        store,
        localityCode: typeof body.locality_code === 'string' ? body.locality_code : null,
        city: typeof body.city === 'string' ? body.city : null,
        limit: Number.isInteger(body.limit) ? body.limit : 10,
      }),
    },
  };
}

async function handleGetTrendingDemandRequest({
  store,
  body = {},
}) {
  return {
    status: 200,
    body: {
      items: await getTrendingDemand({
        store,
        localityCode: typeof body.locality_code === 'string' ? body.locality_code : null,
        city: typeof body.city === 'string' ? body.city : null,
        limit: Number.isInteger(body.limit) ? body.limit : 10,
        now: typeof body.now === 'string' ? body.now : new Date().toISOString(),
        recentDays: Number.isInteger(body.recent_days) ? body.recent_days : 7,
        previousDays: Number.isInteger(body.previous_days) ? body.previous_days : 7,
      }),
    },
  };
}

function filterByLocation({
  row,
  localityCode,
  city,
}) {
  if (localityCode && row.locality_code !== localityCode) {
    return false;
  }

  if (city && row.city !== city) {
    return false;
  }

  return true;
}

function shiftIsoDate(isoDate, deltaDays) {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

module.exports = {
  getTopDemand,
  getTrendingDemand,
  handleCantFindThisRequest,
  handleGetTopDemandRequest,
  handleGetTrendingDemandRequest,
};
