# Phase 6 Incremental Catch-Up Writer Handoff

Date: 2026-05-07

## Summary

Prepared the real Phase 6 incremental writer for a first high-write catch-up run after the 2026-05-05 diff showed legitimate Billa coverage newly present relative to the baseline.

The writer remains explicit opt-in:

- Dry-run is default.
- Real writes require `PRICER_INCREMENTAL_DRY_RUN=false`.
- High-write real runs require `PRICER_INCREMENTAL_ALLOW_HIGH_WRITE_CATCHUP=true`.
- Missing/removed offers remain report-only by default.
- No Firestore deletes are performed by the writer.

## Commands

Dry-run:

```bash
npm run phase6:diff-snapshot
```

Real catch-up command, not run:

```bash
PRICER_INCREMENTAL_DRY_RUN=false PRICER_INCREMENTAL_ALLOW_HIGH_WRITE_CATCHUP=true PRICER_INCREMENTAL_EVENT_POLICY=price_promo_availability npm run phase6:diff-snapshot
```

## Verification

```bash
npm run test:phase6_incremental_ingest
```

Result: 30 passed, 0 failed, 30 total.

Recorded in `docs/test_runs/phase_6_incremental_catchup_writer_2026-05-07.json`.

## Operator Recommendation

Before the first real catch-up, run one complete dry-run with the rich baseline artifact used for the 2026-05-05 investigation and review the manifest, Billa diagnostics, estimated writes, and target collection names. If the counts still match the known Billa catch-up shape, run the real command once with `PRICER_INCREMENTAL_ALLOW_HIGH_WRITE_CATCHUP=true` and keep `PRICER_INCREMENTAL_EVENT_POLICY=price_promo_availability` unless a full audit stream is explicitly desired.
