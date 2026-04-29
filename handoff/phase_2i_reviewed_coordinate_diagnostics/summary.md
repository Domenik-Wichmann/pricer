# Phase 2I Reviewed Coordinate Diagnostics Handoff

Date: 2026-04-28

## Summary

Phase 2I adds guarded operator visibility and dry-run coordinate precedence diagnostics for reviewed location coordinates. It does not change consumer nearest availability.

## What Changed

- Added guarded internal read handlers for active reviewed coordinates, superseded reviewed coordinates, and reviewed coordinate detail.
- Added guarded dry-run diagnostics for source identities across retailer geocodes, manual geocodes, saved user locations, missing retailer geocode sources, and reviewed coordinate records.
- Defined code/docs precedence policy:
  1. active reviewed coordinate wins
  2. otherwise matched provider coordinate wins
  3. otherwise unavailable
- Added HTTP routes:
  - `GET /internal/location-review/reviewed-coordinates`
  - `GET /internal/location-review/reviewed-coordinates/:id`
  - `GET /internal/location-review/coordinate-diagnostics`

## Files Changed

- `functions/index.js`
- `functions/src/phase6/location_review.js`
- `functions/src/index.js`
- `app/functions/src/phase6/location_review.js`
- `app/functions/src/index.js`
- `tests/phase_6_location_review.test.js`
- `docs/DATA_MODEL.md`
- `docs/SCHEMA_MAP.md`
- `docs/REPO_MAP.md`
- `docs/STORE_LOCATION_EXTRACTION.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/test_runs/phase_2i_reviewed_coordinate_diagnostics_2026-04-28.json`
- `docs/decision_log.md`
- `CHANGELOG.md`
- `handoff/phase_2i_reviewed_coordinate_diagnostics/summary.md`

## Verification

- `npm run test:phase6_location_review` passed: 20/20.
- `node -e "require('./functions'); require('./functions/src'); require('./app/functions/src'); console.log('phase2i load ok')"` passed.
- `npm run test:phase6_geocoding` passed: 8/8.
- `npm run test:phase6_location_availability` passed: 9/9.
- `npm run validate:docs` passed.

## Boundaries Preserved

- No maps UI.
- No live geocoding.
- No LLM calls.
- No consumer nearest availability change.
- Normal product search remains coordinate-free.

## Phase 2J Recommendation

Add a guarded, opt-in nearest-availability mode that can consume active reviewed coordinates using the Phase 2I precedence policy. Keep default nearest availability on matched provider geocodes until explicit rollout tests and diagnostics prove the reviewed-coordinate path is ready.
