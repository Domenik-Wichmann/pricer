# Data Model

## Persistence runtime
- Backend production persistence can now map each flat backend collection below into a same-named Firestore top-level collection.
- Local development can still use a JSON-file state store.
- Tests can still use the in-memory backbone store.
- The backend keeps the same flat record shapes across all store backends.
- Phase DB0 does not change the active runtime store. It defines the next persistence boundary: Postgres will own relational source truth, large external imports, nutrition joins, dedupe staging, and mapping-review processing; Firestore/flat store remains the app-facing cache and user-state runtime.
- Production Firestore runtime reads must be scoped. Legacy full `store.load()` / `store.save()` is local/offline only for large `prod_` data, and normal user-facing routes must not load million-row collections such as `raw_price_snapshots`, `canonical_product_mappings`, `source_products`, or `product_daily_prices`.

## Phase 1 source collections

### `raw_price_snapshots`
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
- `source_file_name_raw`
- `source_file_stem`
- `source_chain_name_raw`
- `source_chain_name_normalized`
- `source_file_numeric_id`
- `row_number`
- `ingested_at`

### `source_products`
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
- `source_file_name_raw`
- `source_file_stem`
- `source_chain_name_raw`
- `source_chain_name_normalized`
- `source_file_numeric_id`
- `created_at`
- `updated_at`
- `data_quality_status`
- `data_quality_reasons[]`
- `data_quality_sample`
- `quarantined_at`
- `quarantine_source`
- `last_enriched_at`

### `source_product_enrichment`
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
- Bulgarian explicit units normalize into `g`, `kg`, `ml`, or `l` for supported abbreviations and full-word forms such as `грама`, `килограма`, `милилитра`, and `литра`.
- `fat_percent`
- `canonical_search_category`
- `alias_candidates`
- `parse_confidence`
- `canonical_en.product_type`
- `canonical_en.product_family`
- `canonical_en.brand`
- `canonical_en.size_value`
- `canonical_en.size_unit`
- `canonical_en.fat_percent`
- `display_en`
- `i18n_status`
- `display.en`
- `display.de`
- `display.uk`
- `display.ru`
- `display.nl`
- `translation_status.en`
- `translation_status.de`
- `translation_status.uk`
- `translation_status.ru`
- `translation_status.nl`

## Phase 2 service-level outputs

### Query parsing
- `raw_input`
- `normalized_input`
- `tokens_bg`
- `size_value`
- `size_unit`
- `fat_percent`

### Match result
- `ambiguity.status`
- `ambiguity.should_escalate`
- `ambiguity.reason`
- `matched_products[]`
- `cheapest_store_result`
- `price_comparison[]`

## Phase 3 flat collections

### `semantic_profiles`
- `source_product_id`
- `semantic_version`
- `semantic_summary_bg`
- `semantic_summary_en`
- `semantic_terms_bg`
- `semantic_terms_en`
- `semantic_category`
- `semantic_brand`
- `semantic_size_value`
- `semantic_size_unit`
- `semantic_fat_percent`
- `semantic_text_bg`
- `semantic_text_en`
- `generated_at`

### `embedding_records`
- `source_product_id`
- `embedding_model`
- `embedding_dimensions`
- `embedding_text`
- `embedding_vector_json`
- `generated_at`

### `feedback_events`
- `feedback_id`
- `user_id`
- `query_text`
- `raw_item_input`
- `resolved_source_product_id`
- `feedback_type`
- `feedback_value`
- `notes`
- `locality_code`
- `created_at`

## Phase 3.5 flat collections

### `product_daily_prices`
- `source_product_id`
- `date`
- `price_avg`
- `price_min`
- `price_max`
- `store_count`
- `snapshot_count`

### `current_product_offers`
- `offer_id`
- `canonical_product_id`
- `source_product_id`
- `source_name`
- `source_product_name_raw`
- `canonical_name`
- `chain_id`
- `chain_name`
- `retailer`
- `store_id`
- `store_name`
- `locality_code`
- `region`
- `current_price`
- `currency`
- `retail_price`
- `promo_price`
- `unit_price`
- `is_sale`
- `is_promotion`
- `observed_at`
- `snapshot_date`
- `snapshot_id`
- `category_code`
- `canonical_product_type`
- `canonical_brand`
- `source_file_name`
- `source_file_name_raw`
- `source_file_stem`
- `source_chain_name_normalized`
- `volume_marker`
- `count_marker`
- `provenance`
- `updated_at`
- `rules_version`

`current_product_offers` is a compact runtime read model with one latest/current offer per `source_product_id`. It is derived from existing Phase 6 local runtime state, using latest `raw_price_snapshots`, `source_products`, `canonical_product_mappings`, and `canonical_products`; live routes query it by `canonical_product_id` or `source_product_id` and must not full-load it.

### `current_offer_fingerprints`
- `source_product_id`
- `canonical_product_id`
- `offer_id`
- `snapshot_date`
- `current_price`
- `retail_price`
- `promo_price`
- `unit_price`
- `is_sale`
- `is_promotion`
- `is_available`
- `chain_id`
- `chain_name`
- `retailer`
- `store_id`
- `store_name`
- `locality_code`
- `source_file_name`
- `source_file_name_raw`
- `source_file_stem`
- `source_chain_name_normalized`
- `fingerprint_payload`
- `fingerprint_hash`
- `first_seen_snapshot_date`
- `last_seen_snapshot_date`
- `updated_at`
- `rules_version`

`current_offer_fingerprints` is the planned incremental latest-update baseline. One row is keyed by `source_product_id` and carries a stable hash over the fields that determine whether a current offer needs to be rewritten. Daily diff jobs should compare new snapshot fingerprints to this collection or to a local exported baseline before writing current read models.

The local baseline export format is JSONL, one compact row per current offer:

```json
{"source_product_id":"...","canonical_product_id":"...","offer_fingerprint":"sha256...","price":1.23,"current_price":1.23,"retail_price":1.49,"promo_price":1.23,"unit_price":null,"is_sale":true,"is_promotion":true,"snapshot_date":"2026-05-05","first_seen_snapshot_date":"2026-05-05","last_seen_snapshot_date":"2026-05-05","updated_at":"...","rules_version":"phase6_incremental_ingest_v1"}
```

The local file intentionally omits bulky `fingerprint_payload` and offer display metadata. It is a comparison/cache artifact, not app-facing runtime state.

### `offer_change_events`
- `event_id`
- `event_type`
- `source_product_id`
- `canonical_product_id`
- `offer_id`
- `snapshot_date`
- `current_price`
- `retail_price`
- `promo_price`
- `unit_price`
- `is_sale`
- `is_promotion`
- `fingerprint_hash`
- `previous_fingerprint_hash`
- `previous_snapshot_date`
- `created_at`
- `rules_version`

`offer_change_events` is an append-only planned audit/event stream for incremental latest updates. The dry-run diff can estimate these events, but the real writer is deferred until the fingerprint baseline is backfilled and operator-reviewed.

### `snapshot_manifests`
- `manifest_id`
- `snapshot_date`
- `snapshot_url`
- `mode`
- `comparison_mode`
- `collection_prefix`
- `scanned_rows`
- `unique_rows`
- `new_offers`
- `changed_offers`
- `unchanged_offers`
- `removed_missing_offers`
- `affected_canonical_product_ids`
- `summaries_to_update`
- `estimated_writes`
- `destructive_deletes`
- `created_at`
- `updated_at`
- `rules_version`

`snapshot_manifests` records per-run incremental diff summaries and future committed-update reports. Dry-runs currently print the manifest shape without writing it.

### `canonical_current_offer_summary`
- `canonical_product_id`
- `canonical_name`
- `min_current_price`
- `max_current_price`
- `avg_current_price`
- `offer_count`
- `current_offer_count`
- `historical_offer_count`
- `source_row_count`
- `chain_count`
- `current_chain_count`
- `retailer_count`
- `current_retailer_count`
- `historical_retailer_count`
- `cheapest_offer_id`
- `cheapest_source_product_id`
- `cheapest_chain_id`
- `cheapest_chain`
- `cheapest_retailer`
- `cheapest_price`
- `currency`
- `snapshot_date`
- `last_seen_at`
- `updated_at`
- `available_chains[]`
- `rules_version`

`canonical_current_offer_summary` is keyed by `canonical_product_id` and gives product detail, price lookup, watchlist, and basket routes a bounded summary over current offers. Phase 15 product detail/search keeps price fields unavailable when no current price exists, but supplements missing compact current summaries with route-scoped canonical mapping/source-product evidence so count fields can still show `0` current offers plus historical/source counts and `last_seen_at`.

### Phase 6 incremental ingest modes

- Phase 6 source-row validation now runs before `raw_price_snapshots`, `source_products`, `source_product_enrichment`, `canonical_products`, `canonical_product_mappings`, or current read models can be created from a row. Rows with invalid source identity fields or invalid product-name quality, such as embedded product-name newlines, multi-row CSV fragments, store/address fragments, excessive delimiter plus length evidence, or repeated code/category/price fragments, are counted as malformed and logged with reasons/samples. Quote-only brand-style names are warnings rather than malformed rows.
- Existing product records can be reported with `npm run phase6:audit-bad-products`. The command defaults to dry-run/report-only and separates `valid`, `warning`, `suspicious`, and `invalid` product quality; only `invalid` records are quarantinable candidates. With reviewed approval, the same command can mark invalid records with additive no-delete quarantine fields; warning-only records are not marked.
- Initial latest snapshot load may write many current/catalog records once. It is an operator backfill path, not the normal daily path.
- Daily latest update should diff the new snapshot against `current_offer_fingerprints` or an exported fingerprint baseline, then write only new/changed `current_product_offers`, updated fingerprints, append-only change events, affected canonical summaries, and one manifest/report.
- Missing offers are reported as removed/missing by default and are not deleted. Mark-unavailable behavior requires an explicit later policy.
- Historical backfill should append date-specific `raw_price_snapshots`, `product_daily_prices`, `ingest_runs`, and `pipeline_logs` only. It must not publish `current_product_offers` or `canonical_current_offer_summary` unless explicitly requested.
- Canonical parser/enrichment backfills should touch canonical/enrichment documents only and must not rewrite raw/history/current offer collections.

### `category_daily_aggregates`
- `category_code`
- `date`
- `avg_price`
- `min_price`
- `max_price`
- `product_count`
- `snapshot_count`

## Phase 4 flat collections

### `sql_products`
- `source_product_id`
- `locality_code`
- `store_name_raw`
- `product_code`
- `category_code`
- `latest_product_name_raw`
- `is_active`
- `last_seen_date`

### `sql_product_prices_daily`
- `source_product_id`
- `date`
- `price_avg`
- `price_min`
- `price_max`
- `store_count`
- `snapshot_count`

### `sql_category_aggregates`
- `category_code`
- `date`
- `avg_price`
- `min_price`
- `max_price`
- `product_count`
- `snapshot_count`

### `vector_index_records`
- `source_product_id`
- `embedding_model`
- `embedding_dimensions`
- `embedding_vector_json`
- `embedding_text`
- `generated_at`

### `canonical_products`
- `canonical_product_id`
- `canonical_product_key`
- `canonical_display_name`
- `canonical_brand`
- `canonical_product_type`
- `canonical_category_code`
- `canonical_size_value`
- `canonical_size_unit`
- `canonical_attributes_json`
- `source_example_name`
- `source_product_count`
- `canonical_marker_backfill_version`
- `canonical_marker_backfilled_at`
- `created_at`
- `updated_at`
- `data_quality_status`
- `data_quality_reasons[]`
- `data_quality_sample`
- `quarantined_at`
- `quarantine_source`

