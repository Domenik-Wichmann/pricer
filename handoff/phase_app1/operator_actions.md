# APP1 Operator Actions

No special operator work is required beyond the normal backend and sidecar setup:

1. ensure Postgres configuration is present for the meal-planning sidecar modules
2. run `npm run db:migrate` if the local sidecar schema is not current
3. start the backend as usual
4. call the new endpoints as needed:
   - generate a plan:
     - `POST /meal-plans/generate`
   - fetch a plan:
     - `GET /meal-plans/:planId`
   - run shopping for an existing plan:
     - `POST /meal-plans/:planId/shopping/run`
   - fetch a shopping run:
     - `GET /meal-plan-shopping-runs/:runId`
   - fetch an optimized basket:
     - `GET /meal-plan-optimized-baskets/:basketId`

Example JSON body for plan generation:

```json
{
  "profile_id": "profile-demo-1",
  "start_date": "2026-05-01",
  "days": 7,
  "meals_per_day": 3
}
```
