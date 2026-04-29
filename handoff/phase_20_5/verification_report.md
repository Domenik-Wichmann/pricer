# Verification Report

## Commands

- `node tests/phase_20_5_internal_access_guard.test.js`
- `npm run test:phase20_5`
- `node tests/phase_20_4_merchant_insight_api.test.js`
- `node tests/phase_20_3_market_opportunity_reports.test.js`
- `node tests/phase_20_2_chain_gap.test.js`
- `node -c functions/src/phase18/internal_access.js; node -c app/functions/src/phase18/internal_access.js; node -c functions/index.js`
- `node -e "require('./functions/src'); require('./app/functions/src'); console.log('exports ok')"`
- `npm run validate:docs`

## Results

- Phase 20.5 tests: 9 passed, 0 failed.
- Phase 20.4 tests: 9 passed, 0 failed.
- Phase 20.3 tests: 11 passed, 0 failed.
- Phase 20.2 tests: 11 passed, 0 failed.
- Syntax checks: passed.
- Export smoke check: passed.
- Docs validation: passed.

## Covered

- Missing token denied.
- Wrong token denied.
- Admin role allowed.
- Analyst role allowed.
- Merchant role denied.
- Missing env token denies.
- Consumer endpoints stay outside the protected path list.
- All Phase 20 internal endpoint paths are protected.
- Forbidden responses do not leak token values.
