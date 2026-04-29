Implement Phase 16.7: Basket Health Alerts + System Diagnostics.

GOAL:
Add an internal-only health/alert layer on top of Phase 16.6 analytics.

This is **NOT user-facing**.
It is for:

* system monitoring
* debugging
* quality control

DO NOT expose this to normal product APIs.

---

## CONTEXT

Already implemented:

* Phase 16.5: metrics computation
* Phase 16.6: metrics persistence + aggregation
* `GET /analytics/basket-summary`

Now we detect problems.

---

## CRITICAL RULES

* NO impact on user-facing APIs
* NO changes to basket optimization
* NO mutation of analytics data
* PURE analysis layer only

---

## FEATURES TO IMPLEMENT

## 1. Health alert builder

Add:

`buildBasketHealthAlerts(summary)`

Input:

* output of `getBasketAnalyticsSummary(...)`

Output:

```json
{
  "status": "healthy" | "warning" | "critical",
  "alerts": [
    {
      "type": "low_price_coverage",
      "severity": "warning",
      "value": 0.62,
      "threshold": 0.7,
      "message": "Average price coverage is below 70%."
    }
  ]
}
```

---

## 2. Alert rules (first version)

Implement deterministic rules:

### Resolver

* resolution_rate < 0.7 → warning
* resolution_rate < 0.5 → critical

### Pricing

* price_coverage_rate < 0.7 → warning
* price_coverage_rate < 0.5 → critical
* stale_rate > 0.3 → warning

### Optimization

* average_savings < 1.0 → warning
* average_savings_rate < 0.05 → warning

### Convenience

* convenience_flip_rate > 0.4 → warning
* convenience_flip_rate > 0.6 → critical

### Data health

* sample_size < 20 → info-level warning (low confidence)

---

## 3. Overall status

Compute:

```text
critical if any critical alerts
warning if any warning alerts
healthy otherwise
```

---

## 4. API endpoint

Add:

`GET /analytics/basket-health`

Response:

```json
{
  "status": "warning",
  "alerts": [...],
  "summary": {...}
}
```

Behavior:

* calls summary
* builds alerts
* returns combined object

---

## 5. Optional filtering

Support:

* `window` (last_24h, last_7d, all)

---

## 6. Tests

Add tests for:

1. low resolution triggers warning
2. low price coverage triggers warning
3. high stale rate triggers warning
4. low savings triggers warning
5. high convenience flip triggers warning
6. multiple alerts combine correctly
7. critical overrides warning
8. empty dataset returns safe output
9. no mutation

---

## 7. Docs

Document:

* alert types
* thresholds
* interpretation guidance
* note: internal-only system diagnostics

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. alert system implemented
6. API endpoint added
7. what remains for dashboard/visualization layer

SUCCESS CRITERIA:

* health alerts computed deterministically
* no changes to optimization behavior
* clean API for system diagnostics
* thresholds easy to tune later
* tests pass

---

## IMPLEMENTATION STATUS

Implemented on April 24, 2026.

Runtime additions:

* `buildBasketHealthAlerts(summary)`
* `handleGetBasketHealthRequest(...)`
* `GET /analytics/basket-health`

Internal-only diagnostic note:

* This endpoint is for system monitoring, debugging, and quality control.
* It is not intended for normal user-facing product flows.
* It does not change optimizer behavior, analytics records, canonical data, prices, basket plans, or persisted metrics.

Alert types and thresholds:

* `low_resolution_rate`: warning below `0.7`, critical below `0.5`
* `low_price_coverage`: warning below `0.7`, critical below `0.5`
* `high_stale_rate`: warning above `0.3`
* `low_average_savings`: warning below `EUR 1.0`
* `low_average_savings_rate`: warning below `0.05`
* `high_convenience_flip_rate`: warning above `0.4`, critical above `0.6`
* `low_sample_size`: info below `20`

Overall status:

* `critical` when any critical alert exists
* `warning` when any warning alert exists and no critical alert exists
* `healthy` otherwise

Interpretation guidance:

* Resolver alerts point to canonical search, enrichment, or item-normalization issues.
* Pricing alerts point to missing, stale, or weak source-price coverage.
* Savings alerts suggest multi-store optimization is producing little practical value for recent baskets.
* Convenience flip alerts suggest user-context penalties are often overriding raw savings.
* Low sample size means the health signal should be treated as low confidence.
