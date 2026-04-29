# Phase 18.3 Next Phase Readiness

Phase 18.3 is ready for the next mobile phase.

## Ready

- Home has a single top entry point for product search and draft basket entry.
- `/search` receives a `query` argument safely.
- `/optimize` receives parsed draft `items` safely.
- Existing home summary, product, saved-list, watchlist, monetization, localization, and static mobile tests pass.

## Remaining For Full Search Screen

- Build a real `/search` screen that consumes the passed query and calls the existing product search API.
- Decide whether recent-search persistence should happen on search route submit instead of home route-entry.
- Add result-list UI states for loading, empty, error, and product-card navigation.

## Remaining For Basket Draft UI

- Replace the `/optimize` placeholder with a real basket draft/optimization flow.
- Decide when draft items become persisted saved-list input, if at all.
- Wire resolver/planner/optimizer calls behind an explicit user action, not on every home-screen entry.
