# Test Registry

The machine-readable registry lives in [docs/test_registry.json](/c:/Users/domwi/OneDrive/Documents/Dev/Pricer/docs/test_registry.json:1).

## Phase 6 bad product ingest guardrail coverage
- `npm run test:phase6` verifies malformed multi-row CSV chunks and embedded newline product names are rejected before source, canonical, mapping, or current-offer records are created.
- `npm run test:phase6` verifies normal long Bulgarian product names are still accepted, quote-only brand names are warning-level and not quarantinable, and validation is deterministic without Firestore reads/writes.
- `npm run test:phase6` verifies the audit output separates `warning_count`, `suspicious_count`, `invalid_count`, and `quarantinable_count`, reports affected current-offer read models, writes nothing in dry-run, and marks only invalid multi-row products in explicit quarantine mode.
- `npm run test:phase15_2` verifies invalid existing canonical products and `data_quality_status = "invalid"` quarantine markers are excluded from product search and enrichment pilot selection while quote-only warning products remain searchable.
- `npm run test:phase16_0` verifies current-offer price lookup remains bounded after unsafe current-offer filtering and current-offer generation excludes quarantined canonical products.

## Production Firestore runtime hardening coverage
- Product search uses scoped canonical-product prefix reads and scoped mapping/source-product evidence reads, without requesting raw snapshots or daily prices.
- Product search attaches `current_offer_summary` from scoped `canonical_current_offer_summary` lookups for bounded search candidate ids, returns zero-current-offer evidence summaries when missing, and keeps legacy result fields.
- Product search/detail derive missing `current_offer_summary` comparison-basis and unit-price metadata from product-level Phase 15 normalization for loose-weight kg products and explicit packages.
- Product detail queries canonical mappings by requested canonical product id.
- Product history queries `product_daily_prices` by `source_product_id`.
- Price lookup scopes reads to requested canonical and source ids.
- Current offer read model generation creates deterministic offer ids and canonical summaries from fixture state, excluding invalid/quarantined source or canonical product records.
- Product detail and price lookup prefer compact current offers when they are populated and keep raw snapshot fallback bounded.
- Gap-signal persistence upserts only `gap_signal_store` when scoped writes are available.
- Home summary uses scoped Firestore-style reads and omits top deals/market highlights when compact read models are unavailable.
- Recorded run: `docs/test_runs/product_summary_evidence_counts_2026-05-05.json`.
- Market trends and nearest availability return controlled Firestore limitations instead of full-loading production runtime data.
- Production Firestore runtime rejects legacy full load/save by default.

## Admin Console V0 coverage
- Vite/React/TypeScript admin app builds successfully with `npm run admin-web:build`
- Firebase Hosting config points to `app/admin-web/dist` and keeps existing emulator ports
- Admin console exposes Health, Home Summary, Product Search, Product Detail, Price History, Price Lookup, Basket Test, and Raw API tabs without changing mobile UI or backend business logic
- Product Detail renders canonical fields, legacy marker fields, structured `size_marker` display/totals, bounded current offers, bounded source-product mappings, copy buttons, and a direct Price History launch
- Product Search and Product Detail render Phase 15 normalized unit prices when current summaries/offers include a supported comparison basis, hide missing unit prices, and show human current-price fallbacks instead of `n/a`.
- Ingest / Data Jobs renders historical snapshot inputs, dry-run target selection, PowerShell command preview, and job plan/list/create actions without running ZIP ingest in the browser.

## Historical ingest/admin coverage
- `npm run test:phase6_historical_ingest` verifies historical dry-run writes nothing.
- Historical snapshot IDs and product daily price IDs are deterministic for the same date/source rows.
- Historical publication respects the Firestore collection prefix, performs no deletes, and skips existing deterministic document IDs.
- Admin ingest endpoints create `planned` job metadata only and leave raw snapshot collections untouched.
- Admin planning warns when current read-model collections are selected for historical ingest.

## Incremental ingest/diff coverage
- `npm run test:phase6_incremental_ingest` verifies unchanged current-offer fingerprints are skipped.
- Price, promo, metadata, new, and missing/removed offers are categorized deterministically.
- Missing/removed offers are reported without default deletes or current-offer writes.
- Affected canonical summaries are limited to canonical ids touched by new/changed/missing offers.
- Historical append mode still avoids current read-model publication by default.
- Incremental dry-run produces a manifest from a local baseline and writes nothing.
- Fingerprint, event, and manifest identifiers are deterministic for idempotent reruns.
- Diff write estimates count changed offers instead of full current-offer rewrites.
- Compact baseline rows expose `offer_fingerprint`, price, promo flags, snapshot dates, and source/canonical ids without bulky offer display payloads.
- Baseline JSONL files load into the diff command without Firestore reads.
- Baseline export pages through current offers and writes only a local JSONL file by default.
- Rich baseline rows preserve old-side product name, canonical name, category, chain/retailer, store/locality/region, product-code/source-file fields, and still write only local JSONL by default.
- Replacement diagnostics use rich old-side fields to report likely same-real-offer/new-id replacements, likely genuine new/removed rows, unknown rows, and Billa-specific new/missing/replacement counts.
- Baseline export append/resume mode can continue from a Firestore document id without corrupting JSONL row boundaries.
- Real incremental writer planning refuses high-write real runs without `PRICER_INCREMENTAL_ALLOW_HIGH_WRITE_CATCHUP=true`, while dry-run remains no-write by default.
- High-write catch-up acknowledgement allows a real writer plan to write new Billa-like offers, current-offer fingerprints, policy-selected events, affected summaries only, and one manifest.
- Real writer coverage verifies unchanged offers are skipped and missing/removed offers stay report-only with no deletes by default.
- Recorded run: `docs/test_runs/phase_6_incremental_ingest_diff_2026-05-05.json`.
- Recorded run: `docs/test_runs/phase_6_rich_baseline_diff_2026-05-07.json`.
- Recorded run: `docs/test_runs/phase_6_incremental_catchup_writer_2026-05-07.json`.

## Bulgarian product marker coverage
- Phase 6 ingest extracts full-word Bulgarian volume and weight markers including decimal comma and decimal point values.
- Phase 6 ingest extracts Bulgarian count/package markers for `бр`/`брой`/`броя` and simple `2x500 г`, `2 х 500 г`, and `6 бр x 330 мл` patterns.
- Phase 15 shopping-list and basket planner quantity parsing accepts Bulgarian Cyrillic unit forms while preserving conservative marker semantics.
- Scoped product search issues bounded lower/upper/title-case prefix variants, then falls back to the compact catalog only when prefix candidates are empty, so lowercase Bulgarian queries can match uppercase or mid-name Cyrillic canonical names without loading mappings/raw prices.

