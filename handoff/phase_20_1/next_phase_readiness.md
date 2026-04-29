# Next Phase Readiness

Phase 20.1 is ready for follow-on market intelligence work.

## Good Next Targets

- Store-level or chain-level gap segmentation on top of locality context.
- Trend deltas over time so analysts can see whether a local gap is persistent or emerging.
- Merchant-facing or analyst-facing dashboards over the existing deterministic summaries.
- Geographic clustering once locality normalization and coverage are mature enough.

## Known Boundaries

- `locality_code` is nullable and only as good as the request or owner context available at capture time.
- Locality summaries describe unmet or weakly matched demand signals, not confirmed inventory gaps.
- Pricing pressure still uses the current category-relative baseline from captured signals, not a richer market baseline yet.
