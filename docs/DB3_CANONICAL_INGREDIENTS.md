# DB3A Canonical Pricer Ingredient Schema

Date: 2026-04-24
Status: IMPLEMENTED - POSTGRES SIDECAR ONLY

## Scope

DB3A creates the canonical Pricer ingredient table in Postgres so reviewed USDA clusters and approved ingredient nutrition mappings have a stable Pricer ingredient target.

It does not publish to Firestore, ingest recipes, call an LLM, import branded products, or change product/search/shopping/basket runtime behavior.

## Architecture Chain

```text
approved USDA clusters
-> approved ingredient_nutrition_mappings
-> ingredients
-> ingredient nutrition profiles later
```

The `ingredients` table is Pricer-owned canonical ingredient truth. It is not a raw USDA table and it does not store FDC IDs.

## Migration

```text
db/migrations/009_db3a_canonical_ingredients.sql
```

Creates `ingredients` with stable `ingredient_id`, unique `ingredient_key`, localized names, normalized search name, unit defaults, optional density/piece/yield fields, JSON metadata fields, review status, provenance, and timestamps.

Supported `review_status` values:

```text
draft
active
rejected
needs_review
```

## Repository

```text
functions/src/db/ingredients/ingredient_repository.js
app/functions/src/db/ingredients/ingredient_repository.js
```

Supported behavior:

- create ingredient
- upsert by `ingredient_key`
- get by `ingredient_id`
- get by `ingredient_key`
- search by normalized name and aliases
- list by `review_status`
- explicit no-delete guard
- stable IDs preserved on upsert

## Seed CLI

```powershell
npm run db3a:seed-ingredients -- --dry-run --limit=1000 --json
npm run db3a:seed-ingredients -- --json --out=tmp/db3a_ingredients_seed_report.json
```

Fixture source:

```text
data/seeds/ingredients_seed.json
```

The initial seed covers apple, dried apple, apple juice, tomato, cucumber, potato, rice, rice flour, whole milk, skim milk, chicken breast, pork, beef, mushroom, shiitake mushroom, green beans, and canned green beans.

## DB3B Inspection Reports

DB3B adds read-only ingredient inspection reporting:

```text
functions/src/db/ingredients/ingredient_reports.js
app/functions/src/db/ingredients/ingredient_reports.js
scripts/db3b_report_ingredients.js
```

Reports include:

- total ingredients
- summary by `review_status`
- summary by `food_family`
- ingredients missing Bulgarian names
- ingredients missing default or shopping units
- duplicate normalized names
- alias collisions
- ingredients without suggested, approved, or needs-review nutrition mappings
- suggested next review targets

CLI examples:

```powershell
npm run db3b:report-ingredients -- --json
npm run db3b:report-ingredients -- --review-status=active --missing-bg --json
npm run db3b:report-ingredients -- --without-mapping --limit=100 --out=tmp/db3b_ingredient_report.json
```

DB3B is read-only and does not write ingredient, mapping, Firestore, recipe, or runtime data.

## DB3C Nutrition Profile Candidates

DB3C adds previewable per-100g ingredient nutrition profile candidates:

```text
db/migrations/010_db3c_ingredient_nutrition_profile_candidates.sql
functions/src/db/ingredients/ingredient_nutrition_profiles.js
app/functions/src/db/ingredients/ingredient_nutrition_profiles.js
scripts/db3c_generate_ingredient_nutrition_profiles.js
```

Generation reads approved `ingredient_nutrition_mappings` only, joins each mapping's `representative_fdc_id` to USDA macro nutrient rows, and emits per-100g values where available:

```text
kcal
protein_g
fat_g
carbs_g
fiber_g
sugar_g
sodium_mg
```

Each candidate stores `mapping_id`, `cluster_id`, and `representative_fdc_id` provenance plus `source_nutrients_json` for traceability. Upserts are idempotent by `mapping_id` and preserve existing profile candidate `review_status`.

CLI examples:

```powershell
npm run db3c:generate-ingredient-nutrition-profiles -- --dry-run --json
npm run db3c:generate-ingredient-nutrition-profiles -- --limit=1000 --json --out=tmp/db3c_profile_candidates.json
```

