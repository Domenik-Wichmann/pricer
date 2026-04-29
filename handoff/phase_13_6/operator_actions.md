# Operator Actions

## Purpose
Phase 13.6 is implemented in code. The remaining work is review-oriented and focused on the smaller warning set that still remains after range-based tightening.

## Ordered steps
1. Review a sample of the remaining `potential_over_canonicalization_*` warning groups from the latest real archive run.
2. Prioritize any still-risky families such as vintage years, aged-expression numbers, or other numeric variant markers not yet modeled explicitly.
3. Keep canonical products additive-only until downstream consumers have been validated against the further-reduced warning set.
