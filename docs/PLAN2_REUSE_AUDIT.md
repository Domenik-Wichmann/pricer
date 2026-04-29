# PLAN2 Reuse Audit

Date: 2026-04-29
Status: Reuse audit complete. PLAN2A, PLAN2A.1, PLAN2B, PLAN2C, and PLAN2D are now implemented as the first end-to-end adapter and orchestration slices.

## Purpose

This audit answers one question before any PLAN2 build starts:

How much of Pricer's existing shopping, basket, product, store, and optimizer stack can we reuse for meal-plan shopping without duplicating core logic?

Short answer: a lot of the product-side stack is already reusable, but the bridge from `meal_plans` and recipe ingredients into optimizer-ready canonical product candidates is still missing. That bridge is the real PLAN2 seam.

## Executive Summary

- The normal shopping pipeline is already mature:
  - product catalog search
  - shopping-list resolution
  - basket planning
  - canonical-product price lookup
  - single-store and multi-store optimization
  - convenience scoring
  - deal annotation
- PLAN2 should not build a new optimizer.
- PLAN2 should not build a second price lookup layer.
- PLAN2 should not duplicate saved-list or watchlist persistence.
- The missing work is mostly adapter work:
  - aggregate meal-plan recipes into ingredient demand
  - turn ingredient demand into canonical product candidates
  - feed those candidates into the existing Phase 15/16 basket pipeline
- PLAN2C now proves that the existing Phase 16 optimizer can be reused safely by adapting candidate package counts into synthetic price-lookup rows rather than changing optimizer internals.
- PLAN2D now proves that the full meal-plan shopping pipeline can be coordinated end to end without creating a second shopping stack.
- The main architecture risk is that Pricer now has two ingredient-product bridge layers:
  - runtime `product_ingredient_mappings` in the flat store
  - Postgres DB3E `ingredient_product_mappings`
  These do not currently share one enforced product identity contract.

## 1. What Already Exists For Normal Shopping And Basket Optimization?

### Product catalog and search

Reusable modules:

- `functions/src/phase15/readers.js`
- `functions/src/phase15/service.js`

What exists:

- canonical product read models over `canonical_products` and `canonical_product_mappings`
- search over canonical product views
- enrichment-aware filtering and ranking
- canonical product detail reads

Important note:

- This is the live product-search surface.
- PLAN2 should reuse canonical product IDs from this layer instead of inventing a meal-specific product catalog.

### Shopping-list resolution

Reusable module:

- `functions/src/phase15/shopping_list.js`

What exists:

- `resolveShoppingListItems(...)`
- `handleResolveShoppingListItemsRequest(...)`
- deterministic resolution of raw item text into ranked canonical product candidates
- explicit `resolved`, `ambiguous`, and `unresolved` statuses

This is useful when PLAN2 wants a fallback from structured ingredient demand into the same product-resolution surface used by normal shopping.

### Basket input planning

Reusable module:

- `functions/src/phase15/basket_planner.js`

What exists:

- `buildBasketPlanFromResolvedItems(...)`
- `handleBuildBasketPlanRequest(...)`
- transforms resolved product candidates into optimizer-ready `ready_items`, `ambiguous_items`, and `unresolved_items`

This is the core adapter shape the optimizer already expects.

### Price lookup

Reusable module:

- `functions/src/phase16/price_lookup.js`

What exists:

- `lookupCanonicalProductPrices(...)`
- `lookupPricesForBasketPlan(...)`
- latest-price lookup by `canonical_product_id`
- chain/store filters
- stale-price handling
- deterministic `store_id` derivation from locality + store name

Important boundary:

- price lookup starts from canonical product IDs
- it does not accept ingredient IDs
- it does not accept DB3E `product_id` unless that `product_id` already equals a runtime `canonical_product_id`

### Basket optimization

Reusable module:

- `functions/src/phase16/basket_optimizer.js`

What exists:

