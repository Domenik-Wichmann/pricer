# Phase 18.4 Next Phase Readiness

Phase 18.4 is ready for the next mobile phase.

## Ready

- Home search opens a real `/search` screen.
- `/search` consumes the existing product catalog endpoint.
- Product result cards navigate to the real `/product` screen.
- Missing query, empty results, API error, retry, and partial result payloads are covered.

## Remaining For Filters And Facets

- Add filter/facet controls backed by the existing product facet endpoint.
- Add sort controls if/when backend search ranking exposes sortable options.
- Add pagination or incremental loading beyond the current first page.
- Decide whether deal/best-price decorations should be hydrated by a separate deal-check call for search results.

## Remaining For Optimize Screen

- Replace `/optimize` placeholder with a basket draft screen.
- Decide when draft basket items should call resolver/planner/optimizer.
- Keep optimization behind explicit user action rather than running on every home add-to-basket navigation.
