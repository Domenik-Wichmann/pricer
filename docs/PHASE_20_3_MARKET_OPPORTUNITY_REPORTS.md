Implement Phase 20.3: Market Opportunity Reports.

GOAL:
Turn raw gap-detection summaries into business-readable opportunity reports.

This phase should make market intelligence understandable for:

* internal review
* future merchant dashboards
* entrepreneurs/small shops
* category opportunity analysis

This is still observational analytics, not a guaranteed business recommendation.

---

## CONTEXT

Already implemented:

* Phase 20.0 Market Gap Detection MVP
* Phase 20.1 Locality-Aware Gap Intelligence
* Phase 20.2 Optional Chain / Store Segmentation
* `gap_signal_store`
* `buildGapDetectionSummary(...)`
* `buildLocalityGapSummary(...)`
* `buildGapCoverageByChain(...)`
* `GET /analytics/gap-detection`
* `GET /analytics/gap-detection/localities`
* `GET /analytics/gap-detection/coverage-by-chain`

Now build a report layer on top of these signals.

---

## CRITICAL RULES

* DO NOT use LLMs
* DO NOT call external services
* DO NOT mutate gap signals
* DO NOT mutate canonical/enrichment/price/user data
* DO NOT overstate certainty
* Keep outputs deterministic and evidence-based
* This is internal/B2B-style analytics, not normal user UI

---

## FEATURES TO IMPLEMENT

## 1. Opportunity report helper

Add:

`buildMarketOpportunityReports(...)`

Input:

```json
{
  "window": "last_7d" | "last_30d" | "all",
  "locality_code": "burgas",
  "category_l2": "Beverages",
  "limit": 20,
  "min_gap_score": 2.0
}
```

Output:

```json
{
  "window": "last_30d",
  "filters": {
    "locality_code": "burgas",
    "category_l2": "Beverages"
  },
  "opportunities": [
    {
      "opportunity_id": "opp_...",
      "title": "Matcha latte products in Burgas",
      "opportunity_type": "missing_supply",
      "confidence": "medium",
      "locality_code": "burgas",
      "category_l2": "Beverages",
      "gap_score": 8.7,
      "evidence": {
        "search_count": 42,
        "unresolved_rate": 0.65,
        "ambiguous_rate": 0.12,
        "avg_price": 9.2,
        "price_pressure": true,
        "coverage_by_chain": []
      },
      "recommended_action": "Investigate product sourcing or catalog coverage for this local demand.",
      "limitations": [
        "Demand signals are based on app interactions, not full-market surveys."
      ]
    }
  ]
}
```

---

## 2. Opportunity types

Use existing gap classification as base.

Supported `opportunity_type` values:

* `missing_supply`
* `poor_match_quality`
* `high_price_pressure`
* `distribution_gap`
* `data_quality_gap`
* `emerging_interest`

Suggested deterministic rules:

### missing_supply

* unresolved_rate > 0.5

### poor_match_quality

* ambiguous_rate > 0.4

### high_price_pressure

* price pressure signal is true

### distribution_gap

* coverage_by_chain shows at least one chain with reasonable coverage and one chain/locality bucket with poor coverage

### data_quality_gap

* high unresolved/ambiguous rate but low signal count

### emerging_interest

* high search_count or signal_count but not enough history for stronger classification

Keep rules centralized and documented.

---

## 3. Confidence labels

Add confidence:

* `high`
* `medium`
* `low`

Suggested rules:

* high: signal_count >= 50 and gap_score high
* medium: signal_count >= 10
* low: signal_count < 10

Do not claim certainty beyond evidence.

---

## 4. Recommended actions

Generate simple deterministic action text.

Examples:

* missing_supply:
  "Investigate sourcing or supplier coverage for this demand."

* poor_match_quality:
  "Improve catalog matching, synonyms, or enrichment for this product family."

* high_price_pressure:
  "Review pricing, promotions, or lower-cost alternatives."

* distribution_gap:
  "Compare coverage across chains and consider targeted stocking."

* data_quality_gap:
  "Verify catalog data and ingestion coverage before treating this as market demand."

* emerging_interest:
  "Monitor this demand signal as more usage data accumulates."

---

## 5. API endpoint

Add:

`GET /analytics/opportunities`

Query params:

* `window`
* `locality_code`
* `category_l1`
* `category_l2`
* `chain_id`
* `store_id`
* `limit`
* `min_gap_score`

Return:

* opportunity report output

Keep it internal/analytics-oriented.

---

## 6. Evidence block

Each opportunity should include evidence pulled from existing summaries:

* search_count / signal_count
* unresolved_rate
* ambiguous_rate
* gap_score
* gap_type
* category fields if known
* locality if known
* price pressure if available
* optional coverage_by_chain if locality/query/category makes it meaningful

Do not fabricate evidence.

---

## 7. Sorting

Sort opportunities by:

1. gap_score descending
2. confidence descending
3. signal_count descending
4. deterministic key tie-breaker

---

## 8. Tests

Add tests for:

1. missing_supply report generation
2. poor_match_quality report generation
3. high_price_pressure report generation
4. distribution_gap from coverage-by-chain
5. data_quality_gap for low sample weak data
6. confidence labels
7. recommended action text
8. filters preserved in output
9. deterministic sorting
10. empty dataset safe
11. no mutation of input signals/summaries

---

## 9. Docs

Update docs with:

* opportunity report contract
* opportunity types
* confidence rules
* recommended action rules
* interpretation guidance
* limitations / not full-market proof
* merchant-facing future path

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. opportunity report logic
6. API endpoint added
7. what remains for merchant-facing dashboard / paid insights layer

SUCCESS CRITERIA:

* opportunities are deterministic and evidence-based
* no LLM/external calls
* no existing gap behavior breaks
* reports are understandable to non-engineers
* tests pass

---

## Implementation Notes - 2026-04-25

Implemented.

* Added `buildMarketOpportunityReports(...)` in the Phase 20 gap analytics module.
* Added `GET /analytics/opportunities`.
* Added deterministic opportunity typing, confidence labels, action text, limitations, evidence blocks, filters, and sorting.
* Added `tests/phase_20_3_market_opportunity_reports.test.js`.
* No LLMs, external services, persistence, or mutation were introduced.
* Verification is recorded in `docs/test_runs/phase_20_3_2026-04-25.json` and `handoff/phase_20_3/`.
