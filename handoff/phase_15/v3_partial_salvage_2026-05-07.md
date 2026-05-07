# Phase 15 V3 Partial Salvage Handoff

Date: 2026-05-07

## Summary

Implemented `canonical_semantic_v3` partial salvage for repairable field-level enrichment validation issues. Fatal response failures still reject without writing enrichment, while usable repaired/partial records write with explicit review metadata.

## Changed

- Added a v3-only pre-validation normalization layer in `phase15/enrichment.js`.
- Stored `enrichment_repair_status`, `repair_warnings`, `discarded_fields`, and record-level `needs_human_review` from `phase15/enrichment_pilot.js`.
- Extended `debug:enrichment` output with repair status, repair warnings, and discarded fields.
- Added Phase 15 regressions for taxonomy primary repair, misplaced registry matches, invalid optional usage fields, wrong product IDs, and malformed JSON quarantine.
- Mirrored backend changes between `functions/src/` and `app/functions/src/`.

## Verification

- `npm run test:phase15` passed: 81 passed, 0 failed.
- `npm run validate:docs` passed: JSON docs parse successfully.

## Operator Actions

None.

## Next Readiness

Ready for a small dry-run or real opt-in v3 pilot inspection with `npm run debug:enrichment -- --latest N --version canonical_semantic_v3` after writes.
