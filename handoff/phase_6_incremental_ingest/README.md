# Phase 6 Incremental Ingest Diff Foundation Handoff

Date: 2026-05-05

## Summary

Added the safe dry-run foundation for daily latest KolkoStruva incremental updates:

- deterministic `current_offer_fingerprints`
- planned `offer_change_events`
- planned `snapshot_manifests`
- pure diff categories for unchanged/new/price/promo/metadata/missing offers
- `npm run phase6:diff-snapshot` and `npm run phase6:daily-incremental-dry-run`
- `npm run phase6:export-current-offer-fingerprints`
- guarded `npm run phase6:backfill-current-offer-fingerprints`
- Admin Console incremental dry-run command preview

No heavy production ingest/publish was run, no Firestore data was deleted, and the real incremental writer was deferred.

## Safe Defaults

The new diff command writes nothing. For full production-scale diffs, prefer a local/exported fingerprint baseline through:

```powershell
$env:PRICER_INCREMENTAL_BASELINE_PATH="C:\dev\Pricer\runtime_data\prod_current_offer_fingerprints.jsonl"
```

Without a baseline, use `PRICER_INCREMENTAL_LIMIT` for samples. A full direct Firestore compare can require one read per incoming offer and requires explicit `PRICER_INCREMENTAL_ALLOW_FIRESTORE_DIRECT_COMPARE=true`.

## Commands Verified

```powershell
npm run test:phase6_incremental_ingest
npm run test:phase6_historical_ingest
```

Latest focused result after baseline export work: `npm run test:phase6_incremental_ingest` reports 14 passed, 0 failed.

## Operator Dry-Run Example

```powershell
$env:PRICER_SNAPSHOT_DATE="2026-05-05"; $env:PRICER_SNAPSHOT_URL="https://kolkostruva.bg/opendata_files/2026-05-05.zip"; $env:PRICER_FIRESTORE_PROJECT_ID="pricer-ee440"; $env:PRICER_FIRESTORE_DATABASE_ID="(default)"; $env:PRICER_FIRESTORE_COLLECTION_PREFIX="prod"; $env:PRICER_INCREMENTAL_DRY_RUN="true"; $env:PRICER_INCREMENTAL_PROGRESS_EVERY="10000"; npm run phase6:diff-snapshot
```

Baseline export:

```powershell
$env:PRICER_FIRESTORE_PROJECT_ID="pricer-ee440"; $env:PRICER_FIRESTORE_DATABASE_ID="(default)"; $env:PRICER_FIRESTORE_COLLECTION_PREFIX="prod"; $env:PRICER_INCREMENTAL_BASELINE_OUTPUT_PATH="C:\dev\Pricer\runtime_data\prod_current_offer_fingerprints.jsonl"; $env:PRICER_INCREMENTAL_PROGRESS_EVERY="10000"; npm run phase6:export-current-offer-fingerprints
```

## Remaining Limitations

- No real incremental writer yet.
- Fingerprint baseline export is available; collection backfill remains guarded and dry-run-first.
- Removed/missing offers are reported but not marked unavailable.
- A complete no-1M-read production diff depends on a backfilled/exported `current_offer_fingerprints` baseline.
