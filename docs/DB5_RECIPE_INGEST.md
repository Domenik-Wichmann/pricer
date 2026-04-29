# DB5 Recipe Ingest Staging

Date: 2026-04-25
Status: DB5C IMPLEMENTED - POSTGRES SIDECAR ONLY

## Scope

DB5A creates rich recipe ingest staging tables for future LLM-assisted extraction and review. It captures raw recipe input, staged recipe metadata, staged ingredients, steps, tools, methods, tags, state changes, substitution hints, and quality signals.

DB5A does not call an LLM, write Firestore, create canonical recipes, create ingredients, run a meal planner, use user crowdsourcing, or change product/search/shopping/basket/runtime behavior.

DB5B adds bounded LLM-assisted extraction from `recipe_ingest_jobs.raw_text` into the DB5A staging tables. LLM output is strict-JSON validated, matched deterministically against existing DB3A ingredients, and written only to `recipe_ingest_*` staging tables.

DB5C adds staged recipe review and canonical promotion with usability-state tracking. Promotion may create canonical recipes even when some ingredients are still unmatched, but runtime eligibility stays gated by stored usability metrics instead of canonical existence alone.

## Architecture

```text
raw recipe input
-> recipe_ingest_jobs
-> DB5B LLM extraction JSON
-> schema validation
-> deterministic existing-ingredient match suggestions
-> recipe_ingest_staged_recipes
   -> recipe_ingest_staged_ingredients
   -> recipe_ingest_staged_steps
   -> recipe_ingest_staged_tools
   -> recipe_ingest_staged_methods
   -> recipe_ingest_staged_tags
   -> recipe_ingest_staged_state_changes
   -> recipe_ingest_staged_substitution_hints
   -> recipe_ingest_staged_quality_signals
-> DB5C review / promotion
-> canonical recipes with usability_status and quality metrics
   -> ingredient_gap_candidates
   -> recipe_promotion_history
```

The staging layer is intentionally separate from DB4 canonical recipes. `matched_ingredient_id` is nullable and may reference an existing DB3A ingredient, but DB5A never creates ingredients.

DB5C keeps a second boundary: a canonical recipe may exist while still being unusable for downstream features. `recipes.usability_status` is the explicit gate for later meal-planning or runtime recipe surfaces.

## Migration

```text
db/migrations/015_db5a_rich_recipe_ingest_staging.sql
db/migrations/016_db5b_recipe_ingest_llm_extraction_status.sql
db/migrations/018_db5c_recipe_promotion_usability.sql
```

Creates:

- `recipe_ingest_jobs`
- `recipe_ingest_staged_recipes`
- `recipe_ingest_staged_ingredients`
- `recipe_ingest_staged_steps`
- `recipe_ingest_staged_tools`
- `recipe_ingest_staged_methods`
- `recipe_ingest_staged_tags`
- `recipe_ingest_staged_state_changes`
- `recipe_ingest_staged_substitution_hints`
- `recipe_ingest_staged_quality_signals`

DB5B also extends `recipe_ingest_jobs.status` to allow `extracting` during bounded extraction work.

DB5C extends canonical recipe storage with:

- `recipes.usability_status`
- `recipes.ingredient_match_rate`
- `recipes.nutrition_coverage_rate`
- `recipes.product_coverage_rate`
- `recipes.last_quality_computed_at`
- nullable `recipe_ingredients.matched_ingredient_id`
- `ingredient_gap_candidates`
- `recipe_promotion_history`

## Repository

```text
functions/src/db/recipes/recipe_ingest_staging_repository.js
app/functions/src/db/recipes/recipe_ingest_staging_repository.js
```

Supported behavior:

- create recipe ingest jobs while preserving raw text and raw JSON
- insert staged recipe bundles with rich child rows
- get staged recipe detail with job and all child tables
- list staged recipes by staged review status and ingest job status
- search staged recipes by proposed key and titles
- update staged recipe review status
- reject delete attempts for staging rows
- keep staging writes out of canonical `recipes`, canonical `recipe_ingredients`, and `ingredients`

## DB5C Promotion Service

```text
functions/src/db/recipes/recipe_ingest_promotion_service.js
app/functions/src/db/recipes/recipe_ingest_promotion_service.js
```

Behavior:

- loads full staged recipe bundles by `job_id` or `staged_recipe_id`
- computes `total_ingredients`, `matched_ingredients`, `ingredient_match_rate`, `nutrition_coverage_rate`, and `product_coverage_rate`
- promotes staged recipes into canonical `recipes`, `recipe_ingredients`, and `recipe_steps` even when some ingredient lines remain unmatched
- preserves unmatched canonical recipe lines with nullable `ingredient_id` and nullable `matched_ingredient_id`
- upserts `ingredient_gap_candidates` for unmatched staged ingredient names and increments `occurrences` on rerun
- appends every review decision into `recipe_promotion_history`
- keeps promotion idempotent by upserting canonical rows from stable `recipe_key`, recipe-line ids, and recipe-step ids
- never deletes staged rows and never auto-creates ingredients

