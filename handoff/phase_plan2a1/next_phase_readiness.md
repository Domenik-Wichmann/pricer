# PLAN2A.1 Next Phase Readiness

Ready follow-on work:
- ingredient-level product candidate bridging from net requirement items
- store- and chain-aware product pricing over the existing basket stack
- inventory-aware requirement filtering before optimizer entry
- explicit inventory consumption only when a later phase requests committed purchase/cook flows

Current state:
- one deterministic net-requirement bundle can be rebuilt per PLAN2A requirement bundle
- active inventory grams subtract from gross requirement grams without mutating inventory rows
- fully covered items are explicitly marked `covered_by_inventory`
- partial, missing-ingredient, and missing-quantity rows remain visible for later adapters and review

Known conservative boundary:
- PLAN2A.1 only subtracts grams; unit-only inventory rows are not consumed here
- net requirement rows are derived planner state only and do not yet bridge into product mapping or optimizer calls
