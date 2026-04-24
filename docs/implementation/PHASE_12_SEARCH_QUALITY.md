# Phase 12 Implementation

## Contract
Phase 12 extends matching quality without changing Phase 1 through 11 identity or ingest behavior.

## Required storage
### `canonical_terms`
- `term_id`
- `term_type`
- `locale`
- `canonical_value`
- `normalized_value`
- `category_hint`
- `product_type_hint`
- `source`
- `confidence`
- `active`
- `created_at`
- `updated_at`

### `synonym_map`
- `synonym_id`
- `synonym_text`
- `normalized_synonym_text`
- `canonical_term_id`
- `canonical_value`
- `match_scope`
- `relation_type`
- `confidence`
- `source`
- `active`
- `category_hint`
- `product_type_hint`
- `created_at`
- `updated_at`

## Required behavior
- build a deterministic canonical query object before candidate filtering
- normalize text consistently
- apply conservative fuzzy correction only when one best token match is clearly better than alternatives
- expand configured synonyms into canonical tokens
- allow Phase 7 demand aggregates to learn high-confidence typo synonyms
- keep learned synonym creation idempotent

## Matcher integration
- candidate filtering should use canonical expanded tokens when present
- scoring should use corrected canonical input and canonical term matches
- no LLM should be introduced into the main path

## Verification expectations
- typo handling
- synonym mapping
- canonical query generation
- demand-log-driven learning
- no regressions in existing Phase 2 tests
