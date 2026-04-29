# Phase 16.4 Locality / Convenience-Aware Basket Scoring

## Implemented surface
- helper: `applyBasketConvenienceScoring(...)`
- endpoint option: `optimizer_options.include_convenience_scoring = true`
- request support: `user_context` and `convenience_options`
- explanation integration when both `include_explanation` and `include_convenience_scoring` are true

## Implemented contract summary
- preserves `actual_total` as pure product price
- adds convenience-only fields: `convenience_penalty`, `estimated_travel_cost`, `effective_total`, `convenience_score`, `penalty_breakdown`
- preserves original recommendation and adds before/after convenience recommendation fields
- keeps convenience scoring optional and does not change old response shape when omitted
- does not model real distance/time yet; explanation adds `distance_not_modeled`

## Remaining for true travel/distance-aware optimization
- store geocoding and user distance calculation
- fuel, transit, walking, delivery, or pickup costs
- locality-aware store availability
- time cost and route planning

---

Implement Phase 16.4: Locality / Convenience-Aware Basket Scoring.

GOAL:
Extend basket optimization with an optional user-context scoring layer that accounts for locality, store preference, and trip convenience — without changing product prices.

This phase should answer:
“Is the cheaper basket actually worth it once convenience/travel is considered?”

CONTEXT:
Already implemented:

* Phase 15.3 shopping-list resolver
* Phase 15.4 basket input planner
* Phase 16.0 price lookup
* Phase 16.1 single-store optimizer
* Phase 16.2 multi-store optimizer
* Phase 16.3 explanation layer
* `POST /basket/optimize`

CRITICAL RULE:
Do NOT change `actual_total`.

Product price totals must remain pure known item prices.

Convenience/travel should be separate fields:

* `convenience_penalty`
* `estimated_travel_cost`
* `effective_total`
* `convenience_score`

---

## FEATURES TO IMPLEMENT

## 1. Convenience scoring helper

Add a pure helper such as:

`applyBasketConvenienceScoring(...)`

Input:

```json
{
  "optimizer_result": { ... },
  "user_context": {
    "locality_code": "burgas",
    "preferred_chain_ids": ["kaufland"],
    "avoid_chain_ids": [],
    "max_store_count": 2,
    "single_store_preferred": false
  },
  "convenience_options": {
    "extra_store_penalty": 1.50,
    "non_preferred_chain_penalty": 0.75,
    "avoided_chain_penalty": 999,
    "missing_locality_penalty": 0.50
  }
}
```

Output:

```json
{
  "optimizer_result": { ... },
  "convenience": {
    "currency": "EUR",
    "applied": true,
    "recommended_strategy_before": "multi_store",
    "recommended_strategy_after": "single_store",
    "best_effective_option": { ... },
    "option_scores": []
  }
}
```

---

## 2. Effective total

For every basket option:

```text
effective_total = actual_total + convenience_penalty + estimated_travel_cost
```

For this phase:

* do not calculate real distance
* use configured penalties only
* set `estimated_travel_cost = 0` unless data exists already

Important:

* `actual_total` remains unchanged
* `effective_total` is ranking-only / user-context-adjusted

---

## 3. Penalty components

Track separate components:

```json
{
  "actual_total": 37.80,
  "convenience_penalty": 2.25,
  "estimated_travel_cost": 0,
  "effective_total": 40.05,
  "penalty_breakdown": [
    {
      "type": "extra_store",
      "amount": 1.50,
      "message": "Multi-store trip adds convenience cost."
    }
  ]
}
```

Supported penalty types:

* `extra_store`
* `non_preferred_chain`
* `avoided_chain`
* `missing_locality`
* `user_max_store_count_exceeded`

---

## 4. Store-count preference

If `user_context.max_store_count` is set:

* options exceeding it should receive penalty or be marked not recommended
* do not delete them
* keep them as alternatives

If `single_store_preferred=true`:

* multi-store options get extra penalty
* but can still win if savings are large enough

---

## 5. Preferred / avoided chains

Preferred chains:

* reduce or avoid non-preferred penalty

Avoided chains:

* apply large penalty
* keep option visible with warning

Do not silently remove avoided chains unless explicitly configured later.

---

## 6. Recommendation adjustment

Existing optimizer has `recommended_strategy`.

This phase may produce:

* `recommended_strategy_after_convenience`

Do not overwrite original recommendation without preserving it.

Return both:

* before convenience
* after convenience

---

## 7. Explanation integration

Extend Phase 16.3 explanation layer.

If convenience scoring was applied, explanation should include:

* “Product total”
* “Convenience-adjusted total”
* why recommendation changed, if it changed
* limitation that real travel distance is not modeled yet

Add limitation type:

* `distance_not_modeled`

---

## 8. API integration

Extend `POST /basket/optimize`.

Add optional request fields:

```json
{
  "user_context": {
    "locality_code": "burgas",
    "preferred_chain_ids": ["kaufland"],
    "avoid_chain_ids": [],
    "max_store_count": 1,
    "single_store_preferred": true
  },
  "convenience_options": {
    "extra_store_penalty": 1.50,
    "non_preferred_chain_penalty": 0.75
  },
  "optimizer_options": {
    "strategy": "multi_store",
    "include_explanation": true,
    "include_convenience_scoring": true
  }
}
```

Behavior:

* if `include_convenience_scoring` is absent/false, preserve current response shape
* if true, include `convenience`
* if explanation is also requested, include convenience-aware explanation details

---

## 9. Tests

Add tests for:

1. actual_total remains unchanged
2. effective_total includes convenience penalty
3. multi-store recommendation flips to single-store when savings are too small
4. multi-store still wins when savings exceed convenience penalty
5. preferred chain reduces penalty / avoids non-preferred penalty
6. avoided chain receives large penalty but remains visible
7. max_store_count affects recommendation
8. include_convenience_scoring omitted preserves previous response shape
9. explanation includes convenience-adjusted total when enabled
10. currency remains EUR
11. no canonical/enrichment/price mutation

---

## 10. Docs / handoff

Update docs with:

* actual_total vs effective_total
* convenience_penalty definition
* supported user_context fields
* supported convenience_options
* limitation: no real distance/time modeling yet
* future work: geocoding, store locations, fuel/time, delivery/pickup

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. convenience scoring fields added
6. API behavior changes
7. explanation changes
8. what remains for true travel/distance-aware optimization

SUCCESS CRITERIA:

* convenience scoring is optional
* old optimizer behavior remains compatible
* actual_total stays pure product price
* effective_total includes convenience penalties
* recommendation can change based on user context
* explanation reflects convenience when requested
* tests pass
