# Operator Actions

No required operator action for Phase 16.3 code verification.

Optional runtime follow-up:
1. Smoke-test `POST /basket/optimize` with `optimizer_options.include_explanation = true`.
2. Confirm client UI uses `actual_total` and explanation copy without labeling `score_total` as real cost.
3. Confirm multi-store explanation copy makes travel/time limitations visible.
