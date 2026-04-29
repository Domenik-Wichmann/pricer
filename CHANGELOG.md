# Changelog

## 2026-04-29 - APP1 Meal Planning And Meal-Plan Shopping Backend API

- Added thin backend API wrappers in `functions/src/api/meal_planning_api.js` and `app/functions/src/api/meal_planning_api.js` for PLAN1 generation, stored meal-plan reads, PLAN2D shopping-run invocation, stored shopping-run reads, and stored optimized-basket reads.
- Reused the existing PLAN1 and PLAN2D modules instead of introducing new planner or optimizer logic.
- Wired new HTTP routes in `functions/index.js`: `POST /meal-plans/generate`, `GET /meal-plans/:planId`, `POST /meal-plans/:planId/shopping/run`, `GET /meal-plan-shopping-runs/:runId`, and `GET /meal-plan-optimized-baskets/:basketId`.
- Added cached Postgres route initialization with automatic migration application and bounded `503 meal planning database not configured` responses when the sidecar is unavailable.
- Added APP1 tests for generate/detail/run/detail/basket flows, missing-id handling, route wiring, and no-new-optimizer/no-Firestore boundaries.
- Updated PLAN1/PLAN2 docs, repo map, test registry, test-run artifact, and handoff bundle for the new API surface.

## 2026-04-29 - PLAN2D End-To-End Meal-Plan Shopping Orchestration

- Added Postgres sidecar migration `028_plan2d_meal_plan_shopping_runs.sql` for deterministic orchestration-run tracking across PLAN1 and PLAN2 artifacts.
- Added mirrored PLAN2D orchestration helpers plus `plan2d:run-meal-plan-shopping` for resolving or generating a meal plan, then chaining PLAN2A requirements, PLAN2A.1 inventory netting, PLAN2B product candidates, and PLAN2C optimized baskets.
- Reused the existing PLAN1, PLAN2A, PLAN2A.1, PLAN2B, and PLAN2C modules instead of introducing a second shopping stack or new optimizer logic.
- Added PLAN2D tests for existing-plan and generated-plan chaining, partial missing-product outcomes, deterministic run-key reuse, CLI parsing, and no-Firestore/no-LLM/no-new-optimizer boundaries.
- Added PLAN2 orchestration docs, schema/data-model/repo-map/test-registry updates, test-run artifact, and handoff bundle.

## 2026-04-28 - Phase 2L Config-Controlled Coordinate Mode Default

- Added `DEFAULT_COORDINATE_MODE` config support for nearest availability with allowed values `provider_only` and `reviewed_first`.
- Kept `provider_only` as the safe fallback when config is unset or invalid.
- Preserved request-level `coordinate_mode` override behavior, including invalid request rejection.
- Expanded Phase 6 location-availability tests for unset config, invalid config fallback, reviewed-first configured default, and explicit request override.
- Documented the config in store-location docs, schema/data maps, secrets/setup audit, and backend env examples.

## 2026-04-28 - PLAN2C Meal-Plan Basket Optimizer Adapter

- Added Postgres sidecar migration `027_plan2c_meal_plan_optimized_baskets.sql` for deterministic `meal_plan_optimized_baskets` and `meal_plan_optimized_basket_items`.
- Added mirrored PLAN2C optimizer-adapter helpers plus `plan2c:optimize-meal-plan-basket` for translating PLAN2B candidate rows into explicit optimized basket outputs linked back to meal plans.
- Reused the existing runtime canonical-product price lookup and existing Phase 16 single-store and multi-store optimizer functions through a synthetic basket-plan and synthetic price-lookup contract, without adding a second optimizer.
- Added PLAN2C tests for adapter-shape conversion, existing-optimizer invocation, selected-item persistence, covered and missing marker preservation, idempotent reruns, and no-Firestore/no-sponsored boundaries.
- Updated PLAN2 docs, schema/data-model/repo-map/test-registry entries, test-run artifact, and handoff bundle.

## 2026-04-28 - Phase 2K Reviewed-Coordinate Rollout Diagnostics

- Added guarded internal rollout diagnostics for comparing provider-only and reviewed-first coordinate readiness before any default switch.
- Reported provider-only and reviewed-first coordinate counts, changed-coordinate counts, provider-vs-reviewed distance deltas, high-reuse reviewed coverage, and active reviewed-coordinate confidence distribution.
- Added `GET /internal/location-review/rollout-diagnostics`, guarded by explicit admin/operator identity headers.
- Documented default-switch criteria and rollback requirements while keeping `coordinate_mode = "provider_only"` as the default.
- Expanded Phase 6 location-review tests for changed-coordinate diagnostics, high-reuse coverage, provider-only default preservation, and admin identity enforcement.

## 2026-04-28 - Phase 2J Opt-In Reviewed-Coordinate Nearest Availability

- Added `coordinate_mode` to nearest product availability with default `provider_only` and opt-in `reviewed_first`.
- Let `reviewed_first` use active `reviewed_location_coordinates` before falling back to matched provider geocodes, while ignoring superseded reviewed rows.
- Added `coordinate_source`, `coordinate_mode`, and reviewed-coordinate provenance to nearest availability offers for rollout/debug visibility.
- Rejected invalid API `coordinate_mode` values and expanded Phase 6 location-availability tests for default behavior, reviewed precedence, fallback, supersession, source metadata, and invalid-mode handling.
- Kept reviewed coordinates out of the default path and left normal product search, maps UI, live geocoding, and LLM usage unchanged.

## 2026-04-28 - Phase 2I Reviewed Coordinate Diagnostics

- Added guarded internal reviewed-coordinate read handlers and HTTP routes for active rows, superseded rows, and coordinate detail.
- Added a dry-run coordinate diagnostics resolver with explicit precedence: active reviewed coordinate, matched provider coordinate, then unavailable.
- Exposed diagnostics with provider coordinate, active reviewed coordinate, superseded count, winning coordinate, and reason for each source identity.
- Expanded Phase 6 location-review tests to cover reviewed-over-provider precedence, provider fallback, superseded exclusion, unavailable state, read endpoints, and admin identity enforcement.
- Kept consumer nearest availability, normal product search, maps UI, live geocoding, and LLM calls unchanged.

## 2026-04-28 - Phase 18.9 Cross-Screen Visual Consistency

- Applied the Phase 18.8 visual language across product search, product detail, optimize basket, watchlist, saved lists, and saved-list detail.
- Tightened shared cards, inputs, buttons, section headers, badges, spacing, loading, empty, and error states without changing backend calls or navigation.
- Kept the pass visual-only: no API contracts, DTOs, routes, persistence, or feature behavior changed.
- Verified with `flutter analyze`, full `flutter test`, Phase 5 mobile static checks, Phase 5.5 UI/growth checks, and Phase 5.6 localization checks.

## 2026-04-28 - Production Readiness Audit

- Updated `docs/needed_secrets.md` with repo-grounded Firebase, Firestore, mobile, monetization, FCM, xAI, and Postgres setup truth.
- Added `docs/PRODUCTION_READINESS_AUDIT.md`, `docs/MVP_OPERATOR_TODO.md`, and `docs/CODEX_IMPLEMENTATION_TODO.md`.
- Clarified that hosted Postgres is not required for the current mobile MVP runtime; Firestore/flat store is the app-facing runtime, while Docker/Postgres remains sidecar/import/review/planning data.
- Added production-readiness verification commands to `docs/TEST_REGISTRY.md`.

## 2026-04-28 - PLAN2B Net Requirements To Purchasable Product Candidates

- Added Postgres sidecar migration `026_plan2b_meal_plan_product_candidates.sql` for deterministic `meal_plan_product_candidate_sets` and `meal_plan_product_candidates`.
- Added mirrored PLAN2B product-candidate builder helpers plus `plan2b:build-product-candidates` for translating PLAN2A.1 net requirements into runtime-compatible canonical product candidate options.
- Reused the existing runtime canonical product and price backbone through read-only identity resolution and `lookupCanonicalProductPrices(...)` instead of duplicating price or optimizer logic.
- Added PLAN2B tests for approved versus unapproved mappings, covered-by-inventory marker rows, package-size normalization, units-needed and overage math, missing-size and missing-price handling, idempotent rebuilds, and no-optimizer/no-Firestore/no-sponsored boundaries.
- Updated PLAN2 docs, schema/data-model/repo-map/test-registry entries, test-run artifact, and handoff bundle.

## 2026-04-28 - Phase 2H Reviewed Location Coordinate Publication

