# Phase 17 Implementation Contract

## Goal
Add basic saved shopping-list persistence and reuse while keeping optimization stateless.

## Runtime modules
- `app/functions/src/phase17/saved_lists.js`
- `functions/src/phase17/saved_lists.js`
- `app/functions/src/phase1/store.js`
- `functions/src/phase1/store.js`
- `app/functions/src/index.js`
- `functions/src/index.js`
- `functions/index.js`

## Storage
New collection:

- `saved_lists_store`

Record fields:

- `list_id`
- `name`
- `items`
- `created_at`
- `updated_at`

## API endpoints
- `POST /lists`
- `GET /lists`
- `GET /lists/:id`
- `PATCH /lists/:id`
- `DELETE /lists/:id`
- `POST /lists/:id/optimize`

## Safety boundaries
- Store only user input.
- Do not persist canonical products.
- Do not persist optimization results.
- Do not mutate resolver, planner, price, optimizer, explanation, convenience, metrics, analytics, or health logic.
- Re-run the pipeline fresh for every saved-list optimization request.
