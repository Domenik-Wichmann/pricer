# Next Phase Readiness

Phase 20.2 is ready for follow-on market opportunity work.

## Good Next Targets

- Opportunity reports that combine locality, chain, and price-pressure signals.
- Merchant-facing dashboards over chain coverage and persistent local gaps.
- Time-series change detection for whether a chain is improving or worsening coverage.
- Better chain/store naming cleanup once source ingest normalization is richer across retailers.

## Known Boundaries

- Chain/store context is optional and may remain null for some signals.
- Coverage-by-chain reflects observed demand resolution signals, not audited shelf assortment.
- Store segmentation currently relies on the repo's existing deterministic locality-plus-store-name convention where available.
