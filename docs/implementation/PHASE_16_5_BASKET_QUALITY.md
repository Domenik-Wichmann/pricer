# Phase 16.5 Implementation Contract

## Goal
Add a deterministic, read-only basket quality and monitoring layer over the existing resolver, planner, price lookup, optimizer, explanation, and convenience outputs.

## Runtime modules
- `app/functions/src/phase16/basket_quality.js`
- `functions/src/phase16/basket_quality.js`
- `app/functions/src/phase16/basket_optimizer.js`
- `functions/src/phase16/basket_optimizer.js`
- `app/functions/src/index.js`
- `functions/src/index.js`

## Core exports
- `buildBasketQualityMetrics(...)`
- `buildGlobalBasketMetricsSummary(...)`

## API contract
- Default `POST /basket/optimize` response remains unchanged.
- When `optimizer_options.include_metrics = true`, response includes `metrics`.
- Metrics are computed after optimization and optional convenience scoring without changing optimizer output.

## Metrics
- Resolver: resolution, ambiguity, and unresolved counts and rates.
- Pricing: priced, missing, and stale counts and rates.
- Optimization: single-store total, multi-store total, savings, and savings rate.
- Convenience: before/after recommendation, flip boolean, effective total, actual total, and effective-vs-actual delta.
- Global summary: average resolution, average price coverage, average savings, multi-store usage rate, and convenience flip rate.

## Safety boundaries
- No mutation.
- No persistence.
- No randomness.
- No external calls.
- No optimizer behavior changes.
- No response shape change unless `include_metrics` is true.
