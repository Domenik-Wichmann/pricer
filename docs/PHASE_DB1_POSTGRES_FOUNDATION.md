# Phase DB1 Postgres Foundation

Date: 2026-04-24
Status: IMPLEMENTED AND VERIFIED LOCALLY
Scope: Postgres sidecar connection, migration tooling, and import metadata schema only

## 1. Purpose

DB1 introduces Postgres as an additive sidecar for future heavy imports and relational processing.

The current authoritative live path remains unchanged:

```text
kolkostruva.bg -> existing flat store / Firestore-compatible runtime -> App
```

DB1 does not migrate product data, does not change product ingest, does not change product search, does not change shopping or basket behavior, and does not make the mobile app talk to Postgres.

## 2. What DB1 Adds

- Local Postgres compose service in `docker-compose.yml`
- `pg` client dependency for the root test/runtime package and deployable `functions/` package
- mirrored sidecar DB modules:
  - `functions/src/db/postgres.js`
  - `functions/src/db/migrations.js`
  - `functions/src/db/import_metadata_repository.js`
  - `app/functions/src/db/postgres.js`
  - `app/functions/src/db/migrations.js`
  - `app/functions/src/db/import_metadata_repository.js`
- SQL migration folder:
  - `db/migrations/001_db1_import_metadata.sql`
- scripts:
  - `npm run db:health`
  - `npm run db:migrate`
  - `npm run test:db1`
- DB1 tests:
  - `tests/db1_postgres_foundation.test.js`

## 3. Sidecar Safety

DB1 is sidecar-only.

It does not:

- rewrite `phase1/store.js`
- change `createRuntimeDataBackboneStore`
- replace Firestore/flat-store reads
- move `canonical_products`
- move `ingredients`
- ingest USDA, Open Food Facts, recipes, or live product data
- add public API endpoints
- change existing endpoint behavior

The Postgres modules are loaded and exported for future DB phases, but no current product/search/shopping/basket runtime path depends on them.

## 4. Local Postgres

Start local Postgres:

```powershell
docker compose up -d postgres
```

Local defaults:

```text
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_DB=pricer_dev
POSTGRES_USER=pricer
POSTGRES_PASSWORD=pricer_dev_password
POSTGRES_SSL=false
```

The compose service uses a persistent Docker volume named `pricer_postgres_data`.

## 5. Environment Contract

Supported connection modes:

```text
DATABASE_URL=postgres://...
```

or discrete values:

```text
POSTGRES_HOST
POSTGRES_PORT
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_SSL
```

The DB module also accepts `PRICER_POSTGRES_*` aliases for hosted/runtime environments.

No Postgres env vars are required for normal tests or the existing app runtime. If Postgres is not configured, health and migration scripts skip cleanly with operator guidance.

## 6. Migration Tooling

Run migrations:

```powershell
npm run db:migrate
```

Behavior:

- SQL files are read from `db/migrations/`
- files are applied in deterministic filename order
- applied migrations are tracked in `schema_migrations`
- checksums prevent silently changing an already-applied migration
- each migration runs in its own transaction
- missing Postgres configuration causes a safe skip, not a product-runtime failure

## 7. DB1 Tables

`schema_migrations`

- `migration_name`
- `checksum`
- `applied_at`

`source_datasets`

- `dataset_id`
- `source_name`
- `source_type`
- `version`
- `root_path`
- `license_note`
- `created_at`
- `updated_at`

`source_files`

- `source_file_id`
- `dataset_id`
- `path`
- `format`
- `bytes`
- `row_count`
- `checksum`
- `created_at`

`import_batches`

- `import_batch_id`
- `dataset_id`
- `status`
- `started_at`
- `completed_at`
- `error_message`
- `metadata_json`

These tables are general import metadata only. USDA/OFF/recipe source schemas start in later phases.

## 8. Health Check

Run:

```powershell
npm run db:health
```

The helper executes:

```sql
SELECT 1 AS ok
```

It also checks whether `schema_migrations` exists. If Postgres is not configured, it reports a clean skip and does not affect the app.

## 9. Tests

DB1 test coverage:

- Postgres config parsing
- no-config health skip
- migration ordering and idempotency with a fake client
- DB1 import metadata migration presence
- import metadata record normalization
- existing runtime store selection remains independent from Postgres config
- optional real Postgres metadata insert/read flow when local Postgres is configured

Run:

```powershell
node tests/db1_postgres_foundation.test.js
npm test
```

## 10. DB2 Readiness

DB2 can build on:

- import metadata tables
- migration runner
- Postgres health check
- source dataset/file/batch repository helpers
- local Postgres compose setup

DB2 should add USDA macro import schemas and jobs. It must still keep Postgres sidecar-only and must not move current product runtime reads.
