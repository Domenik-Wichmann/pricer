# PHASE 6 IMPLEMENTATION

## Phase
`PHASE_6_PRODUCTION_PIPELINE`

## Goal
Move the repo from local phase modules to a scheduler-ready production runtime without changing the existing phase architecture or adding end-user features.

## Scope
- streamed download and unzip of daily source ZIP files
- streamed CSV parsing
- duplicate suppression on existing stable source-product keys
- ingest run tracking and pipeline logs
- scheduler-ready daily orchestration
- analytics event recording
- watchlist alert detection and notification queuing
- env-configurable Grok ambiguity resolution
- env-configurable remote embedding backfill with deterministic fallback
- Firebase bootstrap compatibility improvements in the mobile app

## Important repo-truth rules
- The current source model does not contain a separate `store_id`, so Phase 6 dedupe must use the existing stable source-product identity fields already defined in Phase 1.
- Streaming means the ZIP and CSV source file are processed without loading the full source file into memory; it does not replace the repo’s existing in-memory test store.
- Live Firebase config, live FCM credentials, and live xAI credentials are environment concerns and must remain operator-configurable rather than hardcoded.

## Required modules
- `phase6/kolkostruva_client.js`
- `phase6/csv_stream.js`
- `phase6/ingest.js`
- `phase6/scheduler.js`
- `phase6/jobs.js`
- `phase6/logging.js`
- `phase6/analytics.js`
- `phase6/alerts.js`
- `phase6/grok.js`
- `phase6/embeddings.js`

## Runtime contract

### Ingest
- Discover the most recent available `YYYY-MM-DD.zip`.
- Download to disk as a stream.
- Open the first supported delimited source file from the ZIP as a stream.
- Parse row-by-row.
- Preserve raw rows losslessly for valid imports.
- Skip malformed rows with warning logs.
- Suppress duplicate rows within the same file on stable source-product identity.
- Only enrich net-new or revalidation-needed products.

### Scheduler
- Provide a daily schedule definition and an orchestration entrypoint.
- Skip reruns for snapshot dates already marked completed.

### AI and embeddings
- Only call Grok when ambiguity is present and budget allows.
- Keep remote model names and API keys environment-configurable.
- Support remote embeddings when configured and deterministic fallback otherwise.

### Alerts and analytics
- Store flat analytics events.
- Detect price drops from aggregated product prices.
- Queue or send notifications through an injected notifier without hardcoding infrastructure credentials.

## Acceptance status in this repo
- Implemented and locally verified:
  - streamed ingest
  - scheduler-ready orchestration
  - logging
  - analytics event storage
  - alert detection and notification queueing
  - env-configurable Grok and embedding adapters
- Still operator-bound:
  - live Firebase project configuration
  - live xAI credentials
  - deployed daily scheduler
  - live FCM delivery verification
