# Phase 20.4 Merchant / Admin Insights API - Implementation Notes

Date: 2026-04-25

## Scope

Phase 20.4 adds a structured read API layer over the existing Phase 20 gap analytics and Phase 20.3 opportunity reports. It is intended for internal dashboards, future merchant-facing tools, and export/report pipelines.

This phase is not a UI. It is read-only and does not add persistence, mutate gap signals, mutate product/user/runtime data, call LLMs, or call external services.

## Endpoints

- `GET /analytics/insights/overview`
- `GET /analytics/insights/opportunities`
- `GET /analytics/insights/categories`
- `GET /analytics/insights/localities`
- `GET /analytics/insights/chains`

All endpoints accept:

- `window`: `last_7d`, `last_30d`, or `all`
- `locality` or `locality_code`
- `category` or `category_l2`
- `category_l1`
- `chain` or `chain_id`
- `store_id`
- `limit`
- `min_gap_score`

All responses include:

- `window`
- applied `filters`
- deterministic `generated_at`
- bounded results

## Helpers

- `buildMerchantInsightOverview(...)`
- `buildMerchantInsightOpportunities(...)`
- `buildMerchantCategoryInsights(...)`
- `buildMerchantLocalityInsights(...)`
- `buildMerchantChainInsights(...)`

## Aggregation Logic

The overview endpoint reports total matching signals, total opportunities, high-confidence opportunities, a compact top opportunity card, and a compact top category card.

The opportunities endpoint wraps Phase 20.3 opportunity objects in a dashboard-friendly response envelope.

Category and locality endpoints group opportunity cards and compute:

- opportunity count
- average gap score
- top gap label

The chain endpoint uses opportunity coverage evidence when present and computes:

- weighted coverage rate
- gap count
- top gap label

## Determinism

`generated_at` is derived from the newest included signal timestamp instead of wall-clock time. This keeps repeated reads stable for the same source data while still providing a freshness marker.

## Limitations

These endpoints are internal/admin analytics surfaces. They are not consumer-facing, not proof of market demand, and not a merchant recommendation engine by themselves. Real merchant dashboards still need authentication, authorization, billing gates, copy review, and production-like data validation.

## Verification

Covered by `tests/phase_20_4_merchant_insight_api.test.js`:

- overview aggregation
- opportunities wrapper filters and limits
- category aggregation
- locality aggregation
- chain aggregation
- filter preservation
- empty dataset safety
- no mutation
- deterministic output and endpoint validation
