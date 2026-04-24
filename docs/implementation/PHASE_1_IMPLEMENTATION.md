# Phase 1 Implementation

## Goal
Build the Phase 1 persistence layer and importer so the project can ingest daily source snapshots, preserve raw source rows, maintain stable source-product identity across days, and prepare deterministic search-ready enrichment for later phases.

Phase 1.5 extends only the enrichment layer. It does not change snapshot keys, source-product keys, or raw-row ingest behavior.

## Storage model

### `raw_price_snapshots`
Write one row per ingested source row with these fields:
- `snapshot_id`
- `source_product_id`
- `snapshot_date`
- `locality_code`
- `store_name_raw`
- `product_name_raw`
- `product_code`
- `category_code`
- `retail_price`
- `promo_price`
- `retail_price_raw`
- `promo_price_raw`
- `raw_source_row`
- `source_file_name`
- `row_number`
- `ingested_at`

### `source_products`
Maintain one durable registry row per source product identity with these fields:
- `source_product_id`
- `locality_code`
- `store_name_raw`
- `product_code`
- `category_code`
- `latest_product_name_raw`
- `first_seen_date`
- `last_seen_date`
- `is_active`
- `needs_revalidation`
- `latest_snapshot_id`
- `drift_level`
- `created_at`
- `updated_at`
- `last_enriched_at`

### `source_product_enrichment`
Maintain one current deterministic enrichment row per source product:
- `source_product_id`
- `enriched_at`
- `enrichment_version`
- `based_on_product_name_raw`
- `normalized_name`
- `tokens`
- `brand_guess`
- `product_type_guess`
- `size_text`
- `size_value`
- `size_unit`
- `fat_percent`
- `canonical_search_category`
- `alias_candidates`
- `parse_confidence`
- `canonical_en`
- `display_en`
- `i18n_status`
- `display`
- `translation_status`

## Phase 1.5 multilingual extension
- `canonical_en` is deterministic English canonical metadata derived from the Bulgarian enrichment row.
- `display_en` is a deterministic English display string derived from `canonical_en`.
- `i18n_status` tracks English metadata readiness.
- `display.{en,de,uk,ru,nl}` stores cached display text by language.
- `translation_status.{en,de,uk,ru,nl}` stores per-language status.
- New products get English metadata immediately.
- Non-English translations are batch-only and do not run during ingest.
- Existing English or translated fields are preserved by the upgrade jobs.

## Required automated coverage
1. snapshot key stability
2. source product key stability across dates
3. outlet differentiation
4. locality differentiation
5. promo normalization
6. net-new enrichment reuse
7. name drift handling
8. missing product retention
9. deterministic `canonical_en` mapping
10. deterministic `display_en` formatting
11. English metadata idempotency and backfill
12. translation storage
13. translation idempotency
14. translation failure handling
15. translation cost control
