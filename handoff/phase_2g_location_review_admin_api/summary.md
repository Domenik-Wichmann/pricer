# Phase 2G Guarded Location Review Admin API Handoff

Date: 2026-04-28

## Summary

Phase 2G exposes guarded internal endpoints so an operator can inspect and decide `location_review_candidates`. The API requires an explicit admin/operator identity header and continues to write only additive review decisions. Approved corrections are not consumed by nearest-store search yet.

## Endpoints

- `GET /internal/location-review/candidates`
- `GET /internal/location-review/candidates/:id`
- `POST /internal/location-review/candidates/:id/approve`
- `POST /internal/location-review/candidates/:id/reject`
- `POST /internal/location-review/candidates/:id/needs-more-info`

Required identity header:

- `x-pricer-admin-id`
- or `x-pricer-operator-id`

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
- `docs/test_runs/phase_2g_location_review_admin_api_2026-04-28.json`
- `docs/decision_log.md`
- `CHANGELOG.md`

## Verification

- `npm run test:phase6_location_review` passed: 9/9.
- `node -e "require('./functions'); require('./functions/src'); require('./app/functions/src'); console.log('phase2g load ok')"` passed.

## Boundaries Preserved

- No maps UI.
- No live geocoding.
- No LLM calls.
- No consumer nearest availability change.
- Reviewed corrections remain additive on review candidates.

## Phase 2H Recommendation

Add a separate reviewed-coordinate publication layer, such as `reviewed_location_coordinates`, sourced only from approved candidates. Keep precedence, supersession, and nearest-availability consumption behind explicit tests before any consumer search path reads it.
