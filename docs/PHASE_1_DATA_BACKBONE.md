# Phase 1 - Data Backbone

## Objective
Implement the durable daily data backbone for source price snapshots. Phase 1 must ingest complete daily files, preserve raw rows losslessly, maintain stable source identities across days, enrich only net-new or revalidation-needed source products, and retain historical state needed for later matching and search phases.

## In scope
- daily TSV snapshot ingestion
- raw snapshot persistence
- stable `snapshot_id` and `source_product_id` generation
- durable `source_products` registry across days
- deterministic enrichment for search-ready metadata
- conservative name drift detection
- lifecycle retention through `last_seen_date` and `is_active`
- fixture-driven automated tests

## Out of scope
- end-user shopping list UI
- query-time matching APIs
- push notifications
- monetization
- premium features
- market-gap analytics beyond the metadata needed for later phases

## Identity strategy
1. `snapshot_id = sha256(date|locality_code|store_name_raw|product_code|category_code)`
2. `source_product_id = sha256(locality_code|store_name_raw|product_code|category_code)`
3. `product_name_raw` is not a primary identity field. It is retained for preservation, normalization, enrichment, and drift detection.

## Required behavior
- Treat each incoming file as a full daily snapshot, not a delta feed.
- Always write raw snapshot rows, even when the same logical source product already exists.
- Preserve Bulgarian source text exactly in raw row storage.
- Normalize prices safely.
- Blank promo price becomes numeric `0`.
- Do not delete products missing from later files.
- Update `last_seen_date` when a source product reappears.
- Mark products inactive when they are not present in the current full snapshot.
- Reuse prior enrichment unless the source product is net-new or `needs_revalidation = true`.

## Name drift rules
- Minor normalized-name drift updates `latest_product_name_raw` but does not automatically re-enrich.
- Major drift sets `needs_revalidation = true`.
- The system should stay conservative. If the change is only formatting, spacing, size punctuation, or percentage formatting, prefer treating it as minor.

## Deliverables
- implementation under `app/functions/src/phase1/`
- automated tests under `tests/`
- updated docs and registries
- handoff package under `handoff/phase_1/`
