# Phase 15 Implementation Contract

## Goal
Implement a hyper-rich enrichment layer that is additive to canonical truth, cache-first by canonical fingerprint, and strict enough to support future filtering, recommendations, and analytics.

## Runtime shape

### `canonical_enrichment_store`
- `canonical_fingerprint`
- `enrichment`
- `explicit_claim_evidence`
- `model_name`
- `prompt_version`
- `created_at`

`canonical_fingerprint` is the stable key for reuse. In the current repo implementation it is the canonical product fingerprint already represented by `canonical_product_id`.

## Enrichment schema
- `base_product`
- `category_l1`
- `category_l2`
- `category_l3`
- `category_l4`
- `brand`
- `product_line`
- `flavor`
- `attributes`
- `diet_tags`
- `allergens`
- `product_form`
- `packaging`
- `usage_context`
- `quality_tier`
- `confidence`

## Controlled values
- `category_l1` must come from the repo-owned top-level hierarchy
- `category_l2` and `category_l3` must be valid descendants of the selected higher level
- `category_l4`, `product_form`, `packaging`, and `quality_tier` remain controlled optional sets
- arrays must contain normalized string values only
- diet/attribute claims are normalized through the Phase 15 controlled vocabulary documented in `docs/DIET_ATTRIBUTE_NORMALIZATION.md`; deterministic evidence is stored outside the strict `enrichment` object as `explicit_claim_evidence`

## Ingest contract
1. Run deterministic source enrichment as before.
2. Build canonical products and canonical mappings as before.
3. For each canonical fingerprint:
   - reuse `canonical_enrichment_store` if present
   - otherwise request enrichment only for that net-new fingerprint
   - validate and normalize the result strictly before storing
4. Attach enrichment metrics and samples to ingest output and ingest-run logs.
5. Do not alter canonical grouping, canonical ids, mappings, or marker logic.

## Safety rules
- no schema drift
- no uncontrolled fields
- no marker overrides
- no duplicate LLM calls for already cached canonical fingerprints
- no failure of canonical ingest just because enrichment is unavailable or rejected

## Acceptance status in this repo
- implemented with strict schema validation and normalization
- implemented with cache-first additive persistence
- implemented with optional LLM calling and offline cached reuse
- implemented with tests proving grouping safety and category enforcement
