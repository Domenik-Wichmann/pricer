# Operator Actions

No operator action is required for normal tests.

Optional full USDA import:

1. Start local Postgres:

```powershell
docker compose up -d postgres
```

2. Configure the local sidecar connection:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
```

3. Apply migrations:

```powershell
npm run db:migrate
```

4. Run the full USDA macro import:

```powershell
npm run import:usda:macros
```

The full import streams large USDA CSVs and can take time. It is intentionally not required for `npm test`.
