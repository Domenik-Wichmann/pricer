# PHASE 13 IMPLEMENTATION

## Phase
`PHASE_13_CROSS_CHAIN_CANONICALIZATION`

## Goal
Add a deterministic, conservative cross-chain canonical product layer above the existing source-product and chain-plus-product-code identity layers without rewriting business logic.

## Scope
- deterministic canonical product keys built from enriched product attributes
- flat canonical product persistence
- flat source-to-canonical mapping persistence
- canonical merge diagnostics, review samples, and warning logs
- no embeddings or LLM usage in the canonicalization path

## Important repo-truth rules
- `source_product_id` remains the stable source identity.
- chain-plus-product-code dedupe remains the pre-enrichment runtime optimization layer.
- cross-chain canonicalization is additive and may under-group when signals are incomplete.
- warning logs are diagnostics only and must not block ingest.

## Runtime contract

### Canonicalization
- Input unit is one chain-level dedupe representative with its deterministic enrichment metadata.
- Canonical keys must be deterministic and conservative.
- Canonical products and mappings must remain flat and Firestore-safe.
- Mapping records must remain stable across reruns for unchanged source products.

### Diagnostics
- Ingest results include canonical product counts and a sample of canonical groups.
- Potential over-canonicalization is surfaced through warning logs rather than hard failures.

## Acceptance status in this repo
- Implemented and locally verified:
  - deterministic cross-chain canonical product grouping
  - flat `canonical_products` and `canonical_product_mappings`
  - canonical counts, samples, and warning logs in ingest diagnostics
  - conservative non-merge behavior for obvious size and variant differences
- Still operator-bound:
  - review of warning-heavy canonical groups from real archive runs
  - downstream product UX and analytics adoption of the new canonical layer
