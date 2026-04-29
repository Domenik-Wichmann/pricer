# Next Phase Readiness

## Ready now
- Watchlist recurrence, cooldown-aware nudges, target-price handling, and summaries are available as deterministic backend services.
- Daily and weekly watchlist-intelligence jobs are implemented.
- Summary, insights, and target-price request handlers are implemented.
- No ingest or LLM changes were introduced.

## Constraints to preserve
- Keep watchlist intelligence deterministic and low-spam.
- Keep recurring detection and nudge evaluation built on existing daily price and alert data.
- Keep new watchlist records flat and SQL-compatible.

## Remaining gap
- Live production verification still needs deployed jobs and live watchlist traffic.

## Recommended next focus
1. Wire the watchlist-intelligence handlers into the deployed API surface.
2. Run the daily and weekly jobs on live data.
3. Validate cooldown behavior and summary usefulness with real watchlist traffic.
