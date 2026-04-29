readreImplement Phase 20.2: Optional Chain / Store Segmentation for Gap Intelligence.

GOAL:
Extend Phase 20 market-gap intelligence with optional chain/store segmentation.

This should allow the system to answer:

* Is this gap global?
* Is this gap local?
* Is this gap tied to a specific chain?
* Is this gap tied to a specific store/source?
* Which chains appear to cover or fail to cover a demand signal?

IMPORTANT DESIGN PRINCIPLE:
Granularity must be optional.

Default behavior should stay simple.
Chain/store segmentation should be available only when requested or when building explicit coverage summaries.

---

## CONTEXT

Already implemented:

* Phase 20.0 Market Gap Detection MVP
* Phase 20.1 Locality-Aware Gap Intelligence

Current capabilities:

* `gap_signal_store`
* `buildGapDetectionSummary(...)`
* `buildLocalityGapSummary(...)`
* `GET /analytics/gap-detection`
* `GET /analytics/gap-detection/localities`

Signals already include:

* query
* normalized_query
* status
* confidence
* category fields
* price_context
* source
* timestamp
* locality_code

Now add optional chain/store dimensions.

---

## CRITICAL RULES

* DO NOT break existing global gap detection behavior.
* DO NOT make chain/store required.
* DO NOT force all reports down to store granularity.
* DO NOT add LLMs.
* DO NOT call external services.
* DO NOT mutate canonical, enrichment, price, or user data.
* Keep deterministic and explainable.

---

## FEATURES TO IMPLEMENT

## 1. Extend gap signals with optional chain/store fields

Add nullable fields to signal normalization:

```json
{
  "chain_id": "kaufland",
  "chain_name": "Kaufland",
  "store_id": "burgas::kaufland_main",
  "store_name": "Kaufland Burgas"
}
```

Rules:

* fields may be null
* missing values must not block signal writes
* normalize strings consistently
* preserve backward compatibility for old records without these fields

Capture these fields where available from:

* product search context
* product/service result context
* shopping-list / basket pipeline context
* watchlist adds
* price lookup or source-product context if available

If exact store_id does not exist, derive only if repo already has a deterministic store-id convention. Otherwise leave null.

---

## 2. Extend filtering in gap summaries

Update existing summary helpers so filters may include:

```json
{
  "locality_code": "burgas",
  "chain_id": "kaufland",
  "store_id": "..."
}
```

Behavior:

* no filters = global behavior unchanged
* locality only = Phase 20.1 behavior unchanged
* locality + chain = filtered chain-locality view
* chain only = cross-locality chain view
* store only = store/source-specific view

---

## 3. Add chain/store grouping options

Allow `group_by` values:

Existing:

* `normalized_query`
* `category_l2`

Add:

* `chain_id`
* `store_id`
* `locality_code`

Only where meaningful.

Invalid group_by should return bounded validation error.

---

## 4. Add coverage-by-chain helper

Add:

`buildGapCoverageByChain(...)`

Purpose:
For a gap query/category, summarize which chains appear to cover that demand and which do not.

Input:

```json
{
  "normalized_query": "matcha latte",
  "locality_code": "burgas",
  "window": "last_30d"
}
```

Output:

```json
{
  "normalized_query": "matcha latte",
  "locality_code": "burgas",
  "chains": [
    {
      "chain_id": "kaufland",
      "chain_name": "Kaufland",
      "signal_count": 12,
      "resolved_count": 1,
      "ambiguous_count": 2,
      "unresolved_count": 9,
      "coverage_rate": 0.083,
      "gap_score": 8.4
    }
  ]
}
```

Definition:

* coverage_rate = resolved_count / signal_count
* unresolved-heavy chain = low coverage
* sort by lowest coverage then highest signal_count

If chain is unknown:

* include under `chain_id: null` only if useful
* or document that unknown chain signals are excluded from coverage-by-chain

---

## 5. API changes

Extend:

`GET /analytics/gap-detection`

Additional query params:

* `chain_id`
* `store_id`

Extend or add:

`GET /analytics/gap-detection/localities`

Optional:

* `chain_id`
* `store_id`

Add new endpoint:

`GET /analytics/gap-detection/coverage-by-chain`

Query params:

* `normalized_query` required unless category filter is provided
* `locality_code` optional
* `window` optional
* `limit` optional

Return `buildGapCoverageByChain(...)`.

---

## 6. Output shape clarity

Existing summary outputs should include:

```json
{
  "filters": {
    "locality_code": "...",
    "chain_id": "...",
    "store_id": "..."
  }
}
```

Do not silently hide active filters.

---

## 7. Tests

Add tests for:

1. old signals without chain/store still work
2. new signals store chain/store when present
3. chain_id filtering works
4. store_id filtering works
5. locality + chain filtering works
6. group_by chain_id works
7. group_by store_id works
8. coverage_by_chain computes coverage_rate correctly
9. coverage_by_chain sorts low coverage first
10. unknown chain/store handled safely
11. existing Phase 20.0/20.1 behavior unchanged
12. deterministic output / no mutation

---

## 8. Docs

Update docs with:

* optional segmentation model
* field definitions
* filtering behavior
* group_by behavior
* coverage_by_chain interpretation
* warning that chain/store segmentation is optional and should not be the default UX
* future merchant-facing use cases

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. signal schema changes
6. API changes
7. coverage-by-chain behavior
8. what remains for opportunity reports / merchant-facing dashboards

SUCCESS CRITERIA:

* default gap detection remains unchanged
* chain/store fields are optional
* filters work
* grouping works
* coverage-by-chain works
* old records remain compatible
* tests pass
