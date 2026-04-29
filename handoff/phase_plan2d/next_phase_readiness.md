# PLAN2D Next Phase Readiness

Ready follow-on work:
- flow preferred or avoided chain context into PLAN2C through existing convenience and optimizer options
- add substitution-aware widening above PLAN2B candidate generation without changing optimizer internals
- add explanation, deal, and export-friendly overlays on top of PLAN2C optimized basket outputs
- add richer operator reporting over `meal_plan_shopping_runs` without replacing the underlying PLAN1 or PLAN2 artifact tables

Current state:
- one deterministic orchestration row can now be rebuilt per user and plan
- PLAN2D reuses the existing PLAN1, PLAN2A, PLAN2A.1, PLAN2B, and PLAN2C modules directly
- optimizer behavior still comes from the existing Phase 16 single-store and multi-store optimizer path
- missing-product and missing-price outcomes remain explicit partial results instead of being hidden

Known conservative boundary:
- PLAN2D is orchestration only; it does not add a second shopping stack
- top-level PLAN2D `dry_run` suppresses orchestration-run persistence, but lower-level deterministic sidecar artifacts still follow their normal upsert path so the existing modules can chain safely
- store and substitution polish remain future work rather than being mixed into this coordinator
