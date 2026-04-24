# Test Registry

The machine-readable registry lives in [docs/test_registry.json](/c:/Users/domwi/OneDrive/Documents/Dev/Pricer/docs/test_registry.json:1).

## Phase 1 coverage
- snapshot key stability
- source product key stability across dates
- outlet differentiation
- locality differentiation
- promo normalization
- net-new enrichment reuse
- name drift handling
- missing product retention
- sample Bulgarian fixture import and deterministic enrichment

## Phase 1.5 coverage
- deterministic `canonical_en` mapping
- deterministic `display_en` formatting
- automatic English metadata on new products
- English backfill idempotency
- translation storage
- translation idempotency
- translation failure handling
- translation cost control

## Phase 2 coverage
- Bulgarian input normalization and tokenization
- matching correctness
- scoring behavior
- price aggregation
- ambiguity detection
- query service success response
- query service validation response

## Phase 3 coverage
- AI ambiguity resolution
- semantic enrichment output
- embedding storage
- feedback capture
- deterministic embedding payload generation

## Phase 3.5 coverage
- aggregation correctness
- idempotency
- product history endpoint
- category trends endpoint

## Phase 4 coverage
- query parsing
- constraint filtering
- ranking
- unified query response
- query endpoint validation
- SQL sync integrity
- vector sync integrity

## Phase 5 coverage
- Flutter project scaffold and dependency contract
- backend API dependency wiring for `/query` and `/product/:id/history`
- Flutter widget tests for the app shell and key mobile flows execute locally with `flutter test`

## Phase 5.5 coverage
- shared UI system files for spacing, theme, and screen widgets
- daily insight and recent rerun hooks on Home
- savings emphasis and share CTA on Results
- good-price indicator on Product Detail
- watchlist drops summary banner
- Flutter widget tests for polished growth hooks and one-thumb flows execute locally with `flutter test`

## Phase 5.6 coverage
- Flutter localization configuration and ARB files
- English rendering
- Bulgarian rendering
- unsupported-locale fallback
- localized results flow rendering
- localized watchlist rendering
- repo-level static verification for localization delegates, locales, and widget-test coverage

## Phase 6 coverage
- streamed ZIP ingest
- multi-file ZIP ingest across the full daily archive
- duplicate suppression across CSV files inside one ZIP archive
- filename-derived source metadata parsing and persistence
- pre-enrichment dedupe reuse for repeated products within one chain
- chain-aware separation of enrichment buckets
- safe fallback when the chain/product dedupe key cannot be formed
- deterministic cross-chain canonical product merges for obvious same-product variants
- deterministic cross-chain non-merges for size differences and variant differences
- stable canonical mapping ids across reruns
- deterministic non-merges for infant formula stages
- deterministic non-merges for kids age bands
- deterministic non-merges for flavor, color, and pack-count variants
- deterministic non-merges for numeric size and weight ranges
- deterministic non-merges for vintage years and aged-expression variants
- deterministic non-merges for volume and weight variants plus deterministic merges for equivalent size formatting
- deterministic numeric-family handling for count, age-band, and reserve markers plus unresolved fallback for bare ambiguous numbers
- deterministic merges for equivalent slash and hyphen range formatting
- durable unresolved-warning queue generation with structured product evidence
- stable pair fingerprints and A/B order normalization for disambiguation reuse
- decision reuse by fingerprint for previously adjudicated unresolved pairs
- exclusion of hard-marker conflicts from the LLM queue scaffolding path
- dry-run LLM adjudication metrics without network calls
- opt-in LLM adjudication persistence for valid schema responses
- strict rejection of malformed disambiguation responses
- repeat-run cache-first behavior with zero new model calls for already decided fingerprints
- human review decision persistence with reviewer and note provenance
- human-over-LLM effective decision precedence
- human-reviewed fingerprint reuse across adjudication reruns
- review summary metrics for human, LLM, override, and pending outcomes
- controlled application-layer merge, block, skip-conflict, and unchanged decision buckets
- applied grouping map generation without canonical product or mapping mutation
- ingest-run disambiguation application preview attachment
- duplicate suppression during streamed import
- net-new product detection during streamed import
- latest snapshot-date resolution
- Grok ambiguity escalation only on ambiguous cases
- remote embedding backfill adapter
- watchlist drop detection and notification queueing
- daily production pipeline orchestration and skip-on-repeat behavior
- analytics event tracking

