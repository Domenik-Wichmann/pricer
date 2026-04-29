# Phase 2F Location Confidence and Admin Review Handoff

Date: 2026-04-28

## Summary

Phase 2F adds an additive admin-review layer for risky or valuable location/geocode records. The new `location_review_candidates` collection ranks candidates from existing location sources and stores review decisions plus approved coordinate corrections without overwriting raw retailer, geocode, manual address, or saved-location fields.

## What Changed

- Added `location_review_candidates` to the flat runtime backbone.
- Added `phase6/location_review.js` in both backend trees.
- Added deterministic candidate building from:
  - `retailer_location_geocodes`
  - `manual_location_geocodes`
  - geocoded `saved_user_locations`
  - address-like `retailer_locations` with no coordinates/geocode result
- Ranked candidates by status risk, low confidence, reuse count, missing coordinates, and provider ambiguity/mismatch.
- Added review decisions:
  - `pending`
  - `approved`
  - `rejected`
  - `needs_more_info`
- Added review fields:
  - `reviewed_by`
  - `reviewed_at`
  - `reviewer_note`
  - `approved_latitude`
  - `approved_longitude`
  - `correction_reason`
- Added focused Phase 6 tests and package script `npm run test:phase6_location_review`.

## Files Changed

- `functions/src/phase1/store.js`
- `functions/src/phase6/location_review.js`
- `functions/src/index.js`
- `app/functions/src/phase1/store.js`
- `app/functions/src/phase6/location_review.js`
- `app/functions/src/index.js`
- `tests/phase_6_location_review.test.js`
- `tests/run_all.js`
- `package.json`
- `docs/DATA_MODEL.md`
- `docs/SCHEMA_MAP.md`
- `docs/REPO_MAP.md`
- `docs/STORE_LOCATION_EXTRACTION.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/test_runs/phase_2f_location_review_2026-04-28.json`
- `docs/decision_log.md`
- `CHANGELOG.md`

## Verification

- `npm run test:phase6_location_review` passed: 4/4.
- `npm run test:phase6_geocoding` passed: 8/8.
- `npm run test:phase6_location_availability` passed: 9/9.
- `node -e "require('./functions'); require('./functions/src'); require('./app/functions/src'); console.log('phase2f load ok')"` passed.

## Boundaries Preserved

- No maps UI.
- No live provider calls.
- No LLM calls.
- No consumer nearest-search behavior change.
- Approved corrections remain additive on `location_review_candidates`.

## Phase 2G Recommendation

Expose a small internal/admin API or CLI for listing and deciding review candidates. Keep it guarded, deterministic, and read-model oriented; do not make consumer nearest availability consume approved corrections until a later explicit phase defines that behavior.
