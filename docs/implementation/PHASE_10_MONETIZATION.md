# Phase 10 Implementation

## Contract
Phase 10 extends the existing backend and mobile client without changing earlier data-ingest, matching, demand, or watchlist schemas.

## Backend rules
- backend tier records live in a flat `user_tiers` collection
- RevenueCat sync events are append-only in `revenuecat_events`
- backend remains the authority for premium-only feature gating
- multi-store basket optimization is premium-only when an entitlement record exists and is inactive
- target-price alerts and alert delivery are premium-only when an entitlement record exists and is inactive
- legacy unsynced watchlist rows remain allowed to avoid breaking older flows before entitlement migration completes

## Flutter rules
- anonymous device identity remains the app user id for RevenueCat and Firestore billing profile docs
- Firestore billing profile path is `users/{anon_id}/billing/profile`
- RevenueCat is optional by environment configuration; when keys are absent the paywall runs in preview mode
- AdMob is optional by environment configuration; default test app ids are wired for development
- premium users must not see banner or interstitial ads

## Test expectations
- entitlement sync stores tier state deterministically
- premium gating works for basket and alerts
- monetization state changes write analytics events
- paywall widget rendering works in Flutter widget tests
- premium widget state hides ads in Flutter widget tests
