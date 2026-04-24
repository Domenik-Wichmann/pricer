# Phase 8 Implementation Contract

## Goal
Compute deterministic best-basket plans across one or more stores by reusing existing Phase 4 query results.

## Scope
- split a basket input into individual item queries
- reuse `queryEngine()` for each item
- compute bounded single-store and multi-store plans
- apply explicit deterministic preference weights
- cap candidate stores and store-combination counts
- expose a request handler for basket optimization

## Rules
- do not use LLMs
- keep the optimizer deterministic
- prefer existing Phase 4 ranked results over rebuilding a new matcher path
- keep runtime fast by bounding item candidates, store candidates, and store combinations

## Inputs
- `query`
- optional `locality_code`
- optional `city`
- optional `preferences.price_weight`
- optional `preferences.store_weight`
- optional `preferences.match_weight`
- optional `limits.max_item_candidates`
- optional `limits.max_store_candidates`
- optional `limits.max_store_combination_size`
- optional `limits.max_store_combinations`

## Output shape
- `raw_input`
- `item_queries`
- `preferences_applied`
- `limits_applied`
- `candidate_store_count`
- `candidate_stores`
- `single_store_plan`
- `multi_store_plan`
- `recommended_plan`
- `item_results`

## Optimization model
- single-store plans require one candidate from the same store for each matched item
- multi-store plans select the cheapest candidate inside each bounded store combination
- plan score is deterministic and combines:
  - total basket price
  - number of stores used
  - average match quality penalty
  - a large unmatched-item penalty
