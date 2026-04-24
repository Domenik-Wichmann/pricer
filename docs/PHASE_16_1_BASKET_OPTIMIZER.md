# Phase 16.1 Single-Store Basket Optimizer

## Implemented surface
- service: `optimizeBasketSingleStore(...)`
- handler: `handleOptimizeBasketSingleStoreRequest(...)`
- route: `POST /basket/optimize`
- currency correction: Phase 16 price lookup and optimizer outputs use `EUR`

## Implemented contract summary
- evaluates single-chain basket options only; multi-store optimization remains out of scope
- ranks by lowest `score_total`, highest coverage, lowest `actual_total`, then deterministic chain/store id
- keeps `actual_total` limited to real known prices and uses `missing_item_penalty` only inside `score_total`
- excludes stale records by default and emits explicit missing or stale-excluded warnings
- supports `cheapest_candidate` for ambiguous carried candidates and `require_confirmation` blocking
- does not mutate basket plans, canonical products, price records, or price lookup inputs

## Remaining for Phase 16.2
- multi-store basket splitting
- store-distance or locality-aware optimization
- richer user preference weighting
- confirmation flows for ambiguous selections

---

Implement Phase 16.1: Single-Store Basket Optimizer, with the Phase 16.0 currency correction included.

GOAL:
Build the first real basket optimizer.

It should consume:

* Phase 15.4 basket plan output
* Phase 16.0 price lookup output

And return:

* best single-store / single-chain basket option
* alternatives
* missing/stale item warnings
* explainable scoring

This phase should NOT implement multi-store optimization yet.

---

## IMPORTANT CURRENCY CORRECTION

Before or during implementation, audit and correct currency handling.

Assumption:

* Source price values in the repo represent **EUR**, not BGN.

Tasks:

1. Search for `BGN` in:

   * Phase 16.0 price lookup code
   * basket planner / optimizer docs
   * API examples
   * tests
2. Replace price lookup / basket API default currency with:

   * `EUR`
3. Do not implement currency conversion.
4. Do not call exchange-rate APIs.
5. Treat source prices as already EUR.
6. Update tests/docs/examples accordingly.

Expected API output should use:

```json
{
  "currency": "EUR"
}
```

---

## CONTEXT

Already implemented:

* Phase 15.3: shopping-list resolver
* Phase 15.4: basket input planner
* Phase 16.0: price lookup layer

Available endpoints/services:

* `POST /basket/plan`
* `POST /prices/lookup`
* `lookupCanonicalProductPrices(...)`
* `lookupPricesForBasketPlan(...)`

Phase 16.1 should build on those contracts.

DO NOT:

* mutate canonical products
* mutate price records
* persist user baskets
* implement multi-store optimization
* invent missing prices
* use BGN
* perform currency conversion
* call external services

---

## FEATURES TO IMPLEMENT

## 1. Single-store optimizer service

Add a service such as:

`optimizeBasketSingleStore(...)`

Input shape:

```json
{
  "basket_plan": { ... },
  "price_lookup": { ... },
  "options": {
    "missing_item_penalty": 999,
    "allow_stale": false,
    "stale_policy": "exclude",
    "ambiguous_policy": "cheapest_candidate"
  }
}
```

Important:

* `missing_item_penalty` is an internal scoring value only.
* It must NOT be shown as a real price.
* User-facing totals must only include actual known prices.

---

## 2. What “penalty” means

Use penalty only for ranking.

Example:

* Chain A has 8/10 items for €30
* Chain B has 10/10 items for €38

Without a penalty, Chain A looks cheapest.
With an internal penalty, Chain B can rank higher because it is complete.

Output must clearly separate:

* `actual_total`
* `score_total`

Example:

```json
{
  "actual_total": 38.00,
  "score_total": 38.00,
  "currency": "EUR"
}
```

For incomplete baskets:

```json
{
  "actual_total": 30.00,
  "score_total": 1029.00,
  "currency": "EUR",
  "missing_item_count": 1
}
```

Never label `score_total` as user-facing cost.

---

## 3. Build chain/store options

