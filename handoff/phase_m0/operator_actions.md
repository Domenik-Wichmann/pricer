# Operator Actions

## Purpose
Phase M0 is implemented in code and locally validated at the targeted test level. No new secrets or external services are required to keep the phase usable in local and test environments.

## Ordered steps
1. Run the final repo checks after pulling the finished branch:
   - `npm run verify`
   - `npm run validate:docs`
   - `npm run test:phase_m0`
2. Deploy the updated Firebase Functions package if you want the mirrored runtime exports available in the live backend package.
3. Preserve the phase boundary:
   - do not fold ingredients into `canonical_products`
   - do not skip the explicit `product_ingredient_mappings` bridge
   - do not add recipe or planning logic into the M0 modules
4. If Phase M1 starts next, build recipe and component ingest on top of the new meal-domain collections rather than adding recipe fields to canonical product records.

## No operator-owned blockers
- No new API keys
- No new Firebase config
- No schema migration outside the existing flat store contract

## Cautions
- Keep edits mirrored in both backend trees:
  - `app/functions/src/...`
  - `functions/src/...`
- Treat category-average ingredient pricing as an estimate only; it is intentionally lower-trust than mapped product prices.
