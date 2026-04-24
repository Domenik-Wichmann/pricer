const crypto = require('node:crypto');

const {
  DEFAULT_TIER,
  PREMIUM_ENTITLEMENT_ID,
  PREMIUM_TIER,
  TIER_FEATURES,
} = require('./constants');

function getTierFeatures(tier = DEFAULT_TIER) {
  return {
    ...TIER_FEATURES[DEFAULT_TIER],
    ...(TIER_FEATURES[tier] || {}),
  };
}

function resolveUserTier({
  state,
  userId,
}) {
  if (!userId) {
    return {
      user_id: null,
      ...getTierFeatures(PREMIUM_TIER),
      entitlement_source: 'legacy_unscoped',
    };
  }

  const existing = (state.user_tiers || []).find((row) => row.user_id === userId);
  return {
    user_id: userId,
    ...getTierFeatures(existing?.tier || DEFAULT_TIER),
    revenuecat_customer_id: existing?.revenuecat_customer_id || null,
    revenuecat_entitlement_id: existing?.revenuecat_entitlement_id || null,
    revenuecat_product_id: existing?.revenuecat_product_id || null,
    entitlement_status: existing?.entitlement_status || 'inactive',
    entitlement_source: existing?.entitlement_source || 'default_free',
    expires_at: existing?.expires_at || null,
    updated_at: existing?.updated_at || null,
  };
}

async function syncRevenueCatEntitlement({
  store,
  userId,
  revenueCatCustomerId = null,
  entitlementId = PREMIUM_ENTITLEMENT_ID,
  productId = null,
  isActive,
  expiresAt = null,
  entitlementSource = 'revenuecat',
  updatedAt = new Date().toISOString(),
  rawEvent = {},
}) {
  const state = await store.load();
  state.user_tiers = state.user_tiers || [];
  state.revenuecat_events = state.revenuecat_events || [];
  state.analytics_events = state.analytics_events || [];

  const tier = isActive ? PREMIUM_TIER : DEFAULT_TIER;
  const features = getTierFeatures(tier);
  const nextRow = {
    user_id: userId,
    tier,
    premium_active: features.premium_active,
    ads_enabled: features.ads_enabled,
    optimizer_multi_store_enabled: features.optimizer_multi_store_enabled,
    alerts_enabled: features.alerts_enabled,
    max_optimizer_items: features.max_optimizer_items,
    max_watchlist_items: features.max_watchlist_items,
    max_target_price_alerts: features.max_target_price_alerts,
    revenuecat_customer_id: revenueCatCustomerId,
    revenuecat_entitlement_id: entitlementId,
    revenuecat_product_id: productId,
    entitlement_status: isActive ? 'active' : 'inactive',
    entitlement_source: entitlementSource,
    expires_at: expiresAt,
    updated_at: updatedAt,
  };

  state.user_tiers = state.user_tiers.filter((row) => row.user_id !== userId);
  state.user_tiers.push(nextRow);
  state.revenuecat_events.push({
    revenuecat_event_id: crypto.createHash('sha256')
      .update(`${userId}|${entitlementId}|${productId || ''}|${updatedAt}|${isActive}`)
      .digest('hex'),
    user_id: userId,
    revenuecat_customer_id: revenueCatCustomerId,
    entitlement_id: entitlementId,
    product_id: productId,
    entitlement_status: isActive ? 'active' : 'inactive',
    expires_at: expiresAt,
    event_source: entitlementSource,
    raw_event_json: JSON.stringify(rawEvent || {}),
    updated_at: updatedAt,
  });
  state.analytics_events.push({
    analytics_event_id: crypto.createHash('sha256')
      .update(`subscription_status_changed|${userId}|${tier}|${updatedAt}`)
      .digest('hex'),
    event_type: 'subscription_status_changed',
    user_id: userId,
    query_text: null,
    raw_input: null,
    source_product_id: null,
    metadata_json: JSON.stringify({
      tier,
      entitlement_id: entitlementId,
      product_id: productId,
      premium_active: features.premium_active,
    }),
    created_at: updatedAt,
  });

  await store.save(state);
  return nextRow;
}

function hasActivePremiumEntitlement({
  state,
  userId,
}) {
  return resolveUserTier({
    state,
    userId,
  }).premium_active;
}

module.exports = {
  getTierFeatures,
  hasActivePremiumEntitlement,
  resolveUserTier,
  syncRevenueCatEntitlement,
};
