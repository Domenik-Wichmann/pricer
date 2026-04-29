# Operator Actions

## Purpose
Phase 15.4 is implemented and locally verified. No new secrets or persistence steps are required for the basket-input planner itself.

## Ordered steps
1. Deploy the updated Firebase Functions package if you want the live route available:
   - `POST /basket/plan`
2. Keep `ENABLE_LLM_ENRICHMENT=true` in runtime config unless you intentionally want offline-only enrichment behavior.
3. Keep `XAI_API_KEY` configured only if you want net-new canonical fingerprints to receive live enrichment; cached planning continues to work without it.
4. Feed the optimizer from the planner output instead of bypassing back to raw shopping-list text.
5. Do not treat basket plans as canonical mutations; they are deterministic planning views only.
