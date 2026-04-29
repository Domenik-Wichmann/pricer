# PLAN2B Operator Actions

No operator action is required to use the code path locally beyond the usual sidecar setup:

1. start/configure Postgres
2. run `npm run db:migrate`
3. build requirements first:
   - `npm run plan2a:build-meal-plan-requirements -- --plan-id=<plan_id>`
   - `npm run plan2a1:build-net-requirements -- --requirement-id=<requirement_id>`
4. build PLAN2B candidates:
   - `npm run plan2b:build-product-candidates -- --net-requirement-id=<net_requirement_id> --json`
