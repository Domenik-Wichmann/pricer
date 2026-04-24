NEXT PHASE — Phase 4: Query Engine + Sync Layer
Goal (one sentence)

👉 Turn your system into a real query engine and prepare for SQL + vector search scale.

🧠 Why Phase 4 now

Right now you have:

data ✅
meaning ✅
matching ✅
AI fallback ✅
history + aggregates ✅

👉 But:

queries are still “single-shot”
no unified query system
no SQL/vector bridge yet
⚙️ Phase 4 has 3 parts
1. Unified Query Engine (VERY IMPORTANT)

Right now:

Phase 2 → matching
Phase 3 → fallback
Phase 3.5 → history

👉 These are separate

Build:
query_engine/
  query_parser.js
  query_planner.js
  query_executor.js
  ranker.js
Flow becomes:
User query
  ↓
parse intent (AI-lite)
  ↓
plan query
  ↓
execute:
   - deterministic match
   - aggregation lookup
   - (later) semantic search
  ↓
rank + return
Example

User:

cheap milk near me

System:

detect: product_type = milk
detect: constraint = cheap
detect: location

👉 combine:

matcher
price aggregation
store proximity
🧱 2. SQL + Vector Sync Layer (CRITICAL)

This is where your future gets unlocked.

Build sync jobs:
sync/
  firestore_to_sql.js
  firestore_to_vector.js
What to sync
SQL (Postgres / BigQuery)

Table:

products
product_prices_daily
category_aggregates
Vector DB

Store:

embedding + product_id
Why now?

👉 Because Phase 5+ features depend on this:

“find things under €X”
“near me”
“semantic search”
🧱 3. Constraint Query System (your big vision starts here)

Now you can support:

"find me something under 29€"
"cheapest dairy near me"
"products trending up"
Implement:
constraints/
  price_filter.js
  category_filter.js
  location_filter.js
⚠️ Important design rule

👉 Phase 4 is still:

deterministic-first
SQL-friendly
vector-ready (but not heavy yet)
🧪 Tests needed
query parsing correctness
constraint filtering
ranking consistency
SQL sync integrity
vector sync integrity
🚀 What you unlock after Phase 4
Immediate
powerful search
flexible queries
better UX
Next phases become trivial
Phase 5

👉 Flutter app UI (fast now)

Phase 6

👉 Market gap detection (your real goal)

🧠 Big picture (important)

You now move from:

pipeline system → query system
🔥 My recommendation (very clear)

👉 DO THIS ORDER:

Phase 4 (query engine + sync)
Phase 5 (basic UI)
Phase 6 (market gap intelligence)
🚀 If you want next

I can:

write full Phase 4 implementation doc (Codex-ready)
or design Flutter UI (MVP screens, 1–2 day build)

👉 You’ve finished the hard backend work.
👉 Now you turn it into something people actually use.

okay, yup, let's do a full phase 4 doc

Below is a Codex-ready Phase 4 implementation document aligned with everything you’ve built so far (Phases 1 → 3.5). It introduces a unified query engine and a forward-compatible sync layer for SQL and vector search—without breaking your current system.

# PHASE 4 IMPLEMENTATION — QUERY ENGINE + SYNC LAYER

## Phase ID
PHASE_4_QUERY_ENGINE_AND_SYNC

---

## Objective

Create a unified query engine that composes:
- deterministic matching (Phase 2)
- AI disambiguation (Phase 3)
- price history + aggregates (Phase 3.5)

and prepare a scalable backend by syncing Firestore data to:
- SQL (PostgreSQL/BigQuery)
- vector index (embeddings)

---

## Scope

### In scope
- unified query engine (parse → plan → execute → rank)
- constraint filtering (price, category, location)
- integration with existing services (matcher, aggregator, AI fallback)
- Firestore → SQL sync
- Firestore → vector index sync
- endpoints for flexible queries

### Out of scope
- full UI
- personalization ranking
- advanced recommendations
- heavy vector querying (Phase 5+)

