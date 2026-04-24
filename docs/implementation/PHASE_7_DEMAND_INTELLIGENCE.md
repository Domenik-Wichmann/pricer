# Phase 7 Implementation Contract

## Goal
Capture unmet user demand without changing ingest or matching behavior.

## Scope
- hook unmatched-query capture into the Phase 4 query flow
- accept manual "can't find this" feedback
- persist flat demand logs with locality and city context
- batch-build demand aggregates
- batch-build deterministic demand embeddings and clusters
- expose simple top-demand and trending-demand surfaces

## Flat collections

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

## Rules
- do not modify Phase 1 identities
- do not modify ingest behavior
- do not modify deterministic matching logic
- only log zero-result queries automatically
- keep logs append-only
- keep clustering batch-based and idempotent
- keep all new records flat and SQL-compatible

## Batch flow
1. query flow writes `demand_logs` only when a query returns zero items
2. manual "can't find this" writes both `feedback_events` and `demand_logs`
3. batch job rebuilds `demand_aggregates`
4. batch job rebuilds `demand_embeddings`
5. batch job rebuilds `demand_clusters`

## Endpoint contract
- `handleCantFindThisRequest({ store, body })`
- `handleGetTopDemandRequest({ store, body })`
- `handleGetTrendingDemandRequest({ store, body })`

## Notes
- `MASTER_PRODUCT_SPEC.md` was missing from the repository at implementation time, so Phase 7 follows the existing repo data model and `docs/PHASE_6_MARKET_GAP.md` scope statement.