## Semantic enrichment pilot coverage
- Phase 15 product search has 101 deterministic BG/EN grocery synonym concepts for query expansion only.
- `npm run test:phase15` verifies Phase 15 price-normalization metadata for inferred kg/per_kg loose-weight products, explicit 400 g cheese, explicit 250 ml shampoo, and ambiguous no-size products without fake package quantities.
- English `cookies`, `snacks`, `Coca-Cola`, and `coke` expand to deterministic BG/EN retrieval aliases for biscuits/snacks and cola/soft drinks.
- Product search ranks optional canonical enrichment fields including product type, family, category, BG/EN aliases, beverage flags, and personal-care flags.
- Cola beverage intent does not rank enriched shampoo/personal-care products above enriched cola beverage products.
- Base ingredient/product searches apply soft raw/simple boosts and processed, baby-food, or prepared-meal demotions; `пилешко` ranks raw chilled chicken fillet above baby chicken puree without hard-excluding puree.
- The focused enrichment pilot selector finds bounded snacks/beverage/personal-care/baby-food candidates, dry-run writes nothing, and explicitly opted-in real runs write only `canonical_enrichment_store`.
- Rich v2 enrichment prompts list exact `product_form` enum values, normalize unsupported `semi-solid` / `semi solid` near-misses to `null` with validation warnings, reject invalid per-item enum values without writing them, and still write valid siblings in the same batch.
- Rich v2 taxonomy validation accepts generalized product paths for shampoo, conditioner, yogurt, sirene, beef, bread, and vacuum cleaner while keeping dairy-specific fields additive.
- Pilot selection safely uses existing `canonical_semantic_v3` object-shaped attributes/category/packaging/product_form evidence, keeps v2 attributes arrays working, and reports malformed evidence shapes through run warnings instead of crashing.
- `npm run debug:enrichment` prints read-only canonical enrichment inspection records by product id or latest/version filters, including generalized category paths, v3 raw terms, registry matches, proposals, dairy, personal-care attributes, quantity/storage, warnings, review flags, and confidence without exposing provider secrets.
- V3.1 `semantic_usage_profile` preserves additive cuisine, flavor, culinary role, dish role, meal context, common-use, preparation, pairing, substitute, consumer-search-intent, and not-for metadata, while accepting older v3 payloads that do not yet carry the profile.
- V3.1 `semantic_embedding_summary` preserves richer embedding-ready prose for fresh milk, yogurt, sirene, and kashkaval, including flavor/texture, cuisine, ingredient, use-case, dish/meal-role, and search-context meaning while rejecting unsupported claim wording, enforcing the max two-sentence rule, capping evidence arrays, and accepting older v3 payloads that do not yet carry the summary.
- V3 `taxonomy_classification` validates open `product_taxonomy` paths for soap, shampoo, chicken fillet, bread, motor oil, and garden shovel, accepts unknown niche proposed terms, rejects malformed path arrays and high-confidence contradictions, and keeps old v3 records without taxonomy compatible.
- V3 partial salvage writes usable repaired/partial records for taxonomy primary mismatches, misplaced registry matches, null spillover, and invalid optional semantic usage fields while marking human review and preserving fatal rejection/quarantine for wrong product IDs and malformed JSON.
- V3 `taxonomy_classification.registry_matches` keeps only `product_taxonomy` matches, moves usable misplaced legacy matches to `category.registry_matches`, and ignores null food-category spillover without rejecting the full enrichment item.
- V3 `taxonomy_classification` repairs usable primary label/term-id mismatches into the taxonomy path and derives missing or unusable primary fields from the deepest valid path item without rejecting the full enrichment item.
- V3 real pilot writes `taxonomy_classification.proposed_terms` to pending `semantic_term_registry_proposals`, captures proposed aliases, dedupes by domain plus normalized label plus parent term id, and never activates LLM taxonomy terms.
- Product search debug includes taxonomy path labels, primary taxonomy, matched taxonomy labels, and registry-match evidence without breaking older v2/v3 records.
- Mobile product search/detail/watchlist/basket tests verify normalized `/kg` and `/L` unit-price labels, zero current-offer counts, null normalization hiding without `n/a`, and unchanged primary price display.
- Recorded run: `docs/test_runs/phase15_registry_taxonomy_2026-05-07.json`.
- Recorded run: `docs/test_runs/phase15_base_product_selection_2026-05-07.json`.
- Recorded run: `docs/test_runs/phase15_v3_taxonomy_validation_2026-05-07.json`.
- Recorded run: `docs/test_runs/phase15_v3_taxonomy_primary_alignment_2026-05-07.json`.
- Recorded run: `docs/test_runs/unit_price_ui_2026-05-07.json`.
- Recorded run: `docs/test_runs/phase15_v3_semantic_embedding_summary_2026-05-06.json`.
- Recorded run: `docs/test_runs/phase15_v3_semantic_usage_profile_2026-05-05.json`.
- Recorded run: `docs/test_runs/phase15_enrichment_debug_2026-05-05.json`.
- Admin Product Search summarizes current price ranges, offer count, cheapest retailer/chain, and search debug category/product-type/alias/demotion fields for QA while preserving the raw JSON response.

## Grocery synonym and Admin QA search coverage
- Phase 15 product search has 101 deterministic BG/EN grocery synonym concepts for query expansion only.
- English `milk`, `yogurt`, `butter`, `olive oil`, and `baby formula` expand to their Bulgarian equivalents without expanding related-but-distinct products such as `зехтин` into butter.
- `сирене` and `кашкавал` are kept related but not equivalent.
- Multi-token `краве масло` ranks exact/all-token butter matches above `масло`-only matches.
- Generic `мляко` does not rank baby formula above ordinary milk/yogurt when ordinary milk candidates exist, while explicit baby-formula terms rank baby formula highly.
- Phase 6 parsing keeps `ГР` out of `canonical_brand`, detects `APTAMIL`, extracts `800g`, `24+m`, and `stage_4`, and marks the Aptamil QA example as `baby_formula`.
- Canonical marker backfill dry-runs write nothing, honor limit mode, avoid raw/source/offer/history/mapping collections, patch only changed canonical/enrichment docs in real-run tests, and populate structured `size_marker` fields for grams, kilograms, liters, package counts, and package totals.
- Product detail and product search expose structured canonical `markers.size_marker` when present while preserving legacy `volume_marker`, `count_marker`, `age_band_marker`, and `reserve_marker` response fields.

