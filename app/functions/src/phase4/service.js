const { executeQueryPlan } = require('./query_executor');
const { buildQueryPlan } = require('./query_planner');
const { parseQuery } = require('./query_parser');
const { captureUnmatchedQuery } = require('../phase7/demand_logger');

async function queryEngine({
  store,
  query,
  localityCode = null,
  city = null,
  userId = 'anonymous',
  createdAt = new Date().toISOString(),
}) {
  const parsedQuery = parseQuery(query);
  const plan = buildQueryPlan(parsedQuery);
  const state = await store.load();
  const result = executeQueryPlan({
    state,
    plan,
  });

  await captureUnmatchedQuery({
    store,
    query,
    localityCode,
    city,
    userId,
    queryResult: result,
    createdAt,
  });

  return result;
}

async function handleQueryEngineRequest({
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
    body: await queryEngine({
      store,
      query: body.query,
      localityCode: typeof body.locality_code === 'string' ? body.locality_code : null,
      city: typeof body.city === 'string' ? body.city : null,
      userId: typeof body.user_id === 'string' ? body.user_id : 'anonymous',
      createdAt: typeof body.created_at === 'string' ? body.created_at : new Date().toISOString(),
    }),
  };
}

module.exports = {
  handleQueryEngineRequest,
  queryEngine,
};
