# Next Phase Readiness

## Ready now
- The repo still preserves full-archive ingest, source-product identity, chain-level dedupe, and the additive canonical layer.
- The canonical layer now treats deterministic numeric families such as count, age-band, reserve-tier, volume, size, range, year, and age-expression markers as explicit merge boundaries where applicable.
- Real-archive verification reduced canonical warnings from `693` to `662` with only a slight rise in canonical product count from `78186` to `78194`.

## Constraints to preserve
- Keep canonicalization deterministic and conservative.
- Keep the canonical layer additive; do not replace source-product identity or chain-level dedupe.
- Prefer warning-driven review over aggressive auto-merging.

## Recommended next focus
1. Build the audited LLM disambiguation lane only for the smaller unresolved warning set that remains after deterministic numeric-family handling.
2. Persist any future LLM decisions durably with fingerprinting and reuse so the same unresolved pair is never paid for twice.
3. Delay downstream canonical-product consumers until the remaining warning groups and the LLM decision contract are reviewed.
