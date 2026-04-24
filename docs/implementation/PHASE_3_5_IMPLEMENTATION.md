# Phase 3.5 Implementation

## Goal
Precompute deterministic, append-only daily product and category price aggregates from `raw_price_snapshots` so later phases can query price history and trends without runtime aggregation.

## Rules
- no AI
- deterministic only
- append-only
- idempotent
- flat SQL-compatible records
- read from `raw_price_snapshots` only
- do not modify Phase 1, 2, or 3 matching and enrichment logic

## Collections

### `product_daily_prices`
- `source_product_id`
- `date`
- `price_avg`
- `price_min`
- `price_max`
- `store_count`
- `snapshot_count`

### `category_daily_aggregates`
- `category_code`
- `date`
- `avg_price`
- `min_price`
- `max_price`
- `product_count`
- `snapshot_count`

## Job
`runDailyAggregation(date)`

Behavior:
1. Read `raw_price_snapshots` for the target date.
2. Group by `source_product_id`.
3. Compute average, minimum, maximum, and store count using effective price.
4. Write append-only `product_daily_prices` rows.
5. Group by `category_code`.
6. Compute average, minimum, maximum, and product count.
7. Write append-only `category_daily_aggregates` rows.
8. Skip if the date has already been aggregated.

## Endpoints
- product history
- category trends

## Required automated coverage
1. aggregation correctness
2. idempotency
3. product history endpoint
4. category trends endpoint
