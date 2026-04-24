# Phase 15.4 Basket Input Planner

## Goal
Transform smart shopping-list resolution output into a structured, optimization-ready basket input format without performing price optimization yet.

## Implemented surface
- service: `buildBasketPlanFromResolvedItems(...)`
- handler: `handleBuildBasketPlanRequest(...)`
- route: `POST /basket/plan`

## Request flow
The HTTP route accepts raw shopping-list items plus planner options:

```json
{
  "items": ["milk", "10 eggs"],
  "layer_mode": "canonical_with_enrichment",
  "planner_options": {
    "ambiguous_policy": "carry_top_n",
    "ambiguous_top_n": 3,
    "unresolved_policy": "exclude"
  }
}
```

Route flow:
1. resolve shopping-list items internally through Phase 15.3
2. classify resolved output into ready, ambiguous, and unresolved planning buckets
3. return a deterministic basket-planning payload

## Output contract
Planner output includes:
- `optimization_ready`
- `requires_user_confirmation`
- `ready_items`
- `ambiguous_items`
- `unresolved_items`
- `summary`

Ready items preserve:
- `canonical_product_id`
- `canonical_name`
- `quantity`
- `requested_quantity`
- `requested_markers`
- `markers`
- `enrichment`

## Policy handling
### Ambiguous policy
- `carry_top_n`
  - carries top N candidates
  - keeps `optimization_ready=true`
  - sets `requires_user_confirmation=true`
- `force_best`
  - converts the best candidate into a ready item
  - does not keep the item in `ambiguous_items`
- `require_confirmation`
  - keeps the item in `ambiguous_items`
  - sets `optimization_ready=false`
  - sets `requires_user_confirmation=true`

### Unresolved policy
- `exclude`
  - keeps unresolved entries in `unresolved_items`
  - does not block planning
- `placeholder`
  - creates manual ready-item placeholders
  - does not keep those items in `unresolved_items`
- `block`
  - keeps unresolved entries in `unresolved_items`
  - sets `optimization_ready=false`

## Quantity and marker handling
- default `requested_quantity` is `1`
- simple `xN` quantity patterns are preserved as requested quantity
- simple volume markers such as `1L` are preserved into `requested_markers.volume_marker`
- simple count markers such as `10 eggs` or `10 rolls` are preserved into `requested_markers.count_marker`
- no pricing-unit normalization happens in this phase

## Safety boundaries
- deterministic only
- no LLM usage
- no persistence
- no canonical mutation
- no enrichment mutation
- no optimizer logic

## Acceptance status
- resolver output can now be transformed into an optimization-ready planning contract
- readiness and confirmation flags are explicit
- ambiguity and unresolved handling are policy-driven and deterministic
