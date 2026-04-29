# DB4 Canonical Recipes

Date: 2026-04-25
Status: IMPLEMENTED - POSTGRES SIDECAR ONLY

## Scope

DB4A creates the first canonical Pricer recipe layer in Postgres. It stores fixture/seed recipes and links each recipe ingredient line to an existing DB3A `ingredients.ingredient_id`.

DB4B calculates previewable recipe nutrition profile candidates from recipe ingredient gram quantities and approved DB3D ingredient nutrition profiles.

DB4C adds the Postgres-only review workflow that promotes reviewed recipe nutrition candidates into approved recipe nutrition profiles.

DB4D adds read-only recipe quality and readiness reporting across canonical recipes, recipe ingredients, approved recipe nutrition profiles, approved ingredient nutrition profiles, approved ingredient-product mappings, and DB5C ingredient gap candidates.

DB4 does not call an LLM, publish to Firestore, ingest external recipe sources, create ingredients automatically, run a meal planner, or change product/search/shopping/basket runtime behavior.

## Architecture Chain

```text
ingredients
-> recipes
-> recipe_ingredients
   + ingredient_nutrition_profiles (approved)
-> recipe_nutrition_profile_candidates
-> recipe_nutrition_profiles
-> DB4D recipe quality reports
   + ingredient_product_mappings (approved)
   + ingredient_gap_candidates
```

Recipe ingredient lines reference canonical ingredients by `ingredient_id` and preserve `ingredient_key_snapshot` for review/audit clarity. No recipe table stores USDA FDC IDs.

## Migration

```text
db/migrations/012_db4a_canonical_recipes.sql
db/migrations/013_db4b_recipe_nutrition_profile_candidates.sql
db/migrations/014_db4c_recipe_nutrition_profiles.sql
```

Creates:

- `recipes`
- `recipe_ingredients`
- `recipe_steps`
- `recipe_nutrition_profile_candidates`
- `recipe_nutrition_profiles`
- `recipe_nutrition_profile_review_history`

Supported `review_status` values:

```text
draft
active
rejected
needs_review
```

Recipe nutrition profile candidates support:

```text
candidate
approved
rejected
needs_review
```

Approved recipe nutrition profiles support:

```text
approved
rejected
needs_review
superseded
```

## Repository

```text
functions/src/db/recipes/recipe_repository.js
app/functions/src/db/recipes/recipe_repository.js
functions/src/db/recipes/recipe_nutrition_profiles.js
app/functions/src/db/recipes/recipe_nutrition_profiles.js
functions/src/db/recipes/recipe_nutrition_profile_review_service.js
app/functions/src/db/recipes/recipe_nutrition_profile_review_service.js
functions/src/db/recipes/recipe_quality_reports.js
app/functions/src/db/recipes/recipe_quality_reports.js
```

Supported behavior:

- upsert recipe by `recipe_key`
- upsert recipe ingredients by deterministic line IDs
- upsert recipe steps by deterministic step IDs
- get recipe detail with ingredients and steps
- list recipes by `review_status`
- search by normalized title
- lookup existing ingredients by `ingredient_key`
- explicit no-delete guard for recipes
- stable IDs preserved on upsert
- generate recipe nutrition profile candidates from approved ingredient profiles
- sum kcal, protein, fat, carbs, fiber, sugar, and sodium by `quantity_grams`
- compute per-serving nutrition using recipe servings, defaulting to `1`
- track missing ingredient nutrition inputs and source profile IDs
- upsert profile candidates idempotently by `recipe_id`
- preserve existing profile candidate `review_status` on regeneration
- list recipe nutrition candidates by review status
- show candidate detail with recipe context, ingredient lines, missing nutrition ids, and review history
- approve a candidate into `recipe_nutrition_profiles`
- reject or mark a candidate `needs_review`
- append every review decision to `recipe_nutrition_profile_review_history`
- supersede an existing approved profile when a new candidate is approved for the same recipe
- prevent accidental duplicate approval from the same candidate
- build read-only recipe quality reports from canonical recipe, ingredient, nutrition, product-mapping, and ingredient-gap tables
- compute deterministic readiness metrics per recipe:
  - `ingredient_match_rate`
  - `grams_coverage_rate`
  - `nutrition_coverage_rate`
  - `product_coverage_rate`
  - `has_approved_recipe_nutrition`
