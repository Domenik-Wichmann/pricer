# PRICER × MEAL INTELLIGENCE

## Repo Inspection + Implementation Proposal for Codex

### Purpose

You are reviewing the **actual repository truth** for Pricer and producing an implementation-ready plan for integrating a **rich, deterministic, multilingual meal intelligence system** into the central Pricer ecosystem.

This is **not** a bolt-on toy feature and **not** a separate silo.
The goal is to combine:

* **Pricer’s canonical product / price / retailer / basket intelligence**
* with a new **canonical ingredient / recipe / meal-planning intelligence layer**

into one coherent platform.

The new food/meal layer should be treated as **co-equal infrastructure**, not an afterthought. It should integrate from the ground up with the existing architecture and conventions where appropriate, while adding new foundational concepts where they do not yet exist.

---

# 1. WHAT WE ARE BUILDING

We are building a **price-aware, deterministic, multilingual food intelligence system** for Bulgaria-first users.

At a high level, the system should support:

* canonical food/ingredient intelligence
* multilingual Bulgarian + English naming / aliasing
* structured recipe ingest with rich LLM enrichment
* deterministic meal planning under constraints
* shopping list generation
* basket/store cost estimation
* future support for substitutions, pantry, leftovers, and deeper culinary reasoning

This system must be able to answer questions like:

* What should I cook this week within budget?
* Which recipes fit my tastes and allergies?
* What ingredients do I need?
* Which store or basket is cheapest?
* What is on sale that fits my plan?
* Should I buy or make a component like salsa?

---

# 2. CORE PRODUCT PHILOSOPHY

## A. Deterministic runtime

Runtime planning should be deterministic and inspectable.

No runtime “freestyle AI planning.”

The runtime engine should operate on:

* canonical IDs
* structured recipe/ingredient data
* price data
* explicit constraints
* scored heuristics / deterministic rules

## B. Rich ingest-time AI

AI should be used at ingest time to:

* parse recipes into structure
* enrich ingredients
* infer culinary traits
* identify components
* generate soft metadata with confidence
* produce dense structured data for later deterministic use

## C. Rich schema, conservative activation

We want a **rich future-facing schema** even if v1 only uses a safe subset.

Rule:

* capture richly at ingest
* tag confidence/provenance
* use conservatively at runtime at first

---

# 3. CENTRAL CHAIN OF THE SYSTEM

This is the backbone that should guide the architecture:

**product -> ingredient -> recipe -> plan -> basket**

This order matters.

The existing repo likely already covers parts of:

* product
* price
* retailer
* basket / canonical product mapping

The new work must define and connect:

* ingredient
* recipe
* planning
* shopping list / food basket logic

---

# 4. WHAT THIS REVIEW MUST DETERMINE

You must inspect the repo and determine, with repo-truth precision:

## Existing truth

1. What already exists that can be reused directly?
2. What exists partially and should be extended?
3. What is missing entirely?
4. What architectural patterns already exist and should be mirrored?
5. What naming / schema / storage / service conventions should this follow?

## Integration truth

6. Where should canonical ingredient logic live relative to canonical product logic?
7. How should product-to-ingredient mapping be represented?
8. How should recipe ingest fit into existing ingest patterns?
9. Where should deterministic planning logic live?
10. What existing APIs, DB schemas, jobs, services, or modules should this plug into?

## Constraint truth

11. What technical constraints in the repo affect implementation?
12. What conventions or boundaries must be preserved?
13. What data contracts already exist that this must not break?
14. What should remain parallel, and what should be unified?

---

# 5. BIG DESIGN REQUIREMENTS

## 5.1 Multilingual from day one

Minimum supported languages:

* Bulgarian
* English

System design must leave room for future languages:

* German
* Dutch
* Spanish
* Turkish
* Russian
* Ukrainian
* others later

The runtime logic should be based on **language-neutral canonical IDs**, not human text.

Every important entity should support at minimum:

* `name_bg`
* `name_en`
* `aliases_bg[]`
* `aliases_en[]`

And ideally be designed for a generalized localization shape later.

## 5.2 Canonical IDs, not text

Do not make Bulgarian or English the canonical logic language.

The canonical core should be based on stable IDs such as:

* `ingredient_*`
* `ingredient_family_*`
* `ingredient_category_*`
* `component_*`
* `recipe_*`
* `trait_*`
* `technique_*`
* `state_*`

## 5.3 Rich schema

We want a richer schema than MVP strictly needs.

Because recipes and ingredients will already be run through LLM enrichment, the system should capture broad structured knowledge even if only part is activated in v1.

## 5.4 Confidence / provenance

Any soft or inferred fields produced by LLM enrichment must include quality metadata, such as:

* source type
* field confidence
* runtime-safe eligibility
* provenance hints if practical

## 5.5 Deterministic scoring + planning

Meal planning must be deterministic:

* recipe scoring
* constraint filtering
* weekly selection
* basket estimation
* overlap/reuse logic

---

# 6. CONCEPTUAL DOMAIN MODEL TO INTRODUCE OR VERIFY

You must evaluate how well the repo can support the following canonical layers.

## 6.1 Product layer

Already partially present in Pricer:

* retailer products
* canonical product identity
* prices
* promo pricing
* basket/store optimization

Inspect how this currently works.

## 6.2 Ingredient layer

Likely missing or immature.

This layer must be introduced and should include:

* ingredient families
* ingredient categories
* canonical ingredients
* localized names/aliases
* purchase/use properties
* culinary properties
* mappings from canonical products to ingredients

## 6.3 Component layer

Composite food elements that are not atomic ingredients but are not full recipes either.

Examples:

* salsa
* pesto
* broth
* marinade
* dressing
* sauce

Need to determine how best to model these relative to ingredients and recipes.

## 6.4 Recipe layer

Structured recipe entities with:

* ingredients
* quantities
* units
* components
* techniques
* traits
* allergens
* timings
* metadata

## 6.5 Planning layer

Entities/contracts for:

* user profile
* household profile
* constraints
* recipe score
* weekly plan
* shopping list
* basket option

---

# 7. RICH CANONICAL INGREDIENT SCHEMA: TARGET SPEC

You must review repo fit and propose exact implementation for a rich canonical ingredient schema.

Below is the desired target concept.

## 7.1 Core identity

Each ingredient should support:

* `id`
* `entity_type`
* `status`
* `name_bg`
* `name_en`
* `aliases_bg[]`
* `aliases_en[]`
* optional later generalized localization model
* `ingredient_family_id`
* `ingredient_category_id`
* `default_edible_unit`
* `default_purchase_basis_unit`
* optional slug/search helpers

## 7.2 Classification

