PHASE 3.5 — AGGREGATION + PRICE HISTORY LAYER
Goal (one sentence)

👉 Turn raw price snapshots into fast, queryable time-series + aggregates (product + category level).

🧠 What Phase 3.5 adds

You already have:

raw snapshots (Phase 1)
meaning (1.5)
matching (2)
intelligence (3)

Now you add:

👉 memory + trends + insights

🧱 New Data Structures
1. Product daily price history

Collection:

product_daily_prices

Example:

{
  "source_product_id": "...",
  "date": "2026-04-21",
  "price_avg": 1.72,
  "price_min": 1.60,
  "price_max": 1.80,
  "store_count": 12
}
2. Category daily aggregates

Collection:

category_daily_aggregates

Example:

{
  "category": "dairy",
  "date": "2026-04-21",
  "avg_price": 1.68,
  "min_price": 0.99,
  "max_price": 3.20,
  "product_count": 120
}
3. (Optional but powerful) Product-family aggregates
family_daily_aggregates

Example:

{
  "product_family": "milk",
  "date": "...",
  "avg_price": ...
}
⚙️ Aggregation Pipeline
Trigger

After ingest completes:

runDailyAggregation(date)
Step 1 — Read snapshots

Query:

raw_price_snapshots
WHERE date = target_date
Step 2 — Group by product
groupBy(source_product_id)

Compute:

avg(price)
min(price)
max(price)
count(stores)
Step 3 — Write product history
write product_daily_prices
Step 4 — Group by category

Use:

category_code
OR canonical_en.product_family
groupBy(category)
Step 5 — Write category aggregates
write category_daily_aggregates
⚠️ Critical design rules
1. Append-only

Never overwrite:

(date, product) → unique row
2. Precompute EVERYTHING

👉 No runtime aggregation

3. Flat structure

SQL-ready:

date
category
avg_price
4. Deterministic

NO AI here
NO randomness

🧪 Required Tests
Product level
correct avg/min/max
correct store count
Category level
correct grouping
correct aggregation
Idempotency
running twice does NOT duplicate
⚙️ Modules
phase3_5/
  aggregator.js
  product_aggregator.js
  category_aggregator.js
  job.js
⚙️ Job
runDailyAggregation(date)
Logic
if already_aggregated(date):
  skip

else:
  run aggregation
🚀 API (Phase 3.5 exposes)
1. Product history
GET /product/:id/history

Returns:

[
  { "date": "...", "price_avg": 1.7 },
  ...
]
2. Category trends
GET /category/:category/trends
🔥 Immediate features unlocked
1. Price chart (MVP)
last 7 / 30 days
simple line chart
2. “Good price?” indicator
current: 1.72€
avg 30d: 1.65€
→ slightly expensive
3. “Trend”
milk +4% this week
💡 Phase 3.5.5 (optional but huge)

Add:

weekly_aggregates
monthly_aggregates

👉 speeds up UI massively