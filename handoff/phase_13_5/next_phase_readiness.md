# Next Phase Readiness

## Ready now
- The repo still preserves full-archive ingest, source-product identity, and chain-level dedupe behavior.
- The cross-chain canonical layer now separates stage, age-band, flavor, color, and pack-count variants more safely.
- Real-archive verification reduced canonical warnings from `1054` to `940` with only a modest rise in canonical product count from `77696` to `77894`.

## Constraints to preserve
- Keep canonicalization deterministic and conservative.
- Keep the canonical layer additive; do not replace source-product identity or chain-level dedupe.
- Prefer warning-driven review over aggressive auto-merging.

## Recommended next focus
1. Add deterministic guards for remaining warning-heavy domains such as explicit size ranges and similar variant-rich product families.
2. Re-run the same real-archive verification after each guard update and compare both canonical counts and warning counts.
3. Delay downstream canonical-product consumers until the remaining warning groups are reviewed.
