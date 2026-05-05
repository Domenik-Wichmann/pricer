# Admin QA Console And Bulgarian Markers Handoff

Date: 2026-05-03

## What Changed

- Admin Console now includes a Home Summary tab for `GET /home/summary`.
- Product Detail renders canonical fields, marker fields, and bounded source-product mappings from the backend detail response.
- Mapping rows include copy and direct Price History actions.
- Product detail responses now include bounded `provenance.source_product_ids` and `provenance.canonical_mappings`.
- Phase 6/15 deterministic marker parsing now recognizes additional Bulgarian Cyrillic unit words and package patterns.

## Verification

- `node tests\phase_6_production_pipeline.test.js` passed: 77/77.
- `node tests\phase_15_2_product_api.test.js` passed: 12/12.
- `node tests\phase_15_3_shopping_list_resolution.test.js` passed: 9/9.
- `node tests\phase_15_4_basket_input_planner.test.js` passed: 8/8.
- `npm --prefix app\admin-web run build` passed.

## Operator Notes

- No production data was deleted.
- No heavy Phase 6 publisher/ingest was run.
- Existing `prod_canonical_products` records will not show new marker extraction until an explicit future re-ingest/re-publish is scheduled.
- Product Detail mapping previews are bounded for QA navigation, not an exhaustive export surface.

## Next Phase

- Add a compact searchable product read model with reviewed BG/EN aliases and seeded synonyms.
- Add authenticated/admin-gated Hosting access before broader exposure.
