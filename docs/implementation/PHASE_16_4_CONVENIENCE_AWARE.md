# Phase 16.4 Implementation Contract

## Goal
Add optional user-context convenience scoring on top of existing basket optimizer results without changing product-price totals or optimizer ranking behavior.

## Runtime modules
- `app/functions/src/phase16/basket_convenience.js`
- `functions/src/phase16/basket_convenience.js`
- `app/functions/src/phase16/basket_optimizer.js`
- `functions/src/phase16/basket_optimizer.js`
- `app/functions/src/phase16/basket_explanation.js`
- `functions/src/phase16/basket_explanation.js`
- `app/functions/src/index.js`
- `functions/src/index.js`

## Core exports
- `applyBasketConvenienceScoring(...)`
- existing `handleOptimizeBasketSingleStoreRequest(...)` attaches convenience only when requested

## API contract
- Default `POST /basket/optimize` response remains unchanged.
- When `optimizer_options.include_convenience_scoring = true`, response includes `convenience`.
- When explanation is also requested, explanation includes a convenience summary and `distance_not_modeled` limitation.

## Added convenience fields
- `convenience_penalty`
- `estimated_travel_cost`
- `effective_total`
- `convenience_score`
- `recommended_strategy_before_convenience`
- `recommended_strategy_after_convenience`
- `penalty_breakdown`

## Penalty types
- `extra_store`
- `non_preferred_chain`
- `avoided_chain`
- `missing_locality`
- `user_max_store_count_exceeded`

## Supported request fields
- `user_context.locality_code`
- `user_context.preferred_chain_ids`
- `user_context.avoid_chain_ids`
- `user_context.max_store_count`
- `user_context.single_store_preferred`
- `convenience_options.extra_store_penalty`
- `convenience_options.non_preferred_chain_penalty`
- `convenience_options.avoided_chain_penalty`
- `convenience_options.missing_locality_penalty`

## Safety boundaries
- `actual_total` remains pure product price.
- `effective_total` is convenience-adjusted and separate.
- `estimated_travel_cost` is `0` in this phase.
- No real distance, time, fuel, delivery, pickup, or route modeling yet.
- No canonical, enrichment, price, basket-plan, or optimizer-result mutation.
