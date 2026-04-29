Implement Phase 17.4: Market / Category Trends.

GOAL:
Add an optional power-user/internal “market view” layer that summarizes price movement by category, brand, base product, and deal density.

This should support future UI like:

* Dairy up/down this week
* Meat prices rising
* Best deal-heavy categories
* Category-level price trend snapshots

This is NOT the default user flow. It is an optional insights layer.

CONTEXT:
Already implemented:

* Phase 15 enrichment with category hierarchy
* Phase 16 price lookup / basket optimization
* Phase 17.2 watchlist
* Phase 17.3 deal detection

CRITICAL RULES:

* Do not change optimizer behavior
* Do not mutate canonical/enrichment/price data
* Do not build UI
* Do not call external services
* Use existing price history / product_daily_prices if available
* Use enrichment category fields for grouping

FEATURES:

1. Add market trend helper:
   `buildMarketTrendSummary(...)`

Input:

```json
{
  "group_by": "category_l1" | "category_l2" | "category_l3" | "brand" | "base_product",
  "window": "last_7d" | "last_30d" | "all",
  "filters": {
    "category_l1": "Food & Beverage",
    "category_l2": "Dairy"
  }
}
```

Output:

```json
{
  "group_by": "category_l2",
  "window": "last_30d",
  "groups": [
    {
      "key": "Dairy",
      "product_count": 120,
      "priced_product_count": 98,
      "average_price_current": 2.85,
      "average_price_previous": 2.73,
      "change_amount": 0.12,
      "change_percent": 0.044,
      "trend": "up",
      "deal_count": 14,
      "deal_density": 0.143
    }
  ]
}
```

2. Trend classification:

* `up` if change_percent >= 0.03
* `down` if change_percent <= -0.03
* `flat` otherwise
* `insufficient_data` if not enough historical data

3. Deal density:
   Use existing Phase 17.3 deal classifier where practical.
   Compute:

```text
deal_density = good_deal_count / priced_product_count
```

4. API endpoint:
   Add:
   `POST /market/trends`

5. Optional summary endpoint:
   Add if simple:
   `GET /market/overview`

Returns top-level grouped trends for major categories.

6. Tests:
   Add tests for:

* grouping by category
* grouping by brand/base_product
* up/down/flat classification
* insufficient data handling
* deal density calculation
* filters
* no mutation
* API validation

7. Docs:
   Update docs/handoff with:

* market trend contract
* grouping options
* trend thresholds
* limitations
* note that this is optional/power-user/admin insight, not main UX

OUTPUT:

1. files changed
2. diff summary
3. commands run
4. test results
5. endpoints added
6. trend logic
7. what remains for UI/market dashboard

SUCCESS CRITERIA:

* market/category trend summaries work
* category enrichment is used for grouping
* deal density is computed
* no existing behavior changes
* tests pass

IMPLEMENTATION NOTES:

* Added `buildMarketTrendSummary(...)` in mirrored `phase17/market_trends.js` modules.
* Added `POST /market/trends` and `GET /market/overview`.
* Trend grouping uses canonical enrichment fields and existing `product_daily_prices`.
* Deal density reuses the Phase 17.3 good-deal classifier.
* No new persistence, optimizer changes, UI, external services, or data mutation were added.