- Added additive `reviewed_location_coordinates` runtime collection for approved location-review corrections.
- Added a Phase 6 publisher that reads approved review candidates, preserves source/reviewer provenance, and writes reviewed coordinates without mutating raw location or geocode rows.
- Added supersession behavior so one reviewed coordinate remains active per source identity while older approved coordinates are retained inactive.
- Expanded Phase 6 location-review tests to cover approved publication, rejected and needs-more-info skipping, supersession, and raw geocode preservation.
- Kept nearest availability, normal product search, maps UI, live geocoding, and LLM calls unchanged.

## 2026-04-28 - Phase 18.8 Home Screen Visual Polish

- Refined the Flutter home screen layout while preserving existing `/home/summary` API usage, models, and navigation.
- Reworked the search entry into a rounded full-width search bar with search and voice icons plus existing search/add-to-basket actions.
- Made Top Deals the primary horizontal card section, with compact vertical cards for watchlist highlights and saved-list shortcuts.
- Kept market highlights small and quick actions visually light at the bottom of the home-summary stack.
- Added local home widgets for the polished layout and verified with `flutter analyze` plus the full Flutter test suite.

## 2026-04-28 - Phase 2G Guarded Location Review Admin API

- Added guarded internal location-review endpoints for listing pending candidates, reading candidate detail, approving candidates, rejecting candidates, and marking candidates as needing more information.
- Required explicit `x-pricer-admin-id` or `x-pricer-operator-id` on the Phase 2G review endpoints.
- Kept review decisions additive on `location_review_candidates`; approved corrections still do not alter geocode/source rows or feed consumer nearest availability.
- Expanded Phase 6 location-review tests to cover list/detail, approval with corrected coordinates, rejection with reason, needs-more-info, and missing-admin rejection.
- Kept maps UI, live geocoding, LLM calls, and consumer behavior changes out of scope.

## 2026-04-28 - Phase 2F Location Confidence and Admin Review

- Added additive `location_review_candidates` runtime collection for deterministic review of risky or valuable location/geocode records.
- Added `phase6/location_review.js` in both backend trees with candidate building over retailer geocodes, manual geocodes, saved geocoded user locations, and address-like retailer locations missing coordinates.
- Ranked review candidates by status risk, confidence, reuse count, missing coordinates, and provider ambiguity/mismatch.
- Added additive review decisions with `pending`, `approved`, `rejected`, and `needs_more_info` statuses plus reviewer, notes, approved coordinates, and correction reason fields.
- Added Phase 6 location-review tests for candidate ranking, approval, rejection, and preserving raw/source coordinates during additive correction.
- Kept maps UI, live provider calls, LLM calls, and consumer nearest-search changes out of scope.

## 2026-04-27 - Phase 2E-3 Manual-Address Geocoding

- Added cache-first manual-address geocoding through the existing Phase 2A provider abstraction, backed by the additive `manual_location_geocodes` runtime collection.
- Added `POST /user/locations/geocode-address` with owner identity, fake-provider test coverage, manual-address provenance, and matched/ambiguous/failed/skipped/invalid-input states.
- Added Flutter API DTO/client support plus an explicit `Find coordinates` action that never geocodes while typing and requires confirmation before applying coordinates.
- Allowed confirmed address coordinates to feed nearest availability or be saved as Home, Work, or Custom with geocoded provider/provenance fields.
- Kept normal product search, maps UI, live geocoding/GPS, and LLM usage out of scope.

## 2026-04-27 - PLAN2A.1 Inventory-Adjusted Meal-Plan Requirements

- Added Postgres sidecar migration `025_plan2a1_inventory_adjusted_requirements.sql` for derived `meal_plan_net_requirements` and `meal_plan_net_requirement_items`.
- Added mirrored PLAN2A.1 net-requirement builder helpers plus `plan2a1:build-net-requirements` for read-only inventory subtraction over PLAN2A gross requirements and INVENTORY1 active inventory rows.
- Added PLAN2A.1 tests for ingredient-id and ingredient-key fallback subtraction, full and partial coverage handling, net shopping quantity recomputation, idempotent rebuilds, and no-Firestore/no-optimizer/no-inventory-mutation boundaries.
- Updated PLAN2/inventory docs, schema/data-model/repo-map/test-registry entries, test-run artifact, and handoff bundle.

## 2026-04-27 - Phase 2E-2 User-Initiated Current Location

- Added a Flutter current-location service backed by `geolocator`, wired through app dependencies for testable consent-first location requests.
- Added an explicit `Use current location` action to Nearby availability; the app requests permission only after the user taps it.
- Added UI states for denied permission, permanently denied permission, unavailable/error cases, loading, and acquired coordinates.
- Allowed acquired coordinates to feed the existing opt-in nearest availability request and added explicit save-as Home, Work, or Custom actions.
- Added Android/iOS/macOS foreground location permission declarations and Flutter tests covering no automatic request, denied permission, acquired-coordinate search, and explicit save-as custom behavior.
- Kept normal product search, maps, live geocoding, background tracking, and LLM usage out of scope.

## 2026-04-27 - Phase 2E-1 Manual Nearby Location Polish

- Added safer manual nearby-availability controls with display-name and raw-address fields, clearer latitude/longitude labels, bounded radius choices, and sort selection.
- Added client-side validation for latitude, longitude, saved-location selection, and radius before calling nearest availability.
- Improved nearby empty states for missing saved locations and invalid manual coordinates while keeping manual address text local and non-geocoded.
- Added Flutter widget coverage for manual coordinate validation, raw address display without geocoding, radius/sort controls, no-saved-location state, and result rendering.
- Kept normal product search coordinate-free and avoided GPS prompts, maps UI, live geocoding, and LLM calls.

## 2026-04-27 - INVENTORY1 User Inventory Foundation

- Added Postgres sidecar migration `024_inventory_user_inventory.sql` for deterministic `user_inventories` and `inventory_items`.
- Added mirrored INVENTORY1 inventory repository helpers plus `inventory1:seed-inventory` for ingredient-first and product-fallback pantry/fridge/freezer tracking without planner or basket integration.
- Added INVENTORY1 tests for idempotent inventory creation, duplicate-item merging, quantity updates and reductions, soft removal at zero quantity, expiry estimation, deterministic seed reruns, and no-Firestore/no-planner boundaries.
- Updated INVENTORY1 docs, schema/data-model/repo-map/test-registry entries, test-run artifact, and handoff bundle.

## 2026-04-26 - PLAN2A Meal Plan Requirements Builder

- Added Postgres sidecar migration `023_plan2a_meal_plan_requirements.sql` for deterministic `meal_plan_requirements` and `meal_plan_requirement_items`.
- Added mirrored PLAN2A meal-plan requirement builder helpers plus `plan2a:build-meal-plan-requirements` for aggregated canonical ingredient demand, conservative shopping quantity estimation, and explicit adapter statuses without calling product resolution or basket optimization.
- Added PLAN2A tests for cross-recipe ingredient aggregation, grams summation, source-id preservation, unmatched ingredient handling, status classification, unit conversion, idempotent rebuilds, and no-Firestore/no-optimizer boundaries.
- Updated PLAN2 docs, schema/data-model/repo-map/test-registry entries, test-run artifact, and handoff bundle.

## 2026-04-26 - Phase 2D API + Flutter Location Wiring

- Added backend endpoints for saved user location list/create/update/delete and opt-in nearest product availability.
- Added Flutter API client DTOs and methods for saved locations and nearest availability.
- Added minimal product-search UI controls for Home, Work, Custom, and Manual location-aware search plus nearest-store result cards and empty states.
- Kept normal product search coordinate-free and avoided GPS prompts, live geocoding, LLMs, routing, and maps UI.
- Added backend handler tests and Flutter widget coverage for the saved-location selector and nearest availability results.

## 2026-04-26 - Phase 15.7 Expanded Diet + Attribute Aliases

- Expanded the Phase 15 deterministic diet/attribute vocabulary with reviewed Turkish, Russian, Ukrainian, Dutch, and Spanish aliases.
- Kept normalization constrained to the existing controlled tags: `vegan`, `vegetarian`, and the known claim attributes.
- Added false-positive tests for substring matches, tofu/no-inference behavior, natural/no-organic behavior, and low-sugar/no-sugar-free behavior.
- Added Phase 15.7 tests plus docs, registry, test-run artifact, and handoff updates.

## 2026-04-26 - Phase 2C Saved User Locations

