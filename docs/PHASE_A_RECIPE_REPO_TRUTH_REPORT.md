# Phase A Recipe Repo-Truth Inspection Report

Date: 2026-04-23
Scope: inspection and handoff only, no meal-domain implementation
Primary source document inspected first: `docs/PHASE_A_RECIPE_INSPECT.md`

## 1. Repo Truth Summary

Pricer is currently a deterministic product-price-query-basket platform, not yet a food or recipe platform. The active shared architecture is explicitly additive and layered: raw source import, deterministic source enrichment, deterministic canonical product grouping, additive canonical enrichment, deterministic query/match, then basket/watchlist/entitlement consumers (`docs/ARCHITECTURE.md:3-23`).

The backend runtime is a flat-record data backbone with swappable persistence backends (`functions/src/phase1/store.js:5-80`, `docs/DATA_MODEL.md:3-7`). The main persisted shared entities relevant to this inspection are:
- raw/source product truth: `raw_price_snapshots`, `source_products`, `source_product_enrichment` (`docs/DATA_MODEL.md:11-89`)
- canonical product truth: `canonical_products`, `canonical_product_mappings` (`docs/DATA_MODEL.md:205-228`)
- additive semantic layer: `canonical_enrichment_store` (`docs/DATA_MODEL.md:230-252`)
- adjudication/review layer: `canonical_disambiguation_queue`, `canonical_disambiguation_decisions` (`docs/DATA_MODEL.md:254-307`)
- search normalization layer: `canonical_terms`, `synonym_map` (`docs/DATA_MODEL.md:490-518`)
- pricing and basket consumers: `product_daily_prices`, `category_daily_aggregates`, Phase 8 optimizer (`docs/DATA_MODEL.md:149-165`, `functions/src/phase8/optimizer.js:5-409`)
- lightweight user state: `watchlist_profiles`, `watchlist_*`, `user_tiers`, `revenuecat_events` (`docs/DATA_MODEL.md:391-518`)

The current repo does not contain canonical ingredient entities, recipe entities, component entities, meal-planning entities, pantry entities, household entities, or recipe ingest jobs. A repo-wide search for `recipe|ingredient|component|household|pantry` across `functions/src`, `app/mobile/lib`, and `tests` returns only shopping-list UI text plus the phase-inspection doc itself, not implemented meal-domain runtime logic.

The product canonicalization layer is conservative and deterministic. `buildCanonicalizationState()` groups chain/product representatives into `canonical_products` and `canonical_product_mappings`, using normalized enrichment plus hard variant markers and warnings (`functions/src/phase6/ingest.js:890-1085`). The repo already has the exact pattern the meal domain should mirror for:
- additive truth layers
- provenance-preserving review queues
- strict deterministic runtime readers
- cache-first ingest-time enrichment

The query and basket layers are product-centric. Matching uses `canonical_terms` and `synonym_map` only to improve product lookup (`functions/src/phase2/matcher.js:30-109`, `functions/src/phase2/score.js:3-74`, `functions/src/phase12/canonicalization.js:63-391`). Basket optimization reuses query results item-by-item; it does not normalize ingredient quantities or perform recipe costing (`functions/src/phase8/optimizer.js:5-409`).

Localization exists, but it is not a generalized multilingual entity model. Today the backend stores deterministic English display metadata and a small translation map under `source_product_enrichment`, while the Flutter app localizes app-owned UI strings separately (`docs/DATA_MODEL.md:56-89`, `functions/src/phase1_5/display_builder.js:8-103`, `functions/src/phase1_5/constants.js:1-114`, `app/mobile/lib/core/services/app_dependencies.dart:49-173`, `docs/implementation/PHASE_5_6_LOCALIZATION.md:1-49`).

Database/migration truth is also important here:
- `migrations/` currently contains only `.gitkeep`; there is no relational migration history in use.
- `dataconnect/schema/schema.gql` is still the stock movie-review example, not an active Pricer data model (`dataconnect/schema/schema.gql:1-4`).
- The effective persistence truth is the flat store shape plus optional Firestore top-level collections (`functions/src/phase1/store.js:5-214`).

