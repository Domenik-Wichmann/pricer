# Next Phase Readiness

## Ready now
- Broad grocery terms can resolve into deterministic product-family and attribute clarification surfaces.
- Owner-scoped family preferences can provide suggested defaults when confidence is sufficient.
- The HTTP handler and backend exports are mirrored across both backend source trees.

## Constraints to preserve
- Keep this layer before canonical product and current-offer selection.
- Do not use LLM calls for intent resolution.
- Do not merge or rewrite canonical products from family preferences.
- Keep meal-planning use read-only until a dedicated adapter phase consumes these preferences.

## Recommended next phase
1. Add Admin Console testing for `/shopping-intent/resolve` and seeded family inspection.
2. Add an opt-in basket-planner adapter that calls `resolveShoppingIntent(...)` before `resolveShoppingListItems(...)` for broad terms.
3. Add mobile UI only after the admin/test flow proves the question copy and defaulting behavior.
