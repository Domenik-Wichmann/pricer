# Operator Actions

## Purpose
Phase 15.2 is implemented and locally verified. No new secrets are required beyond the existing Phase 15 enrichment configuration.

## Ordered steps
1. Deploy the updated Firebase Functions package if you want the live HTTP routes available:
   - `GET /products/:id`
   - `POST /products/search`
   - `POST /products/filter-facets`
   - `GET /analytics/enrichment-summary`
2. Keep `ENABLE_LLM_ENRICHMENT=true` in runtime config unless you intentionally want offline-only enrichment behavior.
3. Keep `XAI_API_KEY` configured only if you want net-new canonical fingerprints to use live enrichment; cached enrichment-backed product APIs continue to work without it.
4. When wiring downstream consumers, choose layer mode explicitly if you need anything other than the default `canonical_with_enrichment`.
5. Do not treat applied-view responses as canonical truth; they remain policy/view projections only.
