# Phase 3 AI Layer

## Goal
Add AI fallback, semantic enrichment, embeddings, and feedback capture on top of Phase 2 deterministic matching without changing the Phase 1 or Phase 2 storage contracts.

## Rules
- deterministic matching runs first
- AI is fallback only
- AI does not query the database
- AI only ranks the already-filtered candidate set it is given
- new Phase 3 records must stay flat and SQL-compatible
- no raw re-ingest

## Phase 3 collections

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

## AI fallback contract
- Input: parsed query item plus already-scored deterministic candidates
- Input may include precomputed semantic profiles for those candidates
- Output: reranked candidates plus a resolved-or-still-ambiguous decision
- AI fallback must not fetch candidates or raw data itself

## Batch jobs
- semantic enrichment batch job
- embedding generation batch job

## Cost limits
- AI calls per request must be bounded
- semantic enrichment records per run must be bounded
- embedding records per run must be bounded

## Required automated coverage
1. AI ambiguity resolution
2. semantic enrichment output
3. embedding storage
4. feedback capture
