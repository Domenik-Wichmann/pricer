# Needed Secrets And Setup Audit

Last updated: 2026-04-28

## Current Answer

Pricer has real Firebase project wiring, generated mobile Firebase config, a deployable Firebase Functions package, local backend secret/config examples, and local-only secret files. It is not production/MVP-ready yet.

The runtime can be a real Firestore-only app runtime for product search, saved lists, watchlist, basket optimization, and mobile API calls. Hosted Postgres is not required for the current mobile MVP runtime. Postgres is currently sidecar/import/review/planning data, not the live app read path.

The remaining MVP blockers are mostly setup and a few code tasks:

- production Functions env/secrets are not configured in repo
- Firestore rules and indexes are absent from `firebase.json`
- mobile ownership uses a local generated id, not Firebase anonymous auth
- FCM token registration is not implemented
- RevenueCat and AdMob production config are placeholders/local-only
- Android release signing still uses debug signing
- iOS Firebase plist is present on disk but is not referenced in the Xcode project resources
- no deployed scheduled Firebase job is exported
- no generic local JSON/Postgres-to-Firestore publish CLI exists

## Repo-Grounded Evidence

- Firebase deploy targets only Functions: `firebase.json:1-4`.
- Firebase project alias is `pricer-ee440`: `.firebaserc:1-4`.
- Cloud Functions region is `europe-west1`: `functions/index.js:66-69`.
- The only deployed function export is the HTTP API named `api`: `functions/index.js:991-995`.
- Backend runtime store supports `memory`, `json`, and `firestore`: `functions/src/phase1/store.js:220-245`.
- Production defaults to Firestore if `NODE_ENV=production`, but `PRICER_STORE_BACKEND=firestore` should still be set explicitly: `functions/src/phase1/store.js:247-261`.
- Firestore collection prefix is optional and prepends collection names as `{prefix}_{collection}`: `functions/src/phase1/store.js:237-241` and `functions/src/phase1/store.js:289-291`.
- Firestore Admin uses ADC/runtime service account plus optional project/database/app env vars: `functions/src/phase1/store.js:264-287`.
- Runtime collections and deterministic document ids are defined in the flat store: `functions/src/phase1/store.js:5-115`.
- Firestore rules/indexes files are not present in repo, and `firebase.json` does not reference them.
- Postgres config is optional and skipped when unset: `functions/src/db/postgres.js:3-18` and `scripts/run_postgres_migrations.js:7-12`.
- Local Docker Postgres is `pricer_dev` on host port `5433`: `docker-compose.yml:1-20`.
- Postgres remains sidecar and not app-facing runtime per docs: `docs/ARCHITECTURE.md:53-61`, `docs/DATA_MODEL.md:907-915`, and `docs/CURRENT_STATE.md:44`.
- Mobile API base URL comes from `PRICER_API_BASE_URL`, with localhost emulator defaults otherwise: `app/mobile/lib/core/services/app_dependencies.dart:55-67`.
- Mobile Firebase initializes after first frame and falls back safely: `app/mobile/lib/main.dart:31-61` and `app/mobile/lib/core/services/app_dependencies.dart:121-197`.
- Mobile anonymous identity is local `SharedPreferences`, not Firebase Auth: `app/mobile/lib/core/services/local_identity_service.dart:3-16`.
- Mobile direct Firestore user collections live under `users/{anonymousUserId}`: `app/mobile/lib/core/services/firestore_repositories.dart:40-47`, `app/mobile/lib/core/services/firestore_repositories.dart:146-153`, and `app/mobile/lib/core/services/billing_repositories.dart:15-25`.
- Backend saved lists and watchlist use temporary owner headers: `app/mobile/lib/core/services/api_client.dart:69-186`, `app/mobile/lib/core/services/api_client.dart:470-520`, `functions/src/phase17/saved_lists.js:459-468`, and `functions/src/phase17/watchlist.js:17-24`.
- RevenueCat and AdMob are configured by Dart defines and disabled when placeholders are used: `app/mobile/lib/core/services/monetization_config.dart:61-95`.
- Missing RevenueCat does not crash startup: `app/mobile/lib/core/services/monetization_service.dart:214-238`.
- Missing AdMob config does not render ads: `app/mobile/lib/core/services/ad_service.dart:36-47` and `app/mobile/lib/core/services/ad_service.dart:54-61`.
- Android native AdMob app id is still a Google test id: `app/mobile/android/app/src/main/AndroidManifest.xml:10-12`.
- iOS native AdMob app id is still a Google test id: `app/mobile/ios/Runner/Info.plist:27-28`.
- Android release signing still uses the debug signing config: `app/mobile/android/app/build.gradle.kts:35-40`.
- iOS bundle id is `com.pricer.mobile`, but signing/team still need operator verification: `app/mobile/ios/Runner.xcodeproj/project.pbxproj:375-419`.
- FCM backend sender exists, but mobile has no `firebase_messaging` dependency or token registration path: `functions/src/phase6/fcm.js:1-55` and `app/mobile/pubspec.yaml:14-22`.

