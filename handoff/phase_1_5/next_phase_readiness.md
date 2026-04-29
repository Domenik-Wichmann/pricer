# Next Phase Readiness

## Ready for Phase 2
Phase 2 can now assume:
- stable Phase 1 source identities remain unchanged
- enrichment rows contain deterministic English metadata
- multilingual display slots and status fields already exist
- translation jobs can backfill non-English display text without re-ingest

## Constraints to preserve
- Do not change the Phase 1 key strategy.
- Do not translate raw Bulgarian fields.
- Do not run translation inline during ingest.
- Continue treating English as the canonical multilingual base.
- Preserve idempotent non-overwrite behavior for cached translations unless a later phase explicitly revisits that policy.

## Recommended next implementation focus
1. Use `canonical_en` and `display.en` as inputs for Phase 2 canonical matching and alias design.
2. Keep Bulgarian source text available for provenance and operator review.
3. If a live translation provider is introduced later, preserve the same batch, cache, and per-run limit controls.