`canonical_attributes_json` currently carries deterministic canonicalization markers such as `stage_marker`, `count_marker`, `age_band_marker`, `reserve_marker`, `year_marker`, `age_statement_marker`, `volume_marker`, `size_marker`, `flavor_marker`, `color_marker`, `pack_variant_marker`, `range_marker`, and `core_tokens`.

`size_marker` is an optional structured companion to the compact legacy marker strings. It preserves `raw_text` when a deterministic size/package marker was found and stores normalized, display-safe fields: `quantity`, `unit`, `total_quantity`, `total_unit`, optional `pack_count`, optional `unit_quantity`, optional `unit_quantity_unit`, `display`, and `normalized_display`. Unit variants normalize to `g`, `kg`, `ml`, `l`, or `pcs`; comparable mass/volume quantities are stored in `g` or `ml`. Examples: `100 гр` and `100g` normalize to `display = "100 g"`; `0,5 кг` normalizes to `quantity = 500`, `unit = "g"`; `1.5 л` normalizes to `1500 ml`; `2x500 г` stores `pack_count = 2`, `unit_quantity = 500`, and `total_quantity = 1000`; `6 бр x 330 мл` stores `pack_count = 6`, `unit_quantity = 330`, and `total_quantity = 1980`. Bare decimal volume inference is allowed only in beverage/alcohol context, so price-like decimals are not converted into size markers.

`canonical_marker_backfill_version` / `canonical_marker_backfilled_at` are optional metadata written only when `scripts/backfill_canonical_markers_firestore.js` patches a changed canonical product. The backfill is canonical-only: it recomputes deterministic marker, safe brand cleanup, and deterministic product-type hints from stored canonical display/source-example text without changing `canonical_product_id`, `canonical_product_key`, or `canonical_product_mappings`.

`data_quality_status = "invalid"` is an additive no-delete quarantine marker written only by the reviewed Phase 6 bad-product audit/quarantine command. It does not delete or rewrite source truth. Runtime search, enrichment pilot selection, current-offer generation, and price fallback treat invalid/quarantined records as unsafe. Warning-only quoted-brand records must not receive this marker.

### `canonical_product_mappings`
- `source_product_id`
- `dedupe_key`
- `canonical_product_id`
- `mapping_confidence`
- `mapping_method`
- `mapped_at`

### `canonical_enrichment_store`
- `canonical_fingerprint`
- `enrichment.base_product`
- `enrichment.product_type`
- `enrichment.product_family`
- `enrichment.category`
- `enrichment.subcategory`
- `enrichment.category_l1`
- `enrichment.category_l2`
- `enrichment.category_l3`
- `enrichment.category_l4`
- `enrichment.is_food`
- `enrichment.is_beverage`
- `enrichment.is_personal_care`
- `enrichment.brand`
- `enrichment.brand_normalized`
- `enrichment.product_line`
- `enrichment.flavor[]`
- `enrichment.flavor_terms[]`
- `enrichment.attributes[]`
- `enrichment.diet_tags[]`
- `enrichment.allergens[]`
- `enrichment.product_form`
- `enrichment.packaging`
- `enrichment.usage_context[]`
- `enrichment.search_aliases_bg[]`
- `enrichment.search_aliases_en[]`
- `enrichment.exclusion_terms[]`
- `enrichment.quality_tier`
- `enrichment.confidence`
- `enrichment.enrichment_source`
- `enrichment.enrichment_version`
- `enrichment.canonical_name_hash`
- `enrichment.normalized_display_name_bg`
- `enrichment.normalized_display_name_en`
- `enrichment.brand_candidates[]`
- `enrichment.manufacturer_or_brand_owner`
- `enrichment.comparable_product_class`
- `enrichment.variant_group_key`
- `enrichment.variant_attributes[]`
- `enrichment.is_alcohol`
- `enrichment.is_baby_product`
- `enrichment.is_pet_product`
- `enrichment.is_household`
- `enrichment.is_medicine_or_supplement`
- `enrichment.storage_type`
- `enrichment.meal_role[]`
- `enrichment.preparation_required`
- `enrichment.ready_to_eat`
- `enrichment.cooking_use[]`
- `enrichment.pantry_staple_score`
- `enrichment.likely_dairy`
- `enrichment.likely_meat`
- `enrichment.likely_vegetarian`
- `enrichment.likely_vegan`
- `enrichment.gluten_related`
- `enrichment.sugar_free`
- `enrichment.low_fat`
- `enrichment.wholegrain`
- `enrichment.organic_bio`
- `enrichment.allergen_hints[]`
- `enrichment.ingredient_hints[]`
- `enrichment.size_marker`
- `enrichment.package_quantity`
- `enrichment.package_unit`
- `enrichment.total_quantity`
- `enrichment.total_unit`
- `enrichment.multipack_count`
- `enrichment.unit_quantity`
- `enrichment.unit_quantity_unit`
- `enrichment.serving_context`
- `enrichment.dairy_type`
- `enrichment.milk_source`
- `enrichment.fat_percent`
- `enrichment.uht_or_fresh`
- `enrichment.lactose_free`
- `enrichment.plain_or_flavored`
- `enrichment.beverage_type`
- `enrichment.carbonated`
- `enrichment.caffeine_related`
- `enrichment.alcohol_percent`
- `enrichment.baby_stage`
- `enrichment.age_min_months`
- `enrichment.age_max_months`
- `enrichment.age_band_label`
- `enrichment.formula_stage`
- `enrichment.baby_food_type`
- `enrichment.synonym_terms[]`
- `enrichment.negative_match_hints[]`
- `enrichment.do_not_match_queries[]`
- `enrichment.should_match_queries[]`
- `enrichment.disambiguation_notes[]`
- `enrichment.shopping_family_id`
- `enrichment.clarification_attributes[]`
- `enrichment.likely_user_choice_attributes[]`
- `enrichment.brand_preference_relevance`
- `enrichment.size_preference_relevance`
- `enrichment.flavor_preference_relevance`
- `enrichment.data_quality_status`
- `enrichment.data_quality_reasons[]`
- `enrichment.ambiguous_fields[]`
- `enrichment.needs_human_review`
- `enrichment.llm_uncertainty_reasons[]`
- `enrichment.explanation_short`
- `enrichment.reviewed_status`
- `canonical_product_id`
- `canonical_name_hash`
- `enrichment_source`
- `enrichment_version`
- `updated_at`
- `explicit_claim_evidence[]`
- `model_name`
- `prompt_version`
- `created_at`

`canonical_enrichment_store` is additive only. It is keyed by canonical fingerprint, currently aligned with `canonical_product_id`, and must not rewrite deterministic canonical grouping or marker truth.

The canonical marker backfill may read a single enrichment document by `canonical_fingerprint` only after a canonical brand cleanup is planned. In a real run it patches `enrichment.brand` only when the enrichment brand is missing or equal to the stale canonical brand; it does not create enrichment records, call LLMs, or enrich raw/source rows.

Phase 15.9 extends canonical enrichment for a focused semantic-search pilot. The new fields are optional and backward-compatible: existing v1 records without `product_type`, `search_aliases_*`, boolean category flags, or name-hash metadata remain valid. Rich v2 records use `enrichment.enrichment_version = "canonical_semantic_v2"` and cache by `canonical_product_id + canonical_name_hash + enrichment_version`, so unchanged v2 records are skipped by the pilot. The pilot selector reads only `canonical_products` plus existing `canonical_enrichment_store` and real opt-in runs write only `canonical_enrichment_store`; they must never update raw/source/offer rows, prices, mappings, or canonical product grouping.

Phase 15 LLM hardening adds optional `canonical_semantic_v3` records behind `PRICER_ENRICHMENT_VERSION=canonical_semantic_v3`. V3 records still live in `canonical_enrichment_store`, but `enrichment.schema_version = "canonical_semantic_v3"` separates raw observed terms, descriptions, registry matches, proposed aliases/new terms, search buckets, confidence, warnings, and review flags. V3 may write pending registry proposals and failed-response artifacts, but it remains additive and must not activate new terms or mutate canonical grouping truth.

### `semantic_term_registry`
- `term_id`
- `domain`
- `canonical_label`
- `display_label`
- `definition`
- `aliases[]`
- `parent_term_id`
- `related_term_ids[]`
- `status`
- `source`
- `confidence`
- `evidence_examples[]`
- `created_at`
- `updated_at`

`semantic_term_registry` is the reusable normalization vocabulary for `canonical_semantic_v3`. Initial seed domains are `packaging`, `product_form`, `food_category`, `dairy_type`, `milk_source`, `quality_tier`, `storage_type`, `flavor`, `dietary_claim`, `material`, and `preparation_state`. Seed rows are reviewable vocabulary, not product truth.

### `semantic_term_registry_proposals`
- `proposal_id`
- `domain`
- `action`
- `proposed_label`
- `proposed_alias`
- `existing_term_id`
- `parent_term_id`
- `evidence_product_ids[]`
- `evidence_terms[]`
- `confidence`
- `status`
- `created_at`
- `updated_at`

`semantic_term_registry_proposals` stores pending LLM-proposed aliases, terms, and relationships. Proposals are deduped by domain/action/label-or-alias/existing term and default to `pending`; LLM output must never directly create an active registry term.

### `canonical_enrichment_failed_responses`
- `failed_response_id`
- `run_id`
- `batch_index`
- `product_ids[]`
- `provider`
- `model`
- `error_type`
- `parse_error`
- `raw_content_redacted`
- `created_at`

`canonical_enrichment_failed_responses` stores redacted provider content only when a batch-level parse/provider response failure prevents canonical enrichment writes. It is a debug artifact collection and must not contain secrets.

### `retailer_locations`
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
- `provenance.source_file_name`
- `provenance.source_file_name_raw`
- `provenance.source_file_stem`
- `provenance.source_file_numeric_id`
- `provenance.source_chain_name_raw`
- `provenance.source_chain_name_normalized`
- `provenance.snapshot_ids[]`
- `provenance.source_product_ids[]`
- `provenance.raw_store_names[]`
- `first_seen_date`
- `last_seen_date`
- `snapshot_count`
- `source_product_count`
- `extracted_at`
- `updated_at`

`retailer_locations` is a deterministic derived read model from Phase 6 raw snapshots/source products. It preserves raw store/location text and source-file provenance, leaves `latitude` and `longitude` null until a later geocoding phase, and does not change product search, basket, price lookup, or canonical grouping behavior.

### `retailer_location_geocodes`
- `geocode_id`
- `cache_key`
- `location_id`
- `provider`
- `provider_place_id`
- `query_text`
- `formatted_address`
- `latitude`
- `longitude`
- `confidence`
- `confidence_reason`
- `status`
- `rules_version`
- `provenance.source`
- `provenance.location_id`
- `provenance.country`
- `provenance.city`
- `provenance.raw_address`
- `provenance.chain_id`
- `provenance.chain_name_normalized`
- `provenance.store_name_raw`
- `provenance.store_name_normalized`
- `provenance.branch_name`
- `raw_provider_result`
- `geocoded_at`
- `updated_at`

`retailer_location_geocodes` is an additive Phase 2A geocoding cache/read model over `retailer_locations`. Cache keys are deterministic from normalized country, city, raw address, and store identity. Allowed statuses are `pending`, `matched`, `ambiguous`, `failed`, and `skipped`. The cache preserves provider provenance and never rewrites `retailer_locations`, source products, snapshots, product search, basket planning, price lookup, or canonical grouping.

### `manual_location_geocodes`
- `geocode_id`
- `cache_key`
- `user_id`
- `provider`
- `provider_place_id`
- `query_text`
- `formatted_address`
- `latitude`
- `longitude`
- `confidence`
- `confidence_reason`
- `status`
- `rules_version`
- `provenance.source`
- `provenance.user_id`
- `provenance.country`
- `provenance.city`
- `provenance.address_raw`
- `provenance.display_name`
- `raw_provider_result`
- `geocoded_at`
- `updated_at`

