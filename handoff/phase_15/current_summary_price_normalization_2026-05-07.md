# Phase 15 Current Summary Price Normalization Handoff

Date: 2026-05-07

## Summary

Fixed Phase 15 product search/detail response shaping so compact `current_offer_summary` rows no longer lose valid product-level price normalization when the stored summary has `price_normalization: null` or `comparison_basis: "unknown"`.

The response layer now:
- keeps backend read-model semantics additive
- copies or summarizes the product-level comparison basis when the compact summary is missing it
- derives `price_per_comparison_basis` only from already-present current summary prices
- preserves explicit package quantities and avoids fake quantities for loose-weight products

## Files Changed

- `functions/src/phase15/service.js`
- `app/functions/src/phase15/service.js`
- `tests/phase_15_2_product_api.test.js`
- `CHANGELOG.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/DATA_MODEL.md`
- `docs/SCHEMA_MAP.md`
- `docs/test_runs/phase15_current_summary_price_normalization_2026-05-07.json`

## Verification

- `npm run test:phase15_2` passed, 29 passed / 0 failed.
- `npm run test:phase15` passed, 69 passed / 0 failed.

## Operator Notes

No operator action required.
