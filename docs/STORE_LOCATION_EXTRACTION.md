# Store Location Extraction

## Summary

Pricer source data does not currently expose a dedicated address column. The KolkoStruva product files use the existing `Търговски обект` / `store_name_raw` field for both store display names and, for many retailers, branch/location text.

Observed real source patterns include:

- `МАГАЗИН 1 Димекс ООД, ул.Димитър Каляшки 1`
- `Аптека Марешки / 637 / гр.Пловдив ул. Капитан Райчо 32, ет. 1`
- `4001/SOpharmacy Хелзинки София/СОФИЯ/ул. Димитър Хаджикоцев 6`
- `187 - София/Околовръстен път 214`
- store-only values such as `Хранителна борса Сарандиев`

The first extraction layer is deterministic and runtime-safe. It does not call geocoding APIs, does not use an LLM, and does not alter product identity, canonical grouping, search, basket, or price lookup behavior.

## Runtime Collection

`retailer_locations` is a derived flat collection owned by Phase 6 ingest.

Fields:

- `location_id`
- `chain_id`
- `chain_name_raw`
- `chain_name_normalized`
- `store_name_raw`
- `store_name_normalized`
- `branch_name`
- `raw_address`
- `city`
- `locality_code`
- `country`
- `latitude`
- `longitude`
- `source`
- `confidence`
- `confidence_reason`
- `extraction_method`
- `rules_version`
- `needs_geocoding`
- `provenance`
- `first_seen_date`
- `last_seen_date`
- `snapshot_count`
- `source_product_count`
- `extracted_at`
- `updated_at`

`latitude` and `longitude` are intentionally `null` until a later bounded geocoding phase. `needs_geocoding` is true only when the parser found at least city or raw address context.

## Extraction Rules

Source rows are grouped by deterministic location identity:

```text
sha256(retailer_location_v1|locality_code|chain_id|store_name_normalized)
```

The parser extracts:

- `city` from explicit Bulgarian markers such as `гр.` / `град` / `с.` and from common slash/comma address formats.
- `raw_address` from slash-separated address segments, comma-separated street segments, or street markers such as `ул.`, `бул.`, `жк`, `Street`, `Boulevard`, and `Strasse`.
- `branch_name` as the remaining leading store label when an address segment is found.

Confidence is conservative:

- `0.88`: city and street marker found.
- `0.78`: street/address marker found.
- `0.72`: weaker numeric address plus city found.
- `0.58`: city only.
- `0.35`: store name only.

## Provenance

Every extracted location keeps source evidence:

- source file name/stem/numeric id
- source chain raw/normalized name
- sample snapshot ids
- sample source product ids
- raw store names

This preserves raw source truth and supports later review/geocoding without overwriting ingest records.

## Phase 2A Geocoding Cache

Phase 2A adds `retailer_location_geocodes`, an additive cache/read model over `retailer_locations`.

It stores:

- `provider`
- `provider_place_id`
- `query_text`
- `formatted_address`
- `latitude`
- `longitude`
- `confidence`
- `confidence_reason`
- `status`
- `provenance.location_id`

Cache keys are built from normalized country, city, raw address, and store identity. Query text is conservative and ordered from broad to specific context: country, city, raw address, then the store or branch label when it helps disambiguate.

Statuses:

- `matched`: one provider result with coordinates.
- `ambiguous`: multiple provider candidates; coordinates stay null.
- `failed`: no usable provider result.
- `skipped`: not enough city/address context to geocode safely.
- `pending`: reserved for queued provider work.

Tests use a fake provider only. Phase 2A does not call Google, Mapbox, Nominatim, an LLM, or any other external service, and consumer product search does not depend on the cache.

## Phase 2B Recommendation

Phase 2B adds an opt-in nearest-store product availability read layer over matched geocoding cache rows.

The read layer:

- accepts `queryText` or `canonicalProductId`
- requires explicit latitude and longitude input
- bounds radius to 50 km and limit to 50
- uses haversine distance
- joins canonical product mappings to latest source-product offers, retailer locations, and matched `retailer_location_geocodes`
- ignores non-`matched` geocode rows
- returns explicit statuses: `matched`, `no_nearby_stores`, `no_geocoded_locations`, `product_not_found`, and `invalid_location`
- supports `nearest`, `cheapest`, and `best_value` sorting

This remains opt-in helper behavior. Normal product search, basket planning, price lookup, and canonical grouping do not require coordinates.

## Phase 2C Recommendation

Phase 2C adds saved user locations for location-aware search.

`saved_user_locations` stores explicit user-consented preferences:

- `location_id`
- `user_id`
- `label`
- `display_name`
- `address_raw`
- `latitude`
- `longitude`
- `default_radius_km`
- `default_sort`
- `source`
- optional provider/provenance fields
- `is_default`
- `created_at`
- `updated_at`

Helpers:

- `upsertSavedUserLocation(...)`
- `listSavedUserLocations(...)`
- `deleteSavedUserLocation(...)`
- `resolveLocationForSearch(...)`

Phase 2B availability can now resolve coordinates from explicit latitude/longitude, `saved_location_id`, an unambiguous label such as `home` or `work`, or the user's default saved location. Saved-location radius and sort defaults are applied when a request omits them.

This phase still does not request device GPS, infer home/work from behavior, call external geocoding APIs, call an LLM, or add maps UI.

## Phase 2D Recommendation

Phase 2D adds API and Flutter integration:

- Add backend endpoints for saved-location CRUD and nearest availability search.
- Use explicit owner/user identity headers until real auth is available, matching existing saved-list/watchlist patterns.
- Add Flutter screens or controls for choosing Home, Work, Custom, or one-off coordinates.
- Keep permission prompts separate from manual saved-location entry; do not request device GPS automatically.
- Surface explicit availability states instead of silently falling back to global product search.

Backend endpoints:

- `GET /user/locations`
- `POST /user/locations`
- `PATCH /user/locations/:id`
- `DELETE /user/locations/:id`
- `POST /products/nearest-availability`

Flutter wiring:

- API client methods for saved-location list/create/update/delete and nearest availability.
- Search-screen opt-in controls for Home, Work, Custom, and Manual coordinates.
- Nearest availability cards and empty states for no geocoded stores, no nearby stores, product not found, and invalid location.

## Phase 2E-1 Manual Location Polish

Phase 2E-1 improves the existing Flutter Nearby availability panel without changing backend search behavior.

The mobile search screen now:

- keeps Home, Work, Custom, and Manual as visibly opt-in modes
- shows optional manual display-name and raw-address fields
- keeps manual raw address text local to the panel and does not geocode it
- requires valid manual latitude from `-90` to `90`
- requires valid manual longitude from `-180` to `180`
- offers bounded radius choices up to the existing 50 km backend maximum
- keeps `nearest`, `cheapest`, and `best_value` sort choices explicit
- shows clearer states for no saved locations, invalid manual coordinates, no nearby stores, no geocoded stores, and product-not-found responses

Nearest availability requests still send only product identity, explicit coordinates or saved-location identity, radius, sort, and limit. No GPS permission, maps UI, live geocoding API, or LLM runtime call is introduced.

## Phase 2E-2 Current Location Flow

Phase 2E-2 adds a user-initiated current-location flow to the Flutter Nearby availability panel.

The mobile app now:

- shows an explicit `Use current location` button
- requests foreground location permission only after that button is tapped
- displays loading, permission-denied, permanently-denied, unavailable/error, and acquired-coordinate states
- copies acquired coordinates into the existing manual coordinate fields
- uses acquired coordinates through the same opt-in nearest availability request as manual coordinates
- shows explicit save-as Home, Work, and Custom actions after acquisition
- saves user-selected current locations with `source = "device"` through the existing saved-location API

Platform permissions are foreground-only. No background tracking, maps UI, live geocoding API, automatic prompts, inferred Home/Work labels, or LLM runtime call is introduced.

## Phase 2E-3 Manual-Address Geocoding

