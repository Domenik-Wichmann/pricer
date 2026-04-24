# Phase DB0 Postgres Transition Architecture

Date: 2026-04-24
Status: IMPLEMENTED AS ARCHITECTURE / DESIGN ONLY
Scope: introduce the target hybrid persistence strategy; no code, migrations, or data movement in DB0

## 1. Purpose

DB0 defines how Pricer should introduce Postgres without breaking the current Firestore-compatible backend.

The target architecture is:

```text
Postgres = relational source truth, heavy imports, joins, dedupe, canonical processing
Firestore = app-facing cache, user state, mobile-friendly read models
Firebase Functions = API/service boundary between storage and app flows
```

DB0 does not migrate existing data. It documents the contract future DB phases must follow before USDA, Open Food Facts, recipe sources, and larger canonical processing datasets are ingested.

Non-negotiable DB0 amendment:

```text
DO NOT DISTURB LIVE PRODUCT PIPELINE
```

The current live product backbone is the `kolkostruva.bg` ingest, canonical product pipeline, Firestore-backed runtime, shopping flows, and basket logic. Those flows remain unchanged, stable, and authoritative for current app behavior during DB1 and early DB phases.

## 2. Current Repo Truth

Repo inspection found:

- `docs/DATA_MODEL.md` defines a flat backend data backbone with Firestore-compatible top-level collections.
- `functions/src/phase1/store.js` and `app/functions/src/phase1/store.js` implement the same store abstraction: in-memory for tests, JSON for local development, Firestore for production.
- Production Firestore maps each flat collection to one document per record. Composite document IDs are generated from stable identity fields.
- `migrations/` contains only `.gitkeep`; there is no active relational migration history.
- `dataconnect/schema/schema.gql` is not an active Pricer data model.
- Backend runtime code is duplicated under `functions/src/` and `app/functions/src/`; future code phases must keep both trees mirrored unless a later phase removes that duplication explicitly.
- Phase M0 meal foundations exist in both runtime trees under `meal/`: ingredient families, ingredient categories, ingredients, units, conversions, ingredient unit rules, and product-to-ingredient mappings.
- `canonical_products` represent retailer sellable product truth. `ingredients` represent meal and recipe truth. `product_ingredient_mappings` are the bridge.
- Existing product enrichment is additive and cache-first through `canonical_enrichment_store`.
- Existing disambiguation uses queue and decision records before any applied view; this is the pattern future mapping-review queues should reuse.
- `datasets/` contains large relational/raw sources: USDA/FoodData Central, Open Food Facts JSONL/API samples, MealDB snapshots, and CocktailDB snapshots.

The important constraint is that Pricer already has a working product and shopping runtime. Postgres must be added beside that runtime first, not as a big-bang replacement.

The current live price-source name is `kolkostruva.bg`. Any spelling such as `cocostruva` is incorrect and must not appear in implementation plans, env names, comments, or docs.

## 3. Why Firestore Alone Is No Longer Enough

Firestore remains useful for compact documents and user state, but it is a poor fit for USDA-scale relational imports.

Dataset truth:

- USDA/FoodData Central is about `3.1 GB`.
- `food.csv` has `2,021,090` rows.
- `food_nutrient.csv` has `26,235,946` rows.
- `branded_food.csv` has `1,947,155` rows.
- Basic nutrition requires joins across `food`, `food_nutrient`, `nutrient`, `food_portion`, `measure_unit`, and category/subtype tables.

Putting those rows into Firestore would create painful cost, indexing, reimport, join, and audit problems. It would also blur raw source truth with mobile runtime read models. Firestore should receive only compact, runtime-safe projections after Postgres import, normalization, dedupe, mapping, and review.

## 4. Target Hybrid Architecture

The target flow is:

```text
raw external file/API
  -> Postgres raw import metadata and source tables
  -> deterministic identity and source dedupe
  -> canonical candidate matching
  -> net-new candidate/enrichment decision
  -> mapping review/adjudication when uncertain
  -> runtime-safe read model
  -> Firestore app cache when mobile/offline-friendly docs are needed
  -> Firebase Functions API
  -> mobile app
```