We want the schema to support fields like:

* food group
* botanical type
* primary culinary role(s)
* secondary culinary role(s)
* cuisine relevance
* macro class roughness (protein/fat/carb orientation)
* staple flag
* commonness in Bulgaria

## 7.3 Physical properties

Potentially:

* typical states
* water content level
* density/softening behavior
* peelable
* seeded
* bone present
* freezable
* trim/waste patterns
* structure level

## 7.4 Flavor profile

Numeric, structured, not poetic:

* sweet
* sour
* bitter
* salty
* umami
* richness
* freshness
* earthiness
* herbaceousness
* smokiness
* spice_heat
* aromatic_intensity

## 7.5 Texture profile

Numeric:

* crisp
* crunchy
* juicy
* creamy
* fibrous
* chewy
* soft
* dense
* saucy_when_processed
* brothy_contribution
* etc.

## 7.6 Culinary behavior

Examples:

* can_be_eaten_raw
* can_be_roasted
* can_be_boiled
* can_be_fried
* can_be_grilled
* can_be_pickled
* can_be_pureed
* can_form_sauce_base
* commonly_used_as_garnish
* commonly_used_as_main_component
* commonly_used_as_supporting_component

## 7.7 Preparation metadata

Examples:

* common cut types
* washing needed
* peeling needed/optional
* de-seeding needed/optional
* prep time estimate
* waste factor estimate

## 7.8 State transitions

The schema should be future-ready for transitions such as:

* raw -> chopped_raw via chop
* raw -> roasted via roast
* raw -> sauce via cook_and_puree
* dry -> rehydrated via soak
* etc.

This may not be used heavily in v1 runtime, but we want schema room.

## 7.9 Purchase/pricing relevance

This is crucial:

* common purchase units
* common packaging
* edible yield ratio
* typical piece weight
* price comparison basis unit
* assumed availability level
* staple flag
* purchasable vs edible conversion support

## 7.10 Storage / perishability

Potential fields:

* room temp ok
* refrigeration recommended
* freezer ok
* perishability level
* opened life estimate
* storage sensitivity

## 7.11 Nutrition roughness

Rough planning-friendly fields only, not pseudo-scientific overprecision:

* protein level
* fat level
* carb level
* fiber level
* calorie density
* satiety level

## 7.12 Dietary flags

* contains dairy
* contains gluten
* contains nuts
* vegan
* vegetarian
* halal friendly
* kosher friendly
* etc., where meaningful

## 7.13 Relationships

* substitutes_with
* pairs_well_with
* often_part_of_components
* related ingredients
* broader/narrower parent-child relationships

## 7.14 Cultural context

* common in Bulgaria
* traditional Bulgarian usage level
* cuisine associations
* expat/foreigner comprehension notes if desired later

## 7.15 Semantic / experiential traits

Soft layer only, confidence-tagged:

* comforting
* refreshing
* rustic
* elegant
* kid_friendly
* seasonal associations
* indulgent
* etc.

## 7.16 Quality metadata

Every rich object should support:

* source_type
* enrichment_source
* overall_confidence
* field_confidence
* runtime_safe_fields
* notes / provenance if practical

---

# 8. RICH RECIPE SCHEMA: TARGET SPEC

You must inspect how best to implement a structured recipe schema compatible with Pricer.

## 8.1 Core recipe identity

* `recipe_id`
* `name_bg`
* `name_en`
* `aliases_bg[]`
* `aliases_en[]`
* `summary_bg`
* `summary_en`
* `status`
* `servings`
* `time_prep_minutes`
* `time_cook_minutes`
* `time_total_minutes`
* `difficulty`
* `meal_type`
* `cuisine_tags`
* `equipment_required`
* `weekday_friendly`
* `batch_friendly`
* etc.

## 8.2 Recipe ingredients

Each recipe ingredient line should support:

* canonical ingredient id
* raw ingredient text (source truth)
* quantity
* unit
* optional flag
* garnish flag
* role in recipe
* prep state
* notes
* substitution group if applicable

## 8.3 Components

Need support for recipe components such as salsa/sauce/dressing/etc.

Each component reference may need:

* component id
* quantity
* unit
* can_be_store_bought
* can_be_homemade
* linked subrecipe ids
* preferred default mode

## 8.4 Instructions / steps

Need a structured approach if practical:

* ordered steps
* step timings
* ingredients used in step
* techniques used
* state transitions caused
* equipment used

## 8.5 Flavor / texture / experiential metadata

Recipes should support numeric or structured tags such as:

* flavor vector
* texture vector
* richness
* freshness
* comfort score
* indulgence
* effort
* cost roughness
* family-friendliness
* etc.

## 8.6 Practicality metadata

* cheap/medium/premium roughness
* pantry reliance
* leftovers friendliness
* freezer friendliness
* ingredient overlap friendliness
* weeknight suitability
* cleanup burden
* one-pan / low effort tags

## 8.7 Dietary / allergen fields

* allergens
* vegetarian
* vegan
* gluten-free
* dairy-free
* pork-free
* nut-free
* etc.

## 8.8 Quality metadata

As with ingredients:

* source_type
* structured_by_llm
* confidence
* runtime_safe_fields
* review status if present

---

# 9. COMPONENT MODEL: TARGET SPEC

We want a middle layer between ingredients and recipes.

Codex must determine how best to implement this in the repo.

A component is something like:

* salsa
* pesto
* sauce
* broth
* dressing
* rub
* stock
* dough
* filling

Potential fields:

* id
* localized names
* aliases
* component type
* canonical ingredient composition if known
* can_be_store_bought
* can_be_homemade
* linked recipes
* price comparison policy
* common usage
* flavor / texture / storage roughness

The system should eventually support “buy vs make” behavior.

For MVP, it may be enough to support:

* component identification
* recipe linkage
* future-ready modeling

---

# 10. TECHNIQUE MODEL: TARGET SPEC

We want a structured technique layer if practical.

Examples:

* roast
* fry
* saute
* simmer
* boil
* grill
* bake
* pickle
* marinate
* puree
* blend

Potential fields:

* technique id
* localized names + aliases
* dry_heat / wet_heat / mixed
* browning potential
* softening effect
* common ingredient classes
* required equipment classes
* time intensity
* cleanup burden
* flavor impact patterns

This may be used later for deeper culinary intelligence, but the schema should be planned now.

---

# 11. STATE MODEL / TRANSFORMATIONS: TARGET SPEC

We want future-ready support for state transitions, though this may remain lightly used in v1.

Examples:

* raw onion
* diced onion
* sauteed onion
* caramelized onion
* tomato sauce
* soaked beans
* boiled potato
* grilled chicken

