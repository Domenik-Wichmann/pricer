# Verification Report

## Commands run
- `node tests/phase_6_production_pipeline.test.js`
- `npm run test:phase6`
- `node -e "require('./index.js'); console.log('functions package entrypoint loaded')"` run in `functions/`
- `@' ... '@ | node -` against `tmp/phase6_real/2026-04-21.zip` with a large in-memory store shim

## Result summary
- Passed: `node tests/phase_6_production_pipeline.test.js` reported `Phase 6 tests: 21 passed, 0 failed, 21 total`
- Passed: `npm run test:phase6` reported `Phase 6 tests: 21 passed, 0 failed, 21 total`
- Passed: the functions runtime load check reported `functions package entrypoint loaded`
- Passed: real `2026-04-21.zip` verification reported:
  - `dedupe_bucket_count: 111029`
  - `canonical_product_count: 77696`
  - `canonical_merge_count: 1032114`
  - `canonical_singleton_count: 19460`
  - `canonical_warning_count: 1054`
  - `enrichment_runs: 110037`
  - `estimated_enrichment_runs_without_dedupe: 1109810`

## Notes
- The new canonical layer is additive; raw snapshots, source products, enrichment rows, and chain-plus-product-code dedupe remain intact.
- The real archive verification shows a substantial cross-chain reduction from `111029` chain buckets to `77696` canonical product candidates.
- Warning counts are intentionally non-zero because the canonical key is conservative-but-broad enough to flag suspicious merges for later operator review.
