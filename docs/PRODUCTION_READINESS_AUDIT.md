# Production Readiness Audit

Date: 2026-04-28

## Verdict

Pricer is close to a real MVP from a code-surface perspective, but it is not production-ready yet. The backend can run on Firestore, and the mobile app can talk to the Functions API. The launch blockers are production configuration, Firestore security/indexes, real ownership/auth, push-token registration, monetization account config, signing/store setup, and a repeatable Firestore data population command/runbook.

Hosted Postgres is not required for the current mobile MVP runtime. Local Docker/Postgres is a sidecar for import/review/planning domains. The live app runtime should be Firebase Functions plus Firestore.

## 1. Backend Runtime

Already implemented:

- Firebase deploy manifest points at `functions`: `firebase.json:1-4`.
- Default Firebase project is `pricer-ee440`: `.firebaserc:1-4`.
- Functions API uses Express and exports one v2 HTTPS function named `api`: `functions/index.js:1-4` and `functions/index.js:991-995`.
- Region is set globally to `europe-west1`: `functions/index.js:66-69`.
- API routes include product search, basket optimize, saved lists, watchlist, locations, entitlement, and internal analytics: `functions/index.js:140-205`.
- Runtime persistence selection supports memory, JSON, and Firestore: `functions/src/phase1/store.js:220-245`.
- Production defaults to Firestore if `NODE_ENV=production`: `functions/src/phase1/store.js:247-261`.
- Firestore collection prefix exists: `functions/src/phase1/store.js:237-241` and `functions/src/phase1/store.js:289-291`.
- Firestore Admin client can use ADC/runtime service account plus optional project/database env vars: `functions/src/phase1/store.js:264-287`.

Missing or not production-ready:

- No Firebase scheduled function is exported. Scheduler helper/code exists (`functions/src/phase6/scheduler.js:1-20`, `functions/src/phase6/jobs.js:10-112`), and CLI exists (`scripts/run_phase6_pipeline.js:10-31`), but no `onSchedule` export is present in `functions/index.js`.
- No Functions runtime secrets are declared with Firebase v2 secret params. Current code reads `process.env`.
- `PRICER_INTERNAL_ANALYTICS_TOKEN` must be configured before guarded internal analytics endpoints work: `functions/src/phase18/internal_access.js:3-26`.
- Production API URL must be verified after deploy. The expected URL from current export and region is `https://europe-west1-pricer-ee440.cloudfunctions.net/api`.

Can run as MVP backend only if:

- deployed Functions env selects Firestore
- Firestore has runtime collections populated
- rules/indexes are in place for client-facing Firestore user docs
- mobile build points at the deployed `/api`

## 2. Firestore

Already implemented:

- Runtime collection list is complete in code: `functions/src/phase1/store.js:5-58`.
- Deterministic Firestore document ids are defined for every runtime collection: `functions/src/phase1/store.js:63-115`.
- Firestore save/load is implemented with top-level collections and batch writes: `functions/src/phase1/store.js:150-217`.
- Firestore persistence notes document one document per flat record and composite document ids: `docs/DATA_MODEL.md:881-906`.
- Mobile also has direct user-scoped Firestore repositories under `users/{anon_id}`: `app/mobile/lib/core/services/firestore_repositories.dart:40-47`, `app/mobile/lib/core/services/firestore_repositories.dart:146-153`, and `app/mobile/lib/core/services/billing_repositories.dart:15-25`.

Missing:

- No `firestore.rules` file found.
- No `firestore.indexes.json` file found.
- `firebase.json` does not configure Firestore rules or indexes.
- Mobile Firestore user state cannot be secured properly until Firebase Auth anonymous identity replaces the local-only id.

Can app run only on Firestore?

Yes for the current MVP runtime. The backend flat store can be Firestore-backed, and the mobile app talks to Functions for the Phase 18 saved-list/watchlist/search/basket surfaces. Direct mobile Firestore repositories remain for legacy/local list/watchlist streams and billing cache, so rules and auth are still required.

Expected runtime collections:

- Top-level backend collections are the keys in `createEmptyDataBackbone()`: `raw_price_snapshots`, `source_products`, `source_product_enrichment`, `canonical_products`, `canonical_product_mappings`, `canonical_enrichment_store`, `retailer_locations`, `retailer_location_geocodes`, `manual_location_geocodes`, `location_review_candidates`, `reviewed_location_coordinates`, `saved_lists_store`, `watchlist_store`, `saved_user_locations`, `user_tiers`, `revenuecat_events`, and the other phase collections listed in `functions/src/phase1/store.js:5-58`.
- Client collections are `users/{anon_id}/lists`, `users/{anon_id}/lists/{list_id}/items`, `users/{anon_id}/watchlist`, and `users/{anon_id}/billing/profile`: `docs/DATA_MODEL.md:1873-1914`.

## 3. Docker/Postgres

Already implemented:

