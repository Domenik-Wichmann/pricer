# Next Phase Readiness

Phase 16.3 is ready for UI integration and later locality/travel-aware optimization.

## Available contracts
- `buildBasketOptimizationExplanation(...)`
- `POST /basket/optimize` with `optimizer_options.include_explanation = true`

## Recommended next scope
- add localized message templates
- add travel/time/fuel or delivery-cost modeling
- keep product total, ranking score, and travel-adjusted cost visibly separate
- build explicit confirmation flows for ambiguous auto-selections
