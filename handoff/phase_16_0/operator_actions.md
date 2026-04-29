# Operator Actions

## Purpose
Phase 16.0 is implemented and locally verified. No new secrets or write-side operator steps are required for price lookup itself.

## Ordered steps
1. Deploy the updated Firebase Functions package if you want the live route available:
   - `POST /prices/lookup`
2. Keep the optimizer and any future basket services consuming the new lookup contract instead of joining raw snapshots directly.
3. Treat `price_status=stale` and `price_status=missing` as explicit downstream signals rather than filling values in manually.
4. Do not treat Phase 16.0 output as a mutation of canonical truth, enrichment, or price history; it is a read-only lookup layer.
