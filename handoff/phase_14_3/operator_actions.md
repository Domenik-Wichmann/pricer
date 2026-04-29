# Operator Actions

## Purpose
Phase 14.3 is implemented in code. The controlled application layer computes an applied view and audit log, but canonical truth remains unchanged.

## Ordered steps
1. Treat `disambiguation_application_preview` as a report, not a canonical data mutation.
2. Review `skipped_conflicts` first because they indicate a decision attempted to merge across deterministic hard-marker boundaries.
3. Review `blocked_merges` and `applied_merges` samples before any downstream consumer reads the applied view.
4. Do not build user-facing canonical experiences from this view until reporting and rollback expectations are agreed.
