# Phase 15.3 Implementation Contract

## Goal
Provide the bridge between raw user shopping-list intent and later basket planning by ranking canonical product candidates through the Phase 15.2 product-service surface.

## Runtime modules
- `app/functions/src/phase15/shopping_list.js`
- `functions/src/phase15/shopping_list.js`
- `functions/index.js`

## Core exports
- `resolveShoppingListItems(...)`
- `handleResolveShoppingListItemsRequest(...)`

## Route contract
- `POST /shopping-list/resolve`
  - accepts string items or `{ text }` objects
  - defaults to `canonical_with_enrichment`
  - supports explicit layer override using the existing Phase 15.2 layer modes

## Internal reuse
This phase reuses the existing product-service catalog search path through:
- `searchCanonicalProductCatalog(...)`
- shared layer-mode validation from Phase 15.2
- shared canonical product list-item shaping

## Resolution policy
- deterministic text normalization and tokenization
- lightweight query parsing for volume and count markers
- bounded ranking reasons
- centralized thresholds for candidate confidence and final item status

## Verification targets
- exact/simple item resolve
- ambiguity behavior
- unresolved behavior
- ranking reasons present
- `limit_per_item` respected
- invalid layer rejection
- empty request rejection
- string and object item shapes accepted
- no canonical or enrichment mutation