## Shopping intent preference coverage
- Phase 15.8 seeds deterministic BG/EN product-family definitions for yogurt, milk, bread, sirene, kashkaval, juice, coffee, rice, pasta, oil, eggs, and chicken.
- Broad `yogurt`, `juice`, `cheese`, and `bread` examples return deterministic family and attribute clarification surfaces before canonical product selection.
- Owner-scoped high-confidence family preferences return suggested defaults, while low-confidence inferred preferences still require clarification.
- `POST /shopping-intent/resolve` accepts admin preview inputs, returns preference records when available, and reads only `user_product_family_preferences` on scoped stores.
- The opt-in `intent_first` shopping-list/basket adapter returns `clarification_needed` for ambiguous yogurt without preference and broad cheese family ambiguity instead of guessing.
- High-confidence yogurt preferences let the opt-in adapter continue into canonical product candidates, while disabled flags preserve the previous basket planning path.

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
- Flutter startup hardening covers shell-first bootstrap, Firebase/Firestore fallback, monetization fallback, and API timeout error UI

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
- deterministic store-location extraction from existing store text
- Bulgarian, English, and German-compatible store address parsing
- retailer location provenance, confidence, and no-geocoding coordinate boundaries
- additive retailer-location geocoding cache with fake-provider matched, ambiguous, skipped, and cache-reuse behavior
- opt-in nearest-store availability using matched geocode cache rows, haversine distance, bounded radius/limit, explicit states, and unchanged normal product search
- consented saved user locations for home/work/custom, deterministic validation, default radius/sort resolution, saved-location availability search, ambiguous-label handling, and deletion
- backend and Flutter wiring for saved-location CRUD plus opt-in nearest availability from the product search screen
- Flutter manual nearby-availability polish covering coordinate validation, raw-address display without geocoding, bounded radius/sort controls, no-saved-location state, and result rendering
- Flutter user-initiated current-location flow covering no automatic permission request, denied permission state, acquired-coordinate nearest search, and explicit save-as actions
- cache-first manual-address geocoding with fake-provider matched results, cache reuse, owner/invalid-input rejection, explicit Flutter button behavior, confirmation-before-apply, ambiguous/failed UI states, confirmed nearest search, and geocoded save-as custom behavior
- location confidence/admin review covering deterministic candidate ranking, approval, rejection, additive coordinate corrections, provider mismatch detection, and raw source preservation
- guarded location-review admin API covering pending list/detail, approval with corrected coordinates, rejection with reason, needs-more-info, and missing admin/operator identity rejection
- reviewed location coordinate publication covering approved-only publishing, rejected/needs-more-info skips, one-active-coordinate supersession, and raw geocode preservation
- reviewed coordinate diagnostics covering active reviewed-over-provider precedence, provider fallback, superseded-coordinate exclusion, unavailable state, guarded active/superseded/detail reads, and admin identity enforcement
- opt-in reviewed-coordinate nearest availability covering provider-only default behavior, reviewed-first precedence, provider fallback, superseded-coordinate exclusion, coordinate-source metadata, and invalid-mode rejection
- reviewed-coordinate rollout diagnostics covering changed-coordinate counts, provider-vs-reviewed distance deltas, high-reuse reviewed coverage, confidence distribution, default preservation, and admin identity enforcement
- config-controlled nearest-availability coordinate default covering unset/invalid fallback to provider-only, reviewed-first configured default, and explicit request override
- price lookup/search-adjacent behavior remains unchanged after location extraction
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
- Flutter monetization startup remains disabled and boot-safe with missing or placeholder RevenueCat/AdMob config

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

## Production readiness audit verification commands
- `node tests/phase_11_production_persistence.test.js`
- `node tests/phase_17_1_persistent_lists.test.js`
- `node tests/phase_17_2_watchlist_tracker.test.js`
- `node tests/phase_15_2_product_api.test.js`
- `node tests/phase_16_1_basket_optimizer.test.js`
- `node tests/phase_16_2_multi_store_optimizer.test.js`
- from `app/mobile`: `flutter test test/startup_hardening_test.dart test/monetization_config_test.dart test/widget_smoke_test.dart`
- `npm run validate:docs`

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
- BG/EN/DE explicit diet and attribute claims normalize into controlled `diet_tags` and `attributes`
- lactose-free, sugar-free, low-fat, high-protein, and LLM-style synonyms normalize deterministically
- category-only text does not infer diet or attribute claims
- duplicate explicit and LLM claims are deduped with matched-text evidence preserved on the enrichment record
- controlled category hierarchy validation rejects invalid category combinations
- canonical grouping remains unchanged whether enrichment exists or not
- enrichment prompt payload exposes the strict response schema and controlled category tree

## Phase 15.6 coverage
- English, Bulgarian, and German explicit aliases normalize into controlled diet and attribute tags
- lactose-free, sugar-free, low-fat, high-protein, and mixed-language aliases dedupe deterministically
- tofu/category-like words do not infer vegan or product-claim tags
- LLM-provided unknown/unmapped diet or attribute values are ignored
- enrichment merge stores matched-text evidence while preserving canonical products and mappings

## Phase 15.7 coverage
- Turkish, Russian, Ukrainian, Dutch, and Spanish explicit aliases normalize into the existing controlled diet and attribute tags
- accented and reviewed unaccented variants normalize where aliases are present
- LLM-style expanded aliases normalize while unknown values remain ignored
- substring false positives inside unrelated words are rejected
- tofu, natural, and low-sugar text do not infer vegan, organic, or sugar-free claims

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
- product detail and search return `current_offer_count = 0` instead of `n/a`/missing counts when a canonical product has no current offers but has mapped source-product evidence
- product detail and search fill missing current-summary normalization for loose-weight chicken/meat and explicit 400 g package fixtures while preserving existing primary price fields
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

## Phase 16.4 coverage
- `actual_total` remains unchanged after convenience scoring
- `effective_total` includes convenience penalties
- convenience scoring can flip recommendation from multi-store to single-store
- multi-store can still win when savings exceed convenience penalty
- preferred chains avoid non-preferred penalties
- avoided chains receive large penalties while remaining visible
- `max_store_count` affects recommendation
- omitted `include_convenience_scoring` preserves old response shape
- explanation includes convenience-adjusted total when enabled
- convenience currency remains `EUR`
- convenience scoring does not mutate optimizer inputs

## Phase 16.5 coverage
- resolver resolution, ambiguity, and unresolved rates are calculated
- pricing coverage, missing, and stale rates are calculated
- multi-store savings and savings rate are calculated against the single-store total
- convenience before/after recommendation flips and effective-vs-actual deltas are detected
- global basket metrics summary aggregates multiple runs deterministically
- `include_metrics` omitted preserves the existing optimize response shape
- `include_metrics=true` adds read-only metrics to optimize responses
- metrics do not affect optimizer output
- metrics helpers do not mutate inputs
- edge cases cover all unresolved items, all missing prices, and no multi-store option

