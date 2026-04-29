# Next Phase Readiness

## Ready now
- The repo has a separate meal-domain backbone with flat ingredient hierarchy, unit, conversion, rule, and bridge collections.
- Deterministic ingredient validation and query helpers are available through both backend export surfaces.
- Ingredient quantities can be translated from recipe-style units into edible quantities and then into purchase quantities.
- Ingredient-level cost projection exists with explicit fallback provenance.

## Critical boundaries to preserve
- `canonical_products` remain retailer sellable truth only.
- `ingredients` remain meal-domain truth only.
- `product_ingredient_mappings` are the only bridge between those domains in M0.
- Meal enrichment remains additive; runtime logic must use only runtime-safe ingredient fields plus unit rules and bridge confidence.
- Recipe, component, and planning code must consume M0 foundations instead of bypassing them.

## Recommended next focus
1. Create Phase M1 recipe and component schemas plus deterministic ingest helpers.
2. Define how recipes reference `ingredients` and normalized component quantities.
3. Keep shopping and basket outputs bridge-driven so later planners still resolve through retailer products instead of ingredient-only assumptions.

## Known follow-up opportunities
- Add read handlers for ingredient catalog browsing if the UI or future ingest tools need them.
- Revisit purchase-quantity rounding granularity if later domains need sub-kilogram or pack-specific purchase behavior.
- Consider whether category-average pricing should later use richer store- or locality-scoped aggregates once those exist for meal planning.
