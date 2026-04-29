# Operator Actions

## Purpose
DB1 adds local/dev Postgres sidecar support. No production action is required unless you want to run the new DB scripts.

## Local steps
1. Start local Postgres:
   - `docker compose up -d postgres`
2. Set local env values:
   - `POSTGRES_HOST=localhost`
   - `POSTGRES_PORT=5432`
   - `POSTGRES_DB=pricer_dev`
   - `POSTGRES_USER=pricer`
   - `POSTGRES_PASSWORD=pricer_dev_password`
   - `POSTGRES_SSL=false`
3. Run health check:
   - `npm run db:health`
4. Run migrations:
   - `npm run db:migrate`
5. Run DB1 tests:
   - `node tests/db1_postgres_foundation.test.js`

## Production caution
- Do not configure product/search/shopping/basket runtime reads to use Postgres yet.
- Do not import USDA/OFF/recipes in DB1.
- Keep Firestore as the app-facing runtime.