## Phase 16.6 coverage
- metrics persist when `include_metrics=true` and `persist_metrics=true`
- metrics do not persist when `persist_metrics` is omitted
- aggregation returns correct average resolution, price coverage, savings, multi-store usage, and convenience flip rates
- empty analytics datasets return safe zero summaries
- partial and malformed records are ignored
- analytics summaries apply deterministic window and limit handling
- persisting metrics does not mutate optimizer results
- persistence failures do not break the optimize API response

## Phase 16.7 coverage
- low resolver resolution triggers warning alerts
- low price coverage triggers warning alerts
- high stale rate triggers warning alerts
- low savings and low savings rate trigger warning alerts
- high convenience flip rate triggers warning alerts
- multiple warning alerts combine correctly
- critical alerts override warning status
- empty datasets return safe health output with low-sample info
- basket health endpoint aggregates persisted analytics and supports `window`
- health alert builder does not mutate summary input

## Phase 17 coverage
- saved lists can be created with string item input
- saved lists can be read by id
- saved lists can be updated with object item input
- saved lists can be deleted
- saved lists can be listed
- saved lists can be optimized by rerunning the basket pipeline
- invalid saved-list ids return not found
- empty list creation is rejected
- saved-list operations do not mutate canonical, enrichment, or price layers

## Phase 17.1 coverage
- missing owner context defaults saved lists to anonymous ownership
- owner headers create explicit owner-scoped saved lists
- list responses only include lists for the resolved owner
- get, update, delete, and optimize return bounded not-found responses for other owners
- ownerless legacy records remain readable as anonymous records
- saved-list optimization preserves existing optimizer behavior
- saved lists persist only ownership fields and user input, not optimizer outputs

## Phase 17.2 coverage
- watchlist items can be added with owner metadata and canonical product references
- duplicate watchlist adds are idempotent per owner and canonical product
- watchlist listing only returns the resolved owner's items
- get, update, and delete return bounded not-found responses for other owners
- price tracker view includes current best price from Phase 16.0 lookup
- watched products without prices return `missing`
- watchlist records do not store price snapshots or lookup outputs
- watchlist operations do not mutate canonical or price data

## Phase 17.3 coverage
- good deal classification detects prices at least 20% below recent average
- expensive classification detects prices at least 20% above recent average
- normal classification covers prices near recent average
- missing history falls back to normal
- target-price hits are detected
- watchlist price views include deal signals
- basket optimizer outputs include item deal signals and basket deal summaries
- standalone product deal checks return deal classifications
- deal detection does not mutate price data

## Phase 17.4 coverage
- market trend summaries group by enrichment category
- market trend summaries group by brand and base product
- trend thresholds classify up, down, and flat
- missing previous period data returns `insufficient_data`
- deal density uses Phase 17.3 good-deal classifications
- enrichment filters limit grouped trend summaries
- market trend summaries do not mutate canonical, enrichment, or price data
- market trend API validates request shape, grouping, and window options
- market overview returns top-level category trends

## Phase 17.5 coverage
- home summary returns the app-ready top-level shape
- watchlist highlights are owner-scoped
- saved-list shortcuts are owner-scoped and do not run optimization
- internal health and analytics metrics are not exposed
- empty data returns safe empty arrays
- section limits are respected
- quick actions are included
- owner headers drive `GET /home/summary`
- home summary generation does not mutate underlying stores

## Phase 18.0 coverage
- Flutter home screen shows a loading state while `/home/summary` is pending
- Flutter home screen renders top deals
- Flutter home screen renders watchlist highlights and saved-list shortcuts
- Flutter home screen hides empty dynamic sections while keeping quick actions
- Flutter home screen retries after a home summary error
- home summary DTO parsing tolerates partial payloads
- Flutter API client sends anonymous owner context for `/home/summary`

## Phase 18.1 coverage
- home quick actions navigate through named routes instead of snackbars
- home saved-list cards navigate to `/list_detail` with list arguments
- home deal cards navigate to `/product` with canonical product arguments
- home watchlist highlights navigate to `/watchlist`
- named routes exist for search, watchlist, lists, list detail, optimize, and product
- list detail and product routes tolerate missing arguments without crashing
- existing home screen rendering still passes after navigation wiring

## Phase 18.2 coverage
- `/product` without arguments shows a safe state
- product detail loads and renders product name, category, brand, and base product
- product deal information renders when deal-check succeeds
- deal-check failure does not block product rendering
- add-to-watchlist calls the mobile API client with owner context and shows success
- product API error shows retry and reloads successfully
- home deal tap still navigates to the real product route

## Phase 18.3 coverage
- home search/add-to-basket input renders at the top with the app contract placeholder
- Enter/search action navigates to `/search` with the entered query argument
- Add-to-basket action parses comma/newline draft items and navigates to `/optimize`
- quick-add parsing trims entries and ignores empty values
- empty search/add inputs do nothing safely
- `/search` and `/optimize` routes tolerate missing or provided arguments without crashing

## Phase 18.4 coverage
- `/search` without a query shows a safe empty state and does not call product search
- initial `/search` query calls the product search API and renders product results
- result cards render product name, brand/category/base-product metadata, optional deal, and optional best price
- tapping a result navigates to `/product` with `canonicalProductId`
- product search API errors show retry and recover
- empty product search results show a friendly empty state
- in-screen re-search updates the query and result list
- product search DTO parsing tolerates partial result payloads

## Phase 18.5 coverage
- `/optimize` without arguments shows a safe empty basket state
- draft route items render in the editable basket input
- Optimize calls the mobile API client with parsed items, `multi_store`, explanation enabled, and convenience scoring disabled by default
- pending optimization requests show loading state
- successful optimization renders estimated total, store cards, and explanation headline
- failed optimization shows error state and retry recovers
- strategy toggle changes the request to `single_store`
- internal metrics/debug fields are not shown on the user-facing screen

## Phase 18.6 coverage
- watchlist price screen shows loading state
- watched item renders with best price, chain/store, deal badge, and target-hit badge
- missing-price watchlist items render safely
- tapping a watchlist item navigates to `/product`
- removing a watchlist item calls the API and updates the local list
- remove failure shows bounded error feedback without dropping the item
- watchlist price load errors show retry and recover
- empty watchlist state navigates to `/search`
- partial watchlist price payloads parse without crashing

## Phase 18.7 Mobile Saved Lists Polish coverage
- saved lists screen loads and renders backend list summaries
- empty saved-list state renders safely
- creating a saved list calls the backend API and renders the new card
- tapping a saved-list card opens detail and fetches list items
- editing and saving a saved list calls the backend update API
- optimizing a saved list navigates current items to `/optimize`
- deleting a saved list calls the API and removes the card locally
- saved-list load errors show retry and recover
- partial saved-list payloads parse without crashing

