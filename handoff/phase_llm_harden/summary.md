# Phase LLM Harden Handoff

Date: 2026-05-05

## Summary

Implemented additive `canonical_semantic_v3` support for Phase 15 enrichment. V2 remains the default. V3 is enabled with:

```powershell
$env:PRICER_ENRICHMENT_VERSION='canonical_semantic_v3'
```

## What Changed

- Added flat runtime collections:
  - `semantic_term_registry`
  - `semantic_term_registry_proposals`
  - `canonical_enrichment_failed_responses`
- Added seedable registry terms for packaging, product form, food category, dairy type, milk source, quality tier, storage type, flavor, dietary claim, material, and preparation state.
- Added v3 prompt/schema builder with registry context, strict JSON schema, raw-term preservation rules, and proposal instructions.
- Compacted real v3 provider prompts so the full schema travels in `response_format.json_schema` while the user prompt references that schema.
- Added relevant-domain registry context selection plus term caps controlled by `PRICER_REGISTRY_CONTEXT_MAX_TERMS_PER_DOMAIN` and `PRICER_REGISTRY_CONTEXT_MAX_TOTAL_TERMS`.
- Added strict v3 validation that keeps messy raw vocabulary flexible.
- Added xAI structured-output request support for v3 with `response_format.json_schema`.
- Added pending proposal writing and dedupe from `registry_actions`.
- Added failed provider-response quarantine for malformed JSON.
- Added xAI provider retries with exponential backoff/jitter, per-request timeout, retryable status/network classification, `Connection: close`, and run-summary attempt history.
- Added prompt/request/schema/registry size metrics, per-attempt duration/request-size metadata, and `possible_local_request_bloat` classification for huge retryable provider failures.
- Added version-aware pilot candidate evidence extraction so existing v3 object-shaped attributes/category/packaging/product_form evidence cannot crash selection; malformed evidence shapes now appear in run warnings.

## Verification

- `npm run test:phase15` passed: 55 passed, 0 failed.
- `npm run validate:docs` passed.

## Operator Notes

- V3 real runs still require the existing explicit gates:
  - `PRICER_ENRICHMENT_DRY_RUN=false`
  - `PRICER_ENRICHMENT_RUN_LLM=true`
  - `PRICER_ENRICHMENT_VERSION=canonical_semantic_v3`
- If provider schema mode is unsupported, set:
  - `PRICER_ENRICHMENT_STRUCTURED_OUTPUT=false`
- Retry controls:
  - `PRICER_LLM_MAX_RETRIES`, default `3`
  - `PRICER_LLM_RETRY_BASE_MS`, default `750`
  - `PRICER_LLM_RETRY_MAX_MS`, default `8000`
  - `PRICER_LLM_REQUEST_TIMEOUT_MS`, default `60000`
  - `PRICER_LLM_REQUEST_BLOAT_CHAR_THRESHOLD`, default `100000`
- V3 registry context controls:
  - `PRICER_REGISTRY_CONTEXT_MAX_TERMS_PER_DOMAIN`, default `12`
  - `PRICER_REGISTRY_CONTEXT_MAX_TOTAL_TERMS`, default `48`
