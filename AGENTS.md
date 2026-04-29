# AGENTS.md

## Operating rules for coding agents
- Read the relevant phase document and implementation document before changing code.
- Read data_ingest_rules.md
- Read docs/REPO_MAP.md before searching broadly or changing code. Use it to identify the smallest owning module, schema, tests, and docs for the task.
- Read docs/SCHEMA_MAP.md before changing persistence, schema, ingest, app-facing records, or cross-domain mappings.
- Treat repository truth as primary. If docs and repo reality conflict, update docs rather than silently drifting.
- Keep docs/REPO_MAP.md and docs/SCHEMA_MAP.md current when you add, remove, rename, or repurpose modules, scripts, migrations, tests, persistent schemas, relationships, or feature ownership.
- Preserve history. Append decisions and handoffs; do not erase prior context without trace.
- Every completed phase must leave behind:
  - updated docs
  - updated changelog
  - updated decision log entries when relevant
  - test results in the registry / test run output
  - a handoff folder under `handoff/phase_X/`
- Keep code readable and commented.
- Human operator actions must be minimal, explicit, ordered, and limited to tasks the agent cannot complete directly.
- Do not mark a phase complete unless acceptance criteria and required tests pass or a blocker is documented clearly.

## Implementation pattern
1. Read planning docs.
2. Read docs/REPO_MAP.md, docs/SCHEMA_MAP.md, and docs/DATA_MODEL.md to find the owning code, schema, tests, and docs.
3. Read implementation contract for the target phase.
4. Implement targeted changes in the owning files; mirror backend changes between `functions/src/` and `app/functions/src/` unless the phase says otherwise.
5. Run tests.
6. Write results.
7. Produce operator handoff.
8. Update readiness for next phase.

## Repo map discipline
- Treat docs/REPO_MAP.md as the navigation schema for future sessions.
- Treat docs/SCHEMA_MAP.md as the database/schema relationship atlas for future sessions.
- Do not wander the repo from scratch when the map points to an owner. Start there, then use targeted searches inside the named area.
- When a change makes the map stale, update the map in the same work item and mention the update in CHANGELOG.md.
- If DATA_MODEL.md and REPO_MAP.md disagree about persistence ownership, inspect repo reality, update the stale doc, and add a decision_log.md entry if the boundary changed.
