# Operator Actions

## Purpose
Only the live deployment and runtime checks that cannot be completed from this coding workspace remain.

## Ordered steps
1. Deploy the backend build that includes `app/functions/src/phase8/`.
2. Call the deployed basket endpoint or wrapper with a two-item query that is available at one store and confirm a valid single-store plan is returned.
3. Call the deployed basket endpoint or wrapper with a two-item query that is cheaper across two stores and confirm a valid multi-store plan is returned.
4. Call the deployed basket endpoint or wrapper with a clearly unmatched item and confirm the response still returns a plan plus an unmatched item entry.
5. Verify the client or API layer sends any required `preferences` and `limits` fields in the intended shape before enabling production UI usage.
