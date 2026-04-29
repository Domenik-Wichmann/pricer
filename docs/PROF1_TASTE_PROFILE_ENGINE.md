# PROF1 Taste Profile Engine

Date: 2026-04-25  
Status: IMPLEMENTED - POSTGRES SIDECAR ONLY

## Scope

PROF1 builds deterministic user taste profile snapshots from:

- explicit UX1 food preferences
- explicit UX1 constraints and profile bounds
- UX2 recipe feedback events
- UX2 recipe feedback note signals
- canonical recipe metadata plus promoted staged recipe flavor, texture, feeling, region, and cooking-method metadata

PROF1 does not write Firestore, build UI, run a planner, call an LLM, mutate recipes/products, or change runtime recommendation behavior.

## Architecture

```text
user_food_profiles
+ user_food_preferences
+ user_food_constraints
+ recipe_feedback_events
+ recipe_feedback_note_signals
+ recipes
+ recipe_promotion_history
+ recipe_ingest_staged_recipes
+ recipe_ingest_staged_methods
-> user_taste_profile_snapshots
-> user_taste_profile_signal_sources
-> future planner / preference-learning layers
```

Canonical recipe rows remain independent from runtime eligibility. PROF1 reads them and their staged provenance as sidecar evidence only.

## Migration

```text
db/migrations/021_prof1_user_taste_profiles.sql
```

Creates:

- `user_taste_profile_snapshots`
- `user_taste_profile_signal_sources`

Supported `source_type` values:

```text
explicit_preference
swipe_feedback
note_signal
recipe_metadata
```

Supported `signal_family` values:

```text
flavor
texture
cuisine
region
feeling
meal_type
cooking_method
dietary
dislike
```

Snapshots are append-only by `(profile_id, snapshot_version)`. Signal sources are child audit rows keyed by `snapshot_id`.

## Engine

```text
functions/src/db/users/user_taste_profile_engine.js
app/functions/src/db/users/user_taste_profile_engine.js
```

Supported behavior:

- build one snapshot by `profile_id`
- build one snapshot by `user_id`
- build many snapshots across profiles
- dry-run builds without writes
- append new snapshot versions instead of overwriting old ones
- write per-signal audit rows for explicit preferences, note signals, and recipe metadata contributions
- normalize vector scores into a conservative `-1.0` to `1.0` range
- classify confidence from feedback event counts

Primary exported helpers:

- `buildUserTasteProfileSnapshot`
- `buildUserTasteProfileSnapshots`
- `listUserTasteProfileSnapshots`
- `listUserTasteProfileSignalSources`
- `classifyTasteProfileConfidence`

## Scoring Rules

Explicit preferences carry higher weight than inferred feedback.

Feedback influence is deterministic:

```text
swipe_left   -> strong negative
swipe_right  -> mild positive
swipe_up     -> strong positive
saved        -> strong positive
cooked       -> strong positive
cooked_again -> strong positive
dismissed    -> negative
impression   -> neutral
```

Recipe metadata contributes through:

- `cuisine_tags_json`
- `dietary_tags_json`
- `meal_type_tags_json`
- `region_tags_json`
- `feeling_tags_json`
- `flavor_profile_json`
- `texture_profile_json`
- staged `recipe_ingest_staged_methods`

Confidence bands:

```text
low    -> fewer than 5 feedback events
medium -> 5 through 20
high   -> more than 20
```

## CLI

```powershell
npm run prof1:build-user-taste-profiles -- --all --json
npm run prof1:build-user-taste-profiles -- --profile-id=user_food_profile:user_family_cozy --dry-run --json
```

Flags:

- `--profile-id=<id>`
- `--user-id=<id>`
- `--all`
- `--dry-run`
- `--json`
- `--out=path/to/report.json`
- `--limit=100`

Summary fields:

- `profiles_seen`
- `snapshots_created`
- `source_events_used`
- `source_recipes_used`
- `signal_sources_written`
- `confidence_summary`
- `errors`

## Boundaries

PROF1 deliberately does not:

- write Firestore
- build UI
- run a planner
- change runtime recommendation behavior
- mutate recipes, ingredients, products, or nutrition profiles
- infer canonical ingredient/product truth
- call LLM providers