- Added `saved_user_locations` as a consented runtime preference collection for Home, Work, and Custom location-aware search.
- Added deterministic saved-location validators for coordinates, radius bounds, allowed labels, allowed sorts, and allowed sources.
- Added saved-location create/update/list/delete helpers plus `resolveLocationForSearch(...)` for explicit coordinates, saved location ids, unambiguous labels, and default locations.
- Extended nearest-store availability to use saved-location defaults without changing normal coordinate-free product search.
- Added focused saved-location tests plus docs, schema/repo maps, registry, changelog, test-run artifact, and handoff updates.

## 2026-04-26 - Phase 2B Nearest-Store Product Availability

- Added an opt-in nearest-store availability helper over canonical product mappings, latest source-product offers, retailer locations, and matched geocode cache rows.
- Added deterministic haversine distance, bounded radius/limit handling, and `nearest`, `cheapest`, and `best_value` sorting.
- Returned explicit states for matched results, no nearby stores, missing geocodes, product-not-found, and invalid coordinates.
- Kept normal product search independent of coordinates and avoided external APIs, LLMs, live geocoding, saved locations, or maps UI.
- Added focused Phase 2B tests plus docs, registry, changelog, test-run artifact, and handoff updates.

## 2026-04-26 - Phase 2A Store Geocoding Cache

- Added additive `retailer_location_geocodes` runtime/cache records keyed by normalized country, city, raw address, and store identity.
- Added a bounded geocoding provider abstraction plus fake provider tests for matched, skipped, ambiguous, and cached-result flows without live external API calls.
- Kept `retailer_locations` raw fields unchanged and left product search, basket planning, price lookup, and canonical grouping independent of coordinates.
- Updated schema, repo map, store-location docs, test registry, test-run artifact, and handoff for Phase 2A.

## 2026-04-26 - Deterministic Store Location Extraction

- Added a derived `retailer_locations` flat runtime collection from existing KolkoStruva snapshot/store text.
- Added deterministic parsing for Bulgarian, English, and German-compatible city/address patterns while preserving raw store text and source-file provenance.
- Kept `latitude` and `longitude` null, marked geocoding needs explicitly, and avoided LLM/runtime geocoding calls.
- Added focused Phase 6 store-location tests and verified existing Phase 6 ingest plus Phase 16 price lookup behavior remains unchanged.

## 2026-04-26 - PLAN1 Deterministic Meal Planner MVP

- Added Postgres sidecar migration `022_plan1_meal_plans.sql` for deterministic weekly `meal_plans` and `meal_plan_items`.
- Added mirrored PLAN1 meal-planner engine helpers plus `plan1:generate-meal-plan` for deterministic weekly plan generation from UX1 profiles, PROF1 taste snapshots, DB5C usability-gated canonical recipes, and approved DB4C recipe nutrition profiles.
- Added PLAN1 tests for hard-constraint and equipment filtering, deterministic scoring and ordering, same-day duplicate avoidance, idempotent `plan_key` writes, macro summaries, missing-taste-profile fallback, and no-Firestore/no-LLM boundaries.
- Added PLAN1 docs, schema/data-model/repo-map/test-registry updates, test-run artifact, and handoff bundle.

## 2026-04-26 - Diet + Attribute Normalization Layer

- Added a Phase 15 controlled vocabulary for explicit BG/EN/DE diet and product-attribute claims.
- Added deterministic extraction for organic/bio, vegan, vegetarian, gluten-free, lactose-free, sugar-free, low-fat, high-protein, plant-based, halal, kosher, no-added-sugar, and wholegrain aliases.
- Normalized LLM-provided synonyms such as `bio`, `gluten free`, `low fat`, and `vegetarisch` into stable `attributes` / `diet_tags` values while preserving the additive enrichment boundary.
- Ignored unknown/unmapped diet and claim attributes during validation so only controlled values enter normalized enrichment arrays.
- Stored deterministic matched-text provenance as `explicit_claim_evidence` on canonical enrichment records without mutating canonical ids, mappings, or grouping.
- Added a dedicated Phase 15.6 test suite and updated Phase 15 docs for explicit-only extraction, multilingual examples, search/filter compatibility, and future language expansion.

## 2026-04-26 - Phase 20.6 Internal Insights Dashboard Stub

- Added a simple internal dashboard shell at `GET /internal/insights/dashboard`.
- The dashboard stores the internal analytics token only in the browser, sends `x-pricer-admin-token` and `x-pricer-role`, and consumes the guarded Phase 20.4 insight endpoints.
- Added overview cards and compact tables for top opportunities, categories, localities, and chains.
- Kept the dashboard as an internal stub only: no billing, merchant polish, export snapshots, or analytics logic changes.
- Added Phase 20.6 static tests for endpoint consumption, token configurability, guarded data boundaries, no embedded token value, and no merchant billing copy.

## 2026-04-25 - PROF1 Taste Profile Engine

- Added Postgres sidecar migration `021_prof1_user_taste_profiles.sql` for append-only taste profile snapshots and per-signal audit rows.
- Added mirrored PROF1 taste-profile engine helpers plus `prof1:build-user-taste-profiles` for deterministic snapshot builds from UX1 preferences, UX2 feedback, and promoted staged recipe metadata.
- Added PROF1 tests for explicit preference contribution, swipe polarity, note-signal polarity, staged metadata contribution, safe vector normalization, confidence classification, append-only snapshots, and dry-run safety boundaries.
- Added PROF1 docs, schema/data-model/repo-map/test-registry updates, test-run artifact, and handoff bundle.

## 2026-04-25 - Phase 20.5 Internal Access Guard

- Added a lightweight internal analytics access guard for Phase 20 market-intelligence endpoints.
- Added `PRICER_INTERNAL_ANALYTICS_TOKEN` support with `x-pricer-admin-token` and role placeholder header `x-pricer-role`.
- Protected gap detection, opportunity report, and merchant/admin insight endpoints with bounded `403 {"error":"forbidden"}` responses.
- Kept normal consumer endpoints such as home summary, product search, basket optimization, watchlist, and lists unguarded by this internal analytics guard.
- Added Phase 20.5 tests for missing/wrong/correct tokens, admin/analyst/merchant roles, missing env token, consumer-path exclusion, protected-path coverage, and token non-leakage.

## 2026-04-25 - UX2 Recipe Swipe Feedback System

- Added Postgres sidecar migration `020_ux2_recipe_swipe_feedback.sql` for append-only recipe feedback events plus child note signals.
- Added mirrored UX2 repository helpers and `ux2:seed-recipe-feedback` for deterministic impression/swipe/save/cooked feedback storage, manual note-signal attachment, aggregate summaries, and seed validation against existing UX1 profiles and DB4A recipes.
- Added UX2 tests for swipe semantics, saved/cooked defaults, note storage, manual note signals, latest-event reads, summary aggregation, deterministic seed reruns, and sidecar-only safety boundaries.
- Added UX2 docs, schema/data-model/repo-map/test-registry updates, test-run artifact, and handoff bundle.

## 2026-04-25 - Flutter Startup Hardening

- Changed mobile startup to render the Flutter shell immediately with safe local dependencies, then complete Firebase/Firestore bootstrap after the first frame.
- Added bounded Firebase, monetization, AdMob, and API request timeouts with local/in-memory fallbacks for startup failures.
- Switched the default Android local API URL to `http://10.0.2.2:5001` while preserving explicit `PRICER_API_BASE_URL` overrides.
- Delayed Firestore-backed home streams until after the first frame and kept hidden watchlist monetization streams inactive until selected.
- Added Flutter tests for pending/failed bootstrap, Firestore billing read failure, missing monetization config, and home-summary timeout error UI.

## 2026-04-25 - Phase 20.4 Merchant / Admin Insights API

- Added dashboard-ready merchant/admin insight helpers over existing gap detection and opportunity report outputs.
- Added `GET /analytics/insights/overview`, `/opportunities`, `/categories`, `/localities`, and `/chains`.
- Added consistent read-only response wrappers with `window`, applied `filters`, deterministic `generated_at`, bounded result arrays, and no mutation.
- Added category, locality, and chain aggregation over opportunity cards and coverage-by-chain evidence.
- Added Phase 20.4 tests for overview totals, aggregations, filters, empty data, determinism, and no-mutation behavior.

## 2026-04-25 - UX1 User Food Profile Foundation

- Added Postgres sidecar migration `019_ux1_user_food_profiles.sql` for user food profiles, constraints, preferences, and equipment availability.
- Added mirrored UX1 repository helpers plus `ux1:seed-user-food-profiles` for deterministic profile upserts, nutrition target updates, constraint/preference/equipment management, and seedable full profile bundles.
- Added UX1 tests for profile upsert, nutrition target updates, hard and soft constraints, preferences, equipment, full bundle reads, seed idempotency, and sidecar-only safety boundaries.
- Added UX1 docs, schema/data-model/repo-map/test-registry updates, test-run artifact, and handoff bundle.