- Local Docker Postgres exists: `docker-compose.yml:1-20`.
- Postgres env parsing supports URL or discrete env vars: `functions/src/db/postgres.js:3-38`.
- Postgres health check skips cleanly when unset: `functions/src/db/postgres.js:72-109` and `scripts/postgres_health.js:5-13`.
- Migrations skip cleanly when Postgres is not configured: `scripts/run_postgres_migrations.js:7-12`.
- Repo docs state Firestore remains app-facing runtime and Postgres remains sidecar: `docs/ARCHITECTURE.md:53-61`, `docs/DATA_MODEL.md:907-915`, and `docs/CURRENT_STATE.md:44`.

What data currently lives there:

- Import metadata, USDA macro tables, USDA cluster/review/mapping staging, canonical ingredients, ingredient nutrition profiles, ingredient-product equivalence, canonical recipes, recipe staging/promotion, user food profile, recipe feedback, taste profile, inventory, meal plans, and meal-plan requirement adapters. See `docs/SCHEMA_MAP.md` and `docs/DATA_MODEL.md`.

Required for mobile runtime?

- No. Product search, shopping-list resolution, basket optimization, saved lists, watchlist, home summary, and mobile runtime do not read directly from Postgres today.

Publish/export pipeline status:

- There is no generic Postgres-to-Firestore publish/export pipeline for current sidecar data.
- There are Firestore-to-flat SQL/vector sync helpers inside the runtime store (`functions/src/sync/firestore_to_sql.js:1-57`, `functions/src/sync/firestore_to_vector.js:1-33`), but those are not Postgres publication commands.
- `scripts/plan2b_build_product_candidates.js:19-28` reads both Postgres and the runtime store to build sidecar product candidates, but it is not a runtime publish path.

Command that can populate Firestore runtime data today:

```powershell
$env:PRICER_STORE_BACKEND='firestore'
$env:PRICER_FIRESTORE_PROJECT_ID='pricer-ee440'
$env:PRICER_FIRESTORE_DATABASE_ID='(default)'
$env:PRICER_FIRESTORE_COLLECTION_PREFIX='prod'
npm run phase6:run
```

This imports KolkoStruva snapshot data into the runtime store. It does not export Docker/Postgres data.

## 4. Mobile App

Already implemented:

- App starts shell immediately and bootstraps services after first frame: `app/mobile/lib/main.dart:31-61`.
- API base URL uses `PRICER_API_BASE_URL` with emulator defaults: `app/mobile/lib/core/services/app_dependencies.dart:55-67`.
- Firebase options exist for Android/iOS/web/macos/windows: `app/mobile/lib/firebase_options.dart:43-87`.
- Firebase bootstrap initializes only when config is non-placeholder and falls back safely: `app/mobile/lib/core/services/firebase_bootstrap.dart:3-16`, `app/mobile/lib/core/services/app_dependencies.dart:121-197`.
- Product search calls `POST /products/search`: `app/mobile/lib/core/services/api_client.dart:188-211`.
- Basket optimization calls `POST /basket/optimize`: `app/mobile/lib/core/services/api_client.dart:403-432`.
- Saved lists use backend owner headers: `app/mobile/lib/core/services/api_client.dart:69-186`.
- Watchlist add/read/remove uses backend owner headers: `app/mobile/lib/core/services/api_client.dart:470-520`.
- RevenueCat config reads Dart defines: `app/mobile/lib/core/services/monetization_config.dart:61-69`.
- AdMob config reads Dart defines: `app/mobile/lib/core/services/monetization_config.dart:70-82`.
- Missing monetization config is non-fatal: `app/mobile/lib/core/services/monetization_service.dart:214-238` and `app/mobile/lib/core/services/ad_service.dart:36-47`.
- Android package id is `com.pricer.mobile`: `app/mobile/android/app/build.gradle.kts:11-33`.
- iOS bundle id is `com.pricer.mobile`: `app/mobile/ios/Runner.xcodeproj/project.pbxproj:375-419`.

Missing or not production-ready:

- No `firebase_auth` dependency; no `FirebaseAuth.instance.signInAnonymously()` implementation.
- Local identity is `anon-{timestamp}` in SharedPreferences: `app/mobile/lib/core/services/local_identity_service.dart:3-16`.
- No Firebase Auth ownership claiming or migration from local id to Firebase UID.
- No `firebase_messaging` dependency and no FCM token registration.
- Android manifest and iOS Info.plist contain Google test AdMob app ids: `app/mobile/android/app/src/main/AndroidManifest.xml:10-12`, `app/mobile/ios/Runner/Info.plist:27-28`.
- Android release build signs with debug config: `app/mobile/android/app/build.gradle.kts:35-40`.
- `GoogleService-Info.plist` exists on disk, but the iOS Xcode project resource list shown at `app/mobile/ios/Runner.xcodeproj/project.pbxproj:214-220` does not include it.

## 5. External Accounts

Required for real MVP:

- Firebase / Google Cloud project access for `pricer-ee440`
- Google Cloud billing-enabled project
- Google Play Console app
- Apple Developer account and App Store Connect app
- RevenueCat project, offerings, products, entitlement, and SDK keys if subscriptions are in MVP
- AdMob account, Android/iOS apps, and ad units if ads are in MVP

Required for live data enrichment or later sidecar operations:

- xAI account/API key for live enrichment, disambiguation, embeddings, and recipe extraction
- Optional hosted Postgres provider for running sidecar jobs outside local Docker

No other external account requirement was found in the audited code paths.

## 6. Secrets And Credentials

The source-of-truth table is in `docs/needed_secrets.md`.

MVP-critical configuration:

- `PRICER_STORE_BACKEND`
- `PRICER_FIRESTORE_PROJECT_ID` if runtime project detection is ambiguous
- `PRICER_FIRESTORE_DATABASE_ID` if using a non-default or explicit database
- `PRICER_FIRESTORE_COLLECTION_PREFIX` as a production isolation decision
- `PRICER_API_BASE_URL`
- RevenueCat keys only if subscriptions are shipped
- AdMob app/unit IDs only if ads are shipped

MVP runtime does not require hosted Postgres credentials.

## 7. Implementation Tasks Codex Can Do

Codex can complete without external account access:

- Add Firebase Auth anonymous sign-in to mobile and route owner ids through Firebase UID.
- Add local-id-to-Firebase-UID claiming/migration for saved lists/watchlist/billing cache.
- Add `firebase_messaging`, FCM permission handling, token retrieval, and backend token registration endpoint/client method.
- Add a backend device-token persistence collection/handler if push alerts are in MVP.
- Add Firestore rules and indexes templates for direct client collections and backend runtime collections.
- Add a local JSON-to-Firestore publish CLI for existing `runtime_data/state.json`.
- Add a safer production data population runbook and optional dry-run verifier.
- Add an `onSchedule` Firebase Function wrapper for Phase 6 ingest if scheduled ingest is in MVP.
- Wire Android/iOS native AdMob app ids to build-time config instead of hardcoded test ids.
- Add iOS `GoogleService-Info.plist` to Xcode project resources.
- Add startup/integration tests for API URL wiring, Firebase Auth ownership, direct Firestore ownership, FCM token registration fallback, and local-state publish.

## 8. Operator Tasks Human Must Do

Bare minimum before Codex can finish production setup:

1. Confirm Firebase project `pricer-ee440` is the production project and Firestore database id is `(default)` or provide the real database id.
2. Decide Firestore collection prefix: `prod`, `staging`, or empty.
3. Provide a deployed Functions config/secrets path, or run the Firebase CLI commands Codex gives you.
4. Create/confirm Google Play Console and Apple Developer/App Store Connect apps for `com.pricer.mobile`.
5. Create RevenueCat project/products/offering/entitlement if monetization is in MVP.
6. Create AdMob app ids and ad units if ads are in MVP.
7. Decide whether push notifications are in MVP. If yes, enable FCM/APNs setup in Firebase/Apple.
8. Provide Android release keystore details and Apple signing team/profile access.
9. Decide whether live xAI enrichment is needed for launch data refresh. If yes, store `XAI_API_KEY` as a runtime secret.

## 9. Tests

Existing tests relevant to this audit:

- `node tests/phase_11_production_persistence.test.js` covers Firestore store round-trips and runtime backend selection.
- `node tests/phase_17_1_persistent_lists.test.js` covers owner-scoped saved lists.
- `node tests/phase_17_2_watchlist_tracker.test.js` covers owner-scoped watchlist tracker.
- `node tests/phase_15_2_product_api.test.js` covers product search/detail API.
- `node tests/phase_16_1_basket_optimizer.test.js` and `node tests/phase_16_2_multi_store_optimizer.test.js` cover basket optimization.
- `flutter test test/startup_hardening_test.dart` covers mobile startup fallback, API timeout, and missing monetization startup safety.
- `flutter test test/monetization_config_test.dart` covers placeholder RevenueCat/AdMob disabled behavior.
- `flutter test test/widget_smoke_test.dart` covers Phase 18 mobile screens, owner header propagation, search, basket, watchlist, and saved-list screens.

Missing tests needed before production MVP sign-off:

- End-to-end mobile-to-deployed-backend smoke test against `PRICER_API_BASE_URL`.
- Firebase Auth anonymous sign-in and owner-id propagation test.
- Firestore rules emulator test proving `users/{uid}` ownership isolation.
- Saved lists/watchlist persistence test using Firebase UID rather than local generated id.
- Product data availability smoke test against a populated Firestore runtime store.
- FCM token registration fallback test proving missing permission/token does not break startup.
- Backend token registration test once token persistence endpoint exists.
- Local JSON-to-Firestore publish CLI test, or explicit Phase 6 Firestore population smoke test.
- Scheduled ingest deployment test if `onSchedule` is added.
