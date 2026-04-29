# Next Agent Handoff: April 24, 2026

This document exists because the current chat context is near compaction. Read this first, then read `AGENTS.md`, `docs/REPO_MAP.md`, and the active phase doc for any new request.

## Working Directory

Repo root:

```text
c:\dev\Pricer
```

Shell:

```text
PowerShell
```

Current date in this session:

```text
2026-04-24
```

## Operating Rules That Matter Most

- Read the relevant phase document and implementation document before changing code.
- Treat repository truth as primary. If docs and repo reality conflict, update docs instead of silently drifting.
- Preserve history. Append decisions and handoffs; do not erase prior context without trace.
- Completed phases must leave updated docs, changelog, decision log entries when relevant, test results, and a `handoff/phase_X/` folder.
- Backend code is mirrored in two trees:
  - `app/functions/src`
  - `functions/src`
- For backend runtime changes, update both trees unless the task explicitly says otherwise.
- Public helpers usually need export wiring in both:
  - `app/functions/src/index.js`
  - `functions/src/index.js`
- Firebase HTTP routes live in:
  - `functions/index.js`
- Use `rg` first for searches.
- Use `apply_patch` for manual edits.
- Do not revert unrelated dirty worktree changes.

## Current High-Level State

The latest completed and verified user-facing phase is:

```text
Phase 17.3: Simple Deal Detection
```

Phase 17.3 adds deterministic deal signals:

- `good`
- `normal`
- `expensive`

Signals compare current price to available recent average price:

- good: `current_price <= avg_price * 0.8`
- expensive: `current_price >= avg_price * 1.2`
- normal: otherwise

It is a signal layer only. It does not send notifications, create complex alert rules, mutate price records, or require user setup beyond optional `target_price`.

## Recent Phase Chain

### Phase 17.0: Saved Shopping Lists

Docs:

- `docs/PHASE_17_SAVED_SHOPPING_LISTS.md`
- `docs/implementation/PHASE_17_SAVED_SHOPPING_LISTS.md`
- `handoff/phase_17/`

Runtime:

- `app/functions/src/phase17/saved_lists.js`
- `functions/src/phase17/saved_lists.js`

Added:

- `saved_lists_store`
- `POST /lists`
- `GET /lists`
- `GET /lists/:id`
- `PATCH /lists/:id`
- `DELETE /lists/:id`
- `POST /lists/:id/optimize`

Important rule:

- Saved lists store user input only.
- Saved-list optimization reruns resolver, planner, price lookup, and optimizer fresh.
- Optimizer outputs are not persisted.

### Phase 17.1: Persistent Lists + Ownership Prep

Docs:

- `docs/PHASE_17_1_PERSISTENT_LISTS.md`
- `docs/implementation/PHASE_17_1_PERSISTENT_LISTS.md`
- `handoff/phase_17_1/`

Added owner fields to saved lists:

- `owner_id`
- `owner_type`

Temporary owner headers:

- `x-pricer-owner-id`
- `x-pricer-owner-type`

Defaults:

- `owner_id = "anonymous"`
- `owner_type = "anonymous"`

Behavior:

- Owners only see/update/delete/optimize their own saved lists.
- Cross-owner access returns bounded `404`.
- Old ownerless records are treated as anonymous.
- `system` owner context may access all records for tests/admin helpers.

### Phase 17.2: Watchlist / Price Tracker Foundation

Docs:

- `docs/PHASE_17_2_WATCHLIST_TRACKER.md`
- `docs/implementation/PHASE_17_2_WATCHLIST_TRACKER.md`
- `handoff/phase_17_2/`

Runtime:

- `app/functions/src/phase17/watchlist.js`
- `functions/src/phase17/watchlist.js`

Added:

- `watchlist_store`
- owner-scoped watchlist CRUD helpers
- `buildWatchlistPriceView(...)`

Endpoints:

- `POST /watchlist`
- `GET /watchlist`
- `GET /watchlist/prices`
- `GET /watchlist/:id`
- `PATCH /watchlist/:id`
- `DELETE /watchlist/:id`

Important route-order note:

- `functions/index.js` must keep fixed watchlist routes such as `/watchlist/prices`, `/watchlist/summary`, `/watchlist/insights`, and `/watchlist/target-price` before dynamic `/watchlist/:id`.

Important rule:

- `watchlist_store` stores owner metadata, canonical product reference, label, optional target price, optional notes, and timestamps.
- It does not store latest prices, price snapshots, alerts, or notifications.
- Price tracker views read current prices via Phase 16.0 price lookup.

