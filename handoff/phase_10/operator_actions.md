# Operator Actions

## Purpose
Only live vendor setup, release credentials, and on-device billing or ad runtime checks remain.

## Ordered steps
1. In RevenueCat, create or verify the `premium` entitlement and attach the live App Store and Google Play subscription products to it.
2. Build the Flutter app with live RevenueCat keys:
   - `--dart-define=REVENUECAT_ANDROID_API_KEY=...`
   - `--dart-define=REVENUECAT_IOS_API_KEY=...`
   - `--dart-define=REVENUECAT_ENTITLEMENT_ID=premium`
3. In AdMob, create live Android and iOS app ids plus one banner unit and one interstitial unit for each platform.
4. Build the Flutter app with live AdMob values:
   - `--dart-define=ADMOB_ANDROID_APP_ID=...`
   - `--dart-define=ADMOB_IOS_APP_ID=...`
   - `--dart-define=ADMOB_BANNER_ANDROID_UNIT_ID=...`
   - `--dart-define=ADMOB_BANNER_IOS_UNIT_ID=...`
   - `--dart-define=ADMOB_INTERSTITIAL_ANDROID_UNIT_ID=...`
   - `--dart-define=ADMOB_INTERSTITIAL_IOS_UNIT_ID=...`
5. Run a sandbox purchase on Android and verify that the paywall purchase flow succeeds, the backend tier record becomes premium, and multi-store basket optimization becomes available.
6. Run a restore flow on iOS and verify that the restored entitlement updates the billing profile and unlocks premium behavior again.
7. Verify that free-tier users still see banner or interstitial ad placements, while premium users do not see ads.
8. Deploy the backend functions that expose the entitlement sync and status endpoints, then verify one end-to-end sync from mobile purchase to backend gating in the deployed environment.