- `optimizeBasketSingleStore(...)`
- `optimizeBasketMultiStore(...)`
- `handleOptimizeBasketSingleStoreRequest(...)`
- chain-level and store-combination optimization
- missing-item penalties
- stale handling
- ambiguous candidate auto-selection
- deterministic ranking and tie-breaking

This is the current optimizer surface. It is the one PLAN2 should call.

Important note:

- There is an older Phase 8 optimizer lineage in the repo, but Phase 16 is the current integrated path used by endpoints, tests, and saved lists.

### Convenience, explanation, quality, and deals

Reusable modules:

- `functions/src/phase16/basket_convenience.js`
- `functions/src/phase16/basket_explanation.js`
- `functions/src/phase16/basket_quality.js`
- `functions/src/phase17/deals.js`

What exists:

- convenience penalties for extra stores and non-preferred chains
- explainable optimizer output
- quality and coverage metrics
- deal annotation over optimizer items and price lookup items

These are optional add-ons for later PLAN2 slices, not new core logic.

### Saved-list wrapping pattern

Reusable module:

- `functions/src/phase17/saved_lists.js`

Why it matters:

- `optimizeSavedList(...)` is already a clean example of wrapping a non-search domain object around the existing Phase 16 optimizer without changing optimizer internals
- PLAN2 can follow the same composition style

### Watchlist and price-view composition

Reusable modules:

- `functions/src/phase17/watchlist.js`
- `functions/src/phase17/deals.js`

What exists:

- owner-scoped canonical-product tracking
- canonical product -> current price view
- deal classification

This is not a meal-plan bridge, but it is useful precedent for “canonical product list + price/deal view” composition.

### Store and location read models

Reusable modules:

- `functions/src/phase6/store_locations.js`
- `functions/src/phase6/geocoding.js`
- `functions/src/phase6/location_availability.js`

What exists:

- deterministic retailer location extraction
- geocode cache layer
- nearest-store product availability lookup by canonical product

Important limitation:

- these modules are not wired into the main basket optimizer today
- they are additive read layers, not optimizer selection logic

## 2. Which Files And Modules Are Reusable For PLAN2?

### High-confidence direct reuse

- `functions/src/phase15/readers.js`
- `functions/src/phase15/service.js`
- `functions/src/phase15/shopping_list.js`
- `functions/src/phase15/basket_planner.js`
- `functions/src/phase16/price_lookup.js`
- `functions/src/phase16/basket_optimizer.js`
- `functions/src/phase16/basket_convenience.js`
- `functions/src/phase16/basket_explanation.js`
- `functions/src/phase16/basket_quality.js`
- `functions/src/phase17/deals.js`
- `functions/src/phase17/saved_lists.js`

These are live, current, and already shaped around canonical product candidates.

### Reusable but adapter-dependent

- `functions/src/meal/bridge/service.js`
- `functions/src/db/products/ingredient_product_repository.js`
- `functions/src/db/products/ingredient_product_matching.js`
- `functions/src/db/recipes/recipe_quality_reports.js`
- `functions/src/db/planner/meal_planner_engine.js`

Why adapter-dependent:

- `meal/bridge/service.js` uses runtime `product_ingredient_mappings` and flat-store product price aggregates
- DB3E uses Postgres-side `ingredient_product_mappings` with a generic `product_id`
- PLAN1 stores recipe selections, not shopping baskets
- DB4D reports recipe readiness, but does not generate product candidates

### Useful reference modules

- `functions/src/phase6/location_availability.js`
- `functions/src/phase17/watchlist.js`

These are not the core path, but they help with store-aware and price-view composition patterns.

## 3. Existing Relevant Tables And Collections

### Runtime flat-store collections already in use

Do not duplicate these:

- `canonical_products`
- `canonical_product_mappings`
- `source_products`
- `raw_price_snapshots`
- `product_daily_prices`
- `category_daily_aggregates`
- `retailer_locations`
- `retailer_location_geocodes`
- `saved_lists_store`
- `watchlist_store`

