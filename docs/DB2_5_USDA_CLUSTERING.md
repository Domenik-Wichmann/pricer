# DB2.5 USDA Deterministic Cluster Candidate Generation

Date: 2026-04-24
Status: IMPLEMENTED - FIRST PASS
Scope: deterministic cluster candidate generation for USDA Foundation and SR Legacy foods only

## Architecture Boundary

DB2.5 preserves the required chain:

```text
usda_foods
-> usda_food_clusters / usda_food_cluster_candidates
-> ingredient_nutrition_mappings
-> ingredients
```

USDA foods must not map directly to Pricer ingredients. DB2.5 creates candidate cluster records only. It does not write `ingredient_nutrition_mappings`, publish nutrition to Firestore, call an LLM, cluster branded foods, or affect the live `kolkostruva.bg` product runtime.

## Implemented First Pass

Migration:

```text
db/migrations/005_db2_5_usda_food_cluster_candidates.sql
```

Code:

```text
functions/src/db/usda/cluster_candidate_parser.js
functions/src/db/usda/cluster_candidate_repository.js
functions/src/db/usda/cluster_candidate_reports.js
functions/src/db/usda/cluster_materialization_preview.js
functions/src/db/usda/cluster_review_service.js
app/functions/src/db/usda/cluster_candidate_parser.js
app/functions/src/db/usda/cluster_candidate_repository.js
app/functions/src/db/usda/cluster_candidate_reports.js
app/functions/src/db/usda/cluster_materialization_preview.js
app/functions/src/db/usda/cluster_review_service.js
```

Tests:

```text
tests/db2_5_usda_clustering.test.js
tests/db2_5_usda_cluster_batch.test.js
tests/db2_5_usda_cluster_reports.test.js
tests/db2_5_usda_cluster_materialization.test.js
tests/db2_5_usda_cluster_review.test.js
```

## Candidate Table

`usda_food_cluster_candidates`

- `candidate_id`
- `candidate_key`
- `core_food_name`
- `core_food_normalized`
- `source_fdc_id`
- `source_description`
- `source_data_type`
- `source_food_category_id`
- `parsed_qualifiers_json`
- `hard_boundary_signature`
- `representative_score`
- `representative_score_json`
- `confidence`
- `review_status`
- `generation_method`
- `rules_version`
- `source_version`
- `created_at`
- `updated_at`

This is a candidate table, not an approved cluster table. Later DB2.5 phases should promote reviewed candidates into `usda_food_clusters` and `usda_food_cluster_members`.

## Source Eligibility

DB2.5 first pass includes only:

- `foundation_food`
- `sr_legacy_food`

It intentionally excludes:

- `branded_food`
- `survey_fndds_food`
- `experimental_food`
- `sample_food`
- acquisition/sub-sample tables

Branded foods remain product-side for a later Open Food Facts / packaged-product enrichment path.

## Deterministic Parsing

The parser lowercases descriptions, splits comma-separated USDA segments while preserving parenthetical text, and extracts state, form, preservation, cooking method, sugar/salt state, drained/liquid state, skin/bone state, breading, milk fat, grain form/state, meat cut, and obvious species or variety.

Current rules version:

```text
db2_5_usda_cluster_rules_v1
```

Generation method:

```text
deterministic_foundation_sr_legacy_v1
```

## Hard Boundary Rules

Candidate keys include a hard-boundary signature so the first pass does not over-collapse:

- raw vs cooked
- dry/raw grain vs cooked grain
- fruit vs juice vs sauce vs pie filling
- dried vs fresh
- canned drained vs canned solids/liquids
- sweetened vs unsweetened
- salted vs unsalted
- milk fat levels
- meat cut, cooking method, skin, bone, breading
- flour vs kernel/grain
- branded vs generic by excluding branded sources

Examples covered by tests:

- raw apple vs apple juice vs applesauce
- raw rice vs cooked rice vs rice flour
- whole milk vs skim milk
- raw chicken breast vs cooked/braised chicken breast vs breaded chicken tenders
- shiitake mushroom vs generic mushroom
- canned beans drained/rinsed vs canned beans solids/liquids

## Representative Scoring Preview

Representative scoring is only a preview. It does not approve clusters.

Positive factors:

- Foundation food
- SR Legacy food
- macro data present
- simple description
- raw/simple ingredient default

Negative factors:

- added salt
- added sugar
- breaded/prepared forms
- ambiguous NFS/NS descriptions
- restaurant/prepared dish language

Scores produce a coarse confidence of `high`, `medium`, or `low`, and default review statuses of `candidate` or `needs_review`.

`representative_score_json` includes `has_macro_data` so later review tooling can distinguish parsed-food quality from nutrition-coverage quality.

## DB2.5B Batch Generation

DB2.5B adds a sidecar-only batch job that reads eligible USDA foods from Postgres, checks DB2 macro nutrient presence, parses descriptions with the deterministic DB2.5 parser, and idempotently upserts rows into `usda_food_cluster_candidates`.

Code:

```text
functions/src/db/usda/cluster_candidate_batch.js
app/functions/src/db/usda/cluster_candidate_batch.js
scripts/db2_5_generate_usda_cluster_candidates.js
```

NPM commands:

```powershell
npm run test:db2_5_batch
npm run db2_5:generate-usda-candidates -- --dry-run --limit=1000 --batch-size=500
npm run db2_5:generate-usda-candidates -- --data-type=foundation_food --limit=1000
npm run db2_5:generate-usda-candidates -- --data-type=foundation_food --data-type=sr_legacy_food
```

Local Postgres example:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:generate-usda-candidates -- --dry-run --limit=1000
```

Batch summary fields:

- `scanned`
- `eligible`
- `skipped_no_macro_data`
- `skipped_unsupported_data_type`
- `generated`
- `upserted`
- `errors`

The batch uses cursor pagination by `fdc_id`, defaults to `foundation_food` and `sr_legacy_food`, and supports explicit `--data-type` filters for inspection. Unsupported data types are skipped if explicitly requested.

## Idempotency Behavior

`candidate_id` is deterministic:

```text
usda_cluster_candidate:{fdc_id}:{rules_version}
```

The repository writes with `ON CONFLICT (candidate_id) DO UPDATE`, so rerunning the batch refreshes deterministic parser output without duplicating candidates. The batch does not compute averages, approve representatives, or create cluster memberships.

## DB2.5C Candidate Inspection Reports

DB2.5C adds read-only reporting over `usda_food_cluster_candidates`. It exists to help review candidate quality before any approved `usda_food_clusters`, cluster memberships, or ingredient nutrition mappings are created.

Code:

```text
functions/src/db/usda/cluster_candidate_reports.js
app/functions/src/db/usda/cluster_candidate_reports.js
scripts/db2_5_report_usda_cluster_candidates.js
```

NPM commands:

```powershell
npm run test:db2_5_reports
npm run db2_5:report-usda-candidates -- --limit=100
npm run db2_5:report-usda-candidates -- --json --limit=100
npm run db2_5:report-usda-candidates -- --candidate-key=apple__state_raw --json
npm run db2_5:report-usda-candidates -- --core-food=apple --min-confidence=0.75
npm run db2_5:report-usda-candidates -- --json --out=tmp/usda_cluster_candidate_report.json
```

Report sections:

- total candidate count
- distinct candidate-key count
- summary by `source_data_type`
- summary by `review_status`
- candidate-key collision groups
- hard-boundary-signature collision groups
- low-confidence examples
- candidates missing expected parsed qualifier structure
- representative-score distribution
- top ambiguous `core_food_normalized` values
- recommended next review targets

The report is read-only. Tests use fixture clients, but the production CLI does not write to `usda_food_cluster_candidates`; it only reads sidecar candidate records and optionally writes the report JSON file requested by `--out`.

## DB2.5D Approved Cluster Materialization Preview

DB2.5D adds reviewable, sidecar-only materialization tables for proposed USDA food clusters and proposed cluster members. It still does not approve clusters for runtime nutrition, map USDA foods directly to Pricer ingredients, or publish anything to Firestore.

Migration:

```text
db/migrations/006_db2_5_usda_food_clusters_preview.sql
```

Tables:

```text
usda_food_clusters
usda_food_cluster_members
```

Code:

```text
functions/src/db/usda/cluster_materialization_preview.js
app/functions/src/db/usda/cluster_materialization_preview.js
scripts/db2_5_materialize_usda_clusters_preview.js
```

NPM commands:

```powershell
npm run test:db2_5_materialization
npm run db2_5:materialize-usda-clusters-preview -- --dry-run --limit=1000 --batch-size=500
npm run db2_5:materialize-usda-clusters-preview -- --dry-run --candidate-key=apple__state_raw --json
npm run db2_5:materialize-usda-clusters-preview -- --dry-run --core-food=apple --json
npm run db2_5:materialize-usda-clusters-preview -- --dry-run --json --out=tmp/usda_cluster_materialization_preview.json
```

Materialization behavior:

- reads from `usda_food_cluster_candidates`
- groups by `candidate_key + hard_boundary_signature`
- proposes one `usda_food_clusters` row per deterministic group
- proposes `usda_food_cluster_members` rows for every candidate in the group
- selects a representative by highest `representative_score`
- tie-breaks representatives by Foundation over SR Legacy, higher confidence, shorter `source_description`, then lowest `fdc_id`
- defaults proposed cluster `review_status` to `pending_review`

Member roles:

- `representative`: selected representative row for the group
- `included`: non-representative candidate that shares the candidate key and hard boundary and is not low-confidence / needs-review
- `candidate`: non-representative row that still needs review because confidence or candidate status is weak

Idempotency and review preservation:

- `cluster_id` and `cluster_member_id` are deterministic.
- Cluster upserts use `cluster_key` and refresh deterministic preview fields.
- Existing `approved` or `rejected` cluster `review_status` values are preserved on rerun.
- Member upserts use `(cluster_id, fdc_id)` and refresh deterministic preview membership fields.

Dry-run behavior:

- `--dry-run` returns proposed clusters and members in the command report.
- `--dry-run` writes no cluster or member rows.
- Non-dry-run writes only the sidecar preview tables.

## DB2.5E Cluster Review Workflow

DB2.5E adds deterministic review/adjudication support over proposed `usda_food_clusters` before any ingredient mapping exists.

Migration:

```text
db/migrations/007_db2_5_usda_cluster_review_workflow.sql
```

Schema additions:

- `usda_food_clusters.reviewed_by`
- `usda_food_clusters.reviewed_at`
- `usda_food_clusters.review_decision`
- `usda_food_clusters.review_reason`
- `usda_food_cluster_review_history`

Supported review decisions:

- `pending_review`
- `approved`
- `rejected`
- `needs_split`
- `needs_merge`

Code:

```text
functions/src/db/usda/cluster_review_service.js
app/functions/src/db/usda/cluster_review_service.js
scripts/db2_5_review_usda_cluster.js
```

NPM commands:

```powershell
npm run test:db2_5_review
npm run db2_5:review-usda-cluster -- --list --review-status=pending_review --json
npm run db2_5:review-usda-cluster -- --show --cluster-key=apple__state_raw__hb_state_raw --json
npm run db2_5:review-usda-cluster -- --approve --cluster-key=apple__state_raw__hb_state_raw --reviewed-by=operator --reason="generic raw apple"
npm run db2_5:review-usda-cluster -- --reject --cluster-key=apple__state_raw__hb_state_raw --reviewed-by=operator --reason="over-collapsed"
npm run db2_5:review-usda-cluster -- --needs-split --cluster-key=apple__state_raw__hb_state_raw --reviewed-by=operator --note="separate skin state"
```

Review behavior:

- Updates `usda_food_clusters.review_status` and review provenance fields.
- Appends every decision to `usda_food_cluster_review_history`.
- Never deletes candidates, clusters, or members.
- Never writes `ingredient_nutrition_mappings`.
- Never publishes nutrition to Firestore or runtime read models.
- Rejects invalid transitions; `approved` and `rejected` are terminal in this workflow except for repeating the same decision.
- Supports review queues by `review_status`.
- Supports showing one cluster with its members and review history.

## DB2.5F Ingredient Nutrition Mapping Suggestions

DB2.5F adds deterministic, reviewable suggestions from approved USDA clusters to Pricer ingredients.

Required architecture remains:

```text
usda_foods
-> usda_food_clusters
-> ingredient_nutrition_mappings
-> ingredients
```

DB2.5F still does not map raw `usda_foods` directly to Pricer ingredients. The only eligible source records are `usda_food_clusters` with `review_status = 'approved'`.

Migration:

```text
db/migrations/008_db2_5_ingredient_nutrition_mappings.sql
```

Tables:

- `ingredient_nutrition_mappings`
- `ingredient_nutrition_mapping_review_history`

Important fields:

- `ingredient_id`: string link to the Pricer ingredient catalog; no Postgres foreign key is used because the ingredient catalog is still runtime/flat-store led.
- `cluster_id`: reviewed USDA cluster source.
- `representative_fdc_id`: representative food attached to the approved cluster.
- `default_for_state`: deterministic state such as `raw`, `cooked`, or `dried`.
- `mapping_type`: `default_raw`, `default_cooked`, `alternate_state`, `product_specific`, or `rejected_candidate`.
- `review_status`: `suggested`, `approved`, `rejected`, or `needs_review`.
- `suggestion_reason_json`: deterministic match reason and provenance.

Code:

```text
functions/src/db/usda/ingredient_nutrition_mapping_suggestions.js
functions/src/db/usda/ingredient_nutrition_mapping_review_service.js
app/functions/src/db/usda/ingredient_nutrition_mapping_suggestions.js
app/functions/src/db/usda/ingredient_nutrition_mapping_review_service.js
scripts/db2_5_suggest_ingredient_nutrition_mappings.js
scripts/db2_5_review_ingredient_nutrition_mapping.js
```

Suggestion behavior:

- Reads approved `usda_food_clusters` only.
- Reads the sidecar-accessible `ingredients` relation when present.
- Suggests by conservative deterministic matching only:
  - exact normalized ingredient name match
  - alias match from ingredient alias JSON/array fields
  - limited state-aware partial match when qualifiers are explicit
- Inserts only `suggested` or `needs_review` rows.
- Never writes `approved` automatically.
- Upserts idempotently by `(ingredient_id, cluster_id, default_for_state)`.
- Preserves existing `approved` and `rejected` mappings on rerun.
- Stores match reasons in `suggestion_reason_json`.

Review behavior:

- Allows `suggested`, `approved`, `rejected`, and `needs_review` decisions.
- Appends every decision to `ingredient_nutrition_mapping_review_history`.
- Preserves provenance.
- Never deletes mappings.
- Rejects transitions away from terminal `approved` or `rejected` states.

NPM commands:

```powershell
npm run test:db2_5_mappings
npm run db2_5:suggest-ingredient-nutrition-mappings -- --dry-run --limit=1000 --json
npm run db2_5:suggest-ingredient-nutrition-mappings -- --dry-run --ingredient=apple --json
npm run db2_5:suggest-ingredient-nutrition-mappings -- --dry-run --cluster-key=apple__state_raw__hb_state_raw --json
npm run db2_5:suggest-ingredient-nutrition-mappings -- --dry-run --json --out=tmp/ingredient_nutrition_mapping_suggestions.json
npm run db2_5:review-ingredient-nutrition-mapping -- --list --review-status=suggested --json
npm run db2_5:review-ingredient-nutrition-mapping -- --show --mapping-id=ingredient_nutrition_mapping:ingredient_apple:cluster_apple_raw:raw --json
npm run db2_5:review-ingredient-nutrition-mapping -- --approve --mapping-id=ingredient_nutrition_mapping:ingredient_apple:cluster_apple_raw:raw --reviewed-by=operator --reason="approved reviewed cluster default"
npm run db2_5:review-ingredient-nutrition-mapping -- --reject --mapping-id=ingredient_nutrition_mapping:ingredient_apple:cluster_apple_raw:raw --reviewed-by=operator --reason="not the correct ingredient state"
```

Real DB note:

- DB2.5F assumes a sidecar-readable `ingredients` relation or mirror is available before running the suggestion CLI against a live database.
- The migration intentionally does not create or move the Pricer ingredient catalog; it only stores reviewable nutrition bridge suggestions.

## Non-Goals

DB2.5 does not:

- treat reviewed `usda_food_clusters` as runtime nutrition source truth yet
- publish `usda_food_cluster_members` to runtime consumers
- publish approved mappings to runtime consumers
- auto-approve cluster-to-ingredient nutrition mappings
- call an LLM
- cluster branded foods
- publish nutrition to Firestore
- expose app-facing runtime nutrition
- change product search, shopping, price lookup, or basket behavior
- write to Firestore
- import Open Food Facts
- import recipes
- approve clusters for runtime use
- publish cluster nutrition read models

## Next Step

Next implementation should use reviewed `ingredient_nutrition_mappings` to create ingredient nutrition profile previews. That work should still avoid Firestore/runtime publishing until the profile shape, confidence policy, and fallback behavior are reviewed.