One additional repo-truth constraint: backend runtime code is duplicated under both `functions/src/` and `app/functions/src/`. That duplication is currently intentional for deploy/test packaging, but it creates a dual-edit/drift risk for any future meal-domain implementation.

## 2. Document vs Repo Comparison

### Fits repo truth well
- Deterministic runtime, ingest-time AI, additive semantic layers, and canonical IDs align strongly with the existing product architecture (`docs/ARCHITECTURE.md:3-23`, `functions/src/phase6/ingest.js:890-1085`, `functions/src/phase15/enrichment.js:158-383`, `functions/src/phase15/readers.js:9-550`).
- The document's insistence on preserving source truth and not collapsing product with higher-order meaning fits the repo's current raw/source/canonical/enrichment separation.
- The bridge idea of `product -> ingredient -> recipe -> plan -> basket` is repo-compatible as an extension path, even though only `product -> basket` exists today.
- The request for cached ingest outputs, reviewable uncertainty, and confidence/provenance maps fits the existing canonical enrichment and disambiguation patterns.

### Partially fits
- Multilingual support fits partially. The repo supports BG input and some backend English display generation, but not generalized multilingual entity storage. The explicit `name_bg`, `name_en`, `aliases_bg[]`, `aliases_en[]` shape is not currently present as a reusable central primitive.
- Unit normalization fits partially. The repo only handles search/query units like `g`, `kg`, `ml`, `l`, plus fat percentages in product matching (`functions/src/phase2/normalize.js:49-66`, `functions/src/phase12/canonicalization.js:18-60`). It does not support edible-vs-purchase conversions, recipe units, waste factors, or pack normalization for ingredients.
- User preference modeling fits partially. The repo has anonymous user IDs, watchlist state, and monetization tiers, but no taste/allergy/household schema (`docs/DATA_MODEL.md:391-518`, `functions/src/phase10/entitlements.js:17-107`, `app/mobile/lib/core/services/app_dependencies.dart:55-173`).

### Conflicts or overstates current repo readiness
- The document assumes DB schemas, tables, and migrations are first-class repo assets to extend. In reality the repo uses flat backend collections and has no live SQL/Data Connect migration discipline yet.
- The document talks about recipe ingest fitting existing ingest patterns. There is no current non-product ingest pipeline; the only mature ingest pipeline is retailer-price snapshot ingest (`functions/src/phase6/ingest.js`).
- The document implicitly treats shopping lists as related meal-domain groundwork. Repo truth says current shopping lists are user-entered product query lists in mobile Firestore, not canonical ingredient or plan outputs (`app/mobile/lib/core/services/firestore_repositories.dart:1-330`).

### Missing or weak in the document itself
- `docs/PHASE_A_RECIPE_INSPECT.md` contains duplicated content blocks and mojibake/encoding issues, which should be corrected before implementation planning continues.
- The doc asks for migration/table analysis, but it does not acknowledge that the repo currently lacks a real migration system and still has an example `dataconnect/schema/schema.gql`.

## 3. Existing Assets to Reuse

Shared patterns and modules that should be reused or mirrored:
- Shared persistence/store contract: `functions/src/phase1/store.js`
- Product canonicalization pattern: `functions/src/phase6/ingest.js`
- Review/adjudication pattern: `functions/src/phase6/disambiguation.js`
- Additive enrichment pattern: `functions/src/phase15/enrichment.js`
- Layered read-model pattern: `functions/src/phase15/readers.js`
- Deterministic canonical search terms and synonyms: `functions/src/phase12/canonicalization.js`, `functions/src/phase12/feedback_loop.js`
- Product query execution composition: `functions/src/phase4/service.js`, `functions/src/phase4/query_*`
- Basket optimization shell and output composition: `functions/src/phase8/optimizer.js`, `functions/src/phase8/service.js`
- Anonymous user/device identity and client persistence conventions: `app/mobile/lib/core/services/app_dependencies.dart`, `app/mobile/lib/core/services/firestore_repositories.dart`, `app/mobile/lib/core/services/billing_repositories.dart`
- Documentation and verification conventions: `docs/TEST_STRATEGY.md`, `docs/TEST_REGISTRY.md`, `handoff/phase_15/*`

