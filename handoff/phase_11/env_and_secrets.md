# Env And Secrets

## Backend persistence env vars
- `PRICER_STORE_BACKEND`
  Supported values: `memory`, `json`, `firestore`.
  Default behavior:
  - `NODE_ENV=test` -> `memory`
  - `NODE_ENV=production` -> `firestore`
  - otherwise -> `json`
- `PRICER_STATE_FILE`
  Used only for the JSON-file backend.
- `PRICER_WORK_DIR`
  Used by the Phase 6 pipeline runner for downloaded ingest files.
- `PRICER_FIRESTORE_COLLECTION_PREFIX`
  Optional prefix for backend Firestore collections.
- `PRICER_FIRESTORE_PROJECT_ID`
  Optional explicit project id for Firestore initialization.
- `PRICER_FIRESTORE_DATABASE_ID`
  Optional non-default Firestore database id.
- `PRICER_FIRESTORE_APP_NAME`
  Optional Firebase Admin app name override.

## Credentials
- `GOOGLE_APPLICATION_CREDENTIALS`
  Optional ADC credential path for local or non-Google runtimes.
- Runtime-attached service account credentials
  Valid for deployed Firebase or Google Cloud environments using ADC.

## Still-used backend service env vars
- `XAI_API_KEY`
- `XAI_GROK_MODEL`
- `XAI_EMBEDDING_MODEL`
- `FIREBASE_PROJECT_ID`
- `FCM_ACCESS_TOKEN`

## Flutter `--dart-define` inputs still required separately
- `PRICER_API_BASE_URL`
- `REVENUECAT_ANDROID_API_KEY`
- `REVENUECAT_IOS_API_KEY`
- `REVENUECAT_ENTITLEMENT_ID`
- `ADMOB_ANDROID_APP_ID`
- `ADMOB_IOS_APP_ID`
- `ADMOB_BANNER_ANDROID_UNIT_ID`
- `ADMOB_BANNER_IOS_UNIT_ID`
- `ADMOB_INTERSTITIAL_ANDROID_UNIT_ID`
- `ADMOB_INTERSTITIAL_IOS_UNIT_ID`
