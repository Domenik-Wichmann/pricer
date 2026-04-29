# INVENTORY1 Next Phase Readiness

Ready follow-on work:
- inventory subtraction during future meal-plan shopping adapters
- receipt-driven inventory updates
- expiry-aware depletion and freshness scoring
- planner- or basket-side inventory consumption once explicitly requested

Current state:
- one deterministic sidecar inventory can be created per UX1 profile/user
- ingredient-first tracking works with product-name fallback
- duplicate logical items merge within the same storage context
- zero-quantity removals preserve row history instead of hard deletion

Known conservative boundary:
- expiry estimation only works when canonical ingredient metadata exposes shelf-life hints
- no planner, shopping, or optimizer caller reads inventory yet
