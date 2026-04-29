# Operator Actions

## Purpose
The JSON-only backend persistence blocker is closed in code, and the repo now includes a deployable Firebase Functions root. Real production rollout still requires cloud setup and runtime integration work that cannot be completed from this session.

## Ordered Steps
1. Choose the production backend mode explicitly:
   set `PRICER_STORE_BACKEND=firestore`.
2. Verify the Firebase CLI is authenticated to the intended project shown in `.firebaserc` or replace the default alias if a different project should receive the deploy.
3. Provision the target Firebase or Google Cloud project and enable Firestore.
4. Provide runtime credentials via the platform service account or `GOOGLE_APPLICATION_CREDENTIALS`.
5. Optionally set `PRICER_FIRESTORE_COLLECTION_PREFIX` if you want environment isolation inside one Firestore project.
6. Add Firestore rules and indexes before exposing the mobile app to production traffic.
7. Add mobile Firebase anonymous auth and FCM token registration.
8. Run deployed smoke tests against `https://api-wzmbpv2nwa-uc.a.run.app` or the `https://us-central1-pricer-ee440.cloudfunctions.net/api` alias for query, history, watchlist, demand, optimizer, and entitlement flows.
9. Optionally enable `compute.googleapis.com` in project `pricer-ee440` to remove the Firebase CLI warning about falling back to the default compute service account during deploys.
