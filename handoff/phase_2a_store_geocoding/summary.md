# Phase 2A Store Geocoding Cache Handoff

## Summary

Phase 2A adds an additive `retailer_location_geocodes` cache/read model over Phase 6 `retailer_locations`.

The implementation:

- keeps `retailer_locations` raw fields unchanged
- uses deterministic cache keys from normalized country, city, raw address, and store identity
- builds conservative provider query text from country, city, raw address, and useful store/branch context
- stores provider provenance, formatted address, coordinates, confidence, status, and source `location_id`
- uses a fake provider in tests and makes no live geocoding or LLM calls
- keeps consumer search, basket, price lookup, and canonical grouping independent of coordinates

## Files Changed

- `functions/src/phase6/geocoding.js`
- `app/functions/src/phase6/geocoding.js`
- `functions/src/phase1/store.js`
- `app/functions/src/phase1/store.js`
- `functions/src/index.js`
- `app/functions/src/index.js`
- `tests/phase_6_store_geocoding.test.js`
- `tests/run_all.js`
- `package.json`
- `docs/DATA_MODEL.md`
- `docs/SCHEMA_MAP.md`
- `docs/REPO_MAP.md`
- `docs/STORE_LOCATION_EXTRACTION.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/test_runs/phase_2a_store_geocoding_2026-04-26.json`
- `docs/decision_log.md`
- `CHANGELOG.md`

## Tests

- `npm run test:phase6_geocoding`
- `npm run test:phase6_locations`
- `npm run test:phase16_0`
- `node -e "require('./app/functions/src'); require('./functions/src'); console.log('index load ok')"`

## Phase 2B Recommendation

Add an explicit nearest-store read layer over matched geocode records only. Keep it opt-in, bounded by radius/limit, and tolerant of missing or stale coordinates. Product search should continue to work without location coordinates; location-aware ranking can be introduced as a separate parameterized read path after provider confidence thresholds and review handling are validated.
