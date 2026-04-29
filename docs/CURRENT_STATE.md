# Current State

## Status
Phase 20.6 internal insights dashboard stub is now implemented and verified on April 26, 2026. The backend now serves `GET /internal/insights/dashboard`, a simple internal HTML surface with browser-local token entry, role/window/filter controls, overview cards, and tables for top opportunities, categories, localities, and chains. The dashboard sends `x-pricer-admin-token` and `x-pricer-role` to the existing guarded `/analytics/insights/*` endpoints; the page shell itself stores no token server-side, embeds no token value, does not add billing, does not change analytics logic, and is not merchant-polished UI.

Phase 20.5 internal access guard is now implemented and verified on April 25, 2026. The Phase 20 market-intelligence endpoints now require the temporary `x-pricer-admin-token` header to match `PRICER_INTERNAL_ANALYTICS_TOKEN`, with `x-pricer-role` allowing `admin` and `analyst` while denying `merchant` for now. Missing token config denies protected endpoints by default, and rejection responses are bounded to `{"error":"forbidden"}` without token or config detail. Normal consumer endpoints such as `/home/summary`, `/products/search`, `/basket/optimize`, `/watchlist`, and `/lists` are not protected by this internal analytics guard.

Phase 20.4 merchant/admin insights API is now implemented and verified on April 25, 2026. The backend now exposes dashboard-ready read helpers and `GET /analytics/insights/overview`, `/analytics/insights/opportunities`, `/analytics/insights/categories`, `/analytics/insights/localities`, and `/analytics/insights/chains` over the existing gap and opportunity report layers. Responses include `window`, applied filters, deterministic `generated_at`, bounded result sizes, and aggregates for totals, top opportunities, categories, localities, and chain coverage. This phase does not change the lower-level analytics endpoints, add persistence, call LLMs, call external services, or mutate `gap_signal_store` or runtime product/user data.

Phase 20.3 market opportunity reports are now implemented and verified on April 25, 2026. The backend now exposes a deterministic read-only `buildMarketOpportunityReports(...)` helper and `GET /analytics/opportunities` endpoint over existing gap signals. Reports convert raw gap/locality/chain evidence into business-readable opportunity cards with opportunity type, confidence, locality/category/chain/store context, evidence, deterministic recommended action text, and explicit limitations. This phase does not use LLMs, call external services, mutate `gap_signal_store`, or mutate canonical, enrichment, price, saved-list, watchlist, or user data.

Phase 18.8 mobile visual polish is now implemented and verified on April 24, 2026. The Flutter app keeps the existing Home, Search, Product, Optimize, Watchlist, Saved Lists, and List Detail behavior, but the shared UI primitives now apply a cleaner 16px screen padding, consistent card/input/button radii, clearer section-header typography, muted secondary copy, and more consistent empty/error state presentation. Product search and saved-list empty copy were tightened to match the Phase 18.8 contract. This phase does not add features, change backend calls, alter navigation, or introduce a new theme architecture.

Phase 18.7 mobile saved-list polish is now implemented and verified on April 24, 2026. The `/lists` screen now uses the owner-scoped backend saved-list API, renders loading/list/empty/error states, supports creating lists from a simple name plus comma/newline item dialog, opens `/list_detail` with list id arguments, and deletes lists through `DELETE /lists/:id` with local UI updates after success. The `/list_detail` screen fetches `GET /lists/:id`, edits list name and item text safely, saves through `PATCH /lists/:id`, and sends the current item set to `/optimize` without persisting optimizer output. This phase does not change backend behavior, saved-list schema, notifications, or client state architecture.

Phase 18.6 mobile watchlist screen polish is now implemented and verified on April 24, 2026. The `/watchlist` screen now loads the owner-scoped `GET /watchlist/prices` backend price view, renders watched products with current best price, chain/store, deal badge, target-hit badge, and missing-price states, and navigates watched products to `/product` with `canonicalProductId`. Users can remove watched items through the existing `DELETE /watchlist/:id` endpoint; successful deletes update the local screen list and failures show bounded feedback. This phase does not change backend behavior and does not add notifications, alert scheduling, internal analytics/health exposure, or a new state architecture.

