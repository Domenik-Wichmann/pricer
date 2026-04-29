# DB4C Operator Actions

No manual operator action is required for repository correctness.

Optional local data action:

1. Configure local Postgres with `DATABASE_URL` or the repo `POSTGRES_*` environment variables.
2. Run `npm run db:migrate`.
3. Generate DB4B candidates with `npm run db4b:generate-recipe-nutrition-profiles -- --json`.
4. Review candidates with `npm run db4c:review-recipe-nutrition-profile -- --review-status=candidate --json`.
5. Approve a candidate with `npm run db4c:review-recipe-nutrition-profile -- --candidate-id=<id> --decision=approved --reviewed-by=<name> --reason="<reason>"`.