`manual_location_geocodes` is an additive Phase 2E-3 cache/read model for user-triggered manual-address geocoding. Cache keys are deterministic from normalized country, city, and raw address text. Allowed statuses are `matched`, `ambiguous`, `failed`, `skipped`, and `invalid_input`. The raw address remains user-entered preference/source text; matched coordinates are only applied to manual fields or saved into `saved_user_locations` after explicit user confirmation. Normal product search and nearest availability do not call live geocoding.

### `location_review_candidates`
- `candidate_id`
- `source_type`
- `source_id`
- `related_location_id`
- `title`
- `query_text`
- `raw_address`
- `city`
- `country`
- `provider`
- `provider_place_id`
- `formatted_address`
- `latitude`
- `longitude`
- `confidence`
- `source_status`
- `reuse_count`
- `risk_score`
- `risk_factors[]`
- `review_status`
- `reviewed_by`
- `reviewed_at`
- `reviewer_note`
- `approved_latitude`
- `approved_longitude`
- `correction_reason`
- `evidence`
- `rules_version`
- `created_at`
- `updated_at`

`location_review_candidates` is an additive Phase 2F admin-review read model over retailer geocode rows, manual-address geocode rows, saved geocoded user locations, and address-like retailer locations that still have no coordinates. Candidate IDs are deterministic from source type and source ID. Reviews can approve, reject, or request more information; approved coordinates are stored on the review candidate only and must not overwrite `retailer_locations`, `retailer_location_geocodes`, `manual_location_geocodes`, or `saved_user_locations` raw/source fields.

Phase 2G exposes guarded internal review routes for listing, reading, and deciding candidates. These routes require `x-pricer-admin-id` or `x-pricer-operator-id` and do not publish approved coordinates into consumer nearest availability.

### `reviewed_location_coordinates`
- `reviewed_coordinate_id`
- `source_candidate_id`
- `source_type`
- `source_id`
- `location_id`
- `source_identity`
- `latitude`
- `longitude`
- `confidence`
- `correction_reason`
- `approved_by`
- `approved_at`
- `supersedes_id`
- `is_active`
- `provenance`
- `rules_version`
- `published_at`
- `updated_at`

`reviewed_location_coordinates` is an additive Phase 2H publication read model from approved `location_review_candidates`. It stores reviewed coordinates separately from raw retailer locations, provider geocode cache rows, manual geocode rows, and saved user locations. Publication preserves source candidate, source row, reviewer, correction reason, risk, and provider context in provenance. Supersession keeps one active reviewed coordinate per source identity; older approved coordinates remain stored with `is_active = false` and `supersedes_id` on the replacing row. Phase 2H does not feed consumer nearest availability or normal product search.

Phase 2I adds guarded diagnostics around this collection. Internal operator reads can list active or superseded reviewed coordinates, fetch coordinate detail, and run a dry-run coordinate resolver. The dry-run precedence policy is: active reviewed coordinate wins, otherwise matched provider coordinate wins, otherwise unavailable.

Phase 2B nearest-store availability is a computed read only, not a persisted schema. It joins canonical mappings, latest source-product snapshots, `retailer_locations`, and matched-only `retailer_location_geocodes` to return distance-bounded offers for explicit coordinate queries. Phase 2J adds an explicit `coordinate_mode`: `provider_only` remains the safe baseline, while `reviewed_first` uses active `reviewed_location_coordinates` before falling back to matched provider geocodes. Offers expose `coordinate_source` as `provider` or `reviewed`. Phase 2K adds guarded rollout diagnostics that compare provider-only and reviewed-first readiness, changed coordinate distance deltas, high-reuse reviewed coverage, and reviewed confidence distribution without changing the default. Phase 2L allows `DEFAULT_COORDINATE_MODE` to set the default to `provider_only` or `reviewed_first`; unset or invalid config falls back to `provider_only`, and explicit request `coordinate_mode` still overrides config. Normal product search remains coordinate-independent.

### `user_product_family_preferences`
- `preference_id`
- `owner_id`
- `owner_type`
- `family_id`
- `preferred_attributes`
- `preferred_brands`
- `avoided_brands`
- `confidence`
- `source`
- `last_confirmed_at`
- `created_at`
- `updated_at`

`user_product_family_preferences` stores owner-scoped shopping defaults by deterministic product family. `preferred_attributes` is keyed by product-family attribute id, such as `style`, `fat_percent`, `flavor`, `type`, `size`, or `count`; values are family-definition value ids. Allowed sources are `explicit_user_choice`, `inferred_repeated_choices`, and `imported_profile`. These rows are preference hints for `phase15/shopping_intent.js`; they do not select exact canonical products, mutate canonical grouping, write offers, or change meal-plan rows.

### `saved_user_locations`
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
- `provider`
- `provider_place_id`
- `formatted_address`
- `confidence`
- `confidence_reason`
- `provenance`
- `is_default`
- `created_at`
- `updated_at`

`saved_user_locations` is a consented runtime preference collection for location-aware search. Allowed labels are `home`, `work`, and `custom`; allowed default sorts are `nearest`, `cheapest`, and `best_value`; allowed sources are `manual`, `device`, and `geocoded`. Phase 2C does not request device GPS, infer home/work from behavior, call geocoding APIs, or change coordinate-free product search.

Phase 2D exposes `saved_user_locations` through owner-header-scoped backend endpoints and Flutter API methods. Saved-location CRUD requires explicit user identity. Nearest availability remains a separate opt-in product endpoint and can use either saved locations or one-off coordinates without changing normal product search.

`enrichment.diet_tags[]` and diet/attribute claim values inside `enrichment.attributes[]` are normalized by a Phase 15 controlled vocabulary when explicit aliases appear in product/source text or LLM output. Current normalized diet tags are `vegan` and `vegetarian`. Current normalized claim attributes are `organic`, `gluten_free`, `lactose_free`, `sugar_free`, `low_fat`, `high_protein`, `plant_based`, `halal`, `kosher`, `no_added_sugar`, and `wholegrain`. Reviewed aliases currently cover Bulgarian, English, German, Turkish, Russian, Ukrainian, Dutch, and Spanish. Unknown or unmapped diet/claim values are ignored by the normalization pass. `explicit_claim_evidence[]` stores optional `{ tag, matched_text }` provenance for deterministic explicit-text matches.

### `canonical_disambiguation_queue`
- `warning_id`
- `pair_fingerprint`
- `product_a`
- `product_b`
- `warning_reason`
- `status`
- `created_at`
- `last_seen_at`

`product_a` and `product_b` are flat JSON-compatible objects that currently carry:
- `source_product_id`
- `canonical_candidate_id`
- `canonical_candidate_key`
- `dedupe_key`
- `raw_name`
- `normalized_core_tokens`
- `source_chain_name_normalized`
- `source_chain_name_raw`
- `product_code`
- `category_code`
- `markers`

`markers` currently persists the deterministic marker set used for warning review and fingerprint reuse, including `stage_marker`, `count_marker`, `age_band_marker`, `reserve_marker`, `year_marker`, `age_statement_marker`, `volume_marker`, `flavor_marker`, `color_marker`, `pack_variant_marker`, and `range_marker`.

### `canonical_disambiguation_decisions`
- `decision_id`
- `pair_fingerprint`
- `decision`
- `confidence`
- `reason_short`
- `decisive_features`
- `decision_source`
- `model_name`
- `prompt_version`
- `review_note`
- `reviewed_by`
- `created_at`

These records are additive and do not change canonical merges in Phase 14.0. They exist so later phases can reuse adjudication results by fingerprint and avoid paying twice for the same unresolved pair.

Phase 14.1 writes valid model-adjudicated records with `decision_source = "llm"`, the configured `model_name`, and `prompt_version = "phase14_1_v1"` by default. The decision store remains provenance-only in this phase and still does not mutate `canonical_products` or `canonical_product_mappings`.

Phase 14.2 writes human-reviewed records with `decision_source = "human"`, `confidence = "high"`, `model_name = null`, `prompt_version = null`, and optional `review_note` / `reviewed_by` provenance. Effective decision resolution is `human` first, then `llm`, then `deterministic_override`; the latest valid decision within a source wins. Queue records can use `pending`, `adjudicated_llm`, or `reviewed_human` status for lightweight review tracking.

## Phase M0 meal foundation collections

### `ingredient_families`
- `ingredient_family_id`
- `status`
- `name_bg`
- `name_en`
- `aliases_bg[]`
- `aliases_en[]`
- `created_at`
- `updated_at`

### `ingredient_categories`
- `ingredient_category_id`
- `ingredient_family_id`
- `status`
- `name_bg`
- `name_en`
- `aliases_bg[]`
- `aliases_en[]`
- `created_at`
- `updated_at`

### `ingredients`
- `ingredient_id`
- `status`
- `name_bg`
- `name_en`
- `aliases_bg[]`
- `aliases_en[]`
- `ingredient_family_id`
- `ingredient_category_id`
- `default_edible_unit`
- `default_purchase_unit`
- `classification.food_group`
- `classification.culinary_roles[]`
- `classification.common_cuisines[]`
- `classification.is_staple`
- `classification.availability_level`
- `purchase_model.common_purchase_units[]`
- `purchase_model.typical_piece_weight_g`
- `purchase_model.edible_yield_ratio`
- `purchase_model.price_basis_unit`
- `purchase_model.estimated_price_per_basis_unit`
- `dietary_flags.vegan`
- `dietary_flags.vegetarian`
- `dietary_flags.contains_dairy`
- `dietary_flags.contains_gluten`
- `dietary_flags.contains_nuts`
- `enrichment`
- `quality.source`
- `quality.confidence`
- `quality.runtime_safe_fields[]`
- `created_at`
- `updated_at`

Only `classification`, `purchase_model`, `dietary_flags`, hierarchy ids, and ingredient unit rules are runtime-safe in Phase M0. `enrichment` remains additive and non-critical.

### `product_ingredient_mappings`
- `mapping_id`
- `canonical_product_id`
- `ingredient_id`
- `mapping_type`
- `confidence`
- `source`
- `needs_review`
- `created_at`
- `updated_at`

`mapping_type` is currently one of `exact`, `category`, or `weak`. Mapping records bridge retailer-product truth to meal-domain ingredient truth without mutating either side.

### `units`
- `unit_id`
- `unit_type`
- `allow_fractional`
- `created_at`
- `updated_at`

Phase M0 seeds `g`, `kg`, `ml`, `l`, `piece`, and `pack`.

### `unit_conversions`
- `conversion_id`
- `from_unit_id`
- `to_unit_id`
- `factor`
- `created_at`
- `updated_at`

Phase M0 keeps generic conversions within a unit type only.

### `ingredient_unit_rules`
- `ingredient_rule_id`
- `ingredient_id`
- `piece_to_grams`
- `edible_yield_ratio`
- `notes`
- `created_at`
- `updated_at`

These records provide ingredient-specific conversions and yield rules such as `piece -> grams` and edible-to-purchase adjustment.

### `disambiguation_application_preview`
- `applied_merges`
- `blocked_merges`
- `skipped_conflicts`
- `unchanged_pairs`
- `audit_log`
- optional `applied_grouping_map` in controlled apply-view mode

Phase 14.3 computes this as an applied view only. It reads queue pairs and effective decisions, blocks hard marker conflicts, and can produce an `applied_grouping_map` such as `{ "canonical_id_a": "canonical_id_b" }`, but it does not rewrite `canonical_products`, `canonical_product_mappings`, source product identity, or chain/product dedupe state.

### `canonical_product_mappings`
- `source_product_id`
- `dedupe_key`
- `canonical_product_id`
- `mapping_confidence`
- `mapping_method`
- `mapped_at`

