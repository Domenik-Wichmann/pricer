# Next Phase Readiness

## Ready now
- The repo still preserves full-archive ingest, source-product identity, chain-level dedupe, and additive canonical grouping.
- Unresolved canonical warnings now persist as durable queue records with stable pair fingerprints and reusable decision records.
- Hard deterministic conflicts still win, and the new lane remains dry-run only so live canonical merges are unchanged.

## Constraints to preserve
- Keep canonicalization additive; do not replace source-product identity or chain-level dedupe.
- Keep deterministic hard-marker conflicts authoritative over any future LLM suggestion.
- Keep fingerprints stable and decision reuse explicit so the same unresolved pair is never paid for twice.

## Recommended next focus
1. Phase 14.1 should add a narrow opt-in adjudication caller that reads pending queue records, checks the decision cache first, and writes decision records without silently mutating canonical state.
2. Phase 14.1 should define the prompt contract and acceptance policy for `merge`, `distinct`, and `uncertain`, with conservative defaults.
3. Phase 14.2 can then add human override and review workflows on top of the same fingerprinted queue and decision artifacts.
