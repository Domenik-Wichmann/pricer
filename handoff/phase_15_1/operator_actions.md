# Operator Actions

## Purpose
Phase 15.1 is implemented and locally verified. Only runtime configuration choices remain for live enrichment and downstream consumer rollout.

## Ordered steps
1. In deployed runtime config, set `ENABLE_LLM_ENRICHMENT=true` unless you intentionally want to disable live enrichment.
2. Store `XAI_API_KEY` in runtime secret storage if you want net-new canonical fingerprints to call the live enrichment model.
3. If you enable live enrichment, monitor ingest-run fields:
   - `canonical_enrichment_created_count`
   - `canonical_enrichment_reused_count`
   - `canonical_enrichment_rejected_count`
   - `canonical_enrichment_offline_missing_count`
   - `canonical_enrichment_model_call_count`
4. When building the first downstream consumers, choose reader layer selection explicitly:
   - `canonical_truth`
   - `canonical_with_applied_view`
   - `canonical_with_enrichment`
   - `canonical_with_applied_view_and_enrichment`
5. Do not treat enrichment-backed readers as canonical truth mutation. Canonical ids, mappings, and deterministic marker precedence remain authoritative.
