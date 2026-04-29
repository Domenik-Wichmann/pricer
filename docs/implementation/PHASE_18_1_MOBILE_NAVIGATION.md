# Phase 18.1 Mobile Navigation Wiring Implementation

Date: 2026-04-24

## Scope

Phase 18.1 adds simple named navigation for the existing Flutter home summary surface.

No backend routes, API contracts, persistence, or ingestion behavior changed.

## Routes

| Route | Implementation |
| --- | --- |
| `/search` | Lightweight placeholder screen |
| `/watchlist` | Existing `WatchlistScreen` |
| `/lists` | Existing `ShoppingListsScreen` |
| `/list_detail` | Existing `ShoppingListDetailScreen` when list arguments are provided; placeholder when missing |
| `/optimize` | Lightweight placeholder screen |
| `/product` | Replaced by the Phase 18.2 canonical product detail screen |

## Home Wiring

Quick actions:

* `search_product` -> `/search`
* `optimize_basket` -> `/optimize`
* `view_watchlist` -> `/watchlist`
* `view_saved_lists` / `saved_lists` -> `/lists`

Home cards:

* saved list -> `/list_detail`
* watchlist highlight -> `/watchlist`
* deal -> `/product`

## Arguments

`/list_detail` accepts:

* `listId`
* `list_id`
* `name`
* `itemCount`

`/product` accepts:

* `canonicalProductId`
* `canonical_product_id`

Missing arguments are handled with placeholder screens instead of crashes.

## Intentional Exclusions

* no complex Router architecture
* no deep links
* no backend changes
* no final optimizer workflow
* no watchlist item scrolling/selection
