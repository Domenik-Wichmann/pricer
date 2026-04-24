const { resolveUserTier, syncRevenueCatEntitlement } = require('./entitlements');

async function handleGetEntitlementStatusRequest({
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
    body: resolveUserTier({
      state: await store.load(),
      userId,
    }),
  };
}

async function handleSyncRevenueCatEntitlementRequest({
  store,
  body,
}) {
  if (!body || typeof body.user_id !== 'string' || typeof body.is_active !== 'boolean') {
    return {
      status: 400,
      body: {
        error: 'user_id and is_active are required',
      },
    };
  }

  return {
    status: 200,
    body: await syncRevenueCatEntitlement({
      store,
      userId: body.user_id,
      revenueCatCustomerId: typeof body.revenuecat_customer_id === 'string'
        ? body.revenuecat_customer_id
        : null,
      entitlementId: typeof body.entitlement_id === 'string'
        ? body.entitlement_id
        : undefined,
      productId: typeof body.product_id === 'string' ? body.product_id : null,
      isActive: body.is_active,
      expiresAt: typeof body.expires_at === 'string' ? body.expires_at : null,
      entitlementSource: typeof body.entitlement_source === 'string'
        ? body.entitlement_source
        : 'revenuecat',
      updatedAt: typeof body.updated_at === 'string' ? body.updated_at : new Date().toISOString(),
      rawEvent: typeof body.raw_event === 'object' && body.raw_event ? body.raw_event : {},
    }),
  };
}

module.exports = {
  handleGetEntitlementStatusRequest,
  handleSyncRevenueCatEntitlementRequest,
};
