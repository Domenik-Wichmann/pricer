# Phase 2K Reviewed-Coordinate Rollout Diagnostics Handoff

Date: 2026-04-28

## Summary

Phase 2K adds guarded rollout diagnostics for deciding when `coordinate_mode = "reviewed_first"` could safely become the default. It does not change the default.

## What Changed

- Added rollout diagnostics over `retailer_location_geocodes`, `retailer_locations`, and active `reviewed_location_coordinates`.
- Added metrics for provider-only count, reviewed-first count, changed-coordinate count, distance deltas, high-reuse reviewed coverage, and reviewed-coordinate confidence buckets.
- Added switch criteria documentation:
  - at least 80% reviewed coverage for high-reuse stores
  - max 0.5 km provider-vs-reviewed delta for default-switch candidates unless explicitly reviewed
  - operator sampling for changed high-reuse coordinates
  - rollback/fallback to `provider_only`
- Added guarded endpoint:
  - `GET /internal/location-review/rollout-diagnostics`

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
- `docs/test_runs/phase_2k_reviewed_coordinate_rollout_diagnostics_2026-04-28.json`
- `docs/decision_log.md`
- `CHANGELOG.md`
- `handoff/phase_2k_reviewed_coordinate_rollout_diagnostics/summary.md`
- `handoff/phase_6_store_locations/summary.md`

## Verification

- `npm run test:phase6_location_review` passed: 24/24.
- `npm run test:phase6_location_availability` passed: 15/15.
- `npm run test:phase6_geocoding` passed: 8/8.
- `node -e "require('./functions'); require('./functions/src'); require('./app/functions/src'); console.log('phase2k load ok')"` passed.
- `node -e "const m=require('./app/functions/src'); if (!m.buildReviewedCoordinateRolloutDiagnostics || !m.handleReviewedCoordinateRolloutDiagnosticsRequest) process.exit(1); console.log('phase2k exports ok')"` passed.
- Backend mirror hash check passed for `location_review.js` and `index.js`.
- `npm run validate:docs` passed.

## Boundaries Preserved

- `provider_only` remains the default coordinate mode.
- No maps UI.
- No live geocoding.
- No LLM calls.
- No consumer default behavior change.
- Normal product search remains coordinate-free.

## Phase 2L Recommendation

Add a config-controlled rollout flag for the default coordinate mode. Keep the flag defaulted to `provider_only`, emit comparison metrics while enabled in internal/staged environments, and only switch broadly after rollout diagnostics satisfy the documented coverage, delta, sample-review, and rollback criteria.
