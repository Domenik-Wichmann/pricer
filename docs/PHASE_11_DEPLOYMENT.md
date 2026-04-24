# Phase 11 Deployment

## Goal
Prepare the repository for real-world deployment by auditing everything the operator must configure, everything the code expects at runtime, and everything still missing from the repo.

## What this phase does
- scans the repo for runtime environment variables and `--dart-define` inputs
- inventories all third-party services and operator-owned accounts
- identifies missing production configs and deployment blockers
- produces an exhaustive operator checklist and production readiness package

## What this phase does not do
- silently assume Firebase, RevenueCat, AdMob, xAI, or app-store setup already exists
- pretend the current local JSON-file backend is production-ready
- claim deployment is complete when the repo still lacks deployable infrastructure wrappers

## Deployment truth from the repo
- The mobile app now targets the final Android and iOS app identifier `com.pricer.mobile`, and the Android+iOS Firebase config has been regenerated against `pricer-ee440`.
- The backend runtime now supports Firestore-backed persistence for production use, with JSON-file and in-memory fallbacks retained for local development and tests.
- The repo now includes repo-root `firebase.json` and `.firebaserc` plus a deployable `functions/` package with an HTTP wrapper entrypoint at `functions/index.js`.
- The deployed Functions package now vendors the backend runtime under `functions/src/` so Firebase deployment does not depend on imports outside the deploy source tree.
- Watchlist alert delivery supports FCM sending in backend logic, but the mobile app does not yet collect or register FCM device tokens.
- RevenueCat and AdMob wiring exists in Flutter, but live keys and store product setup remain operator-managed.

## Required outputs
- complete environment variable and runtime-config list
- required external accounts and services
- step-by-step deployment runbook
- explicit missing-config and blocker inventory
- production checklist
- operator handoff
