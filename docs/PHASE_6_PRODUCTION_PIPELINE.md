# PHASE 6 IMPLEMENTATION — PRODUCTION PIPELINE + INFRA

## Phase ID
PHASE_6_PRODUCTION_PIPELINE

## Objective
Move the system from local/dev state to real-world operation:
- automated daily ingest from kolkostruva
- real Firebase configuration
- real LLM + embedding integration
- real device runtime verification
- basic analytics + logging
- watchlist alert engine

---

## Scope

### In scope
- ingest automation
- Firebase production setup
- LLM + embedding hookup
- watchlist alerts
- analytics events
- production testing

### Out of scope
- new UI features
- new product features
- major architecture changes

---

## Core Systems

### 1. Automated Ingest Pipeline

#### Input
Daily ZIP:
https://kolkostruva.bg/opendata_files/YYYY-MM-DD.zip

#### Flow
download → stream unzip → parse CSV → dedupe → enrich net-new → store

#### Rules
- do NOT load full files into memory
- process row-by-row (streaming)
- dedupe by:
  store_id + product_code
- only enrich net-new products
- reuse cached metadata

---

### 2. Scheduler

Run once daily:
- fetch latest date
- run ingest job

---

### 3. Firebase Setup

Must be fully configured:

- Firestore
- Cloud Functions
- Cloud Messaging (FCM)
- Auth (anonymous)

Use:
```bash
flutterfire configure

to generate firebase_options.dart

4. LLM Integration (Grok / xAI)

Use ONLY for:

ambiguous queries
semantic enrichment
fallback intent parsing

DO NOT use for:

normal queries
deterministic matching
5. Embeddings

Add embedding generation for:

canonical products
user queries (optional later)

Used for:

semantic search
ranking
clustering unmet demand
6. SQL + pgvector (mirror layer)

Mirror Firestore data into:

PostgreSQL
pgvector

Purpose:

advanced queries
vector similarity search
analytics
7. Watchlist Alerts

Daily job:

compare today's prices vs yesterday
detect drops

If drop:

trigger notification via FCM
8. Analytics

Track:

search queries
unmatched queries
list creation
watchlist usage
result clicks
9. Error Handling

Log:

ingest failures
partial file failures
malformed rows
LLM failures
Implementation Tasks
Ingest
streaming unzip
streaming CSV parser
dedupe logic
net-new detection
enrichment hook
Scheduler
daily trigger job
Firebase
configure project
initialize in app
verify connection
LLM
integrate Grok API
call ONLY on ambiguity
Embeddings
generate for canonical products
store vectors
Alerts
detect price change
send FCM push
Analytics
log key events
Testing
Required checks
ingest runs without crash
duplicate rows not reprocessed
net-new detection works
app connects to Firebase
watchlist alert triggers
LLM only used when needed
Acceptance Criteria

Phase complete when:

ingest runs daily automatically
Firebase is fully connected
real data appears in app
watchlist alerts work
no manual data loading required
system stable across multiple runs
Deliverables
ingest pipeline
scheduler job
Firebase config
LLM integration
embeddings pipeline
alerts system
updated docs/logs
handoff package