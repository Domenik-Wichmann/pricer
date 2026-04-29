# Next Phase Readiness

## Purpose of Phase A
- Inspect the repo against the meal-intelligence proposal.
- Identify reusable assets, missing foundations, safe boundaries, and the correct implementation starting point.

## Repo truth discovered
- Pricer currently implements product, price, canonical product, additive enrichment, query, basket, watchlist, and entitlement layers.
- There is no existing ingredient, recipe, component, pantry, household, or meal-plan runtime layer.
- Current persistence truth is the flat backend store defined in `functions/src/phase1/store.js`, not relational migrations or Data Connect schema.
- The backend runtime exists in both `functions/src/` and `app/functions/src/`, so future backend work must preserve both trees.

## Key architectural conclusions
- Meal intelligence should be added as a parallel domain slice, not folded into existing product phases.
- `canonical_products` must stay product truth; ingredients need their own canonical entity family.
- Product-to-ingredient mapping is a bridge layer and should be modeled explicitly.
- Unit/conversion infrastructure is required before recipe costing or planning can be reliable.
- Recipe ingest should mirror current additive/cache-first/review-safe patterns, but not reuse the retailer ingest pipeline directly.

## Critical boundaries
- Shared:
  - store contract
  - canonical-ID conventions
  - review/adjudication pattern
  - localization conventions
  - generic unit vocabulary
- Domain-local:
  - ingredients
  - recipes
  - components
  - techniques
  - meal-planning logic
- Bridge:
  - product-to-ingredient mappings
  - ingredient pricing projections
  - recipe costing
  - meal-plan to basket translation

## Reused assets
- `functions/src/phase1/store.js`
- `functions/src/phase6/ingest.js`
- `functions/src/phase6/disambiguation.js`
- `functions/src/phase12/canonicalization.js`
- `functions/src/phase15/enrichment.js`
- `functions/src/phase15/readers.js`
- `functions/src/phase8/optimizer.js`

## Missing assets
- ingredient collections
- recipe/component collections
- conversion collections
- meal preference and household collections
- meal-domain ingest jobs
- meal-domain API handlers

## Recommended implementation order
1. Phase M0 shared meal foundations and store-shape extension
2. Phase M1 ingredient + product bridge
3. Phase M2 recipe/component ingest
4. Phase M3 costing bridge
5. Phase M4 deterministic planning
6. Phase M5 basket integration
7. Phase M6 preference feedback

## Risks and cautions
- Do not collapse ingredients into canonical products.
- Do not touch only one backend runtime tree.
- Do not start recipe planning before unit/conversion groundwork exists.
- Do not assume Data Connect or SQL migrations are the active persistence path today.

## Unresolved questions
- Whether meal-domain persistence should stay fully flat or use some nested JSON fields for rich ingredient metadata in v1.
- Whether generalized localization infrastructure should be introduced during Phase M0 or deferred until meal-domain entities prove the need.
- Whether meal shopping outputs should persist first or remain computed response contracts until planner UX solidifies.

## Exact next actions
- Create `docs/implementation/PHASE_M0_MEAL_FOUNDATIONS.md`.
- Define the new collections to add to `functions/src/phase1/store.js` and `app/functions/src/phase1/store.js`.
- Write a dedicated product-to-ingredient bridge contract.
- Write a unit/conversion contract with a conservative runtime-safe v1 scope.

## Exact files/modules/tables likely involved next
- `functions/src/phase1/store.js`
- `app/functions/src/phase1/store.js`
- `functions/src/index.js`
- `app/functions/src/index.js`
- new `functions/src/meal/` modules
- new `app/functions/src/meal/` modules
- `docs/DATA_MODEL.md`
- `docs/ARCHITECTURE.md`

## Verification/testing expectations
- Any next implementation phase should update `docs/TEST_REGISTRY.md`.
- Any next implementation phase should add a `docs/test_runs/phase_m*.json` artifact.
- Any next implementation phase should add deterministic unit tests before enabling meal-domain runtime endpoints.
