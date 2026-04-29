# Verification Report

## Commands run
- `Copy-Item -LiteralPath 'app/functions/src/phase6/ingest.js' -Destination 'functions/src/phase6/ingest.js' -Force`
- `Copy-Item -LiteralPath 'app/functions/src/phase6/disambiguation.js' -Destination 'functions/src/phase6/disambiguation.js' -Force`
- `Copy-Item -LiteralPath 'app/functions/src/index.js' -Destination 'functions/src/index.js' -Force`
- `node tests\phase_6_production_pipeline.test.js`
- `npm run test:phase6`
- `npm run validate:docs`
- `node -e "require('./index.js'); console.log('functions package entrypoint loaded')"` run in `functions/`

## Results
- Passed: `node tests\phase_6_production_pipeline.test.js`
  - `Phase 6 tests: 73 passed, 0 failed, 73 total`
- Passed: `npm run test:phase6`
  - `Phase 6 tests: 73 passed, 0 failed, 73 total`
- Passed: `npm run validate:docs`
  - `JSON docs parse successfully.`
- Passed: functions runtime load check
  - `functions package entrypoint loaded`

## Application layer implemented
- `applyEffectiveCanonicalDecisions(...)`
  - reads candidate queue pairs and effective decisions
  - returns `applied_merges`
  - returns `blocked_merges`
  - returns `skipped_conflicts`
  - returns `unchanged_pairs`
  - returns mandatory `audit_log`
  - returns `applied_grouping_map` only when controlled apply-view mode is requested

## Safety notes
- Deterministic hard marker conflicts still override decisions.
- Dry-run mode is the default.
- Apply mode still does not mutate `canonical_products`, `canonical_product_mappings`, source identity, or chain/product dedupe.
- Ingest now attaches `disambiguation_application_preview` as dry-run output only.