## Phase 7 coverage
- zero-result query capture in the Phase 4 flow
- matched-query no-op behavior for demand logs
- manual "can't find this" feedback capture
- duplicate-demand aggregation with automatic versus manual frequencies
- deterministic demand embedding backfill
- batch demand clustering
- top-demand ranking
- trending-demand ranking

## Phase 8 coverage
- single-store basket optimization
- multi-store basket optimization
- preference weighting
- bounded store and combination search
- unmatched-item handling
- optimize-basket endpoint validation

## Phase 9 coverage
- recurring detection interval and confidence
- significance and good-deal evaluation
- cooldown-aware nudges
- target-price handling
- list diff direction
- daily per-user summary aggregation
- summary and insights endpoints

## Phase 10 coverage
- RevenueCat entitlement sync persistence
- entitlement status fallback and premium activation
- premium gating for explicit multi-store optimization
- premium gating for target-price alerts
- premium-aware alert delivery behavior
- Flutter paywall rendering
- Flutter premium ad suppression

## Phase 11 coverage
- repository-wide deployment env-var inventory
- external service and account inventory
- missing production-config and blocker inventory
- production checklist and operator runbook generation
- Firestore-backed backend persistence round-trip behavior
- Firestore-backed deterministic and idempotent save behavior
- environment-based runtime store selection across memory, JSON, and Firestore backends
- repo-root Firebase manifest presence and Cloud Functions entrypoint loadability from the real deploy source tree
- docs JSON validation after deployment-audit updates
- basic repo verification after deployment-audit updates

## Phase 12 coverage
- canonical query object generation
- conservative typo handling
- synonym mapping
- matcher accuracy improvement from canonical expansion
- demand-log-driven synonym learning
- no regressions in Phase 2 deterministic matching

## Phase 15 coverage
- new canonical fingerprints trigger one enrichment call and cache the validated result
- existing canonical fingerprints reuse cached enrichment with zero new model calls
- invalid enrichment responses are rejected without persistence
- strict schema enforcement rejects uncontrolled fields and normalizes stored values
- controlled category hierarchy validation rejects invalid category combinations
- canonical grouping remains unchanged whether enrichment exists or not
- enrichment prompt payload exposes the strict response schema and controlled category tree

## Phase 15.1 coverage
- explicit canonical reader views can combine canonical truth, applied view, and enrichment without mutating canonical truth
- deterministic list and search helpers can filter by enrichment-backed category, brand, base product, flavor, and attributes
- enrichment analytics return category, brand, base-product, flavor, coverage, and ingest-run summaries
- canonical-truth-only readers reject enrichment-backed filters
- live enrichment default intent is enabled unless env explicitly disables it
- live enrichment remains non-blocking when enabled but `XAI_API_KEY` is missing
- reader and analytics helpers do not mutate canonical products or canonical mappings

## Phase 15.2 coverage
- product detail handlers return stable product-facing shapes with canonical ids, canonical names, markers, enrichment, and explicit layer mode
- product search handlers default to `canonical_with_enrichment` and return bounded deterministic results
- invalid layer modes are rejected safely instead of silently switching layers
- enrichment-backed API filtering works for category, brand, base product, flavor, and attributes
- facet handlers return deterministic counts for supported enrichment dimensions
- enrichment analytics summary handlers expose coverage and category, brand, base-product, and flavor rollups
- product API handlers do not mutate canonical products or canonical mappings
- applied-view data is only returned when the caller explicitly requests an applied-view layer
- bounded product-not-found responses remain non-fatal

## Phase 15.3 coverage
- exact and simple shopping-list items resolve into ranked canonical candidates
- close competing candidates return `ambiguous`
- unmatched list items return `unresolved`
- ranked candidates include deterministic match reasons
- `limit_per_item` is respected without changing the underlying ambiguity policy
- invalid layer modes are rejected safely
- empty shopping-list requests are rejected safely
- string and object item inputs are both accepted
- shopping-list resolution does not mutate canonical products, mappings, or enrichment cache

## Phase 15.4 coverage
- all-resolved shopping lists produce optimization-ready basket plans
- ambiguous carry-top-n planning keeps optimization ready while requiring confirmation
- ambiguous require-confirmation planning blocks optimization readiness
- unresolved exclude planning keeps optimization ready while preserving unresolved items
- unresolved block planning disables optimization readiness
- requested quantity and simple volume/count markers are preserved in ready items
- ambiguous carried-candidate behavior respects the configured top-N policy deterministically
- basket planner execution does not mutate canonical products, mappings, or enrichment cache

