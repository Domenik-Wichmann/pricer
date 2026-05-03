# Production Firestore Runtime Hardening Handoff

Date: 2026-05-03

## Summary

Hardened the live Firebase/Firestore backend so normal product/search/shopping/list/watchlist paths avoid prototype-style full-store reads and writes against KolkoStruva-scale `prod_` data.

## Files Changed

- `functions/src/phase1/store.js` and `app/functions/src/phase1/store.js`
- `functions/src/phase15/service.js` and mirrored app file
- `functions/src/phase15/shopping_list.js` and mirrored app file
- `functions/src/phase16/price_lookup.js` and mirrored app file
- `functions/src/phase17/saved_lists.js`, `watchlist.js`, `home_summary.js`, `market_trends.js` and mirrored app files
- `functions/src/phase18/gap_detection.js` and mirrored app file
- `functions/src/phase3_5/service.js` and mirrored app file
- `functions/src/phase6/saved_user_locations.js`, `location_availability.js` and mirrored app files
- `functions/index.js`, `functions/src/index.js`, and `app/functions/src/index.js`
- Tests and docs listed in the test run artifact.

## Verification

See `docs/test_runs/production_firestore_runtime_hardening_2026-05-03.json`.

All targeted tests passed. No heavy Firestore publisher or ingest was run.

## Remaining Work

- Deploy Functions and run live smoke tests against `https://europe-west1-pricer-ee440.cloudfunctions.net/api`.
- Build compact production read models for home top deals, market trends, and nearest availability.
- Continue migrating legacy `/query`, `/optimize-basket`, Phase 7 demand, Phase 9 source-product watchlist intelligence, and Phase 10 entitlement handlers away from full-store load/save.
