Implement Phase 17.2: Watchlist / Price Tracker Foundation.

GOAL:
Add an owner-scoped watchlist feature so users can save canonical products they care about and view current/latest price information for those products.

This is the foundation for future deal alerts and notifications.

---

## CONTEXT

Already implemented:

* Phase 16.0 price lookup
* Phase 16.1–16.4 basket optimization
* Phase 16.5–16.7 metrics/health
* Phase 17 saved shopping lists
* Phase 17.1 owner-scoped saved lists with temporary owner headers:

  * `x-pricer-owner-id`
  * `x-pricer-owner-type`

Now add owner-scoped watched products.

---

## CRITICAL RULES

* DO NOT build notification sending yet
* DO NOT build push/FCM yet
* DO NOT mutate canonical products
* DO NOT mutate price records
* DO NOT persist price snapshots inside watchlist records
* Watchlist stores only owner + canonical product reference + optional user metadata

---

## FEATURES TO IMPLEMENT

## 1. Storage model

Add:

`watchlist_store`

Record:

```json
{
  "watch_id": "wl_...",
  "owner_id": "anonymous_or_user_id",
  "owner_type": "anonymous" | "user" | "system",
  "canonical_product_id": "cp_...",
  "label": "Coffee",
  "created_at": "...",
  "updated_at": "..."
}
```

Optional fields if simple:

* `target_price`
* `notes`

Do not store latest price in the record.

---

## 2. Service functions

Add helpers:

* `addWatchlistItem(ownerContext, input)`
* `listWatchlistItems(ownerContext, options)`
* `getWatchlistItem(ownerContext, watch_id)`
* `removeWatchlistItem(ownerContext, watch_id)`
* `updateWatchlistItem(ownerContext, watch_id, updates)`

Behavior:

* owner-scoped like saved lists
* `system` owner may access all if consistent with Phase 17.1
* duplicate watch for same owner + canonical product should be idempotent or rejected cleanly

Recommended:

* idempotent return existing record

---

## 3. Price tracker read view

Add helper:

`buildWatchlistPriceView(ownerContext, options)`

For each watchlist item:

* get canonical product detail if available
* lookup current prices with existing Phase 16.0 price lookup
* include:

  * best_price
  * price_status
  * price_records
  * optional history if existing price lookup supports it

Output item shape:

```json
{
  "watch_id": "wl_...",
  "canonical_product_id": "cp_...",
  "label": "Coffee",
  "product": {
    "canonical_product_id": "cp_...",
    "canonical_name": "..."
  },
  "price": {
    "price_status": "priced",
    "best_price": {
      "price": 4.99,
      "currency": "EUR",
      "chain_id": "..."
    },
    "price_records": []
  }
}
```

---

## 4. API endpoints

Add:

### Add watched product

`POST /watchlist`

```json
{
  "canonical_product_id": "cp_...",
  "label": "Coffee",
  "target_price": 4.50
}
```

### List watchlist records

`GET /watchlist`

### Get one

`GET /watchlist/:id`

### Update

`PATCH /watchlist/:id`

### Remove

`DELETE /watchlist/:id`

### Price tracker view

`GET /watchlist/prices`

Returns watched products with latest price lookup.

Owner is resolved via existing temporary owner headers.

---

## 5. Validation

* require `canonical_product_id`
* reject empty/invalid updates
* cap label length
* validate `target_price` if present
* bounded errors
* cross-owner access returns not found, not forbidden

---

## 6. Tests

Add tests for:

1. add watchlist item
2. duplicate add is idempotent
3. list only owner’s items
4. get blocks other owner
5. update blocks other owner
6. delete blocks other owner
7. price view includes best price
8. missing price shows `missing`
9. no price snapshots stored in watchlist record
10. no mutation of canonical/price data

---

## 7. Docs

Update docs:

* watchlist schema
* endpoints
* owner behavior
* price tracker view
* what remains for deal alerts and notifications

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. endpoints added
6. storage schema
7. price tracker behavior
8. what remains for deal alerts / notification rules

SUCCESS CRITERIA:

* owner-scoped watchlist exists
* price tracker read view works
* watchlist stores only references/metadata
* price lookup remains source of truth
* no notification sending yet
* tests pass

---

## IMPLEMENTATION STATUS

Implemented on April 24, 2026.

Runtime additions:

* `watchlist_store`
* `addWatchlistItem(...)`
* `listWatchlistItems(...)`
* `getWatchlistItem(...)`
* `updateWatchlistItem(...)`
* `removeWatchlistItem(...)`
* `buildWatchlistPriceView(...)`

API endpoints:

* `POST /watchlist`
* `GET /watchlist`
* `GET /watchlist/prices`
* `GET /watchlist/:id`
* `PATCH /watchlist/:id`
* `DELETE /watchlist/:id`

Ownership behavior:

* Owner context uses the Phase 17.1 temporary headers: `x-pricer-owner-id` and `x-pricer-owner-type`.
* Missing owner context defaults to anonymous.
* Cross-owner get, update, delete, and price visibility are blocked with bounded not-found behavior.
* Duplicate adds for the same owner and canonical product are idempotent and return the existing record.

Persistence behavior:

* Watchlist records store owner metadata, canonical product reference, label, optional target price, optional notes, and timestamps.
* Latest prices, best prices, price records, histories, alerts, and notifications are not stored in `watchlist_store`.
* The price tracker view calls the Phase 16.0 canonical price lookup layer at read time.

Future work:

* Firebase Auth-backed owner resolution.
* Deal-alert rules and notification scheduling.
* Push/FCM token registration and delivery.
* Price-threshold and recurring-deal integration with the existing Phase 9 intelligence layer.
