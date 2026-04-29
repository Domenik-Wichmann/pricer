# MVP Operator TODO

Date: 2026-04-28

Only human/operator-owned tasks are listed here.

## Bare Minimum

1. Confirm the production Firebase project is `pricer-ee440`.
2. Confirm the Firestore database id is `(default)` or provide the real database id.
3. Decide the production Firestore collection prefix: recommended `prod`.
4. Give Codex permission to produce exact Firebase CLI commands for Functions env/secrets, or run them yourself.
5. Create/confirm the Google Play Console app for Android package `com.pricer.mobile`.
6. Create/confirm the Apple Developer/App Store Connect app for bundle id `com.pricer.mobile`.
7. Provide Android release signing details or create the release keystore.
8. Provide Apple signing team/profile access on a Mac.
9. Decide whether subscriptions are in MVP.
10. If subscriptions are in MVP, create RevenueCat project, products, offering, entitlement, and Android/iOS SDK keys.
11. Decide whether ads are in MVP.
12. If ads are in MVP, create AdMob Android/iOS apps and ad units.
13. Decide whether push alerts are in MVP.
14. If push alerts are in MVP, enable Firebase Cloud Messaging/APNs setup and provide any required Apple push configuration.
15. Decide whether live xAI enrichment is needed for launch data refresh.
16. If live xAI is needed, provide/store the `XAI_API_KEY` as a production runtime secret.

## Not Required For Current Mobile MVP

- Hosted Postgres provider/account.
- USDA full import production hosting.
- Open Food Facts account/source integration.
- Recipe-source ingestion accounts.
- Merchant dashboard billing/account setup.

## Values To Hand Back To Codex

- Firebase project id
- Firestore database id
- Firestore collection prefix
- Deployed Functions API URL after first deploy
- RevenueCat Android SDK key, if subscriptions ship
- RevenueCat iOS SDK key, if subscriptions ship
- RevenueCat entitlement id, if subscriptions ship
- AdMob Android app id and ad unit ids, if ads ship
- AdMob iOS app id and ad unit ids, if ads ship
- Android signing path/alias instructions, without committing secrets
- Apple team id/profile confirmation