Need to assess whether the repo should model:

* explicit state entities
* or lighter structured step/state annotations

You must recommend the best implementation level for now.

---

# 12. UNIT + CONVERSION MODEL: CRITICAL FOUNDATION

This is one of the most important parts of the entire design.

We need a clear implementation plan for:

## 12.1 Recipe units

Units used in recipe requirements:

* g
* kg
* ml
* l
* piece
* clove
* bunch
* tbsp/tsp if supported
* cup only if tolerated
* pinch / to taste handling policy

## 12.2 Purchase units

Units used in real store products:

* per kg
* pack
* bottle
* jar
* tray
* piece
* dozen
* etc.

## 12.3 Conversion logic

Need deterministic support for converting:

* recipe requirement -> pricing/comparison basis
* edible quantity -> purchase quantity
* piece -> grams where ingredient-specific
* pack -> usable amount
* waste/trim/yield adjustments where relevant

## 12.4 Required inspection questions

Determine:

* what unit normalization already exists in repo
* what can be reused
* what new conversion tables/models are required
* where this logic should live
* how this integrates with pricing/basket logic

---

# 13. PRODUCT -> INGREDIENT MAPPING

This is one of the hardest and most important integration areas.

We need a strong inspection of how a retailer product should map to canonical ingredients.

Examples:

* raw retailer product names in Bulgarian
* branded products
* products that are exact ingredients
* products that are broader categories
* processed items
* ambiguous products
* prepared foods that are not appropriate ingredient matches

Need a proposed model for:

* exact ingredient mapping
* broader family/category mapping
* confidence scores
* deterministic markers/rules
* adjudication/warning queue reuse if applicable
* source truth preservation
* conflict handling

Determine whether existing canonical product pipeline patterns can be mirrored or extended.

---

# 14. PRICE FALLBACK LADDER

Need formal implementation proposal for missing price data handling.

Desired fallback ladder:

1. direct local store price
2. other local retailer price
3. national average price
4. ingredient/category estimate

Codex must inspect:

* whether any of this already exists
* what data sources/schema could support it
* how to represent fallback provenance
* how to expose confidence / estimate type downstream

---

# 15. USER + HOUSEHOLD MODEL

Need proposed implementation for:

## User-level

* taste profile
* dislikes
* allergies
* diet restrictions
* preferred cuisines
* effort tolerance
* budget sensitivity
* repeated behavior signals

## Household-level

* shared plan context
* pantry assumptions
* household size
* budget
* shared exclusions/preferences
* preferred stores
* default basket mode

Need to inspect whether current auth/user/profile structures can support this or if new tables/services are needed.

---

# 16. PREFERENCE SIGNAL MODEL

Need proposal for preference acquisition and storage.

Potential inputs:

* swipe likes/dislikes on recipes
* acceptance/rejection of generated plans
* recipe replacements
* ingredient deletions
* actual shopping/basket behavior
* convenience vs price behavior
* homemade vs buy choices

Need to recommend:

* what to store now
* what to defer
* what deterministic scoring should consume in v1

---

# 17. DETERMINISTIC PLANNING ENGINE: TARGET CAPABILITIES

This should live as a backend planning service/module, not inside canonical ingest.

Need to inspect best fit.

## Stage 1: Candidate scoring

Each recipe should be scored against:

* allergy/exclusion safety
* ingredient availability
* observed price confidence
* preference fit
* flavor fit
* effort/time fit
* store relevance
* practical fit

## Stage 2: Weekly assembly

Build a weekly set under constraints:

* budget
* recipe count / meal count
* low repetition
* protein/category variety
* overlap efficiency
* pantry efficiency
* sale opportunities
* preferred store mode if relevant

Need a recommendation for how the service should be structured and what v1 should include.

---

# 18. SHOPPING LIST + BASKET OUTPUT MODEL

Need a formal output contract for:

* selected recipes
* total estimated cost
* merged ingredient list
* normalized required quantities
* purchase quantities
* chosen products
* fallback provenance
* basket options

Must support future modes like:

* cheapest overall
* single-store
* preferred-store
* maybe convenience mode later

Need repo-fit recommendation for:

* output format
* endpoint/service location
* reuse of basket optimization logic

---

# 19. MULTILINGUAL MODEL: REQUIRED FORMALIZATION

Need repo-truth assessment and recommendation for a reusable multilingual model.

At minimum for food entities:

* `name_bg`
* `name_en`
* `aliases_bg[]`
* `aliases_en[]`

Need recommendation whether to:

* start with explicit bg/en columns
* or introduce a more general localization table/json structure now

Need to balance:

* pragmatic MVP
* future language expansion
* search performance
* data management simplicity

---

# 20. INGEST MODEL FOR RECIPES + FOOD ENTITIES

Need an implementation proposal for how recipe/ingredient/component enrichment should work.

Desired ingest pattern:

* deterministic baseline structure
* LLM enrichment
* cached output
* explicit review/validation where needed
* no runtime AI dependency

Need to inspect existing ingest patterns and recommend whether this should mirror:

* pipeline structure
* queue/job pattern
* artifact storage pattern
* confidence/review conventions
* test/validation style

---

# 21. WHAT MUST BE INSPECTED IN THE REPO

You must inspect the repo thoroughly and report repo truth on all relevant parts, including but not limited to:

## Data model / DB / migrations

* canonical product tables
* mapping tables
* retailer product schemas
* price schemas
* localization/multilingual fields
* basket/store optimization data
* user/profile tables
* preference-related tables if any
* current migration patterns

## Backend services / modules

* ingest pipeline
* canonicalization pipeline
* adjudication/warning queue logic
* pricing / basket services
* search services
* planner-like services if any
* API layer patterns

## Contracts / DTOs / schemas

* existing canonical contracts
* entity schemas
* response formats
* validation rules

## Tests / trust / verification

* current test conventions
* trust/verification commands
* patterns for introducing new deterministic modules safely

## Naming / architecture

* where equivalent central domain logic currently lives
* whether a new top-level domain area is appropriate
* whether existing central abstractions should be extended instead

---

# 22. WHAT YOU MUST PRODUCE

Your response must be a **repo-truth implementation inspection**, not generic advice.

## Deliverable A — Current-state analysis

Describe:

* what exists now
* what can be reused
* what partially exists
* what is missing
* what conflicts with the target design

## Deliverable B — Recommended architecture

Propose:

* where each new concept should live
* what should be added
* what should be extended
* what should be kept separate
* what should be unified

## Deliverable C — Concrete schema proposal

Provide implementation-ready recommendations for:

