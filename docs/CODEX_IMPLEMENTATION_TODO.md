# Codex Implementation TODO

Date: 2026-04-28

These are code and repo tasks Codex can complete without creating external accounts.

## MVP Blockers Codex Can Implement

1. Add Firebase Auth anonymous sign-in to mobile.
2. Replace local-only owner id usage with Firebase UID where available.
3. Add a migration/claiming path from existing `pricer_anon_id` to Firebase UID for saved lists, watchlist, and billing cache.
4. Add Firestore rules and indexes files and wire them in `firebase.json`.
5. Add Firestore emulator tests for `users/{uid}` ownership isolation.
6. Add `firebase_messaging` dependency and mobile FCM token registration with safe missing-permission behavior.
7. Add backend device-token registration endpoint and runtime collection if push alerts are in MVP.
8. Add tests proving FCM token registration failures do not break startup.
9. Add a local JSON-to-Firestore publish CLI for `runtime_data/state.json` or `tmp/production_state.json`.
10. Add a Firestore data availability smoke command for product search and basket optimization.
11. Add an optional Firebase `onSchedule` wrapper for Phase 6 daily ingest.
12. Wire Android and iOS native AdMob app ids from build configuration instead of hardcoded Google test ids.
13. Add `GoogleService-Info.plist` to the iOS Xcode project resources.
14. Add production API smoke tests for `GET /`, `POST /products/search`, and `POST /basket/optimize`.
15. After operator approval, run the full canonical marker backfill dry-run without `PRICER_BACKFILL_LIMIT`, review field-change examples, then run the real canonical-only backfill if the dry-run is clean.

## Nice Later

- Hosted Postgres sidecar deployment runbook.
- Postgres-to-Firestore publication pipeline for future recipe/nutrition/runtime-safe projections.
- Merchant/internal analytics account model beyond the temporary token guard.
- Real push alert scheduling and user notification preferences.
- Store-specific release automation and CI signing integration.

## Suggested First Coding Order

1. Firebase Auth anonymous ownership.
2. Firestore rules/indexes plus emulator tests.
3. Firestore data population CLI/smoke test.
4. FCM token registration and backend token endpoint.
5. Native AdMob build-config cleanup.
6. Scheduled ingest export if production ingest should be automatic.