## Phase 18.8 coverage
- Flutter analyze passes after shared visual polish changes
- existing widget smoke flows pass after spacing, card, typography, and empty-copy refinements
- combined Flutter widget tests pass for app shell and Phase 18 mobile screens
- Phase 5, 5.5, and 5.6 static mobile checks pass after shared UI primitive updates
- docs validation passes after visual-polish documentation updates
- home summary layout renders Top Deals, Watchlist Highlights, Saved Lists, Market Highlights, and Quick Actions in the refined hierarchy
- home search/add-to-basket actions, quick actions, saved-list cards, deal cards, and product navigation remain covered after the visual-only home refactor

## Phase 18.9 coverage
- Flutter analyze passes after cross-screen visual consistency updates
- full Flutter widget test suite passes after shared card, button, input, section-header, spacing, and badge refinements
- Phase 5, 5.5, and 5.6 static mobile checks pass after the visual-only consistency pass
- product search, product detail, optimize basket, watchlist, saved lists, and saved-list detail behavior remains covered by existing tests
- docs validation passes after Phase 18.9 documentation and registry updates

## Phase 20 Market Gap Detection coverage
- unresolved queries produce high gap scores and `missing_supply`
- ambiguous queries produce medium gap scores and `poor_match_quality`
- high category-relative prices add price-pressure score and classify `high_price_pressure`
- gap summaries group by `normalized_query` and `category_l2`
- empty signal datasets return safe empty summaries
- summary and endpoint reads do not mutate the signal store
- gap output is deterministic for repeated reads
- search and resolver handlers capture gap signals without changing response status
- gap endpoint validates options and applies limits

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

## Phase DB2 coverage
- USDA macro nutrient constants include only the DB2-approved macro subset
- CSV parsing and USDA row normalization preserve source IDs, category text, and numeric macro values
- DB2 migration creates USDA food, nutrient, food-nutrient, portion, measure-unit, category, and import-run tables
- fixture import is macro-only and safely repeatable with new import batches
- fixture import skips malformed and orphaned USDA rows and records invalid-row counters without throwing
- repository read returns a USDA food joined with imported macro rows
- normal `npm test` uses fixture data and does not require the full USDA import

## Phase DB2.5 coverage
- USDA cluster candidate migration creates the required candidate table and fields
- deterministic parser extracts qualifiers from USDA comma-separated descriptions
- branded foods are excluded from DB2.5 first-pass candidate generation
- over-collapse tests keep apple raw, juice, and sauce separate
- over-collapse tests keep raw rice, cooked rice, and rice flour separate
- over-collapse tests keep whole milk and skim milk separate
- over-collapse tests keep raw chicken breast, cooked chicken breast, and breaded chicken separate
- over-collapse tests keep shiitake mushroom and generic mushroom separate
- over-collapse tests keep canned beans drained/rinsed and solids/liquids separate
- representative scoring prefers Foundation and simple macro-backed candidates
- candidate repository upserts normalized records idempotently
- DB2.5B batch generation scans Foundation and SR Legacy USDA foods from Postgres with cursor pagination
- DB2.5B batch generation skips unsupported data types and foods without macro nutrient rows
- DB2.5B batch generation supports dry runs, max-row limits, data-type filters, and idempotent candidate upserts
- DB2.5B representative score JSON records explicit macro-data presence
- DB2.5C inspection reports summarize candidate counts by source type and review status
- DB2.5C inspection reports identify candidate-key and hard-boundary collision groups
- DB2.5C inspection reports surface low-confidence candidates, missing qualifier structures, score buckets, and ambiguous core foods
- DB2.5C inspection reports support candidate-key and core-food filters without writing sidecar data
- DB2.5D migration creates reviewable USDA cluster and cluster-member preview tables
- DB2.5D materialization groups candidates by candidate key plus hard boundary
- DB2.5D representative selection uses score, Foundation preference, confidence, description simplicity, and FDC id tie-breaks
- DB2.5D dry-run produces proposed clusters and members without writes
- DB2.5D non-dry-run upserts preview clusters and members idempotently while preserving approved/rejected cluster review status
- DB2.5E migration adds review provenance fields and append-only cluster review history
- DB2.5E review service validates supported decisions and rejects invalid terminal transitions
- DB2.5E review queue listing filters clusters by review status
- DB2.5E cluster detail returns cluster, members, and review history
- DB2.5E review updates preserve provenance and never delete candidates or members
- DB2.5F migration creates ingredient nutrition mapping and review-history tables
- DB2.5F suggestions use approved clusters only and never map raw USDA foods directly to ingredients
- DB2.5F suggestions cover exact ingredient name, alias, raw-state, and cooked-state deterministic matches
- DB2.5F upserts are idempotent and preserve approved/rejected mapping review states
- DB2.5F mapping review appends history and rejects invalid terminal transitions

## Phase DB3A coverage
- canonical ingredient migration creates the sidecar `ingredients` table with stable Pricer IDs
- repository normalizes stable ingredient keys and preserves IDs across idempotent upserts
- alias search covers localized aliases
- Bulgarian names are stored on canonical ingredient rows
- ingredients are never deleted through the repository
- review-status listing covers `active` and `needs_review`
- ingredient IDs are not USDA FDC IDs and the table does not directly map raw USDA rows

## Phase DB3B coverage
- ingredient inspection reports summarize total ingredients by review status and food family
- reports identify missing Bulgarian names and missing default or shopping units
- reports identify duplicate normalized names and alias collisions
- reports identify ingredients without nutrition mappings
- report filters cover `review_status`, missing Bulgarian names, and missing nutrition mappings
- report generation is read-only and does not mutate Postgres records

## Phase DB3C coverage
- profile candidate migration creates the per-100g nutrition profile candidate table
- profile generation reads approved ingredient nutrition mappings only
- profile generation joins USDA macro nutrient rows through representative FDC ids
- generated candidates expose kcal, protein, fat, carbs, fiber, sugar, and sodium where available
- profile candidate upserts are idempotent by mapping id
- existing profile candidate review status is preserved on regeneration
- dry-run profile generation returns JSON-safe candidates without writes

## Phase DB3D coverage
- profile review migration creates approved profile and review-history tables
- candidate profile review listing and detail reads work by review status
- approving a candidate creates an approved ingredient nutrition profile
- rejecting and marking `needs_review` append review history
- already approved profiles are not overwritten accidentally
- approving a replacement candidate supersedes the prior approved profile deterministically
- invalid terminal transitions are rejected
- profile provenance is preserved from candidate and mapping rows
- DB3D review actions do not touch Firestore, recipes, LLM, or runtime app paths

## Phase DB3E coverage
- ingredient-product equivalence migration creates candidate, mapping, and substitution group tables
- deterministic matching creates product candidates and mapping suggestions from ingredient keys, names, aliases, food-family hints, and attributes
- generated suggestions remain `suggested` and are never auto-approved
- repository upserts are idempotent and preserve approved or rejected mappings
- ingredient-to-product listing returns mapping and product candidate context
- DB3E tests assert no recipe writes, ingredient creation, LLM calls, Firestore writes, sponsored logic, or runtime app changes

