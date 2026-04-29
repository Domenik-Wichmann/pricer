# Phase DB2 USDA Macro Import Implementation

Date: 2026-04-24
Status: IMPLEMENTED AND VERIFIED WITH FIXTURE DATA
Scope: USDA/FoodData Central macro-only Postgres sidecar import

## Summary

DB2 adds a Postgres-only USDA macro import layer on top of DB1. It does not publish nutrition to Firestore, does not change app runtime reads, and does not touch the live `kolkostruva.bg` product pipeline.

## USDA Files Used

Full source root:

```text
datasets/usda/FoodData_Central_csv_2025-12-18/FoodData_Central_csv_2025-12-18/
```

DB2 importer reads:

```text
food.csv
nutrient.csv
food_nutrient.csv
food_portion.csv
measure_unit.csv
food_category.csv
```

The actual `food.csv` header is:

```text
fdc_id,data_type,description,food_category_id,publication_date
```

At least branded rows can store source category text such as `Oils Edible` in `food_category_id`, so DB2 preserves that column as text in `usda_foods`.

## Macro Nutrient IDs

DB2 imports only these `nutrient_id` values from `nutrient.csv` and `food_nutrient.csv`:

```text
1008 Energy, kcal
1003 Protein, g
1004 Total lipid/fat, g
1005 Carbohydrate by difference, g
1079 Fiber, total dietary, g
2000 Total sugars, g
1093 Sodium, mg
2047 Energy using Atwater general factors, kcal
2048 Energy using Atwater specific factors, kcal
```

Calorie projections should prefer `1008` in later runtime-safe nutrition layers.

## Join Map

```text
food.fdc_id
  -> food_nutrient.fdc_id
  -> food_portion.fdc_id

nutrient.id
  -> food_nutrient.nutrient_id

measure_unit.id
  -> food_portion.measure_unit_id

food_category.id
  -> lookup table for numeric category ids where source rows use numeric ids
```

## New Tables

Migration:

```text
db/migrations/002_db2_usda_macro_import.sql
```

Tables:

```text
usda_food_categories
usda_measure_units
usda_nutrients
usda_foods
usda_food_nutrients
usda_food_portions
usda_import_runs
```

Additive patch migration:

```text
db/migrations/003_db2_usda_import_run_metadata.sql
```

This adds `usda_import_runs.metadata_json` for row-level source quality stats.

## Row-Level Validation

Real USDA source files can contain incomplete rows. DB2 treats these as source-quality skips, not fatal importer errors.

Skipped row counters are stored in `usda_import_runs.metadata_json`:

```json
{
  "invalid_food_rows": 0,
  "invalid_nutrient_rows": 0,
  "invalid_food_nutrient_rows": 0,
  "invalid_food_portion_rows": 0,
  "non_macro_nutrient_rows_skipped": 0,
  "warnings": [],
  "sample_invalid_rows": []
}
```

Validation rules:

- `food.csv`: requires valid `fdc_id` and nonblank `description`.
- `nutrient.csv`: requires macro nutrient id and nonblank `name`.
- `food_nutrient.csv`: requires valid source id, `fdc_id`, macro `nutrient_id`, and numeric `amount`.
- `food_portion.csv`: requires valid source id, `fdc_id`, and numeric `gram_weight`.

The importer logs one concise skipped-row summary at the end and stores up to five invalid row samples for debugging. It does not log every invalid source row.

Local full-import verification on April 24, 2026 completed with:

```text
foods_imported: 2,085,331
nutrients_imported: 9
food_nutrients_imported: 12,797,082
portions_imported: 47,173
invalid_food_rows: 9
invalid_food_portion_rows: 273
orphan_food_nutrient_rows: 7
non_macro_nutrient_rows_skipped: 14,297,407
```

## Import Command

Local Postgres defaults expose the container on host port `5433`.

```powershell
docker compose up -d postgres
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db:migrate
npm run import:usda:macros
```

Optional arguments:

```powershell
npm run import:usda:macros -- --dataset-root C:\dev\Pricer\datasets\usda\FoodData_Central_csv_2025-12-18\FoodData_Central_csv_2025-12-18 --batch-size 1000
```

## Runtime Boundary

DB2 is sidecar-only. It does not:

- change `phase1/store.js`
- change Firestore runtime behavior
- change product search
- change shopping-list resolution
- change price lookup or basket behavior
- import Open Food Facts
- import recipes
- call an LLM
- publish nutrition into app-facing runtime documents

## Performance Notes

The importer streams CSV rows and writes batched upserts. `food_nutrient.csv` is scanned once and filtered to macro nutrient IDs before insert. Invalid rows are skipped before normalization so one incomplete source row cannot crash the full import. Normal `npm test` uses a tiny fixture dataset under `tests/fixtures/usda_macro/` and does not require the full USDA import.

## DB3 Readiness

DB3 can build on the same DB1 metadata tables, migration runner, and sidecar repository pattern to add Open Food Facts product/barcode imports. DB3 should remain sidecar-only until explicit runtime-safe read models are reviewed and published in a later phase.
