# Phase 20.3 Market Opportunity Reports - Implementation Notes

Date: 2026-04-25

## Scope

Phase 20.3 adds a deterministic report layer over existing market-gap analytics. It turns raw gap, locality, and chain/store evidence into business-readable opportunity cards for internal review, future merchant dashboards, small-shop analysis, and category opportunity analysis.

This phase is read-only. It does not add persistence, mutate gap signals, mutate canonical/enrichment/price/user data, call LLMs, or call external services.

## API

`GET /analytics/opportunities`

Query params:

- `window`: `last_7d`, `last_30d`, or `all`
- `locality_code`
- `category_l1`
- `category_l2`
- `chain_id`
- `store_id`
- `limit`
- `min_gap_score`

## Helper

`buildMarketOpportunityReports(...)`

Returns:

- `window`
- `filters`
- `opportunities[]`

Each opportunity includes:

- `opportunity_id`
- `title`
- `opportunity_type`
- `confidence`
- locality/category/chain/store context when available
- `gap_score`
- `evidence`
- `recommended_action`
- `limitations`

## Opportunity Types

- `missing_supply`: unresolved-heavy demand evidence.
- `poor_match_quality`: ambiguous-heavy matching evidence.
- `high_price_pressure`: category-relative price pressure.
- `distribution_gap`: at least one chain has reasonable coverage while another has poor coverage for the same demand.
- `data_quality_gap`: low-sample unresolved or ambiguous evidence that should be verified before market interpretation.
- `emerging_interest`: high-volume normal demand that does not yet meet stronger gap criteria.

## Confidence

- `high`: signal count is at least 50 and gap score is high.
- `medium`: signal count is at least 10.
- `low`: signal count is below 10.

Confidence is deliberately conservative and should not be treated as business certainty.

## Recommended Actions

Action text is fixed and deterministic by opportunity type. Reports recommend investigation, catalog improvements, price review, targeted stocking comparison, data verification, or monitoring. They do not claim guaranteed demand or revenue.

## Limitations

All reports include limitations that app interaction signals are not full-market surveys and should be validated before business decisions. Data quality gaps include an additional low-sample warning.

## Verification

Covered by `tests/phase_20_3_market_opportunity_reports.test.js`:

- all opportunity types
- confidence labels
- recommended action text
- filters
- deterministic sorting
- empty dataset safety
- no mutation
