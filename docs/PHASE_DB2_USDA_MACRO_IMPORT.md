# CODEX TASK - PHASE DB2 USDA MACRO IMPORT

## Mission

Implement **DB2: USDA macro-only Postgres import**.

DB2 builds on DB1 Postgres sidecar foundation.

DB2 must import a **minimal, useful subset** of USDA / FoodData Central into Postgres for ingredient nutrition mapping and future recipe macro calculations.

This phase is **Postgres-only**.

Do not change live app runtime behavior.

---

# Required reading first

Read:

* `docs/PHASE_DB0_POSTGRES_TRANSITION_ARCHITECTURE.md`
* `docs/implementation/PHASE_DB1_POSTGRES_FOUNDATION.md`
* `docs/DATA_MODEL.md`
* `docs/ARCHITECTURE.md`
* `docs/CURRENT_STATE.md`
* `db/migrations/001_db1_import_metadata.sql`
* `functions/src/db/`
* `app/functions/src/db/`
* `datasets/usda/`

---

# Hard boundaries

## DB2 MUST NOT

* change kolkostruva live ingest
* change Firestore runtime behavior
* change product search
* change basket behavior
* import Open Food Facts yet
* import recipes yet
* import all USDA nutrient rows blindly if avoidable
* call an LLM
* publish nutrition into app-facing runtime yet
* move canonical products or ingredients into Postgres

## DB2 MUST

* use DB1 migration tooling
* add USDA-specific Postgres schema
* import minimal macro nutrition data
* preserve USDA source IDs
* preserve import metadata/provenance
* be idempotent or safely repeatable
* support local Postgres on port `5433`
* include tests
* mirror backend code under:

  * `functions/src/...`
  * `app/functions/src/...`

---

# Target data source

USDA/FoodData Central download under:

```text
datasets/usda/
```

Codex must inspect the real folder structure and use actual paths.

Known likely relevant files include:

* `food.csv`
* `nutrient.csv`
* `food_nutrient.csv`
* `food_portion.csv`
* `measure_unit.csv`
* `food_category.csv`
* maybe `foundation_food.csv`
* maybe `sr_legacy_food.csv`
* maybe `survey_fndds_food.csv`
* maybe `branded_food.csv`

Do not assume exact paths without inspecting.

---

# Macro nutrients to import

At minimum import nutrient rows for:

```text
1008 = Energy, kcal
1003 = Protein, g
1004 = Total lipid/fat, g
1005 = Carbohydrate by difference, g
1079 = Fiber, total dietary, g
2000 = Total sugars, g
1093 = Sodium, mg
```

Also preserve, if present:

```text
2047 = Energy using Atwater general factors
2048 = Energy using Atwater specific factors
```

But v1 normalized calorie fallback should prefer `1008`.

---

# Required schema

Add migration:

```text
db/migrations/002_db2_usda_macro_import.sql
```

Create minimal USDA tables.

Suggested tables:

## `usda_foods`

Fields:

* `fdc_id` primary key
* `data_type`
* `description`
* `food_category_id`
* `publication_date`
* `raw_json` optional
* `created_at`

## `usda_nutrients`

Fields:

* `nutrient_id` primary key
* `name`
* `unit_name`
* `nutrient_nbr`
* `rank`

## `usda_food_nutrients`

Fields:

* `food_nutrient_id` primary key or source id
* `fdc_id`
* `nutrient_id`
* `amount`
* `derivation_id`
* `data_points`
* `min`
* `max`
* `median`
* `footnote`
* `created_at`

Only import macro nutrient IDs for DB2.

## `usda_food_portions`

Fields:

* `id` primary key
* `fdc_id`
* `amount`
* `measure_unit_id`
* `portion_description`
* `modifier`
* `gram_weight`

## `usda_measure_units`

Fields:

* `measure_unit_id` primary key
* `name`

## `usda_food_categories`

Fields:

* `food_category_id` primary key
* `code`
* `description`

## `usda_import_runs`

Fields:

* `usda_import_run_id`
* `import_batch_id`
* `dataset_root`
* `status`
* `foods_imported`
* `nutrients_imported`
* `food_nutrients_imported`
* `portions_imported`
* `started_at`
* `completed_at`
* `error_message`

Adjust exact names only if repo conventions require.

---

# Import behavior

Create a script like:

```text
scripts/import_usda_macros.js
```

Add package script:

```text
npm run import:usda:macros
```

Script must:

1. resolve USDA dataset path
2. register or reuse source dataset metadata
3. register source files and row counts/checksums where practical
4. create import batch record
5. import lookup tables:

   * food categories
   * measure units
   * nutrients
6. import foods
7. import food portions
8. import food nutrients filtered to macro nutrient IDs only
9. update import run counts/status
10. be safely repeatable

---

# Performance requirements

USDA data is large.

Do not load huge CSVs entirely into memory if avoidable.

Use streaming CSV parsing or batch processing.

If full `food_nutrient.csv` scan is required, filter while streaming and insert in batches.

Document expected runtime and memory behavior.

---

# Repository modules

Add USDA import/support modules under both trees if needed:

```text
functions/src/db/usda/
app/functions/src/db/usda/
```

Possible modules:

* `macro_constants.js`
* `usda_schema.js`
* `usda_importer.js`
* `usda_repository.js`

Keep runtime independent from app endpoints for now.

---

# Tests

Add tests for:

* macro nutrient ID constants
* CSV row normalization
* idempotent import behavior on small fixture data
* repository insert/read for USDA macro data
* migration includes required tables
* import script can run against fixture dataset

Suggested:

```text
tests/db2_usda_macro_import.test.js
```

Use a tiny fixture dataset, not the full USDA dataset, for unit tests.

Do not require full 3GB USDA import for normal `npm test`.

Add script:

```text
npm run test:db2
```

---

# Docs

Create/update:

* `docs/implementation/PHASE_DB2_USDA_MACRO_IMPORT.md`
* `docs/DATA_MODEL.md`
* `docs/ARCHITECTURE.md`
* `docs/CURRENT_STATE.md`
* `docs/decision_log.md`
* `docs/TEST_REGISTRY.md`
* `docs/test_registry.json`
* `CHANGELOG.md`

Include:

* exact USDA files used
* macro nutrient IDs
* join map
* import command
* local Postgres instructions
* what DB2 does not do
* DB3 readiness notes

---

# Required verification

Run and report:

```text
npm run db:health
npm run db:migrate
npm run test:db2
npm test
npm run validate:docs
```

If running the full USDA import is too large for normal verification, run fixture import in tests and document the full import command separately.

If running full import locally, report counts.

---

# Required final report

Return:

## Files changed

## New tables

## New scripts

## USDA files inspected

## Import strategy

## Macro nutrient IDs used

## Commands run

## Test results

## Full import status

## What DB2 deliberately did not do

## DB3 readiness notes

## Operator actions

---

# Final reminder

DB2 is only USDA macro import.

No Open Food Facts.
No recipe ingest.
No app runtime nutrition publishing.
No Firestore replacement.
No live product-path changes.
