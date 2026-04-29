# PLAN2B Next Phase Readiness

Ready follow-on work:
- translate PLAN2B candidate rows into the existing Phase 15 basket-plan shape
- call the existing Phase 16 price lookup and optimizer wrappers without rebuilding optimizer math
- add explicit store and chain filters from user context once PLAN2C needs them
- layer substitution handling on top of candidate generation when a later phase requests it

Current state:
- one deterministic product-candidate-set bundle can be rebuilt per PLAN2A.1 net-requirement bundle
- approved DB3E ingredient-product mappings now bridge into runtime canonical product ids and current price records
- package-size normalization and overage math are explicit and reviewable
- covered, missing-mapping, missing-size, and missing-price rows stay visible instead of being silently dropped

Known conservative boundary:
- PLAN2B reads runtime product and price data but does not call the basket optimizer yet
- product identity still depends on the current DB3E-to-runtime canonical/source id bridge assumptions
- substitution groups remain out of scope until a later PLAN2 slice asks for them
