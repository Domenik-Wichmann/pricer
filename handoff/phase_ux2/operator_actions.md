# UX2 Operator Actions

1. Ensure DB3A ingredients, DB4A recipes, and UX1 user food profiles have already been seeded if you want the UX2 seed CLI to write rows instead of reporting missing references.
2. Run `npm run db:migrate`.
3. Optional: run `npm run ux2:seed-recipe-feedback -- --json`.
4. Optional: inspect the JSON report or query the new UX2 tables directly in Postgres.

No Firestore, UI, planner, or runtime deployment action is required for UX2.