## Phase 6 flat collections

### `ingest_runs`
- `ingest_run_id`
- `snapshot_date`
- `source_file_name`
- `source_file_name_raw`
- `source_file_stem`
- `source_chain_name_raw`
- `source_chain_name_normalized`
- `source_file_numeric_id`
- `source_url`
- `source_file_count`
- `imported_rows`
- `unique_rows`
- `duplicate_rows`
- `malformed_rows`
- `created_products`
- `updated_products`
- `enrichment_runs`
- `dedupe_bucket_count`
- `enrichment_reuse_count`
- `canonical_product_count`
- `canonical_merge_count`
- `canonical_singleton_count`
- `canonical_warning_count`
- `status`
- `ingested_at`

Historical snapshot ingest uses `ingest_runs` as archive/run provenance. A historical ZIP for `YYYY-MM-DD` may append or idempotently upsert raw snapshots and daily price rows for that date. It must not publish `current_product_offers` or `canonical_current_offer_summary` unless the operator explicitly targets those current/latest read-model collections.

### `admin_ingest_jobs`
- `job_id`
- `snapshot_date`
- `source_type`
- `source_url`
- `storage_path`
- `local_path`
- `status`
- `dry_run`
- `target_collections`
- `started_at`
- `finished_at`
- `created_by`
- `counts`
- `warnings`
- `errors`
- `firestore_prefix`
- `command`
- `version`
- `command_hash`
- `created_at`
- `updated_at`

`admin_ingest_jobs` is the Admin Console planning/visibility model for historical KolkoStruva ingest. V1 endpoint writes create `planned` records only; long ZIP processing stays in the operator CLI until a queue or Cloud Storage worker exists. Allowed statuses are `planned`, `running`, `succeeded`, `failed`, and `cancelled`; allowed source types are `upload`, `url`, and `local_path`.

### `pipeline_logs`
- `log_id`
- `level`
- `event_type`
- `message`
- `context_json`
- `logged_at`

## Historical KolkoStruva Ingest Semantics

Historical archive collections:
- `raw_price_snapshots`
- `product_daily_prices`
- `ingest_runs`
- `pipeline_logs`

These collections can grow by `snapshot_date`. `raw_price_snapshots.snapshot_id` is deterministic from `snapshot_date`, locality, store, product code, and category. `product_daily_prices` is keyed by `source_product_id + date`, so the same date is resumable and can skip existing Firestore documents.

Current/latest read models:
- `current_product_offers`
- `canonical_current_offer_summary`

These represent current state only. They should be rebuilt from the latest snapshot or an explicit current-state selector, not appended as historical fact rows.

Canonical/catalog collections:
- `source_products`
- `canonical_products`
- `canonical_product_mappings`
- `source_product_enrichment`
- `canonical_enrichment_store`

Historical ingest may use these in local planning, but production publication must be explicitly targeted and treated as idempotent upserts. Historical ingest must not delete catalog/canonical/enrichment rows by default.

### `analytics_events`
- `analytics_event_id`
- `event_type`
- `user_id`
- `query_text`
- `raw_input`
- `source_product_id`
- `metadata_json`
- `created_at`

### `gap_signal_store`
- `signal_id`
- `query`
- `normalized_query`
- `canonical_attempt`
- `status`
- `confidence`
- `category_l1`
- `category_l2`
- `locality_code`
- `chain_id`
- `chain_name`
- `store_id`
- `store_name`
- `price_context.avg_price`
- `source`
- `timestamp`

Gap signals are internal analytics records only. They are captured from product search, shopping-list resolution/basket planning input, and watchlist additions without changing user-facing response bodies. `locality_code`, `chain_id`, and `store_id` are nullable context fields representing request hints or deterministic source/store context when known; they do not claim verified inventory presence or absence.

### `watchlist_alert_events`
- `alert_id`
- `user_id`
- `source_product_id`
- `display_name`
- `snapshot_date`
- `current_price`
- `previous_price`
- `target_price`
- `drop_amount`
- `drop_percent`
- `notification_status`
- `device_token`
- `created_at`

### `notification_events`
- `notification_id`
- `alert_id`
- `user_id`
- `source_product_id`
- `device_token`
- `provider`
- `status`
- `payload_json`
- `sent_at`
- `error_message`

### `watchlist_profiles`
- `watchlist_key`
- `user_id`
- `source_product_id`
- `display_name`
- `target_price`
- `current_price`
- `last_seen_date`
- `recurring_interval_days`
- `recurrence_confidence`
- `last_nudge_sent_at`
- `last_nudge_type`
- `last_significance_level`
- `last_good_deal_flag`
- `last_list_diff_direction`
- `device_token`
- `updated_at`

### `watchlist_recurring_patterns`
- `recurrence_id`
- `user_id`
- `source_product_id`
- `recurring_interval_days`
- `recurrence_confidence`
- `price_observation_count`
- `trigger_event_count`
- `latest_trigger_date`
- `updated_at`

### `watchlist_insight_events`
- `insight_id`
- `user_id`
- `source_product_id`
- `snapshot_date`
- `display_name`
- `current_price`
- `previous_price`
- `target_price`
- `price_delta`
- `price_delta_percent`
- `drop_amount`
- `drop_percent`
- `significance_level`
- `good_deal_flag`
- `is_target_hit`
- `recurring_interval_days`
- `recurrence_confidence`
- `nudge_type`
- `cooldown_applied`
- `list_diff_direction`
- `drop_alert_id`
- `created_at`

### `watchlist_daily_summaries`
- `summary_id`
- `user_id`
- `snapshot_date`
- `item_count`
- `drop_count`
- `target_hit_count`
- `good_deal_count`
- `nudge_count`
- `summary_json`
- `created_at`

## Phase 10 flat collections

### `user_tiers`
- `user_id`
- `tier`
- `premium_active`
- `ads_enabled`
- `optimizer_multi_store_enabled`
- `alerts_enabled`
- `max_optimizer_items`
- `max_watchlist_items`
- `max_target_price_alerts`
- `revenuecat_customer_id`
- `revenuecat_entitlement_id`
- `revenuecat_product_id`
- `entitlement_status`
- `entitlement_source`
- `expires_at`
- `updated_at`

### `revenuecat_events`
- `revenuecat_event_id`
- `user_id`
- `revenuecat_customer_id`
- `entitlement_id`
- `product_id`
- `entitlement_status`
- `expires_at`
- `event_source`
- `raw_event_json`
- `updated_at`

## Phase 12 flat collections

### `canonical_terms`
- `term_id`
- `term_type`
- `locale`
- `canonical_value`
- `normalized_value`
- `category_hint`
- `product_type_hint`
- `source`
- `confidence`
- `active`
- `created_at`
- `updated_at`

### `synonym_map`
- `synonym_id`
- `synonym_text`
- `normalized_synonym_text`
- `canonical_term_id`
- `canonical_value`
- `match_scope`
- `relation_type`
- `confidence`
- `source`
- `active`
- `category_hint`
- `product_type_hint`
- `created_at`
- `updated_at`

## Phase 7 flat collections

### `demand_logs`
- `demand_log_id`
- `demand_key`
- `raw_query`
- `normalized_query`
- `tokens_bg`
- `locality_code`
- `city`
- `demand_source`
- `query_source`
- `user_id`
- `metadata_json`
- `created_at`

### `demand_aggregates`
- `demand_key`
- `normalized_query`
- `locality_code`
- `city`
- `frequency`
- `automatic_frequency`
- `manual_frequency`
- `first_seen_at`
- `last_seen_at`
- `sample_raw_query`
- `last_raw_query`
- `cluster_id`

### `demand_embeddings`
- `demand_key`
- `embedding_model`
- `embedding_dimensions`
- `embedding_text`
- `embedding_vector_json`
- `generated_at`

### `demand_clusters`
- `cluster_id`
- `locality_code`
- `city`
- `representative_query`
- `cluster_label`
- `aggregate_count`
- `total_frequency`
- `member_demand_keys_json`
- `member_queries_json`
- `embedding_model`
- `embedding_vector_json`
- `updated_at`

## Notes on Phase 4
- Phase 4 does not change the stored Phase 1-3.5 contract.
- Query execution composes existing matcher, AI fallback, and aggregates.
- Sync targets remain flat and idempotent.

## Firestore persistence notes
- Production Firestore persistence uses one document per flat record.
- Document ids are derived from the existing stable identity fields such as `snapshot_id`, `source_product_id`, `ingest_run_id`, `alert_id`, and similar phase-owned ids.
- Collections without a single id field use deterministic composite document ids, such as:
  - `product_daily_prices`: `source_product_id + date`
  - `category_daily_aggregates`: `category_code + date`
  - `sql_product_prices_daily`: `source_product_id + date`
  - `sql_category_aggregates`: `category_code + date`
  - `embedding_records`: `source_product_id + embedding_model`
  - `vector_index_records`: `source_product_id + embedding_model`
  - `demand_embeddings`: `demand_key + embedding_model`
- Phase M0 meal collections currently use these document ids:
  - `ingredient_families`: `ingredient_family_id`
  - `ingredient_categories`: `ingredient_category_id`
  - `ingredients`: `ingredient_id`
  - `product_ingredient_mappings`: `mapping_id`
  - `units`: `unit_id`
  - `unit_conversions`: `conversion_id`
  - `ingredient_unit_rules`: `ingredient_rule_id`
  - `retailer_locations`: `location_id`
  - `retailer_location_geocodes`: `geocode_id`
  - `manual_location_geocodes`: `geocode_id`
  - `location_review_candidates`: `candidate_id`
  - `reviewed_location_coordinates`: `reviewed_coordinate_id`
  - `user_product_family_preferences`: `preference_id`
  - `saved_user_locations`: `location_id`

## Phase DB0 Postgres transition notes
- DB0 is architecture/design only; no Postgres tables are active in runtime yet.
- Future Postgres schemas should start with source dataset metadata, source files, import batches, and raw archive references before source-specific normalized tables.
- USDA/FoodData Central, Open Food Facts, and future recipe-source imports should be imported into Postgres first, then published into compact Firestore/runtime read models only after deterministic normalization, dedupe, mapping, confidence scoring, and review where needed.
- Firestore should not store raw USDA nutrient rows, raw Open Food Facts dumps, or other high-volume relational fact tables.
- App-facing nutrition, ingredient, recipe, and packaged-product records in Firestore must be runtime-safe projections, not direct mirrors of third-party source schemas.

## Phase DB1 Postgres sidecar tables
- DB1 adds sidecar Postgres migration tooling and import metadata tables only. These tables are not part of the Firestore/flat runtime store and are not read by current product, shopping, watchlist, or basket flows.

### `schema_migrations`
- `migration_name`
- `checksum`
- `applied_at`

### `source_datasets`
- `dataset_id`
- `source_name`
- `source_type`
- `version`
- `root_path`
- `license_note`
- `created_at`
- `updated_at`

### `source_files`
- `source_file_id`
- `dataset_id`
- `path`
- `format`
- `bytes`
- `row_count`
- `checksum`
- `created_at`

### `import_batches`
- `import_batch_id`
- `dataset_id`
- `status`
- `started_at`
- `completed_at`
- `error_message`
- `metadata_json`

`metadata_json` stores row-level source-quality counters such as `invalid_food_rows`, `invalid_nutrient_rows`, `invalid_food_nutrient_rows`, `invalid_food_portion_rows`, `orphan_food_nutrient_rows`, `orphan_food_portion_rows`, `non_macro_nutrient_rows_skipped`, `warnings`, and up to five `sample_invalid_rows`.
- `metadata_json`

