# Next Phase Readiness

## Ready now
- The repo still preserves full-archive ingest, source-product identity, chain-level dedupe, and the additive canonical layer.
- The canonical layer now treats explicit year and age expressions as variant boundaries in addition to stage, age-band, flavor, color, pack, and numeric-range markers.
- Real-archive verification reduced canonical warnings from `863` to `847` with only a modest rise in canonical product count from `78019` to `78058`.

## Constraints to preserve
- Keep canonicalization deterministic and conservative.
- Keep the canonical layer additive; do not replace source-product identity or chain-level dedupe.
- Prefer warning-driven review over aggressive auto-merging.

## Recommended next focus
1. Add deterministic guards for remaining warning-heavy volume or size-format families where explicit numeric semantics are still visible in names.
2. Re-run the same real-archive verification after each guard update and compare both canonical counts and warning counts.
3. Delay downstream canonical-product consumers until the remaining warning groups are reviewed.
