# Phase 15.1 Enrichment Propagation

## Goal
Make additive canonical enrichment safely consumable by downstream readers, filters, and analytics without blurring the boundaries between canonical truth, applied disambiguation view, and enrichment.

## Scope
- explicit reader helpers for canonical truth, applied view, enrichment, and explicit combinations
- deterministic enrichment-backed filtering and search helpers
- lightweight enrichment analytics and ingest-run rollups
- documented layer-combination contracts
- runtime/config/docs updates so live enrichment is intended to run with `ENABLE_LLM_ENRICHMENT=true`

## Non-goals
- no mutation of canonical truth
- no mutation of canonical mappings
- no hidden merging of enrichment into deterministic grouping
- no UI-heavy implementation
- no embeddings or multilingual expansion in this phase

## Required safety rules
- enrichment stays additive only
- deterministic markers remain authoritative
- applied disambiguation remains a policy/view layer
- live enrichment remains cache-first and non-fatal if the key is missing
- downstream code must choose its layer combination explicitly
