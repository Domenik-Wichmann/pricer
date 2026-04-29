const crypto = require('node:crypto');

const INTERNAL_ANALYTICS_TOKEN_ENV = 'PRICER_INTERNAL_ANALYTICS_TOKEN';
const INTERNAL_ANALYTICS_TOKEN_HEADER = 'x-pricer-admin-token';
const INTERNAL_ANALYTICS_ROLE_HEADER = 'x-pricer-role';
const ALLOWED_INTERNAL_ANALYTICS_ROLES = Object.freeze(['admin', 'analyst']);
const PROTECTED_INTERNAL_ANALYTICS_ENDPOINTS = Object.freeze([
  '/analytics/gap-detection',
  '/analytics/gap-detection/localities',
  '/analytics/gap-detection/coverage-by-chain',
  '/analytics/opportunities',
  '/analytics/insights/overview',
  '/analytics/insights/opportunities',
  '/analytics/insights/categories',
  '/analytics/insights/localities',
  '/analytics/insights/chains',
]);

function requireInternalAnalyticsAccess(req, options = {}) {
  const env = options.env || process.env;
  const expectedToken = normalizeSecret(env[INTERNAL_ANALYTICS_TOKEN_ENV]);
  const providedToken = normalizeSecret(readHeader(req, INTERNAL_ANALYTICS_TOKEN_HEADER));
  const role = normalizeRole(readHeader(req, INTERNAL_ANALYTICS_ROLE_HEADER)) || 'admin';

  if (!expectedToken || !providedToken || !safeEqualSecret(providedToken, expectedToken)) {
    return forbiddenAccessResult();
  }

  if (!ALLOWED_INTERNAL_ANALYTICS_ROLES.includes(role)) {
    return forbiddenAccessResult();
  }

  return {
    allowed: true,
    role,
  };
}

function isInternalAnalyticsPath(path) {
  return PROTECTED_INTERNAL_ANALYTICS_ENDPOINTS.includes(String(path || ''));
}

function forbiddenAccessResult() {
  return {
    allowed: false,
    status: 403,
    body: {
      error: 'forbidden',
    },
  };
}

function readHeader(req, name) {
  if (!req || !name) {
    return null;
  }
  if (typeof req.get === 'function') {
    return req.get(name);
  }
  const headers = req.headers || {};
  return headers[name] || headers[name.toLowerCase()] || null;
}

function normalizeSecret(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeRole(value) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function safeEqualSecret(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  ALLOWED_INTERNAL_ANALYTICS_ROLES,
  INTERNAL_ANALYTICS_ROLE_HEADER,
  INTERNAL_ANALYTICS_TOKEN_ENV,
  INTERNAL_ANALYTICS_TOKEN_HEADER,
  PROTECTED_INTERNAL_ANALYTICS_ENDPOINTS,
  forbiddenAccessResult,
  isInternalAnalyticsPath,
  requireInternalAnalyticsAccess,
};