Phase 18.5 mobile optimize basket screen is now implemented and verified on April 24, 2026. The `/optimize` route reads optional `items` arguments, renders a real editable basket screen, parses comma/newline input, and calls `POST /basket/optimize` with `layer_mode: canonical_with_enrichment`, `strategy` set from the single-store/multi-store toggle, explanation enabled, and convenience scoring/internal metrics off by default. The screen supports empty, ready, loading, success, and retryable error states; it shows estimated total, store count, savings, store cards, warnings, and explanation text while intentionally hiding `score_total`, raw metrics, and debug objects. Saved-list integration, convenience-preference UX, and final visual polish remain future mobile work.

Phase 18.4 mobile search results screen is now implemented and verified on April 24, 2026. The `/search` route now reads an optional `query` argument and renders a real product search screen backed by `POST /products/search` with `layer_mode: canonical_with_enrichment`, `limit: 25`, and `offset: 0`. The screen supports safe missing-query behavior, loading, result list, empty results, error retry, and in-screen re-search. Result cards show available canonical product name, brand/category/base-product metadata, optional deal, and optional best price, and tap through to `/product` with `canonicalProductId`. This phase does not change backend behavior; filters, facets, sorting, and pagination remain future mobile work.

Phase 18.3 home search and add-to-basket entry is now implemented and verified on April 24, 2026. The home screen now shows a top input with `Search products or add to basket...`, routes Enter/search button/voice/recent-search actions to `/search` with a `query` argument, and routes `Add to basket` to `/optimize` with comma/newline parsed draft `items`. This phase does not persist basket state and does not add backend behavior; full destination screens are implemented by later Phase 18 work.

Phase 18.2 mobile product detail screen is now implemented and verified on April 24, 2026. The `/product` route now reads `canonicalProductId`, `canonical_product_id`, or `id` arguments and loads canonical product detail through the existing backend product API. The screen renders product name, category path, brand, base product, attributes, markers, optional deal status, best price when available, and an owner-scoped Add to watchlist action. Product loading errors, not-found responses, missing route arguments, deal-check failures, and watchlist add failures are handled safely. This phase does not change backend behavior; `/search` and `/optimize` remain lightweight placeholders.

Phase 18.1 mobile navigation wiring is now implemented and verified on April 24, 2026. The Flutter app registers simple named routes for `/search`, `/watchlist`, `/lists`, `/list_detail`, `/optimize`, and `/product`. Home summary quick actions now navigate instead of showing placeholder snackbars, saved-list cards pass list arguments to `/list_detail`, watchlist highlights open `/watchlist`, and deal cards pass canonical product arguments to `/product`. This phase does not change backend behavior; search, optimize, and product destinations remain lightweight placeholders pending full mobile screen implementations.

Phase 18 mobile home screen integration is now implemented and verified on April 24, 2026. The Flutter home screen fetches `GET /home/summary` with the existing API base URL and anonymous owner headers, parses the home-summary DTO, and renders compact sections for top deals, watchlist highlights, saved-list shortcuts, market highlights, and quick actions. It supports loading, empty-section hiding, and retry-on-error states. This phase does not change backend behavior; quick-action navigation and final visual polish remain future mobile UI work.

Phase 17.3 simple deal detection is now implemented and verified on April 24, 2026. It adds deterministic `good`, `normal`, and `expensive` deal signals based on current price versus available recent average price, annotates `GET /watchlist/prices`, annotates basket optimizer item outputs with `deal`, adds `basket_deal_summary`, and exposes `POST /products/deal-check`. This remains a signal layer only: it does not build alert rules, send notifications, mutate price records, or require user setup beyond optional target prices.

Phase 17.2 watchlist tracker is now implemented and verified on April 24, 2026. It adds owner-scoped `watchlist_store` records for canonical product references, REST endpoints under `/watchlist`, and `GET /watchlist/prices`, which builds a read-only current-price tracker view through the Phase 16.0 price lookup layer. Watchlist records store only ownership metadata, canonical product ids, optional labels, target prices, notes, and timestamps; they do not store latest prices, price snapshots, alerts, or notifications.