## 2026-04-25 - Phase 20.3 Market Opportunity Reports

- Added deterministic `buildMarketOpportunityReports(...)` over existing gap signals for business-readable opportunity summaries.
- Added `GET /analytics/opportunities` with window, locality, category, chain/store, limit, and minimum-gap-score filters.
- Added opportunity types for missing supply, poor match quality, high price pressure, distribution gaps, data quality gaps, and emerging interest.
- Added confidence labels, evidence blocks, deterministic recommended actions, limitations, and stable sorting without LLMs or external services.
- Added Phase 20.3 tests for report generation, type classification, confidence, action text, filters, sorting, empty data, and no-mutation behavior.

## 2026-04-25 - Flutter Monetization Startup Guardrails

- Made RevenueCat and AdMob startup optional for local development when keys/IDs are missing, empty, or placeholder values.
- Disabled ad SDK initialization and ad widget rendering unless real current-platform AdMob app and ad unit IDs are supplied.
- Added Flutter tests proving placeholder monetization config stays disabled and missing RevenueCat initializes as a free profile.
- Verified `flutter analyze` and `flutter test` from `app/mobile`.

## 2026-04-25 - DB4D Recipe Quality And Readiness Reporting

- Added mirrored DB4D `recipe_quality_reports` modules plus `db4d:report-recipe-quality` for read-only canonical recipe readiness inspection across recipe ingredients, approved nutrition coverage, approved product mappings, and ingredient gap signals.
- Added DB4D tests for deterministic readiness math, missing ingredient/grams/nutrition/product reports, approved recipe nutrition coverage, gap ranking, filters, CLI parsing, and read-only safety boundaries.
- Updated DB4/Data Model/Schema/Repo/Test docs, registry entries, test-run artifact, and handoff for DB4D.

## 2026-04-25 - Phase 20.2 Chain and Store Segmentation for Gap Intelligence

- Extended `gap_signal_store` normalization with optional `chain_id`, `chain_name`, `store_id`, and `store_name` fields while keeping legacy signals compatible.
- Added optional chain/store filtering and grouping to gap summaries plus explicit `filters` output on summary responses.
- Added deterministic `buildGapCoverageByChain(...)` and `GET /analytics/gap-detection/coverage-by-chain` for chain-level demand coverage summaries.
- Threaded optional chain/store context through search, shopping-list, basket-planner, optimizer-forwarding, and watchlist owner-context capture paths.
- Added Phase 20.2 tests for legacy compatibility, chain/store normalization, filtering, grouping, coverage-by-chain, unknown chain handling, determinism, no-mutation, and handler capture.
- Updated repo/schema/data-model/test docs, registry entries, test-run artifact, and handoff for optional chain/store gap segmentation.

## 2026-04-25 - DB5C Staged Recipe Promotion With Usability States

- Added Postgres sidecar migration `018_db5c_recipe_promotion_usability.sql` to extend canonical recipes with usability and coverage metrics, allow nullable matched ingredient links on canonical recipe lines, and add `ingredient_gap_candidates` plus `recipe_promotion_history`.
- Added mirrored DB5C promotion/review service and `db5c:review-and-promote-recipe` CLI for staged recipe inspection, deterministic usability classification, canonical promotion, gap aggregation, and append-only review history.
- Added DB5C tests for partial-match promotion, nullable unmatched canonical ingredient lines, gap aggregation, usability rules, idempotent reruns, structurally invalid rejection, and no LLM/Firestore/ingredient-creation side effects.
- Updated DB5/Data Model/Schema/Repo/Test docs, registry entries, decision log, test-run artifact, and handoff for DB5C.

## 2026-04-25 - Phase 20.1 Locality-Aware Gap Intelligence

- Added nullable `locality_code` normalization to `gap_signal_store` records and threaded locality capture through product search, shopping-list/basket planning, optimizer forwarding, and watchlist owner context.
- Added deterministic `buildLocalityGapSummary(...)` plus `GET /analytics/gap-detection/localities` for top-gap rollups per locality.
- Kept existing global `GET /analytics/gap-detection` behavior intact by default while returning locality-shaped summaries when `locality_code` is explicitly requested.
- Added Phase 20.1 tests for locality signal identity, filtering, multi-locality aggregation, missing-locality handling, grouping, sorting, determinism, no-mutation, and handler capture.
- Updated repo/schema/data-model/test docs, registry entries, test-run artifact, and handoff for locality-aware gap analytics.

## 2026-04-24 - Phase 18.8 Mobile Visual Polish Pass

- Applied a minimal mobile visual polish pass across the Phase 18 screens without changing backend calls, routes, or user workflows.
- Standardized app screen padding to 16, tightened card/input/button radii, and normalized card/header typography through the shared UI primitives.
- Updated shared empty/error state presentation with consistent muted secondary text and retry spacing.
- Refined search, product, basket, watchlist, and saved-list card text hierarchy while preserving existing interactions.
- Updated requested empty-state copy for product search and saved lists, and kept widget tests passing after the copy change.

## 2026-04-24 - Phase 18.7 Mobile Saved Lists Polish

- Reworked mobile `/lists` into a backend-backed saved-list screen using owner-scoped `GET /lists`.
- Added mobile saved-list DTOs and API client methods for list, create, read, update, and delete operations with existing temporary owner headers.
- Added list loading, empty, error/retry, create-dialog, tap-to-detail, and delete-with-local-update behavior.
- Reworked `/list_detail` to fetch saved-list detail, edit name/items, save through `PATCH /lists/:id`, and navigate current items into `/optimize` without persisting optimizer output.
- Added widget coverage for loading/list rendering, empty state, create, detail fetch, edit/save, optimize navigation, delete, error/retry, and partial payload parsing.

## 2026-04-24 - DB3E Ingredient Product Equivalence

- Added Postgres sidecar migration `017_db3e_ingredient_product_equivalence.sql` for ingredient product candidates, reviewable mappings, and substitution groups. Migration `016` is already used by DB5B in this repo history.
- Added mirrored DB3E product repository and deterministic matching modules for candidate insertion, suggestion generation, idempotent mapping upserts, approved/rejected decision preservation, and ingredient product listing.
- Added `db3e:generate-product-ingredient-candidates` and `db3e:review-product-ingredient-mapping` CLIs.
- Added DB3E tests for candidate generation, deterministic matching, suggested-only behavior, idempotency, preserved reviewed decisions, ingredient-product linking, and no recipe/LLM/Firestore/runtime changes.
- Updated DB3/Data Model/Schema/Repo/Test docs, registry entries, decision log, test-run artifact, and handoff for DB3E.

## 2026-04-24 - Phase 20 Market Gap Detection

- Added internal `gap_signal_store` runtime collection for search, resolver/shopping-list, basket-input, and watchlist-add signals.
- Added deterministic `phase18/gap_detection.js` scoring, grouping, classification, and `GET /analytics/gap-detection` handler.
- Wired observation-only signal capture into product search, shopping-list resolution, and watchlist additions without changing response bodies.
- Kept gap-signal persistence non-blocking so save failures do not break existing optimizer or resolver responses.
- Added Phase 20 tests for scoring, price pressure, grouping, empty data, no-mutation, deterministic output, signal capture, and endpoint validation.
- Updated schema/data-model/repo maps, test registry, decision log, test-run artifact, and phase handoff.

## 2026-04-24 - Phase 18.6 Mobile Watchlist Screen Polish

- Reworked the mobile `/watchlist` screen into a backend-backed price tracker using `GET /watchlist/prices`.
- Added mobile DTOs and API client methods for watchlist price views and `DELETE /watchlist/:id`.
- Rendered watched product cards with best price, chain/store, deal badge, target-hit badge, and missing-price state.
- Added product-card navigation to `/product` and lightweight remove behavior with local list update and bounded failure feedback.
- Added widget coverage for loading, success, deal badge, target hit, missing price, product navigation, remove success/failure, empty-state search navigation, and partial payload parsing.

## 2026-04-24 - DB5B LLM-Assisted Recipe Extraction Into Staging

- Added follow-up migration `016_db5b_recipe_ingest_llm_extraction_status.sql` so recipe ingest jobs can move through `extracting` during bounded LLM extraction.
- Added mirrored DB5B prompt, strict extraction-schema validator, and recipe extraction service that reads raw DB5A jobs, validates strict JSON, matches existing DB3A ingredients deterministically, and writes only to DB5 staging tables.
- Added `db5b:extract-recipe-to-staging` CLI plus DB5B tests for valid staging, invalid JSON rejection, missing-title and empty-ingredient rejection, deterministic key/alias matching, unmatched staging, idempotent skip behavior, force restaging, and failure provenance.
- Updated DB5 recipe ingest docs, schema/data-model/repo map, registries, decision log, test-run artifact, and handoff for DB5B.

