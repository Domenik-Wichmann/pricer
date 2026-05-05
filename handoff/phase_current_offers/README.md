# Compact Current Offer Read Model Handoff

Date: 2026-05-03

## Summary

This work adds a compact current-price read model for production-safe current offer display:

- `current_product_offers`
- `canonical_current_offer_summary`

The model is built from existing Phase 6 local runtime state after ingest/aggregation, not by scanning production Firestore collections from live routes.

## Runtime Behavior

- Product detail queries current offers and summary by `canonical_product_id` and returns a bounded `current_offers` array.
- `POST /prices/lookup` prefers `current_product_offers` and `canonical_current_offer_summary`.
- `POST /basket/optimize` benefits through the existing price lookup path.
- If compact offers are absent, the legacy scoped price lookup fallback remains bounded to requested canonical/source ids.
- Home top deals remain disabled for Firestore until compact deal cards are added.
- Market trends and nearest availability still need separate compact read models.

## Publication

Use collection selection to publish only the compact read model after reviewing the command:

```powershell
$env:PRICER_STORE_BACKEND='firestore'
$env:PRICER_FIRESTORE_PROJECT_ID='pricer-ee440'
$env:PRICER_FIRESTORE_DATABASE_ID='(default)'
$env:PRICER_FIRESTORE_COLLECTION_PREFIX='prod'
$env:PRICER_WORK_DIR='C:\dev\Pricer\tmp\phase6_live'
$env:ENABLE_LLM_ENRICHMENT='false'
$env:XAI_API_KEY=''
$env:PRICER_PHASE6_PUBLISH_COLLECTIONS='current_product_offers,canonical_current_offer_summary'
$env:PRICER_PHASE6_PUBLISH_SKIP_EXISTING='false'
$env:PRICER_PHASE6_PUBLISH_DRY_RUN='true'
npm run phase6:publish-firestore-latest
```

Set `PRICER_PHASE6_PUBLISH_DRY_RUN='false'` only after reviewing counts. The publisher rebuilds the latest Phase 6 local snapshot first; it does not delete Firestore data.

## Verification

- `npm run test:phase15_2`
- `npm run test:phase16_0`
- `npm run test:phase16_1`
- `npm run test:phase17_5`
- `npm run admin-web:build`
- `npm run validate:docs`

## Deploy

- Functions deployed to `https://europe-west1-pricer-ee440.cloudfunctions.net/api`
- Hosting deployed to `https://pricer-ee440.web.app`

## Remaining Limitations

- Publication was not run in this handoff.
- `current_deal_cards` was not added; home top deals stay skipped on Firestore.
- Nearest availability still needs a location-aware compact availability read model.
- Market trends still need compact trend summaries.
- Existing production stale marker/brand cleanup still requires a future re-ingest/re-publish.