## Secrets And Config Table

| Name | Required for MVP? | Secret? | Where used | Local status | Production status | Provider |
| --- | --- | --- | --- | --- | --- | --- |
| `PRICER_STORE_BACKEND` | Yes | No | `functions/src/phase1/store.js:220-245` | Present in `app/secrets/backend.env.local` | Must be set to `firestore` for deployed Functions | Codex can document; operator configures |
| `PRICER_FIRESTORE_PROJECT_ID` | Yes if ADC project detection is ambiguous | No | `functions/src/phase1/store.js:272-283` | Present locally | Not visible in repo deploy config | Operator |
| `PRICER_FIRESTORE_DATABASE_ID` | Yes if not default | No | `functions/src/phase1/store.js:274-287` | Present locally | Not visible in repo deploy config | Operator |
| `PRICER_FIRESTORE_COLLECTION_PREFIX` | Recommended | No | `functions/src/phase1/store.js:237-241` | Not present locally | Decide `prod`, `staging`, or empty intentionally | Operator decision |
| `PRICER_FIRESTORE_APP_NAME` | No | No | `functions/src/phase1/store.js:272-283` | Example only | Optional | Codex/operator |
| `PRICER_STATE_FILE` | No for production | No | `functions/src/phase1/store.js:230-234` | Example only | Unset in production | Codex/operator |
| `DEFAULT_COORDINATE_MODE` | No | No | `functions/src/phase6/location_availability.js` | Example only | Optional; defaults to `provider_only`, set `reviewed_first` only after rollout diagnostics pass | Operator decision |
| `GOOGLE_APPLICATION_CREDENTIALS` | No on deployed Functions | Secret-sensitive file path | `functions/src/phase1/store.js:264-287`, `functions/src/phase6/fcm.js:1-3` | Example only | Usually unset on GCP/Firebase runtime | Operator if local service account is needed |
| `XAI_API_KEY` | No for already-published app runtime; yes for live LLM enrichment/adjudication/recipe extraction | Yes | `functions/src/phase6/grok.js:15-31`, `functions/src/phase6/disambiguation.js:337-353`, `functions/src/phase15/enrichment.js`, `functions/src/db/recipes/recipe_llm_extraction.js` | Present locally | Must be stored as runtime secret if live LLM paths are enabled | Human/operator |
| `ENABLE_LLM_ENRICHMENT` | No for core app runtime | No | `app/secrets/backend.env.example:31-36`, `functions/src/phase15/enrichment.js` | Example/local intended | Set only if live enrichment should run | Operator |
| `ENABLE_LLM_DISAMBIGUATION` | No for core MVP | No | `functions/src/phase6/disambiguation.js:22` | Not present locally | Optional | Operator |
| `XAI_GROK_MODEL` | No | No | `functions/src/phase6/grok.js:15-17`, `functions/src/phase6/disambiguation.js:337-339` | Present locally | Optional | Codex/operator |
| `XAI_EMBEDDING_MODEL` | No | No | `functions/src/phase6/embeddings.js:15-17` | Example only | Optional | Codex/operator |
| `XAI_RECIPE_MODEL` | No for current mobile MVP | No | `functions/src/db/recipes/recipe_llm_extraction.js:39-41` | Not present locally | Later recipe ingest only | Operator |
| `PRICER_INTERNAL_ANALYTICS_TOKEN` | No for consumer MVP; yes for internal analytics endpoints | Yes | `functions/src/phase18/internal_access.js:3-26` | Example only | Must be set before using guarded analytics endpoints | Human/operator |
| `FIREBASE_PROJECT_ID` | No unless using direct FCM sender | No | `functions/src/phase6/fcm.js:1-24` | Example only | Needed for direct FCM HTTP sender | Operator |
| `FCM_ACCESS_TOKEN` | No for MVP startup; yes only for current direct bearer-token FCM path | Yes | `functions/src/phase6/fcm.js:1-55` | Example only | Not configured; prefer ADC/Admin strategy later | Human/operator |
| `DATABASE_URL` / `PRICER_POSTGRES_URL` | No for mobile MVP runtime | Yes | `functions/src/db/postgres.js:3-10` | Not required locally if discrete vars are used | Only needed for hosted sidecar jobs | Human/operator |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_SSL` | No for mobile MVP runtime | Password is secret | `functions/src/db/postgres.js:12-38` | Example/Docker values available | Only needed for sidecar jobs | Human/operator |
| `PRICER_POSTGRES_HOST`, `PRICER_POSTGRES_PORT`, `PRICER_POSTGRES_DB`, `PRICER_POSTGRES_USER`, `PRICER_POSTGRES_PASSWORD`, `PRICER_POSTGRES_SSL` | No for mobile MVP runtime | Password is secret | `functions/src/db/postgres.js:12-38` | Example equivalent | Only needed for sidecar jobs | Human/operator |
| `USDA_DATASET_ROOT` | No for mobile MVP runtime | No | `functions/src/db/usda/usda_schema.js:12`, `scripts/import_usda_macros.js` | Local dataset path only | Sidecar import only | Operator |
| `USDA_DATASET_VERSION` | No | No | USDA sidecar scripts | Local/operator job config | Sidecar import only | Operator |
| `USDA_IMPORT_BATCH_SIZE` | No | No | USDA sidecar scripts | Optional | Sidecar import only | Codex/operator |
| `PRICER_API_BASE_URL` | Yes for production mobile | No | `app/mobile/lib/core/services/app_dependencies.dart:55-67` | Present in local mobile defines | Must point to deployed `https://europe-west1-pricer-ee440.cloudfunctions.net/api` or verified equivalent | Operator |
| `REVENUECAT_ANDROID_API_KEY` | Yes if subscriptions are in MVP | App-distributed SDK key | `app/mobile/lib/core/services/monetization_config.dart:61-69` | Local file contains placeholders | Not configured | Human/operator |
| `REVENUECAT_IOS_API_KEY` | Yes if subscriptions are in MVP | App-distributed SDK key | `app/mobile/lib/core/services/monetization_config.dart:61-69` | Local file contains placeholders | Not configured | Human/operator |
| `REVENUECAT_ENTITLEMENT_ID` | Yes if subscriptions are in MVP | No | `app/mobile/lib/core/services/monetization_config.dart:66-69` | Present locally, default `premium` | Must match RevenueCat project | Human/operator |
| `ADMOB_ANDROID_APP_ID` | Yes if ads are in MVP | No, but deployment-sensitive | `app/mobile/lib/core/services/monetization_config.dart:70-82` and native Android manifest | Local file contains placeholder; native manifest has test id | Not configured | Human/operator plus Codex native wiring |
| `ADMOB_IOS_APP_ID` | Yes if ads are in MVP | No, but deployment-sensitive | `app/mobile/lib/core/services/monetization_config.dart:70-82` and iOS Info.plist | Local file contains placeholder; native plist has test id | Not configured | Human/operator plus Codex native wiring |
| `ADMOB_BANNER_ANDROID_UNIT_ID` | Yes if banner ads are in MVP | No, but deployment-sensitive | `app/mobile/lib/core/services/monetization_config.dart:76-82` | Placeholder | Not configured | Human/operator |
| `ADMOB_BANNER_IOS_UNIT_ID` | Yes if banner ads are in MVP | No, but deployment-sensitive | `app/mobile/lib/core/services/monetization_config.dart:76-82` | Placeholder | Not configured | Human/operator |
| `ADMOB_INTERSTITIAL_ANDROID_UNIT_ID` | No unless interstitials are in MVP | No, but deployment-sensitive | `app/mobile/lib/core/services/monetization_config.dart:79-82` | Placeholder | Not configured | Human/operator |
| `ADMOB_INTERSTITIAL_IOS_UNIT_ID` | No unless interstitials are in MVP | No, but deployment-sensitive | `app/mobile/lib/core/services/monetization_config.dart:79-82` | Placeholder | Not configured | Human/operator |