Backend services should decide explicitly per use case:

- Read Firestore when serving user state, existing product views, cached cards, saved plans, and small runtime documents.
- Read Postgres when performing imports, relational joins, dedupe, source audits, nutrition calculations, mapping proposal generation, and batch rebuilds.
- Publish Firestore cache documents from Postgres only after data is normalized, confidence-scored, and marked runtime-safe.

The mobile app must not query raw Postgres tables directly.

## Postgres Sidecar Introduction Strategy

Postgres is introduced as a side system, not as a replacement.

```text
Postgres = sidecar for new capabilities
Firestore = existing runtime, unchanged
```

Canonical data flow:

```text
Existing system (unchanged):

kolkostruva -> Firestore -> App

New system (sidecar):

External datasets (USDA, OFF, recipes)
        |
        v
Postgres (raw + normalized + relational)
        |
        v
Backend processing
        |
        v
Firestore (compact read models, optional)
        |
        v
App
```

DB1 and early DB phases must not alter the existing `kolkostruva.bg` ingest, canonical product resolution, product search, shopping-list resolution, price lookup, or basket outputs. Postgres may be introduced only for additive data capabilities until parity, fallback, performance, and regression tests prove a read path is safe to move.

## 5. Postgres Responsibilities

Postgres should own:

- raw external dataset import metadata
- raw-file references, source checksums, import batches, row counts, and import status
- normalized source tables for USDA/FoodData Central
- normalized source tables for Open Food Facts products and barcodes
- relational nutrition joins and macro extraction
- source-level dedupe keys and canonical candidate matching tables
- mapping review queues for USDA food to ingredient, OFF product to canonical product, recipe ingredient to canonical ingredient, and product to ingredient proposals when needed
- enrichment cache metadata for Postgres-owned candidate entities
- future recipe-source tables and canonical recipe processing tables
- generated runtime read-model staging tables before publishing to Firestore
- audit and rebuild history for heavy imports

Postgres may later mirror product/price/canonical product data, but that should not be DB1. Product runtime currently works through the flat store and should be left intact until relational source imports prove stable.

Postgres should handle first:

- USDA nutrition datasets
- Open Food Facts imports
- recipe datasets
- ingredient nutrition mapping
- import batch tracking
- dedupe pipelines for new external datasets
- enrichment cache metadata for new candidate concepts
- historical price aggregation, optionally and only as a mirror

Postgres should not handle first:

- current live product reads
- current shopping queries
- current canonical product resolution
- current basket logic
- current live Firestore product runtime

## 6. Firestore Responsibilities

Firestore should continue to own:

- user state
- anonymous shopping lists and watchlists
- billing profile cache and user entitlement read models
- saved meal plans, saved recipes, and user-authored lightweight recipe docs when introduced
- app-facing cached product cards
- app-facing cached ingredient cards
- app-facing cached recipe cards
- compact nutrition summaries per ingredient/recipe/product when marked runtime-safe
- canonical ingredient documents needed by mobile flows
- reviewed bridge records that runtime services need quickly
- small analytics/user-feedback documents where existing flat patterns already work

Firestore should not store raw USDA nutrient rows, raw Open Food Facts dumps, huge source JSON, lab method tables, or relational join-heavy data.

Firestore must remain:

- app-facing runtime
- user state storage
- shopping-list storage
- watchlist storage
- cached product summaries
- cached ingredient summaries
- saved meal plans
- compact runtime read-model storage

## Mirror vs Migrate

DB1 must not migrate existing product data.

Instead, future phases may optionally mirror selected product, price, or canonical data into Postgres for analysis, historical aggregation, parity checks, and future migration evaluation.

Mirror means:

- copy selected data from the existing authoritative runtime into Postgres
- keep Firestore product data intact
- keep current read paths unchanged
- keep current product search and basket services reading the same sources they read today
- validate parity before any consumer can opt into Postgres reads

Migrate means:

- changing the authoritative source or runtime read path
- replacing Firestore product data with Postgres-backed product data
- changing product search, shopping, or basket behavior

Migration is explicitly out of scope for DB1 and early DB phases.

## 7. Source Truth vs Runtime Read Models

Raw source truth is immutable input material. Runtime read models are Pricer-owned outputs.

Every imported source field must be classified as one of:

- Raw source truth: stored unchanged or referenced by immutable file metadata.
- Normalized deterministic field: cleaned by deterministic rules, with source provenance.
- Canonical mapping field: linked to `canonical_product_id`, `ingredient_id`, `recipe_id`, `component_id`, or another Pricer entity.
- LLM-enriched semantic field: inferred, cached, versioned, confidence-scored, and reviewable.
- Runtime-safe field: approved for shopping, recipe, nutrition, or search logic.
- Display-only field: safe to show, not safe for core logic.

Runtime flows should read Pricer-owned views, not raw third-party tables.

## 8. Dedupe-First Ingest Contract

All future ingests must follow:

```text
1. raw import
2. source row/entity identity
3. deterministic normalization
4. source-level dedupe
5. canonical candidate matching
6. existing canonical link when matched
7. net-new candidate creation when unmatched
8. LLM enrichment only for net-new or enrichment-missing entities
9. confidence scoring
10. review/adjudication when uncertain
11. runtime-safe read-model publish
```

Likely identity/dedupe keys:

- USDA foods: `source = usda`, `fdc_id`; candidate dedupe by normalized `description + data_type + food_category_id` only for proposal grouping, not replacing `fdc_id`.
- USDA nutrients: `nutrient.id`; food nutrient fact identity by `food_nutrient.id` or `fdc_id + nutrient_id + derivation_id` where needed.
- USDA portions: `food_portion.id`; candidate equivalent by `fdc_id + measure_unit_id + modifier + gram_weight`.
- Open Food Facts products: `code` barcode plus `source = open_food_facts`; dedupe by barcode first, normalized name/brand/category only for candidate matching.
- Retailer products: existing `source_product_id`, chain/product code, and Phase 6 dedupe bucket rules remain authoritative.
- Canonical ingredients: `ingredient_id`; candidate dedupe by normalized BG/EN names and aliases plus category/family.
- Recipes: source recipe ID when present; otherwise normalized title + source URL + ingredient signature.
- Components: normalized component name + role/category + ingredient signature where applicable.

Net-new means no existing source identity, canonical mapping, or enrichment cache can be reused at the appropriate layer.

## 9. Net-New Enrichment Contract

LLM enrichment is allowed only for entity-level concepts:

- product concepts
- ingredient concepts
- recipe concepts
- component concepts
- alias/search concepts
- mapping suggestions
- culinary traits
- dietary/allergen interpretation
- Bulgarian/English alias suggestions

LLM enrichment must not run over:

- individual USDA nutrient rows
- individual price snapshots
- repeated duplicate source rows
- raw fact tables
- known canonical records with reusable enrichment

Each enrichment record must store:

- target entity type and ID
- source dataset or canonical fingerprint
- prompt version
- model name
- raw request/response reference when safe
- validated structured output
- confidence
- runtime-safe field list
- created/updated timestamps
- review status if the output affects mappings or runtime logic

Runtime shopping, planning, nutrition, and search must never require a live LLM call. They may read cached, validated enrichment.

## 10. BG/EN Localization Contract

Any user-facing or searchable entity must support:

```json
{
  "name_bg": "...",
  "name_en": "...",
  "aliases_bg": [],
  "aliases_en": []
}
```

This applies to:

- ingredients
- ingredient families and categories
- recipes
- components
- techniques
- dietary tags
- cuisine tags
- searchable aliases
- app-facing category labels
- product aliases when they are promoted to user-facing canonical/search entities

Raw source names remain raw. Search must resolve through canonical aliases and reviewed synonyms, not directly through untrusted third-party text.

## 11. Data Ownership Boundary Map

Product-side:

