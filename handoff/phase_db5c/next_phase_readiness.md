# DB5C Next Phase Readiness

DB5C leaves recipe ingest ready for later runtime-safe eligibility work.

Ready inputs:
- Staged recipe bundles can be reviewed, inspected, and promoted into canonical recipes.
- Canonical recipes now carry deterministic usability and coverage metrics.
- Unmatched staged ingredient names accumulate in `ingredient_gap_candidates` for later ingredient review and mapping work.
- Promotion decisions are append-only through `recipe_promotion_history`.

Boundaries for the next phase:
- Runtime recipe features should gate on `recipes.usability_status`, not on canonical existence alone.
- Ingredient auto-creation should remain explicit review work rather than a side effect of promotion.
- `meal_plan_ready` remains reserved until later product-coverage logic is implemented.
- Firestore publishing and user-facing runtime recipe rollout remain out of scope until a later phase explicitly introduces them.