1. canonical ingredient schema
2. recipe schema
3. component schema
4. unit/conversion schema
5. planning constraints schema
6. shopping/basket output schema
7. multilingual/localization strategy

## Deliverable D — Integration plan

Explain how to connect:

* products to ingredients
* ingredients to recipes
* recipes to plans
* plans to baskets
* multilingual names to search/display
* ingest to deterministic runtime

## Deliverable E — Risks / unknowns

Identify:

* repo gaps
* design risks
* potential thrash points
* where manual review is needed
* where v1 should stay conservative

## Deliverable F — Implementation phases

Recommend phased implementation, likely something like:

* Phase M1: canonical ingredient foundation
* Phase M2: recipe ingest + schemas
* Phase M3: deterministic planning engine
* Phase M4: shopping/basket integration
* Phase M5: preference engine

Adjust if repo truth suggests better sequencing.

## Deliverable G — Exact next actions

List the exact artifacts/files/tables/services that should be designed or created next.

---

# 23. IMPORTANT IMPLEMENTATION BIASES

Please keep these biases in mind while reviewing and proposing:

## Bias 1 — Deterministic core

Do not push runtime generative AI.

## Bias 2 — Rich schema, narrow activation

It is okay to store more than v1 uses.

## Bias 3 — Preserve source truth

Raw source data should remain traceable.

## Bias 4 — Strong mapping layer

Do not collapse product and ingredient into one concept.

## Bias 5 — Equal centrality

Do not treat this as a side plugin. Treat it as a central domain expansion of Pricer.

## Bias 6 — Bulgaria-first, multilingual-ready

Prioritize Bulgarian + English now, but do not box us in.

## Bias 7 — Conservative v1

Avoid overbuilding recursive state/component logic if repo truth suggests simpler v1 scaffolding.

---

# 24. SPECIFIC QUESTIONS YOU MUST ANSWER

Please answer these explicitly based on repo truth:

1. Where should canonical ingredient entities live in the current architecture?
2. Should ingredient canonicalization mirror the product canonicalization pipeline, or be modeled differently?
3. What existing DB schemas/tables can be extended versus what must be newly introduced?
4. What multilingual/localization model best fits the repo as it exists today?
5. What existing unit normalization logic can be reused for food/meal use cases?
6. What is the cleanest way to represent product -> ingredient mapping?
7. What is the cleanest way to represent components?
8. Should techniques/states be first-class tables now or lighter structured metadata first?
9. Where should deterministic planning logic live?
10. What should the v1 runtime-safe subset of the rich schema be?
11. What should be implemented first to minimize thrash?
12. What repo constraints or patterns make parts of this plan easier or harder?

---

# 25. RESPONSE FORMAT REQUIRED

Structure your answer like this:

## 1. Repo Truth Summary

## 2. Existing Assets to Reuse

## 3. Missing Foundations

## 4. Recommended Architecture

## 5. Proposed Schemas

## 6. Integration Points

## 7. Risks / Open Questions

## 8. Recommended Phasing

## 9. Exact Next Steps

Be specific.
Ground everything in actual repo findings.
Prefer concrete file/module/table references wherever possible.

---

# 26. FINAL GOAL

We are trying to evolve Pricer into a system where:

* price/product intelligence
* ingredient intelligence
* recipe intelligence
* meal-planning intelligence
* basket/store intelligence

all work together as one coherent ecosystem.

Your task is to inspect the repo truth and tell us exactly how to do that cleanly, safely, and in a way that preserves long-term architectural coherence.


# PRICER × MEAL INTELLIGENCE

## Repo Inspection + Implementation Proposal for Codex

### Purpose

You are reviewing the **actual repository truth** for Pricer and producing an implementation-ready plan for integrating a **rich, deterministic, multilingual meal intelligence system** into the central Pricer ecosystem.

This is **not** a bolt-on toy feature and **not** a separate silo.
The goal is to combine:

* **Pricer’s canonical product / price / retailer / basket intelligence**
* with a new **canonical ingredient / recipe / meal-planning intelligence layer**

into one coherent platform.

The new food/meal layer should be treated as **co-equal infrastructure**, not an afterthought. It should integrate from the ground up with the existing architecture and conventions where appropriate, while adding new foundational concepts where they do not yet exist.

At the same time, this work must be kept **as modular and separable as possible**. We want **tight integration through well-defined shared contracts**, not tangled coupling.

Your job is to determine, from repo truth:

* what should be shared
* what should remain domain-local
* where boundaries should live
* how this should be implemented without contaminating unrelated parts of the system

---

# 1. WHAT WE ARE BUILDING

We are building a **price-aware, deterministic, multilingual food intelligence system** for Bulgaria-first users.

At a high level, the system should support:

* canonical food/ingredient intelligence
* multilingual Bulgarian + English naming / aliasing
* structured recipe ingest with rich LLM enrichment
* deterministic meal planning under constraints
* shopping list generation
* basket/store cost estimation
* future support for substitutions, pantry, leftovers, and deeper culinary reasoning

This system must be able to answer questions like:

* What should I cook this week within budget?
* Which recipes fit my tastes and allergies?
* What ingredients do I need?
* Which store or basket is cheapest?
* What is on sale that fits my plan?
* Should I buy or make a component like salsa?

---

# 2. CORE PRODUCT PHILOSOPHY

## A. Deterministic runtime

Runtime planning should be deterministic and inspectable.

No runtime “freestyle AI planning.”

The runtime engine should operate on:

* canonical IDs
* structured recipe/ingredient data
* price data
* explicit constraints
* scored heuristics / deterministic rules

## B. Rich ingest-time AI

AI should be used at ingest time to:

* parse recipes into structure
* enrich ingredients
* infer culinary traits
* identify components
* generate soft metadata with confidence
* produce dense structured data for later deterministic use

## C. Rich schema, conservative activation

We want a **rich future-facing schema** even if v1 only uses a safe subset.

Rule:

* capture richly at ingest
* tag confidence/provenance
* use conservatively at runtime at first

## D. Shared contracts, isolated internals

Integration should happen through **shared canonical contracts and services**, not by collapsing all logic into one mixed blob.

We want:

* shared identity where necessary
* shared pricing/basket interfaces where appropriate
* domain-local recipe/planning internals where practical
* minimal repo-wide churn unless justified

---

# 3. CENTRAL CHAIN OF THE SYSTEM

This is the backbone that should guide the architecture:

**product -> ingredient -> recipe -> plan -> basket**

This order matters.

The existing repo likely already covers parts of:

* product
* price
* retailer
* basket / canonical product mapping

The new work must define and connect:

* ingredient
* recipe
* planning
* shopping list / food basket logic

---

