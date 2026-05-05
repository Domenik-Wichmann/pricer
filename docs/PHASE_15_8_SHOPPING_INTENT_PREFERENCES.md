# Phase 15.8 Shopping Intent Preferences

Date: 2026-05-03
Status: IMPLEMENTED - DETERMINISTIC FOUNDATION

## Goal

Create a deterministic layer between broad grocery text and exact product selection.

This phase separates:

```text
user shopping intent
-> product family
-> discriminating family attributes
-> user family preferences
-> later canonical product / current-offer selection
```

It does not build a conversational UI, call LLMs, merge canonical products, or change mobile screens.

## Runtime Modules

```text
functions/src/phase15/shopping_intent.js
app/functions/src/phase15/shopping_intent.js
```

Exports:

- `PRODUCT_FAMILY_DEFINITIONS`
- `resolveShoppingIntent(...)`
- `identifyProductFamilies(...)`
- `upsertUserProductFamilyPreference(...)`
- `loadUserProductFamilyPreference(...)`
- `listUserProductFamilyPreferences(...)`
- `handleResolveShoppingIntentRequest(...)`

HTTP route:

```text
POST /shopping-intent/resolve
```

## Product Family Definition Shape

Each seeded family has:

- `family_id`
- `display_name_bg`
- `display_name_en`
- `aliases_bg[]`
- `aliases_en[]`
- `attributes[]`

Each attribute has:

- `attribute_id`
- `display_name_bg`
- `display_name_en`
- `intent`: `required`, `preferred`, or `optional`
- `clarification_priority`
- `values[]`

Each value has:

- `value_id`
- `display_name_bg`
- `display_name_en`
- `aliases[]`

Seeded families:

- yogurt
- milk
- bread
- sirene / white brined cheese
- kashkaval / yellow cheese
- cream cheese
- juice
- coffee
- rice
- pasta
- oil
- eggs
- chicken

## User Preference Model

Runtime collection:

```text
user_product_family_preferences
```

Fields:

- `preference_id`
- `owner_id`
- `owner_type`
- `family_id`
- `preferred_attributes`
- `preferred_brands`
- `avoided_brands`
- `confidence`
- `source`: `explicit_user_choice`, `inferred_repeated_choices`, or `imported_profile`
- `last_confirmed_at`
- `created_at`
- `updated_at`

The record id is deterministic from owner type, owner id, and family id. Repeated writes refresh one row for that owner/family pair.

## Resolver Behavior

`resolveShoppingIntent(...)` is deterministic:

1. Normalize and tokenize the input.
2. Match product-family aliases in BG/EN.
3. Return family ambiguity when a broad term maps to several product families, such as `cheese`.
4. Infer explicit attributes from the text when possible.
5. Load owner-scoped family preference if a store and owner context are provided.
6. Return missing required/preferred attributes by clarification priority.
7. If a preference has sufficient confidence, return the preferred value as a suggested default.

Example outcomes:

- `yogurt` asks for style first, then fat percent and size.
- `juice` asks for flavor first.
- `cheese` asks whether the user means sirene, kashkaval, or cream cheese.
- `bread` asks for type, including white, wholegrain, rye, toast, and sliced.
- A high-confidence yogurt preference can supply Greek / 2% / 500g as defaults and make the intent ready for later product selection.

## Later Connections

### Compact Current Offers

This layer should later feed Phase 16 current-offer selection by turning family + attributes into product-catalog filters before exact canonical products are ranked. The intended path is:

```text
shopping intent family + attributes
-> Phase 15 product catalog candidates
-> canonical_current_offer_summary / current_product_offers
-> Phase 16 price lookup and basket optimizer
```

The intent layer must stay upstream of canonical product selection. It should never rewrite `canonical_products`, `canonical_product_mappings`, or current-offer read models.

### Meal Planning

Meal planning currently works through canonical ingredients, ingredient-product mappings, and PLAN2 product candidates. Family preferences can later help PLAN2 choose product candidate defaults for broad ingredients such as milk, yogurt, bread, rice, pasta, oil, eggs, and chicken.

The future adapter should read these preferences as optional user-shopping constraints only. It must not mutate meal plans, recipe ingredients, inventory, or canonical products.

## Follow-Up: Admin Tester And Opt-In Adapter

Date: 2026-05-03
Status: IMPLEMENTED - ADMIN QA AND OPT-IN PLANNER PATH

Admin Console now has a Shopping Intent tab for `POST /shopping-intent/resolve`. It supports query text, optional owner id, optional inline existing preference JSON, and optional selected-answer JSON. It shows interpreted resolver fields and raw JSON so operators can smoke-test `yogurt`, `cheese`, `ÑÐ¸Ñ€ÐµÐ½Ðµ`, `juice`, `bread`, and `coffee` without changing mobile UI.

The resolver endpoint now also accepts `query` and `item_text` aliases, can use an inline `existing_preference` / `preference` preview without writing it, and returns a backward-compatible `preference` summary plus `preference_record` when an effective preference is available. Store reads remain scoped to `user_product_family_preferences` through `queryCollection` when available.

Shopping-list and basket planning now support an explicit opt-in path:

```json
{
  "use_shopping_intent": true
}
```

or:

```json
{
  "resolution_mode": "intent_first"
}
```

When enabled, each item runs shopping-intent resolution before canonical product lookup. Family ambiguity or missing required/preferred intent attributes returns `status = "clarification_needed"` and basket plans place the item in `clarification_items` instead of guessing. When high-confidence preferences/defaults make the intent ready, the adapter builds a deterministic family-plus-attribute catalog query and continues into the existing canonical product candidate path. When disabled, the existing list/planner/optimizer behavior is unchanged.

## Verification

Test file:

```text
tests/phase_15_8_shopping_intent_preferences.test.js
```

Covers:

- required seed families
- yogurt style/fat/size clarification priority
- juice flavor-first clarification
- cheese family ambiguity
- exact sirene family selection despite cream-cheese partial overlap
- bread type ambiguity
- high-confidence preference defaults
- low-confidence preferences still requiring clarification
- endpoint response shape and scoped preference-store behavior
- opt-in yogurt clarification without preference
- opt-in high-confidence yogurt preference continuing to product candidates
- opt-in cheese ambiguity across sirene, kashkaval, and cream cheese
- disabled adapter flag preserving the previous basket planning path