## 2026-04-24 - Phase 18.5 Mobile Optimize Basket Screen

- Replaced the `/optimize` placeholder with a real Flutter basket optimization screen backed by `POST /basket/optimize`.
- Added mobile basket optimizer DTOs and API client support for `canonical_with_enrichment` requests with explanation enabled and convenience/metrics disabled by default.
- Added editable comma/newline basket input, single-store vs multi-store strategy selection, loading, empty, success, and retry states.
- Rendered user-facing basket summaries, store cards, warnings, and explanation text while omitting internal `score_total`, raw metrics, and debug objects.
- Added widget coverage for missing args, draft route items, API calls, loading, success, explanation, retry, strategy selection, and internal-metric exclusion.

## 2026-04-24 - Phase 18.4 Mobile Search Results Screen

- Replaced the `/search` placeholder with a real Flutter product search screen backed by `POST /products/search`.
- Added mobile product-search DTOs and API client support for `canonical_with_enrichment` product catalog searches.
- Added search-screen loading, empty-query, empty-results, error/retry, partial-payload, and in-screen re-search behavior.
- Wired result cards to `/product` using `canonicalProductId` route arguments.
- Added widget coverage for missing query safety, initial-query fetch/render, result card fields, result tap navigation, retry, empty results, re-search, and partial payload parsing.

## 2026-04-24 - DB5A Rich Recipe Ingest Staging Foundation

- Added Postgres sidecar migration `015_db5a_rich_recipe_ingest_staging.sql` for raw-preserving recipe ingest jobs, staged recipes, staged ingredients, staged steps, and rich staged metadata child tables.
- Added mirrored recipe ingest staging repositories plus `db5a:seed-recipe-ingest-staging` fixture CLI.
- Added rich staged recipe seed fixtures and DB5A tests for raw preservation, nullable ingredient matching, staged child metadata, review filtering, no canonical recipe writes, no ingredient creation, no LLM, and no Firestore/runtime behavior changes.
- Added DB5 recipe ingest docs, schema/data-model/repo-map/test-registry updates, test-run artifact, and operator handoff.

## 2026-04-24 - Phase 18.3 Home Search + Add-to-Basket Entry

- Added a top home-screen input with the exact placeholder `Search products or add to basket...`.
- Changed home search submit, search button, voice capture, and recent-search chips to navigate to `/search` with `query` route arguments instead of running the legacy results flow directly.
- Added an `Add to basket` action that parses comma/newline-separated draft items and navigates to `/optimize` with an `items` argument.
- Updated `/search` and `/optimize` placeholders to render passed query/draft items safely until full screens are implemented.
- Added widget coverage for input rendering, Enter/search navigation, add-to-basket parsing/navigation, empty input safety, and route argument handling.

## 2026-04-24 - Secrets And Setup Audit Refresh

- Reworked `docs/needed_secrets.md` into a current have/need/operator checklist for Firebase, xAI, RevenueCat, AdMob, FCM, mobile release, and optional Postgres setup.
- Added operational readiness and account/key blockers to `MASTER_PRODUCT_SPEC.md` so product roadmap work stays tied to launch prerequisites.

## 2026-04-24 - Phase 18.2 Mobile Product Detail Screen

- Replaced the `/product` placeholder with a real Flutter product detail screen backed by existing product, deal-check, and watchlist APIs.
- Added mobile DTOs and API client methods for canonical product details, product deal checks, and owner-scoped watchlist adds.
- Added loading, missing-argument, not-found, retry, deal-unavailable, and watchlist success/failure handling for the product route.
- Added widget coverage for product route safety, product rendering, deal rendering/failure, watchlist add, API retry, and home deal navigation.

## 2026-04-24 - Phase 18.1 Mobile Navigation Wiring

- Added simple Flutter named routes for search, watchlist, lists, list detail, basket optimization, and product placeholders.
- Replaced home summary quick-action snackbars with real `Navigator.pushNamed(...)` flows.
- Made home saved-list, watchlist-highlight, and deal cards tappable with simple route arguments.
- Added widget coverage for quick-action navigation, saved-list navigation, deal navigation, watchlist navigation, route existence, missing arguments, and unchanged home rendering.

## 2026-04-24 - Phase 18.0 Mobile Home Screen Integration

- Wired the Flutter home screen to `GET /home/summary` through the existing mobile API client and anonymous owner context.
- Added app-facing home summary DTOs and compact home sections for top deals, watchlist highlights, saved-list shortcuts, market highlights, and quick actions.
- Added Flutter widget coverage for loading, content rendering, empty sections, retry behavior, partial payload parsing, and owner-context use.

## 2026-04-24 - Phase 17.5 Home Summary Feed

- Added `buildHomeSummary(...)` as a read-only app home feed aggregator.
- Added `GET /home/summary` with temporary owner-header support and optional section limits.
- Added Phase 17.5 tests for top-level shape, owner-scoped watchlist/list sections, limits, quick actions, internal-metric exclusion, empty state, and no-mutation behavior.

## 2026-04-24 - Phase 17.4 Market Trends

- Added read-only market/category trend summaries with grouping by category, brand, and base product.
- Added `POST /market/trends` and `GET /market/overview` for internal/power-user insight views.
- Added Phase 17.4 tests for trend classification, filters, deal density, no-mutation behavior, and API validation.

## 2026-04-24 - DB3A Canonical Ingredients

- Added Postgres migration `009_db3a_canonical_ingredients.sql` for canonical Pricer ingredients.
- Added mirrored ingredient repository modules, seed fixture, and `db3a:seed-ingredients` CLI.
- Added DB3A tests and registry coverage for stable keys, idempotent upserts, alias search, Bulgarian names, no-delete behavior, review filtering, and USDA boundary safety.

## 2026-04-24 - DB3B Ingredient Inspection Reports

- Added read-only ingredient inspection reports and `db3b:report-ingredients` CLI.
- Added DB3B tests for summaries, missing-field reports, duplicate names, alias collisions, unmapped ingredients, filters, and read-only behavior.

## 2026-04-24 - DB3C Ingredient Nutrition Profile Candidates

- Added Postgres sidecar migration for `ingredient_nutrition_profile_candidates`.
- Added mirrored DB3C profile candidate generator modules and CLI.
- Added DB3C tests for approved mapping eligibility, USDA macro joins, per-100g output, idempotent upserts, review-status preservation, and dry-run behavior.

## 2026-04-24 - DB3D Approved Ingredient Nutrition Profiles

- Added Postgres sidecar migration for approved ingredient nutrition profiles and profile review history.
- Added mirrored DB3D review service and CLI for candidate listing, candidate detail, approval, rejection, needs-review marking, and approved-profile listing.
- Added DB3D tests for approval, rejection, history, no accidental overwrite, deterministic superseding, invalid transitions, provenance, and safety boundaries.

## 2026-04-24 - DB4C Approved Recipe Nutrition Profiles

- Added Postgres sidecar migration `014_db4c_recipe_nutrition_profiles.sql` for approved recipe nutrition profiles and recipe profile review history.
- Added mirrored DB4C review service and `db4c:review-recipe-nutrition-profile` CLI for candidate listing, candidate detail, approval, rejection, needs-review marking, and approved-profile listing.
- Added DB4C tests for recipe-context detail, approval, rejection, history, no accidental overwrite, deterministic superseding, invalid transitions, provenance, and no Firestore/LLM/runtime behavior changes.

## 2026-04-24 - DB4B Recipe Nutrition Profile Candidates

- Added Postgres sidecar migration `013_db4b_recipe_nutrition_profile_candidates.sql` for recipe nutrition profile candidates.
- Added mirrored DB4B recipe nutrition generator modules plus `db4b:generate-recipe-nutrition-profiles` CLI.
- Added DB4B tests for nutrient aggregation math, per-serving calculation, missing input tracking, confidence assignment, idempotent review-status-preserving upserts, zero-valid skips, and no Firestore/LLM/runtime behavior changes.

## 2026-04-24 - DB4A Canonical Recipes

- Added Postgres sidecar migration `012_db4a_canonical_recipes.sql` for canonical recipes, recipe ingredient lines, and ordered steps.
- Added mirrored recipe repository modules plus `db4a:seed-recipes` fixture CLI.
- Added fixture recipes linked only to existing DB3A ingredient keys and DB4A tests for idempotent upserts, ingredient linking, missing-key rejection, ordered steps, no USDA FDC recipe lines, and no Firestore/LLM/runtime behavior changes.

