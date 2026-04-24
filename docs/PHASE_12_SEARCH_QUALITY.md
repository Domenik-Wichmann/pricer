# Phase 12 Search Quality

## Goal
Improve search accuracy with deterministic canonicalization, conservative typo correction, and synonym expansion, while keeping the main path fast and LLM-free.

## Scope
- canonical search terms
- deterministic synonym mapping
- conservative fuzzy correction
- canonical query object generation
- matcher updates that use canonical fields
- demand-log-driven synonym learning

## Rules
- deterministic first
- no LLM in the main path
- Phase 7 demand data may inform learned synonym expansion
- remain fast and cheap
- keep new records flat and SQL-compatible

## Out of scope
- semantic LLM query rewriting
- expensive per-request vector lookup
- replacing the Phase 2 matcher with a new matching stack