## External Accounts Required

Required for real MVP:

- Firebase / Google Cloud project access for `pricer-ee440`
- Google Cloud billing-enabled project and Firebase Functions/Firestore permissions
- Google Play Console app
- Apple Developer account and App Store Connect app
- RevenueCat project, offerings, products, entitlement, and SDK keys if subscriptions are in MVP
- AdMob account, apps, and ad units if ads are in MVP

Required only for live data enrichment or later sidecar work:

- xAI account/API key for live Grok enrichment, adjudication, embeddings, or recipe extraction
- Optional hosted Postgres provider for sidecar jobs outside local Docker

## Firestore And Postgres Answer

For the current mobile MVP runtime, hosted Postgres is not required. Product search, saved lists, watchlist, basket optimization, entitlement records, internal analytics, and mobile-facing state use the flat runtime store, which can be backed by Firestore. This is documented in `docs/ARCHITECTURE.md:53-61` and implemented by `functions/src/phase1/store.js:220-245`.

Postgres currently stores sidecar/import/review/planning data: import metadata, USDA macro data, ingredients, recipes, taste/profile/planner/inventory rows, and meal-plan requirement adapters. These are not read by current mobile product/search/shopping/watchlist/basket paths.

There is no generic command that exports existing Postgres sidecar data into Firestore runtime collections. The command that can populate Firestore runtime product data today is the Phase 6 KolkoStruva pipeline:

