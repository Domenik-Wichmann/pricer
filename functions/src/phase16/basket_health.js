const {
  getBasketAnalyticsSummary,
  ALLOWED_BASKET_ANALYTICS_WINDOWS,
} = require('./basket_analytics');

const BASKET_HEALTH_THRESHOLDS = Object.freeze({
  resolution_warning: 0.7,
  resolution_critical: 0.5,
  price_coverage_warning: 0.7,
  price_coverage_critical: 0.5,
  stale_rate_warning: 0.3,
  savings_warning: 1.0,
  savings_rate_warning: 0.05,
  convenience_flip_warning: 0.4,
  convenience_flip_critical: 0.6,
  low_sample_size: 20,
});

function buildBasketHealthAlerts(summary = {}) {
  const sampleSize = numberOrZero(summary.sample_size);
  const alerts = [];

  if (sampleSize < BASKET_HEALTH_THRESHOLDS.low_sample_size) {
    alerts.push(alert({
      type: 'low_sample_size',
      severity: 'info',
      value: sampleSize,
      threshold: BASKET_HEALTH_THRESHOLDS.low_sample_size,
      message: 'Basket analytics sample size is below 20, so health confidence is low.',
    }));
  }

  if (sampleSize > 0) {
    addLowThresholdAlert({
      alerts,
      type: 'low_resolution_rate',
      value: summary.average_resolution_rate,
      warningThreshold: BASKET_HEALTH_THRESHOLDS.resolution_warning,
      criticalThreshold: BASKET_HEALTH_THRESHOLDS.resolution_critical,
      messageBase: 'Average basket resolution rate',
    });
    addLowThresholdAlert({
      alerts,
      type: 'low_price_coverage',
      value: summary.average_price_coverage,
      warningThreshold: BASKET_HEALTH_THRESHOLDS.price_coverage_warning,
      criticalThreshold: BASKET_HEALTH_THRESHOLDS.price_coverage_critical,
      messageBase: 'Average price coverage',
    });
    addHighThresholdAlert({
      alerts,
      type: 'high_stale_rate',
      value: summary.average_stale_rate,
      warningThreshold: BASKET_HEALTH_THRESHOLDS.stale_rate_warning,
      message: 'Average stale price rate is above 30%.',
    });
    addLowThresholdAlert({
      alerts,
      type: 'low_average_savings',
      value: summary.average_savings,
      warningThreshold: BASKET_HEALTH_THRESHOLDS.savings_warning,
      messageBase: 'Average basket savings',
      unit: 'EUR',
    });
    addLowThresholdAlert({
      alerts,
      type: 'low_average_savings_rate',
      value: summary.average_savings_rate,
      warningThreshold: BASKET_HEALTH_THRESHOLDS.savings_rate_warning,
      messageBase: 'Average savings rate',
    });
    addHighThresholdAlert({
      alerts,
      type: 'high_convenience_flip_rate',
      value: summary.convenience_flip_rate,
      warningThreshold: BASKET_HEALTH_THRESHOLDS.convenience_flip_warning,
      criticalThreshold: BASKET_HEALTH_THRESHOLDS.convenience_flip_critical,
      message: 'Convenience scoring is changing recommendations frequently.',
    });
  }

  return {
    status: resolveHealthStatus(alerts),
    alerts,
  };
}

async function handleGetBasketHealthRequest({
  store,
  query = {},
}) {
  const windowResult = parseWindow(query.window);
  if (windowResult.error) {
    return windowResult.error;
  }

  const summary = await getBasketAnalyticsSummary({
    store,
    window: windowResult.value,
  });
  const health = buildBasketHealthAlerts(summary);

  return {
    status: 200,
    body: {
      status: health.status,
      alerts: health.alerts,
      summary: {
        window: windowResult.value,
        ...summary,
      },
    },
  };
}

function addLowThresholdAlert({
  alerts,
  type,
  value,
  warningThreshold,
  criticalThreshold = null,
  messageBase,
  unit = null,
}) {
  const numericValue = numberOrZero(value);
  if (criticalThreshold !== null && numericValue < criticalThreshold) {
    alerts.push(alert({
      type,
      severity: 'critical',
      value: numericValue,
      threshold: criticalThreshold,
      message: formatLowMessage(messageBase, criticalThreshold, unit),
    }));
    return;
  }
  if (numericValue < warningThreshold) {
    alerts.push(alert({
      type,
      severity: 'warning',
      value: numericValue,
      threshold: warningThreshold,
      message: formatLowMessage(messageBase, warningThreshold, unit),
    }));
  }
}

function addHighThresholdAlert({
  alerts,
  type,
  value,
  warningThreshold,
  criticalThreshold = null,
  message,
}) {
  const numericValue = numberOrZero(value);
  if (criticalThreshold !== null && numericValue > criticalThreshold) {
    alerts.push(alert({
      type,
      severity: 'critical',
      value: numericValue,
      threshold: criticalThreshold,
      message,
    }));
    return;
  }
  if (numericValue > warningThreshold) {
    alerts.push(alert({
      type,
      severity: 'warning',
      value: numericValue,
      threshold: warningThreshold,
      message,
    }));
  }
}

function alert({
  type,
  severity,
  value,
  threshold,
  message,
}) {
  return {
    type,
    severity,
    value,
    threshold,
    message,
  };
}

function resolveHealthStatus(alerts) {
  if (alerts.some((entry) => entry.severity === 'critical')) {
    return 'critical';
  }
  if (alerts.some((entry) => entry.severity === 'warning')) {
    return 'warning';
  }
  return 'healthy';
}

function formatLowMessage(metricName, threshold, unit) {
  if (unit === 'EUR') {
    return `${metricName} is below EUR ${threshold}.`;
  }
  return `${metricName} is below ${Math.round(threshold * 100)}%.`;
}

function parseWindow(value) {
  const window = String(value || 'all').trim().toLowerCase();
  if (!ALLOWED_BASKET_ANALYTICS_WINDOWS.includes(window)) {
    return {
      error: {
        status: 400,
        body: {
          error: 'invalid analytics window',
          allowed_windows: ALLOWED_BASKET_ANALYTICS_WINDOWS,
        },
      },
    };
  }
  return { value: window };
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = {
  BASKET_HEALTH_THRESHOLDS,
  buildBasketHealthAlerts,
  handleGetBasketHealthRequest,
};
