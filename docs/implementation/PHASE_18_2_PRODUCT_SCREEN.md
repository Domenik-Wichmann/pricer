# Phase 18.2 Product Screen Implementation

Date: 2026-04-24

## Scope

Phase 18.2 replaces the `/product` navigation placeholder with a real Flutter product detail route backed by existing backend APIs.

No backend behavior, routes, persistence, or schema changed.

## Route

`/product`

Accepted arguments:

* `canonicalProductId`
* `canonical_product_id`
* `id`

Missing or empty product ids show a safe empty state.

## Mobile API Client

Added methods:

* `getProductById(String canonicalProductId)`
* `checkProductDeals(List<String> canonicalProductIds)`
* `addWatchlistItem({ ownerId, ownerType, canonicalProductId, label })`

`addWatchlistItem` uses the temporary owner headers:

* `x-pricer-owner-id`
* `x-pricer-owner-type`

## Screen Behavior

The product screen supports:

* loading skeletons
* product not found state
* API error with retry
* non-blocking deal-check failure
* watchlist add success snackbar
* bounded watchlist add failure snackbar

Displayed product fields include:

* product name
* category path
* brand
* base product
* flavor and attributes
* product form and packaging
* deterministic markers
* deal status
* best price when available

## Remaining Work

* Localize copy.
* Add product images when a runtime image field exists.
* Add watchlist toggle/remove state.
* Build real search and optimize route bodies.