## 2026-04-24

### Added
- Full schema map at `docs/SCHEMA_MAP.md`, covering runtime flat/Firestore collections, client Firestore user state, Postgres sidecar tables, relationship paths, document IDs, and schema ownership rules.
- Repo navigation map at `docs/REPO_MAP.md`, indexed by feature area, schema ownership, backend/mobile source trees, scripts, tests, and documentation responsibilities.
- Agent workflow requirements in `AGENTS.md` and `CLAUDE.md` to consult and maintain the repo map before broad searches or future feature work.
- Phase 17.3 simple deal detection with deterministic `good`, `normal`, and `expensive` signals, watchlist price-view integration, basket item deal annotations, and `POST /products/deal-check`
- Phase 17.3 tests, docs, implementation contract, test-run artifact, and handoff bundle
- Phase 17.2 owner-scoped watchlist tracker foundation with `watchlist_store`, CRUD helpers, REST endpoints, and a read-only current-price view backed by Phase 16.0 price lookup
- Phase 17.2 tests, implementation contract, test-run artifact, and handoff bundle
- Phase 17.1 owner-scoped saved lists with `owner_id`, `owner_type`, temporary owner-header extraction, cross-owner access blocking, and backward-compatible anonymous defaults
- Phase 17.1 tests, implementation contract, test-run artifact, and handoff bundle
- Phase 17 saved shopping lists with `saved_lists_store`, CRUD helpers, REST endpoints, and saved-list optimization reruns
- Phase 17 tests, docs, implementation contract, test-run artifact, and handoff bundle
- Phase 16.7 internal basket health diagnostics with deterministic alerts, thresholds, and `GET /analytics/basket-health`
- Phase 16.7 tests, docs, implementation contract, test-run artifact, and handoff bundle
- DB2.5C read-only USDA cluster candidate inspection reports with collision, confidence, qualifier, score, and ambiguous-core-food review targeting
- DB2.5D USDA cluster materialization preview with proposed cluster/member tables, deterministic representative selection, dry-run CLI, idempotent upserts, and reviewed-status preservation
- DB2.5E USDA cluster review workflow with review provenance fields, append-only review history, queue/detail helpers, CLI review actions, and terminal status transition guards
- DB2.5F ingredient nutrition mapping suggestions from approved USDA clusters to Pricer ingredients, with deterministic exact/alias/state matching, review history, CLIs, and sidecar-only tests
- DB2.5B USDA cluster candidate batch generator with macro-presence checks, dry-run support, data-type filters, idempotent candidate upserts, CLI runner, and fixture tests
- DB2.5 USDA deterministic cluster candidate table, parser, repository helpers, design document, and tests for conservative food clustering
- DB2.5 over-collapse guard tests for apple, rice, milk, mushroom, chicken breast, and canned beans
- Phase 16.6 persistent basket analytics layer with `basket_analytics_store`, safe metrics persistence, aggregate summary helpers, and `GET /analytics/basket-summary`
- Phase 16.6 tests, docs, implementation contract, test-run artifact, and handoff bundle
- Phase 16.5 deterministic basket quality metrics layer with resolver, pricing, optimization, and convenience monitoring helpers
- Optional `optimizer_options.include_metrics = true` support on `POST /basket/optimize`
- Phase 16.5 tests, docs, implementation contract, test-run artifact, and handoff bundle
- DB2 USDA importer row-level validation for incomplete or orphaned food, nutrient, food-nutrient, and food-portion rows, with skipped-row metadata stored on import runs
- DB2 additive migration for `usda_import_runs.metadata_json`
- Phase DB2 USDA macro-only Postgres sidecar import with normalized USDA food, nutrient, food-nutrient, portion, measure-unit, category, and import-run tables
- DB2 streaming USDA CSV importer, full-import script, fixture dataset, and mirrored USDA DB modules under both backend trees
- DB2 scripts for `npm run import:usda:macros` and `npm run test:db2`
- DB2 implementation contract, test registry entries, and sidecar-only documentation updates
- Phase DB1 Postgres sidecar foundation with local compose support, mirrored DB client modules, migration tooling, health checks, and import metadata repository helpers
- DB1 import metadata migration for `source_datasets`, `source_files`, and `import_batches`
- DB1 scripts for `npm run db:health`, `npm run db:migrate`, and `npm run test:db1`
- DB1 tests, implementation contract, test-run artifact, and handoff bundle
- Phase DB0 Postgres transition architecture document defining the hybrid persistence boundary for Postgres source truth, Firestore app-facing cache, and Firebase Functions service access
- Phase DB0 handoff bundle for the design-only Postgres transition phase
- Phase 16.3 basket explanation layer with app-ready headlines, summaries, store summaries, item notes, warnings, and limitations
- Optional `optimizer_options.include_explanation = true` support on `POST /basket/optimize`
- Phase 16.3 tests, docs, implementation contract, test-run artifact, and handoff bundle
- Phase 16.4 optional convenience scoring layer with effective totals, convenience penalties, user-context chain/store preferences, and explanation integration
- Phase 16.4 tests, docs, implementation contract, test-run artifact, and handoff bundle
- Phase 16.2 bounded multi-store basket optimizer that compares split baskets against the best single-store option
- `optimizer_options.strategy = "multi_store"` support on `POST /basket/optimize`
- Phase 16.2 tests, docs, implementation contract, test-run artifact, and handoff bundle
- Phase 16.1 deterministic single-store basket optimizer with explainable actual totals, score totals, missing/stale warnings, ambiguous candidate handling, and bounded `POST /basket/optimize` route
- a dedicated `phase16/basket_optimizer.js` runtime module in both `app/functions/src/` and `functions/src/`
- Phase 16.1 tests for scoring, penalty separation, missing/stale handling, ambiguous policies, EUR currency, endpoint validation, deterministic tie-breaking, and no-mutation behavior
- Phase 16.1 docs, implementation contract, test-run artifact, and handoff bundle
- Phase 16.0 deterministic canonical price-lookup layer with a bounded HTTP route and basket-plan helper for optimization-ready price access
- a dedicated `phase16/price_lookup.js` runtime module in both `app/functions/src/` and `functions/src/`
- Phase 16.0 tests for latest-price lookup, stale and missing handling, chain/store filtering, basket-plan collection, and no-mutation behavior
- Phase 16.0 docs, implementation contract, test-run artifact, and handoff bundle
- Phase 15.4 basket-input planner service and HTTP route for optimization-ready basket planning contracts
- a dedicated `phase15/basket_planner.js` runtime module in both `app/functions/src/` and `functions/src/`
- Phase 15.4 tests for planner readiness, policy handling, marker preservation, and no-mutation behavior
- Phase 15.4 docs, implementation contract, test-run artifact, and handoff bundle
- Phase 15.3 smart shopping-list resolution service and HTTP route for ranked canonical product candidate resolution
- a dedicated `phase15/shopping_list.js` runtime module in both `app/functions/src/` and `functions/src/`
- Phase 15.3 tests for resolved, ambiguous, unresolved, ranking-reason, validation, and no-mutation behavior
- Phase 15.3 docs, implementation contract, test-run artifact, and handoff bundle

