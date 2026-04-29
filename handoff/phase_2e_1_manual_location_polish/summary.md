# Phase 2E-1 Manual Nearby Location Polish Handoff

## Summary

Phase 2E-1 improves the Flutter Nearby availability panel while preserving the Phase 2D backend contract.

The app now:

- keeps nearby availability opt-in from product search
- shows optional manual display-name and raw-address fields
- validates manual latitude and longitude on the client before calling the backend
- uses bounded radius choices up to 50 km
- keeps sort selection explicit
- shows clearer no-saved-location and invalid-location states
- keeps manual address text display-only for this phase

No GPS permission, maps UI, live geocoding API, or LLM runtime call was added.

## Files Changed

- `app/mobile/lib/features/search/product_search_screen.dart`
- `app/mobile/test/widget_smoke_test.dart`
- `docs/STORE_LOCATION_EXTRACTION.md`
- `docs/REPO_MAP.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/decision_log.md`
- `CHANGELOG.md`
- `docs/test_runs/phase_2e_1_manual_location_polish_2026-04-27.json`
- `handoff/phase_2e_1_manual_location_polish/summary.md`

## Verification

- `flutter analyze` passed.
- `flutter test test/widget_smoke_test.dart` passed with 63/63 tests.

## Notes

- Manual address and display-name text are not sent to nearest availability and do not trigger geocoding.
- Saved Home/Work/Custom flows still resolve through saved locations when present.
- Normal product search remains coordinate-free.

## Phase 2E-2 Recommendation

Add a user-initiated GPS permission flow next: a clear "use current location" action, permission-denied/no-location UI states, no automatic prompts, and an explicit save-as-Home/Work/Custom path only after coordinates are available. Keep maps and live geocoding separate until provider confidence and consent behavior are designed.
