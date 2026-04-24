# Phase 15.1 Implementation Contract

## Goal
Expose canonical enrichment to downstream code through explicit reader contracts, deterministic filters, and lightweight analytics while preserving the additive architecture introduced in Phase 15.

## Reader contract

### Supported layer selections
- `canonical_truth`
- `canonical_with_applied_view`
- `canonical_with_enrichment`
- `canonical_with_applied_view_and_enrichment`

### Reader helpers
- `getCanonicalProductViewById(...)`
- `listCanonicalProductViews(...)`
- `searchCanonicalProductViews(...)`

Each helper must return a stable structured view with explicit sections:
- `canonical_truth`
- `canonical_mappings`
- `applied_view`
- `enrichment`
- `enrichment_provenance`

Helpers must not silently pull enrichment fields into truth-only views.

## Filter contract
- enrichment filters are valid only when the selected layer includes enrichment
- supported deterministic filters include:
  - `category_l1`
  - `category_l2`
  - `category_l3`
  - `category_l4`
  - `brand`
  - `base_product`
  - `flavor`
  - `attributes`
  - `diet_tags`
  - `usage_context`
  - `allergens`
  - `product_form`
  - `packaging`
  - `quality_tier`
  - `confidence_gte`

## Analytics contract
- `buildCanonicalEnrichmentAnalytics(...)` returns:
  - enrichment coverage stats
  - rollups by category, brand, base product, and flavor
  - ingest-run enrichment summary fields if present

## Live-enrichment enablement
- intended runtime config defaults to `ENABLE_LLM_ENRICHMENT=true`
- actual live calls still require `XAI_API_KEY`
- missing `XAI_API_KEY` must not fail ingest
- cache-first reuse remains mandatory

## Acceptance status in this repo
- explicit reader layer combinations implemented
- deterministic enrichment filters and search implemented
- lightweight enrichment analytics implemented
- live enrichment default intent updated in runtime logic and config examples
- non-fatal missing-key behavior verified with tests
