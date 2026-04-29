Implement Phase 20.1: Locality-Aware Gap Intelligence.

GOAL:
Extend Phase 20.0 gap detection so it can identify **where** unmet demand exists (city/region level), not just what.

Primary question:
“Which products/categories are missing or weak in specific localities?”

---

## CONTEXT

Already implemented:

* Phase 20.0 gap detection (formerly 18.7)
* `gap_signal_store`
* `buildGapDetectionSummary(...)`
* `GET /analytics/gap-detection`

Signals already include:

* `query`
* `normalized_query`
* `status` (resolved/ambiguous/unresolved)
* `category_l*`
* `price_context`
* `source`
* `timestamp`

We now add locality awareness.

---

## CRITICAL RULES

* DO NOT change existing gap detection behavior
* DO NOT mutate existing records
* DO NOT add LLMs
* DO NOT add external data
* Keep deterministic and explainable
* Backward-compatible API behavior

---

## FEATURES TO IMPLEMENT

## 1. Add locality to signals

Update signal capture to include:

```json
{
  "locality_code": "burgas"
}
```

Sources:

* product search (derive from request or default)
* shopping list / basket pipeline (if locality known)
* watchlist actions (inherit from owner context if available)

If missing:

* allow `null`
* do not block ingestion

---

## 2. Locality aggregation helper

Add:

`buildLocalityGapSummary(...)`

Input:

```json
{
  "window": "last_7d" | "last_30d" | "all",
  "group_by": "normalized_query" | "category_l2",
  "locality_code": "burgas" | null
}
```

Behavior:

* if `locality_code` provided:
  → filter to that locality

* if not:
  → aggregate per locality

Output (single locality):

```json
{
  "locality_code": "burgas",
  "groups": [
    {
      "key": "organic chicken",
      "search_count": 42,
      "unresolved_rate": 0.65,
      "gap_score": 8.7,
      "gap_type": "missing_supply",
      "category_l2": "Meat"
    }
  ]
}
```

Output (all localities):

```json
{
  "localities": [
    {
      "locality_code": "burgas",
      "top_gaps": [...]
    },
    {
      "locality_code": "sofia",
      "top_gaps": [...]
    }
  ]
}
```

---

## 3. Locality ranking

Within each locality:

* sort by `gap_score` descending
* cap results (e.g. top 20)

Across localities:

* sort by:

  * highest gap_score
  * or highest unresolved_rate

---

## 4. API endpoint

Extend existing endpoint:

```http
GET /analytics/gap-detection
```

Add query params:

* `locality_code`
* `group_by`
* `window`
* `limit`

Behavior:

* if `locality_code` provided → return locality-specific summary
* else → return multi-locality summary

---

## 5. Optional new endpoint (if cleaner)

```http
GET /analytics/gap-detection/localities
```

Returns:

* top gaps per locality

Keep implementation simple.

---

## 6. Tests

Add tests for:

1. signals include locality_code
2. locality filtering works
3. multi-locality aggregation works
4. missing locality handled safely
5. grouping by category vs query
6. sorting by gap_score
7. deterministic output
8. no mutation of original signals

---

## 7. Docs

Update docs with:

* locality-aware gap detection
* meaning of locality_code
* interpretation:

  * “gap exists globally”
  * “gap exists in specific locality”
* note limitations:

  * depends on available signals
  * not true supply inventory

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. locality-aware logic
6. API changes
7. what remains for geographic clustering / merchant-facing tools

SUCCESS CRITERIA:

* gaps can be segmented by locality
* existing global gap detection still works
* API supports locality filtering
* no behavior regressions
* deterministic + explainable
* tests pass
