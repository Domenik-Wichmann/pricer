# PLAN2 Meal Plan Requirements

Date: 2026-04-29
Status: IMPLEMENTED - POSTGRES SIDECAR ONLY

## Scope

PLAN2A adds the first adapter layer between stored meal plans and future shopping / basket flows.
PLAN2A.1 adds a second derived adapter layer that subtracts current user inventory from those gross requirement bundles without mutating the original requirement rows.
PLAN2B adds the third adapter layer that turns those net requirement rows into purchasable product candidate options using approved DB3E ingredient-product mappings plus the existing runtime canonical product and price backbone.
PLAN2C adds the fourth adapter layer that turns those candidate rows into a synthetic Phase 16 basket-plan plus price-lookup contract, calls the existing optimizer, and stores the resulting optimized basket without mutating runtime basket or product state.
PLAN2D adds a fifth orchestration layer that can generate a plan if needed, run PLAN2A through PLAN2C in sequence, and persist one deterministic orchestration summary row.

It reads:

- `meal_plans`
- `meal_plan_items`
- canonical `recipe_ingredients`
- canonical `ingredients`

It writes:

- `meal_plan_requirements`
- `meal_plan_requirement_items`
- `meal_plan_net_requirements`
- `meal_plan_net_requirement_items`
- `meal_plan_product_candidate_sets`
- `meal_plan_product_candidates`
- `meal_plan_optimized_baskets`
- `meal_plan_optimized_basket_items`
- `meal_plan_shopping_runs`

PLAN2A does not call the basket optimizer, price lookup, store selection, Firestore, LLMs, sponsored logic, or runtime product/search/shopping/basket mutation paths.
PLAN2A.1 keeps the same boundary and also does not mutate inventory quantities.
PLAN2B reads the existing runtime product backbone through the current canonical-product price lookup, but it still does not call the basket optimizer, does not choose stores, and does not mutate runtime product/search/shopping/basket state.
PLAN2C reuses the existing runtime canonical-product price lookup plus the existing Phase 16 single-store and multi-store optimizer functions, but only through explicit CLI or service invocation. It still does not mutate runtime saved lists, watchlists, baskets, products, or prices.

## Architecture

```text
meal_plan
-> meal_plan_requirements
-> meal_plan_requirement_items
-> meal_plan_net_requirements
-> meal_plan_net_requirement_items
-> meal_plan_product_candidate_sets
-> meal_plan_product_candidates
-> meal_plan_optimized_baskets
-> meal_plan_optimized_basket_items
-> later existing basket / shopping system
```

This is intentionally an adapter layer, not a new shopping-list product. The output stays sidecar-only and is shaped so later PLAN2 phases can bridge into the existing Phase 15/16 basket stack.

## Migration

```text
db/migrations/023_plan2a_meal_plan_requirements.sql
db/migrations/025_plan2a1_inventory_adjusted_requirements.sql
db/migrations/026_plan2b_meal_plan_product_candidates.sql
db/migrations/027_plan2c_meal_plan_optimized_baskets.sql
db/migrations/028_plan2d_meal_plan_shopping_runs.sql
```

Creates:

- `meal_plan_requirements`
- `meal_plan_requirement_items`
- `meal_plan_net_requirements`
- `meal_plan_net_requirement_items`
- `meal_plan_product_candidate_sets`
- `meal_plan_product_candidates`
- `meal_plan_optimized_baskets`
- `meal_plan_optimized_basket_items`
- `meal_plan_shopping_runs`

Supported `adapter_status` values:

```text
ready_for_product_mapping
missing_ingredient
missing_quantity
needs_review
```

Supported PLAN2A.1 `inventory_status` values:

```text
no_inventory
partially_covered
fully_covered
missing_ingredient
missing_quantity
needs_review
```

Supported PLAN2A.1 `adapter_status` values:

```text
ready_for_product_mapping
covered_by_inventory
missing_ingredient
missing_quantity
needs_review
```

## Builder

```text
functions/src/db/planner/meal_plan_requirements_builder.js
app/functions/src/db/planner/meal_plan_requirements_builder.js
functions/src/db/planner/meal_plan_net_requirements_builder.js
app/functions/src/db/planner/meal_plan_net_requirements_builder.js
functions/src/db/planner/meal_plan_product_candidate_builder.js
app/functions/src/db/planner/meal_plan_product_candidate_builder.js
functions/src/db/planner/meal_plan_basket_optimizer_adapter.js
app/functions/src/db/planner/meal_plan_basket_optimizer_adapter.js
functions/src/db/planner/meal_plan_shopping_orchestrator.js
app/functions/src/db/planner/meal_plan_shopping_orchestrator.js
```