# 4. WHAT THIS REVIEW MUST DETERMINE

You must inspect the repo and determine, with repo-truth precision:

## Existing truth

1. What already exists that can be reused directly?
2. What exists partially and should be extended?
3. What is missing entirely?
4. What architectural patterns already exist and should be mirrored?
5. What naming / schema / storage / service conventions should this follow?

## Integration truth

6. Where should canonical ingredient logic live relative to canonical product logic?
7. How should product-to-ingredient mapping be represented?
8. How should recipe ingest fit into existing ingest patterns?
9. Where should deterministic planning logic live?
10. What existing APIs, DB schemas, jobs, services, or modules should this plug into?

## Boundary truth

11. What should be **shared infrastructure** versus **meal-domain-only infrastructure**?
12. Which files/modules/tables should be extended versus which should remain untouched?
13. What coupling risks exist?
14. What seams/interfaces should be introduced to keep this separable?
15. What parts should remain replaceable in the future?

## Constraint truth

16. What technical constraints in the repo affect implementation?
17. What conventions or boundaries must be preserved?
18. What data contracts already exist that this must not break?
19. What should remain parallel, and what should be unified?

---

# 5. BIG DESIGN REQUIREMENTS

## 5.1 Multilingual from day one

Minimum supported languages:

* Bulgarian
* English

System design must leave room for future languages:

* German
* Dutch
* Spanish
* Turkish
* Russian
* Ukrainian
* others later

The runtime logic should be based on **language-neutral canonical IDs**, not human text.

Every important entity should support at minimum:

* `name_bg`
* `name_en`
* `aliases_bg[]`
* `aliases_en[]`

And ideally be designed for a generalized localization shape later.

## 5.2 Canonical IDs, not text

Do not make Bulgarian or English the canonical logic language.

The canonical core should be based on stable IDs such as:

* `ingredient_*`
* `ingredient_family_*`
* `ingredient_category_*`
* `component_*`
* `recipe_*`
* `trait_*`
* `technique_*`
* `state_*`

## 5.3 Rich schema

We want a richer schema than MVP strictly needs.

Because recipes and ingredients will already be run through LLM enrichment, the system should capture broad structured knowledge even if only part is activated in v1.

## 5.4 Confidence / provenance

Any soft or inferred fields produced by LLM enrichment must include quality metadata, such as:

* source type
* field confidence
* runtime-safe eligibility
* provenance hints if practical

## 5.5 Deterministic scoring + planning

Meal planning must be deterministic:

* recipe scoring
* constraint filtering
* weekly selection
* basket estimation
* overlap/reuse logic

## 5.6 Minimal necessary sharing

This system should share only what truly needs to be shared:

* canonical identity contracts where appropriate
* price/basket interfaces where appropriate
* maybe localization conventions
* maybe common unit/normalization primitives if justified

But it should avoid unnecessary entanglement:

* recipe ingest should not be forced into unrelated ingest flows if not appropriate
* planning logic should not pollute product canonicalization logic
* food semantics should not be jammed into generic product tables unless repo truth strongly supports that

---

# 6. CONCEPTUAL DOMAIN MODEL TO INTRODUCE OR VERIFY

You must evaluate how well the repo can support the following canonical layers.

## 6.1 Product layer

Already partially present in Pricer:

* retailer products
* canonical product identity
* prices
* promo pricing
* basket/store optimization

Inspect how this currently works.

## 6.2 Ingredient layer

Likely missing or immature.

This layer must be introduced and should include:

* ingredient families
* ingredient categories
* canonical ingredients
* localized names/aliases
* purchase/use properties
* culinary properties
* mappings from canonical products to ingredients

## 6.3 Component layer

Composite food elements that are not atomic ingredients but are not full recipes either.

Examples:

* salsa
* pesto
* broth
* marinade
* dressing
* sauce

Need to determine how best to model these relative to ingredients and recipes.

## 6.4 Recipe layer

Structured recipe entities with:

* ingredients
* quantities
* units
* components
* techniques
* traits
* allergens
* timings
* metadata

## 6.5 Planning layer

Entities/contracts for:

* user profile
* household profile
* constraints
* recipe score
* weekly plan
* shopping list
* basket option

---

# 7. RICH CANONICAL INGREDIENT SCHEMA: TARGET SPEC

You must review repo fit and propose exact implementation for a rich canonical ingredient schema.

Below is the desired target concept.

## 7.1 Core identity

Each ingredient should support:

* `id`
* `entity_type`
* `status`
* `name_bg`
* `name_en`
* `aliases_bg[]`
* `aliases_en[]`
* optional later generalized localization model
* `ingredient_family_id`
* `ingredient_category_id`
* `default_edible_unit`
* `default_purchase_basis_unit`
* optional slug/search helpers

## 7.2 Classification

We want the schema to support fields like:

* food group
* botanical type
* primary culinary role(s)
* secondary culinary role(s)
* cuisine relevance
* macro class roughness (protein/fat/carb orientation)
* staple flag
* commonness in Bulgaria

## 7.3 Physical properties

Potentially:

* typical states
* water content level
* density/softening behavior
* peelable
* seeded
* bone present
* freezable
* trim/waste patterns
* structure level

## 7.4 Flavor profile

Numeric, structured, not poetic:

* sweet
* sour
* bitter
* salty
* umami
* richness
* freshness
* earthiness
* herbaceousness
* smokiness
* spice_heat
* aromatic_intensity

## 7.5 Texture profile

Numeric:

* crisp
* crunchy
* juicy
* creamy
* fibrous
* chewy
* soft
* dense
* saucy_when_processed
* brothy_contribution
* etc.

## 7.6 Culinary behavior

Examples:

* can_be_eaten_raw
* can_be_roasted
* can_be_boiled
* can_be_fried
* can_be_grilled
* can_be_pickled
* can_be_pureed
* can_form_sauce_base
* commonly_used_as_garnish
* commonly_used_as_main_component
* commonly_used_as_supporting_component

## 7.7 Preparation metadata

Examples:

* common cut types
* washing needed
* peeling needed/optional
* de-seeding needed/optional
* prep time estimate
* waste factor estimate

## 7.8 State transitions

The schema should be future-ready for transitions such as:

* raw -> chopped_raw via chop
* raw -> roasted via roast
* raw -> sauce via cook_and_puree
* dry -> rehydrated via soak
* etc.

This may not be used heavily in v1 runtime, but we want schema room.

## 7.9 Purchase/pricing relevance

This is crucial:

* common purchase units
* common packaging
* edible yield ratio
* typical piece weight
* price comparison basis unit
* assumed availability level
* staple flag
* purchasable vs edible conversion support

