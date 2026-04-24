# Phase 16.0 Price Lookup Layer

## Goal
Expose a bounded, deterministic price lookup contract so future basket optimizers can ask which current prices are known for canonical product candidates.

## Implemented surface
- service: `lookupCanonicalProductPrices(...)`
- service: `lookupPricesForBasketPlan(...)`
- handler: `handleLookupCanonicalProductPricesRequest(...)`
- route: `POST /prices/lookup`

## Existing repo price structures used
- `canonical_product_mappings`
  - maps `canonical_product_id` to `source_product_id`
- `raw_price_snapshots`
  - current per-source-product snapshot truth with `snapshot_date`, `retail_price`, `promo_price`, chain metadata, locality, and store name
- `source_products`
  - source-product metadata including chain and store provenance
- `product_daily_prices`
  - optional per-source-product daily history for `include_history=true`

Phase 16.0 intentionally reuses those structures instead of creating a parallel canonical-price persistence layer.

## Request contract

```json
{
  "canonical_product_ids": ["cp_1", "cp_2"],
  "options": {
    "price_mode": "latest",
    "max_age_days": 14,
    "chain_ids": ["kaufland"],
    "store_ids": ["1000::kaufland-mladost"],
    "include_history": false
  }
}
```

## Response contract

```json
{
  "price_mode": "latest",
  "currency": "EUR",
  "items": [
    {
      "canonical_product_id": "cp_1",
      "price_records": [
        {
          "chain_id": "kaufland",
          "chain_name": "KAUFLAND",
          "store_id": "1000::kaufland-mladost",
          "store_name": "Kaufland Mladost",
          "price": 2.49,
          "currency": "EUR",
          "snapshot_date": "2026-04-24",
          "is_stale": false,
          "source": "snapshot_id"
        }
      ],
      "best_price": {
        "price": 2.49,
        "chain_id": "kaufland",
        "currency": "EUR"
      },
      "price_status": "priced"
    }
  ],
  "summary": {
    "requested_count": 2,
    "priced_count": 1,
    "stale_count": 0,
    "missing_count": 1
  }
}
```

## Status definitions
- `priced`
  - at least one latest price record exists and is within `max_age_days`
- `stale`
  - price records exist, but all available latest records are older than `max_age_days` or undated
- `missing`
  - no usable price records were found after canonical mapping and optional chain or store filtering

## Freshness behavior
- latest snapshot selection is deterministic per `source_product_id`
- recency prefers newer `snapshot_date`, then newer `ingested_at`
- effective current price prefers promo price only when it is positive and cheaper than retail price
- missing dates are never treated as fresh
- source price values are treated as EUR; the lookup layer does not perform currency conversion
- each price record includes `is_stale` so downstream optimizers can exclude stale records explicitly

## Basket-plan helper
`lookupPricesForBasketPlan(...)` collects canonical ids from:
- `ready_items`
- `ambiguous_items[].carried_candidates`

It returns:

```json
{
  "basket_plan": {...},
  "price_lookup": {...}
}
```

The original basket plan is cloned and returned unchanged.

## Safety boundaries
- deterministic only
- no LLM usage
- no external API calls
- no canonical mutation
- no enrichment mutation
- no price-history mutation
- no basket persistence

## Acceptance status
- canonical products can now be priced through a stable lookup contract
- missing and stale prices are explicit
- basket plans can be enriched with price lookup output without running optimization yet


Implement Phase 16.0: Price Lookup Layer for basket optimization.

GOAL:
Create a bounded, deterministic price lookup layer that lets future basket optimizers ask:

“Given these canonical product candidates, what current prices do we know?”

This phase is NOT the optimizer yet. It only normalizes access to price records.

CONTEXT:
The repo already has:

* canonical truth
* enrichment
* product API/search
* shopping-list resolver
* basket input planner
* `POST /basket/plan`

Next step:
Build a stable price lookup contract that consumes basket-plan ready/candidate items.

DO NOT:

* implement basket optimization yet
* mutate canonical products
* mutate enrichment
* mutate price history
* persist user baskets
* call external APIs
* invent missing prices

---

## FEATURES TO IMPLEMENT

## 1. Price lookup service

Add a service such as:

`lookupCanonicalProductPrices(...)`

Input shape:

```json
{
  "canonical_product_ids": ["cp_1", "cp_2"],
  "options": {
    "price_mode": "latest",
    "max_age_days": 14,
    "chain_ids": [],
    "store_ids": [],
    "include_history": false
  }
}
```

Output shape:

```json
{
  "price_mode": "latest",
  "currency": "EUR",
  "items": [
    {
      "canonical_product_id": "cp_1",
      "price_records": [
        {
          "chain_id": "kaufland",
          "chain_name": "Kaufland",
          "store_id": null,
          "store_name": null,
          "price": 2.49,
          "currency": "EUR",
          "snapshot_date": "2026-04-24",
          "source": "..."
        }
      ],
      "best_price": {
        "price": 2.49,
        "chain_id": "kaufland",
        "currency": "EUR"
      },
      "price_status": "priced"
    }
  ],
  "summary": {
    "requested_count": 2,
    "priced_count": 1,
    "missing_count": 1
  }
}
```

Allowed `price_status`:

* `priced`
* `missing`
* `stale`

---

## 2. Data source integration

Use existing repo price/snapshot/store structures if present.

First inspect current code/data model for:

* source product price fields
* canonical product mapping to source products
* daily snapshot structures
* chain/store identifiers

Do not invent a new price schema if one already exists.

If current price storage is insufficient, add the smallest adapter/helper that can read the existing available price data.

---

## 3. Latest price selection

For each canonical product:

* find mapped source products
* collect latest price records
* filter by `max_age_days` if date data exists
* filter by chain/store if requested
* choose `best_price` as lowest current valid price

If dates are missing:

* do not pretend freshness
* mark accordingly or document limitation

---

## 4. API endpoint

Add route:

`POST /prices/lookup`

Request:

```json
{
  "canonical_product_ids": ["cp_1", "cp_2"],
  "options": {
    "max_age_days": 14,
    "chain_ids": ["kaufland"]
  }
}
```

Response:
Use the service output shape.

Validation:

* reject empty ID list
* cap max IDs per request
* validate options
* return bounded errors

---

## 5. Basket-plan helper

Add helper:

`lookupPricesForBasketPlan(...)`

Input:

* basket plan output from Phase 15.4

Behavior:

* collect canonical_product_ids from:

  * ready_items
  * carried ambiguous candidates if present
* call price lookup
* attach price results without changing the basket plan

Output:

```json
{
  "basket_plan": {...},
  "price_lookup": {...}
}
```

---

## 6. Tests

Add tests for:

1. latest price lookup by canonical product id
2. missing price returns `missing`
3. stale price handling if dates are available
4. chain/store filtering
5. best_price picks lowest valid price
6. API validation errors
7. basket-plan price lookup collects ready + carried candidate ids
8. no mutation of basket plan or canonical data

Use fake/mock price records if needed.

---

## 7. Docs / handoff

Update docs with:

* price lookup contract
* endpoint
* status definitions
* freshness behavior
* relation to basket optimizer

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. existing price structures discovered
4. commands run
5. test results
6. service + endpoint added
7. what remains for single-store basket optimizer

SUCCESS CRITERIA:

* canonical products can be priced through a stable lookup contract
* missing/stale prices are explicit
* best price is deterministic
* basket plans can be enriched with price lookup output
* no optimization logic yet
* tests pass
