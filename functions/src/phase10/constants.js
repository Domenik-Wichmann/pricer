const DEFAULT_TIER = 'free';
const PREMIUM_TIER = 'premium';
const PREMIUM_ENTITLEMENT_ID = 'premium';

const TIER_FEATURES = {
  free: {
    tier: DEFAULT_TIER,
    premium_active: false,
    ads_enabled: true,
    optimizer_multi_store_enabled: false,
    alerts_enabled: false,
    max_optimizer_items: 8,
    max_watchlist_items: 20,
    max_target_price_alerts: 3,
  },
  premium: {
    tier: PREMIUM_TIER,
    premium_active: true,
    ads_enabled: false,
    optimizer_multi_store_enabled: true,
    alerts_enabled: true,
    max_optimizer_items: 25,
    max_watchlist_items: 250,
    max_target_price_alerts: 250,
  },
};

module.exports = {
  DEFAULT_TIER,
  PREMIUM_ENTITLEMENT_ID,
  PREMIUM_TIER,
  TIER_FEATURES,
};
