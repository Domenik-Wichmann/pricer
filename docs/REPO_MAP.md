# Repo Map

Last updated: 2026-05-05

This map is the first stop for feature work. Use it to find the smallest correct edit surface before searching broadly.

## How to Use This Map
- Start with [DATA_MODEL.md](DATA_MODEL.md) for runtime collection shape, Postgres sidecar tables, and ownership boundaries.
- Use this file to find the code, scripts, tests, and docs that own the behavior you are changing.
- If repo reality and this map disagree, trust repo reality, update this map in the same change, and add a decision log entry when the disagreement changes behavior or ownership.
- Keep updates append-friendly: add new areas, ownership notes, or phase links without deleting useful history.
- Prefer targeted `rg` searches inside the directories named here instead of repo-wide wandering.

## Top-Level Index

| Path | Purpose | Look here when |
| --- | --- | --- |
| `AGENTS.md`, `CLAUDE.md` | Agent operating rules | You need repo workflow requirements for future agent sessions. |
| `docs/` | Product, architecture, phase, contract, decision, test, and state docs | You need planned behavior, acceptance criteria, data contracts, test records, or handoff context. |
| `docs/REPO_MAP.md` | This navigation schema | You need to know where code and tests live before editing. |
| `docs/SCHEMA_MAP.md` | Schema relationship map | You need to understand app-facing collections, Postgres tables, document IDs, and data relationships before schema work. |
| `docs/DATA_MODEL.md` | Flat runtime collections, Firestore notes, Postgres sidecar schema notes | You are changing persistence, API payloads, imports, or app-facing records. |
| `functions/` | Deployable Firebase Functions backend package | You are changing backend runtime code used by Firebase deploys. |
| `app/functions/` | Mirrored backend source tree used by app/backend development history | You are changing backend modules; mirror relevant changes with `functions/` unless a phase says otherwise. |
| `app/admin-web/` | Private Vite/React Admin/Test Web Console | You need to validate backend Functions API behavior through a local or hosted web workbench. |
| `app/mobile/` | Flutter app | You are changing user-facing mobile screens, client repositories, localization, or app dependencies. |
| `db/migrations/` | Postgres sidecar SQL migrations | You are adding or changing relational source-truth / import / nutrition / review tables. |
| `scripts/` | Node CLIs for verification, migrations, imports, and batch jobs | You need an operator/dev command or testable entrypoint outside HTTP handlers. |
| `tests/` | Node phase/unit tests plus fixtures | You are changing backend behavior, scripts, data contracts, or phase acceptance criteria. |
| `dataconnect/`, `src/dataconnect-admin-generated/` | Firebase Data Connect schema and generated admin package | You are touching Data Connect experiments or generated Data Connect dependencies. |
| `data_samples/` | Small KolkoStruva-style source samples | You need sample pricing data for ingest tests or local flow checks. |
| `datasets/` | Large external source datasets, including USDA | You are running full local imports; avoid committing large generated outputs unless explicitly expected. |
| `runtime_data/`, `tmp/` | Local generated state and scratch data | You need local runtime artifacts; do not treat these as product truth. |
| `handoff/` | Phase handoff bundles | You need what changed, verification, blockers, and next actions for a completed phase. |
| `package.json` | Repo-level Node scripts | You need the canonical test, import, migration, or validation command. |
| `docker-compose.yml` | Local Postgres sidecar | You need the local `pricer_dev` database on host port `5433`. |

## Backend Source Trees

There are two backend source trees with the same module layout:

- `functions/src/` is the Firebase deploy package source.
- `app/functions/src/` is the mirrored app/backend source used throughout the phase docs and tests.

When changing backend logic, update both trees unless the task is explicitly scoped to one tree. Keep exports in both `src/index.js` files synchronized for public helpers and test imports.

### Backend Module Map