## Phase DB2 USDA macro sidecar tables
- DB2 adds USDA/FoodData Central macro-only normalized tables in Postgres. These are not Firestore/flat runtime collections and are not read by current product, shopping, watchlist, basket, or mobile app flows.
- Source files remain raw truth under `datasets/usda/FoodData_Central_csv_2025-12-18/FoodData_Central_csv_2025-12-18/`.
- DB2 imports only macro nutrient IDs `1008`, `1003`, `1004`, `1005`, `1079`, `2000`, `1093`, `2047`, and `2048`.

### `usda_food_categories`
- `food_category_id`
- `code`
- `description`
- `created_at`

### `usda_measure_units`
- `measure_unit_id`
- `name`
- `created_at`

### `usda_nutrients`
- `nutrient_id`
- `name`
- `unit_name`
- `nutrient_nbr`
- `rank`
- `created_at`

### `usda_foods`
- `fdc_id`
- `data_type`
- `description`
- `food_category_id`
- `publication_date`
- `raw_json`
- `created_at`

`food_category_id` is stored as text because actual USDA rows can contain source category text such as `Oils Edible` rather than a numeric category id.

### `usda_food_nutrients`
- `food_nutrient_id`
- `fdc_id`
- `nutrient_id`
- `amount`
- `derivation_id`
- `data_points`
- `min`
- `max`
- `median`
- `footnote`
- `created_at`

### `usda_food_portions`
- `id`
- `fdc_id`
- `amount`
- `measure_unit_id`
- `portion_description`
- `modifier`
- `gram_weight`
- `created_at`

### `usda_import_runs`
- `usda_import_run_id`
- `import_batch_id`
- `dataset_root`
- `status`
- `foods_imported`
- `nutrients_imported`
- `food_nutrients_imported`
- `portions_imported`
- `started_at`
- `completed_at`
- `error_message`
- `metadata_json`

`metadata_json` stores row-level source-quality counters such as `invalid_food_rows`, `invalid_nutrient_rows`, `invalid_food_nutrient_rows`, `invalid_food_portion_rows`, `orphan_food_nutrient_rows`, `orphan_food_portion_rows`, `non_macro_nutrient_rows_skipped`, `warnings`, and up to five `sample_invalid_rows`.

## Phase DB3A canonical ingredient sidecar table

DB3A adds a Postgres-only canonical Pricer `ingredients` table. It is sidecar truth for future recipe and nutrition profile attachments and does not change the existing flat runtime meal ingredient collections.

### `ingredients`
- `ingredient_id`
- `ingredient_key`
- `name_en`
- `name_bg`
- `canonical_name`
- `normalized_name`
- `ingredient_type`
- `food_family`
- `default_unit`
- `shopping_unit`
- `density_g_per_ml`
- `grams_per_piece`
- `edible_portion_factor`
- `aliases_json`
- `tags_json`
- `state_defaults_json`
- `allergen_flags_json`
- `dietary_flags_json`
- `review_status`
- `source`
- `generation_method`
- `rules_version`
- `created_at`
- `updated_at`

Allowed `review_status` values are `draft`, `active`, `rejected`, and `needs_review`. `ingredient_id` is a Pricer stable id and is not a USDA FDC id. The table does not directly map raw USDA rows.

## Phase DB3C ingredient nutrition profile candidate sidecar table

DB3C adds previewable per-100g nutrition profile candidates derived only from approved `ingredient_nutrition_mappings` and USDA macro nutrient rows. These candidates remain Postgres sidecar records and are not published to Firestore or runtime app flows.

### `ingredient_nutrition_profile_candidates`
- `profile_candidate_id`
- `ingredient_id`
- `mapping_id`
- `cluster_id`
- `representative_fdc_id`
- `basis_amount`
- `basis_unit`
- `kcal`
- `protein_g`
- `fat_g`
- `carbs_g`
- `fiber_g`
- `sugar_g`
- `sodium_mg`
- `source_nutrients_json`
- `review_status`
- `source`
- `generation_method`
- `rules_version`
- `created_at`
- `updated_at`

`basis_amount` is `100` and `basis_unit` is `g`. Profile candidate generation refreshes nutrient values idempotently by `mapping_id` while preserving existing profile `review_status`.

## Phase DB3D approved ingredient nutrition profile sidecar tables

DB3D adds review workflow tables that promote reviewed `ingredient_nutrition_profile_candidates` into approved `ingredient_nutrition_profiles`. The workflow remains Postgres-only and does not publish nutrition to Firestore or runtime app paths.

### `ingredient_nutrition_profiles`
- `profile_id`
- `ingredient_id`
- `mapping_id`
- `cluster_id`
- `representative_fdc_id`
- `default_for_state`
- `mapping_type`
- `kcal_per_100g`
- `protein_g_per_100g`
- `fat_g_per_100g`
- `carbs_g_per_100g`
- `fiber_g_per_100g`
- `sugar_g_per_100g`
- `sodium_mg_per_100g`
- `source_nutrients_json`
- `source_profile_candidate_id`
- `confidence`
- `review_status`
- `reviewed_by`
- `reviewed_at`
- `review_decision`
- `review_reason`
- `generation_method`
- `rules_version`
- `source_version`
- `created_at`
- `updated_at`

Review statuses are `approved`, `rejected`, `needs_review`, and `superseded`. A new approval for the same `ingredient_id + mapping_type + default_for_state` supersedes the previous approved profile before inserting the replacement profile.

### `ingredient_nutrition_profile_review_history`
- `review_event_id`
- `source_profile_candidate_id`
- `profile_id`
- `superseded_profile_id`
- `ingredient_id`
- `mapping_id`
- `cluster_id`
- `previous_candidate_review_status`
- `previous_profile_review_status`
- `review_decision`
- `reviewed_by`
- `reviewed_at`
- `review_reason`
- `review_note`
- `created_at`

## Phase DB3E ingredient product equivalence sidecar tables

DB3E adds reviewable Postgres sidecar tables that connect canonical DB3A ingredients to purchasable product ids. These rows are for future basket optimization and product equivalence review only; they do not change runtime product search, shopping-list resolution, basket optimization, sponsored logic, Firestore, or mobile behavior.

The migration is `017_db3e_ingredient_product_equivalence.sql` because migration `016` is already used by DB5B in this repository history.

### `ingredient_product_candidates`
- `candidate_id`
- `product_id`
- `product_name`
- `normalized_product_name`
- `brand`
- `size`
- `unit`
- `parsed_attributes_json`
- `proposed_ingredient_key`
- `match_confidence`
- `generation_method`
- `review_status`
- `created_at`
- `updated_at`

### `ingredient_product_mappings`
- `mapping_id`
- `ingredient_id`
- `product_id`
- `mapping_type`
- `confidence`
- `review_status`
- `reviewed_by`
- `reviewed_at`
- `review_reason`
- `generation_method`
- `created_at`
- `updated_at`

Allowed `mapping_type` values are `exact_match`, `close_match`, `substitute`, and `rejected`. Allowed `review_status` values are `suggested`, `approved`, `rejected`, and `needs_review`. Regenerated suggestions preserve existing `approved` and `rejected` decisions.

### `ingredient_substitution_groups`
- `substitution_group_id`
- `ingredient_id`
- `substitution_type`
- `constraints_json`
- `priority_rank`
- `created_at`

## Phase DB4A canonical recipe sidecar tables

DB4A adds fixture-only canonical recipe tables in Postgres. Recipe ingredient lines link to existing DB3A ingredients by `ingredient_id`; they do not store USDA FDC IDs, create ingredients, publish Firestore read models, or affect product/search/shopping/basket runtime behavior.

### `recipes`
- `recipe_id`
- `recipe_key`
- `title_en`
- `title_bg`
- `canonical_title`
- `normalized_title`
- `description`
- `cuisine_tags_json`
- `dietary_tags_json`
- `meal_type_tags_json`
- `servings`
- `yield_quantity`
- `yield_unit`
- `source`
- `review_status`
- `generation_method`
- `rules_version`
- `usability_status`
- `ingredient_match_rate`
- `nutrition_coverage_rate`
- `product_coverage_rate`
- `last_quality_computed_at`
- `created_at`
- `updated_at`

Allowed `review_status` values are `draft`, `active`, `rejected`, and `needs_review`.

DB5C treats canonical recipe existence and runtime eligibility separately. `usability_status` is the downstream readiness gate and may remain below `usable` even after a recipe is promoted into canonical storage.

### `recipe_ingredients`
- `recipe_ingredient_id`
- `recipe_id`
- `ingredient_id`
- `matched_ingredient_id`
- `ingredient_key_snapshot`
- `display_name`
- `quantity`
- `unit`
- `quantity_grams`
- `preparation_note`
- `optional`
- `sort_order`
- `match_method`
- `match_confidence`
- `review_status`
- `created_at`
- `updated_at`

`ingredient_id` and `matched_ingredient_id` are nullable in DB5C promotion flows so canonical recipes can preserve partially matched ingredient lines without auto-creating ingredients.

### `recipe_steps`
- `recipe_step_id`
- `recipe_id`
- `step_number`
- `instruction`
- `duration_minutes`
- `temperature_c`
- `equipment_tags_json`
- `created_at`
- `updated_at`

## Phase DB4B recipe nutrition profile candidates

DB4B adds deterministic Postgres-only nutrition profile candidates for canonical recipes. Candidates are calculated from `recipe_ingredients.quantity_grams` and approved DB3D `ingredient_nutrition_profiles`; recipe rows do not map directly to USDA FDC IDs and no runtime read model is published.

### `recipe_nutrition_profile_candidates`
- `recipe_profile_candidate_id`
- `recipe_id`
- `total_kcal`
- `total_protein_g`
- `total_fat_g`
- `total_carbs_g`
- `total_fiber_g`
- `total_sugar_g`
- `total_sodium_mg`
- `per_serving_kcal`
- `per_serving_protein_g`
- `per_serving_fat_g`
- `per_serving_carbs_g`
- `per_serving_fiber_g`
- `per_serving_sugar_g`
- `per_serving_sodium_mg`
- `servings`
- `ingredient_count`
- `ingredients_with_nutrition`
- `ingredients_missing_nutrition`
- `missing_ingredient_ids_json`
- `source_profile_ids_json`
- `confidence`
- `review_status`
- `generation_method`
- `rules_version`
- `created_at`
- `updated_at`

Allowed `review_status` values are `candidate`, `approved`, `rejected`, and `needs_review`. Generation upserts by `recipe_id` and preserves the existing review status.

## Phase DB4C approved recipe nutrition profile sidecar tables

DB4C adds a review workflow that promotes reviewed `recipe_nutrition_profile_candidates` into approved `recipe_nutrition_profiles`. The workflow remains Postgres-only and does not publish recipe nutrition to Firestore or runtime app paths.

### `recipe_nutrition_profiles`
- `recipe_profile_id`
- `recipe_id`
- `total_kcal`
- `total_protein_g`
- `total_fat_g`
- `total_carbs_g`
- `total_fiber_g`
- `total_sugar_g`
- `total_sodium_mg`
- `per_serving_kcal`
- `per_serving_protein_g`
- `per_serving_fat_g`
- `per_serving_carbs_g`
- `per_serving_fiber_g`
- `per_serving_sugar_g`
- `per_serving_sodium_mg`
- `servings`
- `ingredient_count`
- `ingredients_with_nutrition`
- `ingredients_missing_nutrition`
- `missing_ingredient_ids_json`
- `source_profile_ids_json`
- `source_recipe_profile_candidate_id`
- `confidence`
- `review_status`
- `reviewed_by`
- `reviewed_at`
- `review_decision`
- `review_reason`
- `generation_method`
- `rules_version`
- `created_at`
- `updated_at`

Review statuses are `approved`, `rejected`, `needs_review`, and `superseded`. A new approval for the same `recipe_id` supersedes the previous approved profile before inserting the replacement profile.

