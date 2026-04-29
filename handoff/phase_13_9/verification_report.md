# Verification Report

## Commands run
- `Copy-Item -LiteralPath app/functions/src/phase6/ingest.js -Destination functions/src/phase6/ingest.js -Force`
- `node tests\phase_6_production_pipeline.test.js`
- `npm run test:phase6`
- `node -e "require('./index.js'); console.log('functions package entrypoint loaded')"` run in `functions/`
- `@' ... '@ | node -` against `tmp/phase6_real/2026-04-21.zip` with a lightweight in-memory `LargeStateStore` shim

## Result summary
- Passed: `node tests\phase_6_production_pipeline.test.js` reported `Phase 6 tests: 49 passed, 0 failed, 49 total`
- Passed: `npm run test:phase6` reported `Phase 6 tests: 49 passed, 0 failed, 49 total`
- Passed: the functions runtime load check reported `functions package entrypoint loaded`
- Passed: real `2026-04-21.zip` verification reported:
  - `previous_canonical_product_count: 78186`
  - `new_canonical_product_count: 78194`
  - `previous_canonical_warning_count: 693`
  - `new_canonical_warning_count: 662`
  - `dedupe_bucket_count: 111029`
  - `canonical_merge_count: 1031616`
  - `canonical_singleton_count: 19689`
  - `warning_reason_counts`:
    - `potential_over_canonicalization_name_divergence: 624`
    - `potential_over_canonicalization_token_divergence: 38`

## Notes
- The warning count dropped by `31` after adding deterministic numeric-family markers for count, age-band, and reserve-tier handling.
- Canonical product count rose by `8`, which matches the intended conservative under-merging tradeoff for numeric-family variants.
- Remaining warning samples still include count-family and age-band cases that make good candidates for the future audited LLM disambiguation lane.