| Path under `functions/src/` and `app/functions/src/` | Owns |
| --- | --- |
| `index.js` | Aggregated CommonJS exports for tests, scripts, and function entrypoints. Add new exported helpers here when tests or scripts import them. |
| `phase1/` | KolkoStruva flat data backbone: snapshot parsing/import, source product identity, enrichment cache, Firestore/JSON/in-memory store adapters. |
| `phase1_5/` | English canonical/display metadata and translation upgrades. |
| `phase2/` | Query normalization, candidate filtering, scoring, ambiguity, and basic price comparison service. |
| `phase3/` | AI disambiguation helpers, deterministic embeddings, semantic profiles, feedback collection, semantic jobs. |
| `phase3_5/` | Daily product/category aggregation and product history/category trend services. |
| `phase4/` | Query parser/planner/executor/ranker and unified query-engine service. |
| `phase6/` | Production ingest pipeline, KolkoStruva ZIP client, canonicalization state, disambiguation queue, analytics, alerts, FCM, external AI adapters, scheduler/logging. |
| `phase6/admin_ingest_jobs.js` | Admin Console historical KolkoStruva ingest job metadata, dry-run command planning, and lightweight internal ingest job handlers. |
| `phase6/incremental_ingest.js` | Deterministic current-offer fingerprints, incremental latest diff categorization, offer-change event builders, and snapshot manifest builders. |
| `phase6/store_locations.js` | Deterministic retailer/store-location extraction from existing KolkoStruva store text, with provenance and no geocoding. |
| `phase6/geocoding.js` | Additive retailer-location and manual-address geocoding cache/enrichment helpers, provider abstraction, and fake provider for bounded tests. |
| `phase6/location_availability.js` | Opt-in nearest-store product availability read helper over matched geocode cache rows, optional reviewed-coordinate precedence, config-controlled coordinate default, and latest source-product offers. |
| `phase6/saved_user_locations.js` | Consented saved user location preferences and resolution helpers for location-aware search. |
| `phase6/location_review.js` | Deterministic location-confidence/admin-review candidate builder, guarded request handlers, additive review decision helpers, approved-coordinate publication into `reviewed_location_coordinates`, reviewed-coordinate diagnostics/precedence dry-runs, and rollout diagnostics. |
| `phase7/` | Demand logging, aggregate rebuilds, clustering, unmet-demand services, demand jobs. |
| `phase8/` | Early best-basket optimizer and service. |
| `phase9/` | Watchlist intelligence, target prices, recurring patterns, daily/weekly watchlist jobs. |
| `phase10/` | Monetization tiers, RevenueCat entitlement sync, premium gating, entitlement endpoints. |
| `phase12/` | Search canonicalization, synonym/typo records, conservative feedback loop. |
| `phase15/` | Canonical enrichment, focused enrichment pilot selection, product catalog readers/API, shopping-list resolution, shopping-intent family preferences, basket input planner. |
| `phase16/` | Canonical price lookup, single/multi-store basket optimization, explanation, convenience scoring, quality metrics, analytics, health diagnostics. |
| `phase17/` | Saved shopping lists, owner-scoped watchlist tracker, simple deal signals, read-only market/category trend summaries, and user-facing home summary feed. |
| `phase18/` | Internal analytics helpers, currently the market gap detection signal store, scorer, classifier, opportunity/insight report handlers, temporary internal analytics access guard, and internal dashboard shell. |
| `sync/` | Firestore-to-SQL and Firestore-to-vector sync jobs. |
| `db/` | Postgres sidecar config, migration runner helpers, import metadata repositories. |
| `db/usda/` | USDA macro import, deterministic cluster candidates, cluster materialization/review, ingredient nutrition mapping suggestions/review. |
| `db/ingredients/` | Postgres canonical Pricer ingredient repository for DB3A sidecar ingredients. |
| `db/products/` | DB3E Postgres sidecar ingredient-to-product equivalence candidate, mapping, and deterministic matching helpers. |
| `db/users/` | UX1 Postgres sidecar user food profile, constraint, preference, and equipment repository plus UX2 recipe feedback events/note signals and PROF1 append-only taste profile snapshot engine. |
| `db/recipes/` | Postgres canonical Pricer recipe repository, DB4B/DB4C nutrition workflows, DB4D readiness reporting, DB5A rich recipe ingest staging, DB5B LLM extraction into staging, and DB5C staged-review promotion with usability tracking. |
| `db/planner/` | PLAN1 deterministic meal-planner engine plus PLAN2A gross requirement aggregation, PLAN2A.1 inventory-adjusted net-requirement helpers, PLAN2B product-candidate adapters, PLAN2C optimizer-adapter persistence, and PLAN2D end-to-end shopping orchestration. |
| `api/` | Thin backend API wrappers that expose Postgres meal-planning and meal-plan shopping flows without duplicating PLAN1 or PLAN2D logic. |
| `meal/` | Meal-domain ingredient catalog, units/conversions, and product-to-ingredient bridge. |

## Backend HTTP/API Entry Points

Current backend tests mostly import module helpers from `functions/src/index.js`. For request-level behavior, search for `handle*Request` exports in the relevant phase module and in both `src/index.js` files.

Common request handlers:
- Query and product history: `phase2/service.js`, `phase3_5/service.js`, `phase4/service.js`.
- Product catalog/search: `phase15/service.js`.
- Shopping intent, shopping-list resolution, and basket planning: `phase15/shopping_intent.js`, `phase15/shopping_list.js`, `phase15/basket_planner.js`.
- Price lookup and basket optimization: `phase16/price_lookup.js`, `phase16/basket_optimizer.js`.
- Meal planning and meal-plan shopping: `api/meal_planning_api.js`, backed by `db/planner/meal_planner_engine.js` and `db/planner/meal_plan_shopping_orchestrator.js`.
- Basket analytics/health: `phase16/basket_analytics.js`, `phase16/basket_health.js`.
- Saved lists and watchlist tracker: `phase17/saved_lists.js`, `phase17/watchlist.js`.
- Monetization: `phase10/service.js`.

## Persistence and Schema Map

Start with `docs/SCHEMA_MAP.md` for relationships and ownership, then `docs/DATA_MODEL.md` for field lists before changing any persistent shape.

