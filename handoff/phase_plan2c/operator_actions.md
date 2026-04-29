# PLAN2C Operator Actions

No operator action is required to use the code path locally beyond the usual sidecar setup:

1. start/configure Postgres
2. run `npm run db:migrate`
3. build upstream meal-plan adapters first:
   - `npm run plan2a:build-meal-plan-requirements -- --plan-id=<plan_id>`
   - `npm run plan2a1:build-net-requirements -- --requirement-id=<requirement_id>`
   - `npm run plan2b:build-product-candidates -- --net-requirement-id=<net_requirement_id>`
4. run PLAN2C optimization:
   - `npm run plan2c:optimize-meal-plan-basket -- --candidate-set-id=<candidate_set_id> --json`