### Existing runtime meal bridge collections

Already exist in the flat store:

- `ingredients`
- `product_ingredient_mappings`
- `units`
- `unit_conversions`
- `ingredient_unit_rules`

Important note:

- this is a runtime bridge layer from Phase M0
- it links `canonical_product_id -> ingredient_id`
- it is separate from DB3E

### Existing Postgres sidecar tables relevant to PLAN2

Do not duplicate these:

- `ingredients`
- `ingredient_product_candidates`
- `ingredient_product_mappings`
- `ingredient_substitution_groups`
- `recipes`
- `recipe_ingredients`
- `recipe_steps`
- `recipe_nutrition_profiles`
- `ingredient_gap_candidates`
- `meal_plans`
- `meal_plan_items`

### Existing user/taste/profile sidecar tables that may matter later

- `user_food_profiles`
- `user_food_constraints`
- `user_food_preferences`
- `user_equipment`
- `user_taste_profile_snapshots`

These are relevant to future plan personalization, but not the main PLAN2 shopping bridge.

## 4. Gaps That Still Remain

### A. `meal_plan -> ingredient aggregation`

Current state:

- `meal_plans` and `meal_plan_items` store selected recipes only
- canonical recipes store ingredient lines in `recipe_ingredients`
- no module currently aggregates one meal plan into total ingredient demand

Gap:

- new adapter logic is needed to read:
  - `meal_plan_items`
  - `recipes`
  - `recipe_ingredients`
- then compute one normalized demand bundle per ingredient

Important nuance:

- `meal_plan_items` snapshot recipe choice and per-serving macros
- they do not store a dedicated ingredient-demand snapshot
- they also do not store a persisted shopping quantity multiplier beyond the selected recipe itself

Practical implication:

- PLAN2A should be the ingredient aggregation phase
- it should stay read-only or sidecar-only at first

### B. `ingredient -> product candidates`

Current state:

- runtime M0 bridge exists via `product_ingredient_mappings`
- DB3E Postgres bridge exists via `ingredient_product_mappings`
- no unified PLAN2 adapter currently resolves one ingredient demand row into a ranked canonical product candidate set for optimizer use

Gap:

- PLAN2 needs one bridging service that can answer:
  - for ingredient `X`
  - at quantity `Y`
  - with optional substitution policy
  - what canonical products are eligible candidates?

Important risk:

- runtime bridge keys on `canonical_product_id`
- DB3E keys on a free-form `product_id` with no FK to runtime product truth

This is the biggest identity mismatch in the current architecture.

### C. `product candidate -> store-specific product/price`

Current state:

- `lookupCanonicalProductPrices(...)` already does canonical product -> chain/store price records
- `findNearestProductAvailability(...)` already does canonical product -> nearby geocoded offers

Gap:

- there is no adapter from DB3E `product_id` to runtime canonical product IDs
- there is no ingredient-demand layer that emits optimizer-ready canonical product candidates

Practical implication:

- if PLAN2 yields canonical product IDs, the existing price lookup is reusable immediately
- if PLAN2 yields only DB3E `product_id`, existing price lookup cannot be called directly

### D. `basket total optimization`

Current state:

- already exists and is reusable
- `optimizeBasketSingleStore(...)`
- `optimizeBasketMultiStore(...)`
- convenience scoring and deal annotation already exist

Gap:

- the gap is not optimization logic
- the gap is upstream adapter work to produce the same basket-plan shape the optimizer already understands

### E. `store/chain selection`

Current state:

- price lookup supports `chain_ids` and `store_ids`
- optimizer collects candidate chains and stores from price records
- convenience scoring supports preferred chains, avoided chains, and `max_store_count`
- nearest-store availability exists as a separate read layer

Gap:

