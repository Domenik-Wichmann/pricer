# Next Phase Readiness

## Ready now
- Backend-authoritative entitlement records are available in flat collections.
- RevenueCat purchase, restore, and status abstractions exist in the Flutter app.
- Firestore billing profile caching is wired per anonymous device id.
- Premium-only backend gating is in place for multi-store optimization and alerts.
- Free-tier limits and premium ad suppression are implemented.
- The paywall UI is localized and covered by widget tests.

## Remaining before production monetization
- Provide live RevenueCat API keys and attach the real subscription products to the `premium` entitlement.
- Provide live AdMob app ids and unit ids for Android and iOS.
- Run sandbox purchase and restore checks on physical or simulator devices.
- Deploy the backend functions and verify end-to-end entitlement sync against the live environment.
