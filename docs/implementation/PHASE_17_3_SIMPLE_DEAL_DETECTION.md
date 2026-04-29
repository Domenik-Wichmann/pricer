# Phase 17.3 Implementation Contract

## Goal
Add deterministic user-facing deal signals without introducing a full alert-rule system.

## Runtime modules
- `app/functions/src/phase17/deals.js`
- `functions/src/phase17/deals.js`
- `app/functions/src/phase17/watchlist.js`
- `functions/src/phase17/watchlist.js`
- `app/functions/src/phase16/basket_optimizer.js`
- `functions/src/phase16/basket_optimizer.js`
- `app/functions/src/index.js`
- `functions/src/index.js`
- `functions/index.js`

## API
- `POST /products/deal-check`

## Helper contract
`classifyProductDeal(...)` accepts price records, current price, and optional target price.

It returns:

- `deal_level`
- `deal_score`
- `reason`
- `target_hit`
- `comparison.avg_price`
- `comparison.min_price`
- `comparison.percent_difference_from_avg`

## Safety boundaries
- No notification sending.
- No push/FCM.
- No complex alert rules.
- No mutation of price data.
- No randomness.
- No required user configuration.
