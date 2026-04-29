# Next Phase Readiness

## Ready now
- DB0 has a documented hybrid persistence boundary: Postgres for heavy relational source truth and Firestore/flat store for app-facing runtime state.
- The dedupe-first ingest contract is documented for upcoming USDA, Open Food Facts, recipe, ingredient, component, and product-source work.
- DB1 can start with Postgres foundation and migration tooling without touching current product runtime behavior.

## Constraints to preserve
- Do not replace the current Firestore/flat runtime in DB1.
- Do not ingest USDA in DB1; reserve that for DB2.
- Keep `functions/src` and `app/functions/src` mirrored for any future runtime code.
- Do not enrich before deterministic identity and dedupe.
- Do not put raw USDA/Open Food Facts bulk data into Firestore.

## Recommended next focus
1. Write `docs/implementation/PHASE_DB1_POSTGRES_FOUNDATION.md`.
2. Add a Postgres env/secret contract to `docs/needed_secrets.md`.
3. Implement a small mirrored Postgres client, migration runner, and source-import metadata schema with idempotency tests.
