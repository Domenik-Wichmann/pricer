# Phase 4 Implementation - Query Engine and Sync

## Goal
Build a unified query engine that composes deterministic matching, AI fallback, and aggregation data, then add flat idempotent sync jobs for SQL and vector targets.

## Rules
- deterministic matching is primary
- AI is fallback only
- do not modify Phase 1-3.5 data contracts
- do not reprocess raw data
- all new data must remain flat and SQL-compatible
- sync jobs must be idempotent

## Modules

### Query engine
- `query_parser.js`
- `query_planner.js`
- `query_executor.js`
- `constraint_filters.js`
- `ranker.js`
- `service.js`

### Sync
- `firestore_to_sql.js`
- `firestore_to_vector.js`
- `jobs.js`

## Query engine contract
1. Parse Bulgarian free-text into flat intent fields.
2. Build a plan for matcher, AI fallback, constraints, and aggregates.
3. Execute using:
   - Phase 2 matcher
   - Phase 3 AI disambiguator
   - Phase 3.5 aggregate collections
4. Apply deterministic filters.
5. Rank results predictably.
6. Return a flat response shape.

## Sync contract

### SQL sync targets
- `sql_products`
- `sql_product_prices_daily`
- `sql_category_aggregates`

### Vector sync target
- `vector_index_records`

Rules:
- one flat row per synced record
- upsert semantics for SQL targets
- skip-if-present semantics for vector targets
- no duplicate rows on rerun

## Required automated coverage
1. query parsing
2. constraint filtering
3. ranking
4. query endpoint validation
5. SQL sync integrity
6. vector sync integrity
7. sync idempotency
