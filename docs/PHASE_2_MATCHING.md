# Phase 2 - Matching Backbone

## Objective
Convert Bulgarian free-text grocery input into deterministic product matches and current price comparisons, using ambiguity detection to reserve AI escalation for later phases only when needed.

## Scope
- input normalization
- Bulgarian tokenization
- candidate filtering from existing enrichment rows
- deterministic scoring
- ambiguity detection
- product matching
- current price aggregation
- query service endpoint
- automated tests for matching, scoring, ambiguity, and price comparison

## Rules
- deterministic matching first
- use existing enrichment fields from Phase 1 and 1.5
- do not modify Phase 1 or Phase 1.5 data structures
- do not reprocess raw ingest history
- do not invoke AI inside the deterministic matcher
- keep matching fast, explainable, and cheap

## Inputs
- Bulgarian free-text grocery queries
- existing `raw_price_snapshots`
- existing `source_products`
- existing `source_product_enrichment`

## Outputs
- matched products with deterministic score reasons
- ambiguity status for each query item
- cheapest current store result
- current price comparison list across matched stores

## Acceptance criteria
- Bulgarian free-text can be normalized and tokenized deterministically
- matcher uses existing enrichment fields only
- exact or strong specific matches resolve without ambiguity
- broad generic queries surface ambiguity instead of false certainty
- current prices aggregate from the latest snapshot rows without re-ingest
- endpoint returns matched products plus cheapest-store results
