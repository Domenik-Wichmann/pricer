# PHASE M0 — MEAL FOUNDATIONS

## Canonical Ingredient + Unit + Bridge Layer (Repo-Truth Aligned)

Date: 2026-04-23
Status: IMPLEMENTED AND VERIFIED
Scope: Foundational schema + contracts only (NO planning engine, NO recipes yet)

---

# 1. PURPOSE

This phase establishes the **minimum shared foundations** required to support:

* ingredient-aware pricing
* recipe ingest (next phase)
* deterministic meal planning (later)
* shopping list → basket translation

This phase **must be completed and stabilized before any recipe or planning work begins**.

Implementation status on 2026-04-23:
- Completed in both `functions/src/meal/` and `app/functions/src/meal/`
- Shared store collections extended in both `phase1/store.js` copies
- Deterministic M0 tests added and passing for ingredient schema/store integration, unit conversion, and price-fallback bridge behavior

---

# 2. CORE ARCHITECTURE DECISION

We are extending Pricer with a **parallel but integrated domain layer**.

## Golden rule

```text
canonical_products ≠ ingredients
```

We introduce:

```text
product → ingredient → recipe → plan → basket
```

Where:

* `canonical_products` = what stores sell (EXISTING)
* `ingredients` = what recipes use (NEW)
* `product_ingredient_mapping` = bridge between them (NEW)

---

# 3. DOMAIN BOUNDARIES

## Shared (existing or extended)

* store persistence (`phase1/store.js`)
* canonical IDs pattern
* enrichment pattern (Phase 15)
* basket optimizer (Phase 8)
* pricing data
* search alias conventions

## Meal-domain (NEW)

* ingredients
* ingredient hierarchy
* unit/conversion logic (shared-capable but implemented here first)
* product → ingredient mapping (bridge)
* (later: recipes, planning)

## Bridge layer (CRITICAL)

* product → ingredient mappings
* ingredient → price projection
* ingredient → purchasable conversion

---

# 4. FILE STRUCTURE

Create new domain root:

```text
functions/src/meal/
app/functions/src/meal/
```

Initial modules:

```text
meal/catalog/        → ingredients, families, categories
meal/bridge/         → product ↔ ingredient mapping
meal/units/          → units + conversions
meal/shared/         → shared helpers (localization, confidence)
```

⚠️ ALL backend code must be mirrored in:

* `functions/src/...`
* `app/functions/src/...`

---

# 5. STORE / COLLECTION EXTENSIONS

Extend flat store model with new collections:

## Core collections

```text
ingredient_families
ingredient_categories
ingredients
product_ingredient_mappings

units
unit_conversions
ingredient_unit_rules
```

---

# 6. CANONICAL INGREDIENT SCHEMA

## Collection: `ingredients`

### Core identity

```json
{
  "id": "ingredient_tomato",
  "status": "active",

  "name_bg": "домат",
  "name_en": "tomato",

  "aliases_bg": ["домати", "домат"],
  "aliases_en": ["tomato", "tomatoes"],

  "ingredient_family_id": "family_vegetable",
  "ingredient_category_id": "category_nightshade",

  "default_edible_unit": "g",
  "default_purchase_unit": "kg"
}
```

---

### Classification (structured JSON)

```json
{
  "classification": {
    "food_group": "vegetable",
    "culinary_roles": ["base", "fresh_element", "acid_source"],
    "common_cuisines": ["bulgarian", "mediterranean"],
    "is_staple": true,
    "availability_level": "high"
  }
}
```

---

### Purchase model (CRITICAL)

```json
{
  "purchase_model": {
    "common_purchase_units": ["kg", "g", "piece"],
    "typical_piece_weight_g": 120,
    "edible_yield_ratio": 0.92,
    "price_basis_unit": "kg"
  }
}
```

---

### Dietary flags

```json
{
  "dietary_flags": {
    "vegan": true,
    "vegetarian": true,
    "contains_dairy": false,
    "contains_gluten": false,
    "contains_nuts": false
  }
}
```

---

### Enrichment (LLM-generated, NOT runtime-critical)

```json
{
  "enrichment": {
    "flavor_profile": {...},
    "texture_profile": {...},
    "culinary_behavior": {...},
    "semantic_traits": {...}
  }
}
```

---

### Quality metadata

