# Phase 15 V3 Taxonomy Primary Alignment Handoff

Date: 2026-05-07

## Summary

Fixed `canonical_semantic_v3` taxonomy validation so usable primary taxonomy fields are aligned with the path before consistency checks. This prevents otherwise valid chicken enrichments from being rejected when the provider returns a primary label or term id that is not already present in the path arrays.

## Changes

- Added taxonomy primary repair in both backend trees:
  - `functions/src/phase15/enrichment.js`
  - `app/functions/src/phase15/enrichment.js`
- If `primary_taxonomy_label` is usable but missing from `taxonomy_path_labels`, validation appends it and keeps path arrays aligned.
- If `primary_taxonomy_term_id` is a usable `product_taxonomy` term id but missing from `taxonomy_path_term_ids`, validation fills the matching label slot or the leaf term slot.
- If primary fields are null or unusable, validation derives them from the deepest valid taxonomy path item.
- Existing malformed path length checks and high-confidence contradiction checks remain in place.

## Verification

- `npm run test:phase15` passed: 75 passed, 0 failed.
- `npm run validate:docs` passed after the doc/test-registry updates.

## Operator Actions

No manual action required. Future live v3 chicken runs should not reject items solely because primary taxonomy label or term id fields are not already represented in the corresponding taxonomy path arrays.
