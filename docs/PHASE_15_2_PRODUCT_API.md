# Phase 15.2 Product API

## Goal
Expose the first bounded product-facing API layer on top of Phase 15.1 reader contracts so downstream consumers can read canonical products, search with enrichment filters, browse deterministic facets, and inspect enrichment analytics without performing ad hoc joins.

## Implemented surface
- `GET /products/:id`
- `POST /products/search`
- `POST /products/filter-facets`
- `GET /analytics/enrichment-summary`

These routes are backed by explicit handler functions in `phase15/service.js` and are exported from the shared runtime entrypoint.

## Default layer behavior
- default product-facing layer mode: `canonical_with_enrichment`
- allowed layer modes:
  - `canonical_truth`
  - `canonical_with_applied_view`
  - `canonical_with_enrichment`
  - `canonical_with_applied_view_and_enrichment`
- applied disambiguation is never used unless the caller explicitly requests an applied-view layer mode

## Response contract
Product detail and product search responses return stable API-facing fields:
- `canonical_product_id`
- `canonical_name`
- `markers`
- `enrichment`
- `layer_mode`

Product detail also returns bounded provenance:
- source-product count
- canonical-mapping count
- enrichment provenance
- applied-view metadata only when the chosen layer includes it

## Filter and facet support
The product search and facet handlers support deterministic enrichment-backed filters through the Phase 15.1 reader contract, including:
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

Facets are intentionally bounded to:
- `category_l1`
- `category_l2`
- `category_l3`
- `brand`
- `base_product`
- `flavor`
- `attributes`

## Safety boundaries
- canonical truth remains immutable
- canonical ids and canonical mappings remain unchanged
- deterministic marker precedence is unchanged
- enrichment remains additive only
- applied disambiguation remains a policy/view layer only
- invalid `layer_mode` values are rejected with bounded `400` responses
- missing products return bounded `404` responses

## Acceptance status
- bounded product detail, search, facet, and enrichment-summary APIs are implemented
- default product-facing layer mode is `canonical_with_enrichment`
- explicit layer handling is enforced
- analytics summary is exposed without changing ingest or canonical behavior
