# PLAN2D Operator Actions

No operator action is required beyond the usual sidecar setup:

1. start/configure Postgres
2. run `npm run db:migrate`
3. ensure runtime data state is available to the existing canonical product and price lookup backbone
4. run PLAN2D orchestration:
   - existing plan:
     - `npm run plan2d:run-meal-plan-shopping -- --plan-id=<plan_id> --json`
   - generated plan:
     - `npm run plan2d:run-meal-plan-shopping -- --profile-id=<profile_id> --start-date=YYYY-MM-DD --days=7 --meals-per-day=3 --json`
