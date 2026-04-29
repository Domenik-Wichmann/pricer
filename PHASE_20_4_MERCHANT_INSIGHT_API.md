Implement Phase 20.4: Merchant / Admin Insights API.

GOAL:
Create a clean, structured API layer that organizes market intelligence outputs (gap detection + opportunity reports) into dashboard-ready endpoints.

This is NOT a UI.
This is a structured data layer for:

* internal dashboards
* future merchant-facing tools
* export/report pipelines

---

## CONTEXT

Already implemented:

* Phase 20.0 gap detection
* Phase 20.1 locality-aware gaps
* Phase 20.2 chain/store segmentation
* Phase 20.3 opportunity reports

Existing endpoints:

* `/analytics/gap-detection`
* `/analytics/gap-detection/localities`
* `/analytics/gap-detection/coverage-by-chain`
* `/analytics/opportunities`

These are powerful but low-level.

Now we build a higher-level, organized insights API.

---

## CRITICAL RULES

* DO NOT change existing endpoints
* DO NOT mutate underlying data
* DO NOT introduce LLMs
* DO NOT call external services
* DO NOT overcomplicate
* Keep everything deterministic and composable

---

## FEATURES TO IMPLEMENT

## 1. Overview endpoint

Add:

`GET /analytics/insights/overview`

Purpose:
Return high-level summary cards.

Output:

```json
{
  "window": "last_30d",
  "totals": {
    "total_signals": 1024,
    "total_opportunities": 87,
    "high_confidence_opportunities": 23
  },
  "top_opportunity": {
    "title": "...",
    "gap_score": 9.1,
    "locality_code": "burgas"
  },
  "top_category": {
    "category_l2": "Beverages",
    "opportunity_count": 12
  }
}
```

---

## 2. Top opportunities endpoint

Add:

`GET /analytics/insights/opportunities`

Wrapper around Phase 20.3:

* default sorted top opportunities
* optional filters:

  * locality
  * category
  * chain

Return same opportunity objects but in a dashboard-friendly wrapper.

---

## 3. Category insights endpoint

Add:

`GET /analytics/insights/categories`

Output:

```json
{
  "categories": [
    {
      "category_l2": "Beverages",
      "opportunity_count": 12,
      "avg_gap_score": 6.2,
      "top_gap": "matcha latte"
    }
  ]
}
```

---

## 4. Locality insights endpoint

Add:

`GET /analytics/insights/localities`

Output:

```json
{
  "localities": [
    {
      "locality_code": "burgas",
      "opportunity_count": 15,
      "top_gap": "organic chicken",
      "avg_gap_score": 6.8
    }
  ]
}
```

---

## 5. Chain insights endpoint

Add:

`GET /analytics/insights/chains`

Output:

```json
{
  "chains": [
    {
      "chain_id": "kaufland",
      "coverage_rate": 0.42,
      "gap_count": 18,
      "top_gap": "matcha latte"
    }
  ]
}
```

Reuse `coverage_by_chain`.

---

## 6. Response consistency

All endpoints should:

* include `window`
* include applied filters
* include `generated_at`
* return bounded result sizes

---

## 7. Tests

Add tests for:

1. overview aggregates correctly
2. category aggregation correct
3. locality aggregation correct
4. chain aggregation correct
5. filters applied correctly
6. empty dataset safe
7. no mutation of source data
8. deterministic output

---

## 8. Docs

Update docs:

* insights API overview
* endpoint definitions
* intended usage (dashboard / merchant)
* not consumer-facing

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. endpoints added
6. aggregation logic
7. what remains for dashboard UI / auth gating

SUCCESS CRITERIA:

* insights endpoints exist
* data is organized and consumable
* no existing behavior breaks
* deterministic + consistent
* tests pass

---

## Implementation Notes - 2026-04-25

Implemented.

* Added merchant/admin insight helpers in the Phase 20 gap analytics module.
* Added `GET /analytics/insights/overview`, `/analytics/insights/opportunities`, `/analytics/insights/categories`, `/analytics/insights/localities`, and `/analytics/insights/chains`.
* Insight responses include `window`, applied `filters`, deterministic `generated_at`, and bounded result sizes.
* Category/locality rollups aggregate opportunity cards; chain rollups reuse coverage evidence where available.
* No existing low-level analytics endpoints were changed.
* No LLMs, external services, persistence, or mutation were introduced.
* Verification is recorded in `docs/test_runs/phase_20_4_2026-04-25.json` and `handoff/phase_20_4/`.
