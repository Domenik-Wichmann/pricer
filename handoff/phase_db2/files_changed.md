# Phase DB2 Files Changed

## Added
- `db/migrations/002_db2_usda_macro_import.sql`
- `db/migrations/003_db2_usda_import_run_metadata.sql`
- `functions/src/db/usda/macro_constants.js`
- `functions/src/db/usda/csv_stream.js`
- `functions/src/db/usda/usda_schema.js`
- `functions/src/db/usda/usda_repository.js`
- `functions/src/db/usda/usda_importer.js`
- `app/functions/src/db/usda/macro_constants.js`
- `app/functions/src/db/usda/csv_stream.js`
- `app/functions/src/db/usda/usda_schema.js`
- `app/functions/src/db/usda/usda_repository.js`
- `app/functions/src/db/usda/usda_importer.js`
- `scripts/import_usda_macros.js`
- `tests/db2_usda_macro_import.test.js`
- `tests/fixtures/usda_macro/*`
- `docs/implementation/PHASE_DB2_USDA_MACRO_IMPORT.md`
- `docs/test_runs/phase_db2_2026-04-24.json`
- `handoff/phase_db2/verification_report.md`
- `handoff/phase_db2/operator_actions.md`
- `handoff/phase_db2/next_phase_readiness.md`

## Updated
- `docs/PHASE_DB2_USDA_MACRO_IMPORT.md`
- `docs/PHASE_DB1_POSTGRES_FOUNDATION.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/CURRENT_STATE.md`
- `docs/current_state.json`
- `docs/decision_log.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `CHANGELOG.md`
- `package.json`
- `package-lock.json`
- `tests/run_all.js`
- `tests/db1_postgres_foundation.test.js`
- `functions/src/index.js`
- `app/functions/src/index.js`
- `app/secrets/backend.env.example`

## Safety Notes
- No Firestore runtime paths were changed.
- No `kolkostruva.bg` ingest paths were changed.
- No Open Food Facts, recipe, LLM, or app-facing nutrition publishing work was added.
- Incomplete USDA source rows are skipped and counted instead of crashing the sidecar import.
