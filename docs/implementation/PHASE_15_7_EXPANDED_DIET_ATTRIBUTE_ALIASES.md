# Phase 15.7 Expanded Diet + Attribute Alias Sets

Last updated: 2026-04-26

## Goal

Expand Phase 15.6 deterministic diet and product-attribute normalization to additional common Bulgaria/Europe languages while preserving explicit-only extraction.

## Languages Added

- Turkish
- Russian
- Ukrainian
- Dutch
- Spanish

Existing Bulgarian, English, and German aliases remain supported.

## Runtime Contract

The phase does not add tags. It only adds reviewed aliases for the existing controlled vocabulary:

- `diet_tags`: `vegan`, `vegetarian`
- `attributes`: `organic`, `gluten_free`, `lactose_free`, `sugar_free`, `low_fat`, `high_protein`, `plant_based`, `halal`, `kosher`, `no_added_sugar`, `wholegrain`

`extractExplicitDietAndAttributeTags(text)` still returns normalized `diet_tags`, normalized `attributes`, and matched-text `evidence`.

## Deterministic Boundaries

- No LLM calls.
- No external services.
- No canonical product or mapping mutation.
- No uncontrolled/free-form tags.
- No inference from ingredients, categories, product families, or claims such as `natural`, `tofu`, or `low sugar`.
- Unicode-aware word/phrase boundaries continue to avoid substring matches inside unrelated words.

## Verification

Primary command:

```bash
npm run test:phase15_7
```

Compatibility commands:

```bash
npm run test:phase15_6
npm run test:phase15
npm run test:phase15_1
npm run test:phase15_2
```
