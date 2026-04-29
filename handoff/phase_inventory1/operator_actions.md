# INVENTORY1 Operator Actions

No mandatory operator actions are required for repo completeness.

Optional local checks:
1. Run `npm run inventory1:seed-inventory -- --user-id=<ux1_seed_user_id> --json`.
2. Inspect `user_inventories` and `inventory_items` in local Postgres if you want to review the seeded sidecar rows manually.