| Persistence area | Primary files | Notes |
| --- | --- | --- |
| Flat runtime store / Firestore-compatible collections | `phase1/store.js`, `docs/SCHEMA_MAP.md`, `docs/DATA_MODEL.md` | Active product runtime truth. Supports Firestore, local JSON, and in-memory tests. |
| Client-managed Firestore user state | `app/mobile/lib/core/services/firestore_repositories.dart`, `docs/SCHEMA_MAP.md`, `docs/DATA_MODEL.md` | Mobile lists/watchlist/billing cache under `users/{anon_id}`. |
| Backend saved-list/watchlist stores | `phase17/` modules, `docs/SCHEMA_MAP.md`, `docs/DATA_MODEL.md` | Owner-scoped flat runtime collections for saved lists and canonical-product watchlist tracking. |
| Postgres sidecar metadata | `db/migrations/001_db1_import_metadata.sql`, `db/import_metadata_repository.js` | Import/source metadata only; not app-facing runtime. |
| USDA Postgres sidecar | `db/migrations/002_*` through `008_*`, `db/usda/` | Macro nutrition import, clustering, review, and mapping staging. |
| Ingredient product equivalence sidecar | `db/migrations/017_db3e_ingredient_product_equivalence.sql`, `db/products/ingredient_product_repository.js`, `db/products/ingredient_product_matching.js` | Reviewable ingredient-to-product candidate/mapping layer; product ids remain string links until product Postgres ingestion exists. |
| User food profile, recipe feedback, taste profile, and inventory sidecar | `db/migrations/019_ux1_user_food_profiles.sql`, `db/migrations/020_ux2_recipe_swipe_feedback.sql`, `db/migrations/021_prof1_user_taste_profiles.sql`, `db/migrations/024_inventory_user_inventory.sql`, `db/users/user_food_profile_repository.js`, `db/users/recipe_feedback_repository.js`, `db/users/user_taste_profile_engine.js`, `db/users/user_inventory_repository.js` | UX1/UX2/PROF1/INVENTORY1 Postgres-only user preference, constraint, equipment, explicit recipe feedback, append-only taste profile, and current-inventory domain layer. PLAN2A.1 may read inventory for derived subtraction, but inventory itself remains non-mutating sidecar state. |
| Meal planner sidecar | `db/migrations/022_plan1_meal_plans.sql`, `db/migrations/023_plan2a_meal_plan_requirements.sql`, `db/migrations/025_plan2a1_inventory_adjusted_requirements.sql`, `db/migrations/026_plan2b_meal_plan_product_candidates.sql`, `db/migrations/027_plan2c_meal_plan_optimized_baskets.sql`, `db/migrations/028_plan2d_meal_plan_shopping_runs.sql`, `db/planner/meal_planner_engine.js`, `db/planner/meal_plan_requirements_builder.js`, `db/planner/meal_plan_net_requirements_builder.js`, `db/planner/meal_plan_product_candidate_builder.js`, `db/planner/meal_plan_basket_optimizer_adapter.js`, `db/planner/meal_plan_shopping_orchestrator.js` | PLAN1 deterministic weekly meal plans, PLAN2A gross ingredient requirements, PLAN2A.1 derived inventory-adjusted net requirements, PLAN2B runtime-compatible product candidate sets, PLAN2C optimized basket adapter outputs, and PLAN2D orchestration that reuses the existing runtime optimizer through explicit sidecar invocation. |
| Canonical recipe sidecar | `db/migrations/012_db4a_canonical_recipes.sql`, `db/migrations/013_db4b_recipe_nutrition_profile_candidates.sql`, `db/migrations/014_db4c_recipe_nutrition_profiles.sql`, `db/migrations/018_db5c_recipe_promotion_usability.sql`, `db/recipes/recipe_repository.js`, `db/recipes/recipe_nutrition_profiles.js`, `db/recipes/recipe_nutrition_profile_review_service.js`, `db/recipes/recipe_quality_reports.js`, `db/recipes/recipe_ingest_promotion_service.js` | Fixture-only canonical recipe layer linked to DB3A ingredients, Postgres-only recipe nutrition candidates from approved ingredient profiles, DB4D read-only readiness reporting, and DB5C promotion/usability tracking; canonical recipe existence remains separate from runtime eligibility. |
| Recipe ingest staging sidecar | `db/migrations/015_db5a_rich_recipe_ingest_staging.sql`, `db/migrations/016_db5b_recipe_ingest_llm_extraction_status.sql`, `db/migrations/018_db5c_recipe_promotion_usability.sql`, `db/recipes/recipe_ingest_staging_repository.js`, `db/recipes/recipe_llm_extraction.js`, `db/recipes/recipe_extraction_schema.js`, `db/recipes/recipe_ingest_promotion_service.js`, `prompts/recipe_ingest/extract_recipe_v1.js` | Raw-preserving rich recipe staging plus DB5B bounded LLM extraction and DB5C review-driven promotion into canonical recipes with usability metrics and ingredient-gap tracking; no runtime read models are published here. |
| Data Connect schema | `dataconnect/schema/schema.gql` | Not the active app/runtime implementation anchor unless a phase explicitly targets it. |

Postgres local defaults are in `docker-compose.yml`: database `pricer_dev`, user `pricer`, host port `5433`.

## Flutter App Map

| Path | Owns |
| --- | --- |
| `app/mobile/lib/main.dart` | App bootstrap. |
| `app/mobile/lib/app.dart` | Material app, localization delegates, root navigation shell, and named-route registration. |
| `app/mobile/lib/core/navigation/app_routes.dart` | Simple named routes for Phase 18 mobile navigation, including `/search`, `/optimize`, and `/product` argument handling. |
| `app/mobile/lib/core/models/app_models.dart` | Client DTOs for query results, product history, home summary feed, product search results, product detail/deal/watchlist actions, watchlist price views, basket optimization, backend saved-list views, legacy client lists, watchlist, monetization, and comparisons. |
| `app/mobile/lib/core/services/api_client.dart` | Backend API calls, including `/query`, product history, `/home/summary`, `/products/search`, product detail, product deal-check, nearest availability, saved user locations, watchlist add/remove, `/watchlist/prices`, `/basket/optimize`, and owner-scoped `/lists` CRUD. |
| `app/mobile/lib/core/services/app_dependencies.dart` | Dependency wiring for app services/repositories. |
| `app/mobile/lib/core/services/firestore_repositories.dart` | Client Firestore lists and watchlist repositories plus in-memory variants. |
| `app/mobile/lib/core/services/billing_repositories.dart`, `monetization_service.dart`, `monetization_config.dart` | Billing profile repositories and subscription abstraction. |
| `app/mobile/lib/core/services/local_identity_service.dart` | Anonymous local device/user identity. |
| `app/mobile/lib/core/services/recent_activity_service.dart`, `voice_input_service.dart`, `current_location_service.dart` | Client-side search and consented current-location support services. |
| `app/mobile/lib/core/ui/` | Shared theme, spacing, and app widgets. |
| `app/mobile/lib/features/search/` | Search home flow, Phase 18 home-summary section rendering, Phase 18.3 home search/add-to-basket entry, and Phase 18.4 real `/search` product results screen. |
| `app/mobile/lib/features/basket/` | Phase 18.5 real `/optimize` mobile basket optimization screen backed by `POST /basket/optimize`. |
| `app/mobile/lib/features/results/` | Results flow. |
| `app/mobile/lib/features/product/` | Product detail/history and Phase 18.2 canonical product route screen. |
| `app/mobile/lib/features/lists/` | Phase 18.7 backend-backed `/lists` and `/list_detail` saved-list screens with create/edit/delete and optimize navigation. |
| `app/mobile/lib/features/watchlist/` | Phase 18.6 backend-backed watchlist price tracker screen using `GET /watchlist/prices` and `DELETE /watchlist/:id`. |
| `app/mobile/lib/features/monetization/` | Paywall. |
| `app/mobile/lib/l10n/*.arb` | Source localization strings. |
| `app/mobile/lib/src/generated/l10n/` | Generated localization code; do not hand-edit except as an emergency with a documented follow-up. |
| `app/mobile/test/` | Flutter widget tests. |

