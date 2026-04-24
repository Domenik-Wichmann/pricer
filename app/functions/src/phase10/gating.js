const { splitQueryItems } = require('../phase2/normalize');
const { resolveUserTier } = require('./entitlements');

async function gateOptimizerRequest({
  store,
  body,
}) {
  const userId = body && typeof body.user_id === 'string' ? body.user_id : null;
  if (!userId) {
    return {
      allowed: true,
      user_id: null,
      profile: resolveUserTier({
        state: await store.load(),
        userId: null,
      }),
      mode: 'legacy_unscoped',
    };
  }

  const state = await store.load();
  const profile = resolveUserTier({
    state,
    userId,
  });
  const itemCount = splitQueryItems(body.query || '').length;
  const requestedMultiStore = body.require_multi_store === true
    || body.optimizer_mode === 'multi_store';

  if (itemCount > profile.max_optimizer_items) {
    return {
      allowed: false,
      status: 403,
      body: {
        error: 'optimizer item limit exceeded for current tier',
        code: 'optimizer_item_limit_exceeded',
        limit: profile.max_optimizer_items,
        tier: profile.tier,
      },
      profile,
      user_id: userId,
    };
  }

  if (requestedMultiStore && !profile.optimizer_multi_store_enabled) {
    return {
      allowed: false,
      status: 403,
      body: {
        error: 'multi-store optimizer requires premium tier',
        code: 'premium_required',
        feature: 'multi_store_optimizer',
        tier: profile.tier,
      },
      profile,
      user_id: userId,
    };
  }

  return {
    allowed: true,
    profile,
    user_id: userId,
    mode: profile.optimizer_multi_store_enabled ? 'premium' : 'free',
  };
}

function applyOptimizerTierView({
  result,
  profile,
  requestedMultiStore = false,
}) {
  if (profile.optimizer_multi_store_enabled) {
    return {
      ...result,
      entitlement: {
        tier: profile.tier,
        premium_active: profile.premium_active,
      },
    };
  }

  const singleStore = result.single_store_plan || result.recommended_plan || null;
  return {
    ...result,
    multi_store_plan: null,
    recommended_plan: requestedMultiStore ? null : singleStore,
    entitlement: {
      tier: profile.tier,
      premium_active: profile.premium_active,
      premium_required_features: ['multi_store_optimizer'],
    },
  };
}

function canSendAlertForUser({
  state,
  userId,
}) {
  if (!userId) {
    return true;
  }

  const hasEntitlementRecord = (state.user_tiers || []).some((row) => row.user_id === userId);
  if (!hasEntitlementRecord) {
    return true;
  }

  const profile = resolveUserTier({
    state,
    userId,
  });
  return profile.alerts_enabled;
}

async function enforceTargetPriceAccess({
  store,
  userId,
  sourceProductId,
}) {
  if (!userId) {
    return {
      allowed: true,
      profile: resolveUserTier({
        state: await store.load(),
        userId: null,
      }),
    };
  }

  const state = await store.load();
  const profile = resolveUserTier({
    state,
    userId,
  });
  const hasEntitlementRecord = (state.user_tiers || []).some((row) => row.user_id === userId);

  if (!hasEntitlementRecord) {
    return {
      allowed: true,
      profile,
    };
  }

  if (!profile.alerts_enabled) {
    return {
      allowed: false,
      status: 403,
      body: {
        error: 'watchlist alerts require premium tier',
        code: 'premium_required',
        feature: 'alerts',
        tier: profile.tier,
      },
      profile,
    };
  }

  const activeTargets = (state.watchlist_profiles || []).filter((row) => (
    row.user_id === userId
      && typeof row.target_price === 'number'
      && row.source_product_id !== sourceProductId
  ));

  if (activeTargets.length >= profile.max_target_price_alerts) {
    return {
      allowed: false,
      status: 403,
      body: {
        error: 'target price alert limit exceeded for current tier',
        code: 'target_price_limit_exceeded',
        limit: profile.max_target_price_alerts,
        tier: profile.tier,
      },
      profile,
    };
  }

  return {
    allowed: true,
    profile,
  };
}

module.exports = {
  applyOptimizerTierView,
  canSendAlertForUser,
  enforceTargetPriceAccess,
  gateOptimizerRequest,
};
