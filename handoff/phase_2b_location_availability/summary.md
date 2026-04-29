# Phase 2B Nearest-Store Product Availability Handoff

## Summary

Phase 2B adds an opt-in nearest-store product availability helper. It reads existing canonical products, canonical mappings, latest source-product snapshots, retailer locations, and matched geocode cache rows.

The implementation:

- uses only `retailer_location_geocodes.status = "matched"` rows
- computes deterministic haversine distance in kilometers
- accepts query text or `canonical_product_id`
- requires explicit latitude and longitude
- bounds radius to 50 km and limit to 50
- supports `nearest`, `cheapest`, and `best_value` sorting
- returns explicit states for invalid location, product not found, missing geocodes, no nearby stores, and matched offers
- keeps normal product search independent of coordinates
- does not call external APIs, LLMs, routing services, geocoding services, saved locations, or maps UI

## Files Changed

- `functions/src/phase6/location_availability.js`
- `app/functions/src/phase6/location_availability.js`
- `functions/src/index.js`
- `app/functions/src/index.js`
- `tests/phase_6_location_availability.test.js`
- `package.json`
- `tests/run_all.js`
- `docs/STORE_LOCATION_EXTRACTION.md`
- `docs/DATA_MODEL.md`
- `docs/SCHEMA_MAP.md`
- `docs/REPO_MAP.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/test_runs/phase_2b_location_availability_2026-04-26.json`
- `docs/decision_log.md`
- `CHANGELOG.md`

## Tests

- `npm run test:phase6_location_availability`
- `npm run test:phase6_geocoding`
- `npm run test:phase6_locations`
- `npm run test:phase6`
- `npm run validate:docs`
- `node -e "require('./app/functions/src'); require('./functions/src'); console.log('index load ok')"`

## Phase 2C Recommendation

Add saved user locations as a separate consented user preference layer with labels, coordinates, optional provider provenance, and bounded defaults for radius/sort. Then expose the Phase 2B helper through an opt-in endpoint or route parameter that can use either a saved location or one-off coordinates while preserving normal coordinate-free product search.
