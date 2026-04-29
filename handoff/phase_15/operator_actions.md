# Operator Actions

## Purpose
Phase 15 is implemented and locally verified. No human action is required for local or cached enrichment flows.

## Ordered steps
1. Optional only: set `ENABLE_LLM_ENRICHMENT=true` in the runtime environment if you want live enrichment for net-new canonical fingerprints.
2. Optional only: ensure `XAI_API_KEY` is present in that same runtime before enabling live enrichment calls.
3. If live enrichment is enabled in production, monitor ingest-run fields:
   - `canonical_enrichment_created_count`
   - `canonical_enrichment_reused_count`
   - `canonical_enrichment_rejected_count`
   - `canonical_enrichment_offline_missing_count`
4. Treat `canonical_enrichment_store` as additive read data. Do not use it to rewrite canonical ids, mappings, or deterministic markers.
