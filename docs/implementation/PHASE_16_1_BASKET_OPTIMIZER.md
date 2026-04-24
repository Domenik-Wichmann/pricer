# Phase 16.1 Implementation Contract

## Goal
Build the first deterministic basket optimizer on top of Phase 15.4 basket plans and Phase 16.0 canonical price lookup.

## Runtime modules
- `app/functions/src/phase16/basket_optimizer.js`
- `functions/src/phase16/basket_optimizer.js`
- `app/functions/src/phase16/price_lookup.js`
- `functions/src/phase16/price_lookup.js`
- `app/functions/src/index.js`
- `functions/src/index.js`
- `functions/index.js`

## Core exports
- `optimizeBasketSingleStore(...)`
- `handleOptimizeBasketSingleStoreRequest(...)`
- `normalizeOptimizerOptions(...)`

## Route contract
- `POST /basket/optimize`
  - builds a Phase 15.4 basket plan
  - runs Phase 16.0 price lookup for ready and carried ambiguous candidates
  - returns `basket_plan`, `price_lookup_summary`, and `optimizer_result`

## Currency contract
- Source price values are treated as EUR.
- Price lookup and basket optimizer outputs use `currency: "EUR"`.
- No currency conversion or exchange-rate API is used.

## Ranking and scoring
- Each chain is evaluated as a single-store/single-chain option.
- For each chain, the optimizer chooses the cheapest usable price per ready item.
- For ambiguous carried candidates, `cheapest_candidate` chooses the cheapest priced candidate for that chain and emits an auto-selection warning.
- `actual_total` includes only actual known selected prices.
- `score_total` equals `actual_total + missing_item_count * missing_item_penalty` and is for ranking only.
- Best option ordering is:
  1. lowest `score_total`
  2. highest `coverage_ratio`
  3. lowest `actual_total`
  4. deterministic chain/store id tie-breaker

## Missing, stale, and ambiguous handling
- Stale prices are excluded by default through `allow_stale: false`.
- Missing and stale-excluded items are represented as item warnings and increase `score_total` through the missing-item penalty.
- `require_confirmation` for optimizer ambiguous policy blocks optimization when ambiguous items are present.
- Basket plans with `optimization_ready: false` block optimization.
- The optimizer does not mutate basket plans, canonical products, price records, or price lookup inputs.

## Verification targets
- complete single-store basket selection
- incomplete cheaper basket losing due to penalty
- separate actual and score totals
- explicit missing and stale warnings
- ambiguous cheapest-candidate selection
- require-confirmation blocking
- EUR currency output
- no input mutation
- endpoint bad-input validation
- deterministic tie-breaking