## Admin Web App Map

| Path | Owns |
| --- | --- |
| `app/admin-web/package.json` | Admin console dependencies and Vite scripts. |
| `app/admin-web/src/App.tsx` | Tabbed admin/test console, API base URL override, request forms, raw API workbench, and response rendering. |
| `app/admin-web/src/styles.css` | Admin console operational layout and responsive styling. |
| `app/admin-web/.env.example` | Local emulator API base URL example for Vite. |
| `docs/ADMIN_WEB_CONSOLE.md` | Local dev, Hosting deploy, and API URL runbook. |

Admin Console V0 is private developer tooling. It must not change mobile UI or backend business logic. Future admin auth/protection belongs here or in Firebase Hosting/Functions access control, not in consumer mobile flows.

## Scripts and Commands

Repo-level scripts live in `package.json`.

| Command | Purpose |
| --- | --- |
| `npm test` | Run all Node tests through `tests/run_all.js`. |
| `npm run verify` | Repo verification script. |
| `npm run validate:docs` | Documentation registry validation. |
| `npm run db:health` | Check local/configured Postgres connectivity. |
| `npm run db:migrate` | Apply Postgres sidecar migrations from `db/migrations/`. |
| `npm run import:usda:macros` | Import configured USDA macro dataset into Postgres sidecar. |
| `npm run db2_5:*` | Generate/report/materialize/review USDA cluster and mapping workflows. |
| `npm run db3e:generate-product-ingredient-candidates` | Generate DB3E ingredient-product candidates and reviewable mapping suggestions without auto-approval. |
| `npm run db3e:review-product-ingredient-mapping` | List or review DB3E ingredient-product mappings. |
| `npm run db4a:seed-recipes` | Seed DB4A fixture recipes after DB3A ingredients exist. |
| `npm run db4b:generate-recipe-nutrition-profiles` | Generate DB4B recipe nutrition profile candidates from recipe grams and approved ingredient nutrition profiles. |
| `npm run db4c:review-recipe-nutrition-profile` | Review, approve, reject, or list DB4C recipe nutrition profile candidates and approved profiles. |
| `npm run db4d:report-recipe-quality` | Build DB4D read-only recipe readiness and quality reports across canonical recipes, nutrition coverage, product mappings, and ingredient gaps. |
| `npm run plan1:generate-meal-plan` | Generate one deterministic PLAN1 sidecar meal plan from UX1, PROF1, and eligible canonical recipes. |
| `npm run plan2a:build-meal-plan-requirements` | Build PLAN2A aggregated ingredient requirements from one stored meal plan without calling product resolution or basket optimization. |
| `npm run plan2a1:build-net-requirements` | Build PLAN2A.1 inventory-adjusted net requirements from one stored PLAN2A requirement bundle without mutating inventory or calling basket optimization. |
| `npm run plan2b:build-product-candidates` | Build PLAN2B purchasable product candidate rows from one PLAN2A.1 net-requirement bundle without calling the basket optimizer. |
| `npm run plan2c:optimize-meal-plan-basket` | Build PLAN2C optimized meal-plan basket rows by adapting PLAN2B candidates into the existing Phase 16 optimizer contract without mutating runtime basket state. |
| `npm run plan2d:run-meal-plan-shopping` | Run PLAN2D end-to-end meal-plan shopping orchestration over an existing or newly generated PLAN1 plan and persist one deterministic orchestration summary row. |
| `npm run test:app1` | Run the APP1 backend API tests for meal-plan generation, shopping-run orchestration, and optimized-basket reads. |
| `npm run db5a:seed-recipe-ingest-staging` | Seed DB5A rich recipe ingest staging fixtures without canonical promotion. |
| `npm run db5b:extract-recipe-to-staging` | Extract pending DB5 recipe ingest jobs into staging with strict-JSON validation and deterministic ingredient matching. |
| `npm run db5c:review-and-promote-recipe` | Inspect staged recipe bundles, review them, and promote them into canonical recipes with DB5C usability metrics and gap tracking. |
| `npm run ux1:seed-user-food-profiles` | Seed UX1 Postgres-side user food profiles, constraints, preferences, and equipment fixtures. |
| `npm run ux2:seed-recipe-feedback` | Seed UX2 Postgres-side recipe feedback events and note-signal fixtures for existing UX1 profiles and DB4A recipes. |
| `npm run prof1:build-user-taste-profiles` | Build append-only PROF1 taste profile snapshots from UX1 preferences, UX2 feedback, and staged recipe metadata. |
| `npm run inventory1:seed-inventory` | Seed or reset one user's INVENTORY1 sidecar pantry/fridge/freezer stock without planner or basket integration. |
| `npm run phase6:run`, `npm run phase7:run` | Batch pipeline runners for production ingest/demand. |
| `npm run phase6:ingest-snapshot` | Safe historical KolkoStruva ZIP/date publisher. Defaults to dry-run and archive/history/log collections; does not delete documents or publish current read models unless explicitly targeted. |
| `npm run phase6:diff-snapshot`, `npm run phase6:daily-incremental-dry-run` | Daily latest incremental dry-run/diff report over one snapshot. Builds current offers locally and compares to a local fingerprint baseline, a bounded limit sample, or an explicitly opted-in Firestore direct comparison. Writes nothing. |
| `npm run phase6:export-current-offer-fingerprints` | Paginated read-only export from `current_product_offers` to a compact local JSONL fingerprint baseline for cheap daily diff runs. |
| `npm run phase6:backfill-current-offer-fingerprints` | Guarded optional current-offer fingerprint collection backfill using the same exporter. Defaults to dry-run unless `PRICER_INCREMENTAL_BASELINE_BACKFILL_DRY_RUN=false`. |
| `npm run phase6:backfill-canonical-markers` | Canonical-only Firestore marker/brand backfill. Defaults to dry-run, supports limit/progress env vars, scans `canonical_products`, and never touches raw/source/offer/history/mapping collections. |
| `npm run phase6:audit-bad-products` | Firestore audit for malformed `canonical_products` and `source_products`; defaults to dry-run/no writes, and only marks invalid/quarantinable records when the explicit no-delete quarantine confirmation env var is set. |
| `npm run debug:canonical-summary -- <canonical_product_id...>` | Read-only product summary debugger. Prints the exact deployed/API product summary, mapped source ids, and optional configured-store evidence counts with `-- --store`. |
| `npm run debug:enrichment -- <canonical_product_id...>` | Read-only Phase 15 enrichment debugger. Prints compact canonical enrichment details, including v3 taxonomy classification, usage profile, and embedding summary, by product id or newest records with `-- --latest N --version canonical_semantic_v3`. |
| `npm run debug:runtime-store` | Read-only runtime store target debugger. Prints selected backend, Firestore project/database/prefix, resolved collection names, emulator status, row counts, and first canonical product samples without secrets. |
| `npm run test:phaseX` / `npm run test:dbX` | Targeted phase tests. |

