# Phase 6 Historical Ingest Admin Foundation Handoff

Date: 2026-05-03

## Summary

Added the safe foundation for historical KolkoStruva ZIP ingest:

- one-date CLI: `npm run phase6:ingest-snapshot`
- Admin Console Ingest / Data Jobs page
- `admin_ingest_jobs` metadata model
- internal ingest planning/job endpoints that do not run ZIP ingest synchronously
- production safety map for historical archive vs current read-model vs catalog writes

No heavy historical ingest was run against production and no Firestore deletes were performed.

## Safe Defaults

The historical CLI defaults to dry-run and targets only:

- `raw_price_snapshots`
- `product_daily_prices`
- `ingest_runs`
- `pipeline_logs`

Current read models are not published by default:

- `current_product_offers`
- `canonical_current_offer_summary`

## Commands Verified

```powershell
npm run test:phase6_historical_ingest
npm run admin-web:build
```

## Operator Dry-Run Example

```powershell
$env:PRICER_SNAPSHOT_DATE="2026-04-21"; $env:PRICER_SNAPSHOT_ZIP_PATH="C:\dev\Pricer\data_samples\phase6_snapshot_2026-04-21.zip"; $env:PRICER_STORE_BACKEND="firestore"; $env:PRICER_FIRESTORE_PROJECT_ID="pricer-ee440"; $env:PRICER_FIRESTORE_DATABASE_ID="(default)"; $env:PRICER_FIRESTORE_COLLECTION_PREFIX="prod"; $env:PRICER_PHASE6_PUBLISH_DRY_RUN="true"; $env:PRICER_PHASE6_PUBLISH_COLLECTIONS="raw_price_snapshots,product_daily_prices,ingest_runs,pipeline_logs"; $env:ENABLE_LLM_ENRICHMENT="false"; $env:XAI_API_KEY=""; npm run phase6:ingest-snapshot
```

## Remaining Limitations

- No Cloud Tasks / queue worker yet.
- No Cloud Storage upload flow yet.
- Admin auth is still a future phase.
- Catalog/canonical writes for old snapshots remain explicitly targeted operator work, not the default.
