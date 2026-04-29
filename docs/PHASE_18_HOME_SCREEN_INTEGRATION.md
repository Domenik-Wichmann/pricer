Implement Phase 18.0: Mobile Home Screen Integration.

GOAL:
Wire the Flutter mobile home screen to the backend `GET /home/summary` endpoint and render a simple functional home page.

This is a functional UX prototype, not final visual polish.

CONTEXT:
Backend Phase 17.5 added:

* `GET /home/summary`

Response sections:

* `top_deals`
* `watchlist_highlights`
* `market_highlights`
* `saved_lists`
* `quick_actions`
* `generated_at`

DESIGN INTENT:
The home screen should feel simple, clean, and immediately useful.

Default section order:

1. Top Deals
2. Watchlist Highlights
3. Saved Lists
4. Market Highlights
5. Quick Actions

DO NOT:

* redesign the whole app
* add complex charts
* add advanced filters
* add animations
* add heavy state architecture
* expose internal diagnostics
* block the screen if one section is empty

FEATURES TO IMPLEMENT:

1. Home summary client
   Add a small service/client to fetch:
   `GET /home/summary`

Use existing API base URL/config patterns already in the mobile app.

2. Home screen state
   Support:

* loading
* success
* empty sections
* error with retry

3. Render sections

Top Deals:

* show first few deal cards
* display product name, price, currency, chain/store if available
* simple deal label like “Good deal”

Watchlist Highlights:

* show target hits / good deals / missing price messages
* keep compact

Saved Lists:

* show list name and item count
* tap target can be placeholder if navigation is not ready
* do not optimize automatically on home load

Market Highlights:

* show short text like “Dairy up 4.4%”
* keep small and optional

Quick Actions:

* Search products
* Optimize basket
* View watchlist

4. Empty state behavior
   If a section is empty:

* either hide it
* or show a tiny friendly empty state
  Prefer hiding empty sections unless all sections are empty.

5. Tests
   Add/update Flutter tests for:

* loading state
* renders top deals
* renders saved lists
* hides empty sections or handles them cleanly
* error/retry state
* no crash on partial response

6. Docs
   Update mobile docs / implementation notes:

* home screen now uses `/home/summary`
* section order
* known limitations
* next UI polish steps

OUTPUT FORMAT:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. home screen behavior
6. what remains for design polish/navigation

SUCCESS CRITERIA:

* Flutter home screen fetches `/home/summary`
* sections render safely
* app does not crash on empty/partial responses
* no backend behavior changes
* tests pass

IMPLEMENTATION NOTES - 2026-04-24:

Completed:

* `QueryApiClient.getHomeSummary(...)` fetches `GET /home/summary` with `x-pricer-owner-id` and `x-pricer-owner-type` headers.
* `HomeSummary` DTOs parse top deals, watchlist highlights, saved-list shortcuts, market highlights, quick actions, and `generated_at`.
* `HomeScreen` loads the feed on startup, shows a skeleton while pending, uses the existing error card with retry on failure, hides empty dynamic sections, and renders quick actions when provided.
* Section order follows the contract: Top Deals, Watchlist Highlights, Saved Lists, Market Highlights, Quick Actions.
* No backend behavior changed in Phase 18.

Known limitations:

* Quick-action taps currently show placeholder feedback only; deep navigation to search, basket optimization, and watchlist views remains a UI integration follow-up.
* Section copy is functional prototype copy and should be localized/polished in a later design pass.
* Cards are intentionally compact and chart-free; richer market visuals are deferred.
