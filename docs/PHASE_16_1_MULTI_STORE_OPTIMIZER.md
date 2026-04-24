# Phase 16.2 Multi-Store Basket Optimizer

## Implemented surface
- service: `optimizeBasketMultiStore(...)`
- endpoint integration: `POST /basket/optimize` with `optimizer_options.strategy = "multi_store"`
- default behavior remains single-store when strategy is omitted

## Implemented contract summary
- compares the existing best single-store option against bounded 2-store and optional 3-store split combinations
- calculates `savings_vs_best_single_store` from actual totals only
- recommends multi-store only when coverage is at least as good, savings meet `minimum_savings`, and score is no worse
- preserves EUR currency, stale exclusion, ambiguous candidate handling, and penalty-as-score-only behavior
- does not include travel distance, time, fuel, delivery fees, or locality-aware cost yet

## Remaining for locality-aware optimization
- distance/travel-time modeling
- user locality and store availability constraints
- trip-cost weighting
- maximum detour or preferred-chain settings

---

Implement Phase 16.2: Multi-Store Basket Optimizer.

GOAL:
Extend the basket optimizer so it can compare the existing best single-chain basket against a bounded multi-store split.

Primary question:
“Can the user save more by buying this basket across multiple chains/stores?”

CONTEXT:
Already implemented:

* Phase 15.3: shopping-list resolver
* Phase 15.4: basket input planner
* Phase 16.0: price lookup layer
* Phase 16.1: single-store basket optimizer
* `POST /basket/optimize`

Phase 16.1 already provides:

* `optimizeBasketSingleStore(...)`
* `actual_total`
* `score_total`
* missing/stale warnings
* deterministic ranking
* currency = `EUR`

DO NOT:

* mutate canonical products
* mutate enrichment
* mutate price records
* persist user baskets
* call external APIs
* add travel distance/time logic yet
* implement unlimited combinatorial optimization
* change Phase 16.1 single-store behavior except for integration if needed

---

## FEATURES TO IMPLEMENT

## 1. Multi-store optimizer service

Add a service such as:

`optimizeBasketMultiStore(...)`

Input:

```json
{
  "basket_plan": { ... },
  "price_lookup": { ... },
  "single_store_result": { ... },
  "options": {
    "max_stores": 2,
    "allow_stale": false,
    "ambiguous_policy": "cheapest_candidate",
    "minimum_savings": 0.50
  }
}
```

First version:

* support `max_stores = 2`
* optionally allow `max_stores = 3` only if simple and bounded
* default to 2

---

## 2. Core algorithm

For each basket item:

* collect valid non-stale price records
* group by chain/store candidate
* choose cheapest valid record per chain/store for that item

Then evaluate store combinations:

* all 1-store combinations are already covered by single-store optimizer
* evaluate all 2-store combinations
* for each item, choose cheapest available price among the stores in that combination
* compute:

  * actual_total
  * score_total
  * coverage_ratio
  * priced_item_count
  * missing_item_count
  * stale_item_count
  * items by store

Use missing-item penalty in `score_total` only, same principle as Phase 16.1.
Never show penalty as real user cost.

---

## 3. Compare against single-store result

Return both:

* `best_single_store_option`
* `best_multi_store_option`

Compute:

```text
savings_vs_best_single_store = single_store.actual_total - multi_store.actual_total
```

Only recommend multi-store split if:

* coverage is at least as good as single-store coverage
* actual savings >= `minimum_savings`
* score_total is better or equal after penalties

If savings are tiny, return the split as an alternative but do not mark it recommended.

---

## 4. Output shape

Return:

```json
{
  "optimization_type": "multi_store",
  "currency": "EUR",
  "recommended_strategy": "single_store" | "multi_store",

  "best_single_store_option": { ... },

  "best_multi_store_option": {
    "store_count": 2,
    "actual_total": 37.80,
    "score_total": 37.80,
    "currency": "EUR",
    "coverage_ratio": 1.0,
    "priced_item_count": 5,
    "missing_item_count": 0,
    "stale_item_count": 0,
    "savings_vs_best_single_store": 4.50,
    "stores": [
      {
        "chain_id": "lidl",
        "chain_name": "Lidl",
        "store_id": null,
        "store_name": null,
        "actual_total": 15.20,
        "items": []
      },
      {
        "chain_id": "kaufland",
        "chain_name": "Kaufland",
        "store_id": null,
        "store_name": null,
        "actual_total": 22.60,
        "items": []
      }
    ],
    "warnings": []
  },

  "alternatives": [],
  "summary": {
    "candidate_store_count": 4,
    "evaluated_combination_count": 6,
    "complete_multi_store_option_count": 2
  },

  "warnings": []
}
```

---

## 5. API integration

Extend `POST /basket/optimize`.

Add option:

```json
{
  "optimizer_options": {
    "strategy": "single_store" | "multi_store",
    "max_stores": 2,
    "minimum_savings": 0.50
  }
}
```

Behavior:

* if strategy omitted, keep current single-store behavior or document default
* if strategy = `multi_store`, run:

  1. basket planner
  2. price lookup
  3. single-store optimizer
  4. multi-store optimizer
  5. return combined result

Do not break existing Phase 16.1 response contract for default single-store calls.

---

## 6. Ambiguous candidates

Reuse Phase 16.1 ambiguous policy.

For `cheapest_candidate`:

* for each store combination, evaluate carried candidates by cheapest valid available price within that combination
* include warning if an ambiguous candidate was auto-selected

For `require_confirmation`:

* preserve behavior that blocks or requires confirmation

---

## 7. Deterministic ranking

Choose best multi-store option by:

1. lowest `score_total`
2. highest `coverage_ratio`
3. lowest `actual_total`
4. fewer stores
5. deterministic chain/store id tie-breaker

Recommended strategy:

* multi-store only if it meaningfully beats single-store according to policy
* otherwise recommend single-store

---

## 8. Tests

Add tests for:

1. two-store split beats single-store and is recommended
2. tiny savings below threshold does not recommend multi-store
3. multi-store with worse coverage does not beat single-store
4. missing-item penalty affects score_total, not actual_total
5. max_stores = 2 bounds combinations
6. deterministic tie-breaking
7. ambiguous cheapest candidate works across store combinations
8. stale prices excluded by default
9. `POST /basket/optimize` remains backward-compatible for single-store default
10. multi-store endpoint option returns combined result
11. output currency remains EUR
12. no mutation of basket plan or price lookup

---

## 9. Docs / handoff

Update docs with:

* multi-store optimizer contract
* strategy option
* recommendation policy
* savings calculation
* max-store limitation
* why travel/time cost is not included yet
* remaining work for locality-aware optimization

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. service/API changes
6. recommendation policy
7. what remains for locality-aware / travel-aware basket optimization

SUCCESS CRITERIA:

* multi-store optimization works for max_stores=2
* single-store default remains stable
* EUR currency preserved
* savings vs single-store calculated clearly
* missing/stale behavior remains explicit
* no mutation of canonical, enrichment, price, or basket-plan state
* tests pass