## Test Map

| Area | Tests |
| --- | --- |
| Full backend suite | `tests/run_all.js`, `npm test`. |
| Phase behavior | `tests/phase_*_*.test.js`; names align with phase docs and package scripts. |
| Postgres sidecar | `tests/db1_postgres_foundation.test.js`, `tests/db2_usda_macro_import.test.js`, `tests/db2_5_*`. |
| USDA fixtures | `tests/fixtures/usda_macro/`. |
| Flutter app | `app/mobile/test/`, run with `flutter test` from `app/mobile/`. |
| Recorded test runs | `docs/test_runs/*.json`. |
| Test inventory | `docs/TEST_REGISTRY.md` and `docs/test_registry.json`. |

When adding a feature, add or update the narrowest test file that owns the behavior. If behavior crosses phases, add targeted tests near the newest owning phase and keep older phase contracts stable unless the phase docs say otherwise.

## Documentation Map

| Path | Use |
| --- | --- |
| `docs/PHASE_PLAN.md` | Overall roadmap. |
| `docs/PHASE_*.md` | Phase plans and acceptance criteria. |
| `docs/PLAN1_MEAL_PLANNER.md` | PLAN1 meal planner scope, deterministic scoring, CLI, and boundaries. |
| `docs/PLAN2_MEAL_PLAN_REQUIREMENTS.md` | PLAN2A gross meal-plan requirement aggregation, PLAN2A.1 inventory-adjusted net requirements, PLAN2B product-candidate adapter scope, PLAN2C optimizer-adapter scope, and PLAN2D orchestration links, statuses, CLI, and boundaries. |
| `docs/PLAN2_ORCHESTRATION.md` | PLAN2D orchestration scope, run-status contract, CLI, idempotency, dry-run note, and safety boundaries. |
| `docs/INVENTORY1_USER_INVENTORY.md` | INVENTORY1 user inventory scope, repository behavior, seed CLI, and sidecar boundaries. |
| `docs/PROF1_TASTE_PROFILE_ENGINE.md` | PROF1 taste profile engine scope, scoring rules, CLI, and boundaries. |
| `docs/implementation/PHASE_*.md` | Implementation contracts for phases. |
| `docs/ARCHITECTURE.md` | System architecture and boundaries. |
| `docs/PRODUCTION_FIRESTORE_RUNTIME_AUDIT.md` | Production Firestore route risk map, scoped-read rules, safe/unsafe runtime route status, and compact read-model follow-ups. |
| `docs/SCHEMA_MAP.md` | Schema relationships, document IDs, Postgres constraints, and source-of-truth boundaries. |
| `docs/CURRENT_STATE.md`, `docs/current_state.json` | Current repo/product state. |
| `docs/FEATURE_REGISTRY.md`, `docs/feature_registry.json` | Feature inventory. |
| `docs/TEST_REGISTRY.md`, `docs/test_registry.json` | Test inventory. |
| `docs/decision_log.md` | Append-only architectural and behavior decisions. |
| `CHANGELOG.md` | User-visible and repo-visible change history. |
| `docs/contracts/` | Cross-cutting contracts for docs, fixtures, Firebase, Firestore prices, product canonicalization, repo structure, and testing. |
| `docs/templates/` | Handoff and verification templates. |
| `handoff/phase_X/` | Completed phase summary, files changed, verification, operator actions, readiness. |

## Feature-to-File Lookup

