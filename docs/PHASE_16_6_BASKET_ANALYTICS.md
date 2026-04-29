Implement Phase 16.6: Persistent Basket Analytics Layer.

GOAL:
Persist basket-quality metrics over time so the system can analyze trends, not just single runs.

This phase converts Phase 16.5 (ephemeral metrics) into:

* durable records
* aggregated insights
* trendable signals

CRITICAL RULES:

* DO NOT change optimization behavior
* DO NOT mutate canonical data
* DO NOT affect API outputs unless explicitly requested
* persistence must be append-only or safely upserted
* no external services

---

## CONTEXT

Already implemented:

* Phase 16.5: buildBasketQualityMetrics(...)
* Phase 16.5: buildGlobalBasketMetricsSummary(...)
* `/basket/optimize` supports include_metrics

Now we store those metrics.

---

## STEP 1 — STORAGE MODEL

Add a new store collection/table:

`basket_analytics_store`

Record shape:

```json
{
  "analytics_id": "ba_...",
  "timestamp": "...",

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

Keep structure aligned with Phase 16.5 metrics output.

---

## STEP 2 — WRITE PATH

In `/basket/optimize`:

If:

```json
{
  "optimizer_options": {
    "include_metrics": true,
    "persist_metrics": true
  }
}
```

Then:

* compute metrics (already implemented)
* write record to `basket_analytics_store`

IMPORTANT:

* write AFTER computing metrics
* do NOT block response if write fails
* wrap write in try/catch

---

## STEP 3 — AGGREGATION HELPERS

Add:

`getBasketAnalyticsSummary(...)`

Input:

```json
{
  "window": "last_24h" | "last_7d" | "all",
  "limit": 1000
}
```

Output:

```json
{
  "average_resolution_rate": 0.82,
  "average_price_coverage": 0.76,
  "average_savings": 3.10,
  "multi_store_usage_rate": 0.45,
  "convenience_flip_rate": 0.22,
  "sample_size": 500
}
```

---

## STEP 4 — NEW API ENDPOINT

Add:

`GET /analytics/basket-summary`

Behavior:

* returns aggregated summary
* optional query params:

  * `window`
  * `limit`

Keep simple and deterministic.

---

## STEP 5 — EDGE CASES

Handle:

* no data → return empty summary safely
* partial records → ignore invalid entries
* missing fields → skip in aggregation

---

## STEP 6 — TESTS

Add tests for:

1. metrics persisted when flag is true
2. metrics NOT persisted when flag omitted
3. aggregation returns correct averages
4. empty dataset handled safely
5. partial/bad records ignored
6. no mutation of optimizer result
7. persistence failure does not break API

---

## STEP 7 — DOCS

Update docs:

* analytics store schema
* persistence behavior
* aggregation definitions
* how to use for monitoring

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. storage schema added
6. API endpoint added
7. what remains for dashboards/alerts

SUCCESS CRITERIA:

* metrics persist safely
* aggregation works
* API returns summaries
* optimizer behavior unchanged
* no failures on missing data
* tests pass

---

## IMPLEMENTATION STATUS

Implemented on April 24, 2026.

Runtime additions:

* `basket_analytics_store` in the shared data backbone
* `buildBasketAnalyticsRecord(...)`
* `persistBasketAnalyticsRecord(...)`
* `getBasketAnalyticsSummary(...)`
* `summarizeBasketAnalyticsRecords(...)`
* `handleGetBasketAnalyticsSummaryRequest(...)`
* `GET /analytics/basket-summary`

Persistence behavior:

* Metrics persist only when both `optimizer_options.include_metrics = true` and `optimizer_options.persist_metrics = true`.
* Writes happen after metrics are computed.
* Write failures are caught and do not block `/basket/optimize`.
* Records are safely upserted by deterministic `analytics_id`.
* No canonical data, enrichment data, price records, basket plans, or optimizer results are mutated.

Aggregation behavior:

* `window` supports `last_24h`, `last_7d`, and `all`.
* `limit` is bounded to `1..1000`.
* Empty datasets return zero-valued summaries with `sample_size: 0`.
* Partial or malformed records are ignored.

Monitoring guidance:

* Low average resolution suggests resolver or enrichment coverage problems.
* Low price coverage or high missing rates suggest source price gaps.
* Falling average savings suggests multi-store value may be weak for recent baskets.
* High convenience flip rate suggests users often prefer convenience over raw savings.

Dashboards, alerting thresholds, and long-term reporting UX remain future work.
