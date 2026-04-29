# Next Phase Readiness

## Ready Now
- The backend has a production-capable Firestore persistence adapter.
- Local JSON-file and in-memory backends still work for local development and tests.
- Store-backed backend flows have been migrated to an async persistence contract.
- Automated tests now cover Firestore round-trips, deterministic deletes and rewrites, runtime backend selection, and regression checks across existing flows.

## Still Blocking Deployment
- No deployable HTTP or callable wrappers exist yet.
- `firebase.json`, `.firebaserc`, and `app/functions/package.json` are still missing.
- Firestore rules and indexes are still not defined in the repo.
- Mobile Firebase anonymous auth is still missing.
- Mobile FCM token registration is still missing.
- Native voice-permission and release-signing work are still pending.

## Recommended Next Implementation Priorities
1. Add deployable backend wrappers for the existing handlers.
2. Add Firebase deployment manifests plus Firestore rules and indexes.
3. Add mobile anonymous auth and FCM token registration.
4. Verify the Firestore backend against a real deployed project and scheduler.
