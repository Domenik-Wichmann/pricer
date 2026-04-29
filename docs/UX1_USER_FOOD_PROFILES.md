# UX1 User Food Profiles

Date: 2026-04-25
Status: IMPLEMENTED - POSTGRES SIDECAR ONLY

## Scope

UX1 creates the first Postgres-side user food profile domain for future taste profiling, recipe swipe feedback, and meal-planning work.

It stores:

- user food profile basics
- hard and soft food constraints
- explicit or inferred preferences
- available cooking equipment
- a stable profile anchor for UX2 recipe feedback
- the explicit preference and constraint inputs that PROF1 taste snapshots now read

UX1 does not write Firestore, build UI, run a planner, change runtime recommendations, or mutate recipe/product truth. UX2 now stores explicit recipe feedback in a separate append-only sidecar layer.

## Architecture

```text
users
-> user_food_profiles
-> user_food_constraints
-> user_food_preferences
-> user_equipment
-> UX2 recipe feedback
-> PROF1 taste snapshots
-> future planner
```

Canonical recipes, ingredients, and products are unchanged by UX1. This phase only creates the user preference/constraint layer they can later attach to.

## Migration

```text
db/migrations/019_ux1_user_food_profiles.sql
```

Creates:

- `user_food_profiles`
- `user_food_constraints`
- `user_food_preferences`
- `user_equipment`

Supported `review_status` values for profiles:

```text
draft
active
inactive
needs_review
```

Supported `constraint_type` values:

```text
allergy
intolerance
religious
medical
dislike
avoid
required
```

Supported `target_type` values:

```text
ingredient
ingredient_family
tag
cuisine
nutrient
product_attribute
```

Supported `severity` values:

```text
hard
soft
preference
```

Supported `preference_type` values:

```text
flavor
texture
cuisine
region
feeling
meal_type
cooking_method
budget
convenience
```

Supported `source` values:

```text
explicit
inferred
swipe
note
```

## Repository

```text
functions/src/db/users/user_food_profile_repository.js
app/functions/src/db/users/user_food_profile_repository.js
```

Supported behavior:

- create profile
- upsert profile by `user_id`
- get profile by `profile_id`
- get profile by `user_id`
- update nutrition targets
- add/remove/list constraints
- add/update/list preferences
- add/update/list equipment
- get full profile bundle
- preserve stable ids for profile, constraint, preference, and equipment rows
- reject profile deletion

Deterministic row identity is based on normalized user/profile keys plus unique domain fields, so repeated seed runs refresh the same rows instead of duplicating them.

## Seed Fixture

```text
data/seeds/user_food_profiles_seed.json
```

Includes:

- weight-loss user
- family meal-planning user
- picky / low-spice user

Each fixture bundle includes profile settings, constraints, preferences, equipment, and nutrition targets.

## CLI

```powershell
npm run ux1:seed-user-food-profiles -- --dry-run --json
npm run ux1:seed-user-food-profiles -- --limit=2 --json --out=tmp/ux1_seed_report.json
```

CLI summary fields:

- `scanned`
- `profiles_upserted`
- `constraints_upserted`
- `preferences_upserted`
- `equipment_upserted`
- `bundles`

Dry run returns the bounded seed bundles without writing Postgres rows.

## Boundaries

UX1 deliberately does not:

- write Firestore
- build UI screens
- run meal planning
- add swipe feedback storage inside these UX1 tables
- change recommendation behavior
- mutate recipes, products, ingredients, or nutrition profiles
- auto-infer canonical food constraints from runtime behavior

PROF1 now reads UX1 preferences, constraints, and profile bounds as deterministic inputs, but UX1 remains the source of truth for those rows.
