# Production Firestore Runtime Audit

Date: 2026-05-03

Incremental ingest update: 2026-05-05

## Runtime Rule

Production Firestore is acceptable for the MVP only when request paths use scoped reads and writes. Legacy `store.load()` and `store.save()` are local/offline patterns and are unsafe against large `prod_` collections.

Large production collections must not be loaded by normal user traffic:

- `raw_price_snapshots`
- `canonical_product_mappings`
- `source_products`
- `product_daily_prices`
- `current_product_offers` once populated at production scale

Heavy publication and ingest jobs remain offline/operator jobs.

## Route Risk Map

| Route | Handler | Reads | Writes | Full load/save | Huge collection behavior | Audience | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /` | inline health | none beyond store init | none | no | none | user-facing health | safe |
| `POST /query` | `handleQueryEngineRequest` | legacy Phase 4 state | analytics/demand depending path | yes | can hit huge collections | legacy user-facing | unsafe for production user traffic |
| `GET /product-history` | `getProductHistory` | `product_daily_prices` by `source_product_id` | none | no when scoped store exists | bounded by requested source product | user-facing | safe |
| `GET /products/:id` | `handleGetCanonicalProductRequest` | `canonical_products`, `canonical_enrichment_store`, mappings for one canonical id, current offers and offer summary for one canonical id; optional applied-view queues | none | no on Firestore | mappings/current offers queried by `canonical_product_id` only | user-facing | safe |
| `POST /products/search` | `handleSearchCanonicalProductsRequest` | prefix-scoped `canonical_products`, enrichment for candidate ids, `canonical_current_offer_summary` for bounded search candidate ids before pagination | one `gap_signal_store` upsert | no | does not read mappings, raw snapshots, source products, daily prices, or all current-offer summaries | user-facing | safe |
| `POST /products/filter-facets` | `handleCanonicalProductFilterFacetsRequest` | `canonical_products`, `canonical_enrichment_store`, optional applied-view queues | none | no on Firestore | no million-row collections | user-facing/admin console | safe |
| `POST /products/deal-check` | `handleDealCheckRequest` | bounded price lookup for requested canonical ids | none | no on Firestore price path | price truth queried by requested source ids | user-facing | safe with bounded ids |
| `POST /products/nearest-availability` | `handleNearestProductAvailabilityRequest` | legacy location availability join | none | blocked on Firestore | returns 503 until compact availability read model exists | user-facing opt-in | unknown/needs follow-up |
| `POST /user/locations/geocode-address` | `handleManualAddressGeocodeRequest` | manual geocode cache by request key | manual geocode cache upsert | legacy internals may load in local mode | not a million-row product path | user-facing opt-in | safe with follow-up audit |
| `GET /home/summary` | `handleHomeSummaryRequest` | owner lists/watchlist; top deals and market cards require compact read models | none | no on Firestore | skips top deals and market highlights when compact read models are absent | user-facing | safe |
| `POST /market/trends` | `handleMarketTrendsRequest` | legacy market aggregate inputs | none | blocked on Firestore | returns 503 until compact trends read model exists | analytics/admin | acceptable for admin only |
| `GET /market/overview` | `handleMarketOverviewRequest` | legacy market aggregate inputs | none | blocked on Firestore | returns 503 until compact trends read model exists | analytics/admin | acceptable for admin only |
| `POST /shopping-list/resolve` | `handleResolveShoppingListItemsRequest` | scoped product search per item | `gap_signal_store` upserts | no on Firestore | no million-row search reads | user-facing | safe |
| `POST /basket/plan` | `handleBuildBasketPlanRequest` | scoped shopping-list resolver | `gap_signal_store` upserts | no on Firestore | no price/raw snapshot reads | user-facing | safe |
| `POST /prices/lookup` | `handleLookupCanonicalProductPricesRequest` | compact `current_product_offers` and `canonical_current_offer_summary` by requested canonical ids; legacy bounded mappings/source/snapshot fallback when compact offers are absent | none | no on Firestore | no current-offer full load; fallback bounded to requested ids | user-facing/internal | safe with bounded ids |
| `POST /basket/optimize` | `handleOptimizeBasketSingleStoreRequest` | scoped resolver plus compact current-offer price lookup when populated | optional basket analytics only when requested | no on Firestore normal path | no full raw snapshot scan | user-facing | safe for MVP |
| Meal-plan routes | `handle*MealPlan*Request` | Postgres sidecar; some shopping run paths may invoke bounded runtime price lookup | sidecar records | no full Firestore by default | sidecar owned | user-facing/future | safe with Postgres config |
| `/lists*` | saved-list handlers | owner-scoped `saved_lists_store` | record upsert/delete | no on Firestore | no huge collections | user-facing | safe |
| `/user/locations*` | saved-user-location handlers | owner-scoped `saved_user_locations` | record upsert/delete | no on Firestore | no huge collections | user-facing | safe |
| `GET /analytics/enrichment-summary` | `handleGetEnrichmentAnalyticsSummaryRequest` | canonical product/enrichment plus ingest summary | none | no on Firestore | no million-row collections | admin | acceptable for admin only |
| `GET /analytics/basket-summary` | `handleGetBasketAnalyticsSummaryRequest` | `basket_analytics_store` | none | legacy local fallback | no known million-row collections | admin | acceptable for admin only |
| `GET /analytics/basket-health` | `handleGetBasketHealthRequest` | basket analytics/health inputs | none | legacy local fallback | no known million-row collections | admin | acceptable for admin only |
| `/analytics/gap-detection*` | Phase 18 gap handlers | `gap_signal_store` only | none | no on Firestore | no huge collections | internal guarded | safe |
| `/analytics/opportunities` | opportunity reports | `gap_signal_store` only | none | no on Firestore | no huge collections | internal guarded | safe |
| `/analytics/insights/*` | merchant insight handlers | `gap_signal_store` only | none | no on Firestore | no huge collections | internal guarded | safe |
| `GET /internal/insights/dashboard` | static dashboard shell | none | none | no | none | internal | safe |
| `GET /internal/ingest/jobs` | `handleListAdminIngestJobsRequest` | `admin_ingest_jobs` only | none | no on Firestore | bounded admin job metadata, no ZIP work | internal/admin | safe |
| `GET /internal/ingest/jobs/:id` | `handleGetAdminIngestJobRequest` | one `admin_ingest_jobs` record by `job_id` | none | no on Firestore | point read/query only | internal/admin | safe |
| `POST /internal/ingest/plan` | `handlePlanAdminIngestRequest` | none | none | no | returns command preview; does not process ZIPs | internal/admin | safe |
| `POST /internal/ingest/jobs` | `handleCreateAdminIngestJobRequest` | none | one `admin_ingest_jobs` upsert | no on Firestore | creates planned job metadata only; does not process ZIPs | internal/admin | safe |
| `/internal/location-review/*` | location review handlers | location review/geocode collections | review/upsert for decisions | legacy handlers still use full state in places | admin-only; not consumer traffic | internal/admin | acceptable for admin only; needs scoped follow-up |
| `/watchlist` CRUD | Phase 17 watchlist handlers | owner-scoped `watchlist_store`; canonical product/enrichment by requested ids | record upsert/delete; gap signal on add | no on Firestore | no huge collection scan | user-facing | safe |
| `GET /watchlist/prices` | `handleWatchlistPriceViewRequest` | owner watchlist, canonical products by watched ids, bounded price lookup | none | no on Firestore | bounded to owner watched ids | user-facing | safe |
| `GET /watchlist/summary`, `GET /watchlist/insights`, `POST /watchlist/target-price` | legacy Phase 9 watchlist intelligence handlers | legacy source-product watchlist state | legacy target/intelligence writes | yes | can hit source/snapshot-derived state | legacy/internal | unsafe for production user traffic |
| `/demand/*` | Phase 7 demand handlers | demand logs/aggregates | demand writes | yes in legacy modules | not the product million-row path, but full-state store usage remains | sidecar/analytics | unknown/needs follow-up |
| `POST /optimize-basket` | legacy Phase 8 optimizer | legacy query state | none | yes | can hit huge collections through legacy query | legacy user-facing | unsafe for production user traffic |
| `/entitlement/*` | Phase 10 entitlement handlers | user tiers/revenuecat events | entitlement writes | yes in legacy modules | not huge today, but blocked by production full-load guard | user-facing billing prep | unknown/needs follow-up |

## Blockers Found

- Product search still had a path through `loadProductCatalogState()` that could read all `canonical_product_mappings` once mappings reached KolkoStruva scale.
- Gap-signal writes used full `load()` plus `save()` on stores without scoped write helpers.
- Saved lists, watchlist, and saved user locations used full-state read/modify/write for CRUD.
- Home summary full-loaded the entire runtime store before composing cards.
- Market trends and nearest availability still depend on compact read models that do not exist yet.

## Fixes Implemented

- Added scoped store methods: `loadCollections`, `queryCollection`, `queryCollectionByFieldValues`, `queryCollectionPrefix`, `upsertRecord`, and `deleteRecord`.
- Added Firestore runtime diagnostics for route, operation, collection, row count, and duration, with warnings for full load/save attempts.
- Disabled production Firestore full `load()` and `save()` by default unless explicitly opted in by env.
- Changed product detail to query mappings by `canonical_product_id`.
- Changed product search and shopping-list resolution to use bounded prefix queries and enrichment lookups for candidate ids only.
- Changed price lookup to query mappings, source products, snapshots, and optional history by requested ids.
- Added compact `current_product_offers` and `canonical_current_offer_summary` collections and changed product detail, price lookup, and basket optimization to prefer them for current prices.
- Added historical ingest admin planning endpoints and `admin_ingest_jobs`; these endpoints do not run long ZIP ingest inside HTTPS.
- Changed gap-signal persistence to upsert only `gap_signal_store`.
- Changed saved lists, watchlist, and saved user locations to use scoped record CRUD.
- Changed home summary to avoid full-state loading and to skip top deals/market highlights when compact production read models are missing.
- Changed market trend and nearest availability Firestore paths to return controlled `503` limitations instead of timing out.

## Remaining Unsafe Or Limited Routes

- Legacy `/query`, `/optimize-basket`, Phase 7 demand endpoints, Phase 9 source-product watchlist intelligence endpoints, and Phase 10 entitlement handlers still call full store paths and are protected by the production full-load/full-save guard rather than fully migrated.
- Market trends need a compact trend read model before they can be enabled against large Firestore data.
- Nearest availability needs a compact availability/current-price-by-location read model before it can be enabled against large Firestore data.
- Home top deals remain disabled on Firestore until compact deal cards are published from the current-offer summaries.
- Internal location-review routes remain admin-only and should receive the next scoped-read pass before broad operator usage.

## Historical Ingest Safety Map

| Path/command | Scope | Writes | Deletes | Full store load/save risk | Historical safety |
| --- | --- | --- | --- | --- | --- |
| `npm run phase6:ingest-snapshot` | One explicit ZIP/date from `PRICER_SNAPSHOT_DATE` plus ZIP path or URL | Only `PRICER_PHASE6_PUBLISH_COLLECTIONS`; defaults to `raw_price_snapshots`, `product_daily_prices`, `ingest_runs`, `pipeline_logs` | No | Uses local memory for parse/aggregation, direct Firestore document sets for publish; no production `store.load()`/`save()` | Safe dry-run/default archive append path |
| `npm run phase6:publish-firestore-latest` | Latest available KolkoStruva ZIP | Broad latest/current publish set including canonical/current read models | No explicit deletes, but broad overwrites are possible | Full memory offline publisher and full existing-ID collection scans | Latest/current operator job only, not historical default |
| `npm run phase6:run` | Daily latest pipeline | Runtime store pipeline | Depends on backend; Firestore full load/save is blocked unless explicitly allowed | Calls full store `load()`/`save()` paths | Not safe for production historical Firestore publish |
| `importDailySnapshotZip` / `importDailySnapshotCsvStream` | One ZIP/CSV/date into provided store | Replaces local state arrays and appends ingest/log records | Marks missing source products inactive in the local state | Calls provided store `load()`/`save()` | Safe only with memory/local stores for historical planning; not direct production Firestore |
| `runDailyAggregation` | One date from existing local state | Appends daily product/category aggregate rows | No | Calls provided store `load()`/`save()` | Safe only with memory/local stores for historical planning |
| `buildCurrentOfferReadModel` | Latest snapshot per source product from local state | Caller assigns current read-model arrays | No | Pure in-memory helper | Current/latest only, not historical append |
| `GET/POST /internal/ingest/*` | Admin metadata/planning | Planned `admin_ingest_jobs` only on create | No | Scoped `admin_ingest_jobs` reads/upserts | Safe; does not process ZIPs synchronously |

## Incremental Latest Diff Safety Map

| Path/command | Reads | Writes | Deletes | Full store load/save risk | Incremental safety |
| --- | --- | --- | --- | --- | --- |
| `npm run phase6:diff-snapshot` / `npm run phase6:daily-incremental-dry-run` | One explicit ZIP/date into local memory; optional local baseline file; optional scoped Firestore reads from `current_offer_fingerprints` or `current_product_offers` by `source_product_id` | None | No | Uses local memory for parse/current-offer build; no production `store.load()`/`store.save()` | Safe dry-run/report foundation; refuses unbounded 1M+ direct compare unless a baseline, sample limit, or explicit direct-compare env is supplied |
| `npm run phase6:export-current-offer-fingerprints` | Paginates through `current_product_offers` ordered by document id | Local JSONL file only | No | No production `store.load()`/`store.save()`; direct Firestore collection pagination only | Safe read-only baseline export for daily diff. Reads current offers once and avoids future per-diff 1M+ Firestore reads |
| `npm run phase6:backfill-current-offer-fingerprints` | Same paginated `current_product_offers` source | Local JSONL file; optionally `current_offer_fingerprints` only when explicitly enabled and dry-run disabled | No | No full runtime save; batch writes only the fingerprint collection in explicit mode | Guarded optional backfill. Defaults to dry-run and must not be run as a heavy writer concurrently with publishers |
| `phase6/incremental_ingest.js` | Pure in-memory offers/fingerprints | None | No | None | Builds deterministic fingerprints, diff categories, offer-change event payloads, and snapshot manifests |
| Future real incremental writer | Should read changed source-product fingerprints and affected canonical offer sets only | Changed `current_product_offers`, changed `current_offer_fingerprints`, affected `canonical_current_offer_summary`, append-only `offer_change_events`, one `snapshot_manifest` | No by default | Must not full-load production collections | Deferred until fingerprint baseline/backfill is available and operator-reviewed |

## Current Write-Behavior Audit

| Command/path | Reads | Writes | Scope | Dry-run | Skip-existing | Deletes | Deterministic IDs | Resume | Old/new compare | Cost estimate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `scripts/publish_phase6_latest_firestore.js` / `npm run phase6:publish-firestore-latest` | Latest ZIP, local memory state, optional full existing-ID scan for each target Firestore collection | Broad selected target collections, default includes raw/source/canonical/current/history/log collections | All records in generated state for selected collections unless existing doc ID is skipped | Yes | Yes, default true, by existing document ID only | No explicit deletes | Yes via `buildDocumentId` | Partial with skip-existing; interrupted changed docs can be rerun | No content/fingerprint compare | Reports input/existing/written/skipped counts after existing-ID scan |
| `scripts/ingest_phase6_snapshot_firestore.js` / `npm run phase6:ingest-snapshot` | One explicit ZIP/date, local memory state, optional per-doc Firestore existence reads | Defaults to `raw_price_snapshots`, `product_daily_prices`, `ingest_runs`, `pipeline_logs`; current read models only with explicit allow flag | Selected records only; historical defaults are archive/history/log append rows | Yes, default true | Yes, default true | No | Yes via `buildDocumentId` | Yes for deterministic archive/history rows when skip-existing is enabled | No content compare; existence only | Reports selected/input/to-write/skipped counts |
| `scripts/diff_phase6_snapshot_firestore.js` / `npm run phase6:diff-snapshot` | One explicit ZIP/date, local memory current-offer build, optional local fingerprint baseline or scoped Firestore current-offer/fingerprint reads | None | Diff/report only | Always writes nothing | Not applicable | No | Manifest/event/fingerprint IDs are deterministic | Re-runnable/idempotent report | Yes, when a baseline/direct compare is available | Prints scanned rows, diff counts, affected summaries, estimated reads/writes, and target collections |
| `functions/src/phase6/ingest.js` | `store.load()`, snapshot ZIP/CSV stream, existing raw/source/enrichment/canonical state | `store.save()` over raw snapshots, source products, enrichment, retailer locations, canonical products/mappings/enrichment/disambiguation, ingest runs, pipeline logs | Rebuilds in-memory arrays from current store plus one snapshot; marks unseen source products inactive | No helper-level dry-run | No persistence skip-existing inside helper | No deletes, but source products can be marked inactive in local state | Yes for raw/source/canonical ids | Scheduler skips completed dates; helper itself rewrites local state | Dedupe by source identity and enriches only net-new/revalidation-needed products; no offer-level current diff | Ingest result counters only |
| `functions/src/phase6/jobs.js` | Full `store.load()`, latest ZIP, semantic/embedding/aggregation/watchlist state | Full store saves through ingest, aggregation, alerts/notifications | Daily full pipeline over runtime store | No | Skips rerun only if `ingest_runs` has completed date | No explicit deletes | Mostly deterministic records; run/log IDs include timestamps | Date-level skip only | No current-offer diff | No pre-commit write estimate |
| `functions/src/phase6/scheduler.js` | `ingest_runs` from provided state | None | Date eligibility only | Not applicable | Completed-date skip | No | Not applicable | Yes at date level | No | No |
| `functions/src/phase16/current_offers.js` | In-memory raw snapshots, source products, canonical mappings/products, or scoped current-offer queries for readers | Pure builder writes nothing; caller may assign arrays | All latest offers in provided state; reader helpers are scoped by canonical/source ids | Not applicable | Not applicable | No | Yes, `offer_${source_product_id}` and summary by canonical id | Pure and deterministic | No existing-value compare; incremental diff wraps fingerprints around output | No |
| `functions/src/phase16/price_lookup.js` | Prefers scoped current offers/summaries by canonical ids; fallback scoped mappings/source/snapshots/history by requested ids | None | Requested canonical/source ids only | Not applicable | Not applicable | No | Not applicable | Read-only | Not applicable | No write estimate; read scope is bounded |
| `functions/src/phase3_5/*` | `runDailyAggregation` uses full `store.load()`; builders scan raw snapshots for one date | `product_daily_prices`, `category_daily_aggregates` via full `store.save()` | One date, appends if date not already aggregated | No | Date-level idempotency | No | Yes, product/category plus date | Yes for already-aggregated date | No content compare | Reports product/category row counts |
| `functions/src/phase1/store.js` | Store-adapter dependent; Firestore scoped helpers query by field/value/prefix | Store-adapter dependent; `upsertRecord` writes one doc; `save()` can rewrite/delete full collections when allowed | Scoped helpers are bounded; full load/save are legacy/local only | Not applicable | Not automatic | `deleteRecord` and full `save()` can delete when explicitly called | Yes via `COLLECTION_DOCUMENT_IDS` | Scoped upserts are idempotent | No content compare | No built-in cost estimate |

Mirrored `app/functions/src/**` files carry the same backend contracts and must stay synchronized with `functions/src/**`.

## Desired Ingest Semantics

1. Initial latest snapshot load: acceptable one-time broad publish that creates canonical/current read models. Run as an offline operator job after dry-run review.
2. Daily latest update: compare snapshot-derived current offers against fingerprints, write only new/changed offers, append change events only for actual price/promo/availability/metadata changes, and update only affected canonical summaries.
3. Historical backfill: append date-specific raw/history/log rows, skip existing deterministic date/source documents, and do not touch latest/current read models unless explicitly requested.
4. Canonical parser/enrichment backfill: touch canonical/enrichment records only; do not rewrite offers, raw snapshots, history, or manifests.

## Incremental Diff Model

`current_offer_fingerprints` stores one stable hash per `source_product_id` over current price, retail/promo price, unit price, sale/promo flags, availability, canonical id, chain/store/locality, and source-file provenance. `offer_change_events` is the future append-only event stream. `snapshot_manifests` records scanned counts, diff counts, affected canonical ids, and estimated writes.

Diff categories are `unchanged`, `new`, `price_changed`, `promo_changed`, `metadata_changed`, and `missing_removed`. Missing/removed offers are reported but not deleted by default.

Direct Firestore comparison for a 1.3M-offer snapshot can require roughly 1.3M reads before any write. The preferred production path is to backfill/export `current_offer_fingerprints` and compare against that manifest/cache. The new `phase6:diff-snapshot` command refuses a full unbounded direct comparison unless the operator supplies a baseline, a sample limit, or `PRICER_INCREMENTAL_ALLOW_FIRESTORE_DIRECT_COMPARE=true`.

Baseline export command:

```powershell
$env:PRICER_FIRESTORE_PROJECT_ID="pricer-ee440"; $env:PRICER_FIRESTORE_DATABASE_ID="(default)"; $env:PRICER_FIRESTORE_COLLECTION_PREFIX="prod"; $env:PRICER_INCREMENTAL_BASELINE_OUTPUT_PATH="C:\dev\Pricer\runtime_data\prod_current_offer_fingerprints.jsonl"; npm run phase6:export-current-offer-fingerprints
```

Optional collection backfill remains dry-run unless both flags are set:

```powershell
$env:PRICER_INCREMENTAL_BASELINE_BACKFILL_FIRESTORE="true"; $env:PRICER_INCREMENTAL_BASELINE_BACKFILL_DRY_RUN="false"; npm run phase6:backfill-current-offer-fingerprints
```

Historical append collections are `raw_price_snapshots`, `product_daily_prices`, `ingest_runs`, and `pipeline_logs`. Current/latest-only collections are `current_product_offers` and `canonical_current_offer_summary`. Canonical/catalog collections such as `source_products`, `canonical_products`, `canonical_product_mappings`, and enrichment stores are idempotent-upsert candidates only when explicitly targeted and should not be casually rebuilt from old dates.

## Latest Publisher Observability

`npm run phase6:publish-firestore-latest` now emits operator progress logs and a local heartbeat file while preserving the existing final JSON summary shape. Logs are timestamped and cover config validation, snapshot resolution, ZIP cache/download, import/canonicalization, semantic enrichment, embeddings, aggregation, current-offer read-model build, each publish collection, and final summary.

Progress is controlled by:

```text
PRICER_PHASE6_PUBLISH_PROGRESS_EVERY
```

The default is `10000` processed records. Heartbeat JSON files are written under `tmp/phase6_publish_logs/` and include the active phase/collection, selected collections, dry-run and skip-existing flags, record totals, written/skipped/failed counts, `last_message`, and `status`. A failed run updates the same file with `status = "failed"` and error details before exiting non-zero.
