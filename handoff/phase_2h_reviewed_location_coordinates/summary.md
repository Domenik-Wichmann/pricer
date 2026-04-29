# Phase 2H Reviewed Location Coordinate Publication Handoff

Date: 2026-04-28

## Summary

Phase 2H adds `reviewed_location_coordinates`, an additive internal read model that publishes approved location-review coordinate corrections without overwriting raw source, provider, or user-location records.

## What Changed

- Added `reviewed_location_coordinates` to the flat runtime store and Firestore document-id registry.
- Added `publishReviewedLocationCoordinates(...)` and in-state publisher helpers to `phase6/location_review.js`.
- Published rows include source candidate, source row identity, optional location id, reviewed coordinates, confidence, reviewer, approval time, correction reason, supersession fields, and provenance.
- Supersession keeps one active reviewed coordinate per source identity and marks older active rows inactive.
- Nearest availability and normal product search still ignore reviewed coordinates.

## Files Changed

- `functions/src/phase1/store.js`
- `functions/src/phase6/location_review.js`
- `functions/src/index.js`
- `app/functions/src/phase1/store.js`
- `app/functions/src/phase6/location_review.js`
- `app/functions/src/index.js`
- `tests/phase_6_location_review.test.js`
- `docs/DATA_MODEL.md`
- `docs/SCHEMA_MAP.md`
- `docs/REPO_MAP.md`
- `docs/STORE_LOCATION_EXTRACTION.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/test_runs/phase_2h_reviewed_location_coordinates_2026-04-28.json`
- `docs/decision_log.md`
- `CHANGELOG.md`
- `handoff/phase_2h_reviewed_location_coordinates/summary.md`

## Verification

- `npm run test:phase6_location_review` passed: 14/14.
- `node -e "require('./functions'); require('./functions/src'); require('./app/functions/src'); console.log('phase2h load ok')"` passed.
- `npm run test:phase6_geocoding` passed: 8/8.
- `npm run test:phase6_location_availability` passed: 9/9.

## Boundaries Preserved

- No maps UI.
- No live geocoding.
- No LLM calls.
- No consumer nearest availability change.
- Raw geocode/source rows remain unchanged.

## Phase 2I Recommendation

Add an operator read surface and dry-run diagnostics for active reviewed coordinates, then define explicit precedence between provider geocodes and approved reviewed corrections before enabling any nearest-availability consumption.
