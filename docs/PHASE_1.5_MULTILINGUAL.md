# Phase 1.5 - Multilingual Enrichment

## Goal
Extend `source_product_enrichment` with deterministic English metadata and cached async translations without changing raw ingest logic, source keys, or daily snapshot handling.

## Scope
- deterministic `canonical_en` generation
- deterministic English display generation
- multilingual display storage for `en`, `de`, `uk`, `ru`, and `nl`
- translation status tracking
- idempotent upgrade jobs for existing enrichment rows
- async batch translation with per-run limits

## Out of scope
- raw Bulgarian translation
- query-time translation
- UI usage
- matching changes
- re-ingesting historical raw data

## Rules
- Do not change the Phase 1 key strategy.
- Do not modify raw ingest identity behavior.
- Do not translate raw Bulgarian fields.
- English is the canonical multilingual base.
- All non-English translations derive from `display.en`.
- Translation runs asynchronously in batch jobs, not inline during ingest.
- Existing English or translated fields must not be overwritten by the upgrade jobs.

## Storage extension
Extend `source_product_enrichment` with:
- `canonical_en`
- `display_en`
- `i18n_status`
- `display.en`
- `display.de`
- `display.uk`
- `display.ru`
- `display.nl`
- `translation_status.en`
- `translation_status.de`
- `translation_status.uk`
- `translation_status.ru`
- `translation_status.nl`

## Jobs
- `upgradeEnrichmentToEnglish()`
  Backfills English metadata for existing enrichment rows without overwriting existing English fields.
- `upgradeTranslations()`
  Translates `display.en` into supported target languages, skips cached translations, records failures, and respects a per-run translation limit.

## Acceptance criteria
- all enrichment rows can carry deterministic English metadata
- new enrichment rows automatically include English metadata plus pending translation slots
- existing enrichment rows can be backfilled without re-ingest
- translation caching is idempotent
- translation failures are recorded without deleting prior successes
- per-run translation limit prevents runaway translation cost
