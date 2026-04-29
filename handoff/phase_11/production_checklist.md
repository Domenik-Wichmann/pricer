# Production Checklist

## 1. Backend persistence
- Set `PRICER_STORE_BACKEND=firestore` for deployed runtime.
- Ensure ADC works through the runtime service account or `GOOGLE_APPLICATION_CREDENTIALS`.
- Optionally set:
  - `PRICER_FIRESTORE_PROJECT_ID`
  - `PRICER_FIRESTORE_DATABASE_ID`
  - `PRICER_FIRESTORE_COLLECTION_PREFIX`
  - `PRICER_FIRESTORE_APP_NAME`
- Verify that the deployed backend can read and write the flat Firestore collections used by the data backbone.

## 2. Backend deployment wrapper gap
- Add deployable backend wrappers for the existing handlers.
- Add `firebase.json`.
- Add `.firebaserc`.
- Add `app/functions/package.json`.

## 3. Firestore governance
- Add Firestore rules.
- Add Firestore indexes if the chosen deployed queries require them.
- Decide the production auth model before letting mobile clients write directly.

## 4. Mobile Firebase runtime
- Replace `app/mobile/lib/firebase_options.dart` with real generated settings.
- Confirm Android and iOS Firebase app registrations exist.
- Set a real API base URL with `PRICER_API_BASE_URL`.
- Add Firebase anonymous auth if the mobile app will use Firestore in production.

## 5. Notifications and voice permissions
- Implement mobile FCM token registration and backend-accessible token persistence.
- Add notification permission flows where required.
- Add Android microphone permission and iOS microphone or speech-recognition usage descriptions.

## 6. Monetization and ads
- Provision RevenueCat and AdMob production credentials.
- Verify backend premium gating against Firestore-backed state.

## 7. AI and embedding services
- Provision xAI credentials.
- Confirm production model selections and budgets.

## 8. End-to-end release gate
- Verify a real Firestore-backed ingest run.
- Verify deployed query and history endpoints.
- Verify watchlist persistence, alert queueing, delivery, purchase restore, and premium gating.
