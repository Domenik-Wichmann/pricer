# Next Phase Readiness

## Ready now
- Effective decisions can be evaluated into a reversible applied view.
- Merge, distinct, uncertain, missing, and hard-conflict outcomes are audited.
- Controlled apply mode can produce an `applied_grouping_map`.
- Ingest produces a dry-run disambiguation application preview.
- Canonical products, mappings, source identity, and dedupe behavior remain unchanged.

## Constraints to preserve
- Keep deterministic hard conflicts authoritative.
- Keep canonical truth immutable unless a future phase explicitly changes the data model.
- Keep all downstream consumers explicit about whether they read canonical truth or the applied view.

## Recommended next focus
1. Add reporting around applied-view counts from real archive runs.
2. Define a safe downstream read contract for applied views.
3. Keep `uncertain` decisions as no-op until a human resolves them.
