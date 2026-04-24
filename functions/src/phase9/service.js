const {
  buildWatchlistSummary,
  getWatchlistInsights,
  setTargetPrice,
} = require('./intelligence');
const { enforceTargetPriceAccess } = require('../phase10/gating');

async function handleWatchlistSummaryRequest({
  store,
  body,
}) {
  const userId = body && typeof body.user_id === 'string' ? body.user_id : null;
  if (!userId) {
    return {
      status: 400,
      body: {
        error: 'user_id is required',
      },
    };
  }

  return {
    status: 200,
    body: await buildWatchlistSummary({
      store,
      userId,
    }),
  };
}

async function handleWatchlistInsightsRequest({
  store,
  body,
}) {
  const userId = body && typeof body.user_id === 'string' ? body.user_id : null;
  if (!userId) {
    return {
      status: 400,
      body: {
        error: 'user_id is required',
      },
    };
  }

  return {
    status: 200,
    body: {
      items: await getWatchlistInsights({
        store,
        userId,
        snapshotDate: body && typeof body.snapshot_date === 'string' ? body.snapshot_date : null,
      }),
    },
  };
}

async function handleSetTargetPriceRequest({
  store,
  body,
}) {
  if (!body || typeof body.user_id !== 'string' || typeof body.source_product_id !== 'string') {
    return {
      status: 400,
      body: {
        error: 'user_id and source_product_id are required',
      },
    };
  }

  if (typeof body.target_price !== 'number') {
    return {
      status: 400,
      body: {
        error: 'target_price must be a number',
      },
    };
  }

  const gate = await enforceTargetPriceAccess({
    store,
    userId: body.user_id,
    sourceProductId: body.source_product_id,
  });

  if (!gate.allowed) {
    return {
      status: gate.status,
      body: gate.body,
    };
  }

  return {
    status: 200,
    body: await setTargetPrice({
      store,
      userId: body.user_id,
      sourceProductId: body.source_product_id,
      targetPrice: body.target_price,
      displayName: typeof body.display_name === 'string' ? body.display_name : null,
      updatedAt: typeof body.updated_at === 'string' ? body.updated_at : new Date().toISOString(),
    }),
  };
}

module.exports = {
  handleSetTargetPriceRequest,
  handleWatchlistInsightsRequest,
  handleWatchlistSummaryRequest,
};
