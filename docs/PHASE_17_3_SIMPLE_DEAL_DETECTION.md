# Phase 17.3: Simple Deal Detection

Implemented on April 24, 2026.

## Goal
Add a lightweight deal-signal layer over existing price data.

This phase is intentionally not an alert system. It gives users simple, readable signals such as `good`, `normal`, or `expensive` based on current known prices compared with the recent available price average.

## Runtime additions
- `classifyProductDeal(...)`
- `annotateOptimizerResultWithDeals(...)`
- `handleDealCheckRequest(...)`
- `POST /products/deal-check`

## Deal Meaning
A good deal means the current price is at least 20% below the recent available average for that canonical product.

An expensive signal means the current price is at least 20% above the recent available average.

Anything between those thresholds is normal.

If there is not enough price history, the signal defaults to normal.

## Thresholds
- good: `current_price <= avg_price * 0.8`
- expensive: `current_price >= avg_price * 1.2`
- normal: everything else

## Integrations
`GET /watchlist/prices` now includes a `deal` object for each watched item.

`POST /basket/optimize` now annotates optimizer item outputs with a `deal` object and includes `basket_deal_summary`.

`POST /products/deal-check` accepts canonical product ids and returns deal classifications using the existing Phase 16.0 price lookup layer.

## Limitations
- Deal signals are based on currently available recent price records.
- Deal signals are not predictions.
- Deal signals do not guarantee future pricing.
- No notification delivery is implemented.
- No complex user alert rules are implemented.
- Price records are not mutated.
