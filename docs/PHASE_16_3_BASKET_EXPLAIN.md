# Phase 16.3 Basket Explanation + User-Facing Summary Layer

## Implemented surface
- helper: `buildBasketOptimizationExplanation(...)`
- endpoint option: `optimizer_options.include_explanation = true`
- default `POST /basket/optimize` responses remain unchanged when explanation is omitted

## Implemented contract summary
- builds app-ready English summaries from existing optimizer results
- reports headline, summary text, recommended strategy, estimated total, savings, coverage, store summaries, item notes, warnings, and limitations
- keeps optimizer ranking and scoring unchanged
- preserves EUR currency
- does not mutate basket plans, price lookups, or optimizer results

## Implemented note and limitation types
- item notes: `missing_price`, `stale_price_excluded`, `ambiguous_auto_selected`, `unresolved_item_excluded`, `manual_item_included`, `optimization_blocked`
- limitations: `availability_not_guaranteed`, `travel_not_included`, `stale_prices_excluded`, `ambiguous_selection_needs_confirmation`

## Remaining for locality/travel-aware optimization
- actual travel/time/fuel or delivery cost modeling
- locale translations beyond English
- user-facing confirmation flows for ambiguous selections

---

Implement Phase 16.3: Basket Explanation + User-Facing Summary Layer.

GOAL:
Create a user-facing explanation/report layer on top of the existing basket optimizer results.

This phase should translate optimizer output into clear, trustworthy, app-ready summaries without changing optimization behavior.

CONTEXT:
Already implemented:

* Phase 15.3 shopping-list resolver
* Phase 15.4 basket input planner
* Phase 16.0 price lookup
* Phase 16.1 single-store optimizer
* Phase 16.2 multi-store optimizer
* `POST /basket/optimize`

Phase 16.2 can return:

* `best_single_store_option`
* `best_multi_store_option`
* `recommended_strategy`
* savings
* store-level item grouping
* alternatives
* warnings

DO NOT:

* change optimizer ranking/scoring logic
* mutate basket plans
* mutate price lookup
* mutate canonical/enrichment data
* add travel/locality scoring yet
* persist user baskets
* call external APIs

---

## FEATURES TO IMPLEMENT

## 1. Basket explanation builder

Add a pure helper such as:

`buildBasketOptimizationExplanation(...)`

Input:

```json
{
  "basket_plan": { ... },
  "price_lookup": { ... },
  "optimizer_result": { ... },
  "options": {
    "locale": "en",
    "currency": "EUR"
  }
}
```

Output:

```json
{
  "headline": "Best option: Lidl + Kaufland",
  "summary_text": "Estimated total €37.80, saving €4.50 compared with the best single-store option.",
  "recommended_strategy": "multi_store",
  "estimated_total": 37.80,
  "currency": "EUR",
  "savings": {
    "amount": 4.50,
    "comparison": "best_single_store"
  },
  "coverage": {
    "priced_item_count": 5,
    "missing_item_count": 0,
    "stale_item_count": 0,
    "coverage_ratio": 1.0
  },
  "store_summaries": [],
  "item_notes": [],
  "warnings": [],
  "limitations": []
}
```

---

## 2. Store summaries

For each recommended store/chain:

```json
{
  "chain_id": "lidl",
  "chain_name": "Lidl",
  "store_id": null,
  "store_name": null,
  "actual_total": 15.20,
  "currency": "EUR",
  "item_count": 3,
  "items": []
}
```

For single-store recommendations, return one store summary.

For multi-store recommendations, return multiple store summaries.

---

## 3. Item notes

Generate structured item-level notes for:

* missing price
* stale price excluded
* ambiguous candidate auto-selected
* unresolved item excluded
* placeholder/manual item included
* quantity/marker mismatch if visible from available data

Example:

```json
{
  "type": "ambiguous_auto_selected",
  "severity": "info",
  "input_text": "milk",
  "message": "Selected the cheapest matching candidate for this item."
}
```

Allowed severities:

* `info`
* `warning`
* `blocking`

---

## 4. Limitations

Always include limitations where relevant:

* travel/time not included
* availability not guaranteed unless data supports it
* prices may be stale if stale records included
* ambiguous selections may need confirmation

Example:

```json
{
  "type": "travel_not_included",
  "message": "Travel time and fuel cost are not included yet."
}
```

---

## 5. Explanation endpoint integration

Extend `POST /basket/optimize` so callers can request explanation output.

Add option:

```json
{
  "optimizer_options": {
    "strategy": "multi_store",
    "include_explanation": true
  }
}
```

If `include_explanation=true`, response includes:

```json
{
  "optimizer_result": { ... },
  "explanation": { ... }
}
```

Do not break existing default responses.

---

## 6. Localization-ready but English-only for now

Support only English text for this phase.

But structure code so later localization can swap message templates.

Do not implement translation now.

---

## 7. Tests

Add tests for:

1. single-store explanation headline
2. multi-store explanation headline
3. savings text appears when multi-store saves money
4. missing item note generated
5. ambiguous auto-selection note generated
6. limitations include travel not included
7. include_explanation=true adds explanation to endpoint result
8. include_explanation omitted preserves old response shape
9. currency remains EUR
10. explanation builder does not mutate optimizer result

---

## 8. Docs / handoff

Update docs with:

* explanation contract
* include_explanation option
* warning/note/limitation types
* what remains for locality/travel-aware optimization

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. explanation helper/API changes
6. note/warning/limitation types implemented
7. what remains for locality/travel-aware optimization

SUCCESS CRITERIA:

* optimizer behavior unchanged
* app-ready basket explanation exists
* explanation is optional
* old endpoint behavior remains compatible
* EUR preserved
* tests pass
