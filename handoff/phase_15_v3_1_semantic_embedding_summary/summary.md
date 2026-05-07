# Phase 15 V3.1 Semantic Embedding Summary Handoff

Date: 2026-05-06

## Summary

Added additive `canonical_semantic_v3` `semantic_embedding_summary` support for future product embeddings. The field is optional for old v3 records and required in new strict response-format schema outputs. Guidance now asks for richer two-sentence summaries with flavor/texture, cuisine, ingredient, use-case, dish/meal-role, preparation/pairing, and search-context meaning when supported.

## Files Changed

- `functions/src/phase15/enrichment.js`
- `app/functions/src/phase15/enrichment.js`
- `functions/src/phase15/enrichment_pilot.js`
- `app/functions/src/phase15/enrichment_pilot.js`
- `scripts/debug_canonical_enrichment.js`
- `tests/phase_15_hyper_rich_enrichment.test.js`
- `CHANGELOG.md`
- `docs/REPO_MAP.md`
- `docs/SCHEMA_MAP.md`
- `docs/DATA_MODEL.md`
- `docs/PHASE_15_9_SEMANTIC_ENRICHMENT_PILOT.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/test_runs/phase15_v3_semantic_embedding_summary_2026-05-06.json`

## Verification

- `npm run test:phase15` passed: 65 passed, 0 failed.
- `npm run validate:docs` passed: JSON docs parse successfully.

## Operator Actions

None required.

## Next Readiness

The v3.1 summary field is ready for bounded dry-run/real-run pilots behind the existing `PRICER_ENRICHMENT_VERSION=canonical_semantic_v3` controls.
