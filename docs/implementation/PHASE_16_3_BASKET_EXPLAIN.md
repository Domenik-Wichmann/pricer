# Phase 16.3 Implementation Contract

## Goal
Add an optional user-facing explanation layer on top of Phase 16 optimizer results without changing optimization behavior.

## Runtime modules
- `app/functions/src/phase16/basket_explanation.js`
- `functions/src/phase16/basket_explanation.js`
- `app/functions/src/phase16/basket_optimizer.js`
- `functions/src/phase16/basket_optimizer.js`
- `app/functions/src/index.js`
- `functions/src/index.js`

## Core exports
- `buildBasketOptimizationExplanation(...)`
- existing `handleOptimizeBasketSingleStoreRequest(...)` now attaches explanation only when requested

## API contract
- Default `POST /basket/optimize` response remains unchanged.
- When `optimizer_options.include_explanation = true`, response includes:
  - `optimizer_result`
  - `explanation`

## Explanation output
- `headline`
- `summary_text`
- `recommended_strategy`
- `estimated_total`
- `currency`
- `savings`
- `coverage`
- `store_summaries`
- `item_notes`
- `warnings`
- `limitations`

## Implemented item note types
- `missing_price`
- `stale_price_excluded`
- `ambiguous_auto_selected`
- `unresolved_item_excluded`
- `manual_item_included`
- `optimization_blocked`

Allowed severities:
- `info`
- `warning`
- `blocking`

## Implemented limitations
- `availability_not_guaranteed`
- `travel_not_included`
- `stale_prices_excluded`
- `ambiguous_selection_needs_confirmation`

## Safety boundaries
- English-only text in this phase.
- No translation yet.
- No ranking or scoring changes.
- No basket persistence.
- No canonical, enrichment, price, basket-plan, price-lookup, or optimizer-result mutation.
