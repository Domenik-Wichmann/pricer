# DB4D Operator Actions

None required for this phase.

DB4D is read-only reporting over existing Postgres sidecar tables. Operators can optionally run:

1. `npm run db4d:report-recipe-quality -- --json`
2. `npm run db4d:report-recipe-quality -- --status=usable --missing-products`

These commands do not mutate canonical recipe, nutrition, product-mapping, or staging data.
