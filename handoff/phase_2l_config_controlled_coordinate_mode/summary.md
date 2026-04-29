# Phase 2L Config-Controlled Coordinate Mode Handoff

Date: 2026-04-28

## Summary

Phase 2L adds `DEFAULT_COORDINATE_MODE` as an operator-controlled nearest-availability default. The safe fallback remains `provider_only`.

## What Changed

- Added `resolveDefaultCoordinateMode(...)`.
- `DEFAULT_COORDINATE_MODE=provider_only` keeps the current provider-geocode default.
- `DEFAULT_COORDINATE_MODE=reviewed_first` makes omitted request coordinate mode use active reviewed coordinates first.
- Unset or invalid config falls back to `provider_only`.
- Explicit request `coordinate_mode` still overrides config.
- Invalid request `coordinate_mode` values are still rejected.

## Files Changed

- `functions/src/phase6/location_availability.js`
- `app/functions/src/phase6/location_availability.js`
- `functions/src/index.js`
- `app/functions/src/index.js`
- `tests/phase_6_location_availability.test.js`
- `app/secrets/backend.env.example`
- `docs/needed_secrets.md`
- `docs/DATA_MODEL.md`
- `docs/SCHEMA_MAP.md`
- `docs/REPO_MAP.md`
- `docs/STORE_LOCATION_EXTRACTION.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/test_runs/phase_2l_config_controlled_coordinate_mode_2026-04-28.json`
- `docs/decision_log.md`
- `CHANGELOG.md`
- `handoff/phase_2l_config_controlled_coordinate_mode/summary.md`
- `handoff/phase_6_store_locations/summary.md`

## Verification

- `npm run test:phase6_location_availability` passed: 19/19.
- `npm run test:phase6_location_review` passed: 24/24.
- `npm run test:phase6_geocoding` passed: 8/8.
- `node -e "require('./functions'); require('./functions/src'); require('./app/functions/src'); console.log('phase2l load ok')"` passed.
- `node -e "const m=require('./app/functions/src'); if (m.resolveDefaultCoordinateMode({DEFAULT_COORDINATE_MODE:'reviewed_first'}) !== 'reviewed_first') process.exit(1); if (m.resolveDefaultCoordinateMode({DEFAULT_COORDINATE_MODE:'bad'}) !== 'provider_only') process.exit(1); console.log('phase2l config resolver ok')"` passed.
- Backend mirror hash check passed for `location_availability.js` and `index.js`.
- `npm run validate:docs` passed.

## Boundaries Preserved

- No behavior change unless `DEFAULT_COORDINATE_MODE=reviewed_first` is explicitly configured.
- No maps UI.
- No live geocoding.
- No LLM calls.
- Request-level `coordinate_mode` remains explicit and validated.
- Normal product search remains coordinate-free.

## Next Non-Location Recommendation

Start Firebase anonymous ownership from the MVP blocker list: add anonymous sign-in to mobile, use Firebase UID where available for backend owner headers and local Firestore paths, and preserve a migration/claiming path from existing `pricer_anon_id` data.
