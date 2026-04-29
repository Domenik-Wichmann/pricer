# Verification Report

## Commands

- `node tests/phase_20_6_internal_insights_dashboard.test.js`
- `node tests/phase_20_5_internal_access_guard.test.js`
- `node tests/phase_20_4_merchant_insight_api.test.js`
- `node -c functions/src/phase18/internal_dashboard.js; node -c app/functions/src/phase18/internal_dashboard.js; node -c functions/index.js`
- `node -e "require('./functions/src'); require('./app/functions/src'); console.log('exports ok')"`
- `npm run test:phase20_6`
- `npm run validate:docs`

## Results

- Phase 20.6 tests: 8 passed, 0 failed.
- Phase 20.5 tests: 9 passed, 0 failed.
- Phase 20.4 tests: 9 passed, 0 failed.
- Syntax checks: passed.
- Export smoke check: passed.
- Docs validation: passed.

## Covered

- HTML shell rendering.
- All insights endpoints referenced.
- Token and role headers used.
- No embedded token value.
- Browser-local token controls.
- Section targets present.
- Shell route outside protected path list while data endpoints remain guarded.
- No-store HTML response.
- No merchant billing/product positioning copy.