### Phase 17.3: Simple Deal Detection

Docs:

- `docs/PHASE_17_3_SIMPLE_DEAL_DETECTION.md`
- `docs/implementation/PHASE_17_3_SIMPLE_DEAL_DETECTION.md`
- `handoff/phase_17_3/`

Runtime:

- `app/functions/src/phase17/deals.js`
- `functions/src/phase17/deals.js`
- updated `phase17/watchlist.js`
- updated `phase16/basket_optimizer.js`

Added helpers:

- `classifyProductDeal(...)`
- `annotateOptimizerResultWithDeals(...)`
- `handleDealCheckRequest(...)`
- `summarizeDeals(...)`

Endpoint:

- `POST /products/deal-check`

Integrations:

- `GET /watchlist/prices` now includes `deal` per item.
- `POST /basket/optimize` now annotates optimizer items with `deal`.
- Optimizer output now includes `basket_deal_summary` inside `optimizer_result`.

Important rule:

- Deal outputs are read-time annotations. They are not persisted.
- Deal detection does not mutate price data.
- Deal detection is not predictive and is not a guarantee of future prices.

## Important Runtime Files

Start here for Phase 17-related work:

```text
app/functions/src/phase17/saved_lists.js
functions/src/phase17/saved_lists.js
app/functions/src/phase17/watchlist.js
functions/src/phase17/watchlist.js
app/functions/src/phase17/deals.js
functions/src/phase17/deals.js
```

Shared store:

```text
app/functions/src/phase1/store.js
functions/src/phase1/store.js
```

Basket and price integration:

```text
app/functions/src/phase16/price_lookup.js
functions/src/phase16/price_lookup.js
app/functions/src/phase16/basket_optimizer.js
functions/src/phase16/basket_optimizer.js
```

Firebase routes:

```text
functions/index.js
```

Aggregate exports:

```text
app/functions/src/index.js
functions/src/index.js
```

## Tests Recently Added

Phase 17 tests:

```text
tests/phase_17_saved_shopping_lists.test.js
tests/phase_17_1_persistent_lists.test.js
tests/phase_17_2_watchlist_tracker.test.js
tests/phase_17_3_deal_detection.test.js
```

Package scripts:

```text
npm run test:phase17
npm run test:phase17_1
npm run test:phase17_2
npm run test:phase17_3
```

`tests/run_all.js` includes all of these.

## Last Known Verification

The last completed run before this handoff:

```text
node tests/phase_17_3_deal_detection.test.js
node tests/phase_17_2_watchlist_tracker.test.js
node tests/phase_17_1_persistent_lists.test.js
node tests/phase_17_saved_shopping_lists.test.js
node tests/phase_16_7_basket_health.test.js
node tests/phase_16_6_basket_analytics.test.js
node tests/phase_16_5_basket_quality.test.js
node tests/phase_16_4_convenience_scoring.test.js
node tests/phase_16_3_basket_explanation.test.js
node tests/phase_16_2_multi_store_optimizer.test.js
node tests/phase_16_1_basket_optimizer.test.js
node tests/phase_16_0_price_lookup.test.js
npm run validate:docs
node -e "require('./app/functions/src/index.js'); require('./functions/src/index.js'); require('./functions/index.js'); console.log('runtime exports and firebase entry loaded')"
npm test
npm run validate:docs
```

Results:

- Phase 17.3: 9 passed, 0 failed
- Phase 17.2: 10 passed, 0 failed
- Phase 17.1: 10 passed, 0 failed
- Phase 17.0: 9 passed, 0 failed
- Phase 16.7 through 16.0 targeted regressions: passed
- Runtime export load check: passed
- Full `npm test`: passed
- Final `npm run validate:docs`: passed

Recorded test run:

```text
docs/test_runs/phase_17_3_2026-04-24.json
```

## Dirty Worktree Warning

The worktree is very dirty and contains many changes from earlier phases and parallel DB/USDA/ingredient work. Do not assume every dirty file belongs to the next task.

Known categories visible in `git status`:

- Phase 16.4 through 16.7 files and docs.
- Phase 17.0 through 17.3 files and docs.
- DB2/DB2.5/DB3-related USDA and ingredient files.
- Firebase deployment files.
- `node_modules/`, `runtime_data/`, `datasets/`, `tmp/`, and other local/generated directories.

Do not revert unrelated files. If you need to know what a task owns, use the relevant phase docs and `docs/REPO_MAP.md`.

