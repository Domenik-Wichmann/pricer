# PLAN2 End-To-End Meal-Plan Shopping Orchestration

Date: 2026-04-29
Status: IMPLEMENTED - POSTGRES SIDECAR ONLY

## Scope

PLAN2D adds one thin orchestration layer above the already implemented PLAN1 and PLAN2A through PLAN2C modules.

It can:

- use an existing stored meal plan
- or generate a new PLAN1 meal plan first
- then run the existing PLAN2A, PLAN2A.1, PLAN2B, and PLAN2C steps in order
- and persist one deterministic orchestration run summary

It does not add:

- a new optimizer
- a new price lookup
- new sponsored logic
- Firestore writes
- LLM calls
- UI
- runtime behavior changes outside explicit invocation

## Architecture

```text
user/profile
-> PLAN1 meal planner (optional)
-> PLAN2A requirements
-> PLAN2A.1 net requirements
-> PLAN2B product candidates
-> PLAN2C optimized basket
-> meal_plan_shopping_runs
```

## Migration

```text
db/migrations/028_plan2d_meal_plan_shopping_runs.sql
```

Creates:

- `meal_plan_shopping_runs`

Supported `run_status` values:

```text
started
completed
partial
failed
```

## Module

```text
functions/src/db/planner/meal_plan_shopping_orchestrator.js
app/functions/src/db/planner/meal_plan_shopping_orchestrator.js
```

Main behavior:

1. Resolve one existing meal plan by `plan_id` or `plan_key`, or generate one new PLAN1 plan.
2. Call PLAN2A requirements on that plan.
3. Call PLAN2A.1 net requirements on the resulting requirement bundle.
4. Call PLAN2B product candidates on the resulting net-requirement bundle.
5. Call PLAN2C optimizer adaptation on the resulting candidate-set bundle.
6. Collect resulting ids:
   - `plan_id`
   - `requirement_id`
   - `net_requirement_id`
   - `candidate_set_id`
   - `optimized_basket_id`
7. Compute one deterministic summary with:
   - `total_required_grams`
   - `inventory_coverage_percent`
   - `total_estimated_price`
   - `missing_items_count`
   - `ready_items_count`
   - coverage/status breakdowns
8. Persist one deterministic `meal_plan_shopping_runs` row.

PLAN2D does not replace any lower-level module logic. It is a coordinator only.

## Idempotency

`run_key` is deterministic from:

```text
user_id + plan_key + rules_version
```

That means the same user and plan resolve to one canonical orchestration-run row under the same rules version. Re-running PLAN2D refreshes that run row instead of creating duplicates, while the underlying PLAN1/2 artifact rows keep their own existing deterministic ids and upsert rules.

## CLI

```powershell
npm run plan2d:run-meal-plan-shopping -- --plan-id=meal_plan:demo --json
npm run plan2d:run-meal-plan-shopping -- --plan-key=meal_plan:demo:key --out=tmp/plan2d_report.json
npm run plan2d:run-meal-plan-shopping -- --profile-id=user_food_profile:user_demo --start-date=2026-05-05 --days=7 --meals-per-day=3 --json
```

Supported flags:

- `--user-id`
- `--profile-id`
- `--plan-id`
- `--plan-key`
- `--start-date=YYYY-MM-DD`
- `--days`
- `--meals-per-day`
- `--dry-run`
- `--json`
- `--out`

CLI summary fields:

- `runs_created`
- `plans_used_or_created`
- `requirements_created`
- `net_requirements_created`
- `candidate_sets_created`
- `optimized_baskets_created`
- `total_estimated_price`
- `inventory_coverage_percent`
- `missing_items_count`
- `ready_items_count`
- `run_status`
- `errors`

## Backend API

APP1 exposes PLAN2D through the existing backend HTTP surface.

Routes:

```text
POST /meal-plans/:planId/shopping/run
GET /meal-plan-shopping-runs/:runId
GET /meal-plan-optimized-baskets/:basketId
```

Request wrapper:

```text
functions/src/api/meal_planning_api.js
app/functions/src/api/meal_planning_api.js
```

Behavior:

- `POST /meal-plans/:planId/shopping/run` reuses `runMealPlanShoppingOrchestration(...)` with the existing plan
- `GET /meal-plan-shopping-runs/:runId` returns the stored run summary plus linked artifact ids
- `GET /meal-plan-optimized-baskets/:basketId` returns the stored optimized basket plus selected, covered, and missing rows
- the API does not introduce a new optimizer, price lookup, candidate builder, or requirement builder; it only exposes the existing PLAN2D chain

Important boundary:

- `POST /meal-plans/:planId/shopping/run` still needs the existing runtime store because PLAN2B and PLAN2C intentionally reuse the current product and price backbone while persisting their adapter outputs in Postgres sidecar tables

## Dry-Run Note

PLAN2D reuses already-implemented lower-level modules that each persist their own deterministic sidecar artifacts. Because those modules chain through persisted ids, PLAN2D `--dry-run` suppresses `meal_plan_shopping_runs` persistence but still invokes the existing lower-level PLAN1 and PLAN2 builders with their normal deterministic upsert behavior.

That keeps the orchestration layer thin and avoids adding parallel dry-run-only logic paths for every prior phase.

## Boundaries

PLAN2D deliberately does not:

- implement a new optimizer or price lookup
- call `optimizeBasketSingleStore(...)` or `optimizeBasketMultiStore(...)` directly
- duplicate PLAN1 or PLAN2A through PLAN2C logic
- mutate runtime product, price, list, basket, or watchlist state
- write Firestore
- call an LLM
- add sponsored logic

It only composes the existing planner and shopping-adapter modules into one explicit operator/service entrypoint.
