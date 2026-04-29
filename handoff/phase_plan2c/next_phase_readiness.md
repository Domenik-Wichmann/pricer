# PLAN2C Next Phase Readiness

Ready follow-on work:
- adapt optimized basket outputs into the existing saved-list or basket display surfaces only when a later PLAN2 phase explicitly asks for it
- add explicit chain and store preference filters from user context when PLAN2D needs deterministic narrowing
- layer substitution handling above PLAN2B and PLAN2C when a later phase requests fallback candidates
- add comparison or reporting views over optimized basket outputs without changing optimizer internals

Current state:
- one deterministic optimized-basket bundle can be rebuilt per PLAN2B candidate-set bundle
- PLAN2C already reuses the existing runtime canonical-product price lookup plus the existing Phase 16 single-store and multi-store optimizer functions
- package-count semantics are preserved by encoding `units_needed` into synthetic optimizer price rows instead of modifying optimizer math
- covered, missing-product, missing-price, optimizer-excluded, and inventory-covered states stay explicit instead of being hidden by optimization

Known conservative boundary:
- PLAN2C reuses the existing optimizer only through explicit CLI or service invocation
- no new optimizer algorithm, sponsored ranking, or runtime basket mutation was introduced
- candidate quality still depends on upstream PLAN2B mapping and package-size completeness
- store and chain choice comes from the existing optimizer output only; no new selection policy was added
