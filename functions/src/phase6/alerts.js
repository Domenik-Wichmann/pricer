const crypto = require('node:crypto');
const { canSendAlertForUser } = require('../phase10/gating');

function detectWatchlistPriceDrops({
  watchlistEntries,
  state,
  date,
  createdAt = new Date().toISOString(),
}) {
  const todayIndex = new Map();
  const previousIndex = new Map();

  for (const row of state.product_daily_prices || []) {
    if (row.date === date) {
      todayIndex.set(row.source_product_id, row);
      continue;
    }

    if (row.date < date) {
      const existing = previousIndex.get(row.source_product_id);
      if (!existing || existing.date < row.date) {
        previousIndex.set(row.source_product_id, row);
      }
    }
  }

  return watchlistEntries
    .map((entry) => {
      const sourceProductId = entry.source_product_id || entry.productId || entry.product_id;
      const today = todayIndex.get(sourceProductId);
      if (!today) {
        return null;
      }

      const previous = previousIndex.get(sourceProductId);
      const previousPrice = previous ? previous.price_min : null;
      const currentPrice = today.price_min;
      const targetPrice = entry.target_price ?? entry.targetPrice ?? null;
      const dropped = typeof previousPrice === 'number' ? currentPrice < previousPrice : false;
      const targetHit = typeof targetPrice === 'number' ? currentPrice <= targetPrice : false;

      if (!dropped && !targetHit) {
        return null;
      }

      return {
        alert_id: crypto
          .createHash('sha256')
          .update(`${entry.user_id || 'anonymous'}|${sourceProductId}|${date}|${currentPrice}`)
          .digest('hex'),
        user_id: entry.user_id || 'anonymous',
        source_product_id: sourceProductId,
        display_name: entry.display_name || entry.displayName || sourceProductId,
        snapshot_date: date,
        current_price: currentPrice,
        previous_price: previousPrice,
        target_price: targetPrice,
        drop_amount: typeof previousPrice === 'number' ? Number((previousPrice - currentPrice).toFixed(2)) : null,
        drop_percent: typeof previousPrice === 'number' && previousPrice > 0
          ? Number((((previousPrice - currentPrice) / previousPrice) * 100).toFixed(2))
          : null,
        notification_status: 'pending',
        device_token: entry.device_token || null,
        created_at: createdAt,
      };
    })
    .filter(Boolean);
}

async function sendWatchlistAlerts({
  store,
  alerts,
  notifier = null,
  sentAt = new Date().toISOString(),
}) {
  const state = await store.load();
  state.watchlist_alert_events = state.watchlist_alert_events || [];
  state.notification_events = state.notification_events || [];

  for (const alert of alerts) {
    const canSend = canSendAlertForUser({
      state,
      userId: alert.user_id,
    });
    const effectiveAlert = canSend
      ? alert
      : {
          ...alert,
          notification_status: 'blocked_entitlement',
        };
    state.watchlist_alert_events.push(alert);
    const notification = {
      notification_id: crypto
        .createHash('sha256')
        .update(`${alert.alert_id}|${sentAt}`)
        .digest('hex'),
      alert_id: alert.alert_id,
      user_id: alert.user_id,
      source_product_id: alert.source_product_id,
      device_token: alert.device_token,
      provider: !canSend ? 'entitlement_gate' : notifier ? 'fcm' : 'queue_only',
      status: !canSend ? 'blocked' : notifier && alert.device_token ? 'sent' : 'queued',
      payload_json: JSON.stringify({
        title: 'Price drop detected',
        body: `${alert.display_name} is now ${alert.current_price}`,
        snapshot_date: alert.snapshot_date,
      }),
      sent_at: sentAt,
      error_message: null,
    };

    if (canSend && notifier && alert.device_token) {
      try {
        await notifier.send({
          token: alert.device_token,
          title: 'Price drop detected',
          body: `${alert.display_name} is now ${alert.current_price}`,
          data: {
            source_product_id: alert.source_product_id,
            snapshot_date: alert.snapshot_date,
          },
        });
      } catch (error) {
        notification.status = 'failed';
        notification.error_message = error.message;
      }
    }

    state.watchlist_alert_events[state.watchlist_alert_events.length - 1] = effectiveAlert;
    state.notification_events.push(notification);
  }

  await store.save(state);
  return {
    alerts_sent: alerts.length,
    state,
  };
}

module.exports = {
  detectWatchlistPriceDrops,
  sendWatchlistAlerts,
};
