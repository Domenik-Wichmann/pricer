Implement UX1 user food profile foundation.

Scope:
Postgres sidecar/domain layer only. No Firestore. No UI. No planner. No swipe system yet. No runtime recommendation behavior changes.

Goal:
Create the user preference and constraint schema that future swipe feedback, taste profiling, and meal planning will use.

Architecture:
users
-> user_food_profiles
-> user_food_constraints
-> user_food_preferences
-> future swipe feedback
-> future planner

Implement:

1. Migration:
db/migrations/019_ux1_user_food_profiles.sql

Create:

user_food_profiles:
- profile_id
- user_id
- household_size
- default_servings
- weekly_budget_amount
- weekly_budget_currency
- preferred_language
- cooking_skill_level
- max_prep_time_minutes
- max_total_time_minutes
- meal_prep_preference
- nutrition_goal
- daily_calorie_target
- protein_target_g
- carbs_target_g
- fat_target_g
- fiber_target_g
- sodium_limit_mg
- review_status
- created_at
- updated_at

user_food_constraints:
- constraint_id
- profile_id
- constraint_type
  - allergy
  - intolerance
  - religious
  - medical
  - dislike
  - avoid
  - required
- target_type
  - ingredient
  - ingredient_family
  - tag
  - cuisine
  - nutrient
  - product_attribute
- target_key
- severity
  - hard
  - soft
  - preference
- notes
- created_at
- updated_at

user_food_preferences:
- preference_id
- profile_id
- preference_type
  - flavor
  - texture
  - cuisine
  - region
  - feeling
  - meal_type
  - cooking_method
  - budget
  - convenience
- preference_key
- preference_score
  - -1.0 to 1.0
- source
  - explicit
  - inferred
  - swipe
  - note
- confidence
- created_at
- updated_at

user_equipment:
- equipment_id
- profile_id
- equipment_key
- available
- notes
- created_at
- updated_at

2. Repository:
functions/src/db/users/user_food_profile_repository.js
mirror to:
app/functions/src/db/users/user_food_profile_repository.js

Behavior:
- create/get/upsert profile by user_id
- update nutrition targets
- add/remove/list constraints
- add/update/list preferences
- add/update/list equipment
- get full profile bundle
- never delete profile records; use inactive/available flags where applicable

3. Seed fixture:
data/seeds/user_food_profiles_seed.json

Include 2–3 fake users:
- weight-loss user
- family meal planning user
- picky/low-spice user

Include allergies, dislikes, cuisine/flavor preferences, equipment, and nutrition targets.

4. CLI:
scripts/ux1_seed_user_food_profiles.js

Support:
- --dry-run
- --limit=100
- --json
- --out=path/to/report.json

5. Tests:
tests/ux1_user_food_profiles.test.js

Tests must cover:
- profile upsert by user_id
- nutrition target updates
- hard allergy constraint storage
- dislike/avoid constraints
- flavor/texture/cuisine preferences
- equipment availability
- full profile bundle
- idempotent seed behavior
- no planner behavior
- no Firestore writes

6. Docs:
Create/update:
- docs/UX1_USER_FOOD_PROFILES.md
- docs/DATA_MODEL.md
- docs/SCHEMA_MAP.md
- docs/REPO_MAP.md
- docs/TEST_REGISTRY.md
- docs/test_registry.json
- CHANGELOG.md

Add:
- docs/test_runs/phase_ux1_2026-04-25.json

Verification:
- npm run test:ux1
- npm test
- npm run validate:docs

Safety:
- No Firestore.
- No UI.
- No meal planner.
- No swipe system.
- No recommendation behavior.
- No recipe/product mutation.

Keep deterministic, conservative, readable, and reviewable.