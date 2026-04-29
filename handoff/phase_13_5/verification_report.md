# Verification Report

## Commands run
- `node tests/phase_6_production_pipeline.test.js`
- `npm run test:phase6`
- `node -e "require('./index.js'); console.log('functions package entrypoint loaded')"` run in `functions/`
- `@' ... '@ | node -` against `tmp/phase6_real/2026-04-21.zip` with a large in-memory store shim

## Result summary
- Passed: `node tests/phase_6_production_pipeline.test.js` reported `Phase 6 tests: 26 passed, 0 failed, 26 total`
- Passed: `npm run test:phase6` reported `Phase 6 tests: 26 passed, 0 failed, 26 total`
- Passed: the functions runtime load check reported `functions package entrypoint loaded`
- Passed: real `2026-04-21.zip` verification reported:
  - `previous_canonical_product_count: 77696`
  - `new_canonical_product_count: 77894`
  - `previous_canonical_warning_count: 1054`
  - `new_canonical_warning_count: 940`
  - `dedupe_bucket_count: 111029`
  - `canonical_merge_count: 1031916`
  - `canonical_singleton_count: 19526`

## Notes
- The warning count dropped by `114` after tightening deterministic variant guards.
- Canonical product count rose modestly by `198`, which is the expected tradeoff for safer under-merging.
- Remaining warnings now skew more toward size-range cases and other still-unmodeled variant markers than the originally reported stage and flavor risks.
