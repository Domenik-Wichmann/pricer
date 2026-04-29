# Operator Actions

No required operator action for Phase 16.4 code verification.

Optional runtime follow-up:
1. Smoke-test `POST /basket/optimize` with `optimizer_options.include_convenience_scoring = true`.
2. Confirm client UI labels `effective_total` as convenience-adjusted, not product price.
3. Keep `distance_not_modeled` visible for any convenience-aware recommendation.