### `recipe_nutrition_profile_review_history`
- `review_event_id`
- `source_recipe_profile_candidate_id`
- `recipe_profile_id`
- `superseded_recipe_profile_id`
- `recipe_id`
- `previous_candidate_review_status`
- `previous_profile_review_status`
- `review_decision`
- `reviewed_by`
- `reviewed_at`
- `review_reason`
- `review_note`
- `created_at`

## Phase DB4D recipe quality and readiness reporting

DB4D adds no new persistence. It is a read-only reporting layer over canonical recipe tables plus approved nutrition and product-equivalence coverage. The report surface exists so downstream recommendation, meal-planning, and basket work can check recipe readiness without mutating canonical records.

DB4D reads:

- `recipes`
- `recipe_ingredients`
- `recipe_nutrition_profiles`
- `ingredient_nutrition_profiles`
- `ingredient_product_mappings`
- `ingredient_gap_candidates`

Per-recipe readiness output includes:

- `ingredient_match_rate`
- `grams_coverage_rate`
- `nutrition_coverage_rate`
- `product_coverage_rate`
- `has_approved_recipe_nutrition`
- `readiness_status`

Allowed computed `readiness_status` values are:

- `dormant`
- `needs_ingredient_mapping`
- `needs_grams`
- `needs_nutrition`
- `needs_product_mapping`
- `usable`
- `meal_plan_ready`

This reporting layer is intentionally sidecar-only and does not publish runtime recipe views, create ingredients, call planners, or modify product/search/shopping/basket behavior.

## Phase UX1 user food profile sidecar tables

UX1 adds Postgres-only user food profile, constraint, preference, and equipment records for future personalization work. These rows are not a planner, swipe, or recommendation runtime feature yet.

### `user_food_profiles`
- `profile_id`
- `user_id`
- `household_size`
- `default_servings`
- `weekly_budget_amount`
- `weekly_budget_currency`
- `preferred_language`
- `cooking_skill_level`
- `max_prep_time_minutes`
- `max_total_time_minutes`
- `meal_prep_preference`
- `nutrition_goal`
- `daily_calorie_target`
- `protein_target_g`
- `carbs_target_g`
- `fat_target_g`
- `fiber_target_g`
- `sodium_limit_mg`
- `review_status`
- `created_at`
- `updated_at`

Allowed `review_status` values are `draft`, `active`, `inactive`, and `needs_review`.

### `user_food_constraints`
- `constraint_id`
- `profile_id`
- `constraint_type`
- `target_type`
- `target_key`
- `severity`
- `notes`
- `created_at`
- `updated_at`

Allowed `constraint_type` values are `allergy`, `intolerance`, `religious`, `medical`, `dislike`, `avoid`, and `required`.

Allowed `target_type` values are `ingredient`, `ingredient_family`, `tag`, `cuisine`, `nutrient`, and `product_attribute`.

Allowed `severity` values are `hard`, `soft`, and `preference`.

### `user_food_preferences`
- `preference_id`
- `profile_id`
- `preference_type`
- `preference_key`
- `preference_score`
- `source`
- `confidence`
- `created_at`
- `updated_at`

Allowed `preference_type` values are `flavor`, `texture`, `cuisine`, `region`, `feeling`, `meal_type`, `cooking_method`, `budget`, and `convenience`.

Allowed `source` values are `explicit`, `inferred`, `swipe`, and `note`.

`preference_score` is bounded from `-1.0` to `1.0`.

### `user_equipment`
- `equipment_id`
- `profile_id`
- `equipment_key`
- `available`
- `notes`
- `created_at`
- `updated_at`

UX1 preserves profile rows instead of deleting them. Equipment mutability uses the `available` flag, while constraints and preferences are keyed so repeated seed/import work updates the same logical rows deterministically.

## Phase UX2 recipe feedback sidecar tables

UX2 adds explicit, append-only recipe feedback storage for future taste profiling and meal-planning work. These rows are Postgres sidecar only and do not change runtime recommendation, planner, or UI behavior.

### `recipe_feedback_events`
- `feedback_id`
- `profile_id`
- `user_id`
- `recipe_id`
- `recipe_key_snapshot`
- `event_type`
- `sentiment_score`
- `intent_score`
- `reason_tags_json`
- `note_text`
- `note_language`
- `source`
- `context_json`
- `created_at`

Allowed `event_type` values are:

- `impression`
- `swipe_left`
- `swipe_right`
- `swipe_up`
- `saved`
- `cooked`
- `cooked_again`
- `dismissed`

Allowed `source` values are:

- `swipe`
- `explicit`
- `note`
- `system`

`sentiment_score` is bounded from `-1.0` to `1.0`. `intent_score` is bounded from `0.0` to `1.0`. UX2 treats feedback rows as append-only user history and does not infer taste preferences yet.

### `recipe_feedback_note_signals`
- `signal_id`
- `feedback_id`
- `profile_id`
- `recipe_id`
- `signal_type`
- `signal_key`
- `signal_value`
- `polarity`
- `confidence`
- `extraction_method`
- `created_at`

Allowed `signal_type` values are:

- `taste`
- `texture`
- `timing`
- `difficulty`
- `substitution`
- `portion_size`
- `family_response`
- `price`
- `availability`

Allowed `polarity` values are `positive`, `negative`, and `neutral`.

Allowed `extraction_method` values are `manual_tag`, `future_llm`, and `rule`.

## Phase PROF1 user taste profile sidecar tables

PROF1 adds append-only Postgres taste profile snapshots and per-signal audit rows. These rows are built from UX1 explicit preferences and constraints plus UX2 feedback and recipe metadata. They remain sidecar only and do not change runtime recommendation, planner, or UI behavior.

### `user_taste_profile_snapshots`
- `snapshot_id`
- `profile_id`
- `user_id`
- `snapshot_version`
- `source_event_count`
- `source_recipe_count`
- `flavor_vector_json`
- `texture_vector_json`
- `cuisine_vector_json`
- `region_vector_json`
- `feeling_vector_json`
- `meal_type_vector_json`
- `cooking_method_vector_json`
- `dietary_pattern_json`
- `disliked_patterns_json`
- `preferred_constraints_json`
- `confidence_json`
- `generation_method`
- `rules_version`
- `created_at`

`snapshot_version` is append-only per `profile_id`. Vector JSON columns store normalized deterministic scores in the rough `-1.0` to `1.0` range. `confidence_json.level` is `low`, `medium`, or `high` based on feedback event volume.

### `user_taste_profile_signal_sources`
- `source_id`
- `snapshot_id`
- `profile_id`
- `source_type`
- `source_ref_id`
- `signal_family`
- `signal_key`
- `signal_score`
- `weight`
- `evidence_json`
- `created_at`

Allowed `source_type` values are `explicit_preference`, `swipe_feedback`, `note_signal`, and `recipe_metadata`.

Allowed `signal_family` values are `flavor`, `texture`, `cuisine`, `region`, `feeling`, `meal_type`, `cooking_method`, `dietary`, and `dislike`.

Signal-source rows are audit evidence, not mutable runtime preferences. PROF1 appends new snapshots and source rows instead of overwriting prior profile history.

## Phase PLAN1 deterministic meal planner sidecar tables

PLAN1 adds deterministic Postgres meal-plan output rows. They are generated from UX1 profile bounds, PROF1 taste signals, canonical recipe usability gates, and approved DB4C recipe nutrition profiles. They remain sidecar only and do not change runtime recommendation, shopping, basket, or planner-adjacent app behavior outside explicit invocation.

### `meal_plans`
- `plan_id`
- `profile_id`
- `user_id`
- `plan_key`
- `start_date`
- `days`
- `meals_per_day`
- `target_calories_per_day`
- `target_protein_g`
- `target_carbs_g`
- `target_fat_g`
- `generation_method`
- `rules_version`
- `created_at`

`plan_key` is deterministic from `profile_id + start_date + rules_version`, so the same profile and start date refresh one canonical sidecar plan instead of creating duplicates.

### `meal_plan_items`
- `item_id`
- `plan_id`
- `day_index`
- `meal_type`
- `recipe_id`
- `recipe_key_snapshot`
- `calories`
- `protein_g`
- `carbs_g`
- `fat_g`
- `selection_score`
- `selection_reason_json`
- `created_at`

PLAN1 item rows snapshot one selected canonical recipe per day/meal slot together with per-serving nutrition and an auditable reason payload containing score components and matched taste signals.

## Phase PLAN2A meal-plan requirements sidecar tables

PLAN2A adds a deterministic adapter layer from stored meal plans into aggregated canonical ingredient demand. It stays Postgres sidecar only and does not create a parallel shopping-list product, call basket optimization, resolve products, or modify runtime shopping behavior.

### `meal_plan_requirements`
- `requirement_id`
- `plan_id`
- `profile_id`
- `user_id`
- `requirement_key`
- `generation_method`
- `rules_version`
- `created_at`
- `updated_at`

`requirement_key` is deterministic from `plan_id + rules_version`, so the same meal plan refreshes one canonical sidecar requirement bundle instead of creating duplicates.

### `meal_plan_requirement_items`
- `requirement_item_id`
- `requirement_id`
- `ingredient_id`
- `ingredient_key_snapshot`
- `display_name`
- `total_quantity_grams`
- `recipe_count`
- `source_recipe_ids_json`
- `source_recipe_ingredient_ids_json`
- `shopping_unit`
- `estimated_shopping_quantity`
- `estimated_shopping_unit`
- `has_canonical_ingredient`
- `has_quantity_grams`
- `adapter_status`
- `created_at`
- `updated_at`

PLAN2A requirement items aggregate canonical recipe ingredient demand across one stored meal plan. Canonical ingredient rows are grouped by effective ingredient id, while unmatched recipe lines are grouped by normalized key or display name. The layer preserves missing ingredient and missing grams signals so later PLAN2 phases can decide whether to resolve products, request review, or skip incomplete rows safely.

## Phase PLAN2A.1 inventory-adjusted meal-plan net-requirement sidecar tables

PLAN2A.1 adds a second derived sidecar adapter layer. It reads PLAN2A gross requirements plus INVENTORY1 active inventory rows and writes net shopping requirements without mutating either source layer.

### `meal_plan_net_requirements`
- `net_requirement_id`
- `requirement_id`
- `plan_id`
- `profile_id`
- `user_id`
- `net_requirement_key`
- `generation_method`
- `rules_version`
- `created_at`
- `updated_at`

`net_requirement_key` is deterministic from `requirement_id + rules_version`, so the same PLAN2A requirement refreshes one canonical sidecar net-requirement bundle instead of creating duplicates.

### `meal_plan_net_requirement_items`
- `net_requirement_item_id`
- `net_requirement_id`
- `requirement_item_id`
- `ingredient_id`
- `ingredient_key_snapshot`
- `display_name`
- `required_quantity_grams`
- `inventory_applied_grams`
- `net_quantity_grams`
- `inventory_item_ids_json`
- `source_recipe_ids_json`
- `source_recipe_ingredient_ids_json`
- `shopping_unit`
- `estimated_shopping_quantity`
- `estimated_shopping_unit`
- `inventory_status`
- `adapter_status`
- `created_at`
- `updated_at`

PLAN2A.1 matches inventory to requirement items by canonical `ingredient_id` first and normalized `ingredient_key_snapshot` second. It subtracts grams only from active inventory rows with positive `quantity_grams`, preserves the original PLAN2A source recipe evidence, and recomputes only the net shopping quantity estimate. The layer is derived-only: it does not mutate `meal_plan_requirements`, and it does not decrement `inventory_items`.

## Phase PLAN2B meal-plan product candidate sidecar tables

PLAN2B adds a deterministic adapter layer from PLAN2A.1 net ingredient demand into runtime-compatible purchasable product candidates. It remains Postgres sidecar for persistence, but it reads the existing runtime product and price backbone rather than inventing duplicate product tables or price logic.