Existing tables/collections and patterns that meal-domain work should bridge to rather than replace:
- `canonical_products`
- `canonical_product_mappings`
- `canonical_enrichment_store`
- `canonical_disambiguation_queue`
- `canonical_disambiguation_decisions`
- `product_daily_prices`
- `category_daily_aggregates`
- `canonical_terms`
- `synonym_map`

## 4. Missing Foundations

Missing entirely today:
- canonical ingredient families
- canonical ingredient categories
- canonical ingredients
- product-to-ingredient bridge mappings
- ingredient-specific unit/conversion rules
- purchasable-vs-edible yield rules
- recipe entities and recipe ingredient lines
- component entities and buy-vs-make metadata
- technique/state metadata for food preparation
- meal-plan constraints, plan candidates, plan selections, and shopping-output records
- household or pantry data
- user taste/allergy/diet preference data
- recipe or ingredient ingest pipeline
- meal-domain endpoints or service handlers

Missing shared foundations that should be solved once, not ad hoc inside a meal module:
- reusable localization shape for canonical entities beyond `display_en`
- reusable confidence/provenance field conventions outside the current enrichment/disambiguation stores
- generic unit/conversion primitives beyond query-size extraction

## 5. Shared vs Domain-Local Boundary Map

- Canonical identity primitives: shared
  Reason: the repo already uses stable additive canonical IDs as a cross-cutting pattern.
- Persistence/store contract and Firestore-compatible flat collection rules: shared
- Localization conventions for canonical entities: shared
  Reason: current multilingual handling is partial and should not fork per domain.
- Generic confidence/provenance shape: shared
- Generic review/adjudication infrastructure pattern: shared
- Generic unit vocabulary and cross-domain normalization primitives: shared
  Reason: food will need them first, but they should not be trapped inside one domain.
- Canonical ingredients, ingredient families, ingredient categories: meal-domain local
- Recipes, components, techniques, prep states, pantry rules, leftovers, planning heuristics: meal-domain local
- Meal-plan constraints, recipe scoring, weekly assembly, shopping-list generation from plans: meal-domain local
- Product-to-ingredient mappings: bridge
- Ingredient pricing projections and fallback ladders: bridge
- Recipe ingredient costing and plan-to-basket translation: bridge
- Search aliases for ingredient names: shared storage shape, meal-domain-owned content

## 6. Recommended Architecture

Repo-fit recommendation:
- Add a new backend domain slice, not invasive edits inside existing product phases. The cleanest path is a parallel top-level meal domain under both `functions/src/meal/` and `app/functions/src/meal/`.
- Keep product canonicalization untouched. Ingredients should not be forced into `canonical_products`.
- Introduce meal-domain flat collections into the shared store instead of overloading current product collections.
- Treat product-to-ingredient as a bridge table keyed by `canonical_product_id` and `ingredient_id`.
- Reuse Phase 15's additive-enrichment shape for recipe/ingredient enrichment artifacts, but keep them in meal-domain collections, not in `canonical_enrichment_store`.
- Reuse Phase 15 reader layering for meal read APIs: truth-only, truth+applied-review, truth+enrichment, and combined views where needed.
- Keep deterministic planning as a separate backend service module parallel to Phase 8, not inside ingest and not inside query matching.
- Extend basket optimization only at the bridge edge: meal planning should emit normalized ingredient demand, then a bridge service should translate that demand into product candidates and call/reuse basket logic.

Recommended module areas:
- `meal/catalog/` for ingredient families/categories/ingredients/components/techniques/states
- `meal/ingest/` for recipe and ingredient ingest plus enrichment validation
- `meal/bridge/` for product-to-ingredient mappings, conversion, and costing
- `meal/planning/` for constraints, scoring, weekly assembly, and shopping output contracts
- `meal/api/` or exported handlers for meal-domain HTTP endpoints later

