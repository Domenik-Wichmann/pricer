# Needed Secrets And Setup Audit

## Purpose
This document is the repo-truth audit for secrets, runtime config, generated Firebase files, and operator-owned accounts as of 2026-04-23.

It focuses on four questions:
- what is already present in the repo
- what is still missing
- where each value belongs
- which code paths actually read each value

## Current Status Summary

### Already present in the repo
- Firebase deploy targeting is configured in [.firebaserc](/C:/dev/Pricer/.firebaserc:1) and [firebase.json](/C:/dev/Pricer/firebase.json:1).
- The Flutter app already contains generated Firebase options in [app/mobile/lib/firebase_options.dart](/C:/dev/Pricer/app/mobile/lib/firebase_options.dart:1).
- Android already has a Firebase client config in [app/mobile/android/app/google-services.json](/C:/dev/Pricer/app/mobile/android/app/google-services.json:1).
- Android and iOS repo-owned identifiers now target `com.pricer.mobile` in [app/mobile/android/app/build.gradle.kts](/C:/dev/Pricer/app/mobile/android/app/build.gradle.kts:12), [app/mobile/android/app/src/main/kotlin/com/pricer/mobile/MainActivity.kt](/C:/dev/Pricer/app/mobile/android/app/src/main/kotlin/com/pricer/mobile/MainActivity.kt:1), and [app/mobile/ios/Runner.xcodeproj/project.pbxproj](/C:/dev/Pricer/app/mobile/ios/Runner.xcodeproj/project.pbxproj:375).
- macOS shared runner config was also aligned to `com.pricer.mobile` in [app/mobile/macos/Runner/Configs/AppInfo.xcconfig](/C:/dev/Pricer/app/mobile/macos/Runner/Configs/AppInfo.xcconfig:11) because it shares the checked-in Firebase options file.
- Backend code already supports local JSON storage, in-memory storage, or Firestore storage through [functions/src/phase1/store.js](/C:/dev/Pricer/functions/src/phase1/store.js:180).

### Still missing or still operator-owned
- An iOS `GoogleService-Info.plist` is now present under [app/mobile/ios/Runner/GoogleService-Info.plist](/C:/dev/Pricer/app/mobile/ios/Runner/GoogleService-Info.plist:1).
- No macOS `GoogleService-Info.plist` is present under `app/mobile/macos/Runner/`.
- Android+iOS Firebase-generated config has been refreshed. [app/mobile/android/app/google-services.json](/C:/dev/Pricer/app/mobile/android/app/google-services.json:1), [app/mobile/ios/Runner/GoogleService-Info.plist](/C:/dev/Pricer/app/mobile/ios/Runner/GoogleService-Info.plist:1), and [app/mobile/lib/firebase_options.dart](/C:/dev/Pricer/app/mobile/lib/firebase_options.dart:1) now include the new Android and iOS app registrations for `com.pricer.mobile`.
- `app/mobile/lib/firebase_options.dart` still carries older macOS/web/windows entries because the current migration only regenerated Android+iOS.
- No real backend secrets are checked in, which is correct. `XAI_API_KEY`, Firebase service-account-based access outside GCP, and any temporary FCM bearer token still need operator setup.
- RevenueCat and AdMob values are not set in repo-controlled build config; the mobile app reads them only from `--dart-define`.
- Firestore/Auth/push-notification production readiness still has broader operator work tracked in [docs/CURRENT_STATE.md](/C:/dev/Pricer/docs/CURRENT_STATE.md:97).

## Backend Environment Variables

### Used directly by backend code

`PRICER_STORE_BACKEND`
- Code reference: [functions/src/phase1/store.js](/C:/dev/Pricer/functions/src/phase1/store.js:207)
- Purpose: selects `memory`, `json`, or `firestore`
- Secret: no
- Current status: not required for local JSON mode; required for explicit Firestore production intent
- Recommended value: `firestore` in deployed production
- Where to put it:
  Firebase Functions runtime env or your deploy shell

`PRICER_STATE_FILE`
- Code reference: [functions/src/phase1/store.js](/C:/dev/Pricer/functions/src/phase1/store.js:191)
- Purpose: overrides the local JSON persistence file path
- Secret: no
- Current status: optional for local-only runs
- Where to put it:
  local shell only

`PRICER_FIRESTORE_COLLECTION_PREFIX`
- Code reference: [functions/src/phase1/store.js](/C:/dev/Pricer/functions/src/phase1/store.js:200)
- Purpose: isolates environments such as `prod` or `staging`
- Secret: no
- Current status: optional
- Where to put it:
  Firebase Functions runtime env