### `meal_plan_product_candidate_sets`
- `candidate_set_id`
- `net_requirement_id`
- `plan_id`
- `profile_id`
- `user_id`
- `candidate_set_key`
- `generation_method`
- `rules_version`
- `created_at`
- `updated_at`

`candidate_set_key` is deterministic from `net_requirement_id + rules_version`, so the same PLAN2A.1 net requirement refreshes one canonical sidecar candidate-set bundle instead of creating duplicates.

### `meal_plan_product_candidates`
- `candidate_id`
- `candidate_set_id`
- `net_requirement_item_id`
- `ingredient_id`
- `ingredient_key_snapshot`
- `display_name`
- `product_id`
- `product_name_snapshot`
- `brand`
- `chain_id`
- `store_id`
- `price_id`
- `product_size_quantity`
- `product_size_unit`
- `product_size_grams`
- `required_quantity_grams`
- `units_needed`
- `total_purchased_grams`
- `overage_grams`
- `unit_price`
- `total_estimated_price`
- `currency`
- `mapping_id`
- `mapping_confidence`
- `candidate_confidence`
- `candidate_status`
- `selection_reason_json`
- `created_at`
- `updated_at`

PLAN2B resolves approved DB3E `ingredient_product_mappings` onto the runtime canonical product backbone in this order:

1. direct `canonical_product_id`
2. runtime `source_product_id -> canonical_product_id` mapping

Package sizing is normalized conservatively from runtime canonical size fields first and DB3E candidate metadata second:

- `g`
- `kg`
- `ml` / `l` using canonical ingredient density
- `piece` / `count` using canonical ingredient grams-per-piece

Candidate statuses are:

- `ready_for_optimizer`
- `missing_product_mapping`
- `missing_product_size`
- `missing_price`
- `covered_by_inventory`
- `needs_review`

PLAN2B does not call the optimizer, does not choose a winning store, and does not mutate runtime product, price, or shopping state. It only creates adapter rows that can later be translated into the existing Phase 15/16 basket-plan and optimizer shapes.

## Phase PLAN2C meal-plan optimized basket sidecar tables

PLAN2C adds a fourth adapter layer from PLAN2B product candidates into explicit optimized basket outputs. It stays Postgres sidecar for persistence, adapts package-count semantics into a synthetic Phase 16 optimizer contract, and stores the reused optimizer result without mutating runtime shopping, basket, product, or price state.

### `meal_plan_optimized_baskets`
- `optimized_basket_id`
- `candidate_set_id`
- `net_requirement_id`
- `plan_id`
- `profile_id`
- `user_id`
- `optimizer_run_key`
- `optimizer_version`
- `total_estimated_price`
- `currency`
- `selected_chain_id`
- `selected_store_id`
- `item_count`
- `covered_requirement_count`
- `missing_requirement_count`
- `optimizer_summary_json`
- `generation_method`
- `rules_version`
- `created_at`
- `updated_at`

`optimizer_run_key` is deterministic from `candidate_set_id + optimizer_version + rules_version`, so the same PLAN2B candidate-set bundle refreshes one canonical optimized basket bundle instead of duplicating rows.

### `meal_plan_optimized_basket_items`
- `optimized_basket_item_id`
- `optimized_basket_id`
- `candidate_id`
- `net_requirement_item_id`
- `ingredient_id`
- `ingredient_key_snapshot`
- `display_name`
- `product_id`
- `product_name_snapshot`
- `brand`
- `chain_id`
- `store_id`
- `price_id`
- `units_selected`
- `total_purchased_grams`
- `required_quantity_grams`
- `overage_grams`
- `unit_price`
- `total_price`
- `currency`
- `selection_reason_json`
- `item_status`
- `created_at`

PLAN2C preserves one explicit output row per requirement:

- `selected` for priced optimizer selections
- `covered_by_inventory` for requirements already netted away by INVENTORY1
- `missing_product` when no approved or usable product mapping exists
- `missing_price` when mappings exist but no usable runtime price remains
- `optimizer_excluded` when candidate rows cannot be optimized safely, such as missing package size
- `needs_review` for conservative fallback diagnostics

PLAN2C uses the existing runtime canonical price lookup and existing Phase 16 single-store and multi-store optimizer functions through a synthetic contract:

- synthetic `canonical_product_id = candidate_id`
- synthetic `price_record.price = runtime price * units_needed`
- synthetic optimizer quantity stays `1`

That lets the existing optimizer compare package-size-aware candidate totals without adding a second optimizer implementation.

## Phase PLAN2D meal-plan shopping orchestration sidecar table

PLAN2D adds a fifth, thinner layer above PLAN1 plus PLAN2A through PLAN2C. It does not add new shopping or optimizer math. It records which deterministic upstream artifacts were used or created for one end-to-end meal-plan shopping run.

#### `meal_plan_shopping_runs`

| Column | Type | Notes |
| --- | --- | --- |
| `run_id` | text | Primary key. Deterministic from `run_key`. |
| `user_id` | text | External user identifier for the shopping-run owner. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `plan_id` | text | Nullable FK to `meal_plans.plan_id`. Present once an existing or generated PLAN1 plan is known. |
| `plan_key` | text | Nullable plan key snapshot. Used for deterministic orchestration identity. |
| `requirement_id` | text | Nullable FK to `meal_plan_requirements.requirement_id`. |
| `net_requirement_id` | text | Nullable FK to `meal_plan_net_requirements.net_requirement_id`. |
| `candidate_set_id` | text | Nullable FK to `meal_plan_product_candidate_sets.candidate_set_id`. |
| `optimized_basket_id` | text | Nullable FK to `meal_plan_optimized_baskets.optimized_basket_id`. |
| `run_key` | text | Unique deterministic key from `user_id + plan_key + rules_version`. |
| `run_status` | text | `started`, `completed`, `partial`, or `failed`. |
| `summary_json` | jsonb | Deterministic summary payload with totals, coverage, status counts, and step-level errors. |
| `generation_method` | text | Deterministic PLAN2D orchestration method identifier. |
| `rules_version` | text | PLAN2D rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

## Phase INVENTORY1 user inventory sidecar tables

INVENTORY1 adds a Postgres-only current-inventory layer for subtractive future shopping and planner work. It stays sidecar-only, does not scan receipts yet, does not change planner behavior yet, and does not mutate runtime product, shopping, or basket state.

### `user_inventories`
- `inventory_id`
- `profile_id`
- `user_id`
- `inventory_key`
- `created_at`
- `updated_at`

`inventory_key` is deterministic from `user_id`, so repeated inventory creation for the same profile refreshes one canonical sidecar inventory row instead of creating duplicates.

### `inventory_items`
- `inventory_item_id`
- `inventory_id`
- `ingredient_id`
- `ingredient_key_snapshot`
- `product_id`
- `product_name_snapshot`
- `quantity_grams`
- `quantity_units`
- `unit`
- `estimated_remaining_ratio`
- `storage_type`
- `perishability_class`
- `estimated_expiry_date`
- `last_updated_source`
- `created_at`
- `updated_at`

INVENTORY1 prefers canonical `ingredient_id` tracking when the ingredient is known and falls back to product identity or product-name snapshots otherwise. Duplicate item merging is conservative: rows merge only when the logical identity and storage context match, so pantry, fridge, and freezer stock are not collapsed together. Zero-quantity removals are soft removals implemented by zeroing quantities and remaining ratio while preserving the row for audit/history.

## Phase DB5A rich recipe ingest staging sidecar tables

DB5A adds raw-preserving Postgres staging tables for future rich recipe ingest. These rows are not canonical recipes, do not create ingredients, and are not published to Firestore or runtime app paths. They capture raw source input plus parsed/enriched staging metadata that can be reviewed and promoted by later phases.

### `recipe_ingest_jobs`
- `job_id`
- `source_type`
- `source_name`
- `source_url`
- `raw_text`
- `raw_json`
- `language`
- `status`
- `generation_method`
- `rules_version`
- `created_at`
- `updated_at`

Allowed job statuses are `pending`, `extracting`, `staged`, `needs_review`, `completed`, `failed`, and `cancelled`. DB5B uses `extracting` while bounded LLM extraction is in progress and records extraction provenance under `raw_json.db5b`.

### `recipe_ingest_staged_recipes`
- `staged_recipe_id`
- `job_id`
- `proposed_recipe_key`
- `title_original`
- `title_en`
- `title_bg`
- `description`
- `servings`
- `yield_quantity`
- `yield_unit`
- `cuisine_tags_json`
- `region_tags_json`
- `dietary_tags_json`
- `meal_type_tags_json`
- `feeling_tags_json`
- `flavor_profile_json`
- `texture_profile_json`
- `difficulty_level`
- `budget_level`
- `prep_time_minutes`
- `cook_time_minutes`
- `rest_time_minutes`
- `total_time_minutes`
- `review_status`
- `confidence`
- `extraction_json`
- `created_at`
- `updated_at`

Allowed staged recipe review statuses are `staged`, `needs_review`, `approved`, `rejected`, and `promoted`.

### `recipe_ingest_staged_ingredients`
- `staged_recipe_ingredient_id`
- `staged_recipe_id`
- `raw_line`
- `ingredient_name_original`
- `ingredient_name_en`
- `ingredient_name_bg`
- `proposed_ingredient_key`
- `matched_ingredient_id`
- `quantity`
- `unit`
- `quantity_grams`
- `preparation_note`
- `optional`
- `sort_order`
- `match_confidence`
- `review_status`
- `extraction_json`
- `created_at`
- `updated_at`

`matched_ingredient_id` is nullable and may point at an existing DB3A `ingredients.ingredient_id`; it is never used to auto-create ingredients.

### `recipe_ingest_staged_steps`
- `staged_recipe_step_id`
- `staged_recipe_id`
- `step_number`
- `instruction_original`
- `instruction_en`
- `instruction_bg`
- `duration_minutes`
- `temperature_c`
- `state_change_summary`
- `extraction_json`
- `created_at`
- `updated_at`

### Staged recipe metadata child tables
- `recipe_ingest_staged_tools`: `staged_recipe_tool_id`, `staged_recipe_id`, `tool_key`, `tool_name_en`, `tool_name_bg`, `confidence`, `evidence_text`, `extraction_json`, `created_at`
- `recipe_ingest_staged_methods`: `staged_recipe_method_id`, `staged_recipe_id`, `method_key`, `method_name_en`, `method_name_bg`, `confidence`, `evidence_text`, `extraction_json`, `created_at`
- `recipe_ingest_staged_tags`: `staged_recipe_tag_id`, `staged_recipe_id`, `tag_type`, `tag_key`, `tag_value`, `confidence`, `evidence_text`, `extraction_json`, `created_at`
- `recipe_ingest_staged_state_changes`: `staged_recipe_state_change_id`, `staged_recipe_id`, `state_change_key`, `ingredient_name`, `from_state`, `to_state`, `confidence`, `evidence_text`, `extraction_json`, `created_at`
- `recipe_ingest_staged_substitution_hints`: `staged_recipe_substitution_hint_id`, `staged_recipe_id`, `substitution_key`, `original_ingredient_name`, `substitute_ingredient_name`, `reason`, `confidence`, `evidence_text`, `extraction_json`, `created_at`
- `recipe_ingest_staged_quality_signals`: `staged_recipe_quality_signal_id`, `staged_recipe_id`, `signal_key`, `signal_name`, `signal_value`, `severity`, `confidence`, `evidence_text`, `extraction_json`, `created_at`

DB5B stores raw model text under `recipe_ingest_jobs.raw_json.db5b.raw_llm_response`, parsed strict-JSON extraction under staged recipe `extraction_json.db5b.parsed_extraction`, and deterministic ingredient-match evidence under staged ingredient `extraction_json.db5b.match`. These remain staging-only provenance fields.

