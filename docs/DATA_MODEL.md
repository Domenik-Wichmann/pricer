# Data Model

## Persistence runtime
- Backend production persistence can now map each flat backend collection below into a same-named Firestore top-level collection.
- Local development can still use a JSON-file state store.
- Tests can still use the in-memory backbone store.
- The backend keeps the same flat record shapes across all store backends.
- Phase DB0 does not change the active runtime store. It defines the next persistence boundary: Postgres will own relational source truth, large external imports, nutrition joins, dedupe staging, and mapping-review processing; Firestore/flat store remains the app-facing cache and user-state runtime.

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
- `created_at`
- `updated_at`

`canonical_attributes_json` currently carries deterministic canonicalization markers such as `stage_marker`, `count_marker`, `age_band_marker`, `reserve_marker`, `year_marker`, `age_statement_marker`, `volume_marker`, `flavor_marker`, `color_marker`, `pack_variant_marker`, `range_marker`, and `core_tokens`.

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
- `enrichment.category_l1`
- `enrichment.category_l2`
- `enrichment.category_l3`
- `enrichment.category_l4`
- `enrichment.brand`
- `enrichment.product_line`
- `enrichment.flavor[]`
- `enrichment.attributes[]`
- `enrichment.diet_tags[]`
- `enrichment.allergens[]`
- `enrichment.product_form`
- `enrichment.packaging`
- `enrichment.usage_context[]`
- `enrichment.quality_tier`
- `enrichment.confidence`
- `model_name`
- `prompt_version`
- `created_at`

`canonical_enrichment_store` is additive only. It is keyed by canonical fingerprint, currently aligned with `canonical_product_id`, and must not rewrite deterministic canonical grouping or marker truth.

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

### `pipeline_logs`
- `log_id`
- `level`
- `event_type`
- `message`
- `context_json`
- `logged_at`

### `analytics_events`
- `analytics_event_id`
- `event_type`
- `user_id`
- `query_text`
- `raw_input`
- `source_product_id`
- `metadata_json`
- `created_at`

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