### Changed
- Kept deal detection as a signal layer only; it does not create alert rules, send notifications, mutate price data, or require user setup beyond optional target prices
- Kept watchlist tracker records reference-only by storing owner metadata, canonical product ids, labels, target prices, notes, and timestamps without copying price snapshots into watchlist records
- Kept saved-list APIs route-compatible while filtering create/list/get/update/delete/optimize by resolved owner context
- Kept saved-list optimization stateless by storing only user input and re-running resolver, planner, price lookup, and optimizer on demand
- Extended basket analytics summaries with additive `average_stale_rate` and `average_savings_rate` fields for health diagnostics
- Extended DB2.5 representative scoring metadata with explicit `has_macro_data` for candidate review tooling
- Kept `/basket/optimize` behavior unchanged by persisting metrics only when both `include_metrics=true` and `persist_metrics=true`
- Kept `POST /basket/optimize` backward-compatible by omitting metrics unless `include_metrics=true`
- DB2 USDA macro import now treats incomplete and orphaned real USDA source rows as source-quality skips instead of crashing the whole import
- Kept DB2 fixture-based verification out of the full USDA import path so normal `npm test` does not require the 3GB USDA dataset or a configured Postgres instance
- Updated DB1 migration-runner tests to allow later migrations while still verifying DB1 checksum/idempotency behavior
- Updated Postgres-sidecar docs and env examples while preserving the existing Firestore/flat-store product runtime
- Updated architecture, data-model, current-state, and decision-log docs to reflect the DB0 Postgres transition strategy and dedupe-first ingest contract
- Kept `POST /basket/optimize` backward-compatible by preserving the single-store response shape unless `strategy: "multi_store"` is requested
- Kept `POST /basket/optimize` backward-compatible by omitting explanation unless `include_explanation=true`
- Kept `POST /basket/optimize` backward-compatible by omitting convenience scoring unless `include_convenience_scoring=true`
- Corrected Phase 16.0 price lookup currency output from `BGN` to `EUR`; source prices are treated as EUR and no currency conversion is performed
- Added explicit `is_stale` flags to price lookup records so optimizers can exclude stale records deterministically
- Wired Firebase Functions HTTP route `POST /basket/optimize`
- Wired Firebase Functions HTTP route `POST /prices/lookup`
- Exposed canonical price lookup helpers and basket-plan price lookup through both shared runtime export surfaces
- Kept price lookup deterministic on existing `raw_price_snapshots`, `source_products`, `canonical_product_mappings`, and `product_daily_prices` instead of introducing a parallel price schema
- Wired Firebase Functions HTTP route `POST /basket/plan`
- Wired Firebase Functions HTTP route `POST /shopping-list/resolve`
- Updated the product-service module with a reusable search adapter so smart shopping-list resolution can stay on the same service layer

### Verified
- `node tests/phase_17_saved_shopping_lists.test.js`
- `node tests/phase_16_7_basket_health.test.js`
- `node tests/phase_16_6_basket_analytics.test.js`
- `node tests/phase_16_5_basket_quality.test.js`
- `npm run test:db2`
- `node tests/db1_postgres_foundation.test.js`
- `npm run db:health`
- `npm run db:migrate`
- `npm run validate:docs`
- `node tests/phase_16_2_multi_store_optimizer.test.js`
- `node tests/phase_16_3_basket_explanation.test.js`
- `node tests/phase_16_4_convenience_scoring.test.js`
- `node tests/phase_16_1_basket_optimizer.test.js`
- `node tests/phase_16_0_price_lookup.test.js`
- `node tests/phase_15_4_basket_input_planner.test.js`
- `node tests/phase_15_3_shopping_list_resolution.test.js`
- `npm test`

## 2026-04-23

### Added
- Phase M0 meal foundations with mirrored `meal/catalog`, `meal/units`, `meal/bridge`, and `meal/shared` runtime modules under both `app/functions/src/` and `functions/src/`
- Phase M0 tests for ingredient/store integration, unit conversion, and deterministic product-to-ingredient pricing fallback behavior
- Phase M0 handoff bundle under `handoff/phase_m0/`
- Phase M0 test-run artifact at `docs/test_runs/phase_m0_2026-04-23.json`
- Phase A recipe repo-truth inspection report at `docs/PHASE_A_RECIPE_REPO_TRUTH_REPORT.md`
- Phase A handoff bundle under `handoff/phase_A/`
- Phase A test-run artifact at `docs/test_runs/phase_a_2026-04-23.json`
- Phase 15.2 product API layer with bounded canonical product detail, search, filter-facet, and enrichment-summary handlers plus live HTTP routes
- a dedicated `phase15/service.js` runtime module in both `app/functions/src/` and `functions/src/`
- Phase 15.2 tests for product detail, bounded search/filter responses, explicit layer-mode validation, facets, analytics summaries, and no canonical mutation
- Phase 15.2 docs, implementation contract, test-run artifact, and handoff bundle

### Changed
- Extended the shared flat backend store with meal-domain collections for ingredient families, ingredient categories, ingredients, product ingredient mappings, units, unit conversions, and ingredient unit rules
- Exposed deterministic meal-foundation helpers through both runtime export surfaces without collapsing ingredients into `canonical_products`
- Updated current-state, architecture, data-model, test-registry, and phase docs to reflect the new parallel meal domain and explicit bridge boundaries
- Recorded the repo-truth conclusion that Pricer is currently product-price-query-basket infrastructure with no implemented ingredient, recipe, component, pantry, household, or meal-plan domain yet
- Recorded the recommended architecture for adding meal intelligence as a parallel domain plus explicit bridge layers instead of extending `canonical_products` directly
- Wired Firebase Functions HTTP routes for `/products/:id`, `/products/search`, `/products/filter-facets`, and `/analytics/enrichment-summary`
- Updated repo test runners and registries to include the Phase 15.2 product API suite and coverage

### Verified
- `node tests/phase_m0_ingredient.test.js`
- `node tests/phase_m0_conversion.test.js`
- `node tests/phase_m0_mapping.test.js`
- `node tests/phase_1_data_backbone.test.js`
- `node tests/phase_11_production_persistence.test.js`
- `node tests/phase_15_2_product_api.test.js`
- `npm run verify`
- `npm run validate:docs`
- `node tests/phase_15_2_product_api.test.js`

### Added
- Phase 15 hyper-rich enrichment layer with a strict repo-owned enrichment schema, controlled category hierarchy, and additive `canonical_enrichment_store` persistence keyed by canonical fingerprint
- Phase 15.1 enrichment propagation helpers for explicit canonical/enrichment/applied-view readers, deterministic enrichment-backed search and filtering, and lightweight enrichment analytics rollups
- a dedicated `phase15/enrichment.js` runtime module in both `app/functions/src/` and `functions/src/`
- a dedicated `phase15/readers.js` runtime module in both `app/functions/src/` and `functions/src/`
- Phase 15 tests for enrichment caching, invalid-output rejection, schema enforcement, category constraints, and canonical-grouping safety
- Phase 15.1 tests for reader layer boundaries, enrichment-backed filters, analytics rollups, and non-fatal live enrichment when `XAI_API_KEY` is missing
- Phase 15 docs, implementation contract, test-run artifact, and handoff bundle

### Changed
- Updated Phase 6 ingest so canonical products now reuse cached enrichment records or optionally request strict LLM enrichment only for net-new canonical fingerprints
- Updated Phase 6 ingest and Phase 15 runtime defaults so live enrichment is intended to be enabled unless explicitly disabled, while missing keys remain non-fatal and cache-first behavior stays intact
- Updated the shared store shape to include `canonical_enrichment_store` plus `getEnrichmentByFingerprint(...)` and `storeEnrichment(...)` helpers
- Updated ingest-run outputs and pipeline logging with canonical enrichment coverage, creation, reuse, rejection, offline-miss, and sample metrics
- Updated architecture, current-state, secrets/examples, decision-log, and test-registry docs to reflect explicit enrichment reader boundaries, analytics contracts, and Phase 15.1 coverage
- Updated `tests/run_all.js` and `package.json` to include the Phase 15 and Phase 15.1 suites

### Verified
- `node tests/phase_15_hyper_rich_enrichment.test.js`
- `node tests/phase_15_1_enrichment_readers.test.js`
- `node tests/phase_1_data_backbone.test.js`
- `node tests/phase_6_production_pipeline.test.js`
- `node tests/phase_11_production_persistence.test.js`

## 2026-04-22

