# Phase 15 V3 Taxonomy Validation Handoff

Date: 2026-05-07

## Summary

Fixed `canonical_semantic_v3` taxonomy validation so provider spillover inside `taxonomy_classification.registry_matches` no longer rejects the full enrichment item.

## Changes

- `taxonomy_classification.registry_matches` prompt/schema now requires `product_taxonomy` only.
- Validator keeps valid `product_taxonomy` taxonomy matches.
- Usable misplaced legacy `product_category` / `food_category` matches are moved into backward-compatible `category.registry_matches`.
- Null or unusable non-product taxonomy spillover is ignored.
- Mirrored the backend change in both `functions/src/phase15/enrichment.js` and `app/functions/src/phase15/enrichment.js`.

## Verification

- `npm run test:phase15` passed: 74 passed, 0 failed.
- `npm run validate:docs` passed: JSON docs parse successfully.

## Operator Actions

No manual action required. Future live v3 chicken runs should no longer reject an item solely because legacy or null registry matches appear under `taxonomy_classification.registry_matches`.