## 7.10 Storage / perishability

Potential fields:

* room temp ok
* refrigeration recommended
* freezer ok
* perishability level
* opened life estimate
* storage sensitivity

## 7.11 Nutrition roughness

Rough planning-friendly fields only, not pseudo-scientific overprecision:

* protein level
* fat level
* carb level
* fiber level
* calorie density
* satiety level

## 7.12 Dietary flags

* contains dairy
* contains gluten
* contains nuts
* vegan
* vegetarian
* halal friendly
* kosher friendly
* etc., where meaningful

## 7.13 Relationships

* substitutes_with
* pairs_well_with
* often_part_of_components
* related ingredients
* broader/narrower parent-child relationships

## 7.14 Cultural context

* common in Bulgaria
* traditional Bulgarian usage level
* cuisine associations
* expat/foreigner comprehension notes if desired later

## 7.15 Semantic / experiential traits

Soft layer only, confidence-tagged:

* comforting
* refreshing
* rustic
* elegant
* kid_friendly
* seasonal associations
* indulgent
* etc.

## 7.16 Quality metadata

Every rich object should support:

* source_type
* enrichment_source
* overall_confidence
* field_confidence
* runtime_safe_fields
* notes / provenance if practical

---

# 8. RICH RECIPE SCHEMA: TARGET SPEC

You must inspect how best to implement a structured recipe schema compatible with Pricer.

## 8.1 Core recipe identity

* `recipe_id`
* `name_bg`
* `name_en`
* `aliases_bg[]`
* `aliases_en[]`
* `summary_bg`
* `summary_en`
* `status`
* `servings`
* `time_prep_minutes`
* `time_cook_minutes`
* `time_total_minutes`
* `difficulty`
* `meal_type`
* `cuisine_tags`
* `equipment_required`
* `weekday_friendly`
* `batch_friendly`
* etc.

## 8.2 Recipe ingredients

Each recipe ingredient line should support:

* canonical ingredient id
* raw ingredient text (source truth)
* quantity
* unit
* optional flag
* garnish flag
* role in recipe
* prep state
* notes
* substitution group if applicable

## 8.3 Components

Need support for recipe components such as salsa/sauce/dressing/etc.

Each component reference may need:

* component id
* quantity
* unit
* can_be_store_bought
* can_be_homemade
* linked subrecipe ids
* preferred default mode

## 8.4 Instructions / steps

Need a structured approach if practical:

* ordered steps
* step timings
* ingredients used in step
* techniques used
* state transitions caused
* equipment used

## 8.5 Flavor / texture / experiential metadata

Recipes should support numeric or structured tags such as:

* flavor vector
* texture vector
* richness
* freshness
* comfort score
* indulgence
* effort
* cost roughness
* family-friendliness
* etc.

## 8.6 Practicality metadata

* cheap/medium/premium roughness
* pantry reliance
* leftovers friendliness
* freezer friendliness
* ingredient overlap friendliness
* weeknight suitability
* cleanup burden
* one-pan / low effort tags

## 8.7 Dietary / allergen fields

* allergens
* vegetarian
* vegan
* gluten-free
* dairy-free
* pork-free
* nut-free
* etc.

## 8.8 Quality metadata

As with ingredients:

* source_type
* structured_by_llm
* confidence
* runtime_safe_fields
* review status if present

---

# 9. COMPONENT MODEL: TARGET SPEC

We want a middle layer between ingredients and recipes.

Codex must determine how best to implement this in the repo.

A component is something like:

* salsa
* pesto
* sauce
* broth
* dressing
* rub
* stock
* dough
* filling

Potential fields:

* id
* localized names
* aliases
* component type
* canonical ingredient composition if known
* can_be_store_bought
* can_be_homemade
* linked recipes
* price comparison policy
* common usage
* flavor / texture / storage roughness

The system should eventually support “buy vs make” behavior.

For MVP, it may be enough to support:

* component identification
* recipe linkage
* future-ready modeling

---

# 10. TECHNIQUE MODEL: TARGET SPEC

We want a structured technique layer if practical.

Examples:

* roast
* fry
* saute
* simmer
* boil
* grill
* bake
* pickle
* marinate
* puree
* blend

Potential fields:

* technique id
* localized names + aliases
* dry_heat / wet_heat / mixed
* browning potential
* softening effect
* common ingredient classes
* required equipment classes
* time intensity
* cleanup burden
* flavor impact patterns

This may be used later for deeper culinary intelligence, but the schema should be planned now.

---

# 11. STATE MODEL / TRANSFORMATIONS: TARGET SPEC

We want future-ready support for state transitions, though this may remain lightly used in v1.

Examples:

* raw onion
* diced onion
* sauteed onion
* caramelized onion
* tomato sauce
* soaked beans
* boiled potato
* grilled chicken

Need to assess whether the repo should model:

* explicit state entities
* or lighter structured step/state annotations

You must recommend the best implementation level for now.

---

# 12. UNIT + CONVERSION MODEL: CRITICAL FOUNDATION

This is one of the most important parts of the entire design.

We need a clear implementation plan for:

## 12.1 Recipe units

Units used in recipe requirements:

* g
* kg
* ml
* l
* piece
* clove
* bunch
* tbsp/tsp if supported
* cup only if tolerated
* pinch / to taste handling policy

## 12.2 Purchase units

Units used in real store products:

* per kg
* pack
* bottle
* jar
* tray
* piece
* dozen
* etc.

## 12.3 Conversion logic

Need deterministic support for converting:

* recipe requirement -> pricing/comparison basis
* edible quantity -> purchase quantity
* piece -> grams where ingredient-specific
* pack -> usable amount
* waste/trim/yield adjustments where relevant

## 12.4 Required inspection questions

Determine:

* what unit normalization already exists in repo
* what can be reused
* what new conversion tables/models are required
* where this logic should live
* how this integrates with pricing/basket logic

---

# 13. PRODUCT -> INGREDIENT MAPPING

This is one of the hardest and most important integration areas.

We need a strong inspection of how a retailer product should map to canonical ingredients.

Examples:

* raw retailer product names in Bulgarian
* branded products
* products that are exact ingredients
* products that are broader categories
* processed items
* ambiguous products
* prepared foods that are not appropriate ingredient matches

Need a proposed model for:

* exact ingredient mapping
* broader family/category mapping
* confidence scores
* deterministic markers/rules
* adjudication/warning queue reuse if applicable
* source truth preservation
* conflict handling

Determine whether existing canonical product pipeline patterns can be mirrored or extended.

---

# 14. PRICE FALLBACK LADDER

Need formal implementation proposal for missing price data handling.

