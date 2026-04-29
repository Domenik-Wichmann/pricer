# Verification Report

## Commands run
- `node tests/phase_16_1_basket_optimizer.test.js`
- `node tests/phase_16_0_price_lookup.test.js`
- `node tests/phase_15_4_basket_input_planner.test.js`
- `node tests/phase_15_3_shopping_list_resolution.test.js`
- `npm run validate:docs`
- `node -e "require('./functions/src/index.js'); console.log('functions runtime loaded')"`
- `npm test`

## Results
- Passed: `node tests/phase_16_1_basket_optimizer.test.js`
  - `Phase 16.1 tests: 13 passed, 0 failed, 13 total`
- Passed: `node tests/phase_16_0_price_lookup.test.js`
  - `Phase 16.0 tests: 8 passed, 0 failed, 8 total`
- Passed: `node tests/phase_15_4_basket_input_planner.test.js`
  - `Phase 15.4 tests: 8 passed, 0 failed, 8 total`
- Passed: `node tests/phase_15_3_shopping_list_resolution.test.js`
  - `Phase 15.3 tests: 9 passed, 0 failed, 9 total`
- Passed: `npm run validate:docs`
  - `JSON docs parse successfully.`
- Passed: functions runtime load check
  - `functions runtime loaded`
- Passed: `npm test`
  - includes Phase 16.1 suite with `13 passed, 0 failed, 13 total`

## Notes
- Phase 16 price outputs now use `EUR`.
- Missing-item penalty is used only for `score_total` ranking.
- `actual_total` includes only known selected prices.
- Stale records are excluded by default and surfaced through warnings.