- no PLAN2 service currently converts meal-plan or profile context into those existing filters
- no mainline optimizer path uses geocoded distance today
- no persisted “meal-plan preferred stores” contract exists beyond generic owner/user context

Practical implication:

- PLAN2 should reuse:
  - `price_options.chain_ids`
  - `price_options.store_ids`
  - `user_context.preferred_chain_ids`
  - `user_context.avoid_chain_ids`
  - `user_context.max_store_count`
- distance-aware selection is later polish, not day-one core logic

### F. `substitution handling`

Current state:

- DB3E has `ingredient_substitution_groups`
- recipe ingest staging has substitution hints, but those are authoring metadata
- optimizer ambiguous-candidate logic only chooses among candidate products for one planned item

Gap:

- there is no PLAN2 substitution engine that says:
  - “ingredient A can fall back to ingredient B”
  - then widen product candidates accordingly
- there is no existing basket-layer concept of ingredient-level substitute provenance

Practical implication:

- substitution handling is new PLAN2 logic
- it should sit above the existing optimizer, not inside it

## 5. Can PLAN2C Or PLAN2D Call Existing Optimizer Functions Directly?

Yes, but only after adapter work.

### Direct answer

- `PLAN2C`: yes, after PLAN2 builds an optimizer-ready basket plan using canonical product candidates
- `PLAN2D`: yes, for optimization, convenience scoring, explanation, quality metrics, and deals

### What they cannot do directly

They cannot start from:

- `meal_plan_items`
- `recipe_ingredients`
- ingredient IDs
- DB3E `product_id` alone

and call the optimizer without a bridge layer.

### Required boundary contract

The reusable optimizer boundary is:

1. canonical product candidates
2. Phase 15 basket-plan shape
3. Phase 16 price lookup shape

Once PLAN2 reaches that boundary, existing functions are reusable as-is:

- `buildBasketPlanFromResolvedItems(...)` or an equivalent synthetic basket-plan builder
- `lookupCanonicalProductPrices(...)`
- `lookupPricesForBasketPlan(...)`
- `optimizeBasketSingleStore(...)`
- `optimizeBasketMultiStore(...)`
- `applyBasketConvenienceScoring(...)`
- `annotateOptimizerResultWithDeals(...)`

## 6. What Needs Adapter Code Versus New Core Logic?

### Adapter code

These should be adapters, not new core engines:

- meal plan -> recipe ingredient expansion
- recipe ingredient lines -> aggregated ingredient demand
- ingredient demand -> canonical product candidate bundle
- canonical product candidate bundle -> Phase 15/16 basket-plan and price-lookup inputs
- meal-plan/user context -> existing chain/store/convenience filters
- optimizer result -> meal-plan shopping output summary

### New core logic

These are genuinely new and are not already implemented elsewhere:

- ingredient-demand aggregation from meal plans
- ingredient-level substitution policy
- resolution between runtime `product_ingredient_mappings` and sidecar DB3E `ingredient_product_mappings`
- quantity-aware ingredient-to-product candidate generation for meal shopping
- optional packaging/coverage heuristics for multi-recipe ingredient demand

### Logic that should stay untouched

- canonical product search internals
- price lookup internals
- basket optimizer scoring internals
- saved-list persistence
- watchlist persistence
- deal classification math

## 7. Main Risks

### Risk 1: duplicate bridge logic

The repo already has:

- runtime `product_ingredient_mappings`
- Postgres `ingredient_product_mappings`

PLAN2 should not add a third bridge representation.

### Risk 2: product identity mismatch

DB3E `ingredient_product_mappings.product_id` is intentionally not yet a Postgres FK.

That means PLAN2 cannot safely assume:

- DB3E `product_id` = runtime `canonical_product_id`
- DB3E `product_id` = runtime `source_product_id`

until an explicit contract says so.

### Risk 3: optimizer duplication

It would be easy but wrong to create a “meal basket optimizer” that redoes:

