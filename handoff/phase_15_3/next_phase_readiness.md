# Next Phase Readiness

## Ready now
- The backend can resolve messy shopping-list items into ranked canonical product candidates with explicit statuses and confidence labels.
- The resolver defaults to `canonical_with_enrichment` and still supports the explicit Phase 15.2 layer modes.
- Basket-oriented consumers can now start from resolved, ambiguous, and unresolved item outputs instead of raw free text.

## Constraints to preserve
- Keep canonical truth and canonical mappings immutable.
- Keep enrichment additive only.
- Keep applied disambiguation as a policy/view layer.
- Keep deterministic marker precedence above all later interpretation layers.
- Keep shopping-list resolution read-only and non-mutating.

## Recommended next focus
1. Build the basket-input planner that consumes resolved shopping-list items and handles ambiguous or unresolved entries explicitly.
2. Add downstream policies for when to carry multiple candidate products into basket optimization versus forcing user confirmation later.
3. Add runtime reporting for resolver status mix, ambiguity rate, and top unresolved item patterns.
