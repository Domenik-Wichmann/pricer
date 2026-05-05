# Phase 6 Bad Product Ingest Guardrails Handoff

Date: 2026-05-05

## Summary

Root-caused malformed canonical/source products to upstream Lidl CSV rows containing unescaped quotes inside product-name fields. The Phase 6 parser recovered permissively, joined later physical CSV rows into one logical row, and ingest accepted the chunk because required fields were merely non-empty.

## Changes

- Added parser row metadata for malformed quote placement and column-count mismatches.
- Added `phase6/product_validation.js` in both backend trees.
- Rejected malformed source rows before raw/source/canonical/mapping/current-offer creation.
- Added `valid` / `warning` / `suspicious` / `invalid` quality status. Quote-only brand names are warnings; only invalid records are quarantinable and runtime-excluded.
- Logged rejected rows with reasons and samples.
- Excluded unsafe existing products from current-offer generation/loaders, product search, and enrichment pilot selection.
- Added `npm run phase6:audit-bad-products` for dry-run Firestore audits and explicit no-delete quarantine marking of invalid/quarantinable `canonical_products` and `source_products`.
- Quarantine mode writes only additive marker fields and reports affected `current_product_offers` / `canonical_current_offer_summary` counts without rewriting or deleting those derived collections.

## Verification

- `npm run test:phase6`: 86 passed, 0 failed.
- `npm run test:phase15_2`: 25 passed, 0 failed.
- `npm run test:phase15`: 18 passed, 0 failed.
- `npm run test:phase16_0`: 12 passed, 0 failed.

## Local Evidence

Read-only local scan:

- `tmp/phase6_real/2026-04-21.zip`, `Лидл България_131071587.csv`, row 440 includes the `Krina; Бял боб` malformed quote/multi-row chunk shape.
- `tmp/phase6_live/2026-05-04.zip`, same Lidl entry still contains the malformed quote pattern.

## Operator Actions

1. Run the dry-run audit against production:
   `npm run phase6:audit-bad-products`
2. Review `invalid_count` / `quarantinable_count` and affected read-model counts before any write.
3. If approved, run the same command with `PRICER_PHASE6_BAD_PRODUCT_QUARANTINE_DRY_RUN=false` and `PRICER_PHASE6_BAD_PRODUCT_QUARANTINE_CONFIRM=mark-invalid-products-no-delete`.
4. Do not delete Firestore data.
5. Do not rewrite current-offer read models until a separate reviewed rebuild plan exists.