Phase 17.1 persistent saved lists is now implemented and verified on April 24, 2026. Saved-list records now carry `owner_id` and `owner_type`, request handlers resolve temporary owner context from `x-pricer-owner-id` and `x-pricer-owner-type`, and list/get/update/delete/optimize operations enforce owner-scoped access with bounded not-found responses for cross-owner attempts. Missing owner context and legacy ownerless records remain anonymous for backward compatibility, and saved-list optimization still reruns the basket pipeline without storing optimization outputs.

Phase 17 saved shopping lists is now implemented and verified on April 24, 2026 as the first user-retention persistence layer for basket input. It adds `saved_lists_store`, CRUD helpers, REST endpoints under `/lists`, and `POST /lists/:id/optimize`, which reruns the existing resolver, planner, price lookup, and optimizer fresh each time without storing optimization results or mutating canonical, enrichment, or price data.

Phase 16.7 basket health diagnostics is now implemented and verified on April 24, 2026 as an internal-only alert layer over Phase 16.6 basket analytics summaries. It adds deterministic health thresholds, pure `buildBasketHealthAlerts(...)`, and `GET /analytics/basket-health` for monitoring without mutating analytics records or affecting basket optimization.

Phase 16.6 basket analytics is now implemented and verified on April 24, 2026 as an opt-in persistence and aggregation layer for Phase 16.5 basket quality metrics. It adds `basket_analytics_store`, writes records only when `/basket/optimize` receives both `include_metrics=true` and `persist_metrics=true`, swallows analytics write failures so optimizer responses still succeed, and exposes `GET /analytics/basket-summary` with bounded `window` and `limit` query params.

Phase 16.5 basket quality metrics is now implemented and verified on April 24, 2026 as a deterministic, read-only monitoring layer over resolver, basket planner, price lookup, optimizer, and convenience outputs. It adds optional `metrics` to `POST /basket/optimize` only when `optimizer_options.include_metrics = true`, plus pure helpers for last-run metrics and simple global summaries; it does not mutate inputs, persist analytics, call external services, use randomness, or change optimizer behavior.

