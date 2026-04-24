# Phase DB1 Implementation Contract

## Goal

Introduce Postgres foundation and migration tooling as a sidecar without changing the current `kolkostruva.bg -> Firestore/flat store -> App` runtime path.

## Runtime Modules

- `functions/src/db/postgres.js`
- `functions/src/db/migrations.js`
- `functions/src/db/import_metadata_repository.js`
- `app/functions/src/db/postgres.js`
- `app/functions/src/db/migrations.js`
- `app/functions/src/db/import_metadata_repository.js`

## Scripts

- `npm run db:health`
- `npm run db:migrate`
- `npm run test:db1`

## Schema

DB1 creates only:

- `schema_migrations`
- `source_datasets`
- `source_files`
- `import_batches`

No USDA, Open Food Facts, recipe, product, ingredient, or canonical migration is part of DB1.

## Safety Rules

- Do not rewrite `phase1/store.js`.
- Do not change product ingest behavior.
- Do not remove Firestore usage.
- Do not move canonical products or ingredients.
- Do not switch product/search/shopping/basket read paths to Postgres.
- Keep both backend trees mirrored.
- Existing tests must keep passing.

## Verification Targets

- config parsing supports URL and discrete env vars
- missing config is safe
- migration runner is deterministic and idempotent
- migration checksum changes are guarded
- import metadata repository validates and writes general source metadata
- real DB insert/read is supported when local Postgres is configured
- existing runtime store selection is independent from Postgres config
