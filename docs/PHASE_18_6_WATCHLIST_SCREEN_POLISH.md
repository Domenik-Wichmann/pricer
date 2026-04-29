# Phase 18.6: Mobile Watchlist Screen Polish

Implemented on 2026-04-24.

## Goal

Turn `/watchlist` into a useful mobile price-tracker screen backed by the existing backend watchlist price view.

## Endpoint Used

- `GET /watchlist/prices`
- `DELETE /watchlist/:id`

Both use the temporary owner headers:

- `x-pricer-owner-id`
- `x-pricer-owner-type`

## Visible Behavior

- Loading state while prices load.
- Error state with retry.
- Empty state with `Search products` action to `/search`.
- Watched product cards showing label/product name, best price, currency, chain/store, deal status, target-hit badge, and missing-price state.
- Product card tap navigates to `/product` with `canonicalProductId`.
- Remove action calls the backend delete endpoint and removes the item from the local list after success.

## Intentionally Excluded

- Backend behavior changes.
- Notifications or alert scheduling.
- Internal analytics, health metrics, or debug output.
- Complex app state architecture.

## Remaining Work

- Saved-list/watchlist cross-prompts.
- Notification opt-in and alert delivery UX.
- Final visual polish for release.
- Optional edit-target-price flow.
