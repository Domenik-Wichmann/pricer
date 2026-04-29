# Operator Actions

## Purpose
Phase 15.3 is implemented and locally verified. No new secrets or write-side operator steps are required for the shopping-list resolver itself.

## Ordered steps
1. Deploy the updated Firebase Functions package if you want the live route available:
   - `POST /shopping-list/resolve`
2. Keep `ENABLE_LLM_ENRICHMENT=true` in runtime config unless you intentionally want offline-only enrichment behavior.
3. Keep `XAI_API_KEY` configured only if you want net-new canonical fingerprints to receive live enrichment; cached product resolution continues to work without it.
4. Keep basket-planning consumers on top of the resolver output instead of joining canonical, applied-view, and enrichment layers directly.
5. Do not treat shopping-list resolution output as a mutation of canonical truth; it is a read-only ranking layer.
