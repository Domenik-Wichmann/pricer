# Verification Report

## Commands run
- `Copy-Item -LiteralPath 'app/functions/src/phase6/disambiguation.js' -Destination 'functions/src/phase6/disambiguation.js' -Force`
- `Copy-Item -LiteralPath 'app/functions/src/index.js' -Destination 'functions/src/index.js' -Force`
- `node tests\phase_6_production_pipeline.test.js`
- `npm run test:phase6`
- `npm run validate:docs`
- `node -e "require('./index.js'); console.log('functions package entrypoint loaded')"` run in `functions/`

## Results
- Passed: `node tests\phase_6_production_pipeline.test.js`
  - `Phase 6 tests: 60 passed, 0 failed, 60 total`
- Passed: `npm run test:phase6`
  - `Phase 6 tests: 60 passed, 0 failed, 60 total`
- Passed: `npm run validate:docs`
  - `JSON docs parse successfully.`
- Passed: functions runtime load check
  - `functions package entrypoint loaded`

## Adjudication runner shape
- `runCanonicalDisambiguationAdjudication(...)`
  - loads pending queue records from state or store
  - reuses cached decisions by `pair_fingerprint`
  - skips hard deterministic marker conflicts
  - batches unresolved records deterministically
  - runs in dry-run mode by default
  - calls the LLM only when explicitly enabled
  - validates response shape strictly
  - persists valid decisions with `decision_source = "llm"`
  - does not modify `canonical_products` or `canonical_product_mappings`

## Metrics emitted
- `pending_queue_count`
- `cached_hit_count`
- `would_send_count`
- `batch_count`
- `model_call_count`
- `new_adjudication_count`
- `merge_count`
- `distinct_count`
- `uncertain_count`
- `malformed_response_count`
- `skipped_hard_conflict_count`
- `errors`

## Notes
- Network adjudication remains off by default through `ENABLE_LLM_DISAMBIGUATION=false`.
- Tests use mocked fetch responses only; no live LLM requests were made.