- candidate scoring
- chain/store comparison
- missing-item penalty logic
- multi-store selection

That logic already exists.

### Risk 4: mixing sidecar truth with runtime truth too early

Current runtime price and basket flows still read the flat store, not Postgres.

So PLAN2 must respect this boundary:

- Postgres sidecar is meal and review truth
- runtime optimizer still needs runtime canonical product records and price collections

### Risk 5: servings and quantity semantics

PLAN1 selects recipes, but PLAN2 shopping needs actual ingredient demand math.

Any ambiguity around:

- recipe servings
- household size
- per-meal vs per-recipe quantity
- partial recipe usage

will produce incorrect shopping quantities if not formalized in the adapter layer.

## 8. Recommended Reuse Path

### Recommended path

1. Read meal plan output from Postgres:
   - `meal_plans`
   - `meal_plan_items`
2. Expand selected recipes through canonical recipe tables:
   - `recipes`
   - `recipe_ingredients`
3. Aggregate ingredient demand by canonical ingredient
4. Resolve ingredient demand into canonical product candidates using one bridge service
5. Build a synthetic basket-plan payload that matches the existing Phase 15/16 contract
6. Reuse current:
   - price lookup
   - single-store optimizer
   - multi-store optimizer
   - convenience scoring
   - deal annotation

### Bridge-source recommendation

Safest near-term reuse order:

1. prefer runtime `product_ingredient_mappings` when the goal is immediate optimizer integration
2. use DB3E `ingredient_product_mappings` as reviewed ingredient-product intelligence
3. do not make DB3E the only optimizer bridge until `product_id` is formally tied to runtime product identity

This is conservative, but it avoids forcing PLAN2 to solve the full runtime/Postgres product identity question in the same slice.

## 9. Safest Next Implementation Slice

The safest next slice is no longer another core PLAN2 bridge layer.

PLAN2D is now implemented as the thin end-to-end orchestration wrapper over PLAN1 plus PLAN2A through PLAN2C.

What remains after PLAN2D is follow-on polish rather than a new shopping core:

- preferred or avoided chain context flowing into the reused optimizer inputs
- substitution-aware widening above PLAN2B candidate generation
- explanation, deal, and export-friendly shopping outputs on top of PLAN2C results

## 10. Exact Proposed PLAN2A / PLAN2B / PLAN2C / PLAN2D Split

### PLAN2A - Meal-plan ingredient aggregation

Scope:

- read `meal_plans`, `meal_plan_items`, `recipes`, `recipe_ingredients`
- aggregate meal-plan ingredient demand
- preserve missing grams and missing ingredient-match signals
- no product resolution yet
- no optimizer call yet

Output:

- meal-plan ingredient demand report or sidecar staging rows
- one normalized ingredient-demand contract for later phases

Delivered implementation:

- `meal_plan_requirements`
- `meal_plan_requirement_items`
- deterministic aggregation by canonical ingredient id or normalized unmatched key
- conservative shopping quantity estimates
- explicit `ready_for_product_mapping`, `missing_ingredient`, `missing_quantity`, and `needs_review` adapter statuses

Why first:

- lowest risk
- no runtime dependency bridge yet

### PLAN2B - Ingredient to product candidate bridge

Scope:

- build ingredient-demand -> product-candidate adapter
- inspect and reconcile:
  - runtime `product_ingredient_mappings`
  - DB3E `ingredient_product_mappings`
  - DB3E `ingredient_substitution_groups`
- emit ranked canonical product candidates per ingredient demand row

Output:

- synthetic basket-input candidate bundle
- substitution-aware candidate sets
- explicit provenance on which bridge source was used

Why second:

- this is the real domain seam
- it should be solved before any optimizer invocation

Delivered implementation:

- `meal_plan_product_candidate_sets`
- `meal_plan_product_candidates`
- deterministic canonical-product-id resolution from approved DB3E mappings into the runtime backbone
- conservative package-size normalization to grams
- explicit `ready_for_optimizer`, `missing_product_mapping`, `missing_product_size`, `missing_price`, `covered_by_inventory`, and `needs_review` candidate statuses