```json
{
  "quality": {
    "source": "llm_enriched",
    "confidence": 0.82,
    "runtime_safe_fields": [
      "classification",
      "purchase_model",
      "dietary_flags"
    ]
  }
}
```

---

# 7. INGREDIENT HIERARCHY

## Collection: `ingredient_families`

```json
{
  "id": "family_vegetable",
  "name_bg": "зеленчуци",
  "name_en": "vegetables"
}
```

## Collection: `ingredient_categories`

```json
{
  "id": "category_nightshade",
  "family_id": "family_vegetable",
  "name_bg": "нощни сенници",
  "name_en": "nightshades"
}
```

---

# 8. PRODUCT → INGREDIENT BRIDGE

## Collection: `product_ingredient_mappings`

```json
{
  "id": "map_123",

  "canonical_product_id": "cp_456",
  "ingredient_id": "ingredient_tomato",

  "mapping_type": "exact", 
  // exact | category | weak

  "confidence": 0.93,

  "source": "deterministic_rule",
  "needs_review": false
}
```

---

## Mapping types

* `exact` → product directly satisfies ingredient
* `category` → product belongs to broader ingredient class
* `weak` → uncertain or fallback mapping

---

## MUST reuse patterns from:

* Phase 6 canonicalization
* disambiguation queue (if needed)

---

# 9. UNIT SYSTEM (CRITICAL)

## Collection: `units`

```json
{
  "id": "g",
  "type": "mass"
}
```

Supported types:

* mass: g, kg
* volume: ml, l
* count: piece
* derived: pack (handled separately)

---

## Collection: `unit_conversions`

```json
{
  "from": "kg",
  "to": "g",
  "factor": 1000
}
```

---

## Collection: `ingredient_unit_rules`

Ingredient-specific conversions:

```json
{
  "ingredient_id": "ingredient_onion",

  "piece_to_grams": 120,
  "edible_yield_ratio": 0.9
}
```

---

# 10. CONVERSION LOGIC (RUNTIME CONTRACT)

Must support:

## A. Recipe → edible

```text
2 onions → 240g
```

## B. Edible → purchase

```text
240g → 1kg purchase
```

## C. Purchase → cost

```text
1kg onions → price lookup
```

---

# 11. PRICE FALLBACK LADDER

Must be formalized:

```text
1. exact store product price
2. other store product price
3. category average
4. ingredient estimate
```

Store fallback provenance:

```json
{
  "price_source": "category_average",
  "confidence": 0.6
}
```

---

# 12. LOCALIZATION MODEL

V1 approach:

```text
name_bg
name_en
aliases_bg[]
aliases_en[]
```

Do NOT implement full i18n abstraction yet.

---

# 13. RUNTIME-SAFE FIELD SET (VERY IMPORTANT)

Only these are allowed in v1 runtime logic:

* ingredient_id
* hierarchy (family/category)
* purchase_model
* dietary_flags
* unit rules
* mapping confidence

Everything else = enrichment only

---

# 14. TEST REQUIREMENTS

Add:

```text
tests/phase_m0_ingredient.test.js
tests/phase_m0_conversion.test.js
tests/phase_m0_mapping.test.js
```

Must verify:

* unit conversion correctness
* mapping resolution
* fallback ladder behavior
* store integration compatibility

---

# 15. RISKS (MUST AVOID)

## Critical

* ❌ putting ingredients into canonical_products
* ❌ skipping unit system
* ❌ guessing conversions in planner
* ❌ single-runtime updates (must mirror both src trees)

## Medium

* over-modeling enrichment
* premature recipe complexity
* premature localization abstraction

---

# 16. DELIVERABLES FOR M0

Codex must produce:

## A. Store extensions

* new collections defined
* store.js updated

## B. Ingredient schema

* full schema implemented
* validation logic

## C. Unit system

* units
* conversions
* ingredient rules

## D. Bridge layer

* product_ingredient_mappings
* mapping logic

## E. Tests

* deterministic verification

---

# 17. COMPLETION CRITERIA

M0 is complete when:

* ingredient entities exist and can be queried
* product → ingredient mapping works deterministically
* ingredient quantities can be converted to purchasable units
* pricing can be approximated at ingredient level
* tests validate correctness

---

# 18. NEXT PHASE

After M0:

→ **PHASE M1 — Recipe + Component Ingest**

---

# 19. FINAL RULE

> If M0 is weak, everything built on top will be wrong.

Take extra time here. This is the foundation of the entire system.
