# Operator Actions

No operator action is required for DB4A code verification.

To seed a configured local/dev Postgres database later:

1. Ensure DB3A ingredients are migrated and seeded.
2. Run `npm run db4a:seed-recipes -- --dry-run --json`.
3. If the dry run reports no missing ingredient keys, run `npm run db4a:seed-recipes -- --json`.