Delivered next slice:

- `PLAN2C` now wraps these candidate rows into a synthetic Phase 15/16 basket-plan and synthetic price-lookup contract, then reuses the existing optimizer without rebuilding price or optimization logic

### PLAN2C - Price lookup and optimizer reuse wrapper

Scope:

- turn PLAN2B output into existing Phase 15/16 basket-plan shape plus a synthetic price-lookup shape that preserves candidate package counts
- call:
  - `lookupCanonicalProductPrices(...)`
  - `optimizeBasketSingleStore(...)`
  - `optimizeBasketMultiStore(...)`
- no new optimizer math

Output:

- meal-plan shopping optimization result
- same chain/store and warning semantics as existing basket flows

Why third:

- at this point reuse is straightforward
- core optimizer logic stays untouched

Delivered implementation:

- `meal_plan_optimized_baskets`
- `meal_plan_optimized_basket_items`
- synthetic optimizer basket-plan rows keyed by PLAN2B candidate ids
- synthetic price-lookup rows where package-count multiplication is baked into the price records
- reuse of `lookupCanonicalProductPrices(...)`, `optimizeBasketSingleStore(...)`, and `optimizeBasketMultiStore(...)`
- explicit preservation of covered, missing-product, missing-price, and optimizer-excluded requirement rows

Current next slice:

- future PLAN2 polish can now focus on preferred or avoided chain context, substitution-aware widening, explanation and deal overlays, and export-friendly shopping outputs without changing Phase 16 optimizer math

### PLAN2D - End-to-end orchestration wrapper

Scope:

- resolve or generate one PLAN1 meal plan
- call PLAN2A requirements
- call PLAN2A.1 inventory-adjusted net requirements
- call PLAN2B product candidates
- call PLAN2C optimized basket adaptation
- persist one deterministic orchestration run summary

Output:

- `meal_plan_shopping_runs`
- one explicit run summary that links plan, requirement, net-requirement, candidate-set, and optimized-basket ids

Why fourth:

- the ingredient-demand, inventory, candidate, and optimizer seams were already in place
- orchestration could now stay thin and auditable instead of re-implementing lower-level logic

Delivered implementation:

- `meal_plan_shopping_runs`
- `meal_plan_shopping_orchestrator.js`
- `plan2d:run-meal-plan-shopping`
- deterministic `run_key` reuse
- explicit `started`, `completed`, `partial`, and `failed` orchestration statuses

## 11. Recommended Module Ownership For Future PLAN2 Work

Likely owning areas:

- Postgres meal-plan shopping adapters:
  - new `functions/src/db/planner/` module(s)
- bridge adapters:
  - new service adjacent to `meal/bridge/`
  - or new PLAN2-specific bridge module that wraps `meal/bridge/` and DB3E
- runtime optimizer reuse:
  - call existing `phase15/` and `phase16/` modules directly

Do not repurpose these as PLAN2 owners:

- `phase16/basket_optimizer.js` for meal-specific aggregation logic
- `phase16/price_lookup.js` for ingredient resolution
- `phase15/shopping_list.js` for recipe or ingredient aggregation

Those should remain reusable dependencies, not grow meal-domain responsibilities.

## 12. Final Recommendation

PLAN2 should be built as a bridge into the existing shopping stack, not as a second shopping stack.

The biggest reuse win is already available:

- canonical product search
- basket-plan shaping
- price lookup
- single-store optimization
- multi-store optimization
- convenience scoring
- deal annotation

The biggest missing piece is also clear:

- meal plan ingredient demand -> canonical product candidates

So the safest implementation order is:

1. aggregate ingredient demand
2. resolve product candidates through one bridge layer
3. call the existing optimizer
4. add store/substitution/deal polish after that
