Implement Phase 18.3: Home Search + Add-to-Basket Entry.

GOAL:
Allow users to start from the home screen with a single input that supports BOTH:

* product search
* quick add to basket (draft list)

This should feel fast and natural.

---

## CONTEXT

Already implemented:

* Home screen (`/home/summary`)
* Navigation (Phase 18.1)
* Product detail screen (Phase 18.2)
* Backend endpoints:

  * `POST /products/search`
  * `POST /shopping-list/resolve`
  * `POST /basket/plan`
  * `POST /basket/optimize`

---

## CRITICAL RULES

* DO NOT redesign entire home screen
* DO NOT add complex state management
* DO NOT persist basket yet
* Keep everything lightweight and responsive
* Avoid overcomplication

---

## FEATURES TO IMPLEMENT

## 1. Home search input

Add at top of home screen:

* Text input field
* Placeholder:
  "Search products or add to basket..."

Behavior:

* controlled input
* submit on Enter / search button

---

## 2. Default action: Search

On submit:

* navigate to `/search`
* pass query

Example:

```dart
Navigator.pushNamed(
  context,
  '/search',
  arguments: {'query': inputText},
);
```

---

## 3. Add-to-basket action

Add a secondary button next to search input:

Label:

* “Add to basket”

On tap:

* navigate to `/optimize`
* pass draft items:

```json
{
  "items": ["milk"]
}
```

---

## 4. Quick-add parsing

Do NOT build full NLP.

Just:

* split by comma or newline
* trim strings
* ignore empty items

Example:
"milk, eggs, bread"
→ ["milk", "eggs", "bread"]

---

## 5. UX behavior

* pressing Enter → Search
* tapping Add → Basket
* clear input after navigation (optional)
* no blocking states

---

## 6. Tests

Add tests for:

1. search input renders
2. Enter triggers navigation to `/search`
3. Add-to-basket triggers `/optimize`
4. input parsing works
5. empty input does nothing safely
6. no crash on navigation

---

## 7. Docs

Update:

* home screen behavior
* input handling
* navigation logic

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. home input behavior
6. navigation behavior
7. what remains for full search screen

SUCCESS CRITERIA:

* user can search directly from home
* user can add quick basket items
* navigation works
* no heavy redesign
* tests pass

---

## IMPLEMENTATION NOTES - 2026-04-24

Implemented in the Flutter app only.

* `HomeScreen` now renders the top input with placeholder `Search products or add to basket...`.
* Enter/search button, voice capture, and recent-search chips call `Navigator.pushNamed(context, '/search', arguments: {'query': query})`.
* `Add to basket` parses the current input by comma or newline, trims entries, ignores empty values, and calls `Navigator.pushNamed(context, '/optimize', arguments: {'items': items})`.
* `/search` and `/optimize` remain lightweight placeholder screens, but now render the received query or draft basket items safely.
* No basket persistence, backend calls, resolver calls, planner calls, optimizer calls, or external service calls were added.

Verification:

* `flutter analyze`
* `flutter test test/widget_test.dart test/widget_smoke_test.dart`
* `node tests/phase_5_flutter_app.test.js`
* `node tests/phase_5_5_ui_and_growth.test.js`
* `node tests/phase_5_6_localization.test.js`
