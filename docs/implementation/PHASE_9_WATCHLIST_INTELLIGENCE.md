# Phase 9 Implementation Contract

## Goal
Add deterministic watchlist intelligence on top of existing watchlist entries, Phase 6 alerts, and daily price history.

## Scope
- recurring price-drop interval detection with confidence
- smart nudges with cooldowns
- significance and good-deal evaluation
- target-price handling
- list auto-refresh diff direction
- daily per-user summary generation
- daily and weekly jobs
- summary, insights, and target-price request handlers

## Flat collections

### `watchlist_profiles`
- `watchlist_key`
- `user_id`
- `source_product_id`
- `display_name`
- `target_price`
- `current_price`
- `last_seen_date`
- `recurring_interval_days`
- `recurrence_confidence`
- `last_nudge_sent_at`
- `last_nudge_type`
- `last_significance_level`
- `last_good_deal_flag`
- `last_list_diff_direction`
- `device_token`
- `updated_at`

### `watchlist_recurring_patterns`
- `recurrence_id`
- `user_id`
- `source_product_id`
- `recurring_interval_days`
- `recurrence_confidence`
- `price_observation_count`
- `trigger_event_count`
- `latest_trigger_date`
- `updated_at`

### `watchlist_insight_events`
- `insight_id`
- `user_id`
- `source_product_id`
- `snapshot_date`
- `display_name`
- `current_price`
- `previous_price`
- `target_price`
- `price_delta`
- `price_delta_percent`
- `drop_amount`
- `drop_percent`
- `significance_level`
- `good_deal_flag`
- `is_target_hit`
- `recurring_interval_days`
- `recurrence_confidence`
- `nudge_type`
- `cooldown_applied`
- `list_diff_direction`
- `drop_alert_id`
- `created_at`

### `watchlist_daily_summaries`
- `summary_id`
- `user_id`
- `snapshot_date`
- `item_count`
- `drop_count`
- `target_hit_count`
- `good_deal_count`
- `nudge_count`
- `summary_json`
- `created_at`

## Jobs
- `runDailyWatchlistIntelligence(...)`
- `runWeeklyIntervalRecompute(...)`

## Endpoints
- `handleWatchlistSummaryRequest(...)`
- `handleWatchlistInsightsRequest(...)`
- `handleSetTargetPriceRequest(...)`

## Rules
- deterministic only
- no LLM usage
- low spam through per-item cooldown handling
- built on existing watchlist entry inputs plus Phase 6 alert detection
