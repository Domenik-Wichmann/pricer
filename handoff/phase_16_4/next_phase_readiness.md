# Next Phase Readiness

Phase 16.4 is ready for true distance/travel-aware optimization.

## Available contracts
- `applyBasketConvenienceScoring(...)`
- `POST /basket/optimize` with `optimizer_options.include_convenience_scoring = true`
- `user_context`
- `convenience_options`

## Recommended next scope
- store geocoding and locality matching
- real distance and duration estimates
- fuel/time/delivery/pickup costs
- separate product total, convenience-adjusted total, and travel-adjusted total in UI