| Feature/problem | Start here |
| --- | --- |
| New KolkoStruva ingest behavior | `phase6/ingest.js`, `phase6/kolkostruva_client.js`, `phase1/importer.js`, `data_ingest_rules.md`. |
| Historical KolkoStruva ingest/admin jobs | `scripts/ingest_phase6_snapshot_firestore.js`, `phase6/admin_ingest_jobs.js`, `app/admin-web/src/App.tsx`, `docs/DATA_MODEL.md`, `docs/SCHEMA_MAP.md`; tests live in `tests/phase_6_historical_ingest_admin.test.js`. |
| Daily latest incremental ingest/diff | `scripts/diff_phase6_snapshot_firestore.js`, `scripts/export_phase6_current_offer_fingerprints.js`, `phase6/incremental_ingest.js`, `phase16/current_offers.js`, `phase1/store.js`, `docs/DATA_MODEL.md`, `docs/SCHEMA_MAP.md`; tests live in `tests/phase_6_incremental_ingest_diff.test.js`. Real writes remain explicit opt-in with dry-run default, high-write catch-up acknowledgement, no default deletes, and event-policy selection. |
| Store/location extraction from product source data | `phase6/store_locations.js`, `phase6/ingest.js`, `docs/STORE_LOCATION_EXTRACTION.md`; tests live in `tests/phase_6_store_locations.test.js`. |
| Store/location geocoding cache | `phase6/geocoding.js`, `phase1/store.js`, `docs/STORE_LOCATION_EXTRACTION.md`; tests live in `tests/phase_6_store_geocoding.test.js`. |
| Nearest-store product availability | `phase6/location_availability.js`, `phase6/geocoding.js`, `phase6/store_locations.js`, `phase6/location_review.js`; tests live in `tests/phase_6_location_availability.test.js`. Config can set `DEFAULT_COORDINATE_MODE`, but invalid/unset config falls back to `provider_only`. |
| Saved user locations for location-aware search | `phase6/saved_user_locations.js`, `phase6/location_availability.js`, `phase1/store.js`; tests live in `tests/phase_6_saved_user_locations.test.js`. |
| API/Flutter location-aware search wiring, manual nearby-location polish, current-location flow, and user-triggered manual-address geocoding | `functions/index.js`, `phase6/geocoding.js`, `phase6/saved_user_locations.js`, `phase6/location_availability.js`, `app/mobile/lib/core/services/api_client.dart`, `app/mobile/lib/core/services/current_location_service.dart`, `app/mobile/lib/core/models/app_models.dart`, `app/mobile/lib/features/search/product_search_screen.dart`; backend tests live in `tests/phase_6_store_geocoding.test.js` and `tests/phase_6_saved_user_locations.test.js`, Flutter coverage in `app/mobile/test/widget_smoke_test.dart`. |
| Location confidence/admin review, guarded admin API, reviewed coordinate publication, coordinate diagnostics, rollout diagnostics, and opt-in reviewed-coordinate nearest availability | `functions/index.js`, `phase6/location_review.js`, `phase6/location_availability.js`, `phase1/store.js`, `docs/STORE_LOCATION_EXTRACTION.md`; tests live in `tests/phase_6_location_review.test.js` and `tests/phase_6_location_availability.test.js`. |
| Source product identity or dedupe | `phase1/ids.js`, `phase6/ingest.js`, `phase2/normalize.js`, `docs/DATA_MODEL.md`. |
| Product matching/search quality | `phase2/`, `phase4/`, `phase12/`, tests for phases 2, 4, 12. |
| Canonical product grouping/disambiguation | `phase6/ingest.js`, `phase6/disambiguation.js`, `phase15/readers.js`, phase 13/14 docs. |
| Malformed multi-row product ingest guardrails | `phase6/csv_stream.js`, `phase6/product_validation.js`, `phase6/ingest.js`, `phase16/current_offers.js`, `phase15/readers.js`, `phase15/enrichment_pilot.js`, `scripts/audit_phase6_bad_products_firestore.js`, docs `PHASE6_BAD_PRODUCT_INGEST_GUARDRAILS.md`; tests live in `tests/phase_6_production_pipeline.test.js`, `tests/phase_15_2_product_api.test.js`, and `tests/phase_16_0_price_lookup.test.js`. |
| Canonical marker/brand backfill for existing prod catalog | `scripts/backfill_canonical_markers_firestore.js`, `phase6/ingest.js`, `docs/DATA_MODEL.md`, `docs/SCHEMA_MAP.md`; tests live in `tests/phase_6_canonical_marker_backfill.test.js`. |
| Product catalog API | `phase15/service.js`, `phase15/readers.js`; mobile `/search` consumption lives in `app/mobile/lib/features/search/product_search_screen.dart`, `app_models.dart`, and `api_client.dart`. |
| Product search grocery synonyms and BG/EN query expansion | `phase15/search_synonyms.js`, `phase15/readers.js`, `phase15/service.js`; docs live in `docs/SEARCH_SYNONYMS_AND_BG_PARSING.md`; tests live in `tests/phase_15_2_product_api.test.js`. |
| Focused canonical semantic enrichment pilot and price normalization metadata | `phase15/enrichment_pilot.js`, `scripts/run_canonical_enrichment_pilot.js`, `scripts/run_canonical_enrichment_healthcheck.js`, `scripts/debug_canonical_enrichment.js`, `phase15/enrichment.js`, `phase15/semantic_registry.js`, `phase15/price_normalization.js`, `phase15/readers.js`; owns rich canonical semantic v2 schema/prompt validation, opt-in `canonical_semantic_v3` registry-backed enrichment, open `product_taxonomy` classification/proposals, registry/proposal/failed-response artifacts, v3 usage profile and embedding summary, deterministic explicit/inferred selling-unit metadata, bounded pilot groups, cache skipping, additive enrichment-backed search fields, provider config resolution, read-only enrichment inspection, and xAI health diagnostics. Docs live in `docs/PHASE_15_9_SEMANTIC_ENRICHMENT_PILOT.md`; tests live in `tests/phase_15_hyper_rich_enrichment.test.js` and `tests/phase_15_2_product_api.test.js`. |
| Shopping intent family preferences | `phase15/shopping_intent.js`, `phase1/store.js`; docs live in `docs/PHASE_15_8_SHOPPING_INTENT_PREFERENCES.md` and `docs/implementation/PHASE_15_8_SHOPPING_INTENT_PREFERENCES.md`; tests live in `tests/phase_15_8_shopping_intent_preferences.test.js`. |
| Diet/attribute claim normalization | `phase15/diet_attribute_normalization.js` and `phase15/enrichment.js` in both backend trees; tests live in `tests/phase_15_hyper_rich_enrichment.test.js`, `tests/phase_15_6_diet_attribute_normalization.test.js`, and `tests/phase_15_7_expanded_diet_attribute_aliases.test.js`; behavior is documented in `docs/DIET_ATTRIBUTE_NORMALIZATION.md`. |
| Shopping-list item resolution | `phase15/shopping_list.js`. |
| Basket planning/optimization | `phase15/basket_planner.js`, `phase16/price_lookup.js`, `phase16/basket_optimizer.js`; mobile `/optimize` consumption lives in `app/mobile/lib/features/basket/optimize_basket_screen.dart`, `app_models.dart`, `api_client.dart`, and `core/navigation/app_routes.dart`. |
| Current offer/current-price read model | `phase16/current_offers.js`, `phase16/price_lookup.js`, `phase15/service.js`, `scripts/publish_phase6_latest_firestore.js`; tests live in `tests/phase_16_0_price_lookup.test.js` and `tests/phase_15_2_product_api.test.js`. |
| Basket explanation/convenience/quality/analytics/health | `phase16/basket_explanation.js`, `basket_convenience.js`, `basket_quality.js`, `basket_analytics.js`, `basket_health.js`. |
| Market gap detection | `phase18/gap_detection.js`, `phase18/internal_access.js`, and `phase18/internal_dashboard.js` in both backend trees; HTTP entry lives in `functions/index.js`; signals are captured from `phase15/service.js`, `phase15/shopping_list.js`, `phase15/basket_planner.js`, `phase16/basket_optimizer.js`, `phase17/saved_lists.js`, and `phase17/watchlist.js`; API now includes global, locality, coverage-by-chain, market-opportunity report reads, merchant/admin insight rollups, a temporary internal analytics token guard, and an internal dashboard shell; tests live in `tests/phase_18_7_market_gap_detection.test.js`, `tests/phase_20_1_local_gap.test.js`, `tests/phase_20_2_chain_gap.test.js`, `tests/phase_20_3_market_opportunity_reports.test.js`, `tests/phase_20_4_merchant_insight_api.test.js`, `tests/phase_20_5_internal_access_guard.test.js`, and `tests/phase_20_6_internal_insights_dashboard.test.js`. |
| Saved shopping lists | `phase17/saved_lists.js` for backend persistence and owner scoping; mobile Phase 18.7 consumption lives in `app/mobile/lib/features/lists/`, `app_models.dart`, `api_client.dart`, and `core/navigation/app_routes.dart`; `firestore_repositories.dart` remains legacy/local client-list support. |
| Watchlist tracker or intelligence | `phase17/watchlist.js` for tracker CRUD/read-view; `phase9/` for intelligence/alerts; `app/mobile/lib/features/watchlist/` for the Phase 18.6 mobile price-tracker UI with product navigation and remove support. |
| Market/category trends | `phase17/market_trends.js`, Phase 17.4 docs/tests; uses canonical enrichment grouping and `product_daily_prices` without new persistence. |
| Home summary feed | `phase17/home_summary.js`, Phase 17.5 docs/tests; composes deals, watchlist, saved-list shortcuts, market highlights, and quick actions without diagnostics or mutation. Flutter consumption starts in `app/mobile/lib/features/search/home_screen.dart` with DTO/API support in `app_models.dart` and `api_client.dart`; Phase 18.3 adds the top home input that routes search queries to `/search` and comma/newline draft basket items to `/optimize`, and Phase 18.5 makes `/optimize` a real editable basket optimization screen. |
| Monetization/paywall/entitlements | `phase10/`, `app/mobile/lib/features/monetization/`, billing/monetization services. |
| Demand intelligence | `phase7/`. |
| Notifications/FCM | `phase6/fcm.js`, `phase6/alerts.js`, `phase9/`. |
| USDA macro import | `db/usda/usda_importer.js`, `usda_repository.js`, `usda_schema.js`, migrations `002`-`004`, scripts `import_usda_macros.js`. |
| USDA clustering/review | `db/usda/cluster_*`, migrations `005`-`007`, scripts `db2_5_*`. |
| Ingredient nutrition mappings | `db/usda/ingredient_nutrition_mapping_*`, migration `008`, mapping review scripts. |
| Canonical Postgres ingredients | `db/ingredients/ingredient_repository.js`, `db/ingredients/ingredient_reports.js`, `db/ingredients/ingredient_nutrition_profiles.js`, `db/ingredients/ingredient_nutrition_profile_review_service.js`, migrations `009` through `011`, scripts `scripts/db3a_seed_ingredients.js`, `scripts/db3b_report_ingredients.js`, `scripts/db3c_generate_ingredient_nutrition_profiles.js`, and `scripts/db3d_review_ingredient_nutrition_profile.js`. |
| Ingredient product equivalence | `db/products/ingredient_product_repository.js`, `db/products/ingredient_product_matching.js`, migration `017_db3e_ingredient_product_equivalence.sql`, scripts `scripts/db3e_generate_product_ingredient_candidates.js` and `scripts/db3e_review_product_ingredient_mapping.js`, and test `tests/db3e_ingredient_product_equivalence.test.js`. |
| User food profiles | `db/users/user_food_profile_repository.js`, migration `019_ux1_user_food_profiles.sql`, seed fixture `data/seeds/user_food_profiles_seed.json`, script `scripts/ux1_seed_user_food_profiles.js`, test `tests/ux1_user_food_profiles.test.js`, and doc `docs/UX1_USER_FOOD_PROFILES.md`. |
| Recipe swipe feedback | `db/users/recipe_feedback_repository.js`, migration `020_ux2_recipe_swipe_feedback.sql`, seed fixture `data/seeds/recipe_feedback_seed.json`, script `scripts/ux2_seed_recipe_feedback.js`, test `tests/ux2_recipe_feedback.test.js`, and doc `docs/UX2_RECIPE_FEEDBACK.md`. |
| Taste profile snapshots | `db/users/user_taste_profile_engine.js`, migration `021_prof1_user_taste_profiles.sql`, script `scripts/prof1_build_user_taste_profiles.js`, test `tests/prof1_user_taste_profiles.test.js`, and doc `docs/PROF1_TASTE_PROFILE_ENGINE.md`. |
| User inventory | `db/users/user_inventory_repository.js`, migration `024_inventory_user_inventory.sql`, script `scripts/inventory1_seed_inventory.js`, test `tests/inventory1_user_inventory.test.js`, and doc `docs/INVENTORY1_USER_INVENTORY.md`. |
| Inventory-adjusted meal-plan net requirements | `db/planner/meal_plan_net_requirements_builder.js`, migration `025_plan2a1_inventory_adjusted_requirements.sql`, script `scripts/plan2a1_build_net_requirements.js`, test `tests/plan2a1_inventory_adjusted_requirements.test.js`, and doc `docs/PLAN2_MEAL_PLAN_REQUIREMENTS.md`. |
| Meal-plan product candidates | `db/planner/meal_plan_product_candidate_builder.js`, migration `026_plan2b_meal_plan_product_candidates.sql`, script `scripts/plan2b_build_product_candidates.js`, test `tests/plan2b_product_candidates.test.js`, and docs `docs/PLAN2_MEAL_PLAN_REQUIREMENTS.md` plus `docs/PLAN2_REUSE_AUDIT.md`. |
| Meal-plan optimized baskets | `db/planner/meal_plan_basket_optimizer_adapter.js`, migration `027_plan2c_meal_plan_optimized_baskets.sql`, script `scripts/plan2c_optimize_meal_plan_basket.js`, test `tests/plan2c_meal_plan_basket_optimizer.test.js`, and docs `docs/PLAN2_MEAL_PLAN_REQUIREMENTS.md` plus `docs/PLAN2_REUSE_AUDIT.md`. |
| Meal-plan shopping orchestration | `db/planner/meal_plan_shopping_orchestrator.js`, migration `028_plan2d_meal_plan_shopping_runs.sql`, script `scripts/plan2d_run_meal_plan_shopping.js`, test `tests/plan2d_meal_plan_shopping_orchestrator.test.js`, and docs `docs/PLAN2_ORCHESTRATION.md` plus `docs/PLAN2_MEAL_PLAN_REQUIREMENTS.md`. |
| Meal-planning backend API | `api/meal_planning_api.js`, `functions/index.js`, test `tests/app1_meal_planning_api.test.js`, and docs `docs/PLAN1_MEAL_PLANNER.md` plus `docs/PLAN2_ORCHESTRATION.md`. |
| Canonical Postgres recipes | `db/recipes/recipe_repository.js`, `db/recipes/recipe_nutrition_profiles.js`, `db/recipes/recipe_nutrition_profile_review_service.js`, `db/recipes/recipe_quality_reports.js`, `db/recipes/recipe_ingest_promotion_service.js`, migrations `012_db4a_canonical_recipes.sql` through `014_db4c_recipe_nutrition_profiles.sql` plus `018_db5c_recipe_promotion_usability.sql`, seed fixture `data/seeds/recipes_seed.json`, scripts `scripts/db4a_seed_recipes.js`, `scripts/db4b_generate_recipe_nutrition_profiles.js`, `scripts/db4c_review_recipe_nutrition_profile.js`, `scripts/db4d_report_recipe_quality.js`, and `scripts/db5c_review_and_promote_recipe.js`, and tests `tests/db4a_canonical_recipes.test.js`, `tests/db4b_recipe_nutrition_profiles.test.js`, `tests/db4c_recipe_nutrition_profile_review.test.js`, `tests/db4d_recipe_quality_reports.test.js`, and `tests/db5c_recipe_promotion.test.js`. |
| Rich recipe ingest staging | `db/recipes/recipe_ingest_staging_repository.js`, `db/recipes/recipe_llm_extraction.js`, `db/recipes/recipe_extraction_schema.js`, `db/recipes/recipe_ingest_promotion_service.js`, prompt `prompts/recipe_ingest/extract_recipe_v1.js`, migrations `015_db5a_rich_recipe_ingest_staging.sql`, `016_db5b_recipe_ingest_llm_extraction_status.sql`, and `018_db5c_recipe_promotion_usability.sql`, seed fixture `data/seeds/recipe_ingest_staging_seed.json`, scripts `scripts/db5a_seed_recipe_ingest_staging.js`, `scripts/db5b_extract_recipe_to_staging.js`, and `scripts/db5c_review_and_promote_recipe.js`, and tests `tests/db5a_recipe_ingest_staging.test.js`, `tests/db5b_recipe_llm_extraction.test.js`, and `tests/db5c_recipe_promotion.test.js`. |
| Meal ingredient catalog/units/bridge | `meal/catalog/service.js`, `meal/units/service.js`, `meal/bridge/service.js`, Phase M0 docs/tests. |
| Flutter localization | `app/mobile/lib/l10n/*.arb`, `l10n.yaml`, generated files under `src/generated/l10n/`. |

## Update Rules for Future Agents

- If you add, remove, rename, or repurpose a directory, module family, script, migration, test family, or persistent collection/table, update this map.
- If you add a new feature phase, add a row to the feature lookup and backend/mobile/test maps as applicable.
- If you add a new persistent shape, update `docs/SCHEMA_MAP.md` and `docs/DATA_MODEL.md` first, then link the owning files from this map.
- If you discover duplicate source trees are out of sync, either synchronize them or document the blocker in the phase handoff and decision log.
- If a generated directory is being mistaken for source truth, add a warning here instead of relying on memory.
