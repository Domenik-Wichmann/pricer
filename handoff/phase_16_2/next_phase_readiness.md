# Next Phase Readiness

Phase 16.2 is ready for locality-aware or travel-aware basket optimization.

## Available contracts
- `POST /basket/optimize` default single-store strategy
- `POST /basket/optimize` multi-store strategy
- `optimizeBasketSingleStore(...)`
- `optimizeBasketMultiStore(...)`

## Recommended next scope
- add user locality and preferred chains
- model travel/time/fuel or delivery cost separately from product prices
- keep `actual_total`, `score_total`, and travel-adjusted totals clearly separated
- preserve the existing no-mutation boundaries