## 7. Schema Recommendations

### Canonical ingredient schema
- Use a new `ingredients` collection with explicit `name_bg`, `name_en`, `aliases_bg`, `aliases_en` in v1.
- Include `ingredient_id`, `status`, `ingredient_family_id`, `ingredient_category_id`, `default_edible_unit`, `default_purchase_basis_unit`, `search_terms`, `classification_json`, `purchase_properties_json`, `nutrition_roughness_json`, `dietary_flags_json`, `quality_json`.
- Keep rich optional metadata in structured JSON fields at first rather than exploding dozens of columns into the flat store immediately.

### Recipe schema
- Use `recipes` plus `recipe_ingredients` plus optional `recipe_steps`.
- Keep `recipe_id`, localized names/summaries, servings/timings/difficulty, review status, source/provenance, runtime-safe flags.
- Store ingredient lines separately to preserve exact source text plus normalized ingredient references and quantities.

### Component schema
- Use a first-class `components` collection, not a boolean on `recipes`.
- Components should support `component_id`, localized names, component type, store-bought eligibility, homemade eligibility, linked subrecipe IDs, and bridge pricing policy.

### Unit/conversion schema
- Shared tables/collections recommended:
  - `units`
  - `unit_conversions`
  - `ingredient_unit_conversions`
- Repo-fit v1 should support only deterministic mass/volume/count basics plus ingredient-specific piece-to-gram and edible-yield conversions.
- Defer “pinch/to taste” into non-costed optional metadata until later.

### Planning constraints schema
- Add `meal_user_preferences`, `meal_households`, `meal_household_members`, `meal_plan_requests`, `meal_plan_candidates`, `meal_plans`.
- V1 runtime-safe subset should focus on allergies/exclusions, budget, preferred stores, household size, meal count, time/effort ceilings.

### Shopping/basket output schema
- Add `meal_shopping_lists` and `meal_shopping_list_items` only if persistence is needed.
- Otherwise define an API contract that emits:
  - selected recipes
  - normalized ingredient requirements
  - conversion assumptions used
  - product candidate selections
  - basket options
  - price provenance/fallback level

### Multilingual/localization approach
- For meal-domain entities, use explicit BG/EN fields now.
- Do not introduce a generalized localization table yet because the repo has no existing cross-domain localization abstraction to extend.
- Also add a derived search-term collection similar to `canonical_terms` for ingredient aliases later, likely meal-domain-owned content stored with shared search conventions.

## 8. File / Module / Table Impact

Likely to extend:
- `functions/src/phase1/store.js`
- `app/functions/src/phase1/store.js`
- `functions/src/index.js`
- `app/functions/src/index.js`
- `functions/index.js` when meal endpoints are eventually added
- `docs/DATA_MODEL.md`
- `docs/ARCHITECTURE.md`
- `docs/CURRENT_STATE.md`
- `docs/TEST_REGISTRY.md`

Should remain untouched if possible:
- `functions/src/phase6/ingest.js` core product ingest and canonicalization logic
- `functions/src/phase2/*` product matching path
- `functions/src/phase4/*` query engine internals
- `functions/src/phase8/*` existing basket optimizer scoring, except for clean bridge-level reuse

New files/modules likely needed:
- `functions/src/meal/...`
- `app/functions/src/meal/...`
- new meal-domain tests under `tests/phase_m*.test.js`
- new docs/implementation contracts for each meal phase

Table/collection impact:
- extend existing store backbone with adjacent meal-domain collections
- create new meal-domain collections for ingredients/recipes/components/plans/preferences
- create new bridge collections for product-to-ingredient mapping and costing/conversion assumptions
- do not extend `canonical_products` into ingredient truth

## 9. Implementation Risks / Thrash Risks

