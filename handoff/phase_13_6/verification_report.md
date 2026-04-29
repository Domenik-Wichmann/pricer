# Verification Report

## Commands run
- `node tests/phase_6_production_pipeline.test.js`
- `npm run test:phase6`
- `node -e "require('./index.js'); console.log('functions package entrypoint loaded')"` run in `functions/`
- `npm run validate:docs`
- `@' ... '@ | node -` against `tmp/phase6_real/2026-04-21.zip` with a large in-memory store shim

## Result summary
- Passed: `node tests/phase_6_production_pipeline.test.js` reported `Phase 6 tests: 30 passed, 0 failed, 30 total`
- Passed: `npm run test:phase6` reported `Phase 6 tests: 30 passed, 0 failed, 30 total`
- Passed: the functions runtime load check reported `functions package entrypoint loaded`
- Passed: `npm run validate:docs` reported `JSON docs parse successfully.`
- Passed: real `2026-04-21.zip` verification reported:
  - `previous_canonical_product_count: 77894`
  - `new_canonical_product_count: 78019`
  - `previous_canonical_warning_count: 940`
  - `new_canonical_warning_count: 863`
  - `dedupe_bucket_count: 111029`
  - `canonical_merge_count: 1031791`
  - `canonical_singleton_count: 19609`

## Notes
- The warning count dropped by `77` after adding deterministic numeric-range guards.
- Canonical product count rose modestly by `125`, which is the expected tradeoff for safer under-merging of size-band variants.
- Remaining warnings now skew more toward still-unmodeled variant markers such as vintage years and aged-expression numbers.
