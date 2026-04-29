Implement Phase 18.5: Mobile Optimize Basket Screen.

GOAL:
Replace the `/optimize` placeholder with a real basket optimization screen backed by `POST /basket/optimize`.

This is the main user-facing payoff flow:
user enters basket → app recommends best store/split → shows total/savings/explanation.

---

## CONTEXT

Already implemented:

* Phase 18.3 home Add-to-Basket entry
* `/optimize` route receives args like:
  `{ "items": ["milk", "eggs"] }`
* Backend endpoint exists:
  `POST /basket/optimize`
* Backend supports:

  * single-store optimization
  * multi-store optimization
  * explanation
  * convenience scoring
  * metrics optionally

---

## CRITICAL RULES

* DO NOT redesign the whole app
* DO NOT change backend behavior
* DO NOT add complex state architecture
* Keep UI functional, clean, and testable
* Do not persist baskets yet
* Do not expose internal analytics/health metrics to normal users

---

## FEATURES TO IMPLEMENT

## 1. Route argument handling

Read draft items from route args:

* `items`: List<String>
* tolerate missing/null/empty args

If missing:

* show empty basket entry state

---

## 2. Basket input UI

Allow user to edit basket items.

Simple version:

* multiline text field
* one item per line
* also support comma-separated input

Example:

```text
milk
10 eggs
toilet paper
```

Parse:

* newline and comma
* trim
* ignore blanks

---

## 3. API client method

Add:

```dart
optimizeBasket({
  required List<String> items,
  String strategy = 'multi_store',
  bool includeExplanation = true,
  bool includeConvenienceScoring = false,
})
```

POST `/basket/optimize`

Request shape:

```json
{
  "items": ["milk", "10 eggs"],
  "layer_mode": "canonical_with_enrichment",
  "optimizer_options": {
    "strategy": "multi_store",
    "include_explanation": true,
    "include_convenience_scoring": false
  }
}
```

Do not request internal metrics by default.

---

## 4. Optimize screen states

Support:

* empty state
* ready/input state
* loading
* success
* error with retry

---

## 5. Result UI

Show simple user-facing result:

Top summary card:

* recommended strategy
* estimated total
* currency EUR
* savings if available
* store count if multi-store

Store cards:

* chain/store name
* subtotal
* item count
* items if available

Warnings/notes:

* missing items
* stale prices excluded
* ambiguous auto-selected
* travel not included
* availability not guaranteed

If explanation exists:

* show headline
* summary text
* limitations

Do NOT show:

* internal score_total unless tucked away or omitted
* raw metrics
* debug objects

---

## 6. User controls

Add simple controls:

* Optimize button
* Strategy toggle:

  * Best single store
  * Best overall / multi-store

Map:

* single store → `strategy: single_store`
* multi-store → `strategy: multi_store`

Convenience scoring can stay off for now unless easy to expose as a simple toggle:

* “Prefer fewer stores”

If added:

* include_convenience_scoring = true
* user_context.single_store_preferred = true

Keep optional.

---

## 7. Tests

Add/update Flutter tests for:

1. missing args shows empty basket state
2. draft items from route render in input
3. optimize button calls API
4. loading state
5. success renders estimated total/store
6. explanation headline renders
7. error state with retry
8. strategy toggle changes request
9. no internal metrics shown

Use existing mock/test patterns.

---

## 8. Docs

Update mobile docs/handoff:

* `/optimize` is real now
* endpoint used
* request options
* visible result sections
* what remains for saved basket/list integration

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. optimize screen behavior
6. API request behavior
7. what remains for saved-list integration / visual polish

SUCCESS CRITERIA:

* `/optimize` is no longer placeholder
* user can edit basket and run optimization
* result shows total/savings/stores/explanation
* errors and empty states are safe
* internal metrics/debug not exposed
* tests pass

---

## IMPLEMENTATION NOTES - 2026-04-24

Implemented in the Flutter mobile app.

* `/optimize` now renders `OptimizeBasketScreen` instead of the placeholder.
* Route args support `{ "items": ["milk", "eggs"] }` and safely tolerate missing or empty args.
* The screen parses comma/newline input, lets users choose `single_store` or `multi_store`, and calls `POST /basket/optimize`.
* Mobile request defaults to `layer_mode: canonical_with_enrichment`, `include_explanation: true`, `include_convenience_scoring: false`, and no internal metrics.
* The UI renders a summary card, store cards, notes/warnings, and explanation text.
* Internal `score_total`, raw metrics, and debug objects are intentionally omitted from app UI.
* Saved-list deep integration, convenience preference UX, and final visual polish remain future mobile work.
