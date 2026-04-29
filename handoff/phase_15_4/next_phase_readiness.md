# Next Phase Readiness

## Ready now
- The backend can turn shopping-list items into a structured basket plan with ready, ambiguous, and unresolved buckets.
- Planner policies make readiness and confirmation requirements explicit before optimization starts.
- The optimizer can now consume a deterministic basket-input contract instead of raw free text or raw resolver output.

## Constraints to preserve
- Keep canonical truth and canonical mappings immutable.
- Keep enrichment additive only.
- Keep applied disambiguation as a policy/view layer.
- Keep the basket planner deterministic and read-only.
- Keep quantity and marker handling as signal preservation only in this phase.

## Recommended next focus
1. Update the basket optimizer to consume planner output directly.
2. Decide how ambiguous carried candidates should be handled in optimization scoring.
3. Add runtime reporting for planner readiness rate, confirmation rate, and unresolved-block rate.
