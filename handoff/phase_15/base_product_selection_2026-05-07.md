# Phase 15 Base Product Selection Handoff

Date: 2026-05-07

## Summary

Added soft product-search ranking weights for broad base ingredient/product queries so clean/raw/simple products rank ahead of processed, baby-food, or ready-meal products.

## What Changed

- Added base-product intent detection in `phase15/readers.js`.
- Added `base_product_boost` for raw/simple evidence such as chicken fillet, chilled meat, frozen/raw/loose terms, and matching base product type evidence.
- Added `processed_product_demotion`, `baby_food_demotion`, and `prepared_meal_demotion` as soft ranking reasons.
- Mirrored the runtime change in `functions/src/` and `app/functions/src/`.
- Added regressions in both Phase 15 and Phase 15.2 test suites for `пилешко` ranking raw chilled chicken fillet above baby chicken puree.

## Verification

- `npm run test:phase15_2` passed: 30 passed, 0 failed.
- `npm run test:phase15` passed: 76 passed, 0 failed.
- `npm run validate:docs` passed: JSON docs parse successfully.

## Operator Notes

- This is ranking-only behavior. Processed and baby-food candidates remain eligible when they match the query.
- No canonical ids, canonical mappings, source products, offers, enrichment store records, or schemas were changed.
