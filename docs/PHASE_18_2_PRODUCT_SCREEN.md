Implement Phase 18.2: Mobile Product Detail Screen.

GOAL:
Replace the `/product` placeholder with a real product detail screen backed by existing backend APIs.

This should let users tap a deal/product from the home screen and see useful product information.

---

## CONTEXT

Already implemented:

* Phase 18.0 home summary screen
* Phase 18.1 named navigation routes
* `/product` route exists and receives arguments such as:

  * `canonical_product_id`
* Backend endpoints already exist:

  * `GET /products/:id`
  * `POST /products/deal-check`
  * `POST /watchlist`
  * `GET /watchlist`

---

## CRITICAL RULES

* DO NOT redesign the whole app
* DO NOT change backend behavior
* DO NOT build complex state architecture
* Keep UI functional and clean
* Handle missing/invalid route arguments safely
* Do not crash if deal/watchlist APIs are unavailable

---

## FEATURES TO IMPLEMENT

## 1. Product detail route handling

In `/product`, read route args:

```dart
{
  "canonicalProductId": "cp_..."
}
```

Also tolerate alternate key names if current home cards pass:

* `canonical_product_id`
* `id`

If missing:

* show friendly placeholder/error state

---

## 2. API client additions

Add methods if missing:

```dart
getProductById(String canonicalProductId)
checkProductDeals(List<String> canonicalProductIds)
addWatchlistItem(...)
```

Use existing API base URL and owner header patterns.

---

## 3. Product detail screen

Show:

* product name
* category hierarchy if available
* brand if available
* base product if available
* flavor / attributes if available
* markers if useful
* deal status if available
* best price if available from deal-check or product payload
* button: “Add to watchlist”

Keep layout card-based and consistent with existing app styling.

---

## 4. Watchlist action

Add button:

```text
Add to watchlist
```

On tap:

* call `POST /watchlist`
* send `canonical_product_id`
* optional label = product name
* show success state/snackbar
* handle duplicate/idempotent response gracefully

Do not implement remove/watchlist toggle unless easy and already supported.

---

## 5. Loading / error states

Support:

* loading
* product not found
* API error with retry
* missing route argument
* deal-check failure should not block product rendering
* watchlist add failure should show bounded error

---

## 6. Tests

Add/update Flutter tests for:

1. missing product args shows safe state
2. product detail loads and renders name/category
3. deal info renders when available
4. deal failure does not block product rendering
5. add to watchlist triggers client call / success state
6. API error shows retry
7. home deal tap still navigates to product route

Use existing test style/mocks.

---

## 7. Docs

Update mobile docs:

* `/product` route behavior
* required/optional args
* backend endpoints used
* remaining polish work

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. product detail behavior
6. watchlist behavior
7. what remains for search screen / optimize screen

SUCCESS CRITERIA:

* `/product` is no longer just placeholder
* product details render from backend response
* add-to-watchlist works
* errors are safe
* no backend changes
* tests pass

IMPLEMENTATION NOTES - 2026-04-24:

Completed:

* `/product` now opens a real Flutter product detail route instead of the Phase 18.1 placeholder.
* Route arguments are accepted as:
  * `canonicalProductId`
  * `canonical_product_id`
  * `id`
* Mobile API client methods added:
  * `getProductById(String canonicalProductId)` -> `GET /products/:id`
  * `checkProductDeals(List<String> canonicalProductIds)` -> `POST /products/deal-check`
  * `addWatchlistItem(...)` -> `POST /watchlist` with owner headers
* Product screen renders:
  * product name
  * category path
  * brand
  * base product
  * flavor, attributes, product form, packaging, and markers
  * deal status and best price when available
  * Add to watchlist button
* Deal-check failure is non-blocking.
* Missing route args, not found, product API errors, retry, and watchlist add failure are bounded.

Backend endpoints used:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/products/:id` | Product detail |
| `POST` | `/products/deal-check` | Deal/best-price signal |
| `POST` | `/watchlist` | Add product to owner-scoped watchlist |

Remaining polish:

* Localize product-screen copy.
* Add richer canonical product imagery when image data exists.
* Add remove/toggle watchlist behavior after watchlist state is exposed cleanly.
* Build real `/search` and `/optimize` screens.
