# AGENTS.md

## Operating rules for coding agents
- Read the relevant phase document and implementation document before changing code.
- Read data_ingest_rules.md
- Treat repository truth as primary. If docs and repo reality conflict, update docs rather than silently drifting.
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
2. Read implementation contract for the target phase.
3. Implement.
4. Run tests.
5. Write results.
6. Produce operator handoff.
7. Update readiness for next phase.