DB3C does not publish nutrition to Firestore or runtime app paths.

## DB3D Approved Nutrition Profiles

DB3D adds the review workflow that promotes profile candidates into approved sidecar profiles:

```text
db/migrations/011_db3d_ingredient_nutrition_profiles.sql
functions/src/db/ingredients/ingredient_nutrition_profile_review_service.js
app/functions/src/db/ingredients/ingredient_nutrition_profile_review_service.js
scripts/db3d_review_ingredient_nutrition_profile.js
```

Architecture:

```text
approved ingredient_nutrition_mappings
-> ingredient_nutrition_profile_candidates
-> ingredient_nutrition_profiles
```

Supported review actions:

- list candidate profiles by `review_status`
- show candidate detail and history
- approve a candidate into `ingredient_nutrition_profiles`
- reject a candidate with a reason
- mark a candidate as `needs_review`
- list approved profiles

Approving a new candidate for the same `ingredient_id + mapping_type + default_for_state` supersedes the previous approved profile before inserting the new approved profile. Candidate rows are never deleted, and every decision is appended to `ingredient_nutrition_profile_review_history`.

CLI examples:

```powershell
npm run db3d:review-ingredient-nutrition-profile -- --json
npm run db3d:review-ingredient-nutrition-profile -- --candidate-id=ingredient_nutrition_profile_candidate:mapping:apple_raw --json
npm run db3d:review-ingredient-nutrition-profile -- --candidate-id=ingredient_nutrition_profile_candidate:mapping:apple_raw --decision=approved --reviewed-by=operator --reason="reviewed default raw apple"
npm run db3d:review-ingredient-nutrition-profile -- --candidate-id=ingredient_nutrition_profile_candidate:mapping:apple_raw --decision=rejected --reason="wrong state"
npm run db3d:review-ingredient-nutrition-profile -- --profiles --json
```

DB3D does not publish approved profiles to Firestore or runtime app paths.

## DB3E Ingredient Product Equivalence

DB3E adds a Postgres-only sidecar bridge from canonical ingredients to real purchasable products:

```text
products or future product ingestion rows
-> ingredient_product_candidates
-> ingredient_product_mappings
-> ingredients
```

The migration is:

```text
db/migrations/017_db3e_ingredient_product_equivalence.sql
```

`016` is already occupied by DB5B in this repo history, so DB3E uses the next deterministic migration slot. The DB3E tables remain review surfaces only and are not read by runtime product search, baskets, watchlists, or mobile screens.

Modules and CLIs:

```text
functions/src/db/products/ingredient_product_repository.js
app/functions/src/db/products/ingredient_product_repository.js
functions/src/db/products/ingredient_product_matching.js
app/functions/src/db/products/ingredient_product_matching.js
scripts/db3e_generate_product_ingredient_candidates.js
scripts/db3e_review_product_ingredient_mapping.js
```

Supported behavior:

- insert reviewable product candidates
- generate deterministic ingredient mapping suggestions from normalized names, aliases, food-family hints, and attributes
- upsert suggestions idempotently
- preserve existing approved or rejected mappings on regeneration
- list mappings and approved products by ingredient
- review mappings without auto-approval

CLI examples:

```powershell
npm run db3e:generate-product-ingredient-candidates -- --dry-run --product="product:apple_1kg|Fresh apple 1kg" --ingredient=apple --json
npm run db3e:review-product-ingredient-mapping -- --ingredient=apple --json
npm run db3e:review-product-ingredient-mapping -- --ingredient=apple --product=product:apple_1kg --review-status=approved --mapping-type=exact_match --reviewed-by=operator --reason="reviewed purchasable equivalent"
```

DB3E does not call LLMs, create ingredients, write recipes, publish Firestore records, run sponsored logic, or change runtime app behavior.

## Boundaries

DB3A deliberately does not:

- write Firestore
- publish runtime nutrition
- ingest recipes
- auto-ingest or auto-approve branded products
- map raw USDA foods directly to ingredients
- change product search, shopping lists, basket planning, price lookup, watchlists, or mobile app behavior
