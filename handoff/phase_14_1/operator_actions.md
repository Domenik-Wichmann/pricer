# Operator Actions

## Purpose
Phase 14.1 is implemented in code. No operator action is required for normal ingest because live model adjudication remains disabled unless explicitly enabled.

## Ordered steps
1. Keep `ENABLE_LLM_DISAMBIGUATION=false` for production until prompt review, budget policy, and decision-application policy are approved.
2. If testing the caller against a real model, set `XAI_API_KEY`, choose `XAI_GROK_MODEL` if needed, and invoke the runner explicitly with network enabled.
3. Review persisted `canonical_disambiguation_decisions` before any later phase applies them to downstream canonical behavior.
4. Treat malformed-response metrics as blockers for automation; do not apply decisions from runs that report malformed responses.
