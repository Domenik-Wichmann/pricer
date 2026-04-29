# Operator Actions

## Purpose
Only the live environment and deployment checks that cannot be completed from this coding workspace remain.

## Ordered steps
1. Deploy the backend build that includes `app/functions/src/phase7/`.
2. Trigger one real zero-result query against the deployed query endpoint with `locality_code` and `city` populated.
3. Confirm one `demand_logs` record appears in the live datastore for that query.
4. Trigger one real manual "can't find this" submission against the deployed feedback endpoint or wrapper.
5. Confirm:
   - one `feedback_events` record is created
   - one `demand_logs` record is created
6. Open a terminal in the deployed repo checkout and run `npm run phase7:run` after at least a few demand logs exist.
7. Verify the live datastore now contains:
   - `demand_aggregates`
   - `demand_embeddings`
   - `demand_clusters`
8. Call the live top-demand and trending-demand surfaces and confirm they return ranked items for the populated city.