`PRICER_FIRESTORE_APP_NAME`
- Code reference: [functions/src/phase1/store.js](/C:/dev/Pricer/functions/src/phase1/store.js:232)
- Purpose: overrides the Admin SDK app name
- Secret: no
- Current status: optional
- Where to put it:
  Firebase Functions runtime env

`PRICER_FIRESTORE_PROJECT_ID`
- Code reference: [functions/src/phase1/store.js](/C:/dev/Pricer/functions/src/phase1/store.js:233)
- Purpose: overrides Firebase project detection
- Secret: no
- Current status: optional if deploy/runtime project is already correct
- Where to put it:
  Firebase Functions runtime env

`PRICER_FIRESTORE_DATABASE_ID`
- Code reference: [functions/src/phase1/store.js](/C:/dev/Pricer/functions/src/phase1/store.js:234)
- Purpose: selects a non-default Firestore database
- Secret: no
- Current status: optional
- Where to put it:
  Firebase Functions runtime env

`XAI_API_KEY`
- Code references: [functions/src/phase6/grok.js](/C:/dev/Pricer/functions/src/phase6/grok.js:7), [functions/src/phase6/embeddings.js](/C:/dev/Pricer/functions/src/phase6/embeddings.js:8), [functions/src/phase15/enrichment.js](/C:/dev/Pricer/functions/src/phase15/enrichment.js:381)
- Purpose: enables remote xAI Grok disambiguation, remote embeddings, and live canonical enrichment for net-new canonical fingerprints
- Secret: yes
- Current status: missing from repo, expected
- Where to put it:
  Firebase Functions secret/runtime env in production
  local secret file or local shell only for manual testing

`ENABLE_LLM_ENRICHMENT`
- Code reference: [functions/src/phase15/enrichment.js](/C:/dev/Pricer/functions/src/phase15/enrichment.js:159)
- Purpose: explicit runtime toggle for live canonical enrichment
- Secret: no
- Current status: intended production/default runtime setting is `true`
- Safety note:
  actual live calls still require `XAI_API_KEY`
  missing keys do not fail ingest
- Where to put it:
  Firebase Functions runtime env
  local shell or local env file when you want to override the default

`XAI_GROK_MODEL`
- Code reference: [functions/src/phase6/grok.js](/C:/dev/Pricer/functions/src/phase6/grok.js:17)
- Purpose: selects the Grok model name
- Secret: no
- Current status: optional because the code has defaults
- Where to put it:
  Firebase Functions runtime env if you want to override the default

`XAI_EMBEDDING_MODEL`
- Code reference: [functions/src/phase6/embeddings.js](/C:/dev/Pricer/functions/src/phase6/embeddings.js:17)
- Purpose: selects the embedding model name
- Secret: no
- Current status: optional because the code has defaults
- Where to put it:
  Firebase Functions runtime env if you want to override the default

`FIREBASE_PROJECT_ID`
- Code reference: [functions/src/phase6/fcm.js](/C:/dev/Pricer/functions/src/phase6/fcm.js:1)
- Purpose: required for direct FCM HTTP v1 sends
- Secret: no
- Current status: only needed if you are using the FCM send helper
- Where to put it:
  Firebase Functions runtime env

`FCM_ACCESS_TOKEN`
- Code references: [functions/src/phase6/fcm.js](/C:/dev/Pricer/functions/src/phase6/fcm.js:2), [functions/src/phase6/fcm.js](/C:/dev/Pricer/functions/src/phase6/fcm.js:7)
- Purpose: bearer token for direct FCM HTTP v1 requests
- Secret: yes
- Current status: missing from repo, expected
- Better alternative:
  rely on Application Default Credentials instead of manually injecting rotating bearer tokens
- Where to put it:
  temporary runtime secret only if you use this approach

`GOOGLE_APPLICATION_CREDENTIALS`
- Code reference: [functions/src/phase1/store.js](/C:/dev/Pricer/functions/src/phase1/store.js:226)
- Code reference: [functions/src/phase6/fcm.js](/C:/dev/Pricer/functions/src/phase6/fcm.js:2)
- Purpose: points Google client libraries at a local service account JSON file
- Secret: the variable itself is not secret, but the JSON file it points to is secret-sensitive
- Current status: optional locally; usually unnecessary on deployed Firebase Functions
- Where to put it:
  local shell, CI, or non-Google hosting environments only