- Highest risk: collapsing ingredients into `canonical_products`. That would mix purchasable retailer identity with culinary ingredient identity and create long-term ambiguity.
- High risk: forcing recipe ingest into the retailer ingest pipeline. Reuse the pattern, not the exact pipeline.
- High risk: skipping a unit/conversion foundation. Meal costing will thrash badly if conversions are improvised inside planning code.
- High risk: editing only one of `functions/src` or `app/functions/src`.
- Medium risk: over-modeling techniques/states/components before ingredient-product costing works.
- Medium risk: introducing generalized localization infrastructure before the repo has a clear central consumer for it.
- Medium risk: trying to persist everything through Data Connect right now. Repo truth says Firestore-compatible flat collections are the live contract today.

## 10. Recommended Phasing

1. Phase M0: shared foundations
   Deliver localization conventions, confidence/provenance conventions, unit vocabulary, store-shape extensions, and dual-runtime scaffolding.
2. Phase M1: ingredient foundation
   Deliver ingredient families/categories/ingredients plus product-to-ingredient bridge mappings and deterministic conversion primitives.
3. Phase M2: recipe and component ingest
   Deliver recipe/component schemas, ingest pipeline, validation, enrichment cache, and review-safe rich metadata capture.
4. Phase M3: costing bridge
   Deliver ingredient pricing projections, recipe costing, fallback provenance, and plan-ready shopping normalization.
5. Phase M4: deterministic planning
   Deliver user preferences, household constraints, candidate scoring, and weekly assembly.
6. Phase M5: shopping/basket integration
   Deliver plan-to-basket translation and API outputs that reuse existing product/basket layers.
7. Phase M6: preference feedback
   Deliver actual taste/acceptance signals once plan generation exists.

## 11. Exact Next Steps

The next artifacts that should be created before implementation starts:
- a cleanup pass on `docs/PHASE_A_RECIPE_INSPECT.md` to remove duplicate blocks and encoding issues
- a Phase M0 implementation contract grounded in this report
- a concrete store-extension proposal listing new meal and bridge collections for `functions/src/phase1/store.js`
- a product-to-ingredient bridge contract
- a unit and conversion contract with explicit runtime-safe v1 scope
- a meal-domain proposal template for future phases

The next exact files most likely touched first:
- `docs/implementation/PHASE_M0_MEAL_FOUNDATIONS.md` (new)
- `functions/src/phase1/store.js`
- `app/functions/src/phase1/store.js`
- `docs/DATA_MODEL.md`
- `docs/ARCHITECTURE.md`

## 12. Standing Mandate Recommendation

The food/meal domain should own:
- canonical ingredient truth
- recipes, components, culinary metadata
- ingredient-specific conversions and edible/purchase assumptions
- deterministic meal-planning logic
- shopping-list generation from recipe plans

It should not own:
- retailer product identity
- canonical product truth
- raw price ingestion
- product query matching
- core basket/store optimization primitives
- generic monetization/auth concerns

It should expose back to Pricer:
- ingredient demand normalized into purchasable units
- recipe and plan cost projections with provenance
- product candidate requests for basket optimization
- search/display alias content following shared conventions

## 13. Future Proposal Template

Every future meal-domain proposal should include:
1. Objective
2. Repo-truth basis with exact file references
3. New vs reused collections/modules
4. Shared vs domain-local vs bridge boundary map
5. Schema/contracts
6. Migration/store-shape plan
7. Ingest/runtime/API plan
8. Tests and verification
9. Risks, rollback, and what stays deferred
10. Phase sequencing and operator impact

## 14. Expected Result Shape For Current Repo

- The repo is ready for a clean ingredient foundation only if that foundation is added adjacent to, not inside, current product truth.
- Recipe ingest can fit existing patterns conceptually, but not by reusing the same pipeline directly.
- Basket/pricing maturity is good enough to support later meal costing once ingredient mapping and conversions exist.
- Easy wins:
  - additive meal-domain collections
  - reuse of enrichment validation and reader layering
  - reuse of basket endpoint shape for later bridge outputs
- Major groundwork:
  - ingredient/product bridge
  - conversion system
  - recipe schema and ingest
  - user/household preference model
- Schema-ready but later activation:
  - techniques
  - prep states
  - buy-vs-make components
  - deep preference learning
