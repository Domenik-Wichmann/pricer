# Next Phase Readiness

## Ready now
- The repo still preserves full-archive ingest, source-product identity, chain-level dedupe, and the additive canonical layer.
- The canonical layer now treats explicit numeric ranges as variant boundaries and normalizes slash-versus-hyphen formatting safely.
- Real-archive verification reduced canonical warnings from `940` to `863` with only a modest rise in canonical product count from `77894` to `78019`.

## Constraints to preserve
- Keep canonicalization deterministic and conservative.
- Keep the canonical layer additive; do not replace source-product identity or chain-level dedupe.
- Prefer warning-driven review over aggressive auto-merging.

## Recommended next focus
1. Add deterministic guards for remaining warning-heavy numeric families such as vintage years or aged-expression numbers where clearly justified.
2. Re-run the same real-archive verification after each guard update and compare both canonical counts and warning counts.
3. Delay downstream canonical-product consumers until the remaining warning groups are reviewed.