Phase DB2.5 USDA deterministic cluster candidate generation is now implemented and locally verified as a Postgres sidecar-only first pass: a `usda_food_cluster_candidates` migration, deterministic Foundation/SR Legacy parser, conservative hard-boundary cluster-key generation, representative scoring preview, mirrored backend exports, and over-collapse tests exist without mapping USDA foods directly to Pricer ingredients. Phase DB2 USDA macro import is implemented as a Postgres sidecar-only layer: USDA/FoodData Central macro lookup and fact tables, import-run tracking, streaming CSV import modules, a full-import script, and fixture tests exist without changing the current `kolkostruva.bg -> Firestore/flat store -> App` runtime path. Phase DB1 Postgres foundation remains the sidecar foundation for local/dev Postgres compose support, connection helpers, migration tooling, health checks, and import metadata tables. Phase DB0 Postgres transition architecture remains the governing boundary: Postgres is planned for relational source truth, heavy imports, USDA/Open Food Facts joins, source dedupe, mapping-review staging, and future recipe-source processing, while Firestore/flat store remains the active app-facing cache and user-state runtime. Phase 16.0 price lookup is implemented and verified locally alongside the already-implemented Phase 15.4 basket planner and Phase M0 meal foundations. The repo still keeps the Phase 13 cross-chain canonical product layer, with strict deterministic guards for infant-formula stages, count families, age bands, reserve tiers, flavors, colors, pack-count variants, explicit numeric ranges, and normalized volume-or-weight markers, plus the governed Phase 14 unresolved-warning adjudication lane and reversible applied-view policy layer. Phase 15 added additive canonical enrichment keyed by canonical fingerprint. Phase 15.1 added explicit reader contracts for canonical truth, applied view, enrichment, and explicit combinations of those layers; deterministic enrichment-backed filtering and search; lightweight enrichment analytics rollups; and an intended runtime default of `ENABLE_LLM_ENRICHMENT=true` while keeping missing-key behavior non-fatal and cache-first. Phase 15.2 exposes those reader contracts through bounded product-facing API handlers and live HTTP routes for product detail, product search, enrichment-backed facets, and enrichment analytics summaries, with `canonical_with_enrichment` as the default consumer layer and applied-view access remaining opt-in only. Phase 15.3 adds a read-only shopping-list resolution layer that normalizes messy item text, ranks canonical product candidates deterministically through the product-service search surface, and returns explicit resolved, ambiguous, or unresolved outcomes without mutating canonical truth or enrichment state. Phase 15.4 turns that resolver output into a deterministic basket-planning contract with ready, ambiguous, and unresolved planning buckets; optimization-readiness and confirmation flags; preserved quantity and marker requests; and policy-driven handling for carried ambiguity and unresolved placeholders or blocking items. Phase 16.0 now adds a deterministic canonical price-lookup layer over existing snapshot truth, canonical mappings, and source-product metadata so future optimizers can ask what known current prices exist for ready basket items and carried ambiguous candidates without mutating canonical truth, enrichment, price history, or user state. Phase M0 adds a separate meal domain with flat ingredient, ingredient-family, ingredient-category, unit, unit-conversion, ingredient-unit-rule, and product-to-ingredient-mapping collections; deterministic ingredient validation; seeded base units; ingredient-aware edible-to-purchase conversion; and ingredient-level cost projection with an explicit fallback ladder from exact local store price through other-store mapped price, category-average estimate, and ingredient estimate. Deterministic markers still win over all later interpretation layers, canonical products plus mappings remain immutable truth, and ingredients remain a separate domain bridged to retailer products rather than folded into `canonical_products`. Phase 12 search quality remains implemented and verified, including deterministic canonical search terms, synonym mapping, conservative fuzzy correction, canonical query objects, matcher integration on canonical fields, and a demand-log-driven feedback loop for learned typo synonyms. The backend persistence blocker from Phase 11 is partially closed: the data backbone now supports Firestore-backed runtime persistence with environment-based store selection, while local JSON and in-memory stores remain available for local development and tests. The backend is now wrapped for Firebase Cloud Functions deployment with repo-root Firebase manifests and a self-contained `functions/` source tree. Deployment blockers still remain: Firestore rules and indexes are not defined, Firebase anonymous auth is not wired in the mobile app, FCM device-token registration is not implemented, and the mobile runners still use example package identifiers and release-signing placeholders.

## What exists now
- daily TSV and streamed CSV/ZIP snapshot ingestion
- raw snapshot persistence model
- stable `snapshot_id` and `source_product_id` generation
- deterministic enrichment, matching, AI fallback, and daily aggregation layers
- append-only product and category history collections
- unified query parser, planner, executor, filters, ranker, and endpoint
- flat SQL sync targets for products and price aggregates
- flat vector sync targets for embeddings
- a Phase M0 meal-foundation layer for:
  - flat `ingredient_families`, `ingredient_categories`, and `ingredients`
  - flat `units`, `unit_conversions`, and `ingredient_unit_rules`
  - flat `product_ingredient_mappings` as an explicit bridge from retailer products to meal ingredients
  - deterministic ingredient validation with runtime-safe field enforcement
  - seeded base units for `g`, `kg`, `ml`, `l`, `piece`, and `pack`
  - generic same-type unit conversion plus ingredient-specific `piece -> grams` rules
  - edible-to-purchase conversion with yield-aware conservative rounding
  - ingredient-level price estimation with explicit fallback provenance and confidence
- an environment-selectable backend persistence layer with:
  - Firestore-backed runtime storage for production
  - JSON-file persistence for local CLI development
  - in-memory persistence for tests
