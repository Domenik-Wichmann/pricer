# Phase 20.6 Internal Insights Dashboard Stub - Implementation Notes

Date: 2026-04-26

## Scope

Phase 20.6 adds a simple internal HTML dashboard shell for visually inspecting Phase 20 market-intelligence outputs.

This is not a merchant-facing product UI. It does not add billing, merchant scopes, exports, persistence, or new analytics calculations.

## Route

`GET /internal/insights/dashboard`

The route serves a no-store HTML response. The page shell itself is not token-guarded because it contains no market data and no embedded token. All data calls still go through the Phase 20.5 guarded APIs.

## Data Endpoints Used

- `/analytics/insights/overview`
- `/analytics/insights/opportunities`
- `/analytics/insights/categories`
- `/analytics/insights/localities`
- `/analytics/insights/chains`

The browser sends:

- `x-pricer-admin-token`
- `x-pricer-role`

## UI Surface

The dashboard includes:

- token input
- role selector
- window selector
- limit, locality, category, and chain filters
- refresh and clear-token controls
- overview cards
- top opportunities table
- category table
- locality table
- chain table

Token storage is browser-local through `localStorage`. The backend does not persist dashboard tokens and the HTML does not embed a token value.

## Boundaries

- Internal only.
- Simple table/card layout.
- No external assets.
- No billing or merchant copy.
- No analytics logic changes.
- No data mutation.

## Verification

Covered by `tests/phase_20_6_internal_insights_dashboard.test.js`:

- HTML shell rendering
- all insights endpoints referenced
- token and role headers used
- no embedded token value
- browser-local token controls
- section targets present
- shell route outside protected path list while data endpoints remain guarded
- no-store HTML response
- no merchant billing/product positioning copy
