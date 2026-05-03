# Production Firestore Runtime Audit

Date: 2026-05-03

## Runtime Rule

Production Firestore is acceptable for the MVP only when request paths use scoped reads and writes. Legacy `store.load()` and `store.save()` are local/offline patterns and are unsafe against large `prod_` collections.

Large production collections must not be loaded by normal user traffic:

- `raw_price_snapshots`
- `canonical_product_mappings`
- `source_products`
- `product_daily_prices`

Heavy publication and ingest jobs remain offline/operator jobs.

## Route Risk Map

| Route | Handler | Reads | Writes | Full load/save | Huge collection behavior | Audience | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /` | inline health | none beyond store init | none | no | none | user-facing health | safe |
| `POST /query` | `handleQueryEngineRequest` | legacy Phase 4 state | analytics/demand depending path | yes | can hit huge collections | legacy user-facing | unsafe for production user traffic |
| `GET /product-history` | `getProductHistory` | `product_daily_prices` by `source_product_id` | none | no when scoped store exists | bounded by requested source product | user-facing | safe |
| `GET /products/:id` | `handleGetCanonicalProductRequest` | `canonical_products`, `canonical_enrichment_store`, mappings for one canonical id; optional applied-view queues | none | no on Firestore | mappings queried by `canonical_product_id` only | user-facing | safe |
| `POST /products/search` | `handleSearchCanonicalProductsRequest` | prefix-scoped `canonical_products`, enrichment for returned ids | one `gap_signal_store` upsert | no | does not read mappings, raw snapshots, source products, or daily prices | user-facing | safe |
| `POST /products/filter-facets` | `handleCanonicalProductFilterFacetsRequest` | `canonical_products`, `canonical_enrichment_store`, optional applied-view queues | none | no on Firestore | no million-row collections | user-facing/admin console | safe |
| `POST /products/deal-check` | `handleDealCheckRequest` | bounded price lookup for requested canonical ids | none | no on Firestore price path | price truth queried by requested source ids | user-facing | safe with bounded ids |
| `POST /products/nearest-availability` | `handleNearestProductAvailabilityRequest` | legacy location availability join | none | blocked on Firestore | returns 503 until compact availability read model exists | user-facing opt-in | unknown/needs follow-up |
| `POST /user/locations/geocode-address` | `handleManualAddressGeocodeRequest` | manual geocode cache by request key | manual geocode cache upsert | legacy internals may load in local mode | not a million-row product path | user-facing opt-in | safe with follow-up audit |
| `GET /home/summary` | `handleHomeSummaryRequest` | owner lists/watchlist; top deals and market cards require compact read models | none | no on Firestore | skips top deals and market highlights when compact read models are absent | user-facing | safe |
| `POST /market/trends` | `handleMarketTrendsRequest` | legacy market aggregate inputs | none | blocked on Firestore | returns 503 until compact trends read model exists | analytics/admin | acceptable for admin only |
| `GET /market/overview` | `handleMarketOverviewRequest` | legacy market aggregate inputs | none | blocked on Firestore | returns 503 until compact trends read model exists | analytics/admin | acceptable for admin only |
| `POST /shopping-list/resolve` | `handleResolveShoppingListItemsRequest` | scoped product search per item | `gap_signal_store` upserts | no on Firestore | no million-row search reads | user-facing | safe |
| `POST /basket/plan` | `handleBuildBasketPlanRequest` | scoped shopping-list resolver | `gap_signal_store` upserts | no on Firestore | no price/raw snapshot reads | user-facing | safe |
| `POST /prices/lookup` | `handleLookupCanonicalProductPricesRequest` | mappings by canonical ids, source products/raw snapshots/daily prices by source ids | none | no on Firestore | bounded to requested ids; history optional | user-facing/internal | safe with bounded ids |
| `POST /basket/optimize` | `handleOptimizeBasketSingleStoreRequest` | scoped resolver plus bounded price lookup | optional basket analytics only when requested | no on Firestore normal path | no full raw snapshot scan | user-facing | safe for MVP |
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
- Changed gap-signal persistence to upsert only `gap_signal_store`.
- Changed saved lists, watchlist, and saved user locations to use scoped record CRUD.
- Changed home summary to avoid full-state loading and to skip top deals/market highlights when compact production read models are missing.
- Changed market trend and nearest availability Firestore paths to return controlled `503` limitations instead of timing out.

## Remaining Unsafe Or Limited Routes

- Legacy `/query`, `/optimize-basket`, Phase 7 demand endpoints, Phase 9 source-product watchlist intelligence endpoints, and Phase 10 entitlement handlers still call full store paths and are protected by the production full-load/full-save guard rather than fully migrated.
- Market trends need a compact trend read model before they can be enabled against large Firestore data.
- Nearest availability needs a compact availability/current-price-by-location read model before it can be enabled against large Firestore data.
- Internal location-review routes remain admin-only and should receive the next scoped-read pass before broad operator usage.
