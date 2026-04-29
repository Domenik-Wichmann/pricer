# DB5C Operator Actions

No required operator action remains for DB5C.

Optional local execution with configured Postgres:
- Run `npm run db:migrate` to apply migration `018_db5c_recipe_promotion_usability.sql`.
- Inspect staged recipe candidates with `npm run db5c:review-and-promote-recipe -- --list --status=staged --json`.
- Inspect one staged job with `npm run db5c:review-and-promote-recipe -- --job-id=<job_id> --json`.
- Promote a staged recipe with `npm run db5c:review-and-promote-recipe -- --job-id=<job_id> --decision=approved --json`.

