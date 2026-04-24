# Phase 15 Hyper-Rich Enrichment Layer

## Goal
Add a strict, additive semantic enrichment layer on top of canonical products so each canonical fingerprint can carry reusable structured meaning without changing deterministic canonical truth.

## Scope
- strict enrichment schema with controlled category hierarchy
- additive `canonical_enrichment_store` persistence keyed by canonical fingerprint
- cache-first enrichment reuse during ingest
- optional LLM enrichment for net-new canonical fingerprints only
- strict response validation, normalization, and rejection of malformed payloads
- ingest metrics and samples for enrichment coverage, reuse, cache misses, and rejected outputs

## Rules
- enrichment must never mutate `canonical_products`, `canonical_product_mappings`, or deterministic marker truth
- deterministic markers remain authoritative and are read-only context for enrichment
- enrichment must be reused by canonical fingerprint whenever a cached record already exists
- malformed enrichment output must be rejected rather than partially persisted
- the schema must remain closed; no uncontrolled fields are allowed

## Success criteria
- new canonical fingerprints can be enriched once and then reused from cache
- existing canonical fingerprints avoid duplicate LLM calls
- offline runs can still reuse cached enrichments
- category selection stays inside the controlled hierarchy
- enrichment remains queryable and analytics-ready without affecting canonical grouping