Desired fallback ladder:

1. direct local store price
2. other local retailer price
3. national average price
4. ingredient/category estimate

Codex must inspect:

* whether any of this already exists
* what data sources/schema could support it
* how to represent fallback provenance
* how to expose confidence / estimate type downstream

---

# 15. USER + HOUSEHOLD MODEL

Need proposed implementation for:

## User-level

* taste profile
* dislikes
* allergies
* diet restrictions
* preferred cuisines
* effort tolerance
* budget sensitivity
* repeated behavior signals

## Household-level

* shared plan context
* pantry assumptions
* household size
* budget
* shared exclusions/preferences
* preferred stores
* default basket mode

Need to inspect whether current auth/user/profile structures can support this or if new tables/services are needed.

---

# 16. PREFERENCE SIGNAL MODEL

Need proposal for preference acquisition and storage.

Potential inputs:

* swipe likes/dislikes on recipes
* acceptance/rejection of generated plans
* recipe replacements
* ingredient deletions
* actual shopping/basket behavior
* convenience vs price behavior
* homemade vs buy choices

Need to recommend:

* what to store now
* what to defer
* what deterministic scoring should consume in v1

---

# 17. DETERMINISTIC PLANNING ENGINE: TARGET CAPABILITIES

This should live as a backend planning service/module, not inside canonical ingest.

Need to inspect best fit.

## Stage 1: Candidate scoring

Each recipe should be scored against:

* allergy/exclusion safety
* ingredient availability
* observed price confidence
* preference fit
* flavor fit
* effort/time fit
* store relevance
* practical fit

## Stage 2: Weekly assembly

Build a weekly set under constraints:

* budget
* recipe count / meal count
* low repetition
* protein/category variety
* overlap efficiency
* pantry efficiency
* sale opportunities
* preferred store mode if relevant

Need a recommendation for how the service should be structured and what v1 should include.

---

# 18. SHOPPING LIST + BASKET OUTPUT MODEL

Need a formal output contract for:

* selected recipes
* total estimated cost
* merged ingredient list
* normalized required quantities
* purchase quantities
* chosen products
* fallback provenance
* basket options

Must support future modes like:

* cheapest overall
* single-store
* preferred-store
* maybe convenience mode later

Need repo-fit recommendation for:

* output format
* endpoint/service location
* reuse of basket optimization logic

---

# 19. MULTILINGUAL MODEL: REQUIRED FORMALIZATION

Need repo-truth assessment and recommendation for a reusable multilingual model.

At minimum for food entities:

* `name_bg`
* `name_en`
* `aliases_bg[]`
* `aliases_en[]`

Need recommendation whether to:

* start with explicit bg/en columns
* or introduce a more general localization table/json structure now

Need to balance:

* pragmatic MVP
* future language expansion
* search performance
* data management simplicity

---

# 20. INGEST MODEL FOR RECIPES + FOOD ENTITIES

Need an implementation proposal for how recipe/ingredient/component enrichment should work.

Desired ingest pattern:

* deterministic baseline structure
* LLM enrichment
* cached output
* explicit review/validation where needed
* no runtime AI dependency

Need to inspect existing ingest patterns and recommend whether this should mirror:

* pipeline structure
* queue/job pattern
* artifact storage pattern
* confidence/review conventions
* test/validation style

---

# 21. SHARED VS DOMAIN-LOCAL: REQUIRED REPO BOUNDARY ANALYSIS

This section is mandatory.

You must explicitly classify proposed work into:

## A. Shared / central infrastructure

Things that should be shared with the broader Pricer ecosystem.

Examples might include:

* canonical identity primitives
* localization conventions
* generic unit normalization primitives
* common confidence/provenance shapes
* mapping/adjudication infrastructure
* basket pricing interfaces
* search alias conventions

## B. Meal-domain infrastructure

Things that should remain local to the meal/food domain unless future repo truth proves otherwise.

Examples might include:

* recipe schemas
* component semantics
* flavor/texture models
* meal-planning constraints
* weekly plan assembly logic
* pantry/leftover rules
* culinary techniques/states

## C. Bridge layer

Things that exist specifically to connect shared infrastructure to meal-domain infrastructure.

Examples:

* product -> ingredient mappings
* ingredient pricing projections
* recipe ingredient costing services
* basket translation logic for meal plans

For each major concept, you must say:

* shared
* domain-local
* bridge
  and justify why.

---

# 22. FILE / MODULE / TABLE IMPACT ANALYSIS

This section is mandatory.

You must identify:

## A. Files/modules/services likely to be extended

List concrete existing files/modules/services that are good candidates for extension.

## B. Files/modules/services that should remain untouched if possible

Call out areas where coupling would be risky or unnecessary.

## C. New top-level artifacts likely needed

Examples:

* new schema files
* new migrations
* new service modules
* new planner endpoints
* new ingest jobs
* new tests
* new docs/handoff artifacts

## D. Table impact

For DB work, classify proposed tables as:

* extend existing table
* add adjacent table
* create new meal-domain table
* create new bridge table

You must prefer minimal invasive changes unless repo truth strongly justifies deeper unification.

---

# 23. IMPLEMENTATION PROPOSAL FORMAT FOR FUTURE WORK

This section is mandatory.

Based on repo truth, recommend the standard format future implementation proposals for this domain should follow.

We want a durable working style for future food/meal work.

Recommend:

* what sections every future proposal should include
* what repo references should always be cited
* what “inspect before implement” rules should apply
* what tests/verification must be required
* what migration discipline should be followed
* what boundary analysis should always be included
* what rollout/phasing format should be used

At minimum, propose a standard template for future implementation proposals that includes:

1. objective
2. repo-truth basis
3. affected modules/files/tables
4. shared vs local boundary analysis
5. schema/contracts
6. migration plan
7. service/API plan
8. tests/verification
9. risks/rollback
10. phased execution plan

---

# 24. EXPECTED RESULT SHAPE BASED ON CURRENT REPO

This section is mandatory.

Based on the current repo, tell us what kind of implementation outcome is realistic right now.

Specifically answer:

* Is the repo currently ready for a clean ingredient foundation?
* Is recipe ingest likely to fit existing patterns cleanly?
* Is the basket/pricing side mature enough to support meal costing now?
* What parts are likely easy wins?
* What parts are likely major new groundwork?
* What parts should be scaffolded first but activated later?
* What should we expect to be implemented in v1 versus merely schema-ready?

We want realistic expectations, not idealized ones.

---

# 25. PROPOSED STANDING MANDATE FOR THIS DOMAIN

This section is mandatory.

Recommend a standing mandate for the food/meal domain moving forward.

This should answer:

