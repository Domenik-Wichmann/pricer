# Operator Actions

## Purpose
Only the live deployment and runtime checks that cannot be completed from this coding workspace remain.

## Ordered steps
1. Deploy the backend build that includes `app/functions/src/phase9/`.
2. Provide one live watchlist item with a target price and verify the deployed target-price endpoint or wrapper updates it correctly.
3. Run one daily watchlist intelligence pass in the production environment after a fresh daily aggregation is available.
4. Confirm the live datastore contains:
   - `watchlist_profiles`
   - `watchlist_recurring_patterns`
   - `watchlist_insight_events`
   - `watchlist_daily_summaries`
5. Verify one watched item with a meaningful drop produces an insight and one cooldown-safe nudge.
6. Verify a second run inside the cooldown window does not create a repeat nudge for the same item.
7. Call the live watchlist summary and insights surfaces for one user and confirm they return current data.
