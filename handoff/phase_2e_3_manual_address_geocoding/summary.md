# Phase 2E-3 Manual-Address Geocoding Handoff

Date: 2026-04-27

## Summary

Phase 2E-3 adds user-triggered manual-address geocoding for nearby availability without making product search depend on geocoding. Address text stays inert while typing. The user must tap `Find coordinates`, then confirm a matched candidate before coordinates populate manual latitude/longitude fields or can be saved as Home, Work, or Custom.

## What Changed

- Added additive `manual_location_geocodes` cache records in the flat runtime backbone.
- Added cache-first manual-address geocoding helpers to `phase6/geocoding.js`, reusing the fake-provider abstraction in tests.
- Added backend route `POST /user/locations/geocode-address`, requiring owner identity headers.
- Added Flutter DTOs/API client method for manual-address geocoding.
- Added product search Nearby availability UI for:
  - explicit `Find coordinates`
  - matched candidate display
  - confirmation before applying coordinates
  - ambiguous/failed/invalid states
  - save confirmed coordinates as Home, Work, or Custom with geocoded provenance
- Updated schema, repo map, store-location docs, changelog, decision log, test registry, and test-run artifact.

## Files Changed

- `functions/index.js`
- `functions/src/index.js`
- `functions/src/phase1/store.js`
- `functions/src/phase6/geocoding.js`
- `app/functions/src/index.js`
- `app/functions/src/phase1/store.js`
- `app/functions/src/phase6/geocoding.js`
- `app/mobile/lib/core/models/app_models.dart`
- `app/mobile/lib/core/services/api_client.dart`
- `app/mobile/lib/features/search/product_search_screen.dart`
- `app/mobile/test/widget_smoke_test.dart`
- `tests/phase_6_store_geocoding.test.js`
- `docs/DATA_MODEL.md`
- `docs/SCHEMA_MAP.md`
- `docs/REPO_MAP.md`
- `docs/STORE_LOCATION_EXTRACTION.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/test_runs/phase_2e_3_manual_address_geocoding_2026-04-27.json`
- `docs/decision_log.md`
- `CHANGELOG.md`

## Verification

- `node tests/phase_6_store_geocoding.test.js` passed: 8/8.
- `node -e "require('./functions/src'); require('./app/functions/src'); console.log('phase2e3 exports load ok')"` passed.
- `flutter analyze` passed.
- `flutter test test/widget_smoke_test.dart` passed: 73/73.

## Boundaries Preserved

- No live Google, Mapbox, Nominatim, or other geocoding provider calls.
- No LLM runtime calls.
- No maps UI.
- No automatic geocoding while typing.
- No automatic GPS request added in this phase.
- Normal product search remains coordinate-free.

## Phase 2F Recommendation

Add location confidence/admin review over retailer and manual geocode caches. Prioritize ambiguous, failed, low-confidence, and frequently reused cache rows; preserve raw source/user text; allow reviewed coordinate overrides as additive records rather than raw-field mutation.