## Phase DB4A coverage
- canonical recipe migration creates recipes, recipe ingredients, and recipe steps
- recipe upserts by stable recipe key are idempotent
- recipe ingredient lines link existing ingredient keys to ingredient IDs
- recipes with missing ingredient keys are skipped without auto-creating ingredients
- recipe steps are returned in deterministic order
- recipe detail returns the recipe with ingredients and steps
- recipe IDs are separate from ingredient IDs
- recipe ingredients do not carry direct USDA FDC IDs
- DB4A seeding and repository actions do not call LLM, Firestore, source recipe ingest, or runtime product/search/shopping/basket paths

## Phase DB4B coverage
- recipe nutrition profile candidate migration creates the sidecar candidate table
- nutrient aggregation uses `quantity_grams / 100 * approved ingredient profile per-100g values`
- per-serving values divide totals by recipe servings, defaulting to one serving when absent
- missing grams or approved ingredient profiles are tracked without blocking partial candidates
- confidence is assigned from nutrition coverage as high, medium, or low
- upserts are idempotent by recipe and preserve existing review status
- recipes with zero valid nutrition inputs do not generate candidates
- DB4B generation does not call LLM, Firestore, meal planner, runtime publishing, ingredient creation, or direct USDA recipe mappings

## Phase DB4C coverage
- recipe nutrition profile review migration creates approved profile and review-history tables
- candidate listing works by review status and recipe filter
- candidate detail includes recipe context, ingredient lines, missing nutrition ids, and review history
- approving a candidate creates an approved recipe nutrition profile
- rejecting and marking `needs_review` append review history
- already approved recipe profiles are not overwritten accidentally
- approving a replacement candidate supersedes the prior approved recipe profile deterministically
- invalid terminal transitions are rejected
- profile provenance is preserved from candidate rows
- DB4C review actions do not call LLM or Firestore and do not publish runtime nutrition

## Phase DB4D coverage
- read-only recipe quality reporting summarizes canonical recipes by review status, stored usability status, and computed readiness status
- per-recipe readiness metrics compute ingredient match, grams coverage, nutrition coverage, product coverage, and approved recipe nutrition presence deterministically
- missing matched ingredients, missing grams, missing approved ingredient nutrition, and missing approved product mappings are surfaced from canonical recipe ingredient lines
- approved versus missing approved recipe nutrition profiles are reported without mutating canonical recipe state
- top ingredient gap candidates and suggested next review targets are ranked deterministically
- recipe/usability and missing-data filters scope the report safely
- DB4D reporting does not call LLM, Firestore, planners, basket optimizers, or runtime publishing paths

## Phase DB5A coverage
- rich recipe ingest migration creates raw-preserving job, staged recipe, staged ingredient, staged step, and staged metadata tables
- raw recipe input is preserved on ingest jobs
- staged recipe rich metadata is stored separately from canonical recipe records
- staged ingredients are stored separately from canonical `recipe_ingredients`
- nullable `matched_ingredient_id` allows review-time links to existing ingredients without auto-creating ingredients
- tools, methods, tags, state changes, substitution hints, and quality signals are stored as separate staged child rows
- staged recipe listing supports review-status and job-status filtering
- staged recipe search covers proposed recipe keys and titles
- repository delete attempts are rejected because staging rows are append-preserving review evidence
- DB5A seeding and repository actions do not write canonical recipes, create ingredients, call LLM, call Firestore, or touch runtime product/search/shopping/basket paths

## Phase DB5B coverage
- DB5B migration allows `extracting` job status for bounded extraction workflows
- recipe extraction prompt requires strict JSON-only output with recipe, ingredient, step, and rich metadata sections
- valid mocked LLM extraction inserts a staged recipe bundle through the DB5A repository
- invalid JSON, missing recipe titles, and empty ingredient lists are rejected before staging writes
- deterministic ingredient matching resolves existing ingredients by key, normalized name, or alias
- unmatched ingredients remain staged with null `matched_ingredient_id`
- idempotency skips existing staged jobs by default to avoid duplicate model calls and duplicate staging
- force restaging upserts deterministic staged rows without deleting prior staging evidence
- failed extraction preserves raw job input and records error details under `raw_json.db5b`
- DB5B tests use mocked LLM output only and do not write canonical recipes, create ingredients, write Firestore, or touch runtime product/search/shopping/basket paths

## Phase DB5C coverage
- staged recipe review can promote canonical recipes even when ingredient matching is partial
- promoted canonical recipe ingredient rows preserve unmatched lines with nullable `matched_ingredient_id`
- unmatched staged ingredient names generate or increment `ingredient_gap_candidates`
- usability classification is deterministic from ingredient match rate and approved nutrition coverage
- promotion reruns are idempotent for canonical recipe, ingredient, and step rows while still appending review history
- structurally invalid zero-ingredient staged recipes are rejected instead of promoted
- DB5C review and promotion do not call LLM, do not write Firestore, and do not auto-create ingredients

## Phase UX1 coverage
- user food profile migration creates profile, constraint, preference, and equipment tables
- profiles upsert deterministically by `user_id`
- nutrition targets update independently of the rest of the profile
- hard allergy plus softer dislike and avoid constraints persist correctly
- flavor, texture, and cuisine preferences persist with bounded scores and source/confidence metadata
- equipment availability persists independently from the profile row
- full profile bundles return profile, constraints, preferences, and equipment together
- seed reruns are idempotent for logical profile-domain rows
- UX1 does not call planners, does not write Firestore, and does not mutate recipes or products

## Phase UX2 coverage
- recipe feedback migration creates feedback-event and note-signal tables with bounded score and enum checks
- impressions plus swipe left/right/up events store the expected default sentiment and intent semantics
- saved, cooked, and cooked-again events store deterministic defaults
- note-backed feedback events persist free-text notes and note language
- manual note signals attach as child rows without mutating profile preferences
- latest feedback reads return the most recent event for one profile plus one recipe
- profile and recipe feedback summaries aggregate event counts and average scores deterministically
- deterministic fixture ids keep seed reruns idempotent while feedback storage remains append-only by design
- UX2 does not infer taste profiles, does not affect planner behavior, and does not write Firestore

## Phase PROF1 coverage
- taste profile migration creates append-only snapshot and signal-source tables with bounded source and family enums
- explicit preferences contribute directly to normalized flavor, feeling, and cuisine vectors
- swipe-left feedback produces strong negative recipe-metadata contributions while swipe-up and saved feedback produce strong positive contributions
- note signals contribute with deterministic polarity to flavor, texture, and feeling vectors
- canonical plus staged recipe metadata contributes cuisine, region, meal-type, feeling, flavor, texture, and cooking-method signals
- all vector scores stay in the safe normalized `-1.0` to `1.0` range
- confidence classification remains deterministic for low, medium, and high feedback volumes
- snapshot builds append new versions instead of overwriting prior profile history
- signal-source audit rows are written alongside stored snapshots
- dry-run builds remain write-free and PROF1 does not write Firestore, call planners, or call LLMs

