# Phase 16.6 Implementation Contract

## Goal
Persist Phase 16.5 basket quality metrics and expose deterministic aggregate summaries without changing basket optimization behavior.

## Runtime modules
- `app/functions/src/phase16/basket_analytics.js`
- `functions/src/phase16/basket_analytics.js`
- `app/functions/src/phase1/store.js`
- `functions/src/phase1/store.js`
- `app/functions/src/phase16/basket_optimizer.js`
- `functions/src/phase16/basket_optimizer.js`
- `app/functions/src/index.js`
- `functions/src/index.js`
- `functions/index.js`

## Storage
New collection:

- `basket_analytics_store`

Primary document id:

- `analytics_id`

Record fields:

- `analytics_id`
- `timestamp`
- `resolver`
- `pricing`
- `optimization`
- `convenience`

## API Contract
- `POST /basket/optimize` persists metrics only when `include_metrics=true` and `persist_metrics=true`.
- `GET /analytics/basket-summary` returns aggregate metrics.
- Optional query params: `window=last_24h|last_7d|all`, `limit=1..1000`.

## Safety Boundaries
- No optimizer behavior changes.
- No canonical, enrichment, price, basket-plan, optimizer-result, or convenience-result mutation.
- No external calls.
- Persistence failures are swallowed for the optimize response.
- Malformed analytics records are ignored during aggregation.