## Specific Caveats From Recent Work

### Export name collision

There was a name collision around `validateReviewTransition`.

Current intended export behavior:

- DB2.5 cluster review tests expect:

```js
validateUsdaClusterReviewTransition
```

and the exported alias:

```js
validateReviewTransition
```

from `db/usda/cluster_review_service.js`.

Do not reintroduce a destructured `validateReviewTransition` from `phase6/disambiguation`; that module does not export it.

### DB1 fake migration client

`tests/db1_postgres_foundation.test.js` was updated so its fake migration client accepts newer USDA cluster migration SQL containing:

- `usda_food_clusters`
- `usda_food_cluster_review_history`

This was needed for full-suite compatibility with later DB2.5 migrations.

### Basket output shape changed

Phase 17.3 intentionally adds deal annotations to basket optimizer output:

```json
{
  "deal": {
    "deal_level": "good",
    "deal_score": 0.82,
    "reason": "price is 25% below recent average",
    "target_hit": false,
    "comparison": {
      "avg_price": 3.3,
      "min_price": 2.4,
      "percent_difference_from_avg": -0.25
    }
  }
}
```

and:

```json
{
  "basket_deal_summary": {
    "good_deals_count": 2,
    "expensive_items_count": 1,
    "normal_items_count": 3
  }
}
```

This is additive and expected.

## Current API Surface From Recent Phases

Saved lists:

```text
POST /lists
GET /lists
GET /lists/:id
PATCH /lists/:id
DELETE /lists/:id
POST /lists/:id/optimize
```

Watchlist tracker:

```text
POST /watchlist
GET /watchlist
GET /watchlist/prices
GET /watchlist/:id
PATCH /watchlist/:id
DELETE /watchlist/:id
```

Existing Phase 9 watchlist intelligence:

```text
POST /watchlist/target-price
GET /watchlist/summary
GET /watchlist/insights
```

Deal check:

```text
POST /products/deal-check
```

Basket:

```text
POST /basket/optimize
```

## Likely Next Work

The next reasonable product directions are:

1. Firebase Auth-backed owner resolution for saved lists and watchlist.
2. Anonymous-to-user claiming for saved lists/watchlist.
3. Real deal-alert rules and notification cooldowns on top of Phase 17.3 signals.
4. FCM token registration and push delivery.
5. UI integration for saved lists, watchlist tracker, and deal labels.
6. Better historical baselines for deal detection once richer price history is available.

Still out of scope unless explicitly requested:

- Complex alert-rule builders.
- Notification delivery.
- Prediction or forecasting.
- Currency conversion.
- Mutating canonical products or price records.

## Local Postgres

The active `docker-compose.yml` defines local Postgres:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: pricer-postgres
    environment:
      POSTGRES_DB: pricer_dev
      POSTGRES_USER: pricer
      POSTGRES_PASSWORD: pricer_dev_password
    ports:
      - "5433:5432"
```

Use:

```text
npm run db:health
npm run db:migrate
```

when a DB phase asks for it. Normal `npm test` does not require a configured Postgres instance; real Postgres tests skip if not configured.

## First Commands For The Next Agent

Recommended first read:

```powershell
Get-Content -Raw AGENTS.md
Get-Content -Raw docs/REPO_MAP.md
Get-Content -Raw docs/CURRENT_STATE.md
Get-Content -Raw docs/PHASE_17_3_SIMPLE_DEAL_DETECTION.md
```

Recommended sanity checks before new edits:

```powershell
npm run validate:docs
node -e "require('./app/functions/src/index.js'); require('./functions/src/index.js'); require('./functions/index.js'); console.log('runtime exports and firebase entry loaded')"
```

If touching Phase 17:

```powershell
node tests/phase_17_3_deal_detection.test.js
node tests/phase_17_2_watchlist_tracker.test.js
node tests/phase_17_1_persistent_lists.test.js
node tests/phase_17_saved_shopping_lists.test.js
```

If touching basket or price lookup:

```powershell
node tests/phase_16_0_price_lookup.test.js
node tests/phase_16_1_basket_optimizer.test.js
node tests/phase_16_2_multi_store_optimizer.test.js
node tests/phase_16_3_basket_explanation.test.js
node tests/phase_16_4_convenience_scoring.test.js
node tests/phase_16_5_basket_quality.test.js
node tests/phase_16_6_basket_analytics.test.js
node tests/phase_16_7_basket_health.test.js
```

Run full suite when practical:

```powershell
npm test
```

