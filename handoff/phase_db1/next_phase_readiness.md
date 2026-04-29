# Next Phase Readiness

## Ready now
- Local Postgres can be started with `docker compose up -d postgres`.
- Backend code can parse Postgres env config, run a safe health check, and run ordered SQL migrations.
- DB1 import metadata tables are defined for future source imports.
- Tests cover config parsing, migration idempotency, metadata normalization, and current runtime-store independence.

## Constraints to preserve
- Keep Postgres sidecar-only until an explicit later migration phase proves parity and fallback safety.
- Do not move current product, shopping, watchlist, or basket reads to Postgres in DB2.
- Do not put raw USDA or Open Food Facts bulk data into Firestore.
- Keep both backend trees mirrored.

## Recommended next focus
1. DB2 USDA macro import schema and importer.
2. Keep DB2 imports read-only and sidecar-only.
3. Publish compact Firestore read models only after reviewed runtime-safe nutrition profiles exist.
