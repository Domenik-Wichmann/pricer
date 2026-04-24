# Phase 16.2 Implementation Contract

## Goal
Extend `POST /basket/optimize` so callers can opt into a bounded multi-store split and compare it against the existing best single-store option.

## Runtime modules
- `app/functions/src/phase16/basket_optimizer.js`
- `functions/src/phase16/basket_optimizer.js`
- `app/functions/src/index.js`
- `functions/src/index.js`

## Core exports
- `optimizeBasketMultiStore(...)`
- `optimizeBasketSingleStore(...)`
- `handleOptimizeBasketSingleStoreRequest(...)`
- `normalizeOptimizerOptions(...)`

## API contract
- Default request remains single-store and returns the existing Phase 16.1 `optimizer_result` shape.
- Multi-store requests set `optimizer_options.strategy = "multi_store"` and return `best_single_store_option`, `best_multi_store_option`, `recommended_strategy`, alternatives, and combination summary.

## Bounded search
- Default `max_stores` is `2`.
- `max_stores` is capped at `3`.
- One-store combinations remain owned by the Phase 16.1 single-store optimizer.

## Recommendation policy
Multi-store is recommended only when:
- multi-store coverage is at least best single-store coverage
- `savings_vs_best_single_store >= minimum_savings`
- multi-store `score_total <= single_store.score_total`

## Ranking policy
Best multi-store option ordering:
1. lowest `score_total`
2. highest `coverage_ratio`
3. lowest `actual_total`
4. fewer stores
5. deterministic store key tie-breaker

## Safety boundaries
- Source prices remain EUR.
- Missing-item penalty affects `score_total` only.
- `actual_total` includes known selected prices only.
- Stale prices are excluded by default.
- Ambiguous `cheapest_candidate` auto-selection is warned.
- No canonical, enrichment, price, or basket-plan mutation.
- No travel time, fuel, distance, delivery, or locality-aware scoring yet.