`DATABASE_URL`
- Code reference: [functions/src/db/postgres.js](/C:/dev/Pricer/functions/src/db/postgres.js:3)
- Purpose: optional single-string Postgres connection for DB1+ sidecar tooling
- Secret: yes when it contains credentials
- Current status: optional; not required for current product runtime or normal tests
- Where to put it:
  local shell, CI, or Firebase Functions secret/runtime env only when running DB-sidecar jobs

`POSTGRES_HOST`
`POSTGRES_PORT`
`POSTGRES_DB`
`POSTGRES_USER`
`POSTGRES_PASSWORD`
`POSTGRES_SSL`
- Code reference: [functions/src/db/postgres.js](/C:/dev/Pricer/functions/src/db/postgres.js:12)
- Purpose: discrete Postgres connection values for DB1+ sidecar tooling
- Secret: `POSTGRES_PASSWORD` is secret; host/db/user/port/ssl are deployment config
- Current status: optional; local defaults are documented in [docs/PHASE_DB1_POSTGRES_FOUNDATION.md](/C:/dev/Pricer/docs/PHASE_DB1_POSTGRES_FOUNDATION.md:43)
- Where to put it:
  local shell, CI, or Firebase Functions runtime env only when running DB-sidecar jobs

`PRICER_POSTGRES_URL`
`PRICER_POSTGRES_HOST`
`PRICER_POSTGRES_PORT`
`PRICER_POSTGRES_DB`
`PRICER_POSTGRES_USER`
`PRICER_POSTGRES_PASSWORD`
`PRICER_POSTGRES_SSL`
- Code reference: [functions/src/db/postgres.js](/C:/dev/Pricer/functions/src/db/postgres.js:3)
- Purpose: Pricer-prefixed aliases for hosted/runtime Postgres configuration
- Secret: URL and password forms are secret
- Current status: optional; not read by existing product runtime paths
- Where to put it:
  Firebase Functions secret/runtime env, CI, or local shell for DB-sidecar jobs

## Mobile Build-Time Values

These are read from `String.fromEnvironment(...)`, so the app expects them at build or run time through Flutter `--dart-define`.

`PRICER_API_BASE_URL`
- Code reference: [app/mobile/lib/core/services/app_dependencies.dart](/C:/dev/Pricer/app/mobile/lib/core/services/app_dependencies.dart:50)
- Current default: `http://localhost:5001`
- Secret: no
- Status: still needs a real deployed backend URL for production builds
- Where to put it:
  local launch config, CI, or explicit `flutter run/build --dart-define`

`REVENUECAT_ANDROID_API_KEY`
`REVENUECAT_IOS_API_KEY`
`REVENUECAT_ENTITLEMENT_ID`
- Code reference: [app/mobile/lib/core/services/monetization_config.dart](/C:/dev/Pricer/app/mobile/lib/core/services/monetization_config.dart:30)
- Secret: the SDK keys are sensitive app config; the entitlement id is not secret
- Status: still operator-owned and not set in repo
- Where to put them:
  local launch config, CI, or explicit `flutter run/build --dart-define`

`ADMOB_ANDROID_APP_ID`
`ADMOB_IOS_APP_ID`
`ADMOB_BANNER_ANDROID_UNIT_ID`
`ADMOB_BANNER_IOS_UNIT_ID`
`ADMOB_INTERSTITIAL_ANDROID_UNIT_ID`
`ADMOB_INTERSTITIAL_IOS_UNIT_ID`
- Code reference: [app/mobile/lib/core/services/monetization_config.dart](/C:/dev/Pricer/app/mobile/lib/core/services/monetization_config.dart:39)
- Secret: not true secrets, but still deployment-sensitive identifiers
- Status: still operator-owned and not set in repo-controlled config
- Where to put them:
  local launch config, CI, or explicit `flutter run/build --dart-define`

## Generated Firebase Client Config

### Already done
- FlutterFire metadata exists in [app/mobile/firebase.json](/C:/dev/Pricer/app/mobile/firebase.json:1).
- Generated Dart Firebase options exist in [app/mobile/lib/firebase_options.dart](/C:/dev/Pricer/app/mobile/lib/firebase_options.dart:1).
- Android Firebase config exists in [app/mobile/android/app/google-services.json](/C:/dev/Pricer/app/mobile/android/app/google-services.json:1) and now includes the new `com.pricer.mobile` app registration.

### Still needed
- Download and add `app/mobile/macos/Runner/GoogleService-Info.plist` if you intend to keep macOS Firebase enabled.
- Regenerate macOS and any other non-scope FlutterFire outputs only if those platforms are brought back into scope.

