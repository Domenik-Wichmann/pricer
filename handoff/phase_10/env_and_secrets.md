# Env And Secrets

## Required for live subscriptions
- `REVENUECAT_ANDROID_API_KEY`
- `REVENUECAT_IOS_API_KEY`
- `REVENUECAT_ENTITLEMENT_ID`

## Required for live ads
- `ADMOB_ANDROID_APP_ID`
- `ADMOB_IOS_APP_ID`
- `ADMOB_BANNER_ANDROID_UNIT_ID`
- `ADMOB_BANNER_IOS_UNIT_ID`
- `ADMOB_INTERSTITIAL_ANDROID_UNIT_ID`
- `ADMOB_INTERSTITIAL_IOS_UNIT_ID`

## Runtime behavior without live values
- RevenueCat remains disabled and the paywall stays in preview-safe mode.
- AdMob falls back to development-safe Google test app ids and test ad units.
- Backend entitlement gating still works for synced tier records, but real purchase and restore flows require live RevenueCat setup.
