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
- `current_offer_summary`

`markers` remains backward-compatible and keeps the legacy compact marker strings:
- `volume_marker`
- `count_marker`
- `age_band_marker`
- `reserve_marker`

When `canonical_attributes_json.size_marker` exists on the canonical product, product detail and search also include it as `markers.size_marker`. The structured marker preserves raw text and exposes display-safe comparable fields such as `normalized_display`, `quantity`, `unit`, `total_quantity`, `total_unit`, `pack_count`, `unit_quantity`, and `unit_quantity_unit`. Legacy marker fields are not removed or renamed.

Product detail also returns bounded provenance:
- source-product count
- canonical-mapping count
- enrichment provenance
- applied-view metadata only when the chosen layer includes it

Product search returns a backward-compatible `current_offer_summary` field on each result. The field is populated from the compact `canonical_current_offer_summary` read model for the bounded search candidate ids before pagination, so priced current products can surface in the first page without scanning all summaries. It includes current min/max/avg price, offer count, chain/retailer count, cheapest offer/retailer pointers, currency, snapshot date, and update timestamp when available; missing summaries are returned as `null`. Product search does not fall back to raw snapshots or current-offer scans.

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
- structured `markers.size_marker` is read from existing canonical attributes only; product routes do not run ingest, backfill, or marker recomputation
- search price summaries are read only from `canonical_current_offer_summary` for returned canonical ids
- enrichment remains additive only
- applied disambiguation remains a policy/view layer only
- invalid `layer_mode` values are rejected with bounded `400` responses
- missing products return bounded `404` responses

## Acceptance status
- bounded product detail, search, facet, and enrichment-summary APIs are implemented
- default product-facing layer mode is `canonical_with_enrichment`
- explicit layer handling is enforced
- analytics summary is exposed without changing ingest or canonical behavior
