# Phase 10 Monetization

## Goal
Add a production-ready monetization layer that keeps entitlements backend-authoritative while integrating RevenueCat subscriptions and AdMob ads into the Flutter client.

## Scope
- flat backend entitlement records
- RevenueCat purchase, restore, and status flows in Flutter
- Firestore-backed user tier profile caching
- backend gating for premium-only basket and alert features
- free-tier limits
- ad suppression for premium users
- lightweight paywall UI

## Out of scope
- backend authentication redesign
- custom billing backend beyond RevenueCat
- new shopping features unrelated to monetization
- revenue dashboards or finance reconciliation