Main behavior:

1. Load one stored meal plan by `plan_id` or `plan_key`.
2. Load all `meal_plan_items` for that plan.
3. Expand those selected recipes through canonical `recipe_ingredients`.
4. Aggregate by canonical ingredient using `COALESCE(matched_ingredient_id, ingredient_id)`.
5. For unmatched recipe lines, aggregate by normalized `ingredient_key_snapshot` or `display_name`.
6. Sum `quantity_grams` only when present.
7. Preserve contributing recipe ids and recipe-ingredient ids.
8. Use canonical `ingredients.shopping_unit` when a canonical ingredient exists.
9. Estimate shopping quantities conservatively:
   - grams -> `kg` when `shopping_unit = kg`
   - grams -> `g` when `shopping_unit = g`
   - grams -> `piece` when `shopping_unit = piece` and `grams_per_piece` exists
   - otherwise keep grams
10. Classify each requirement item deterministically:
   - `missing_ingredient`
   - `missing_quantity`
   - `ready_for_product_mapping`
   - `needs_review`
11. Upsert one requirement row and rebuild its item rows safely on rerun.

PLAN2A.1 behavior:

1. Load one stored PLAN2A requirement bundle by `requirement_id` or `requirement_key`.
2. Load active inventory rows for the same user/profile where `quantity_grams > 0`.
3. Match inventory to requirement items by `ingredient_id` first, then by normalized `ingredient_key_snapshot`.
4. Compute:
   - `required_quantity_grams`
   - `inventory_applied_grams`
   - `net_quantity_grams = max(required - inventory_applied, 0)`
5. Preserve source recipe ids and recipe-ingredient ids from PLAN2A.
6. Recompute shopping quantity estimates from net grams using the same conservative `kg` / `g` / `piece` rules.
7. Classify each net item deterministically:
   - inventory status: `missing_ingredient`, `missing_quantity`, `fully_covered`, `partially_covered`, `no_inventory`, or `needs_review`
   - adapter status: `covered_by_inventory`, `ready_for_product_mapping`, `missing_ingredient`, `missing_quantity`, or `needs_review`
8. Upsert one net requirement row and rebuild its net item rows safely on rerun.

PLAN2B behavior:

1. Load one stored PLAN2A.1 net-requirement bundle by `net_requirement_id` or `net_requirement_key`.
2. Read net requirement items and ingredient metadata from Postgres.
3. Read approved DB3E `ingredient_product_mappings` plus candidate product metadata.
4. Resolve DB3E `product_id` values onto the existing runtime canonical product backbone:
   - direct `canonical_product_id` matches win
   - otherwise runtime `source_product_id -> canonical_product_id` mappings are used
5. Read existing runtime price data through `lookupCanonicalProductPrices(...)`.
6. Derive package size from runtime `canonical_products.canonical_size_value` / `canonical_size_unit` first, then fall back to DB3E candidate size metadata.
7. Normalize package sizes to grams conservatively:
   - `g`
   - `kg`
   - `ml` / `l` with `ingredients.density_g_per_ml`
   - `piece` / `count` with `ingredients.grams_per_piece`
8. Compute:
   - `units_needed = ceil(required_quantity_grams / product_size_grams)`
   - `total_purchased_grams`
   - `overage_grams`
   - `total_estimated_price`
9. Classify candidate rows deterministically:
   - `ready_for_optimizer`
   - `missing_product_mapping`
   - `missing_product_size`
   - `missing_price`
   - `covered_by_inventory`
   - `needs_review`
10. Upsert one candidate-set row and rebuild its candidate rows safely on rerun.

PLAN2C behavior:

1. Load one stored PLAN2B candidate-set bundle by `candidate_set_id` or `candidate_set_key`.
2. Group candidate rows by `net_requirement_item_id`.
3. Preserve non-optimizable rows as explicit output items:
   - `covered_by_inventory`
   - `missing_product`
   - `missing_price`
   - `optimizer_excluded`
   - `needs_review`
