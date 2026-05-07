# Phase 15 Registry-Backed Product Taxonomy Handoff

Date: 2026-05-07

## Summary

Implemented additive `canonical_semantic_v3.enrichment.taxonomy_classification` for strict-schema, open-vocabulary hierarchical product taxonomy.

## What Changed

- Added `product_taxonomy` to `semantic_term_registry`.
- Seeded broad starter departments plus tested child branches for grocery, personal care, automotive, and garden products.
- Added v3 prompt/schema/validation for taxonomy paths, aligned term ids, raw category terms, registry matches, proposed terms, confidence, review flags, and evidence.
- Added proposal writing from `taxonomy_classification.proposed_terms` into `semantic_term_registry_proposals`.
- Added taxonomy evidence into enrichment pilot evidence extraction and product search/debug metadata.
- Updated `debug:enrichment` output with taxonomy path, primary taxonomy, registry matches, proposed terms, confidence, and review flag.

## Verification

- `npm run test:phase15` passed: 73 passed, 0 failed.
- `node tests/phase_15_2_product_api.test.js` passed: 29 passed, 0 failed.

## Operator Notes

- LLM taxonomy proposals are pending review only; no proposals are auto-activated.
- `product_taxonomy` is not a closed taxonomy. Missing realistic labels should be proposed under the best known parent.
- Existing `product_category` and `food_category` records remain backward-compatible. Non-food products must not propose `food_category` actions.
- No live LLM enrichment/debug run was executed.
