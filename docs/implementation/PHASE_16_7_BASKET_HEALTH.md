# Phase 16.7 Implementation Contract

## Goal
Add an internal-only deterministic basket health and alert layer over Phase 16.6 analytics summaries.

## Runtime modules
- `app/functions/src/phase16/basket_health.js`
- `functions/src/phase16/basket_health.js`
- `app/functions/src/phase16/basket_analytics.js`
- `functions/src/phase16/basket_analytics.js`
- `app/functions/src/index.js`
- `functions/src/index.js`
- `functions/index.js`

## Core exports
- `buildBasketHealthAlerts(summary)`
- `handleGetBasketHealthRequest(...)`
- `BASKET_HEALTH_THRESHOLDS`

## API contract
- `GET /analytics/basket-health`
- Optional query param: `window=last_24h|last_7d|all`
- Response includes `status`, `alerts`, and the underlying analytics `summary`.

## Safety boundaries
- Internal diagnostics only.
- No optimizer behavior changes.
- No mutation of analytics data.
- No mutation of canonical, enrichment, price, basket-plan, optimizer, or convenience data.
- No external calls.
