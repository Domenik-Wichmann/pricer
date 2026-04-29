# Phase 17.5 Implementation Contract

## Runtime modules
- `app/functions/src/phase17/home_summary.js`
- `functions/src/phase17/home_summary.js`
- `app/functions/src/index.js`
- `functions/src/index.js`
- `functions/index.js`

## API
- `GET /home/summary`

## Safety boundaries
- No data mutation.
- No saved-list optimization during home summary generation.
- No external services.
- No internal basket health, analytics, or pipeline diagnostics in the response.
- Owner-scoped data must use the existing temporary owner-header behavior.

## Composition sources
- Phase 16 canonical price lookup
- Phase 17.3 deal detection
- Phase 17.2 watchlist price view
- Phase 17 saved lists
- Phase 17.4 market trends