## Third-Party Accounts Still Needed

### Backend/operator accounts
- Firebase project access for `pricer-ee440`
- Google Cloud billing-enabled project access
- xAI account for `XAI_API_KEY`

### Mobile monetization/release accounts
- RevenueCat project and entitlements
- AdMob app IDs and ad unit IDs
- Google Play Console app setup
- Apple Developer / App Store Connect app setup

## What I Set Up In This Repo

I added a local-only secrets workspace under `app/secrets/`:
- [app/secrets/.gitignore](/C:/dev/Pricer/app/secrets/.gitignore:1)
- [app/secrets/backend.env.example](/C:/dev/Pricer/app/secrets/backend.env.example:1)
- [app/secrets/mobile.dart-defines.ps1.example](/C:/dev/Pricer/app/secrets/mobile.dart-defines.ps1.example:1)
- [app/secrets/README.md](/C:/dev/Pricer/app/secrets/README.md:1)

These files do not change runtime logic. They only give you a safe place to stage local secrets and build arguments outside normal source files.

## Where To Put Real Values

### Put in Firebase Functions or Google Cloud runtime config
- `PRICER_STORE_BACKEND`
- `PRICER_FIRESTORE_COLLECTION_PREFIX`
- `PRICER_FIRESTORE_APP_NAME`
- `PRICER_FIRESTORE_PROJECT_ID`
- `PRICER_FIRESTORE_DATABASE_ID`
- `ENABLE_LLM_ENRICHMENT`
- `XAI_API_KEY`
- `XAI_GROK_MODEL`
- `XAI_EMBEDDING_MODEL`
- `FIREBASE_PROJECT_ID`
- `FCM_ACCESS_TOKEN` only if you choose bearer-token FCM auth
- `DATABASE_URL` or `PRICER_POSTGRES_URL` only when enabling DB-sidecar jobs
- `PRICER_POSTGRES_*` values only when using discrete DB-sidecar configuration

### Put only on your machine or in CI
- `GOOGLE_APPLICATION_CREDENTIALS`
- local `POSTGRES_*` values for DB1 development
- local copies of service account JSON files
- Flutter `--dart-define` values for API base URL, RevenueCat, and AdMob

### Put in generated platform files, not handwritten source
- `android/app/google-services.json`
- `ios/Runner/GoogleService-Info.plist`
- `macos/Runner/GoogleService-Info.plist`
- regenerated `lib/firebase_options.dart`

## How To Fill The Local Examples

### Backend local shell
1. Copy `app/secrets/backend.env.example` to `app/secrets/backend.env.local`.
2. Fill in only the values you actually need for the task at hand.
3. In PowerShell, load it into your current shell before running backend scripts:

```powershell
Get-Content .\app\secrets\backend.env.local |
  Where-Object { $_ -and -not $_.StartsWith('#') } |
  ForEach-Object {
    $name, $value = $_ -split '=', 2
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
```

### Mobile local shell
1. Copy `app/secrets/mobile.dart-defines.ps1.example` to `app/secrets/mobile.dart-defines.ps1.local`.
2. Replace each placeholder value.
3. Dot-source the file before running Flutter:

```powershell
. .\app\secrets\mobile.dart-defines.ps1.local
flutter run $env:PRICER_MOBILE_DART_DEFINES
```

## Remaining Operator Checklist
1. Verify the newly created Firebase Console Android and iOS app registrations for `com.pricer.mobile` are the ones you want to keep long-term.
2. Confirm on a Mac that the iOS Xcode project bundles `Runner/GoogleService-Info.plist`, because this Windows-based migration fetched the file but did not modify Xcode resource references.
3. Regenerate or download macOS Firebase files only if that platform is later brought back into scope.
4. Create and store `XAI_API_KEY` in runtime secret storage.
5. Decide whether FCM will use ADC or a manually injected token.
6. Create RevenueCat products, offerings, and entitlement id values.
7. Create AdMob app IDs and ad unit IDs.
8. Set production `PRICER_API_BASE_URL` for mobile builds.

## Important Notes
- Firebase client config values in `firebase_options.dart` and `google-services.json` are not server secrets, but they still should be treated as deployment config rather than ad hoc source edits.
- The repo is now past the older Phase 11 assumption that `firebase.json`, `.firebaserc`, and generated Firebase options were missing. Repo truth has moved forward, and this document reflects the current state instead of the earlier placeholder state.
