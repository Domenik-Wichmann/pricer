# Phase 16.0 Implementation Contract

## Goal
Bridge basket-planner output into deterministic canonical price access without introducing optimization logic yet.

## Runtime modules
- `app/functions/src/phase16/price_lookup.js`
- `functions/src/phase16/price_lookup.js`
- `app/functions/src/index.js`
- `functions/src/index.js`
- `functions/index.js`

## Core exports
- `lookupCanonicalProductPrices(...)`
- `lookupPricesForBasketPlan(...)`
- `handleLookupCanonicalProductPricesRequest(...)`

## Route contract
- `POST /prices/lookup`
  - accepts `canonical_product_ids`
  - accepts bounded lookup options
  - returns deterministic latest-price records, best-price selection, and explicit price status

## Data-source contract
- derive canonical coverage from `canonical_product_mappings`
- read latest price truth from `raw_price_snapshots`
- read chain and store provenance from `raw_price_snapshots` and `source_products`
- optionally expose `product_daily_prices` when `include_history=true`
- do not create a new canonical-price persistence collection in this phase

## Deterministic handling
- only `price_mode: latest` is supported in Phase 16.0
- freshness uses `max_age_days`
- chain and store filters are normalized deterministically
- best-price selection is the lowest non-stale effective price
- basket-plan price lookup clones planner output and does not mutate it

## Verification targets
- latest-price lookup by canonical product id
- explicit missing status
- explicit stale status
- chain and store filtering
- promo-aware best-price selection
- request validation
- basket-plan candidate collection
- no mutation of basket plans, canonical truth, or price snapshots
