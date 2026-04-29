# Phase 17.1 Implementation Contract

## Goal
Upgrade saved shopping lists to owner-scoped persistent records while preserving the Phase 17 routes and stateless optimization behavior.

## Runtime modules
- `app/functions/src/phase17/saved_lists.js`
- `functions/src/phase17/saved_lists.js`
- `app/functions/src/index.js`
- `functions/src/index.js`
- `functions/index.js`

## Saved-list record
New records contain:

- `list_id`
- `owner_id`
- `owner_type`
- `name`
- `items`
- `created_at`
- `updated_at`

Missing owner fields on old records are treated as:

- `owner_id = "anonymous"`
- `owner_type = "anonymous"`

## Owner context
The request owner is resolved by `resolveOwnerContextFromRequest(req)` from:

- `x-pricer-owner-id`
- `x-pricer-owner-type`

Allowed owner types are:

- `anonymous`
- `user`
- `system`

Missing or invalid owner context defaults to anonymous.

## Access rules
- Normal owners can only list, read, update, delete, or optimize their own lists.
- Cross-owner access returns the same bounded not-found response used for missing lists.
- `system` owner context can access all saved lists for tests/admin flows.

## Safety boundaries
- Routes remain unchanged.
- Saved lists store only ownership metadata and user input.
- Optimization results are never persisted.
- Optimizing a saved list reruns the existing basket pipeline fresh.
- Resolver, price, basket, optimizer, explanation, metrics, analytics, and health behavior remain unchanged.