- a Phase DB0 hybrid persistence architecture decision that keeps current Firestore/flat runtime intact while assigning future large relational imports and nutrition joins to Postgres
- a Phase DB1 Postgres sidecar foundation for local/dev connection, migrations, health checks, and import metadata tables without replacing Firestore or product runtime reads
- a Phase DB2 USDA macro import layer for Postgres sidecar tables, macro nutrient filtering, source-file metadata registration, import-run tracking, fixture-based tests, and a full-import script that does not publish nutrition to Firestore or the app runtime
- a Phase DB2.5 USDA deterministic cluster candidate layer for Foundation/SR Legacy food descriptions, conservative hard-boundary keys, representative scoring preview, and review-ready candidate storage without ingredient mapping writes
- idempotent sync jobs
- Phase 6 streamed production modules for:
  - latest snapshot discovery
  - ZIP download without full-file memory buffering
  - streamed unzip and CSV parsing across all supported CSV files inside each daily ZIP archive
  - filename-derived source provenance metadata for reporting-chain grouping and debugging
  - duplicate-row suppression on existing stable source-product keys
  - pre-enrichment dedupe buckets keyed by normalized source chain plus product code
  - enrichment reuse across repeated chain/product rows inside one full daily archive
  - cross-chain canonical product grouping built on deterministic enriched attributes
  - deterministic variant guards for stages, count families, age bands, reserve tiers, flavors, colors, pack-count variants, numeric size or weight ranges, year-or-age expressions, and normalized volume-or-weight markers
  - flat `canonical_products` and `canonical_product_mappings` persistence
  - flat `canonical_enrichment_store` persistence keyed by canonical fingerprint
  - explicit canonical-product readers that can return canonical truth only, canonical plus applied view, canonical plus enrichment, or the explicit combined layer
  - deterministic enrichment-backed list and search helpers with bounded filtering by category, brand, base product, flavor, attributes, diet tags, usage context, and confidence thresholds
  - lightweight enrichment analytics and ingest-run rollups for coverage, category, brand, base product, flavor, cache reuse, created, rejected, and offline-missing counts
  - bounded product API handlers and HTTP routes for canonical detail, search, filter facets, and enrichment analytics summaries with explicit layer-mode reporting
  - a bounded shopping-list resolution service and HTTP route that turn messy item text into ranked canonical product candidates with explicit status and confidence outputs
  - a deterministic basket-input planner and HTTP route that classify resolver results into ready, ambiguous, and unresolved planning buckets for later optimization
  - a deterministic price-lookup layer and HTTP route that expose latest known canonical-product prices in EUR, stale or missing status, best-price selection, and basket-plan price collection without mutating price history
  - a deterministic single-store basket optimizer and HTTP route that ranks single-chain basket options using separate actual totals and internal penalty-based score totals
  - a bounded multi-store basket optimizer that compares opt-in split baskets against the best single-store option without adding travel or locality scoring yet
  - an optional basket explanation layer that turns optimizer results into app-ready English summaries, item notes, warnings, and limitations
  - an optional convenience-aware scoring layer that keeps product totals pure while adding effective totals and user-context recommendation adjustments
  - canonical merge diagnostics, review samples, and warning logs for potential over-canonicalization
  - durable `canonical_disambiguation_queue` records for unresolved plausible warning pairs
  - durable `canonical_disambiguation_decisions` keyed by stable pair fingerprints for future reuse
  - a dry-run adjudication helper that emits only pending unresolved pairs and skips already-decided fingerprints
  - an opt-in LLM adjudication runner that validates responses and persists decisions without mutating canonical products
  - human review decision recording with `reviewed_human` status and human-over-LLM effective decision resolution
  - a controlled disambiguation application preview that computes applied merges, blocked merges, skipped conflicts, unchanged pairs, and an audit log without mutating canonical truth
  - a strict enrichment prompt/validation path that enriches only net-new canonical fingerprints, caches validated results, and stays offline-compatible when cached data already exists
  - intended live enrichment enablement by default runtime config while preserving non-fatal missing-key behavior
  - ingest run tracking
  - analytics event tracking
  - pipeline logging
  - watchlist alert detection and notification queuing
  - scheduler-ready daily orchestration
  - env-configurable Grok ambiguity resolution
  - env-configurable remote embedding backfill with deterministic fallback
