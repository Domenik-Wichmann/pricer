# Phase 15.9 Semantic Enrichment Pilot Handoff

Date: 2026-05-05

## Summary

Implemented a focused deterministic-plus-enrichment pilot for semantic product search failures around cookies/snacks and Coca-Cola/cola, then extended it to a richer additive `canonical_semantic_v2` batch schema. The change does not enrich all products and does not run a real LLM batch by default.

Follow-up on 2026-05-05: default xAI Grok model fallbacks now use `grok-4-1-fast-reasoning` across the mirrored backend trees and Phase 15.9 docs/examples.

## Files Changed

- `functions/src/phase15/search_synonyms.js`
- `app/functions/src/phase15/search_synonyms.js`
- `functions/src/phase15/readers.js`
- `app/functions/src/phase15/readers.js`
- `functions/src/phase15/enrichment.js`
- `app/functions/src/phase15/enrichment.js`
- `functions/src/phase15/enrichment_pilot.js`
- `app/functions/src/phase15/enrichment_pilot.js`
- `functions/src/phase15/readers.js`
- `app/functions/src/phase15/readers.js`
- `functions/src/index.js`
- `app/functions/src/index.js`
- `scripts/run_canonical_enrichment_pilot.js`
- `scripts/run_canonical_enrichment_healthcheck.js`
- `app/admin-web/src/App.tsx`
- `package.json`
- `tests/phase_15_2_product_api.test.js`
- `tests/phase_15_hyper_rich_enrichment.test.js`
- docs, changelog, decision log, test registry, and this handoff

## Verification

- `npm run test:phase15`: 29 passed, 0 failed
- `npm run phase15:enrichment-healthcheck` with a dummy key and live mode disabled: config-only passed, no live request made
- `npm run test:phase15_2`: 25 passed, 0 failed
- `npm run test:phase15_1`: 7 passed, 0 failed
- `npm run test:phase15_8`: 10 passed, 0 failed
- `npm run validate:docs`: JSON docs parse successfully

Recorded in `docs/test_runs/phase_15_9_semantic_enrichment_pilot_2026-05-05.json`.

## Operator Actions

Dry-run candidate selection before any LLM calls:

```powershell
$env:PRICER_ENRICHMENT_PILOT_QUERY='cola'
$env:PRICER_ENRICHMENT_DRY_RUN='true'
npm run phase15:enrichment-pilot
```

Focused v2 group dry-run:

```powershell
$env:PRICER_ENRICHMENT_PILOT_GROUP='cola_beverage_eval'
$env:PRICER_ENRICHMENT_PILOT_LIMIT='10'
$env:PRICER_ENRICHMENT_DRY_RUN='true'
npm run phase15:enrichment-pilot
```

Real LLM pilot remains pending explicit approval. If approved, set both:

```powershell
$env:PRICER_ENRICHMENT_DRY_RUN='false'
$env:PRICER_ENRICHMENT_RUN_LLM='true'
```

The pilot now validates one rich v2 result per input canonical id, skips same id/name-hash/version cache hits, and rejects invalid batches without writing enrichment.

Before a real pilot, run the config-only provider diagnostic:

```powershell
npm run phase15:enrichment-healthcheck
```

It reports provider `xai`, endpoint/model resolution, key presence, and Node fetch availability without printing `XAI_API_KEY`, touching Firestore, or making a live request. A tiny live provider request requires explicit opt-in:

```powershell
$env:PRICER_ENRICHMENT_LLM_HEALTHCHECK_LIVE='true'
npm run phase15:enrichment-healthcheck
```

## Boundaries

- No full catalog enrichment was run.
- No heavy ingest or publisher was run.
- No Firestore data was deleted.
- No mobile UI was changed.
- LLM output is validated and may update only `canonical_enrichment_store`.
