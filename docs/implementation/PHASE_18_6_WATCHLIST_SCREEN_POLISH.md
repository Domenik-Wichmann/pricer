# Phase 18.6 Implementation - Mobile Watchlist Screen Polish

Implemented on 2026-04-24.

## Scope

The mobile `/watchlist` screen now consumes the existing owner-scoped backend watchlist price view and supports product navigation plus lightweight item removal.

The root-shell watchlist tab is marked active only when selected so the price view is not fetched while the tab is hidden in the `IndexedStack`. Named `/watchlist` routes are active by default.

## API Client

Added:

```dart
getWatchlistPrices({
  required String ownerId,
  String ownerType = 'anonymous',
})

removeWatchlistItem({
  required String ownerId,
  String ownerType = 'anonymous',
  required String watchId,
})
```

`getWatchlistPrices` calls `GET /watchlist/prices`; `removeWatchlistItem` calls `DELETE /watchlist/:id`.

## DTOs

Added mobile DTOs for:

- `WatchlistPriceViewResponse`
- `WatchlistPriceItem`
- `WatchlistProductSummary`
- `WatchlistPriceInfo`

The parser tolerates missing product, price, deal, and best-price fields.

## UI Sections

- Premium/alerts banner remains in place.
- Drops summary remains in place and now summarizes backend price-view items.
- Loading skeletons.
- Retryable error card.
- Empty state with `Search products`.
- Price cards with best price, chain/store, deal badge, target-hit badge, target price, and missing-price state.

## Exclusions

No backend changes, notifications, alert scheduling, analytics/health exposure, or new state architecture were added.

## Verification

Recorded in `docs/test_runs/phase_18_6_2026-04-24.json`.
