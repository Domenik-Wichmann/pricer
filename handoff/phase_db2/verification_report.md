# Verification Report

## Commands run
- `npm run db:health`
- `npm run db:migrate`
- `npm run test:db2`
- `npm test`
- `npm run validate:docs`

## Results
- Passed: `npm run db:health`
  - Postgres was not configured; health check skipped safely with local startup guidance.
- Passed: `npm run db:migrate`
  - Postgres was not configured; migrations skipped safely with local startup guidance for port `5433`.
- Passed: `npm run test:db2`
  - `DB2 USDA macro import tests: 6 passed, 0 failed, 6 total`
  - Fixture coverage includes malformed USDA food, nutrient, food-nutrient, and food-portion rows.
- Passed: `npm test`
  - Full test suite passed, including DB1 and DB2 sidecar tests and existing product/shopping/basket suites.
- Passed: `npm run validate:docs`
  - JSON docs parse successfully.
- Passed: `node -e "const f=require('./functions/src'); const a=require('./app/functions/src'); console.log(f.USDA_MACRO_NUTRIENT_IDS.length, a.USDA_MACRO_NUTRIENT_IDS.length)"`
  - Both backend export surfaces expose DB2 USDA macro helpers.
- Passed: `npm run import:usda:macros`
  - Full local USDA macro import completed against local Postgres on port `5433`.
  - Imported `2,085,331` foods, `9` nutrients, `12,797,082` macro food nutrient rows, and `47,173` portions.
  - Skipped-row metadata: `invalid_food_rows=9`, `invalid_food_portion_rows=273`, `orphan_food_nutrient_rows=7`, `non_macro_nutrient_rows_skipped=14297407`.

## Full Import Status
- Full USDA macro import was run locally and completed.
- Re-run command:

```powershell
docker compose up -d postgres
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db:migrate
npm run import:usda:macros
```

## Sidecar Safety Notes
- DB2 does not rewrite `phase1/store.js`.
- DB2 does not change product ingest behavior.
- DB2 does not remove Firestore usage.
- DB2 does not move canonical products or ingredients.
- DB2 does not import Open Food Facts or recipes.
- DB2 does not call an LLM.
- DB2 does not expose app-facing nutrition.
- DB2 records malformed source rows as skipped-row metadata instead of crashing the import.