- retailer products
- source products
- canonical products
- price snapshots
- price aggregates
- product enrichment
- availability, promotions, and basket price lookup
- Open Food Facts packaged product records when used as product/barcode enrichment

Food/meal-side:

- ingredients
- ingredient hierarchy
- unit and edible/purchase conversion rules
- nutrition profiles
- recipes
- recipe components
- culinary traits
- cuisine, diet, allergen, and technique metadata

Bridge-only:

- product-to-ingredient mappings
- USDA food-to-ingredient mappings
- Open Food Facts product-to-canonical-product mappings
- recipe ingredient-to-canonical-ingredient mappings
- ingredient nutrition projection into recipes
- ingredient demand to product candidate selection

No bridge should mutate either side's source truth directly.

## 12. Repository / Service Architecture

Existing `store.js` should remain for current flat runtime collections. It is already the repo's production-compatible persistence adapter and keeps current tests/app flows stable.

Add a new Postgres repository layer in DB1 rather than forcing Postgres through `store.js`.

Recommended structure for DB1:

```text
functions/src/db/
app/functions/src/db/
  postgres_client.js
  migrations.js
  repositories/
    import_repository.js
    usda_repository.js
    external_product_repository.js
```

Domain services should read through repositories:

- product services use product repositories/readers
- meal services use meal repositories/readers
- nutrition services use Postgres nutrition repositories and publish compact runtime records
- mobile endpoints use service-layer contracts, not storage-specific code

Avoid duplicating business logic across Firestore and Postgres by keeping:

- storage adapters thin
- source import logic in import modules
- canonical mapping logic in domain services
- read-model publishing in explicit publisher modules

Both `functions/src` and `app/functions/src` must remain mirrored for any runtime code phase until that repo constraint changes.

## Safe Transition Guarantee

DB1 and early DB phases must be additive.

Guarantees:

- No DB1 change should break existing endpoints.
- No DB1 change should alter product search results.
- No DB1 change should affect shopping-list resolution.
- No DB1 change should affect basket output.
- No DB1 change should change existing `kolkostruva.bg` ingest behavior.
- No DB1 change should remove or bypass Firestore-backed runtime storage.
- All new DB-backed features must have explicit fallback to the existing runtime or remain non-runtime until complete.

If a DB1 change cannot satisfy those guarantees, it must be deferred or hidden behind an off-by-default feature flag.

## 13. Migration and Phasing Plan

DB0: architecture only.

- Land this document and handoff.
- Do not add dependencies, migrations, or runtime code.

DB1: Postgres foundation.

- Add `pg` or selected Postgres client dependency.
- Add connection env contract such as `PRICER_POSTGRES_URL` or discrete host/user/database vars.
- Add migration runner and first schema migration.
- Add local Postgres test setup notes.
- Add repository health check and idempotent migration tests.
- Do not rewrite `phase1/store.js`.
- Do not change product ingest behavior.
- Do not remove Firestore usage.
- Do not move canonical products yet.
- Do not switch existing product, shopping, or basket read paths to Postgres.
- Pass all existing tests unchanged.

DB2: USDA macro import.

- Import source metadata, `food`, `nutrient`, `food_nutrient` filtered to macro nutrient IDs, `food_portion`, `measure_unit`, and `food_category`.
- Build normalized macro nutrition profiles.
- Do not publish all USDA rows to Firestore.

DB3: Open Food Facts import.

- Import barcode/product records from JSONL/API snapshots.
- Normalize barcode, name, brand, quantity, categories, countries, ingredients text, allergens, nutriments.
- Build candidate canonical product mappings.

DB4: ingredient nutrition bridge.

- Generate and review `ingredient_id <-> fdc_id` mappings.
- Publish compact ingredient nutrition profiles.
- Add runtime-safe provenance and confidence.

DB5: recipe/component ingest.

- Add source recipe tables, normalized recipe lines, component candidates, recipe ingredient mappings, and recipe nutrition projection.

DB6: product/price canonical mirroring or migration.

- Only after imported relational datasets are stable, decide whether product/price canonical processing should be mirrored to Postgres or migrated.
- Keep Firestore read models for mobile.
- Begin with mirroring only; migration requires the read-path conditions below.

