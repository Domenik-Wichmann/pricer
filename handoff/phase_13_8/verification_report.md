# Verification Report

## Commands run
- `Copy-Item -LiteralPath app/functions/src/phase6/ingest.js -Destination functions/src/phase6/ingest.js -Force`
- `node tests\phase_6_production_pipeline.test.js`
- `npm run test:phase6`
- `node -e "require('./index.js'); console.log('functions package entrypoint loaded')"` run in `functions/`
- `npm run validate:docs`
- `@' ... '@ | node -` against `tmp/phase6_real/2026-04-21.zip` with a lightweight in-memory `LargeStateStore` shim

## Result summary
- Passed: `node tests\phase_6_production_pipeline.test.js` reported `Phase 6 tests: 42 passed, 0 failed, 42 total`
- Passed: `npm run test:phase6` reported `Phase 6 tests: 42 passed, 0 failed, 42 total`
- Passed: the functions runtime load check reported `functions package entrypoint loaded`
- Passed: `npm run validate:docs` reported `JSON docs parse successfully.`
- Passed: real `2026-04-21.zip` verification reported:
  - `previous_canonical_product_count: 78058`
  - `new_canonical_product_count: 78186`
  - `previous_canonical_warning_count: 847`
  - `new_canonical_warning_count: 693`
  - `dedupe_bucket_count: 111029`
  - `canonical_merge_count: 1031624`
  - `canonical_singleton_count: 19706`

## Notes
- The warning count dropped by `154` after adding deterministic volume and size guards.
- Canonical product count rose by `128`, which matches the intended conservative under-merging tradeoff for real size and weight variants.
- Remaining warning samples now skew more toward age-band and pack-family differences rather than ml-versus-liter formatting.