## Phase DB5C staged recipe promotion sidecar tables

DB5C promotes reviewed staged recipes into canonical recipes while preserving partial ingredient matching and storing explicit usability/readiness metrics. Canonical existence does not imply runtime eligibility.

### `ingredient_gap_candidates`
- `gap_id`
- `source_type`
- `recipe_id`
- `raw_name`
- `normalized_name`
- `proposed_ingredient_key`
- `occurrences`
- `created_at`
- `updated_at`

These rows aggregate unmatched staged ingredient names encountered during DB5C promotion. They are review signals for later ingredient-mapping work, not auto-created ingredients.

### `recipe_promotion_history`
- `id`
- `staged_recipe_id`
- `recipe_id`
- `decision`
- `reason`
- `metrics_json`
- `created_at`

Every DB5C review or promotion decision appends a history row. This remains append-only review provenance.

## DB2.5 USDA cluster candidate sidecar table
- DB2.5 adds deterministic cluster candidates for USDA Foundation and SR Legacy foods only.
- This remains Postgres sidecar data. It does not map USDA foods directly to Pricer ingredients and does not publish app-facing nutrition.

### `usda_food_cluster_candidates`
- `candidate_id`
- `candidate_key`
- `core_food_name`
- `core_food_normalized`
- `source_fdc_id`
- `source_description`
- `source_data_type`
- `source_food_category_id`
- `parsed_qualifiers_json`
- `hard_boundary_signature`
- `representative_score`
- `representative_score_json`
- `confidence`
- `review_status`
- `generation_method`
- `rules_version`
- `source_version`
- `created_at`
- `updated_at`

## Phase 5 client-side Firestore collections

### `users/{anon_id}/lists/{list_id}`
- `name`
- `created_at`
- `updated_at`
- `item_count`

### `users/{anon_id}/lists/{list_id}/items/{item_id}`
- `query_text`
- `matched_product_id`
- `quantity`
- `added_at`

### `users/{anon_id}/watchlist/{source_product_id}`
- `display_name`
- `target_price`
- `current_price`
- `added_at`

### `users/{anon_id}/billing/profile`
- `user_id`
- `tier`
- `premium_active`
- `ads_enabled`
- `alerts_enabled`
- `optimizer_multi_store_enabled`
- `max_optimizer_items`
- `max_watchlist_items`
- `max_target_price_alerts`
- `revenuecat_customer_id`
- `revenuecat_entitlement_id`
- `revenuecat_product_id`
- `entitlement_status`
- `entitlement_source`
- `expires_at`
- `updated_at`

## Notes on Phase 5
- Phase 5 does not modify Phase 1-4 backend storage contracts.
- The mobile app reads query and history data from the existing backend API.
- Lists and watchlists are client-managed Firestore documents keyed by an anonymous local device id.

## Notes on Phase 7
- Phase 7 extends the existing query layer without changing ingest or matching logic.
- Zero-result queries are logged as unmet demand; matched queries are not.
- Demand clustering is batch-derived from demand aggregates and remains flat via JSON string fields where lists are needed.

## Notes on Phase 9
- Phase 9 builds on existing watchlist entry inputs, Phase 6 drop detection, and daily product prices.
- Cooldowns are enforced deterministically from stored watchlist profile state.
- Watchlist intelligence records remain flat and append-friendly.

## Notes on Phase 10
- Phase 10 keeps entitlements flat and SQL-compatible in backend state.
- Firestore billing profiles are client-facing cached tier records keyed by anonymous device id.
- RevenueCat sync remains the authoritative entitlement source; the Flutter profile cache is not the source of truth for backend premium gating.
- Alert gating stays backward-compatible for legacy unsynced watchlist rows until entitlement sync is present.

## Notes on Phase 12
- Phase 12 improves deterministic query quality without changing Phase 1 through 11 ingest or identity rules.
- Canonicalization happens before candidate filtering and scoring.
- Demand-log-driven learning is conservative and creates only deterministic synonym or typo mappings.

## Notes on Phase 15 Grocery Search QA
- Phase 15 product search includes a deterministic in-code BG/EN grocery synonym table for query expansion and ranking only. It does not add persistence and does not merge or canonicalize products.
- Product search results may include backward-compatible `search_debug` metadata with normalized query, expanded terms, matched concepts, match tier, matched tokens, matched enrichment category/product type/aliases, demotion reason, and score for Admin QA visibility.
- Product search results include backward-compatible `current_offer_summary` metadata for bounded search candidate canonical product ids. Price min/max/avg come from `canonical_current_offer_summary` when present. Missing compact current summaries are returned as evidence summaries with `current_offer_count = 0`, historical/source counts from scoped `canonical_product_mappings` plus `source_products`, and no raw snapshot/current-offer scan.
- Phase 15.9 adds deterministic cookies/snacks/cola/soft-drink aliases before any LLM enrichment, plus enrichment-backed ranking over optional canonical fields such as `product_type`, `product_family`, `search_aliases_bg`, `search_aliases_en`, `synonym_terms`, `should_match_queries`, `negative_match_hints`, `do_not_match_queries`, `is_beverage`, `is_personal_care`, `dairy_type`, and `beverage_type`.
- Phase 15.9 adds `npm run phase15:enrichment-pilot`, which defaults to dry-run and selects a bounded pilot set for `milk_dairy_eval`, `bread_bakery_eval`, `cola_beverage_eval`, `cookies_snacks_eval`, `personal_care_false_positive_eval`, `baby_food_eval`, and `search_quality_eval` plus legacy group aliases. Real runs require explicit opt-in and write only `canonical_enrichment_store`.
- Parser fixes for brand/unit/age markers affect future Phase 6 generated canonical records; existing production records can be refreshed by the canonical-only marker backfill without re-ingesting raw snapshots or rewriting offer/history rows. Phase 15 product detail/search expose structured `markers.size_marker` when the backfill has populated `canonical_attributes_json.size_marker`.
- Phase 15.8 adds deterministic shopping-intent product-family definitions and owner-scoped family preference hints. This layer clarifies broad grocery terms before exact canonical product/current-offer selection; it does not call LLMs, merge canonical products, or change mobile UI.
- Phase 15.8 follow-up adds an opt-in `use_shopping_intent: true` / `resolution_mode: "intent_first"` adapter for shopping-list and basket planning. The adapter reads `user_product_family_preferences` only as scoped owner/family defaults, returns transient `clarification_needed` / `clarification_items` response fields when intent is ambiguous, and does not add persistence or mutate canonical products, offers, saved lists, meal plans, inventory, or mobile state.

## Notes on Phase 18.5
- Phase 18.5 adds mobile DTOs for the existing `POST /basket/optimize` response but does not add persistent basket records.
- The mobile `/optimize` screen sends transient item text, strategy, and explanation/convenience options only for the request lifecycle.
- Internal optimizer fields such as `score_total`, raw metrics, and debug payloads remain non-user-facing and are not modeled as mobile display data.

## Notes on Phase 18.6
- Phase 18.6 adds mobile DTOs for the existing `GET /watchlist/prices` owner-scoped price view and does not add new watchlist persistence.
- The mobile `/watchlist` screen treats watchlist price cards as computed read views over `watchlist_store`, current price lookup, and deal signals.
- Removing an item calls the existing `DELETE /watchlist/:id` endpoint and updates only local screen state after success.
- Notifications, watchlist intelligence alerts, analytics, and health diagnostics remain out of scope for the user-facing screen.

## Notes on Phase 18.7 Mobile Saved Lists Polish
- Phase 18.7 mobile saved-list polish adds Flutter DTOs for owner-scoped backend saved-list summaries and detail records, but it does not add a new persistent store.
- The mobile `/lists` and `/list_detail` screens read and mutate only the existing Phase 17 `saved_lists_store` through `/lists` endpoints with temporary owner headers.
- The mobile item editor treats comma/newline text as transient UI input, trims blank lines, and sends normalized item strings to the backend.
- Optimizing a saved list from mobile navigates the current item text into `/optimize`; optimizer results are not stored on the saved list.

## Notes on Phase 20 Market Gap Detection
- Phase 20 adds `gap_signal_store` as an internal analytics collection for deterministic market-gap detection.
- Gap summaries group by `normalized_query` or `category_l2` and score groups with `search_count * 0.4 + unresolved_rate * 5 + ambiguous_rate * 2 + price_pressure_score`.
- Gap types mean: `missing_supply` product not found, `poor_match_quality` catalog/enrichment issue, `high_price_pressure` pricing opportunity, and `normal` no strong gap signal.
- Gap detection is not user-facing, does not call LLMs, and must not affect product search, shopping-list, basket, or watchlist response contracts.
- Phase 20.1 adds locality-aware reads over the same signal store. A gap may exist globally, or it may be concentrated in specific `locality_code` segments where local demand is unresolved or poorly matched.
- Locality views remain observational. They depend on available request/owner locality context and should be interpreted as demand segmentation, not as direct merchant inventory truth.
- Phase 20.2 adds optional chain/store segmentation over the same signal store. Chain/store filters and grouping are available for explicit analytics reads, but they are not required for default gap summaries.
- Coverage-by-chain reads summarize how often a normalized query or category appears resolved versus unresolved per chain. These results are demand-coverage signals, not confirmed assortment or inventory truth.
- Phase 20.3 adds a read-only market opportunity report layer over the same signal store. It does not add persistence; it converts existing gap, locality, and chain evidence into deterministic opportunity cards with type, confidence, evidence, recommended action, and limitations.
- Opportunity reports are internal/B2B analytics only. They are not full-market proof, do not call LLMs, do not call external services, and do not mutate `gap_signal_store` or product/user/runtime data.
- Phase 20.4 adds a read-only merchant/admin insights API layer over existing gap and opportunity report outputs. It publishes dashboard-ready overview, top opportunities, category, locality, and chain rollups without adding persistence or changing lower-level analytics endpoints.
- Merchant/admin insight responses include `window`, applied `filters`, deterministic `generated_at`, bounded result arrays, and remain internal analytics surfaces rather than consumer-facing app data.
- Phase 20.5 adds a temporary internal access guard around Phase 20 market-intelligence HTTP endpoints. The guard reads `PRICER_INTERNAL_ANALYTICS_TOKEN`, checks `x-pricer-admin-token`, allows `admin` and `analyst` role placeholders through `x-pricer-role`, denies `merchant` for now, and does not change persisted data shape or analytics computation.
- Phase 20.6 adds an internal dashboard shell at `GET /internal/insights/dashboard`. It is a static HTML/JS surface that calls existing guarded insight endpoints from the browser; it does not add persistence, publish a new data model, or move any analytics read path.

## Later-phase collections retained from the roadmap

### `products_canonical`
- `canonical_id`
- `canonical_name_bg`
- `category_slug`
- `attribute_tags`
- `active`

### `product_aliases`
- `alias_text`
- `canonical_id`
- `alias_type`
- `confidence_hint`
- `source`

### `prices_daily`
- `date`
- `settlement_code`
- `merchant_name`
- `canonical_id`
- `retail_price`
- `promo_price`
- `raw_source_product_code`
- `raw_source_product_name`

### `user_lists`
- `user_id`
- `list_id`
- `raw_input`
- `parsed_items`
- `canonical_items`
- `created_at`

### `user_watchlists`
- `user_id`
- `watchlist_id`
- `display_name`
- `canonical_id`
- `created_at`
- `alert_opt_in`

### `search_events`
- `user_id`
- `raw_input`
- `settlement_code`
- `parsed_items`
- `canonical_items`
- `unresolved_items`
- `created_at`

### `market_gap_signals`
- `settlement_code`
- `signal_key`
- `raw_terms`
- `frequency`
- `match_success_rate`
- `last_seen_at`
