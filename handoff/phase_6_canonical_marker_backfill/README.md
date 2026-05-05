# Phase 6 Canonical Marker Backfill Handoff

Date: 2026-05-05

## Summary

Added a canonical-only Firestore backfill for existing production canonical products:

```powershell
npm run phase6:backfill-canonical-markers
```

The command defaults to dry-run. It scans `canonical_products`, recomputes deterministic Phase 6 marker/brand/product-type hints from stored canonical display/source-example text, and patches only changed docs in real-run mode. Version `phase6_canonical_marker_backfill_v2` also writes structured `canonical_attributes_json.size_marker` data with raw text, normalized quantity/unit, package totals, and display-safe strings.

## Safety Boundaries

- Allowed: `prod_canonical_products`
- Conditional read/patch: matching `prod_canonical_enrichment_store` doc only when safe brand cleanup is planned
- Forbidden: `raw_price_snapshots`, `source_products`, `current_product_offers`, `product_daily_prices`, `canonical_product_mappings`
- Never changes `canonical_product_id`, `canonical_product_key`, mappings, offers, raw rows, or history rows
- No LLM enrichment and no full Phase 6 ingest/publisher

## Verification

- `node --check scripts/backfill_canonical_markers_firestore.js` passed
- `npm run test:phase6_canonical_backfill` passed: 14 passed, 0 failed
- `npm run test:phase6` passed
- `npm run test:phase15_1` passed
- `npm run test:phase15_2` passed

Limited production dry-run:

```powershell
$env:PRICER_FIRESTORE_PROJECT_ID='pricer-ee440'
$env:PRICER_FIRESTORE_DATABASE_ID='(default)'
$env:PRICER_FIRESTORE_COLLECTION_PREFIX='prod'
$env:PRICER_BACKFILL_DRY_RUN='true'
$env:PRICER_BACKFILL_LIMIT='100'
$env:PRICER_BACKFILL_PROGRESS_EVERY='50'
npm run phase6:backfill-canonical-markers
```

Result: 100 scanned, 86 changed candidates, 14 unchanged, 0 actual writes, 0 failed writes, and no forbidden collections touched.

## Operator Next Steps

1. Run a full dry-run without `PRICER_BACKFILL_LIMIT`.
2. Review field-change counts and examples in `tmp/backfill_logs/canonical_marker_backfill_latest.json`.
3. Approve the real run only if examples look conservative.
4. After real run, inspect Admin Console Product Detail and Product Search for Aptamil/Ganchev examples, checking brand, `volume_marker`, `age_band_marker`, `size_marker.normalized_display`, package totals, and product type.
