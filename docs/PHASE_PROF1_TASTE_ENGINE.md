Implement PROF1 deterministic taste/flavor profile engine.

Scope:
Postgres sidecar/domain layer only. No Firestore. No planner. No UI. No LLM. No runtime recommendation behavior changes.

Goal:
Build deterministic user taste profile snapshots from explicit user profile preferences, recipe metadata, and UX2 recipe feedback events.

Architecture:
user_food_profiles
+ user_food_preferences
+ recipe_feedback_events
+ recipe_feedback_note_signals
+ recipes / staged rich recipe metadata
→ user_taste_profile_snapshots
→ future meal planner

Implement:

1. Migration:
db/migrations/021_prof1_user_taste_profiles.sql

Create:

user_taste_profile_snapshots:
- snapshot_id
- profile_id
- user_id
- snapshot_version
- source_event_count
- source_recipe_count
- flavor_vector_json
- texture_vector_json
- cuisine_vector_json
- region_vector_json
- feeling_vector_json
- meal_type_vector_json
- cooking_method_vector_json
- dietary_pattern_json
- disliked_patterns_json
- preferred_constraints_json
- confidence_json
- generation_method
- rules_version
- created_at

user_taste_profile_signal_sources:
- source_id
- snapshot_id
- profile_id
- source_type
  - explicit_preference
  - swipe_feedback
  - note_signal
  - recipe_metadata
- source_ref_id
- signal_family
  - flavor
  - texture
  - cuisine
  - region
  - feeling
  - meal_type
  - cooking_method
  - dietary
  - dislike
- signal_key
- signal_score
- weight
- evidence_json
- created_at

2. Engine module:
functions/src/db/users/user_taste_profile_engine.js
mirror to:
app/functions/src/db/users/user_taste_profile_engine.js

Behavior:
- Build a profile snapshot for one profile_id or all profiles.
- Read explicit `user_food_preferences`.
- Read UX2 feedback events for that profile.
- Join feedback events to recipes.
- Use recipe metadata fields where available:
  - cuisine_tags_json
  - dietary_tags_json
  - meal_type_tags_json
  - feeling_tags_json if present
  - flavor_profile_json if present
  - texture_profile_json if present
  - cooking methods from staged metadata if linked/available
- Use note signals:
  - positive signals increase score
  - negative signals decrease score
- Weight feedback:
  - swipe_left = strong negative
  - swipe_right = mild positive
  - swipe_up = strong positive
  - saved/cooked/cooked_again = strong positive
  - dismissed = negative
- Explicit preferences should have higher weight than inferred feedback.
- Normalize vectors to roughly -1.0 to 1.0.
- Store confidence based on event count and diversity:
  - low: <5 feedback events
  - medium: 5–20
  - high: >20
- Append new snapshots; do not overwrite old snapshots.
- Store signal source rows for auditability.

3. CLI:
scripts/prof1_build_user_taste_profiles.js

Support:
- --profile-id=<id>
- --user-id=<id>
- --all
- --dry-run
- --json
- --out=path/to/report.json
- --limit=100

Return summary:
- profiles_seen
- snapshots_created
- source_events_used
- source_recipes_used
- signal_sources_written
- confidence_summary
- errors

4. Tests:
tests/prof1_user_taste_profiles.test.js

Tests must cover:
- explicit preference contributes to vector
- swipe_left creates negative signal
- swipe_up creates strong positive signal
- note signal contributes with correct polarity
- recipe cuisine/flavor/texture/feeling metadata contributes
- vectors normalize into safe range
- confidence classification low/medium/high
- snapshots are append-only
- signal sources are written
- dry-run writes nothing
- no planner behavior
- no Firestore writes
- no LLM calls

5. Docs:
Create/update:
- docs/PROF1_TASTE_PROFILE_ENGINE.md
- docs/UX1_USER_FOOD_PROFILES.md
- docs/UX2_RECIPE_FEEDBACK.md
- docs/DATA_MODEL.md
- docs/SCHEMA_MAP.md
- docs/REPO_MAP.md
- docs/TEST_REGISTRY.md
- docs/test_registry.json
- CHANGELOG.md

Add:
- docs/test_runs/phase_prof1_2026-04-25.json

Verification:
- npm run test:prof1
- npm test
- npm run validate:docs

Safety:
- No Firestore.
- No UI.
- No meal planner.
- No recommendation behavior changes.
- No recipe/product mutation.
- No LLM.

Keep deterministic, auditable, append-only, readable, and reviewable.