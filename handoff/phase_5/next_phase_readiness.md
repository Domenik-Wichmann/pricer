# Next Phase Readiness

## Ready for next phase
The next phase can now assume:
- a tracked Flutter client exists under `app/mobile/`
- the mobile app is wired to the existing query and product-history backend contracts
- shopping lists and watchlists have repository abstractions with Firestore and in-memory implementations
- widget-test coverage exists for the main MVP flows

## Constraints to preserve
- Keep the existing backend contracts stable unless the app and backend are updated together.
- Do not replace deterministic matching with a mobile-only heuristic layer.
- Keep anonymous usage low-friction.
- Keep Firestore optional at bootstrap so local UI development can still run.

## Remaining validation gap
- Android and iOS runtime verification is still pending because this environment does not have Flutter tooling.

## Recommended next implementation focus
1. Generate native runners and real Firebase options on a Flutter-enabled machine.
2. Verify the mobile app against a live or emulated backend endpoint.
3. If monetization or notifications are added later, keep them layered on top of the current clean app services rather than mixing them into the screens.