Deterministic usability states:

- `draft`
- `dormant`
- `needs_ingredient_mapping`
- `needs_nutrition`
- `usable`
- `meal_plan_ready` (reserved for later)

DB5C classification rules:

- `total_ingredients == 0` -> promotion is rejected as structurally invalid
- `ingredient_match_rate < 0.4` -> `dormant`
- `0.4 <= ingredient_match_rate < 0.7` -> `needs_ingredient_mapping`
- `ingredient_match_rate >= 0.7` and no approved ingredient nutrition coverage -> `needs_nutrition`
- `ingredient_match_rate >= 0.7` and approved ingredient nutrition exists -> `usable`

Key principle:

- canonical existence does not imply runtime eligibility
- downstream runtime work should read `recipes.usability_status` rather than assuming every canonical recipe is ready

## DB5B Extraction Modules

```text
functions/src/prompts/recipe_ingest/extract_recipe_v1.js
app/functions/src/prompts/recipe_ingest/extract_recipe_v1.js

functions/src/db/recipes/recipe_extraction_schema.js
app/functions/src/db/recipes/recipe_extraction_schema.js

functions/src/db/recipes/recipe_llm_extraction.js
app/functions/src/db/recipes/recipe_llm_extraction.js
```

Behavior:

- builds a strict-JSON-only recipe extraction prompt
- reads `recipe_ingest_jobs` by `job_id` or job `status`
- marks jobs `extracting`, then `staged` or `failed`
- rejects invalid JSON, missing recipe titles, and empty ingredient lists
- stores raw LLM response in `recipe_ingest_jobs.raw_json.db5b`
- stores parsed extraction provenance in staged recipe `extraction_json.db5b`
- matches ingredients by existing ingredient key, normalized name, or alias
- leaves unmatched/low-confidence ingredients staged with `matched_ingredient_id = null`
- avoids duplicate staged bundles for the same job unless `force` is used
- never writes canonical recipes or creates ingredients

## Seed CLI

```powershell
npm run db5a:seed-recipe-ingest-staging -- --dry-run --json
npm run db5a:seed-recipe-ingest-staging -- --limit=100 --json --out=tmp/db5a_recipe_ingest_staging_report.json
```

Fixture source:

```text
data/seeds/recipe_ingest_staging_seed.json
```

Initial fixtures:

- chicken rice bowl
- tomato cucumber salad
- pork potato stew

Seed summary fields:

- `jobs_seen`
- `jobs_created`
- `staged_recipes_created`
- `staged_ingredients_created`
- `staged_steps_created`
- `staged_tools_created`
- `staged_methods_created`
- `staged_tags_created`
- `staged_state_changes_created`
- `staged_substitutions_created`
- `staged_quality_signals_created`
- `errors`

## DB5B Extraction CLI

```powershell
npm run db5b:extract-recipe-to-staging -- --status=pending --limit=10 --json
npm run db5b:extract-recipe-to-staging -- --job-id=recipe_ingest_job:example --dry-run --json
npm run db5b:extract-recipe-to-staging -- --job-id=recipe_ingest_job:example --force --json --out=tmp/db5b_recipe_extraction_report.json
```

Summary fields:

- `jobs_seen`
- `jobs_extracted`
- `jobs_staged`
- `jobs_failed`
- `skipped_existing`
- `ingredients_matched`
- `ingredients_unmatched`
- `validation_errors`
- `llm_errors`
- `errors`

## DB5C Promotion CLI

```powershell
npm run db5c:review-and-promote-recipe -- --list --status=staged --json
npm run db5c:review-and-promote-recipe -- --job-id=recipe_ingest_job:example --json
npm run db5c:review-and-promote-recipe -- --job-id=recipe_ingest_job:example --decision=approved --json --out=tmp/db5c_recipe_promotion_report.json
```

Output fields include:

- `ingredient_match_rate`
- `matched_ingredients`
- `total_ingredients`
- `resulting usability_status`
- `gap candidates created`

## Boundaries

DB5A deliberately does not:

- write Firestore
- call an LLM
- write canonical `recipes`
- write canonical `recipe_ingredients`
- create canonical ingredients
- run meal planning
- ingest user crowdsourcing
- publish runtime recipe read models
- change product search, shopping lists, basket planning, price lookup, watchlists, or mobile app behavior

DB5B keeps the same boundary. It may call an LLM for extraction, but the only permitted write target is the DB5A Postgres staging surface.

DB5C keeps promotion Postgres-only and review-driven:

- no LLM calls
- no Firestore writes
- no runtime publishing
- no ingredient auto-creation
- no product/search/shopping/basket changes
- no deletion of staged review evidence
