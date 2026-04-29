# PLAN1 Deterministic Meal Planner

Date: 2026-04-29
Status: IMPLEMENTED - POSTGRES SIDECAR ONLY

## Scope

PLAN1 adds the first deterministic weekly meal-planning layer on the Postgres sidecar.

It reads:

- UX1 `user_food_profiles`
- PROF1 `user_taste_profile_snapshots`
- DB4 canonical `recipes`
- approved `recipe_nutrition_profiles`

It writes:

- `meal_plans`
- `meal_plan_items`

PLAN1 does not write Firestore, call an LLM, mutate recipes or products, run basket optimization, add sponsored logic, or change runtime recommendation behavior outside explicit planner invocation.

## Architecture

```text
user_food_profiles
+ user_taste_profile_snapshots
+ recipes (usable / meal_plan_ready)
+ recipe_nutrition_profiles (approved)
-> meal_plans
-> meal_plan_items
```

Canonical recipe truth remains separate from planner output. The planner snapshots recipe ids, recipe keys, nutrition values, and score reasons into sidecar plan rows.

## Migration

```text
db/migrations/022_plan1_meal_plans.sql
```

Creates:

- `meal_plans`
- `meal_plan_items`

Supported `meal_type` values:

```text
breakfast
lunch
dinner
snack
```

## Engine

```text
functions/src/db/planner/meal_planner_engine.js
app/functions/src/db/planner/meal_planner_engine.js
```

Main behavior:

1. Load one UX1 profile bundle.
2. Load the latest PROF1 taste snapshot when available.
3. Fall back to explicit UX1 preferences when no PROF1 snapshot exists yet.
4. Read eligible canonical recipes:
   - `usability_status IN ('usable', 'meal_plan_ready')`
   - approved `recipe_nutrition_profiles` only
5. Filter out hard conflicts:
   - allergies / hard avoids
   - explicit unavailable equipment
   - max prep / total time when present
6. Score candidates deterministically from:
   - taste match
   - nutrition closeness
   - time preference
   - repeat / cuisine variety penalties
7. Build day-by-day meal slots, preferring globally unused recipes before repeats when possible.
8. Upsert one plan row and replace the plan's item rows for that `plan_key`.

The scoring weights are simple constants in code and are intentionally easy to inspect:

- taste: `0.45`
- nutrition: `0.40`
- time: `0.15`

## Idempotency

`plan_key` is deterministic from:

```text
profile_id + start_date + rules_version
```

That means the same profile and start date under the same rules version resolve to one canonical sidecar plan. Re-running PLAN1 refreshes that plan instead of creating duplicates.

## CLI

```powershell
npm run plan1:generate-meal-plan -- --user-id=user_demo --start-date=2026-04-28 --days=7 --meals-per-day=3 --dry-run --json
npm run plan1:generate-meal-plan -- --profile-id=user_food_profile:user_demo --start-date=2026-04-28 --out=tmp/plan1_report.json
```

Supported flags:

- `--profile-id`
- `--user-id`
- `--start-date=YYYY-MM-DD`
- `--days`
- `--meals-per-day`
- `--dry-run`
- `--json`
- `--out`

CLI summary fields:

- `recipes_considered`
- `recipes_filtered`
- `plan_items_created`
- `average_selection_score`
- `daily_calorie_summary`
- `macro_summary`
- `errors`

## Backend API

APP1 exposes PLAN1 through the existing backend HTTP surface.

Routes:

```text
POST /meal-plans/generate
GET /meal-plans/:planId
```

Request wrapper:

```text
functions/src/api/meal_planning_api.js
app/functions/src/api/meal_planning_api.js
```

Behavior:

- `POST /meal-plans/generate` is a thin wrapper over `generateMealPlan(...)`
- `GET /meal-plans/:planId` returns the stored plan row, ordered `meal_plan_items`, recipe snapshots, and macro totals
- the API does not add a second planning implementation; it reuses the existing PLAN1 engine and Postgres sidecar tables directly

Example payload:

```json
{
  "profile_id": "user_food_profile:user_demo",
  "start_date": "2026-04-29",
  "days": 7,
  "meals_per_day": 3
}
```

## Boundaries

PLAN1 deliberately does not:

- write Firestore
- call an LLM
- build UI
- mutate recipe or product truth
- create ingredients
- optimize baskets
- add sponsored logic
- change recommendation behavior outside explicit planner generation
