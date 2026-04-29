# Operator Actions

## Purpose
Phase 13 is fully implemented in code. The remaining work is review-oriented rather than unblock-the-runtime work.

## Ordered steps
1. Review the `canonical_warning_count` and warning samples from the real archive verification before wiring canonical products into user-facing ranking or analytics decisions.
2. Inspect a handful of warning-heavy canonical groups from production-size runs and decide whether more deterministic attribute guards are needed for child-stage formulas, age bands, flavors, or similar variant markers.
3. Keep the canonical layer additive until downstream consumers have been updated and validated against the warning sample.
