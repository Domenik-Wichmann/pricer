# Phase 15.2 Implementation Contract

## Goal
Build the first API-facing consumer on top of the Phase 15.1 reader layer while preserving the explicit boundaries between canonical truth, applied disambiguation, and additive enrichment.

## Runtime modules
- `app/functions/src/phase15/service.js`
- `functions/src/phase15/service.js`
- `functions/index.js`

## Handler contract
The Phase 15.2 service module exposes:
- `handleGetCanonicalProductRequest(...)`
- `handleSearchCanonicalProductsRequest(...)`
- `handleCanonicalProductFilterFacetsRequest(...)`
- `handleGetEnrichmentAnalyticsSummaryRequest(...)`

The shared runtime also exports:
- `DEFAULT_PRODUCT_LAYER_MODE`
- `FACET_FIELDS`

## Route contract
- `GET /products/:id`
  - default layer: `canonical_with_enrichment`
  - optional `layer_mode` query override
- `POST /products/search`
  - body-driven query plus deterministic enrichment filters
  - safe `limit` and `offset` bounds
- `POST /products/filter-facets`
  - deterministic facet counts over the current filtered set
- `GET /analytics/enrichment-summary`
  - lightweight category, brand, base-product, flavor, and coverage rollups

## Layer rules
- do not silently upgrade layer selection
- reject invalid layer values
- keep applied-view behavior explicit
- do not leak persistence-specific store shapes

## Verification targets
- product detail response shape
- search response shape and default layer
- invalid layer rejection
- deterministic enrichment filtering
- deterministic facet counts
- analytics rollups
- no canonical mutation
- applied-view access only when explicitly requested
