# Phase 17.5: User-Facing Home Summary Feed

## Goal
Create a compact app-ready home summary endpoint for the mobile home screen.

The feed combines existing user-facing signals:
- top deals
- owner-scoped watchlist highlights
- owner-scoped saved-list shortcuts
- market trend highlights
- static quick actions

## Endpoint
- `GET /home/summary`

Temporary owner headers:
- `x-pricer-owner-id`
- `x-pricer-owner-type`

Optional query limits:
- `deal_limit`
- `watchlist_limit`
- `saved_list_limit`
- `market_limit`

## Helper Contract

`buildHomeSummary(...)` accepts:

```json
{
  "owner_context": {
    "owner_id": "user-1",
    "owner_type": "user"
  },
  "options": {
    "deal_limit": 10,
    "watchlist_limit": 5,
    "saved_list_limit": 5,
    "market_limit": 5
  }
}
```

It returns:

```json
{
  "owner": {
    "owner_id": "user-1",
    "owner_type": "user"
  },
  "top_deals": [],
  "watchlist_highlights": [],
  "market_highlights": [],
  "saved_lists": [],
  "quick_actions": [],
  "generated_at": "2026-04-24T12:00:00.000Z"
}
```

## Response Sections

### `top_deals`
Small product deal cards derived from existing price lookup and Phase 17.3 deal detection.

### `watchlist_highlights`
Owner-scoped highlights from the Phase 17.2 watchlist price view:
- `target_hit`
- `good_deal`
- `missing_price`

### `saved_lists`
Owner-scoped shortcuts only. The home summary does not run saved-list optimization.

### `market_highlights`
Small category trend cards derived from Phase 17.4 market trend summaries.

### `quick_actions`
Static app action descriptors:
- search products
- optimize a basket
- view watchlist

## Intentionally Excluded
- basket health diagnostics
- basket analytics internals
- optimizer debug output
- internal pipeline logs
- notification delivery
- external service calls
- mutations or persisted feed records

## Mobile Relationship
This endpoint is intended as the first backend contract for the future mobile home screen. The mobile UI can render these sections independently and hide empty arrays without making multiple startup calls.
