# Phase 2E-2 User-Initiated Current Location Handoff

## Summary

Phase 2E-2 adds a consent-first current-location flow to the Flutter Nearby availability panel.

The app now:

- shows a `Use current location` button in the opt-in nearby panel
- requests foreground location permission only after the user taps that button
- shows denied, permanently denied, unavailable/error, loading, and acquired states
- copies acquired coordinates into the manual coordinate fields
- uses acquired coordinates in the existing nearest availability request
- exposes explicit save-as Home, Work, and Custom actions after acquisition

No maps UI, live geocoding, background tracking, automatic permission prompt, inferred Home/Work label, or LLM runtime call was added.

## Files Changed

- `app/mobile/lib/core/services/current_location_service.dart`
- `app/mobile/lib/core/services/app_dependencies.dart`
- `app/mobile/lib/features/search/product_search_screen.dart`
- `app/mobile/pubspec.yaml`
- `app/mobile/pubspec.lock`
- `app/mobile/android/app/src/main/AndroidManifest.xml`
- `app/mobile/ios/Runner/Info.plist`
- `app/mobile/macos/Runner/Info.plist`
- `app/mobile/test/widget_smoke_test.dart`
- `app/mobile/test/widget_test.dart`
- `app/mobile/test/startup_hardening_test.dart`
- `docs/STORE_LOCATION_EXTRACTION.md`
- `docs/REPO_MAP.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/decision_log.md`
- `CHANGELOG.md`
- `docs/test_runs/phase_2e_2_current_location_2026-04-27.json`
- `handoff/phase_2e_2_current_location/summary.md`

## Verification

- `flutter pub get` passed.
- `flutter analyze` passed.
- `flutter test test/widget_smoke_test.dart` passed with 67/67 tests.
- `flutter test test/widget_test.dart` passed with 1/1 test.
- `flutter test test/startup_hardening_test.dart` passed with 6/6 tests.

## Notes

- Tests use fake current-location services; no live location request is made during verification.
- The production service is backed by `geolocator` and requests permission only from the button handler.
- Saved Home/Work/Custom actions call the existing saved-location API with `source = "device"`.
- Manual and saved-location nearby flows remain intact.

## Phase 2E-3 Recommendation

Add optional manual-address geocoding next as a bounded enrichment action: user-triggered only, cache-first, provider-backed through the existing geocoding abstraction, explicit confirmation before saving coordinates, and full ambiguous/failed/skipped states. Product search should remain independent of geocoding.
