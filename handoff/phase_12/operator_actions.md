# Operator Actions

## Purpose
Phase 12 is mostly code-complete. Only review and curation tasks that require product judgment remain.

## Ordered steps
1. Review the seeded canonical terms and synonym mappings before using them in production.
2. Review any demand-log-driven learned typo synonyms and disable any mapping that feels too aggressive for Bulgarian grocery search.
3. If you want higher-quality coverage, curate additional `canonical_terms` and `synonym_map` seed records for common grocery vocabulary and brand aliases.
4. Re-run the deployed search flow on a shortlist of real typo-heavy and synonym-heavy Bulgarian queries once the production backend is live.