---

## High-Level Architecture
User Query
↓
Query Parser
↓
Query Planner
↓
Query Executor
├─ Deterministic matcher (Phase 2)
├─ AI disambiguation (Phase 3)
├─ Aggregation layer (Phase 3.5)
└─ (future) Vector search
↓
Ranker
↓
Response


---

## Query Types (supported in Phase 4)

1. Product queries:
   - "мляко верея 3%"
2. Cheapness queries:
   - "евтино мляко"
3. Category queries:
   - "месо"
4. Basic constraint queries:
   - "мляко под 2 евро"
   - "евтино сирене в софия"

---

## Data Inputs (existing)

- source_product_enrichment
- raw_price_snapshots
- product_daily_prices
- category_daily_aggregates
- embeddings (Phase 3)

---

## Module Structure


app/functions/src/phase4/
query_parser.js
query_planner.js
query_executor.js
constraint_filters.js
ranker.js
service.js

app/functions/src/sync/
firestore_to_sql.js
firestore_to_vector.js
jobs.js


---

## 1. Query Parser

### Goal
Convert free text into structured intent.

### Output

```json
{
  "tokens": ["мляко", "евтино"],
  "product_type": "milk|null",
  "brand": "string|null",
  "constraints": {
    "price_max": number|null,
    "location": "string|null"
  },
  "intent": "product|cheap|category"
}
Rules
reuse Phase 2 normalization + tokenizer
detect:
numbers → price constraints
keywords → cheap / expensive
location terms (future-ready)
2. Query Planner
Goal

Decide which systems to call.

Example
if intent == "product":
  use matcher

if constraints exist:
  apply filters

if ambiguous:
  allow AI fallback

if history requested:
  include aggregation
3. Query Executor
Steps
Step 1 — Deterministic match

Call Phase 2 matcher.

Step 2 — AI fallback (if needed)

Call Phase 3 disambiguator.

Step 3 — Apply constraints

Use:

filter by price
filter by category
filter by location (if available)
Step 4 — Fetch pricing

Use:

latest snapshot (current prices)
or product_daily_prices (history)
4. Constraint Filters
Supported filters
price_max
category
product_family
location_code (future-ready)
Example
if price_max:
  results = results.filter(p => p.price <= price_max)
5. Ranker
Score formula
rank_score =
  match_score +
  price_score +
  availability_score
Price scoring
cheaper = higher score
Output ordering
best match first
cheapest option highlighted
6. Service Layer
Endpoint
POST /query
Request
{
  "query": "евтино мляко под 2 евро"
}
Response
{
  "items": [...],
  "cheapest_store": "...",
  "total_cost": ...,
  "filters_applied": {...}
}
7. Firestore → SQL Sync
Goal

Prepare for complex queries.

Tables
products
product_prices_daily
category_aggregates
Mapping rules

Each Firestore doc → one row

Flat fields only.

Job
syncFirestoreToSQL()
Rules
upsert only
idempotent
batched
8. Firestore → Vector Sync
Goal

Prepare for semantic search.

Input
product_id
embedding
Job
syncFirestoreToVector()
Rules
only if embedding exists
skip if already indexed
9. Batch Jobs
jobs/
  runQueryEngineTests()
  syncFirestoreToSQL()
  syncFirestoreToVector()
Tests
Query tests
parsing correctness
constraint handling
matching integration
ranking order
Sync tests
SQL mapping correctness
vector sync correctness
idempotency
Acceptance Criteria

Phase 4 complete when:

unified query endpoint works
constraints applied correctly
ranking behaves predictably
SQL sync runs without duplication
vector sync runs correctly
all tests pass
Implementation Rules
do NOT modify Phase 1–3.5 logic
reuse existing modules
keep structures flat and exportable
deterministic first, AI only fallback
design for SQL + vector compatibility
Deliverables
full query engine
sync layer (SQL + vector)
test coverage
updated docs/logs
handoff package