- classify deterministic readiness states:
  - `dormant`
  - `needs_ingredient_mapping`
  - `needs_grams`
  - `needs_nutrition`
  - `needs_product_mapping`
  - `usable`
  - `meal_plan_ready`
- list gap-driven review targets without mutating canonical recipes

## CLIs

```powershell
npm run db4a:seed-recipes -- --dry-run --json
npm run db4a:seed-recipes -- --limit=100 --json --out=tmp/db4a_recipe_seed_report.json
npm run db4b:generate-recipe-nutrition-profiles -- --dry-run --json
npm run db4b:generate-recipe-nutrition-profiles -- --recipe=chicken_rice_bowl --json --out=tmp/db4b_recipe_profiles.json
npm run db4c:review-recipe-nutrition-profile -- --review-status=candidate --json
npm run db4c:review-recipe-nutrition-profile -- --candidate-id=recipe_nutrition_profile_candidate:recipe_chicken_rice_bowl --decision=approved --reviewed-by=reviewer --reason="approved fixture profile"
npm run db4d:report-recipe-quality -- --json
npm run db4d:report-recipe-quality -- --status=usable --missing-products --out=tmp/db4d_recipe_quality.json
```

Fixture source:

```text
data/seeds/recipes_seed.json
```

The initial fixture covers chicken rice bowl, tomato cucumber salad, apple milk bowl, pork potato stew, beef rice skillet, mushroom rice, and green bean chicken plate. Every ingredient key in the fixture must already exist in DB3A ingredients.

Seed summary fields:

- `recipes_seen`
- `recipes_valid`
- `recipes_skipped_missing_ingredients`
- `ingredients_linked`
- `steps_written`
- `upserted`
- `errors`

Recipes with missing ingredient links are skipped instead of creating ingredients.

DB4B nutrition profile summary fields:

- `recipes_seen`
- `recipes_with_profiles`
- `recipes_missing_data`
- `ingredients_missing_total`
- `upserted`
- `errors`

Recipes with at least one valid `quantity_grams` row and approved ingredient profile receive a candidate. Recipes with zero valid nutrition inputs are reported and skipped.

Confidence is deterministic:

- `high` when all recipe ingredient rows have nutrition input
- `medium` when more than 70% have nutrition input
- `low` otherwise

DB4C review output is intentionally review/provenance only. Approving a candidate copies the DB4B nutrition totals, per-serving values, counts, missing ingredient ids, source ingredient profile ids, confidence, generation method, and rules version into an approved recipe profile. A second approved profile for the same recipe supersedes the previous approved profile before inserting the replacement.

DB4D recipe quality reporting is read-only. It does not recompute or publish canonical state; it inspects the current canonical recipe graph and reports:

- total recipes
- recipes by `review_status`
- recipes by stored `usability_status`
- recipes by computed readiness status
- dormant / ingredient-mapping / nutrition / usable / meal-plan-ready recipe buckets
- ingredient lines missing matched canonical ingredients
- ingredient lines missing `quantity_grams`
- ingredient lines missing approved ingredient nutrition
- ingredient lines missing approved product mappings
- recipes with and without approved recipe nutrition profiles
- top `ingredient_gap_candidates` by occurrence
- suggested next review targets

DB4D readiness remains deliberately conservative:

- `< 0.4` ingredient match rate -> `dormant`
- `< 0.7` ingredient match rate -> `needs_ingredient_mapping`
- otherwise missing grams -> `needs_grams`
- otherwise missing approved recipe nutrition or full ingredient nutrition coverage -> `needs_nutrition`
- otherwise product coverage `< 0.7` -> `needs_product_mapping`
- otherwise product coverage `< 1.0` -> `usable`
- full product coverage -> `meal_plan_ready`

## Boundaries

DB4 deliberately does not:

- write Firestore
- call an LLM
- ingest external recipe sources
- create ingredients automatically
- use USDA FDC IDs in recipe ingredients
- map recipes directly to USDA rows
- run meal planning
- run basket optimization
- publish runtime recipe or nutrition read models
- change product search, shopping lists, basket planning, price lookup, watchlists, or mobile app behavior
