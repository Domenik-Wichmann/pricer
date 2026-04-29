# Operator Actions

## Purpose
Only the live credential, deployment, and runtime-verification steps that cannot be completed inside this local coding environment remain.

## Ordered steps
1. Open a terminal in the repo root.
2. Generate the real mobile Firebase config and replace `app/mobile/lib/firebase_options.dart`:
   - run `flutterfire configure`
   - choose the correct Firebase project
   - confirm the generated file overwrites the placeholder
3. Set production environment variables on the machine or service that will run the daily pipeline:
   - `PRICER_STATE_FILE`
   - `PRICER_WORK_DIR`
   - `FIREBASE_PROJECT_ID`
   - `FCM_ACCESS_TOKEN` or a production token-provider wrapper
   - `XAI_API_KEY`
   - optional: `XAI_GROK_MODEL`
   - optional: `XAI_EMBEDDING_MODEL`
4. Run `npm run phase6:run` once in the production environment and confirm it completes without errors.
5. Register a real daily scheduler that runs `npm run phase6:run` once per day on the production host or job runner.
6. Run `flutter test` again after the real Firebase config is in place.
7. Run the mobile app on Android and iOS and verify Firestore-backed list/watchlist behavior still works.
8. Verify live alert delivery by:
   - ensuring device tokens exist in the production alert input path
   - forcing one watched product to trigger a drop
   - confirming the FCM message is delivered
