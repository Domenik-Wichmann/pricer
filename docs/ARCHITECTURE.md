# Architecture

## Runtime flow
1. Daily import obtains the latest source price snapshot file.
2. The importer treats that file as a full-day snapshot, preserves each raw row, computes stable row and source-product identities, and updates the durable source-product registry.
3. Deterministic enrichment runs only for net-new or revalidation-needed source products and stores search-ready metadata for later phases.
4. Deterministic canonicalization builds additive canonical products and mappings without mutating source-product identity.
5. Hyper-rich enrichment can then attach additive semantic meaning per canonical fingerprint through a strict cache-first enrichment store, without changing canonical truth.
6. Phase M0 adds a parallel meal foundation on top of the shared backbone: ingredients, ingredient hierarchy, units, conversions, ingredient-specific unit rules, and product-to-ingredient bridge mappings remain separate from canonical retailer-product truth.
7. Meal-domain bridge helpers can project recipe quantities into edible quantities, purchasable quantities, and ingredient-level price estimates using mapped retailer products plus fallback provenance.
8. Phase DB0 defines the transition architecture for large relational datasets: Postgres is introduced as an additive sidecar for raw external source truth, normalized imports, joins, dedupe, and heavy canonical processing; Firestore remains the existing app-facing runtime and user-state store.
9. Phase DB1 adds the first sidecar Postgres foundation: local/dev connection support, migration tooling, health checks, and import metadata tables only.
10. User-entered shopping text is parsed in later phases against canonical products built on top of the Phase 1 backbone.
11. Low-confidence matching can escalate to AI in later phases.
12. Basket optimization, watchlists, notifications, monetization, and later recipe or planning layers sit on top of the matching layer and the explicit meal bridge.

## Data separation rule
For every user request preserve:
- raw intent
- parsed intent
- canonical mapping

For every source import preserve:
- raw snapshot row
- durable source-product identity
- deterministic enrichment metadata
- additive canonical enrichment metadata separate from canonical truth
- for future DB-backed imports, raw file/import metadata in Postgres before any normalization, dedupe, mapping, enrichment, review, or runtime read-model publish

For the live product pipeline preserve:
- current `kolkostruva.bg` ingest behavior
- current canonical product pipeline behavior
- current Firestore-backed runtime behavior
- current product search, shopping, price lookup, and basket outputs

## Reader boundary rule
Downstream code must choose its read layer explicitly:
- canonical truth only
- canonical truth plus applied disambiguation view
- canonical truth plus enrichment
- canonical truth plus applied disambiguation view plus enrichment

No helper should silently blur those layers.

## Meal boundary rule
- `canonical_products` represent retailer sellable truth.
- `ingredients` represent recipe and meal-planning truth.
- `product_ingredient_mappings` are the only bridge between those domains in Phase M0.
- Unit conversions and ingredient rules may become shared later, but they are meal-domain-owned in this phase.
- Recipe, component, and planning logic must build on the meal layer rather than mutating canonical product truth.

## Database boundary rule
- Firestore/flat store remains the current production runtime contract for compact product, meal, user, shopping-list, watchlist, and app-facing documents.
- Postgres is a sidecar in DB1 and early DB phases, not a replacement for the existing runtime.
- DB1 Postgres code is limited to sidecar connection, migrations, health checks, and general import metadata tables.
- Postgres is the required target for USDA/FoodData Central, Open Food Facts, future recipe-source imports, relational nutrition joins, large import batches, source dedupe, mapping-review staging, historical price aggregation, trends, and analytics.
- The existing `kolkostruva.bg -> Firestore -> App` flow remains unchanged and authoritative for current app behavior until an explicit later migration phase proves parity, performance, fallback safety, and no pricing/basket regressions.
- DB1 must not rewrite `phase1/store.js`, change product ingest behavior, remove Firestore usage, move canonical products, or switch current product/shopping/basket read paths to Postgres.
- The mobile app must read through Firebase Functions and app-facing read models, never raw Postgres tables.
- LLM enrichment must happen only after deterministic identity and dedupe, must be cached, and must not mutate canonical truth directly.

## Trust rule
Never present paid promotion as organic best value if it distorts price truth. Any future sponsored placement must be clearly labeled and must not suppress cheaper valid results.