* what this domain is responsible for
* what it should not own
* what it may reuse from shared Pricer layers
* what it must expose back to the broader ecosystem
* what boundaries should remain stable over time

Your proposed mandate should be concrete and operational.

A good answer will likely define the meal/food domain as owning things like:

* canonical ingredients
* recipes/components/culinary metadata
* preference-aware deterministic meal planning
* shopping-list generation from recipe plans

while relying on shared Pricer layers for things like:

* retailer products
* canonical product truth
* pricing data
* basket/store optimization primitives
* generic mapping/adjudication infrastructure where appropriate

But ground this in repo truth and improve it if needed.

---

# 26. WHAT MUST BE INSPECTED IN THE REPO

You must inspect the repo thoroughly and report repo truth on all relevant parts, including but not limited to:

## Data model / DB / migrations

* canonical product tables
* mapping tables
* retailer product schemas
* price schemas
* localization/multilingual fields
* basket/store optimization data
* user/profile tables
* preference-related tables if any
* current migration patterns

## Backend services / modules

* ingest pipeline
* canonicalization pipeline
* adjudication/warning queue logic
* pricing / basket services
* search services
* planner-like services if any
* API layer patterns

## Contracts / DTOs / schemas

* existing canonical contracts
* entity schemas
* response formats
* validation rules

## Tests / trust / verification

* current test conventions
* trust/verification commands
* patterns for introducing new deterministic modules safely

## Naming / architecture

* where equivalent central domain logic currently lives
* whether a new top-level domain area is appropriate
* whether existing central abstractions should be extended instead

---

# 27. WHAT YOU MUST PRODUCE

Your response must be a **repo-truth implementation inspection**, not generic advice.

## Deliverable A — Current-state analysis

Describe:

* what exists now
* what can be reused
* what partially exists
* what is missing
* what conflicts with the target design

## Deliverable B — Recommended architecture

Propose:

* where each new concept should live
* what should be added
* what should be extended
* what should be kept separate
* what should be unified

## Deliverable C — Concrete schema proposal

Provide implementation-ready recommendations for:

1. canonical ingredient schema
2. recipe schema
3. component schema
4. unit/conversion schema
5. planning constraints schema
6. shopping/basket output schema
7. multilingual/localization strategy

## Deliverable D — Integration plan

Explain how to connect:

* products to ingredients
* ingredients to recipes
* recipes to plans
* plans to baskets
* multilingual names to search/display
* ingest to deterministic runtime

## Deliverable E — Shared vs local boundary map

For every major concept, classify it as:

* shared
* domain-local
* bridge

Include file/module/table implications.

## Deliverable F — Risks / unknowns

Identify:

* repo gaps
* design risks
* potential thrash points
* where manual review is needed
* where v1 should stay conservative

## Deliverable G — Implementation phases

Recommend phased implementation, likely something like:

* Phase M1: canonical ingredient foundation
* Phase M2: recipe ingest + schemas
* Phase M3: deterministic planning engine
* Phase M4: shopping/basket integration
* Phase M5: preference engine

Adjust if repo truth suggests better sequencing.

## Deliverable H — Exact next actions

List the exact artifacts/files/tables/services that should be designed or created next.

## Deliverable I — Future proposal template

Recommend the exact structure future proposals in this domain should use.

## Deliverable J — Standing mandate

Recommend the ongoing mandate and boundary of this domain inside Pricer.

---

# 28. IMPORTANT IMPLEMENTATION BIASES

Please keep these biases in mind while reviewing and proposing:

## Bias 1 — Deterministic core

Do not push runtime generative AI.

## Bias 2 — Rich schema, narrow activation

It is okay to store more than v1 uses.

## Bias 3 — Preserve source truth

Raw source data should remain traceable.

## Bias 4 — Strong mapping layer

Do not collapse product and ingredient into one concept.

## Bias 5 — Equal centrality

Do not treat this as a side plugin. Treat it as a central domain expansion of Pricer.

## Bias 6 — Bulgaria-first, multilingual-ready

Prioritize Bulgarian + English now, but do not box us in.

## Bias 7 — Conservative v1

Avoid overbuilding recursive state/component logic if repo truth suggests simpler v1 scaffolding.

## Bias 8 — Minimal invasive coupling

Prefer clean bridges and adjacent tables/modules over invasive rewiring, unless repo truth clearly supports deeper unification.

## Bias 9 — Inspect before implement

Do not assume fit. Verify fit against real files, tables, and modules.

---

# 29. SPECIFIC QUESTIONS YOU MUST ANSWER

Please answer these explicitly based on repo truth:

1. Where should canonical ingredient entities live in the current architecture?
2. Should ingredient canonicalization mirror the product canonicalization pipeline, or be modeled differently?
3. What existing DB schemas/tables can be extended versus what must be newly introduced?
4. What multilingual/localization model best fits the repo as it exists today?
5. What existing unit normalization logic can be reused for food/meal use cases?
6. What is the cleanest way to represent product -> ingredient mapping?
7. What is the cleanest way to represent components?
8. Should techniques/states be first-class tables now or lighter structured metadata first?
9. Where should deterministic planning logic live?
10. What should the v1 runtime-safe subset of the rich schema be?
11. What should be implemented first to minimize thrash?
12. What repo constraints or patterns make parts of this plan easier or harder?
13. What should be shared centrally versus kept meal-domain-local?
14. What exact files/modules/tables should be touched first?
15. What areas should remain untouched for now?
16. What should future implementation proposals for this domain look like?
17. What standing mandate should this domain have inside Pricer?

---

# 30. RESPONSE FORMAT REQUIRED

Structure your answer like this:

## 1. Repo Truth Summary

## 2. Existing Assets to Reuse

## 3. Missing Foundations

## 4. Shared vs Domain-Local Boundary Map

## 5. Recommended Architecture

## 6. Proposed Schemas

## 7. File / Module / Table Impact

## 8. Integration Points

## 9. Expected Result Shape for Current Repo

## 10. Risks / Open Questions

## 11. Recommended Phasing

## 12. Exact Next Steps

## 13. Future Proposal Template

## 14. Proposed Standing Mandate

Be specific.
Ground everything in actual repo findings.
Prefer concrete file/module/table references wherever possible.

---

# 31. FINAL GOAL

We are trying to evolve Pricer into a system where:

* price/product intelligence
* ingredient intelligence
* recipe intelligence
* meal-planning intelligence
* basket/store intelligence

all work together as one coherent ecosystem.

Your task is to inspect the repo truth and tell us exactly how to do that cleanly, safely, and in a way that preserves long-term architectural coherence, modularity, and replaceable boundaries.
