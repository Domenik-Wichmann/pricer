# UX1 Next Phase Readiness

Ready follow-ons:

1. Add review or note APIs on top of the UX1 repository without changing the current storage contract.
2. Attach future swipe feedback as another sidecar table keyed to `profile_id`.
3. Let future planner/recommendation work read `user_food_profiles`, constraints, preferences, and equipment explicitly instead of overloading saved-list or watchlist state.

Known constraints:

- UX1 currently assumes one active profile row per `user_id`.
- Constraint targets are normalized keys only; there is no canonical review layer for those targets yet.
- Equipment uses an `available` flag rather than delete semantics, while preferences currently update in place by logical key.
