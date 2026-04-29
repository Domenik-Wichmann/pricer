# Verification Report

## Purpose
Phase M0 establishes the first repo-owned meal-domain foundations without implementing recipes or planning yet. The phase adds ingredient hierarchy, units and conversions, ingredient-specific unit rules, and product-to-ingredient bridge pricing on top of the existing shared flat backbone.

## Commands run
- `node tests/phase_m0_ingredient.test.js`
- `node tests/phase_m0_conversion.test.js`
- `node tests/phase_m0_mapping.test.js`
- `npm run test:phase_m0`
- `node tests/phase_1_data_backbone.test.js`
- `node tests/phase_11_production_persistence.test.js`
- `node tests/phase_15_2_product_api.test.js`
- `npm run verify`
- `npm run validate:docs`
- `node -e "require('./functions/src/index.js'); console.log('functions runtime loaded')"`

## Results
- Passed: `node tests/phase_m0_ingredient.test.js`
  - `Phase M0 ingredient tests: 3 passed, 0 failed, 3 total`
- Passed: `node tests/phase_m0_conversion.test.js`
  - `Phase M0 conversion tests: 4 passed, 0 failed, 4 total`
- Passed: `node tests/phase_m0_mapping.test.js`
  - `Phase M0 mapping tests: 6 passed, 0 failed, 6 total`
- Passed: `npm run test:phase_m0`
  - `Phase M0 ingredient tests: 3 passed, 0 failed, 3 total`
  - `Phase M0 conversion tests: 4 passed, 0 failed, 4 total`
  - `Phase M0 mapping tests: 6 passed, 0 failed, 6 total`
- Passed: `node tests/phase_1_data_backbone.test.js`
  - `Phase tests: 17 passed, 0 failed, 17 total`
- Passed: `node tests/phase_11_production_persistence.test.js`
  - `Phase 11 tests: 3 passed, 0 failed, 3 total`
- Passed: `node tests/phase_15_2_product_api.test.js`
  - `Phase 15.2 tests: 9 passed, 0 failed, 9 total`
- Passed: `npm run verify`
  - `Basic verify passed.`
- Passed: `npm run validate:docs`
  - `JSON docs parse successfully.`
- Passed: functions runtime load check
  - `functions runtime loaded`

## Verification focus
- Store compatibility:
  - new flat meal collections exist inside the shared backbone contract
  - previous store and persistence tests still pass
- Ingredient contracts:
  - deterministic family/category/ingredient upsert and query behavior
  - runtime-safe field validation is enforced
- Unit and conversion contracts:
  - seeded generic conversions work
  - ingredient-specific piece rules work
  - edible-to-purchase projection rounds conservatively
- Bridge and price contracts:
  - stronger mapping types outrank weaker ones
  - exact local mapped price outranks other-store price
  - category-average fallback is reachable when mapped product prices are absent
  - ingredient estimate remains the final fallback

## Notes
- M0 keeps ingredients separate from `canonical_products`; the bridge is explicit and additive.
- The current category-average fallback normalizes aggregate category price using mapped canonical pack-size context when direct mapped price rows are missing.
