Implement Phase 20: Gap Detection Engine (MVP).

GOAL:
Detect unmet demand in the market using existing user interaction signals.

This is an **internal analytics feature**, not user-facing.

---

## CONTEXT

Available signals:

* Shopping-list resolver output (resolved / ambiguous / unresolved)
* Product search queries
* Watchlist additions
* Basket planning / optimization inputs
* Price lookup (for price pressure)
* Enrichment categories

Existing infra:

* canonical products + enrichment
* analytics store (Phase 16.6)
* metrics + health (Phase 16.5–16.7)

---

## CRITICAL RULES

* DO NOT use LLMs
* DO NOT change existing behavior
* DO NOT affect user-facing APIs
* DO NOT overcomplicate
* deterministic + explainable only

---

## FEATURES TO IMPLEMENT

## 1. Gap signal store

Add:

`gap_signal_store`

Record shape:

```json
{
  "signal_id": "gs_...",
  "query": "organic chicken",
  "normalized_query": "organic chicken",
  "canonical_attempt": "cp_... | null",
  "status": "resolved" | "ambiguous" | "unresolved",
  "confidence": 0.65,
  "category_l1": "Food & Beverage",
  "category_l2": "Meat",
  "price_context": {
    "avg_price": 9.20
  },
  "source": "search" | "shopping_list" | "watchlist",
  "timestamp": "..."
}
```

Write signals when:

* user searches
* resolver runs
* shopping list is submitted
* watchlist item added

---

## 2. Aggregation helper

Add:

`buildGapDetectionSummary(...)`

Input:

```json
{
  "window": "last_7d" | "last_30d" | "all",
  "group_by": "normalized_query" | "category_l2"
}
```

Output:

```json
{
  "groups": [
    {
      "key": "organic chicken",
      "search_count": 42,
      "unresolved_rate": 0.65,
      "ambiguous_rate": 0.20,
      "avg_price": 9.20,
      "gap_score": 8.7,
      "gap_type": "missing_supply"
    }
  ]
}
```

---

## 3. Gap scoring (simple)

Compute:

```text
gap_score =
  search_count * 0.4
+ unresolved_rate * 5
+ ambiguous_rate * 2
+ price_pressure_score
```

Where:

```text
price_pressure_score =
  if avg_price > category_avg * 1.2 → +2
  else 0
```

Keep constants configurable.

---

## 4. Gap classification

Rules:

* `missing_supply`:
  unresolved_rate > 0.5

* `poor_match_quality`:
  ambiguous_rate > 0.4

* `high_price_pressure`:
  avg_price significantly above category baseline

* `normal` otherwise

---

## 5. API endpoint

Add:

`GET /analytics/gap-detection`

Params:

* `window`
* `group_by`
* `limit`

Return:

* sorted by `gap_score` descending

---

## 6. Tests

Add tests for:

1. unresolved queries produce high gap_score
2. ambiguous queries produce medium gap_score
3. high price raises score
4. grouping works
5. empty dataset safe
6. no mutation
7. deterministic output

---

## 7. Docs

Document:

* gap signals
* scoring formula
* gap types
* interpretation:

  * “missing_supply” = product not found
  * “poor_match_quality” = catalog/enrichment issue
  * “high_price_pressure” = pricing opportunity

---

## OUTPUT FORMAT

Return:

1. files changed
2. diff summary
3. commands run
4. test results
5. signal store added
6. API endpoint added
7. what remains for advanced market intelligence

SUCCESS CRITERIA:

* gap signals captured
* gap summary computed
* API returns ranked gaps
* no user-facing impact
* deterministic logic
* tests pass
