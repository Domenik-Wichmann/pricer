# Phase 11 Implementation

## Contract
Phase 11 is a deployment-readiness audit and operator-prep phase. It documents the real runtime contract of the repository as it exists now.

## Required audit areas
1. Environment variables and `--dart-define` values used directly by code.
2. Generated platform configs and native app identifiers.
3. Third-party services and operator-owned accounts.
4. Production blockers where the current repo is not deployable by configuration alone.
5. Step-by-step deployment instructions that assume nothing is already configured.

## Must-call-out blockers
- local JSON-file backend persistence in `app/functions/src/phase1/store.js`
- missing `firebase.json`
- missing `.firebaserc`
- missing `app/functions/package.json`
- missing deployable HTTP or callable function wrappers
- missing Firestore rules and indexes files
- missing Firebase Auth integration in the mobile app despite Firestore writes
- missing mobile FCM token registration flow
- missing native voice-input permissions
- release signing config and any stale Firebase-generated Android/iOS config that still reflects older app registrations

## Verification expectations
- docs JSON still validates
- repo basic verification still passes
- handoff package exists under `handoff/phase_11/`

## Acceptance criteria
Phase 11 is complete when the repo contains:
- a complete env-var inventory
- a complete external-service and account inventory
- an explicit blocker list
- a production checklist
- minimal operator instructions for the remaining non-automatable work

Deployment itself is not considered complete unless those blockers are resolved in code and infrastructure.
