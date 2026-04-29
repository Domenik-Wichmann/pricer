# Phase DB2.5 Files Changed

## Added
- `docs/DB2_5_USDA_CLUSTERING.md`
- `db/migrations/005_db2_5_usda_food_cluster_candidates.sql`
- `functions/src/db/usda/cluster_candidate_parser.js`
- `functions/src/db/usda/cluster_candidate_repository.js`
- `functions/src/db/usda/cluster_candidate_batch.js`
- `functions/src/db/usda/cluster_candidate_reports.js`
- `functions/src/db/usda/cluster_materialization_preview.js`
- `functions/src/db/usda/cluster_review_service.js`
- `functions/src/db/usda/ingredient_nutrition_mapping_suggestions.js`
- `functions/src/db/usda/ingredient_nutrition_mapping_review_service.js`
- `app/functions/src/db/usda/cluster_candidate_parser.js`
- `app/functions/src/db/usda/cluster_candidate_repository.js`
- `app/functions/src/db/usda/cluster_candidate_batch.js`
- `app/functions/src/db/usda/cluster_candidate_reports.js`
- `app/functions/src/db/usda/cluster_materialization_preview.js`
- `app/functions/src/db/usda/cluster_review_service.js`
- `app/functions/src/db/usda/ingredient_nutrition_mapping_suggestions.js`
- `app/functions/src/db/usda/ingredient_nutrition_mapping_review_service.js`
- `scripts/db2_5_generate_usda_cluster_candidates.js`
- `scripts/db2_5_report_usda_cluster_candidates.js`
- `scripts/db2_5_materialize_usda_clusters_preview.js`
- `scripts/db2_5_review_usda_cluster.js`
- `scripts/db2_5_suggest_ingredient_nutrition_mappings.js`
- `scripts/db2_5_review_ingredient_nutrition_mapping.js`
- `tests/db2_5_usda_clustering.test.js`
- `tests/db2_5_usda_cluster_batch.test.js`
- `tests/db2_5_usda_cluster_reports.test.js`
- `tests/db2_5_usda_cluster_materialization.test.js`
- `tests/db2_5_usda_cluster_review.test.js`
- `tests/db2_5_ingredient_nutrition_mappings.test.js`
- `docs/test_runs/phase_db2_5_2026-04-24.json`
- `db/migrations/008_db2_5_ingredient_nutrition_mappings.sql`

## Updated
- `functions/src/index.js`
- `app/functions/src/index.js`
- `package.json`
- `package-lock.json`
- `tests/run_all.js`
- `docs/DATA_MODEL.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/CURRENT_STATE.md`
- `docs/current_state.json`
- `docs/decision_log.md`
- `CHANGELOG.md`

## Safety Notes
- No Firestore publishing.
- No runtime `ingredient_nutrition_mappings` publishing; DB2.5F writes sidecar-only reviewable suggestions.
- No LLM calls.
- No branded clustering.
- No live app runtime changes.
- No `kolkostruva.bg` ingest changes.

## DB2.5B Addendum
- Added sidecar-only batch generation for `usda_food_cluster_candidates`.
- Batch reads `usda_foods`, checks macro presence in `usda_food_nutrients` / `usda_nutrients`, and writes only candidate records.
- Added dry-run, max-row limit, batch-size, and data-type filter support.

## DB2.5C Addendum
- Added read-only inspection reports over `usda_food_cluster_candidates`.
- Reports summarize source type, review status, collisions, low-confidence rows, missing qualifier structures, score buckets, and ambiguous core-food groups.
- Added JSON CLI output and optional `--out` report file support.

## DB2.5D Addendum
- Added `usda_food_clusters` and `usda_food_cluster_members` preview tables.
- Added deterministic materialization preview from candidate groups into proposed clusters and members.
- Added dry-run and non-dry-run CLI support with idempotent upserts and approved/rejected review-status preservation.

## DB2.5E Addendum
- Added review provenance fields and append-only review history for proposed USDA clusters.
- Added review queue, detail, and decision helpers.
- Added CLI actions for listing, showing, approving, rejecting, and marking clusters as needing split/merge.

## DB2.5F Addendum
- Added sidecar-only ingredient nutrition mapping suggestions from approved USDA clusters to Pricer ingredients.
- Added mapping review history and CLI actions for listing, showing, approving, rejecting, and marking mappings as needs-review.
- Suggestions use deterministic exact-name, alias, and state-aware matching only; they never approve mappings automatically.
- Approved/rejected mapping records are preserved on repeated suggestion runs.