4. Convert ready candidate rows into a synthetic optimizer-ready basket-plan contract:
   - single ready candidate for one requirement -> `ready_item`
   - multiple ready candidates for one requirement -> `ambiguous_item`
5. Reuse `lookupCanonicalProductPrices(...)` on the underlying runtime canonical product ids.
6. Adapt those runtime price records into a synthetic optimizer price lookup where candidate package counts are already multiplied in:
   - synthetic `canonical_product_id = candidate_id`
   - synthetic `price = runtime price * units_needed`
   - synthetic `quantity = 1`
7. Reuse `optimizeBasketSingleStore(...)` and `optimizeBasketMultiStore(...)` without changing their internal ranking logic.
8. Select the recommended strategy from the existing multi-store wrapper:
   - `single_store` when the Phase 16 recommendation stays single-store
   - `multi_store` when the Phase 16 recommendation prefers a bounded split basket
9. Store one deterministic optimized basket row plus one output row per requirement:
   - selected basket item
   - covered-by-inventory marker
   - missing/missing-price/review marker
10. Upsert one optimized basket row and rebuild its item rows safely on rerun.

PLAN2D behavior:

1. Resolve one existing meal plan by `plan_id` or `plan_key`, or generate one new PLAN1 plan.
2. Run PLAN2A on that plan.
3. Run PLAN2A.1 on the resulting requirement bundle.
4. Run PLAN2B on the resulting net-requirement bundle.
5. Run PLAN2C on the resulting candidate-set bundle.
6. Collect the resulting sidecar ids and compute one summary row in `meal_plan_shopping_runs`.
7. Upsert one deterministic orchestration-run row by `run_key`.

Important nuance:

- PLAN2A multiplies ingredient grams by the number of times each recipe appears in the meal plan.
- It does not invent missing grams.
- It does not auto-create missing canonical ingredients.
- PLAN2A.1 does not consume or decrement inventory. It is a planning-only subtraction pass.

## Idempotency

`requirement_key` is deterministic from:

```text
plan_id + rules_version
```

Re-running PLAN2A refreshes one canonical sidecar requirement bundle for that meal plan instead of creating duplicates.

`net_requirement_key` is deterministic from:

```text
requirement_id + rules_version
```

Re-running PLAN2A.1 refreshes one derived net-requirement bundle per requirement bundle instead of duplicating rows.

`candidate_set_key` is deterministic from:

```text
net_requirement_id + rules_version
```

Re-running PLAN2B refreshes one deterministic candidate-set bundle per PLAN2A.1 net-requirement bundle instead of duplicating rows.

`optimizer_run_key` is deterministic from:

```text
candidate_set_id + optimizer_version + rules_version
```

Re-running PLAN2C refreshes one deterministic optimized-basket bundle per PLAN2B candidate-set bundle instead of duplicating rows.

`run_key` is deterministic from:

```text
user_id + plan_key + rules_version
```

Re-running PLAN2D refreshes one deterministic orchestration-run row instead of duplicating rows, while the underlying PLAN1 and PLAN2 artifacts keep their own existing deterministic ids.

## CLI

```powershell
npm run plan2a:build-meal-plan-requirements -- --plan-id=meal_plan:demo --dry-run --json
npm run plan2a:build-meal-plan-requirements -- --plan-key=meal_plan:demo:key --out=tmp/plan2a_report.json
npm run plan2a1:build-net-requirements -- --requirement-id=meal_plan_requirement:demo --dry-run --json
npm run plan2a1:build-net-requirements -- --requirement-key=meal_plan_requirement:demo:key --out=tmp/plan2a1_report.json
npm run plan2b:build-product-candidates -- --net-requirement-id=meal_plan_net_requirement:demo --dry-run --json
npm run plan2b:build-product-candidates -- --net-requirement-key=meal_plan_net_requirement:demo:key --out=tmp/plan2b_report.json
npm run plan2c:optimize-meal-plan-basket -- --candidate-set-id=meal_plan_product_candidate_set:demo --dry-run --json
npm run plan2c:optimize-meal-plan-basket -- --candidate-set-key=meal_plan_product_candidate_set:demo:key --out=tmp/plan2c_report.json
npm run plan2d:run-meal-plan-shopping -- --plan-id=meal_plan:demo --json
npm run plan2d:run-meal-plan-shopping -- --profile-id=user_food_profile:user_demo --start-date=2026-05-05 --out=tmp/plan2d_report.json
```

