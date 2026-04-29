# Phase 2D API + Flutter Location Wiring Handoff

## Summary

Phase 2D exposes saved locations and nearest-store availability through explicit backend and Flutter flows.

The implementation:

- adds `GET /user/locations`
- adds `POST /user/locations`
- adds `PATCH /user/locations/:id`
- adds `DELETE /user/locations/:id`
- adds `POST /products/nearest-availability`
- requires owner identity for saved-location CRUD
- keeps one-off coordinate nearest availability opt-in
- adds Flutter DTOs and API client methods for saved locations and nearest availability
- adds product-search UI controls for Home, Work, Custom, and Manual location modes
- renders nearest availability result cards and empty states
- does not request GPS, infer Home/Work, call live geocoding, call LLMs, or add maps UI

## Files Changed

- `functions/index.js`
- `functions/src/phase6/saved_user_locations.js`
- `app/functions/src/phase6/saved_user_locations.js`
- `functions/src/phase6/location_availability.js`
- `app/functions/src/phase6/location_availability.js`
- `functions/src/index.js`
- `app/functions/src/index.js`
- `app/mobile/lib/core/models/app_models.dart`
- `app/mobile/lib/core/services/api_client.dart`
- `app/mobile/lib/features/search/product_search_screen.dart`
- `app/mobile/test/widget_smoke_test.dart`
- `tests/phase_6_saved_user_locations.test.js`
- `docs/STORE_LOCATION_EXTRACTION.md`
- `docs/DATA_MODEL.md`
- `docs/SCHEMA_MAP.md`
- `docs/REPO_MAP.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/test_runs/phase_2d_api_flutter_locations_2026-04-26.json`
- `docs/decision_log.md`
- `CHANGELOG.md`

## Tests

- `npm run test:phase6_saved_locations`
- `npm run test:phase6_location_availability`
- `node -e "require('./functions'); require('./app/functions/src'); console.log('phase2d load ok')"`
- `flutter analyze`
- `flutter test test/widget_smoke_test.dart`

## Phase 2E Recommendation

Add a user-initiated GPS permission flow and manual address-entry polish. GPS should be requested only after the user taps an explicit current-location action. Manual saved locations should continue to work without GPS, and raw address entry can be saved first before any later bounded geocoding enrichment.
