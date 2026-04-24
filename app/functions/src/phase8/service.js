const { optimizeBasket } = require('./optimizer');
const { applyOptimizerTierView, gateOptimizerRequest } = require('../phase10/gating');

async function handleOptimizeBasketRequest({
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

  const gate = await gateOptimizerRequest({
    store,
    body,
  });

  if (!gate.allowed) {
    return {
      status: gate.status,
      body: gate.body,
    };
  }

  const requestedMultiStore = body.require_multi_store === true
    || body.optimizer_mode === 'multi_store';
  const optimized = await optimizeBasket({
    store,
    query: body.query,
    localityCode: typeof body.locality_code === 'string' ? body.locality_code : null,
    city: typeof body.city === 'string' ? body.city : null,
    preferences: typeof body.preferences === 'object' && body.preferences ? body.preferences : {},
    limits: typeof body.limits === 'object' && body.limits ? body.limits : {},
  });

  return {
    status: 200,
    body: applyOptimizerTierView({
      result: optimized,
      profile: gate.profile,
      requestedMultiStore,
    }),
  };
}

module.exports = {
  handleOptimizeBasketRequest,
  optimizeBasket,
};
