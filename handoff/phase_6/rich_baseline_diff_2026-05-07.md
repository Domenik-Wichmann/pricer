# Phase 6 Rich Baseline Diff Handoff

Date: 2026-05-07

## Scope

- Added local-only rich current-offer baseline export mode.
- Added rich baseline replacement/churn diagnostics and Billa-specific reporting.
- Reran the 2026-05-05 incremental dry-run using a full rich JSONL baseline.
- Did not implement or run the real writer.
- Did not write or delete Firestore data.

## Commands

```powershell
npm run test:phase6_incremental_ingest
npm run validate:docs
```

Read-only production diagnostics:

```powershell
$env:PRICER_INCREMENTAL_BASELINE_MODE='rich'
node --max-old-space-size=8192 scripts/export_phase6_current_offer_fingerprints.js

$env:PRICER_SNAPSHOT_DATE='2026-05-05'
$env:PRICER_INCREMENTAL_BASELINE_PATH='C:\dev\Pricer\runtime_data\prod_current_offer_fingerprints_rich_2026-05-07.full.jsonl'
npm run phase6:diff-snapshot
```

The final rich export was chunked locally in 100k-row reads to avoid interrupted JSONL output.

## Results

- Rich baseline rows: 1,321,726
- Snapshot imported rows: 1,374,713
- Snapshot current offers: 1,363,939
- New offers: 207,338
- Changed offers: 55,901
- Unchanged offers: 1,100,700
- Missing/removed offers: 165,125
- Billa new offers: 176,205
- Billa missing offers: 0
- Billa likely replacements: 0
- Overall likely same-real-offer/new-id pairs: 44,912

## Recommendation

Keep the real incremental writer deferred. The Billa spike is not explained by old Billa rows disappearing under new `source_product_id`s in this rich-baseline run; it looks like Billa is absent from the old current baseline and newly present in the 2026-05-05 snapshot. Before enabling writes, inspect why the old current-offer baseline has no Billa missing side and validate the source snapshot cadence/retailer coverage boundary.
