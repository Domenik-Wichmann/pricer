# Phase 2C Saved User Locations Handoff

## Summary

Phase 2C adds explicit saved user locations for location-aware search. These are user-consented preferences only; the system does not infer Home, Work, or Custom locations from behavior.

The implementation:

- adds flat runtime collection `saved_user_locations`
- supports `home`, `work`, and `custom` labels
- stores display name, raw address, coordinates, default radius/sort, source, optional provider provenance, default flag, and timestamps
- validates coordinates, radius bounds, labels, sorts, and sources
- adds `upsertSavedUserLocation(...)`, `listSavedUserLocations(...)`, `deleteSavedUserLocation(...)`, and `resolveLocationForSearch(...)`
- lets Phase 2B availability use explicit coordinates, `saved_location_id`, an unambiguous label, or a default saved location
- does not request device GPS, call geocoding APIs, call LLMs, or add maps UI
- keeps coordinate-free product search unchanged

## Files Changed

- `functions/src/phase6/saved_user_locations.js`
- `app/functions/src/phase6/saved_user_locations.js`
- `functions/src/phase6/location_availability.js`
- `app/functions/src/phase6/location_availability.js`
- `functions/src/phase1/store.js`
- `app/functions/src/phase1/store.js`
- `functions/src/index.js`
- `app/functions/src/index.js`
- `tests/phase_6_saved_user_locations.test.js`
- `package.json`
- `tests/run_all.js`
- `docs/STORE_LOCATION_EXTRACTION.md`
- `docs/DATA_MODEL.md`
- `docs/SCHEMA_MAP.md`
- `docs/REPO_MAP.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/test_runs/phase_2c_saved_user_locations_2026-04-26.json`
- `docs/decision_log.md`
- `CHANGELOG.md`

## Tests

- `npm run test:phase6_saved_locations`
- `npm run test:phase6_location_availability`
- `npm run test:phase6_geocoding`
- `npm run test:phase6_locations`
- `npm run test:phase6`
- `npm run validate:docs`
- `node -e "const m=require('./app/functions/src'); if (!m.upsertSavedUserLocation || !m.resolveLocationForSearch || !m.findNearestProductAvailability) process.exit(1); console.log('phase2c exports ok')"`

## Phase 2D Recommendation

Add API and Flutter integration around this helper layer: saved-location CRUD endpoints, an opt-in nearest-availability endpoint, mobile location picker controls for Home/Work/Custom, and explicit empty/error states. Keep device GPS permission prompts separate and user-initiated; manual saved locations should work without GPS or maps.