```powershell
$env:PRICER_STORE_BACKEND='firestore'
$env:PRICER_FIRESTORE_PROJECT_ID='pricer-ee440'
$env:PRICER_FIRESTORE_DATABASE_ID='(default)'
$env:PRICER_FIRESTORE_COLLECTION_PREFIX='prod'
npm run phase6:run
```

That command downloads/imports the current KolkoStruva snapshot into the selected runtime store. It is not a Docker/Postgres publish path.

## Minimum Production Setup Checklist

1. Configure deployed Functions env:
   - `PRICER_STORE_BACKEND=firestore`
   - `PRICER_FIRESTORE_PROJECT_ID=pricer-ee440`
   - `PRICER_FIRESTORE_DATABASE_ID=(default)` unless intentionally using a named database
   - `PRICER_FIRESTORE_COLLECTION_PREFIX=prod` or explicitly decide empty prefix
2. Deploy or add Firestore rules and indexes.
3. Deploy Functions and verify `GET https://europe-west1-pricer-ee440.cloudfunctions.net/api` returns the service envelope.
4. Populate Firestore runtime data with the Phase 6 pipeline or a Codex-added publish/import CLI.
5. Set mobile `PRICER_API_BASE_URL` to the deployed API URL.
6. Wire Firebase anonymous auth before treating saved lists/watchlist/billing ownership as production-secure.
7. Add FCM token registration before launching push alerts.
8. Replace RevenueCat/AdMob placeholders only if monetization is in the MVP build.
9. Configure Android and iOS release signing/store setup.
