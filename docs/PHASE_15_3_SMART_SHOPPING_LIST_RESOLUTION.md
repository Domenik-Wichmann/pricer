# Phase 15.3 Smart Shopping List Resolution

## Goal
Resolve messy user-entered shopping-list items into ranked canonical product candidates through the existing product-service layer, without mutating canonical truth, applied-view policy state, or additive enrichment data.

## Implemented surface
- service: `resolveShoppingListItems(...)`
- handler: `handleResolveShoppingListItemsRequest(...)`
- route: `POST /shopping-list/resolve`

## Default layer behavior
- default layer mode: `canonical_with_enrichment`
- supported layer modes:
  - `canonical_truth`
  - `canonical_with_applied_view`
  - `canonical_with_enrichment`
  - `canonical_with_applied_view_and_enrichment`

Applied-view behavior stays opt-in only.

## Request contract
The route accepts:

```json
{
  "items": [
    "milk",
    { "text": "10 eggs" },
    "toilet paper"
  ],
  "layer_mode": "canonical_with_enrichment",
  "limit_per_item": 5
}
```

Validation rules:
- `items` must be a non-empty array
- max items per request: `100`
- max `limit_per_item`: `10`
- invalid `layer_mode` is rejected with a bounded `400`

## Response contract
Each item returns:
- `input_text`
- `normalized_query`
- `status`
- `confidence`
- `best_match`
- `candidates`

Allowed statuses:
- `resolved`
- `ambiguous`
- `unresolved`

Allowed confidence values:
- `high`
- `medium`
- `low`
- `none`

Each ranked candidate includes:
- `canonical_product_id`
- `canonical_name`
- `markers`
- `enrichment`
- `score`
- `match_reasons`

## Deterministic ranking policy
Ranking uses bounded deterministic signals:
- token overlap against canonical name and enrichment fields
- exact or phrase-style name match
- inferred base-product hint match
- inferred category hint match
- brand-token match
- exact volume-marker match when parsed from the list item
- exact count-marker match when parsed from the list item
- small enrichment-confidence bonus

Typical reasons include:
- `token_match`
- `exact_name_match`
- `phrase_match`
- `base_product_match`
- `category_match`
- `brand_match`
- `volume_match`
- `count_match`
- `enrichment_confident`

## Resolution policy
Centralized score thresholds:
- `high`: `>= 0.85`
- `medium`: `>= 0.65`
- `low`: `>= 0.45`
- `none`: `< 0.45`

Item status policy:
- `resolved` when best score is `>= 0.75` and there is only one strong candidate or the best candidate beats the next by at least `0.15`
- `ambiguous` when multiple viable candidates are close
- `unresolved` when no candidate reaches the minimum viable score

## Safety boundaries
- canonical products remain immutable
- canonical mappings remain immutable
- additive enrichment cache remains immutable
- enrichment logic and canonical grouping behavior are unchanged
- this phase is read/resolve only and does not save shopping lists

## Acceptance status
- shopping-list items resolve into ranked canonical candidates
- statuses and confidence labels are explicit
- default layer remains `canonical_with_enrichment`
- no canonical or enrichment state is mutated
