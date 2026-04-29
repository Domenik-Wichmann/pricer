Implement Phase 18.1: Mobile Navigation Wiring.

GOAL:
Replace placeholder actions in the Flutter home screen with real navigation flows between core screens.

This is functional navigation, not final UX polish.

---

## CONTEXT

Already implemented:

* Phase 18.0 home screen using `/home/summary`
* Sections:

  * Top Deals
  * Watchlist Highlights
  * Saved Lists
  * Market Highlights
  * Quick Actions

Currently:

* Quick actions use placeholder snackbars
* No real navigation between screens

---

## CRITICAL RULES

* DO NOT redesign UI
* DO NOT add complex routing architecture
* DO NOT change backend
* DO NOT break existing home screen rendering
* Keep navigation simple and testable

---

## FEATURES TO IMPLEMENT

## 1. Define routes

Add simple named routes:

```dart
'/search'
'/watchlist'
'/lists'
'/list_detail'
'/optimize'
```

Optional:

```dart
'/product'
```

Use existing Flutter navigation approach (Navigator or Router).

---

## 2. Wire Quick Actions

Replace snackbar actions:

* Search → navigate to `/search`
* Optimize basket → navigate to `/optimize`
* View watchlist → navigate to `/watchlist`
* Saved lists → navigate to `/lists`

---

## 3. Saved list navigation

From home:

* Tap saved list card →

  * navigate to `/list_detail`
  * pass `list_id`

---

## 4. Watchlist highlight navigation

* Tap highlight →

  * navigate to `/watchlist`
  * optionally scroll/select item later (not required now)

---

## 5. Deals navigation

* Tap deal card →

  * navigate to `/product`
  * pass `canonical_product_id`

Product screen can be placeholder.

---

## 6. Placeholder screens

Create minimal screens:

* SearchScreen
* WatchlistScreen
* ListsScreen
* ListDetailScreen
* OptimizeScreen
* ProductScreen (optional)

Each should:

* show title
* basic layout
* confirm navigation works

---

## 7. Navigation arguments

Use simple arguments:

```dart
Navigator.pushNamed(
  context,
  '/list_detail',
  arguments: {'listId': id},
);
```

Do not over-engineer.

---

## 8. Tests

Add/update tests for:

1. tapping quick actions navigates
2. tapping saved list navigates
3. tapping deal navigates
4. routes exist
5. no crashes when arguments missing
6. home screen still renders correctly

---

## 9. Docs

Update docs:

* navigation map
* routes
* what is placeholder vs complete

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. routes added
6. navigation behavior
7. what remains for real screen implementations

SUCCESS CRITERIA:

* home screen fully navigable
* no snackbars used for core actions
* simple routing works
* placeholder screens exist
* no backend changes
* tests pass

IMPLEMENTATION NOTES - 2026-04-24:

Completed:

* Added `AppRoutes` with simple named routes:
  * `/search`
  * `/watchlist`
  * `/lists`
  * `/list_detail`
  * `/optimize`
  * `/product`
* Registered the route generator on `MaterialApp`.
* Replaced home quick-action snackbars with `Navigator.pushNamed(...)`.
* Made top deal, watchlist highlight, and saved-list home cards tappable.
* Passed simple route arguments:
  * `/list_detail`: `listId`, `list_id`, `name`, `itemCount`
  * `/product`: `canonicalProductId`, `canonical_product_id`
* Reused existing watchlist and shopping-list screens.
* Added lightweight placeholder screens for search, optimize, product, missing list detail, and unknown routes.

Navigation map:

| Source | Destination | Status |
| --- | --- | --- |
| Quick action: Search products | `/search` | Placeholder |
| Quick action: Optimize basket | `/optimize` | Placeholder |
| Quick action: View watchlist | `/watchlist` | Existing screen |
| Home saved-list card | `/list_detail` | Existing detail screen when arguments exist; placeholder if missing |
| Home watchlist highlight | `/watchlist` | Existing screen |
| Home deal card | `/product` | Placeholder |

Known limitations:

* `/search` and `/optimize` are functional placeholders, not final product workflows. `/product` was replaced by the Phase 18.2 product detail screen.
* `/watchlist` does not scroll to a selected highlighted item yet.
* `/list_detail` can open from home using summary shortcut metadata, but full saved-list backend/mobile reconciliation remains future work.