## Phase 16.0 coverage
- latest canonical-product price lookup returns bounded current price records and deterministic best-price selection
- canonical products with no mapped current prices return explicit `missing` status
- canonical products with only old snapshots return explicit `stale` status
- chain and store filters apply deterministically on existing derived chain and store identifiers
- promo-aware current-price selection chooses the lowest valid current price
- price lookup endpoint validates bounded request errors safely
- basket-plan price lookup collects ready items and carried ambiguous candidates without changing planner output
- price lookup does not mutate basket plans, canonical products, canonical mappings, or raw price snapshots

## Phase 16.1 coverage
- complete single-store baskets win over incomplete cheaper baskets when the missing-item penalty applies
- `actual_total` excludes penalty while `score_total` includes it for ranking
- missing and stale-excluded prices are explicit in item warnings
- requested quantity multiplies selected line totals
- planner-blocked basket plans prevent optimization
- ambiguous cheapest-candidate policy auto-selects and warns
- ambiguous require-confirmation policy blocks optimization
- optimizer output currency is `EUR`
- optimizer execution does not mutate basket plans or price lookups
- basket optimize endpoint validates bad optimizer input
- deterministic tie-breaking uses chain id after score, coverage, and actual-total ties
- stale-only candidate chains still produce explicit stale warnings and penalty scoring

## Phase 16.2 coverage
- two-store splits can beat single-store and be recommended
- tiny savings below threshold do not recommend multi-store
- worse-coverage multi-store options do not beat single-store recommendation
- missing-item penalty affects `score_total`, not `actual_total`
- `max_stores = 2` bounds evaluated combinations
- deterministic multi-store tie-breaking uses store id order
- ambiguous cheapest-candidate policy works across store combinations
- stale prices are excluded by default
- `POST /basket/optimize` remains single-store by default
- opt-in multi-store strategy returns combined single and multi-store result
- output currency remains `EUR`
- multi-store optimization does not mutate basket plans or price lookups

## Phase 16.3 coverage
- single-store explanation headline names the recommended chain
- multi-store explanation headline names both chains
- savings text appears when multi-store saves money
- missing item notes are generated
- ambiguous auto-selection notes are generated
- limitations include travel not included for multi-store explanations
- `include_explanation=true` adds explanation to endpoint results
- omitted `include_explanation` preserves the old endpoint response shape
- explanation currency remains `EUR`
- explanation builder does not mutate optimizer results

## Phase DB0 coverage
- Postgres transition architecture document exists with explicit Postgres, Firestore, and Firebase Functions ownership boundaries
- dedupe-first ingest contract is documented for USDA, Open Food Facts, retailer products, ingredients, recipes, and components
- enrichment contract keeps LLM use cache-first, net-new/entity-level, provenance-tagged, and out of runtime core flows
- BG/EN localization contract is documented for user-facing and searchable entities
- migration plan keeps DB0 design-only and defers dependencies, migrations, and data movement to DB1+

## Phase DB1 coverage
- Postgres config parsing supports URL and discrete env vars with safe no-config behavior
- health checks skip cleanly when Postgres is not configured
- migration files are applied in deterministic order and tracked idempotently with checksums
- DB1 import metadata migration creates `source_datasets`, `source_files`, and `import_batches`
- import metadata repository normalizes dataset, file, and batch records before source-specific imports exist
- existing runtime store selection remains independent from Postgres configuration
- optional real Postgres metadata insert/read flow runs when local Postgres is configured

## Phase M0 coverage
- meal foundation collections exist in the shared flat backbone store
- ingredient family, category, and ingredient records can be written and queried deterministically
- ingredient validation enforces allowed runtime-safe field sets
- seeded unit conversions normalize mass and volume quantities deterministically
- ingredient-specific piece rules convert recipe quantities into edible units
- edible quantities convert into conservative purchasable quantities using yield rules
- product-to-ingredient mapping resolution prefers stronger mapping types
- ingredient price candidates expose normalized unit prices from mapped canonical products
- ingredient cost estimation follows the explicit fallback ladder from exact local price to other-store price to category average to ingredient estimate
