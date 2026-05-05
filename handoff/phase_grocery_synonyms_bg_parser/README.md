# Grocery Synonyms And Bulgarian Parser QA Handoff

Date: 2026-05-03

## Summary

Implemented deterministic BG/EN grocery query expansion for Phase 15 product search and fixed obvious Bulgarian brand/unit/age parser issues surfaced during Admin Console QA.

## Files Changed

- `functions/src/phase15/search_synonyms.js`
- `app/functions/src/phase15/search_synonyms.js`
- `functions/src/phase15/readers.js`
- `app/functions/src/phase15/readers.js`
- `functions/src/phase15/service.js`
- `app/functions/src/phase15/service.js`
- `functions/src/phase1/constants.js`
- `app/functions/src/phase1/constants.js`
- `functions/src/phase1/enrichment.js`
- `app/functions/src/phase1/enrichment.js`
- `functions/src/phase6/ingest.js`
- `app/functions/src/phase6/ingest.js`
- `functions/src/index.js`
- `app/functions/src/index.js`
- `tests/phase_15_2_product_api.test.js`
- `tests/phase_6_production_pipeline.test.js`
- `docs/SEARCH_SYNONYMS_AND_BG_PARSING.md`
- `docs/REPO_MAP.md`
- `docs/DATA_MODEL.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/decision_log.md`
- `CHANGELOG.md`

## Verification

- `node tests/phase_15_2_product_api.test.js` -> 18 passed
- `node tests/phase_15_3_shopping_list_resolution.test.js` -> 9 passed
- `node tests/phase_15_4_basket_input_planner.test.js` -> 8 passed
- `node tests/phase_6_production_pipeline.test.js` -> 78 passed

## Operator Notes

- No Firestore data was deleted.
- No heavy Phase 6 ingest or Firestore publisher was run.
- Existing production canonical marker fields require a future re-ingest/re-publish to reflect parser fixes.
- Backend Functions should be deployed for live search-ranking changes.
- Hosting deploy is not required unless separate Admin Console UI changes are included.