- a Flutter mobile app under `app/mobile/` with search, results, product detail, shopping lists, and watchlist screens
- backend API client wiring for `/query` and `/product/:id/history`
- Firestore-backed repositories for anonymous shopping lists and watchlists, plus in-memory fallback for local development
- a shared mobile UI system for spacing, cards, buttons, chart framing, loading, empty, and error states
- a standard Flutter localization stack with ARB inputs under `app/mobile/lib/l10n/` and generated `AppLocalizations` under `app/mobile/lib/src/generated/l10n/`
- English and Bulgarian ARB files covering major visible mobile UI copy
- locale-aware app-shell formatting helpers for prices, dates, and missing-value placeholders
- passing Flutter widget tests for English rendering, Bulgarian rendering, unsupported-locale fallback, localized results, and localized watchlist flows
- a repo-root Firebase project configuration with `firebase.json` and `.firebaserc`
- a deployable Firebase Functions package under `functions/` with HTTP endpoints for query, product history, watchlist, demand, optimizer, and entitlement flows
- a vendored backend runtime under `functions/src/` so Cloud Functions deployment does not import code from outside the deploy source
- automated repo-level verification for Phases 1, 1.5, 2, 3, 3.5, 4, 5, 5.5, 5.6, 6, 7, 8, 9, 10, 11, 12, 15, 15.1, 15.2, 15.3, 15.4, 16.0, 16.1, DB1, DB2, and M0
- a Phase 7 demand-intelligence layer for:
  - zero-result query capture in the existing Phase 4 flow
  - manual "can't find this" feedback logging
  - flat `demand_logs`, `demand_aggregates`, `demand_embeddings`, and `demand_clusters`
  - deterministic batch aggregation and clustering of unmet demand
  - top-demand and trending-demand service endpoints
  - analytics events for automatic and manual unmet-demand capture
- a Phase 8 best-basket layer for:
  - deterministic basket splitting over existing item queries
  - bounded single-store optimization
  - bounded multi-store optimization
  - explicit price/store/match weighting
  - weak-match filtering for basket safety
  - an optimize-basket request handler built on top of Phase 4 results
- a Phase 9 watchlist-intelligence layer for:
  - recurring drop-interval detection with confidence
  - smart nudges with cooldowns
  - significance and good-deal evaluation
  - target-price management
  - list auto-refresh up/down diff tracking
  - daily per-user watchlist summaries
  - summary, insights, and target-price request handlers
- a Phase 10 monetization layer for:
  - flat backend entitlement records and RevenueCat sync events
  - premium-only backend gating for multi-store optimizer and alerts
  - free-tier optimizer and alert limits
  - Flutter RevenueCat purchase, restore, and status wrappers
  - Firestore-backed user billing profiles per anonymous device id
  - AdMob banner and interstitial wrappers with premium suppression
  - a localized paywall screen and premium upgrade entry points
  - monetization analytics events on entitlement changes
- a Phase 11 deployment audit for:
  - runtime env-var discovery across backend scripts and Flutter `--dart-define` usage
  - external account and service inventory
  - production blocker identification
  - step-by-step production checklist and operator runbook
  - explicit repo-level missing-config inventory
- a Phase 12 search-quality layer for:
  - flat canonical search-term records
  - flat synonym-map records
  - deterministic canonical query objects
  - conservative fuzzy token correction
  - synonym expansion before candidate filtering
  - demand-log-driven typo-synonym learning

## Ready next
The next step can now go in six parallel directions: wire saved-list and watchlist ownership to real Firebase Auth and anonymous claiming, add true deal-alert rules plus FCM notification delivery on top of the simple deal signals, run the full USDA macro import locally or in dev Postgres and inspect counts, build DB3 Open Food Facts import on top of the Postgres sidecar, build locality-aware or travel-aware basket optimization on top of the bounded multi-store result, build Phase M1 recipe and component ingest on top of the meal foundations, add reporting around Phase 14.3 applied-view counts plus Phase 15 and 16 enrichment and price-coverage metrics at runtime, and close the remaining deployment gaps from Phase 11. A real rollout still needs secure Firestore rules and auth configuration, mobile FCM token registration, native permission fixes for voice input, real bundle identifiers and release signing, and then live Firebase, xAI, RevenueCat, AdMob, and future Postgres credentials plus scheduler registration and store runtime verification.
