Implement Phase 18.4: Mobile Search Results Screen.

GOAL:
Replace the `/search` placeholder with a real product search screen backed by `POST /products/search`.

Users should be able to:

* search from the home screen
* see product results
* tap a product
* navigate to `/product`

---

## CONTEXT

Already implemented:

* Phase 18.3 home search input
* `/search` route receives args like:
  `{ "query": "milk" }`
* Product detail screen exists at `/product`
* Backend endpoint exists:
  `POST /products/search`

---

## CRITICAL RULES

* DO NOT redesign the whole app
* DO NOT change backend behavior
* DO NOT add complex state management
* Keep UI simple, clean, and testable
* Preserve safe behavior when query args are missing

---

## FEATURES TO IMPLEMENT

## 1. Search route argument handling

Read initial query from route args:

* `query`
* tolerate missing/null query

If no query:

* show empty search state with input field

---

## 2. Search API client

Add or use existing method:

```dart
searchProducts({
  required String query,
  int limit = 25,
  int offset = 0,
})
```

Use `POST /products/search`.

Expected backend request shape:

```json
{
  "query": "milk",
  "layer_mode": "canonical_with_enrichment",
  "limit": 25,
  "offset": 0
}
```

---

## 3. Search screen UI

Screen should include:

* search input at top
* loading state
* result list
* empty state
* error state with retry

Each result card should show, if available:

* product name
* brand
* category path
* base product
* deal label if included
* best price if included

If deal/price is not available, do not crash.

---

## 4. Result tap behavior

On tap:

```dart
Navigator.pushNamed(
  context,
  '/product',
  arguments: {'canonicalProductId': result.canonicalProductId},
);
```

---

## 5. In-screen re-search

User can edit query and submit again.
Screen updates results.

No recent-search persistence yet.

---

## 6. Tests

Add/update Flutter tests for:

1. missing query shows safe empty search state
2. initial query triggers search/render
3. result card renders product name/category
4. tapping result navigates to `/product`
5. API error shows retry
6. empty results shows friendly empty state
7. in-screen re-search updates query/results
8. no crash on partial result payload

---

## 7. Docs

Update mobile docs/handoff:

* `/search` is real now
* endpoint used
* supported states
* what remains for filters/facets

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. search screen behavior
6. API behavior
7. what remains for filters/facets and optimize screen

SUCCESS CRITERIA:

* `/search` fetches product results
* search results render safely
* tapping result opens product screen
* loading/empty/error states work
* tests pass

---

## IMPLEMENTATION NOTES - 2026-04-24

Implemented in the Flutter app only.

* `/search` now builds `ProductSearchScreen` instead of a placeholder.
* The screen reads the optional route argument `query`.
* Missing or empty query shows an empty search state with an input field and does not call the API.
* Non-empty query calls `QueryApiClient.searchProducts(...)`, which posts to `/products/search` with:

```json
{
  "query": "...",
  "layer_mode": "canonical_with_enrichment",
  "limit": 25,
  "offset": 0
}
```

* Search results render canonical product name, brand/category/base-product metadata, optional deal label, and optional best price.
* Result taps navigate to `/product` with `{"canonicalProductId": "..."}`.
* In-screen re-search updates the active query and result list without recent-search persistence.
* No backend behavior, filters, facets, sorting, pagination, or `/optimize` behavior was changed.

Verification:

* `flutter analyze`
* `flutter test test/widget_test.dart test/widget_smoke_test.dart`
* `node tests/phase_5_flutter_app.test.js`
* `node tests/phase_5_5_ui_and_growth.test.js`
* `node tests/phase_5_6_localization.test.js`

