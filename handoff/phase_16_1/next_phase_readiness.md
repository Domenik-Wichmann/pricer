# Next Phase Readiness

Phase 16.1 is ready for Phase 16.2 multi-store optimization.

## Available contracts
- `POST /basket/optimize`
- `optimizeBasketSingleStore(...)`
- `lookupPricesForBasketPlan(...)`

## Recommended Phase 16.2 scope
- choose split baskets across multiple chains
- preserve the Phase 16.1 `actual_total` versus `score_total` distinction
- reuse explicit missing/stale warning shapes
- add user preference weighting only after the deterministic split search is bounded

## Boundaries to preserve
- no price mutation
- no canonical mutation
- no basket persistence unless a later phase explicitly adds it
- no currency conversion; source prices remain EUR
