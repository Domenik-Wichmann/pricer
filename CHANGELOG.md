# Changelog

## 2026-04-24

### Added
- Phase DB1 Postgres sidecar foundation with local compose support, mirrored DB client modules, migration tooling, health checks, and import metadata repository helpers
- DB1 import metadata migration for `source_datasets`, `source_files`, and `import_batches`
- DB1 scripts for `npm run db:health`, `npm run db:migrate`, and `npm run test:db1`
- DB1 tests, implementation contract, test-run artifact, and handoff bundle
- Phase DB0 Postgres transition architecture document defining the hybrid persistence boundary for Postgres source truth, Firestore app-facing cache, and Firebase Functions service access
- Phase DB0 handoff bundle for the design-only Postgres transition phase
- Phase 16.3 basket explanation layer with app-ready headlines, summaries, store summaries, item notes, warnings, and limitations
- Optional `optimizer_options.include_explanation = true` support on `POST /basket/optimize`
- Phase 16.3 tests, docs, implementation contract, test-run artifact, and handoff bundle
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
- Updated Postgres-sidecar docs and env examples while preserving the existing Firestore/flat-store product runtime
- Updated architecture, data-model, current-state, and decision-log docs to reflect the DB0 Postgres transition strategy and dedupe-first ingest contract
- Kept `POST /basket/optimize` backward-compatible by preserving the single-store response shape unless `strategy: "multi_store"` is requested
- Kept `POST /basket/optimize` backward-compatible by omitting explanation unless `include_explanation=true`
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
- `node tests/db1_postgres_foundation.test.js`
- `npm run db:health`
- `npm run db:migrate`
- `npm run validate:docs`
- `node tests/phase_16_2_multi_store_optimizer.test.js`
- `node tests/phase_16_3_basket_explanation.test.js`
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