Phase 2E-3 adds optional manual-address geocoding as a bounded enrichment action:

- raw manual address entry remains display/storage-only by default
- Flutter geocodes only after the user taps `Find coordinates`
- backend requests route through the cache-first geocoding abstraction at `POST /user/locations/geocode-address`
- tests use the fake provider only; no live provider is called
- matched results show a candidate and require explicit confirmation before coordinates populate manual fields
- confirmed coordinates can feed nearest availability or be saved as Home, Work, or Custom with `source = "geocoded"`
- saved geocoded locations preserve provider, provider place id, formatted address, confidence, confidence reason, and provenance
- ambiguous, failed, skipped, and invalid-input states do not auto-apply coordinates

`manual_location_geocodes` is additive and keyed by normalized country, city, and raw address text. Product search remains coordinate-free. Nearby availability continues to consume only explicit coordinates or saved locations and does not call geocoding itself.

## Phase 2F Location Confidence and Admin Review

Phase 2F adds `location_review_candidates`, a deterministic admin-review read model for risky or valuable geocoded locations.

Candidate sources:

- `retailer_location_geocodes`
- `manual_location_geocodes`
- `saved_user_locations` with `source = "geocoded"`
- `retailer_locations` with address-like text, `needs_geocoding = true`, and no coordinates/geocode result

Candidates are ranked by:

- status risk such as `ambiguous`, `failed`, `provider_mismatch`, or missing geocode
- low confidence
- source product/snapshot reuse count
- missing coordinates
- provider ambiguity or saved-location provider mismatch

Review fields:

- `review_status`: `pending`, `approved`, `rejected`, or `needs_more_info`
- `reviewed_by`
- `reviewed_at`
- `reviewer_note`
- `approved_latitude`
- `approved_longitude`
- `correction_reason`

Corrections are additive. Approved coordinates live on the review candidate and do not overwrite retailer raw fields, geocode cache rows, manual address text, or saved user location rows. Phase 2F adds no maps UI, live provider calls, or LLM calls.

## Phase 2G Guarded Location Review Admin API

Phase 2G exposes a small guarded internal/admin API for review operations:

- `GET /internal/location-review/candidates`
- `GET /internal/location-review/candidates/:id`
- `POST /internal/location-review/candidates/:id/approve`
- `POST /internal/location-review/candidates/:id/reject`
- `POST /internal/location-review/candidates/:id/needs-more-info`

All routes require an explicit operator identity header:

- `x-pricer-admin-id`
- or `x-pricer-operator-id`

The routes rebuild/read `location_review_candidates`, return pending candidates by default, and write only additive review decisions. Approvals can include corrected coordinates and a correction reason, but those corrections remain on the review candidate and do not feed consumer nearest availability yet. Phase 2G adds no maps UI, live geocoding, LLM calls, or consumer behavior changes.

## Phase 2H Reviewed Coordinate Publication

Phase 2H adds `reviewed_location_coordinates`, an internal additive publication layer from approved `location_review_candidates`.

The publisher:

- reads only approved candidates with valid `approved_latitude` and `approved_longitude`
- writes `reviewed_coordinate_id`, source candidate/source row identity, location id when available, reviewed coordinates, confidence, correction reason, reviewer, approval timestamp, provenance, and publication lifecycle fields
- keeps one active reviewed coordinate per source identity
- marks older active reviewed coordinates inactive when a later approval supersedes them
- leaves `retailer_locations`, `retailer_location_geocodes`, `manual_location_geocodes`, `saved_user_locations`, and review candidate raw evidence unchanged

Phase 2H still does not feed reviewed coordinates into nearest availability, product search, basket, price lookup, maps UI, live geocoding, or LLM runtime paths.

## Phase 2I Reviewed Coordinate Diagnostics

Phase 2I adds operator visibility and dry-run precedence diagnostics for reviewed coordinates without changing consumer nearest availability.

Admin/operator routes:

- `GET /internal/location-review/reviewed-coordinates?status=active`
- `GET /internal/location-review/reviewed-coordinates?status=superseded`
- `GET /internal/location-review/reviewed-coordinates/:id`
- `GET /internal/location-review/coordinate-diagnostics`

All routes require `x-pricer-admin-id` or `x-pricer-operator-id`.

The dry-run precedence policy is:

1. active reviewed coordinate wins
2. otherwise matched provider coordinate wins
3. otherwise the coordinate is unavailable

Diagnostics show the source identity, provider coordinate if available, active reviewed coordinate if available, superseded reviewed-coordinate count, the dry-run winner, and the reason. This is intentionally read-only. Phase 2I still does not feed reviewed coordinates into nearest availability, product search, basket, price lookup, maps UI, live geocoding, or LLM runtime paths.

## Phase 2J Opt-In Reviewed-Coordinate Availability

Phase 2J adds an explicit nearest-availability coordinate mode:

- `provider_only` is the default and preserves the existing matched-provider geocode behavior.
- `reviewed_first` is opt-in and applies the Phase 2I precedence policy for retailer locations: active reviewed coordinate first, otherwise matched provider geocode, otherwise unavailable/excluded.

`POST /products/nearest-availability` now accepts optional `coordinate_mode` with values `provider_only` or `reviewed_first`. Invalid values are rejected. Result offers include `coordinate_source` (`provider` or `reviewed`) plus coordinate provenance fields so operators can see whether a returned distance came from the provider cache or the additive reviewed-coordinate layer.

Phase 2J still does not make reviewed coordinates the default, does not call live geocoding, does not add maps UI, does not use an LLM, and does not change normal product search, basket planning, price lookup, or canonical grouping.

## Phase 2K Rollout Diagnostics and Default-Switch Criteria

Phase 2K adds guarded operator diagnostics for deciding when reviewed coordinates are ready to become the default nearest-availability source. It does not change the default.

Admin/operator route:

- `GET /internal/location-review/rollout-diagnostics`

All requests require `x-pricer-admin-id` or `x-pricer-operator-id`.

The report compares `provider_only` and `reviewed_first` readiness:

- `provider_only_result_count`
- `reviewed_first_result_count`
- `changed_coordinate_count`
- provider-vs-reviewed distance delta summary
- high-reuse retailer location count and reviewed-coordinate coverage
- active reviewed-coordinate confidence distribution
- sampled changed-coordinate rows with provider and reviewed coordinate evidence

Switch criteria before making `reviewed_first` the default:

- At least 80% of high-reuse stores, currently stores at or above 10 source products/snapshots, should have active reviewed coordinates.
- Provider-vs-reviewed distance deltas should stay below 0.5 km for default-switch candidates unless an operator explicitly documents a correction reason.
- Changed high-reuse coordinates should receive operator sampling before rollout.
- The API and clients must retain a rollback/fallback to `coordinate_mode = "provider_only"`.

Phase 2K keeps `provider_only` as the default, does not call live geocoding, does not add maps UI, does not use an LLM, and does not change normal product search, basket planning, price lookup, or canonical grouping.

## Phase 2L Config-Controlled Coordinate Default

Phase 2L adds a config-controlled default for nearest availability:

- `DEFAULT_COORDINATE_MODE=provider_only`
- `DEFAULT_COORDINATE_MODE=reviewed_first`

If the environment setting is unset or invalid, the backend falls back to `provider_only`. `POST /products/nearest-availability` request bodies can still pass explicit `coordinate_mode`, and that request value overrides the configured default. Invalid request values are still rejected.

This keeps behavior unchanged unless an operator explicitly sets `DEFAULT_COORDINATE_MODE=reviewed_first`. No maps UI, live geocoding, LLM calls, or normal product search changes are introduced.

## Next Non-Location Recommendation

Move back to the MVP readiness list and start Firebase anonymous ownership: add anonymous sign-in on mobile, replace local-only owner ids with Firebase UID where available, and preserve a claiming/migration path for existing `pricer_anon_id` saved lists, watchlist, and billing cache.
