# Phase 20.4 Merchant / Admin Insights API Handoff

Date: 2026-04-25

## Summary

Implemented the merchant/admin insights API over existing Phase 20 analytics.

The backend now exposes dashboard-ready insight helpers and HTTP endpoints for overview cards, top opportunities, category rollups, locality rollups, and chain rollups. These reads compose Phase 20 gap signals and Phase 20.3 opportunity reports without changing the lower-level analytics endpoints.

## Boundaries

- No UI was added.
- No LLMs.
- No external service calls.
- No new persistence.
- No mutation of `gap_signal_store`.
- No mutation of canonical, enrichment, price, saved-list, watchlist, or user data.
- Insights remain internal/admin analytics, not consumer-facing app UI.
