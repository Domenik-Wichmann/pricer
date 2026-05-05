# Phase 6 Bad Product Ingest Guardrails

Last updated: 2026-05-05

## Root Cause

A malformed KolkoStruva CSV row from `Лидл България_131071587.csv` can contain an unescaped double quote inside the product-name field, for example:

```text
"56784","143 - Пловдив/бул.Пещерско шосе153","Krina;" Бял боб (ОНТ 400)","7208918","46","1.84",""
```

This is upstream malformed CSV. The quote after `Krina;` is not escaped as CSV requires. The Phase 6 streaming parser then treated later quotes as quote-state transitions and could join many physical store rows into one logical row. Because ingest validation only checked that required fields were non-empty, the combined chunk could become:

```text
raw_price_snapshots -> source_products -> source_product_enrichment
  -> canonical_products -> canonical_product_mappings -> current_product_offers
```

The observed product shape, with beans, baby puree, bread, cigarettes, ham, water, shampoo, Colgate, coffee, store addresses, product codes, prices, and line breaks in one name, matches this parser recovery failure. The deterministic canonical parser then inferred nonsensical fields from the chunk, such as a bean-like brand and a pastry-sheets product type.

## Evidence

Local cached ZIP scan, read-only:

```text
tmp/phase6_real/2026-04-21.zip
  entry: Лидл България_131071587.csv
  row: 440
  sample starts: Krina; Бял боб (ОНТ 400),7208918,46,1.84,...

tmp/phase6_live/2026-05-04.zip
  entry: Лидл България_131071587.csv
  same malformed source pattern still appears
```

The parser handles standard quoted delimiters and quoted newlines as CSV, but malformed quote placement was previously permissive. Semicolon/comma delimiter selection was not the root cause for the bad canonical product; these Lidl files are comma-delimited and were detected as comma-delimited. The failure was an unescaped quote inside a comma-delimited product-name field plus missing ingest-time product validation.

## Policy

Phase 6 ingest rejects rows before any source or canonical product creation when product/source identity fields contain:

- embedded newline or carriage return
- excessive product-name length
- too many delimiters
- multiple CSV-row-looking fragments
- store/address fragments inside a product name
- repeated product-code/category/price fragments
- quote-placement parser diagnostics
- invalid source product/category code shapes
- obvious multi-product chunks

Rejected rows increment `malformed_rows`, write `ingest_malformed_row` pipeline logs with `malformed_reasons`, `malformed_sample`, and parser metadata, and are excluded from all downstream source, canonical, mapping, offer, search, and enrichment paths.

Normal long Bulgarian product names remain valid when they do not contain row fragments, line breaks, raw quote fragments, or code/price/address chunks.

## Severity Levels

Product quality checks now return:

- `valid`: no quality concerns.
- `warning`: noteworthy but not suspicious. Quote-only brand-style names such as `КРАВЕ СИРЕНЕ САЛАКИС "ПРЕЗИДЕНТ"` belong here.
- `suspicious`: deserves review, but is not automatically quarantinable. Examples include too many delimiters without row-fragment evidence.
- `invalid`: corrupted or unsafe product identity. These are quarantinable candidates after operator review.

Severity rules:

- Quote fragments alone are `warning`.
- Embedded newlines are `invalid` unless later explicit safe parsing is implemented.
- Store/address fragments are `invalid`.
- CSV row-value fragments are `suspicious`, and become `invalid` when combined with stronger row-corruption evidence.
- Multiple CSV row fragments are `invalid`.
- `too_long` plus `too_many_delimiters` is `invalid`.
- `too_many_delimiters` alone is `suspicious`.

Only `invalid` records are excluded from runtime search, enrichment pilot selection, and current-offer reads. Only `invalid` records are `quarantinable`.

## Runtime Protection

Until production cleanup is reviewed and approved:

- `buildCurrentOfferReadModel` excludes unsafe source/canonical names.
- Current-offer scoped loaders filter existing unsafe offer rows.
- Phase 15 product search readers filter unsafe canonical products.
- Phase 15 enrichment pilot selection filters unsafe canonical products.

These protections are secondary to ingest prevention and are intentionally deterministic.

## Dry-Run Audit

Use the report-only command below to scan existing Firestore product records. It writes nothing, deletes nothing, and does not quarantine records.

```powershell
$env:PRICER_FIRESTORE_PROJECT_ID="..."
$env:PRICER_FIRESTORE_COLLECTION_PREFIX="prod"
$env:PRICER_PHASE6_BAD_PRODUCT_AUDIT_LIMIT="1000" # optional
$env:PRICER_PHASE6_BAD_PRODUCT_AUDIT_OUTPUT="tmp/phase6_bad_product_audit.json" # optional
npm run phase6:audit-bad-products
```

Default scanned collections:

- `canonical_products`
- `source_products`

The report separates `warning_count`, `suspicious_count`, `invalid_count`, and `quarantinable_count`, and each finding includes `quality_status` plus `quarantinable`.

Cleanup remains a separate operator-reviewed phase. The approved cleanup plan should start from the dry-run report, identify affected `source_product_id` and `canonical_product_id` values, then propose a no-delete quarantine or exclusion marker. Production records must not be deleted or quarantined automatically.

## No-Delete Quarantine

After a reviewed dry-run audit, invalid records can be marked without deleting or rewriting product truth. Quarantine mode only updates `canonical_products` and `source_products` records that the same validator reports as:

- `quality_status = "invalid"`
- `quarantinable = true`

Warning-only quote-fragment records are never quarantined.

The marker fields are additive:

```json
{
  "data_quality_status": "invalid",
  "data_quality_reasons": ["contains_newline"],
  "data_quality_sample": "short report sample",
  "quarantined_at": "2026-05-05T00:00:00.000Z",
  "quarantine_source": "phase6_bad_product_audit_v1"
}
```

Dry-run remains the default:

```powershell
$env:PRICER_FIRESTORE_PROJECT_ID="..."
$env:PRICER_FIRESTORE_COLLECTION_PREFIX="prod"
$env:PRICER_PHASE6_BAD_PRODUCT_AUDIT_LIMIT="1000" # optional
$env:PRICER_PHASE6_BAD_PRODUCT_AUDIT_OUTPUT="tmp/phase6_bad_product_quarantine_dry_run.json" # optional
$env:PRICER_PHASE6_BAD_PRODUCT_QUARANTINE_DRY_RUN="true"
npm run phase6:audit-bad-products
```

Real marking requires explicit approval and confirmation. Do not run this until the dry-run report is reviewed:

```powershell
$env:PRICER_FIRESTORE_PROJECT_ID="..."
$env:PRICER_FIRESTORE_COLLECTION_PREFIX="prod"
$env:PRICER_PHASE6_BAD_PRODUCT_AUDIT_LIMIT="1000" # optional staged rollout
$env:PRICER_PHASE6_BAD_PRODUCT_AUDIT_OUTPUT="tmp/phase6_bad_product_quarantine_apply.json"
$env:PRICER_PHASE6_BAD_PRODUCT_QUARANTINE_DRY_RUN="false"
$env:PRICER_PHASE6_BAD_PRODUCT_QUARANTINE_CONFIRM="mark-invalid-products-no-delete"
npm run phase6:audit-bad-products
```

The report includes `writes_performed`, per-collection quarantine counts, and report-only affected counts for `current_product_offers` and `canonical_current_offer_summary`. Those derived collections are not rewritten or deleted by this command.
