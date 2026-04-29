Implement Phase 16.5: Basket Quality + Monitoring Layer.

GOAL:
Add a deterministic, read-only monitoring/metrics layer that measures how well the basket pipeline performs.

This phase should NOT change any behavior.
It only observes, aggregates, and reports.

---

## CONTEXT

Pipeline already implemented:

shopping list
→ resolver (15.3)
→ basket planner (15.4)
→ price lookup (16.0)
→ optimizer (16.1 / 16.2)
→ explanation (16.3)
→ convenience scoring (16.4)

Now we need visibility into:

* quality
* coverage
* usefulness

---

## FEATURES TO IMPLEMENT

## 1. Basket quality analyzer

Add:

`buildBasketQualityMetrics(...)`

Input:

```json
{
  "resolver_output": {...},
  "basket_plan": {...},
  "price_lookup": {...},
  "optimizer_result": {...},
  "convenience_result": {...}
}
```

Output:

```json
{
  "resolver": {
    "total_items": 5,
    "resolved_count": 4,
    "ambiguous_count": 1,
    "unresolved_count": 0,
    "resolution_rate": 0.8
  },
  "pricing": {
    "priced_item_count": 4,
    "missing_item_count": 1,
    "stale_item_count": 0,
    "price_coverage_rate": 0.8
  },
  "optimization": {
    "single_store_total": 42.30,
    "multi_store_total": 37.80,
    "savings": 4.50,
    "savings_rate": 0.106
  },
  "convenience": {
    "recommended_before": "multi_store",
    "recommended_after": "single_store",
    "flip": true,
    "effective_total": 40.30
  }
}
```

---

## 2. Metrics to compute

### Resolver

* resolution_rate
* ambiguity_rate
* unresolved_rate

### Pricing

* price_coverage_rate
* missing_rate
* stale_rate

### Optimization

* savings (multi vs single)
* savings_rate

### Convenience

* recommendation_flip (boolean)
* effective vs actual delta

---

## 3. API integration

Extend `POST /basket/optimize`:

Add:

```json
{
  "optimizer_options": {
    "include_metrics": true
  }
}
```

If enabled:

```json
{
  "optimizer_result": {...},
  "explanation": {...},
  "convenience": {...},
  "metrics": {...}
}
```

If omitted → no change to existing response.

---

## 4. Aggregated analytics helper

Add:

`buildGlobalBasketMetricsSummary(...)`

Purpose:

* aggregate across multiple runs (if input provided)
* or return last-run metrics

Return:

```json
{
  "average_resolution_rate": 0.82,
  "average_price_coverage": 0.76,
  "average_savings": 3.10,
  "multi_store_usage_rate": 0.45,
  "convenience_flip_rate": 0.22
}
```

Keep simple. No persistence required yet.

---

## 5. Determinism

* No randomness
* No external calls
* No mutation
* No persistence
* Pure functions

---

## 6. Tests

Add tests for:

1. correct resolution rate calculation
2. correct price coverage calculation
3. savings and savings_rate
4. convenience flip detection
5. include_metrics flag behavior
6. metrics do not affect optimizer output
7. no mutation of inputs
8. edge cases:

   * all unresolved
   * all missing prices
   * no multi-store option

---

## 7. Docs

Update docs with:

* metrics definitions
* interpretation guidance
* how to use for monitoring
* what thresholds indicate problems

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. metrics helper added
6. API changes
7. what remains for persistent analytics/dashboard layer

SUCCESS CRITERIA:

* metrics computed correctly
* metrics are optional
* no behavior change
* clean API integration
* tests pass

---

## IMPLEMENTATION STATUS

Implemented on April 24, 2026.

Runtime additions:

* `buildBasketQualityMetrics(...)`
* `buildGlobalBasketMetricsSummary(...)`
* optional `optimizer_options.include_metrics = true` support on `POST /basket/optimize`

Safety notes:

* Metrics are read-only and deterministic.
* No canonical, enrichment, price, basket-plan, optimizer, convenience, or API input objects are mutated.
* No metrics are persisted.
* No randomness or external calls are used.
* Existing `/basket/optimize` response shape is unchanged when `include_metrics` is omitted or false.

Metric interpretation:

* Low `resolver.resolution_rate` or high `ambiguity_rate` means canonical search and enrichment need review.
* Low `pricing.price_coverage_rate` or high `missing_rate` means current source price coverage is weak for the requested basket.
* High `pricing.stale_rate` means snapshot freshness or stale-policy behavior should be inspected.
* Positive `optimization.savings` and `savings_rate` show how much multi-store optimization can save before convenience scoring.
* `convenience.recommendation_flip = true` means user-context penalties changed the recommendation after the pure optimizer result.

Persistent analytics, dashboards, thresholds, alerts, and long-term trend storage remain out of scope for Phase 16.5.
