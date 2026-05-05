# Phase 15.8 Implementation Contract

## Goal

Add a deterministic shopping-intent and product-family preference foundation before exact canonical product and offer selection.

## Runtime Modules

- `app/functions/src/phase15/shopping_intent.js`
- `functions/src/phase15/shopping_intent.js`
- `app/functions/src/phase1/store.js`
- `functions/src/phase1/store.js`
- `app/functions/src/index.js`
- `functions/src/index.js`
- `functions/index.js`

## Storage

New runtime collection:

- `user_product_family_preferences`

Document id:

- `preference_id`

Record fields:

- `preference_id`
- `owner_id`
- `owner_type`
- `family_id`
- `preferred_attributes`
- `preferred_brands`
- `avoided_brands`
- `confidence`
- `source`
- `last_confirmed_at`
- `created_at`
- `updated_at`

Allowed sources:

- `explicit_user_choice`
- `inferred_repeated_choices`
- `imported_profile`

## Seed Definitions

`PRODUCT_FAMILY_DEFINITIONS` is an in-code deterministic seed registry. Each product-family definition includes BG/EN display names, BG/EN aliases, prioritized attributes, and possible values.

Seeded families include yogurt, milk, bread, sirene, kashkaval, cream cheese, juice, coffee, rice, pasta, oil, eggs, and chicken.

## Core Exports

- `resolveShoppingIntent(...)`
- `identifyProductFamilies(...)`
- `upsertUserProductFamilyPreference(...)`
- `loadUserProductFamilyPreference(...)`
- `listUserProductFamilyPreferences(...)`
- `normalizeUserProductFamilyPreference(...)`
- `handleResolveShoppingIntentRequest(...)`

## Route Contract

```text
POST /shopping-intent/resolve
```

Request:

```json
{
  "term": "yogurt",
  "owner_context": {
    "owner_id": "user_123",
    "owner_type": "user"
  },
  "selected_family_id": "yogurt",
  "selected_attributes": {
    "style": "greek"
  },
  "preference_confidence_threshold": 0.7
}
```

Response states:

- `unresolved`
- `family_ambiguous`
- `needs_clarification`
- `ready_for_product_selection`

## Safety Boundaries

- No LLM calls.
- No mobile UI changes.
- No canonical product merges.
- No writes to `canonical_products`, `canonical_product_mappings`, enrichment, price, offer, saved-list, watchlist, meal-plan, recipe, ingredient, or inventory rows.
- Static product-family definitions are deterministic code seeds, not source/product canonical truth.
- User family preferences are owner-scoped preference hints only.

## Verification Targets

- Required family seeds exist.
- Yogurt clarifies style before fat percent and size.
- Juice clarifies flavor first.
- Cheese returns family ambiguity across sirene, kashkaval, and cream cheese.
- Exact sirene selects the sirene family even though cream cheese has partial token overlap.
- Bread clarifies type.
- High-confidence preferences produce suggested defaults.
- Low-confidence preferences do not suppress clarification.
