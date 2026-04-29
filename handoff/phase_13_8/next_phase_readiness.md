# Next Phase Readiness

## Ready now
- The repo still preserves full-archive ingest, source-product identity, chain-level dedupe, and the additive canonical layer.
- The canonical layer now treats normalized volume and weight markers as variant boundaries in addition to stage, age-band, flavor, color, pack, range, year, and age-expression markers.
- Real-archive verification reduced canonical warnings from `847` to `693` while canonical product count rose conservatively from `78058` to `78186`.

## Constraints to preserve
- Keep canonicalization deterministic and conservative.
- Keep the canonical layer additive; do not replace source-product identity or chain-level dedupe.
- Prefer warning-driven review over aggressive auto-merging.

## Recommended next focus
1. Add deterministic guards for remaining warning-heavy pack-family or count-driven families where the numeric semantics are still explicit.
2. Re-run the same real-archive verification after each guard update and compare both canonical counts and warning counts.
3. Delay downstream canonical-product consumers until the remaining warning groups are reviewed.