## Phase PLAN1 coverage
- PLAN1 migration creates deterministic `meal_plans` and `meal_plan_items` tables with bounded meal types
- eligible recipes require canonical usability status `usable` or `meal_plan_ready` plus approved recipe nutrition profiles
- hard allergy and hard avoid constraints plus unavailable equipment are filtered before selection
- scoring remains deterministic across reruns for the same profile, start date, and rules version
- same-day duplicate recipes are avoided when enough eligible recipes exist
- macro totals and daily calorie summaries are computed from selected per-serving recipe nutrition
- missing PROF1 taste snapshots fall back to explicit UX1 preferences
- PLAN1 does not call Firestore, does not call LLMs, and does not mutate recipe or product truth

## Phase PLAN2A coverage
- PLAN2A migration creates deterministic `meal_plan_requirements` and `meal_plan_requirement_items` tables with bounded adapter statuses
- meal-plan requirement aggregation groups canonical recipe lines by canonical ingredient id across multiple selected recipes
- grams are summed only from source lines that provide `quantity_grams`
- source recipe ids and source recipe-ingredient ids are preserved on aggregate requirement rows
- unmatched recipe lines aggregate deterministically by normalized key or display name and remain `missing_ingredient`
- canonical ingredient rows with no grams become `missing_quantity`
- canonical ingredient rows with partial grams become `needs_review`
- canonical ingredient rows with complete grams become `ready_for_product_mapping`
- shopping quantity estimation supports `kg`, `g`, and `piece` conversion when canonical ingredient metadata allows it
- rerunning PLAN2A refreshes one requirement bundle per meal plan without duplicating rows
- PLAN2A does not call Firestore, LLMs, price lookup, or basket optimizer paths

## Phase PLAN2A.1 coverage
- PLAN2A.1 migration creates deterministic `meal_plan_net_requirements` and `meal_plan_net_requirement_items` tables with bounded inventory and adapter statuses
- inventory subtraction matches requirement items by canonical ingredient id first and ingredient-key snapshot second
- fully covered items net to zero without mutating source inventory
- partial coverage preserves remaining grams and recomputes shopping quantity estimates from net grams
- missing ingredient and missing quantity statuses are preserved in the derived layer
- rerunning PLAN2A.1 refreshes one net-requirement bundle per gross requirement without duplicating rows
- PLAN2A.1 does not call Firestore, LLMs, price lookup, or basket optimizer paths

## Phase PLAN2B coverage
- PLAN2B migration creates deterministic `meal_plan_product_candidate_sets` and `meal_plan_product_candidates` tables with bounded candidate statuses
- approved DB3E ingredient-product mappings create purchasable product candidates while unapproved mappings are ignored
- direct canonical-product ids and source-product ids both resolve onto the existing runtime canonical product backbone deterministically
- package sizes normalize to grams conservatively from runtime canonical size fields or DB3E candidate fallbacks
- candidate math computes `units_needed`, `total_purchased_grams`, `overage_grams`, and `total_estimated_price` when size and price are available
- missing mapping, missing package size, missing price, and covered-by-inventory states remain explicit marker rows
- rerunning PLAN2B refreshes one candidate-set bundle per PLAN2A.1 net requirement without duplicates
- PLAN2B does not call the basket optimizer, does not write Firestore, and does not add sponsored logic

## Phase PLAN2C coverage
- PLAN2C migration creates deterministic `meal_plan_optimized_baskets` and `meal_plan_optimized_basket_items` tables with bounded item statuses
- PLAN2C converts PLAN2B ready candidates into a synthetic Phase 15 and Phase 16 optimizer input contract instead of introducing a second optimizer
- PLAN2C reuses the existing single-store and multi-store optimizer functions through injected or default adapter calls
- selected optimizer output persists with candidate, requirement, chain, store, and price provenance
- covered-by-inventory, missing-product, missing-price, and optimizer-excluded rows remain explicit alongside selected rows
- rerunning PLAN2C refreshes one optimized-basket bundle per candidate set without duplicates
- PLAN2C does not write Firestore, does not add sponsored logic, and does not mutate runtime basket or product state outside explicit invocation

## Phase PLAN2D coverage
- PLAN2D migration creates deterministic `meal_plan_shopping_runs` with bounded run statuses
- PLAN2D reuses existing PLAN1, PLAN2A, PLAN2A.1, PLAN2B, and PLAN2C modules instead of introducing a second shopping or optimizer stack
- existing-plan orchestration chains requirement, net-requirement, candidate-set, and optimized-basket ids correctly
- generated-plan orchestration can create a new PLAN1 plan first and then reuse the same lower-level PLAN2 steps
- partial runs preserve missing-product or missing-price outcomes without treating those adapter gaps as hard optimizer failures
- rerunning PLAN2D refreshes one orchestration row per user and plan without duplicating artifacts
- PLAN2D does not write Firestore, does not call an LLM, and does not introduce new optimizer logic

## Phase APP1 coverage
- `POST /meal-plans/generate` reuses PLAN1 and returns generated plan detail without introducing a second planner path
- `GET /meal-plans/:planId` returns ordered plan items, recipe snapshots, and macro totals from Postgres sidecar tables
- `POST /meal-plans/:planId/shopping/run` reuses PLAN2D with an existing plan and returns linked artifact ids plus orchestration summary
- `GET /meal-plan-shopping-runs/:runId` returns stored run summaries and linked artifact ids
- `GET /meal-plan-optimized-baskets/:basketId` returns stored optimized basket rows including selected, covered, and missing items
- missing profile, plan, run, and basket ids return bounded errors
- APP1 does not add new optimizer logic and does not write Firestore directly

## Phase INVENTORY1 coverage
- INVENTORY1 migration creates deterministic `user_inventories` and `inventory_items` tables with bounded storage, perishability, and update-source enums
- inventory creation is idempotent per `user_id`
- canonical ingredient inventory items store `ingredient_id` and ingredient-key snapshots when a known ingredient exists
- duplicate additions merge within the same logical identity and storage context instead of creating duplicate active rows
- quantity reductions update the stored remaining-ratio estimate deterministically
- zero-quantity removals soft-remove rows by zeroing quantities instead of hard deletion
- expiry estimation uses ingredient shelf-life hints when available
- product-level fallback tracking works without canonical ingredient links
- deterministic seed reruns reset fixture quantities instead of doubling them
- INVENTORY1 does not call planners, does not write Firestore, and does not touch basket/runtime shopping paths

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

