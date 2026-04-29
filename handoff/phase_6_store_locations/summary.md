# Phase 6 Store Locations Handoff

## Status

Implemented and locally verified on 2026-04-26.

## What Changed

- Added `retailer_locations` as a derived flat runtime collection.
- Added deterministic store/location extraction in `phase6/store_locations.js`.
- Phase 6 ingest now rebuilds `retailer_locations` from `raw_price_snapshots` and `source_products` after each ingest finalization.
- Coordinates remain null; no geocoding APIs or LLMs are called.
- Search, basket, canonical grouping, and price lookup behavior remain unchanged.

## Source Data Findings

- Product source files do not have dedicated address, latitude, or longitude columns.
- Existing `store_name_raw` / `Търговски обект` values often contain embedded branch, city, and address text.
- Examples found in current data include `ул.`, `бул.`, `жк`, slash-separated chain/city/address forms, and store-only names.

## Verification

- `npm run test:phase6_locations` passed: 4 passed, 0 failed.
- `npm run test:phase6` passed: 73 passed, 0 failed.
- `npm run test:phase16_0` passed: 8 passed, 0 failed.

See `docs/test_runs/phase_6_store_locations_2026-04-26.json`.

## Phase 2 Recommendation

- Add a bounded geocoding job over `retailer_locations` where `needs_geocoding = true` and coordinates are missing.
- Cache provider results by normalized country/city/raw address/store identity.
- Store provider provenance and confidence additively.
- Add nearest-store reads only after coordinates exist, with explicit missing/stale-coordinate states.

## Phase 2E-3 Addendum

Implemented on 2026-04-27.

- Added user-triggered manual-address geocoding via `manual_location_geocodes`.
- Added `POST /user/locations/geocode-address` using the cache-first fake-provider-capable geocoding abstraction.
- Flutter Nearby availability now geocodes manual address text only after `Find coordinates`, requires confirmation before applying coordinates, and can save confirmed coordinates as Home, Work, or Custom.
- Product search remains coordinate-free and no live geocoding, maps, GPS, or LLM behavior was added.

See `handoff/phase_2e_3_manual_address_geocoding/summary.md` and `docs/test_runs/phase_2e_3_manual_address_geocoding_2026-04-27.json`.

## Phase 2F Addendum

Implemented on 2026-04-28.

- Added `location_review_candidates` for deterministic review of ambiguous, failed, low-confidence, high-reuse, provider-mismatched, and missing-coordinate location rows.
- Review approvals can store corrected coordinates additively without mutating raw retailer/location/geocode/user address fields.
- No maps UI, live geocoding, LLM usage, or consumer nearest-search behavior change was introduced.

See `handoff/phase_2f_location_review/summary.md` and `docs/test_runs/phase_2f_location_review_2026-04-28.json`.

## Phase 2G Addendum

Implemented on 2026-04-28.

- Added guarded internal location-review endpoints for listing, reading, approving, rejecting, and marking candidates as needing more information.
- Admin routes require `x-pricer-admin-id` or `x-pricer-operator-id`.
- Decisions remain additive on `location_review_candidates`; consumer nearest availability does not consume reviewed corrections yet.

See `handoff/phase_2g_location_review_admin_api/summary.md` and `docs/test_runs/phase_2g_location_review_admin_api_2026-04-28.json`.

## Phase 2H Addendum

Implemented on 2026-04-28.

- Added `reviewed_location_coordinates` as an additive publication layer from approved review candidates.
- Publisher preserves source candidate/source row identity, reviewer, approved coordinates, correction reason, and provenance.
- Supersession keeps one active reviewed coordinate per source identity while retaining older approved rows inactive.
- Consumer nearest availability and normal product search still do not consume reviewed corrections.

See `handoff/phase_2h_reviewed_location_coordinates/summary.md` and `docs/test_runs/phase_2h_reviewed_location_coordinates_2026-04-28.json`.

## Phase 2I Addendum

Implemented on 2026-04-28.

- Added guarded internal reviewed-coordinate reads for active, superseded, and detail views.
- Added dry-run coordinate diagnostics with precedence: active reviewed coordinate, matched provider coordinate, then unavailable.
- Diagnostics are read-only and do not feed consumer nearest availability.

See `handoff/phase_2i_reviewed_coordinate_diagnostics/summary.md` and `docs/test_runs/phase_2i_reviewed_coordinate_diagnostics_2026-04-28.json`.

## Phase 2J Addendum

Date: 2026-04-28

- Added opt-in `coordinate_mode` for nearest availability.
- Default `provider_only` behavior still uses matched provider geocode rows only.
- Explicit `reviewed_first` uses active reviewed coordinates before matched provider geocodes and ignores superseded reviewed coordinates.
- Results include coordinate source metadata for rollout/debugging.
- Normal product search, live geocoding, maps UI, and LLM usage remain unchanged.

See `handoff/phase_2j_reviewed_coordinate_nearest_availability/summary.md` and `docs/test_runs/phase_2j_reviewed_coordinate_nearest_availability_2026-04-28.json`.

## Phase 2K Addendum

Date: 2026-04-28

- Added guarded rollout diagnostics for reviewed-coordinate default-switch readiness.
- Diagnostics compare `provider_only` and `reviewed_first` counts, changed-coordinate counts, provider-vs-reviewed distance deltas, high-reuse reviewed coverage, and reviewed confidence buckets.
- Added `GET /internal/location-review/rollout-diagnostics`, guarded by explicit admin/operator identity headers.
- Documented switch criteria and rollback/fallback requirements.
- `provider_only` remains the default; no consumer nearest availability behavior changed.

See `handoff/phase_2k_reviewed_coordinate_rollout_diagnostics/summary.md` and `docs/test_runs/phase_2k_reviewed_coordinate_rollout_diagnostics_2026-04-28.json`.

## Phase 2L Addendum

Date: 2026-04-28

- Added `DEFAULT_COORDINATE_MODE` for config-controlled nearest-availability defaults.
- Unset or invalid config falls back to `provider_only`.
- Explicit request `coordinate_mode` still overrides config and invalid request values remain rejected.
- Documented the non-secret rollout config in `app/secrets/backend.env.example` and `docs/needed_secrets.md`.
- No maps UI, live geocoding, LLM usage, or normal product search behavior changed.

See `handoff/phase_2l_config_controlled_coordinate_mode/summary.md` and `docs/test_runs/phase_2l_config_controlled_coordinate_mode_2026-04-28.json`.
