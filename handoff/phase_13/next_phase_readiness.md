# Next Phase Readiness

## Ready now
- The repo still ingests full KolkoStruva daily archives and preserves the existing source identity and chain-level dedupe behavior.
- The backend now also emits deterministic cross-chain canonical products and stable source-to-canonical mappings.
- Real-archive verification shows a reduction from `111029` chain buckets to `77696` canonical product candidates.

## Constraints to preserve
- Keep canonicalization deterministic and conservative.
- Keep the canonical layer additive; do not collapse or rewrite source-product identity.
- Keep warning logs diagnostic-only until reviewed.

## Recommended next focus
1. Review warning-heavy groups and add more deterministic variant guards where clearly justified.
2. Introduce downstream uses of canonical products in analytics or query ranking only after that review.
3. Re-run the real archive verification after any key-shaping changes and compare warning counts plus sample groups.
