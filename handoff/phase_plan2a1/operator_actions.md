# PLAN2A.1 Operator Actions

No mandatory operator actions are required for repo completeness.

Optional local checks:
1. Run `npm run plan2a1:build-net-requirements -- --requirement-id=<plan2a_requirement_id> --json`.
2. Inspect `meal_plan_net_requirements` and `meal_plan_net_requirement_items` in local Postgres if you want to review the derived subtraction rows manually.