For each chain/store:

* collect all available non-stale prices for basket items
* choose cheapest price for each item within that chain/store
* compute:

  * actual_total
  * score_total
  * priced_item_count
  * missing_item_count
  * stale_item_count
  * coverage_ratio
  * warnings

First version may optimize by `chain_id` rather than physical store if store-level data is incomplete.

If store-level data is available, preserve it in records but do not overcomplicate.

---

## 4. Ambiguous candidates

From basket plan:

* ready items are direct
* ambiguous carried candidates may have multiple candidate canonical ids

Implement first-pass policy:

### `cheapest_candidate`

For each chain/store:

* evaluate carried candidates
* choose the cheapest priced candidate for that chain/store
* include warning that ambiguous candidate was auto-selected by price

### `require_confirmation`

* do not optimize ambiguous items
* set `requires_user_confirmation = true`

Do not mutate the original basket plan.

---

## 5. Missing and stale handling

Options:

* `allow_stale: false` by default
* stale prices do not count as priced
* missing prices create warnings
* missing items increase score via penalty
* unresolved blocking items from basket plan should prevent optimization if planner says not ready

Stale/missing should be explicit in output.

---

## 6. Output shape

Return:

```json
{
  "optimization_type": "single_store",
  "currency": "EUR",
  "optimization_ready": true,
  "requires_user_confirmation": false,

  "best_option": {
    "chain_id": "kaufland",
    "chain_name": "Kaufland",
    "store_id": null,
    "store_name": null,
    "actual_total": 42.30,
    "score_total": 42.30,
    "currency": "EUR",
    "coverage_ratio": 1.0,
    "priced_item_count": 5,
    "missing_item_count": 0,
    "stale_item_count": 0,
    "items": [],
    "warnings": []
  },

  "alternatives": [],
  "summary": {
    "planned_item_count": 5,
    "candidate_chain_count": 3,
    "complete_option_count": 1,
    "incomplete_option_count": 2
  },

  "warnings": []
}
```

---

## 7. API endpoint

Add:

`POST /basket/optimize`

Request options:

```json
{
  "items": ["milk", "10 eggs"],
  "layer_mode": "canonical_with_enrichment",
  "planner_options": {},
  "price_options": {
    "max_age_days": 14
  },
  "optimizer_options": {
    "missing_item_penalty": 999,
    "allow_stale": false,
    "ambiguous_policy": "cheapest_candidate"
  }
}
```

Flow:

1. Build basket plan using existing planner
2. Run price lookup for basket plan
3. Optimize single-store basket
4. Return basket plan, price lookup summary, and optimizer result

Keep this endpoint bounded and deterministic.

---

## 8. Ranking policy

Choose best option by:

1. lowest `score_total`
2. highest `coverage_ratio`
3. lowest `actual_total`
4. deterministic chain/store id tie-breaker

Document this clearly.

---

## 9. Tests

Add tests for:

1. complete single-store basket wins
2. incomplete cheaper basket loses due to penalty
3. actual_total excludes penalty
4. score_total includes penalty
5. missing prices are explicit
6. stale prices excluded by default
7. ambiguous cheapest candidate policy works
8. require_confirmation policy blocks ambiguous optimization
9. output currency is EUR
10. no mutation of basket plan or price lookup
11. `/basket/optimize` endpoint validates bad input
12. deterministic tie-breaking

Also update Phase 16.0 tests/docs if they currently expect BGN.

---

## 10. Docs / handoff

Update docs with:

* currency assumption: source prices are EUR
* single-store optimizer contract
* actual_total vs score_total distinction
* missing-item penalty explanation
* stale/missing handling
* what remains for multi-store optimizer

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. currency correction summary
4. commands run
5. test results
6. service + endpoint added
7. ranking/scoring policy
8. what remains for Phase 16.2 multi-store optimization

SUCCESS CRITERIA:

* price lookup and optimizer outputs use EUR
* single-store basket optimization works
* missing/stale behavior is explicit
* penalty is internal and never confused with real price
* no mutation of canonical, enrichment, price, or basket-plan state
* tests pass
