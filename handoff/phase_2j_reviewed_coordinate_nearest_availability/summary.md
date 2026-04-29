# Phase 2J Reviewed-Coordinate Nearest Availability Handoff

Date: 2026-04-28

## Summary

Phase 2J lets nearest product availability use reviewed coordinates only when explicitly requested. Default availability remains provider-only.

## What Changed

- Added `coordinate_mode` with allowed values `provider_only` and `reviewed_first`.
- Kept `provider_only` as the default.
- In `reviewed_first`, active `reviewed_location_coordinates` win before matched provider geocodes.
- Superseded reviewed coordinates are ignored.
- Offers now expose `coordinate_source`, `coordinate_mode`, and reviewed-coordinate provenance where applicable.
- Invalid API `coordinate_mode` values are rejected.

## Files Changed

- `functions/src/phase6/location_availability.js`
- `app/functions/src/phase6/location_availability.js`
- `functions/src/index.js`
- `app/functions/src/index.js`
- `tests/phase_6_location_availability.test.js`
- `docs/DATA_MODEL.md`
- `docs/SCHEMA_MAP.md`
- `docs/REPO_MAP.md`
- `docs/STORE_LOCATION_EXTRACTION.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/test_runs/phase_2j_reviewed_coordinate_nearest_availability_2026-04-28.json`
- `docs/decision_log.md`
- `CHANGELOG.md`
- `handoff/phase_2j_reviewed_coordinate_nearest_availability/summary.md`
- `handoff/phase_6_store_locations/summary.md`

## Verification

- `npm run test:phase6_location_availability` passed: 15/15.
- `npm run test:phase6_location_review` passed: 20/20.
- `npm run test:phase6_geocoding` passed: 8/8.
- `node -e "require('./functions'); require('./functions/src'); require('./app/functions/src'); console.log('phase2j load ok')"` passed.
- Backend mirror hash check passed for `location_availability.js` and `index.js`.
- `npm run validate:docs` passed.

## Boundaries Preserved

- No maps UI.
- No live geocoding.
- No LLM calls.
- Reviewed coordinates are not the default.
- Normal product search remains coordinate-free.

## Phase 2K Recommendation

Define rollout/default-switch criteria before making reviewed coordinates the default: minimum active-reviewed coverage for high-reuse stores, confidence thresholds, opt-in comparison reports against provider-only distances, operator approval sampling, and a fast fallback to `provider_only`.
