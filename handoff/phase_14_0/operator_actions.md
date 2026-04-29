# Operator Actions

## Purpose
Phase 14.0 is implemented in code. No new operator setup is required to keep current canonical behavior safe because this phase does not enable live LLM adjudication yet.

## Ordered steps
1. Keep the new disambiguation lane in dry-run mode only until the Phase 14.1 decision-application policy is reviewed.
2. Review a sample of stored `canonical_disambiguation_queue` records from real archive runs to confirm the structured evidence is sufficient for narrow merge-vs-distinct adjudication.
3. Before enabling any model-backed adjudication later, decide where production decision records should live long-term and how prompt-version changes should affect fingerprint reuse.