## Phase 20 coverage
- unresolved queries produce high gap scores and `missing_supply` classification
- ambiguous queries produce medium gap scores and `poor_match_quality` classification
- category-relative price pressure raises score and classifies `high_price_pressure`
- summaries group by `normalized_query` and `category_l2`
- empty signal datasets return safe empty summaries
- summary and endpoint reads do not mutate `gap_signal_store`
- repeated reads stay deterministic
- search and resolver handlers capture gap signals without changing successful responses
- endpoint validation rejects bad options and applies limits

## Phase 20.1 coverage
- signal identity includes normalized nullable `locality_code`
- direct gap-summary reads can filter by locality without breaking global summaries
- locality summaries return top gaps for one locality or all localities
- missing locality values are handled safely as nullable segments
- locality summaries support grouping by query and category
- gap groups sort by `gap_score` within each locality
- localities sort by strongest top-gap score and unresolved rate
- locality reads remain deterministic and non-mutating
- search, shopping-list resolution, and watchlist flows capture locality context when available

## Phase 20.2 coverage
- legacy signals without chain/store context still work in default gap summaries
- signal identity includes normalized optional `chain_id` and `store_id`
- direct gap-summary reads can filter by `chain_id` and `store_id`
- locality plus chain filters work together without breaking Phase 20.1 locality reads
- gap summaries support grouping by `chain_id` and `store_id`
- coverage-by-chain computes `coverage_rate` from resolved versus total chain signals
- coverage-by-chain sorts lowest coverage before higher coverage and then by signal count
- unknown chain/store context is handled safely as nullable or uncategorized segments
- chain/store reads remain deterministic and non-mutating
- search, shopping-list resolution, basket forwarding, and watchlist flows capture chain/store context when available

## Phase 20.3 coverage
- market opportunity reports generate `missing_supply` opportunities from unresolved-heavy evidence
- market opportunity reports generate `poor_match_quality` opportunities from ambiguous-heavy evidence
- category-relative price pressure generates `high_price_pressure` opportunities
- uneven chain coverage generates `distribution_gap` opportunities with chain coverage evidence
- low-sample weak evidence generates `data_quality_gap` opportunities
- normal high-volume demand generates `emerging_interest` opportunities
- confidence labels follow deterministic high, medium, and low sample/score rules
- recommended action text is deterministic per opportunity type
- filters are preserved and applied in report output
- opportunities sort deterministically by score, confidence, signal count, and id
- empty datasets and endpoint validation are safe
- report generation and endpoint reads do not mutate `gap_signal_store`

## Phase 20.4 coverage
- merchant/admin overview aggregates total signals, total opportunities, high-confidence opportunities, top opportunity, and top category
- insights opportunities wrapper applies filters and limits while preserving opportunity card shape
- category aggregation returns opportunity count, average gap score, and top gap
- locality aggregation returns opportunity count, average gap score, and top gap
- chain aggregation reuses opportunity coverage evidence for coverage rate, gap count, and top gap
- filters are preserved and applied across insight builders
- empty datasets return safe empty arrays and null summary cards
- insight reads do not mutate `gap_signal_store`
- insight outputs are deterministic and endpoint validation is bounded

## Phase 20.5 coverage
- protected internal analytics reads without a token return bounded forbidden responses
- wrong tokens return bounded forbidden responses
- correct token plus `admin` role is allowed
- correct token plus `analyst` role is allowed
- correct token plus `merchant` role is denied for now
- missing `PRICER_INTERNAL_ANALYTICS_TOKEN` denies protected access by default
- normal consumer endpoints remain outside the internal analytics protected path list
- all Phase 20 market-intelligence endpoint paths are covered by the protected path list
- forbidden responses do not include submitted or configured token values

## Phase 20.6 coverage
- internal dashboard shell renders as an HTML surface
- dashboard consumes all Phase 20.4 insight endpoints
- dashboard sends token and role headers without embedding a token value
- dashboard keeps token browser-local and configurable
- dashboard includes overview, opportunities, categories, localities, and chains sections
- dashboard shell route stays outside the protected path list while data endpoints remain guarded
- dashboard handler returns no-store HTML response headers
- dashboard copy avoids merchant billing or polished product positioning

## Phase 15.9 rich semantic enrichment v2 coverage
- rich `canonical_semantic_v2` schema validates optional product identity, grocery, package, dairy, beverage, baby, search, shopping-intent, and quality fields
- milk, milk shampoo, Milka chocolate, cola beverage, and collagen shampoo examples keep product semantics distinct
- batch prompt and validator require exactly one result per requested `canonical_product_id`
- dry-run writes nothing and reports cost estimates
- real-run guard prevents accidental LLM calls without `PRICER_ENRICHMENT_RUN_LLM=true`
- same canonical id/name hash/version cache hits are skipped before prompting
- explicitly opted-in real pilot writes only `canonical_enrichment_store`
- provider config healthcheck runs without Firestore writes or live LLM calls by default, and provider failures expose network cause and HTTP status/body details
- enrichment-backed search continues to pass deterministic cookies/snacks/cola guardrail coverage

## Phase 15.9 canonical semantic enrichment v3 coverage
- v3 prompt includes exact JSON schema, registry context, and instructions to preserve raw terms, use accurate registry matches, avoid false buckets, and propose aliases/new terms when needed
- v3 product taxonomy uses `product_category`, keeps legacy `food_category` backward-compatible for existing food records, rejects non-food `food_category` actions, and maps shampoo as `Personal Care > Hair Care > Shampoo`
- v3 validation preserves messy raw terms such as `кофичка`, keeps `пакетирано` under review instead of forcing `packet`, and validates strict shape/types without rejecting unfamiliar raw vocabulary
- v3 provider request bodies use strict `response_format.json_schema` by default with a `json_object` fallback flag
- v3 pilot prompts use bounded relevant registry context, avoid duplicating the full schema in real provider user messages when `response_format.json_schema` is present, and report prompt/request/schema/registry token-size metrics in dry-run summaries
- v3 real pilot seeds `semantic_term_registry`, writes `canonical_semantic_v3` enrichment records, and creates only pending `semantic_term_registry_proposals`
- duplicate v3 registry proposals are deduped, and LLM proposals do not directly activate terms
- malformed v3 provider JSON is stored in `canonical_enrichment_failed_responses` redacted, while affected canonical enrichment writes are skipped
- Phase 15 provider retries cover first-try success, `UND_ERR_SOCKET`, HTTP 503, HTTP 429, non-retryable HTTP 400, exhausted retry attempt history, timeout aborts, v3 `response_format` preservation across retries, per-attempt duration/request-size metadata, possible local request bloat classification, and pilot summary retry metrics
