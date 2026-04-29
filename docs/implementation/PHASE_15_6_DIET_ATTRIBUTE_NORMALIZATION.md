# Phase 15.6 Diet + Attribute Normalization Implementation

Last updated: 2026-04-26

## Goal

Normalize explicit diet and product-attribute claims into deterministic tags for search, filters, gap detection, and market intelligence.

## Owning Modules

- `functions/src/phase15/diet_attribute_normalization.js`
- `app/functions/src/phase15/diet_attribute_normalization.js`
- `functions/src/phase15/enrichment.js`
- `app/functions/src/phase15/enrichment.js`

## Runtime Contract

`extractExplicitDietAndAttributeTags(text)` returns:

```json
{
  "diet_tags": [],
  "attributes": [],
  "evidence": [
    { "tag": "organic", "matched_text": "bio" }
  ]
}
```

Supported diet tags:
- `vegan`
- `vegetarian`

Supported claim attributes:
- `organic`
- `gluten_free`
- `lactose_free`
- `sugar_free`
- `low_fat`
- `high_protein`
- `plant_based`
- `halal`
- `kosher`
- `no_added_sugar`
- `wholegrain`

The extractor uses case-insensitive phrase matching with Unicode-aware word boundaries. It supports Bulgarian, English, and German aliases and does not infer from category or ingredient-family terms.

## Enrichment Integration

LLM enrichment still runs first. The final validation/merge pass then:
- normalizes mapped aliases into controlled tags
- drops unknown/unmapped diet or attribute claim values
- extracts explicit claims from canonical/source names
- merges and dedupes explicit and LLM claims
- stores deterministic matched-text provenance in `explicit_claim_evidence`

Canonical products, mappings, and grouping are unchanged.

## Verification

Primary command:

```bash
npm run test:phase15_6
```

Compatibility commands:

```bash
npm run test:phase15
npm run test:phase15_1
npm run test:phase15_2
```
