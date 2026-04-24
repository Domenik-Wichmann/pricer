# Phase 2 Implementation

## Goal
Implement a deterministic matching engine that converts Bulgarian free-text grocery queries into matched source products and current price comparisons using the existing Phase 1 and Phase 1.5 enrichment data.

## Contract
- Do not change `snapshot_id` or `source_product_id`.
- Do not rewrite or backfill Phase 1 raw ingest data.
- Do not modify the Phase 1 and 1.5 persistence schema.
- Use existing enrichment fields such as Bulgarian tokens, alias candidates, English canonical metadata, and category codes.
- Keep AI out of the deterministic path. Surface ambiguity instead of forcing a match.

## Matching pipeline
1. Normalize Bulgarian input.
2. Tokenize Bulgarian input into `tokens_bg`.
3. Infer coarse category and product-type hints from the query when possible.
4. Filter active candidates from `source_products` and `source_product_enrichment`.
5. Score candidates deterministically using:
   - exact normalized-name match
   - exact alias match
   - Bulgarian token overlap
   - brand match
   - size match
   - fat-percent match
   - parse confidence
6. Detect ambiguity using score thresholds and score gaps.
7. Aggregate the latest current prices from `raw_price_snapshots`.
8. Return matched products, ambiguity status, and cheapest store comparison data.

## Service output shape
- `raw_input`
- `items[]`
  - `raw_input`
  - `parsed_item`
  - `ambiguity`
  - `matched_products`
  - `cheapest_store_result`
  - `price_comparison`

## Required automated coverage
1. input normalization and tokenization
2. matching correctness
3. scoring behavior
4. price aggregation
5. ambiguity detection
6. query service success response
7. query service validation response
