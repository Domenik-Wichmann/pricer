# Next Phase Readiness

## Ready now
- The backend can turn canonical basket candidates into explicit current-price lookup output with priced, stale, and missing states.
- Basket plans can now be paired with price lookup results without mutating planner output.
- Future optimizers can consume stable price records, best-price picks, and freshness status through one bounded contract.

## Constraints to preserve
- Keep canonical truth and canonical mappings immutable.
- Keep enrichment additive only.
- Keep price lookup deterministic and read-only.
- Keep freshness explicit; do not invent missing prices.
- Keep optimization logic out of the lookup layer.

## Recommended next focus
1. Build the first single-store basket optimizer on top of basket-plan plus price-lookup output.
2. Decide how stale and missing items should affect optimization scoring and fallback behavior.
3. Add runtime reporting for price coverage, stale rate, and chain-level price availability once live traffic uses the new route.
