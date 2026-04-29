# UX2 Recipe Feedback

Date: 2026-04-25
Status: IMPLEMENTED - POSTGRES SIDECAR ONLY

## Scope

UX2 adds explicit, append-only recipe feedback storage for future taste profiling and meal-planning work.

It stores:

- recipe impressions
- swipe-left, swipe-right, and swipe-up feedback
- save, cooked, cooked-again, and dismissed events
- optional feedback notes
- manual note signals such as timing, family response, and price
- an explicit behavior history that PROF1 now converts into append-only taste snapshots

UX2 does not build UI, infer taste profiles, change planner behavior, write Firestore, or change runtime recommendations.

## Architecture

```text
user_food_profiles
+ recipes
-> recipe_feedback_events
-> recipe_feedback_note_signals
-> PROF1 taste profile snapshots
-> future planner / learning layers
```

UX2 is deliberately event-sourced. Feedback rows are append-only user history, while note signals are child evidence rows attached to one specific feedback event.

## Migration

```text
db/migrations/020_ux2_recipe_swipe_feedback.sql
```

Creates:

- `recipe_feedback_events`
- `recipe_feedback_note_signals`

Supported `event_type` values:

```text
impression
swipe_left
swipe_right
swipe_up
saved
cooked
cooked_again
dismissed
```

Supported `source` values:

```text
swipe
explicit
note
system
```

Supported note `signal_type` values:

```text
taste
texture
timing
difficulty
substitution
portion_size
family_response
price
availability
```

## Repository

```text
functions/src/db/users/recipe_feedback_repository.js
app/functions/src/db/users/recipe_feedback_repository.js
```

Supported behavior:

- record impression
- record swipe left/right/up
- record save, cooked, cooked-again, and dismissed events
- record note-backed feedback events
- attach manual note signals
- list feedback by profile
- list feedback by recipe
- get latest feedback for one profile plus one recipe
- aggregate summary by profile
- aggregate summary by recipe
- reject deletion

Default swipe semantics:

```text
swipe_left   -> sentiment -1.0, intent 0.0
swipe_right  -> sentiment 0.5, intent 0.6
swipe_up     -> sentiment 1.0, intent 1.0
saved        -> sentiment 0.8, intent 0.9
cooked       -> sentiment 0.5, intent 0.8
cooked_again -> sentiment 1.0, intent 1.0
```

The repository resolves `user_id` to an existing UX1 profile and `recipe_key` to an existing DB4A recipe before writing event rows. UX2 never creates profiles or recipes automatically.

## Seed Fixture

```text
data/seeds/recipe_feedback_seed.json
```

Fixture coverage includes:

- cozy/high-protein positive feedback
- spicy dislike feedback
- easy family meal positive feedback
- note example: `needed 10 more minutes`
- note example: `kids loved it`
- note example: `too expensive this week`

Fixture events use deterministic ids so the seed CLI is idempotent for local verification.

## CLI

```powershell
npm run ux2:seed-recipe-feedback -- --dry-run --json
npm run ux2:seed-recipe-feedback -- --limit=4 --json --out=tmp/ux2_seed_report.json
```

CLI summary fields:

- `events_seen`
- `events_written`
- `signals_written`
- `skipped_missing_profiles`
- `skipped_missing_recipes`
- `errors`

Dry run validates the referenced UX1 profiles and DB4A recipes, then returns the bounded event payloads without writing Postgres rows.

## Boundaries

UX2 deliberately does not:

- write Firestore
- build UI
- infer taste profiles
- change planner behavior
- change recommendation behavior
- mutate recipes, products, ingredients, or nutrition profiles
- call LLMs

PROF1 reads UX2 rows as audited source evidence only. Feedback events and note signals remain append-only and are not rewritten by taste-profile generation.
