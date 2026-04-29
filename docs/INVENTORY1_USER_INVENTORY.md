# INVENTORY1 User Inventory Foundation

INVENTORY1 adds a Postgres-only sidecar inventory layer so future meal-plan shopping and basket work can subtract what a user already has before product resolution and optimization begin.

Current scope:
- no receipt scanning
- no UI
- no Firestore
- no planner integration yet
- no basket optimizer changes

Current derived integration:
- PLAN2A.1 may read INVENTORY1 rows to build inventory-adjusted net meal-plan requirements
- that subtraction is read-only and does not mutate inventory quantities

## Tables

### `user_inventories`
- one deterministic inventory per `user_id`
- linked to one UX1 `profile_id`
- stable `inventory_key` derived from `user_id`

### `inventory_items`
- prefer canonical `ingredient_id` tracking when the ingredient is known
- fall back to `product_id` or `product_name_snapshot` when no canonical ingredient link exists yet
- track quantities in grams and/or units
- preserve storage context with `pantry`, `fridge`, or `freezer`
- preserve perishability hints with `short`, `medium`, or `long`
- store `estimated_remaining_ratio` and optional `estimated_expiry_date`

INVENTORY1 does not hard-delete item history. When quantity reaches zero, the repository zeros the stored quantities and remaining ratio and hides the row from default active-item listing.

## PLAN2A.1 Netting Boundary

PLAN2A.1 introduces a derived planner adapter layer:

```text
meal_plan_requirements
+ user_inventory
-> meal_plan_net_requirements
```

That layer:
- reads active inventory items with `quantity_grams > 0`
- subtracts grams from PLAN2A requirement items by canonical `ingredient_id` first and `ingredient_key_snapshot` second
- leaves source `meal_plan_requirements` unchanged
- leaves `inventory_items` unchanged
- recomputes only the net shopping quantity estimate that later product-mapping work will consume

## Repository

Owning files:
- `functions/src/db/users/user_inventory_repository.js`
- `app/functions/src/db/users/user_inventory_repository.js`

Supported behavior:
- create/get inventory by `user_id`
- add inventory item
- update quantity
- reduce quantity
- soft-remove item when quantity reaches zero
- list inventory items
- merge duplicate items conservatively within the same logical identity and storage context

Duplicate merging is intentionally storage-aware so pantry, fridge, and freezer stock do not collapse into one row.

## Expiry Estimation

INVENTORY1 looks for ingredient shelf-life hints in canonical ingredient metadata and derives:

`estimated_expiry_date = base_date + shelf_life_days`

When no shelf-life hint exists, expiry remains null.

## Seed CLI

Script:
- `scripts/inventory1_seed_inventory.js`

Command:
- `npm run inventory1:seed-inventory -- --user-id=<id>`

Supported flags:
- `--user-id=<id>`
- `--dry-run`
- `--json`
- `--out=path/to/report.json`

Seed examples:
- 500g rice
- 200g chicken breast
- 1 bottle soy sauce
- 300g yogurt

The seed is deterministic for one user: reruns reset the same logical inventory rows instead of doubling the quantities.

## Tests

Primary test file:
- `tests/inventory1_user_inventory.test.js`

Coverage includes:
- inventory creation
- ingredient item add/merge
- quantity update and reduction
- zero-quantity soft removal
- expiry estimation
- ingredient vs product fallback
- deterministic seed reruns
- no planner or Firestore interaction

## Boundaries

INVENTORY1 is sidecar state only. It does not:
- change runtime recommendation behavior
- alter PLAN1 or PLAN2A outputs
- mutate inventory during PLAN2A.1 netting
- call the basket optimizer
- resolve products to stores
- scan receipts
- create ingredients
