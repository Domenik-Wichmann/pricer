# Phase 17.2 Implementation Contract

## Goal
Add an owner-scoped watchlist tracker for canonical products and expose a read-only current-price view backed by the Phase 16.0 price lookup layer.

## Runtime modules
- `app/functions/src/phase17/watchlist.js`
- `functions/src/phase17/watchlist.js`
- `app/functions/src/phase1/store.js`
- `functions/src/phase1/store.js`
- `app/functions/src/index.js`
- `functions/src/index.js`
- `functions/index.js`

## Storage
New collection:

- `watchlist_store`

Record fields:

- `watch_id`
- `owner_id`
- `owner_type`
- `canonical_product_id`
- `label`
- `target_price`
- `notes`
- `created_at`
- `updated_at`

## API endpoints
- `POST /watchlist`
- `GET /watchlist`
- `GET /watchlist/prices`
- `GET /watchlist/:id`
- `PATCH /watchlist/:id`
- `DELETE /watchlist/:id`

## Price tracker
`buildWatchlistPriceView(...)` lists the resolved owner's watchlist records, loads canonical product display metadata when available, and calls Phase 16.0 `lookupCanonicalProductPrices(...)` for current price status, best price, and price records.

## Safety boundaries
- Watchlist records store only owner metadata, canonical product references, and optional user metadata.
- Price snapshots and price lookup outputs are not persisted into watchlist records.
- Canonical products, mappings, source products, raw snapshots, and daily prices are not mutated.
- Notification sending, push delivery, and deal-alert rules remain out of scope.
