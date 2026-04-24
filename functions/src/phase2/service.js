const { matchQueryAgainstState } = require('./matcher');

async function queryPriceComparison({
  store,
  query,
  topN = 5,
  enableAiFallback = true,
}) {
  const state = await store.load();
  return matchQueryAgainstState({
    query,
    state,
    topN,
    enableAiFallback,
  });
}

async function handleQueryServiceRequest({
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

  return {
    status: 200,
    body: await queryPriceComparison({
      store,
      query: body.query,
      topN: body.topN || 5,
      enableAiFallback: body.enableAiFallback !== false,
    }),
  };
}

module.exports = {
  handleQueryServiceRequest,
  queryPriceComparison,
};