## When Read Paths Can Move to Postgres

Product, price, shopping, or basket read paths may move to Postgres only when all conditions are met:

- data parity is verified against the existing Firestore/flat-store runtime
- tests prove identical or explicitly accepted output differences
- fallback to the existing runtime exists and is tested
- performance is validated under expected production load
- pricing, product search, shopping-list resolution, and basket regression suites pass
- observability exists for mismatches, latency, missing data, and fallback rate
- the change is gated and reversible

Until then, Postgres remains a sidecar.

## Historical Data Strategy

Firestore keeps current/live app-facing data.

Postgres should store or mirror:

- historical price snapshots
- long-range aggregates
- trends
- analytics
- import batch history
- source audit data

This prevents Firestore from growing into a long-term analytical warehouse while preserving Firestore's role as the responsive app runtime.

## 14. Testing and Verification Plan

Future DB phases require:

- local Postgres connection tests
- migration idempotency tests
- rollback/down or rebuild safety tests where practical
- import batch idempotency tests
- source identity and dedupe tests
- macro nutrient join tests
- enrichment cache reuse tests
- no-enrich-before-dedupe tests
- Firestore publish tests for compact read models
- regression tests for existing product pipeline
- dual-runtime load tests requiring both `functions/src` and `app/functions/src` to export the same DB-facing helpers
- docs validation and handoff artifacts per phase

DB0 verification is docs-only.

## 15. Rollback / Safety Plan

Postgres adoption must be read-only first.

Safety rules:

- No replacement of current Firestore product runtime in DB1-DB5.
- No disturbance of the current `kolkostruva.bg` ingest, canonical product pipeline, product search, shopping flows, price lookup, or basket logic.
- Feature-flag any Postgres-backed runtime read path before live use.
- Keep import jobs idempotent and rebuildable from raw archives.
- Do not delete raw source files after import.
- Publish Firestore read models only after complete batch validation.
- If a Postgres import fails, existing app flows keep reading existing Firestore/flat-store data.
- If a read-model publish fails, retry from Postgres staging; do not rerun LLM enrichment unless cache/version rules require it.
- Keep current tests green in every DB phase.

## 16. Risks and Anti-Patterns

Avoid:

- putting huge fact tables into Firestore
- making the mobile app query Postgres directly
- collapsing ingredients into `canonical_products`
- enriching before dedupe
- LLM-enriching nutrient rows, price snapshots, or duplicate source rows
- treating external raw data shape as Pricer runtime schema
- treating LLM output as canonical truth without validation/review
- adding Postgres as a second place for business rules
- big-bang migration of existing product flows
- treating mirroring as migration
- changing `phase1/store.js` or current product read paths in DB1
- breaking the working `kolkostruva.bg -> Firestore -> App` flow while adding sidecar capabilities
- one-tree backend edits that leave `functions/src` and `app/functions/src` out of sync

Primary risk: introducing two persistence systems without a clear ownership boundary. This document's boundary is the mitigation: Postgres owns relational source truth and heavy processing; Firestore owns mobile-friendly runtime state and caches.

## 17. Exact Next Implementation Step

Implement DB1: Postgres foundation and migration tooling.

DB1 should create:

- `docs/implementation/PHASE_DB1_POSTGRES_FOUNDATION.md`
- a Postgres env/secret contract in `docs/needed_secrets.md`
- mirrored DB client and migration modules under `functions/src/db/` and `app/functions/src/db/`
- initial migrations for source dataset metadata and import batches
- tests for migration idempotency, repository health checks, and dual-runtime exports

DB1 must not ingest USDA yet. USDA macro import begins in DB2.

DB1 must not:

- rewrite `phase1/store.js`
- change product ingest behavior
- remove Firestore usage
- move canonical products
- switch current product reads, shopping queries, or basket logic to Postgres

DB1 must:

- introduce a Postgres connection
- introduce migration tooling
- create import metadata tables
- support local and dev environments
- pass all existing tests unchanged