Supported flags:

- `--plan-id`
- `--plan-key`
- `--dry-run`
- `--json`
- `--out`

PLAN2A.1 flags:

- `--requirement-id`
- `--requirement-key`
- `--dry-run`
- `--json`
- `--out`

PLAN2B flags:

- `--net-requirement-id`
- `--net-requirement-key`
- `--dry-run`
- `--json`
- `--out`
- `--limit`

PLAN2C flags:

- `--candidate-set-id`
- `--candidate-set-key`
- `--dry-run`
- `--json`
- `--out`

PLAN2D flags:

- `--user-id`
- `--profile-id`
- `--plan-id`
- `--plan-key`
- `--start-date`
- `--days`
- `--meals-per-day`
- `--dry-run`
- `--json`
- `--out`

CLI summary fields:

- `plans_seen`
- `requirements_created`
- `items_created`
- `ready_for_product_mapping`
- `missing_ingredient`
- `missing_quantity`
- `needs_review`
- `total_quantity_grams`
- `errors`

PLAN2A.1 CLI summary fields:

- `requirements_seen`
- `net_requirements_created`
- `items_created`
- `fully_covered`
- `partially_covered`
- `no_inventory`
- `missing_ingredient`
- `missing_quantity`
- `ready_for_product_mapping`
- `covered_by_inventory`
- `total_required_grams`
- `total_inventory_applied_grams`
- `total_net_grams`
- `errors`

PLAN2B CLI summary fields:

- `net_requirements_seen`
- `candidate_sets_created`
- `requirement_items_seen`
- `covered_by_inventory`
- `missing_product_mapping`
- `missing_product_size`
- `missing_price`
- `ready_for_optimizer`
- `candidates_created`
- `total_required_grams`
- `total_estimated_price_min`
- `total_estimated_price_max`
- `errors`

PLAN2C CLI summary fields:

- `candidate_sets_seen`
- `ready_candidates`
- `covered_by_inventory`
- `missing_product`
- `missing_price`
- `optimizer_excluded`
- `needs_review`
- `optimized_baskets_created`
- `selected_items`
- `total_estimated_price`
- `currency`
- `errors`

PLAN2D CLI summary fields:

- `runs_created`
- `plans_used_or_created`
- `requirements_created`
- `net_requirements_created`
- `candidate_sets_created`
- `optimized_baskets_created`
- `total_estimated_price`
- `inventory_coverage_percent`
- `missing_items_count`
- `ready_items_count`
- `run_status`
- `errors`

## Boundaries

PLAN2A deliberately does not:

- call `resolveShoppingListItems(...)`
- call `lookupPricesForBasketPlan(...)`
- call `optimizeBasketSingleStore(...)`
- call `optimizeBasketMultiStore(...)`
- select stores or chains
- mutate canonical recipes or products
- mutate `meal_plan_requirements` source rows
- mutate inventory quantities
- write Firestore
- call an LLM

PLAN2B does call `lookupCanonicalProductPrices(...)` as a read-only runtime adapter, but it still does not:

- call `lookupPricesForBasketPlan(...)`
- call `optimizeBasketSingleStore(...)`
- call `optimizeBasketMultiStore(...)`
- choose a winning store or chain
- mutate runtime product or price collections
- mutate net requirements, inventory, recipes, or products
- write Firestore
- call an LLM

PLAN2C does call `lookupCanonicalProductPrices(...)`, `optimizeBasketSingleStore(...)`, and `optimizeBasketMultiStore(...)` through a synthetic adapter contract, but it still does not:

- mutate runtime product or price collections
- mutate runtime saved-list, watchlist, or shopping/basket records
- mutate candidate sets, net requirements, inventory, recipes, or products
- add a second optimizer or second store-selection engine
- add sponsored logic
- write Firestore
- call an LLM

PLAN2D does call PLAN1 and PLAN2A through PLAN2C in sequence, but it still does not:

- introduce a new optimizer or a second price lookup layer
- mutate runtime product, price, saved-list, watchlist, or basket state
- add sponsored logic
- write Firestore
- call an LLM

For the dedicated orchestration contract and the top-level `--dry-run` note, see [PLAN2_ORCHESTRATION.md](PLAN2_ORCHESTRATION.md).
