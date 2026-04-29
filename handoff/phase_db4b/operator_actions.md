# DB4B Operator Actions

No manual operator action is required for repository correctness.

Optional local data action:

1. Configure local Postgres with `DATABASE_URL` or the repo `POSTGRES_*` environment variables.
2. Run `npm run db:migrate`.
3. Seed prior sidecar data as needed: DB3A ingredients, DB3D approved ingredient nutrition profiles, and DB4A recipes.
4. Run `npm run db4b:generate-recipe-nutrition-profiles -- --dry-run --json`.
5. Run without `--dry-run` when the preview report is acceptable.