### Added
- Phase 14.3 controlled disambiguation application layer that reads effective decisions, enforces deterministic hard-marker conflicts, returns merge/block/skip/no-op audit buckets, attaches ingest-run previews, and can produce an applied grouping map without mutating canonical truth
- Phase 14.2 human override semantics for canonical disambiguation decisions, including human review writes, human-over-LLM effective decision resolution, reviewed queue status tracking, review summary metrics, and provenance fields for reviewer notes
- Phase 14.1 opt-in LLM disambiguation caller for pending canonical warning queue items, including dry-run metrics, cache-first decision reuse, deterministic batching, strict response validation, and provenance-preserving decision persistence
- repo-root Firebase deployment manifests at `firebase.json` and `.firebaserc`
- a deployable `functions/src/` runtime copy so Cloud Functions no longer import backend modules from outside the deploy source tree
- a Firestore-backed backend persistence adapter with environment-based store selection for production, local JSON CLI runs, and in-memory tests
- Phase 11 production-persistence tests for Firestore round-trips, idempotent writes, and runtime backend selection
- Phase 1 data backbone modules under `app/functions/src/phase1/`
- Phase 1.5 multilingual modules under `app/functions/src/phase1_5/`
- Phase 2 matching modules under `app/functions/src/phase2/`
- Phase 3 AI-layer modules under `app/functions/src/phase3/`
- Phase 3.5 aggregation modules under `app/functions/src/phase3_5/`
- Phase 4 query-engine modules under `app/functions/src/phase4/`
- Phase 4 sync modules under `app/functions/src/sync/`
- Phase 5 Flutter mobile scaffold under `app/mobile/`
- mobile API, Firestore repository, voice input, and widget test code for search, lists, and watchlist flows
- shared mobile UI system files for spacing, theming, reusable cards, and chart framing
- recent activity service and Phase 5.5 UI/growth static verification
- Flutter localization configuration, ARB files, generated localizations, and Phase 5.6 verification
- Phase 6 production modules for streamed ZIP ingest, scheduler-ready orchestration, analytics, alert detection, logging, Grok ambiguity escalation, and embedding backfill
- a scheduler-ready CLI runner at `scripts/run_phase6_pipeline.js`
- Phase 7 demand-intelligence modules for zero-result query capture, manual unmet-demand feedback, aggregation, deterministic embedding backfill, clustering, and reporting endpoints
- a demand-intelligence CLI runner at `scripts/run_phase7_demand.js`
- Phase 8 best-basket modules for deterministic single-store and multi-store basket optimization
- Phase 9 watchlist-intelligence modules for recurrence, cooldown-aware nudges, target-price handling, summaries, and insights
- Phase 10 monetization modules for flat entitlement sync, premium gating, RevenueCat-backed mobile subscriptions, AdMob wrappers, and a localized paywall
- Phase 11 deployment-audit docs and handoff artifacts for env vars, required services, blocker inventory, and production operator steps
- Phase 12 search-quality modules for canonical terms, synonym mapping, canonical query objects, conservative typo correction, and demand-log-driven learning
- stable `snapshot_id` and `source_product_id` hashing
- deterministic enrichment, matching, AI fallback, and aggregation layers
- flat SQL sync targets
- flat vector sync targets
- automated Phase 1, 1.5, 2, 3, 3.5, 4, 5, 5.5, 5.6, 6, 7, 8, 9, and 10 test coverage under `tests/`
- a repo-aligned `MASTER_PRODUCT_SPEC.md` documenting the current source-product-backed identity model

### Changed
- Added Phase 14.0 audited LLM disambiguation scaffolding so unresolved canonical warnings now persist as durable queue records with stable pair fingerprints, reusable decision-store records, and a dry-run adjudication path that intentionally does not change live canonical merges yet
- Kept LLM canonical disambiguation provenance-only in Phase 14.1 so valid decisions are stored but never silently applied to `canonical_products` or `canonical_product_mappings`
- Kept Phase 14.2 human decisions provenance-only as well; human decisions now outrank LLM decisions for later read-path resolution but still do not mutate live canonical grouping
- Kept Phase 14.3 as a policy/applied-view layer only; it can compute decision effects and audit logs, but it does not rewrite canonical IDs, source-product identity, chain/product dedupe, or existing canonical mappings
- Tightened the canonical product layer with deterministic numeric-family markers so count variants like `6 pcs` versus `10 pcs`, age-band variants like `3-5 years` versus `6+`, and reserve tiers like `Reserv 12` versus `Reserve 18` now block merges, while equivalent formatting variants still merge and bare ambiguous numbers stay unresolved
- Tightened the canonical product layer with deterministic volume and size guards so equivalent formatting such as `750ml`, `0.75L`, `70cl`, `2.5kg`, and `2500 g` now normalizes safely, while true size differences such as `0,750` versus `1,50` or `500g` versus `1kg` no longer merge
- Tightened the canonical product layer with deterministic year and age-statement guards so vintage years such as `1991` versus `1997` and aged expressions such as `12 years` versus `18 years` no longer merge across chains
- Tightened the canonical product layer again with deterministic numeric-range guards so explicit size and weight bands such as `300-400`, `400/600`, and unit-suffixed ranges no longer merge across chains
- Tightened the Phase 13 canonical product layer with explicit deterministic guards for infant-formula stages, kids age bands, flavors, colors, and pack-count variants, reducing risky merges while preserving the additive cross-chain architecture
- Added a Phase 13 deterministic cross-chain canonical product layer with flat `canonical_products` and `canonical_product_mappings`, conservative canonical keys, canonical-group diagnostics, and warning logs for potentially risky merges
- Added Phase 6 pre-enrichment dedupe buckets keyed by normalized source chain plus product code so full-archive ingest reuses enrichment results across repeated store rows while preserving stable snapshot and source-product identity behavior
- Added conservative filename-derived source metadata extraction for KolkoStruva CSV entries and persisted that provenance into raw snapshots, source products, and ingest logs
- Updated Phase 6 ZIP ingest to iterate every supported CSV entry in each KolkoStruva daily archive, aggregate archive-wide totals, and preserve duplicate suppression across files while staying streaming-safe
- Updated the Firebase Functions entrypoint to load backend handlers from the local deploy package instead of `../app/functions/src`
- Updated the deployable `functions/package.json` to include backend runtime dependencies required by the vendored source tree, including `yauzl`
- Migrated backend store-backed service flows to an async persistence contract so Firestore runtime reads and writes complete reliably
- Updated Phase 11 deployment docs and handoff artifacts now that the JSON-only backend persistence blocker is closed in code
- Fixed the Flutter localization generation layout so ARB files remain in `app/mobile/lib/l10n/`, generated Dart files are emitted into `app/mobile/lib/src/generated/l10n/`, and mobile imports now target the generated source directory
- Expanded Phase 4 docs into an explicit query-engine and sync contract
- Updated the shared store shape with flat SQL/vector sync targets plus Phase 6 pipeline, analytics, and alert collections
- Updated the shared store shape with flat Phase 7 demand collections and hooked zero-result query capture into the existing Phase 4 service flow
- Added a Phase 8 basket optimizer that reuses Phase 4 item results and bounds store-combination search deterministically
- Added a Phase 9 watchlist-intelligence layer on top of Phase 6 alerts and daily prices without introducing LLM usage
- Added a Phase 10 backend entitlement layer that keeps premium checks authoritative on the backend while preserving backward-compatible unsynced watchlist behavior
- Added Flutter subscription and ad services, premium upgrade entry points, and native Android/iOS metadata for billing and AdMob integration
- Updated feature and phase status docs to reflect completed mobile, localization, and production-pipeline code
- Updated test execution to run the Phase 5 scaffold suite through `tests/run_all.js`
- Updated current-state and data-model docs with the Phase 5 mobile app and Firestore collection contract
- Refined the Flutter screens around savings-first hierarchy, rerun shortcuts, share CTA, good-price indicator, and watchlist urgency
- Updated test execution to run the Phase 5.5 UI-and-growth suite through `tests/run_all.js`
- Replaced hardcoded mobile UI copy with Flutter l10n lookups and locale-aware formatting helpers
- Updated test execution to run the Phase 5.6 localization suite through `tests/run_all.js`
- Updated Flutter Firebase bootstrap logic so a real generated `firebase_options.dart` can replace the placeholder cleanly
- Updated test execution to run the Phase 6 production-pipeline suite through `tests/run_all.js`
- Updated test execution to run the Phase 7 demand-intelligence suite through `tests/run_all.js`
- Updated test execution to run the Phase 8 best-basket suite through `tests/run_all.js`
- Updated test execution to run the Phase 9 watchlist-intelligence suite through `tests/run_all.js`
- Updated test execution to run the Phase 10 monetization suite through `tests/run_all.js`
- Updated current-state, registry, and deployment docs to reflect the real production blockers found during the Phase 11 repo-wide audit
- Updated Phase 2 matching to use canonical query fields while remaining deterministic and LLM-free on the main path
- Updated test execution to run the Phase 12 search-quality suite through `tests/run_all.js`

### Verified
- `npm run test:phase6`
- `node tests/phase_6_production_pipeline.test.js`
- `node -e "require('./index.js'); console.log('functions package entrypoint loaded')"` run in `functions/`
- `npm run validate:docs`
- `node -e "require('./functions/src/phase6/ingest'); console.log('phase6 ingest module loaded')"`
- `@' ... '@ | node -` against `tmp/phase6_real/2026-04-21.zip` to capture canonical product counts, merge counts, sample groups, and warning counts
- `npm run test:phase7`
- `node tests/phase_7_demand_intelligence.test.js`
- `npm run test:phase8`
- `node tests/phase_8_best_basket.test.js`
- `npm run test:phase9`
- `node tests/phase_9_watchlist_intelligence.test.js`
- `npm run test:phase10`
- `npm run test:phase12`
- `npm test`
- `flutter test`
- `npm run verify`
- `npm run validate:docs`
