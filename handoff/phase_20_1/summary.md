# Phase 20.1 Locality-Aware Gap Intelligence Handoff

Date: 2026-04-25

## Summary

Implemented locality-aware gap segmentation on top of the existing Phase 20 market-gap engine.

Signals now carry nullable `locality_code` context when it is available from search, shopping-list/basket flows, or watchlist owner context. The gap engine can summarize one locality directly or roll up top gaps across all localities without changing the original global summary behavior.

## Boundaries

- No LLMs or external data were added.
- Gap writes remain observation-only and non-blocking.
- Existing global gap detection still works without locality input.
- Locality output reflects captured demand context, not verified merchant inventory truth.
