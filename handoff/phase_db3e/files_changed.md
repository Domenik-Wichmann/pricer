# DB3E Files Changed

## Added
- `db/migrations/017_db3e_ingredient_product_equivalence.sql`
- `functions/src/db/products/ingredient_product_repository.js`
- `app/functions/src/db/products/ingredient_product_repository.js`
- `functions/src/db/products/ingredient_product_matching.js`
- `app/functions/src/db/products/ingredient_product_matching.js`
- `scripts/db3e_generate_product_ingredient_candidates.js`
- `scripts/db3e_review_product_ingredient_mapping.js`
- `tests/db3e_ingredient_product_equivalence.test.js`
- `docs/test_runs/phase_db3e_2026-04-24.json`
- `handoff/phase_db3e/*`

## Updated
- `functions/src/index.js`
- `app/functions/src/index.js`
- `package.json`
- `tests/run_all.js`
- `tests/db1_postgres_foundation.test.js`
- `docs/DB3_CANONICAL_INGREDIENTS.md`
- `docs/DATA_MODEL.md`
- `docs/SCHEMA_MAP.md`
- `docs/REPO_MAP.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/decision_log.md`
- `CHANGELOG.md`

## Compatibility Fix During Verification
- `functions/src/phase18/gap_detection.js`
- `app/functions/src/phase18/gap_detection.js`

The compatibility fix keeps Phase 18.7 gap-signal persistence non-blocking when a store save fails, preserving the existing Phase 16.6 optimizer failure-tolerance contract.
