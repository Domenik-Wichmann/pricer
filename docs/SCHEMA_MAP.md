# Schema Map

Last updated: 2026-05-05

This is the schema-first companion to [REPO_MAP.md](REPO_MAP.md). Use it when you need to understand what data exists, where it lives, how records connect, and which code owns each schema surface.

## Quick Orientation

Pricer currently has two persistence worlds:

1. **App-facing runtime data backbone**
   - Shape: flat JSON-compatible collections.
   - Production backend adapter: Firestore top-level collections with deterministic document IDs.
   - Local/dev adapter: JSON file state.
   - Test adapter: in-memory state.
   - Owner: `functions/src/phase1/store.js` and mirrored `app/functions/src/phase1/store.js`.

2. **Postgres sidecar**
   - Shape: relational tables from `db/migrations/`.
   - Purpose: source metadata, large external imports, USDA nutrition facts, clustering, review, and mapping staging.
   - Current status: sidecar only. Product search, shopping, watchlist, basket, and mobile runtime do not read directly from Postgres yet.
   - Owner: `functions/src/db/`, `functions/src/db/usda/`, mirrored `app/functions/src/db/`, and `db/migrations/`.

The important boundary: **Firestore/flat store is app-facing runtime truth today. Postgres is source/import/review truth for heavy external data.** Do not silently move a runtime read path from one world to the other.

Production runtime note: Firestore-backed routes must read and write this flat schema through scoped collection/query helpers. Full flat-store `load()` and `save()` remain legacy local/offline operations and are unsafe for large `prod_` runtime collections.

## Schema Owners

| Schema area | Runtime? | Source of truth | Code owner | Primary docs |
| --- | --- | --- | --- | --- |
| Price snapshots and source products | Yes | Flat store / Firestore | `phase1/`, `phase6/ingest.js` | `DATA_MODEL.md`, this file |
| Query/matching outputs | Service output | Computed from flat store | `phase2/`, `phase4/` | `DATA_MODEL.md` |
| Semantic profiles and embeddings | Yes | Flat store / Firestore | `phase3/` | `DATA_MODEL.md` |
| Aggregated price history | Yes | Flat store / Firestore | `phase3_5/` | `DATA_MODEL.md` |
| Current product offers, offer fingerprints, change events, manifests, and canonical current offer summaries | Yes | Derived flat store / Firestore read model | `phase16/current_offers.js`, `phase16/price_lookup.js`, `phase15/service.js`, `phase6/incremental_ingest.js`, `scripts/publish_phase6_latest_firestore.js`, `scripts/diff_phase6_snapshot_firestore.js`, `scripts/export_phase6_current_offer_fingerprints.js` | `DATA_MODEL.md`, this file |
| Canonical products and mappings | Yes | Flat store / Firestore | `phase6/ingest.js`, `phase15/readers.js` | `DATA_MODEL.md` |
| Retailer/store locations | Yes | Derived flat store / Firestore read model | `phase6/store_locations.js`, `phase6/ingest.js` | `DATA_MODEL.md`, `STORE_LOCATION_EXTRACTION.md` |
| Retailer/store geocoding cache | Yes | Additive flat store / Firestore read model | `phase6/geocoding.js` | `DATA_MODEL.md`, `STORE_LOCATION_EXTRACTION.md` |
| Manual-address geocoding cache | Yes | Additive flat store / Firestore read model | `phase6/geocoding.js` | `DATA_MODEL.md`, `STORE_LOCATION_EXTRACTION.md` |
| Location review candidates | Yes | Additive flat store / Firestore admin-review read model | `phase6/location_review.js` | `DATA_MODEL.md`, `STORE_LOCATION_EXTRACTION.md` |
| Reviewed location coordinates | Yes | Additive flat store / Firestore internal read model | `phase6/location_review.js` | `DATA_MODEL.md`, `STORE_LOCATION_EXTRACTION.md` |
| Canonical enrichment and disambiguation | Yes | Flat store / Firestore | `phase6/disambiguation.js`, `phase15/enrichment.js`, `phase15/enrichment_pilot.js` | `DATA_MODEL.md`, `PHASE_15_9_SEMANTIC_ENRICHMENT_PILOT.md` |
| Meal ingredient catalog and bridge | Yes | Flat store / Firestore | `meal/` | `DATA_MODEL.md`, Phase M0 docs |
| Production ingest logs and alerts | Yes | Flat store / Firestore | `phase6/`, `phase9/` | `DATA_MODEL.md` |
| Demand intelligence | Yes | Flat store / Firestore | `phase7/` | `DATA_MODEL.md` |
| Monetization | Yes | Backend flat store plus client Firestore profile cache | `phase10/`, mobile billing services | `DATA_MODEL.md` |
| Basket analytics | Yes | Flat store / Firestore | `phase16/basket_analytics.js` | Phase 16.6 docs |
| Shopping intent family preferences | Yes | Flat store / Firestore | `phase15/shopping_intent.js` | `DATA_MODEL.md`, Phase 15.8 docs |
| Saved lists and watchlist tracker | Yes | Flat store / Firestore | `phase17/` | Phase 17 docs |
| Saved user locations | Yes | Flat store / Firestore user preference records | `phase6/saved_user_locations.js` | `DATA_MODEL.md`, `STORE_LOCATION_EXTRACTION.md` |
| Mobile user lists/watchlist/billing cache | Client runtime | Nested Firestore under `users/{anon_id}` | `app/mobile/lib/core/services/firestore_repositories.dart` | `DATA_MODEL.md` |
| Postgres import metadata | Sidecar | Postgres | `db/import_metadata_repository.js` | DB1 docs |
| USDA macro import | Sidecar | Postgres | `db/usda/usda_importer.js`, `usda_repository.js` | DB2 docs |
| USDA clustering and review | Sidecar | Postgres | `db/usda/cluster_*` | DB2.5 docs |
| Ingredient nutrition mappings | Sidecar | Postgres, references runtime ingredient IDs by string | `db/usda/ingredient_nutrition_mapping_*` | DB2.5 docs |
| Ingredient product equivalence | Sidecar | Postgres, references DB3A ingredients and product ids by string | `db/products/ingredient_product_*` | DB3 canonical ingredient docs |
| User food profiles, recipe feedback, taste snapshots, and inventory | Sidecar | Postgres, keyed by external user id plus canonical recipe and ingredient ids, isolated from runtime recommendation behavior | `db/users/user_food_profile_repository.js`, `db/users/recipe_feedback_repository.js`, `db/users/user_taste_profile_engine.js`, `db/users/user_inventory_repository.js` | UX1, UX2, PROF1, and INVENTORY1 docs |
| Meal planner sidecar | Sidecar | Postgres, references UX1 profiles, PROF1 snapshots, canonical recipes, approved recipe nutrition profiles, canonical ingredient lines, INVENTORY1 for derived netting, the runtime canonical product/price backbone for PLAN2B candidate reads plus PLAN2C optimizer adaptation, and deterministic PLAN2D orchestration summaries | `db/planner/meal_planner_engine.js`, `db/planner/meal_plan_requirements_builder.js`, `db/planner/meal_plan_net_requirements_builder.js`, `db/planner/meal_plan_product_candidate_builder.js`, `db/planner/meal_plan_basket_optimizer_adapter.js`, `db/planner/meal_plan_shopping_orchestrator.js` | PLAN1 and PLAN2 planner docs |
| Canonical recipes | Sidecar | Postgres, references DB3A ingredients and approved ingredient nutrition profiles | `db/recipes/recipe_repository.js`, `db/recipes/recipe_nutrition_profiles.js`, `db/recipes/recipe_nutrition_profile_review_service.js`, `db/recipes/recipe_quality_reports.js`, `db/recipes/recipe_ingest_promotion_service.js` | DB4 recipe docs, DB5 recipe ingest docs |
| Recipe ingest staging | Sidecar | Postgres, raw-preserving recipe staging and LLM extraction provenance | `db/recipes/recipe_ingest_staging_repository.js`, `db/recipes/recipe_llm_extraction.js`, `db/recipes/recipe_extraction_schema.js`, `db/recipes/recipe_ingest_promotion_service.js` | DB5 recipe ingest docs |

## App-Facing Runtime Backbone

The complete collection registry lives in:

- `functions/src/phase1/store.js`
- `app/functions/src/phase1/store.js`

Every collection is represented as an array in the local/in-memory store and as a Firestore top-level collection in production. Document IDs are deterministic from `COLLECTION_DOCUMENT_IDS` in `phase1/store.js`.

### Runtime Collection Index

| Collection | Document ID | Purpose | Key relationships |
| --- | --- | --- | --- |
| `raw_price_snapshots` | `snapshot_id` | Raw KolkoStruva price rows after parsing and normalization. | Many snapshots belong to one `source_product_id`. Feeds current price lookup and aggregation. |
| `source_products` | `source_product_id` | Stable source product identity for chain/locality/product-code level products. | Referenced by enrichment, semantic profiles, embeddings, price history, feedback, watchlist intelligence, and canonical mappings. |
| `source_product_enrichment` | `source_product_id` | Deterministic product parse/enrichment cache for source products. | One row per source product. Additive metadata over raw source truth. |
| `semantic_profiles` | `source_product_id` | Semantic summaries and terms for source products. | One row per source product. |
| `embedding_records` | `source_product_id + embedding_model` | Product embedding vectors. | One or more embeddings per source product/model. |
| `feedback_events` | `feedback_id` | User or system feedback about query/product resolution. | Optional link to `source_product_id`. |
| `product_daily_prices` | `source_product_id + date` | Product-level daily price aggregates. | Derived from `raw_price_snapshots`. Used for product history and watchlist intelligence. |
| `current_product_offers` | `offer_id` | Compact latest/current offer read model, one row per source product with usable current price. | Derived from latest raw snapshot, source product, canonical mapping, and canonical product context; queried by canonical/source ids in live routes. |
| `current_offer_fingerprints` | `source_product_id` | Incremental latest-update baseline, one stable hash per current source-product offer. | Compared by daily diff jobs to skip unchanged offers and avoid rewriting the current read model. |
| `offer_change_events` | `event_id` | Planned append-only latest-offer change stream for policy-selected new/changed offer observations. | Produced only by the future real incremental writer; dry-runs estimate `all_changes`, `price_promo_availability`, and `none` event policies. |
| `snapshot_manifests` | `manifest_id` | Per-snapshot diff/run summary for dry-runs and committed incremental updates. | Records scanned counts, diff categories, affected canonical ids, event policy, estimated/actual/failed writes, high-write catch-up acknowledgement, and delete policy. |
| `canonical_current_offer_summary` | `canonical_product_id` | Compact current-price summary per canonical product. | Derived from `current_product_offers`; stores min/max/avg, current offer count, chain/retailer count, cheapest offer pointers, and additive price-normalization metadata. Phase 15 may supplement missing rows with scoped mapping/source-product evidence for zero-current-offer display counts. |
| `category_daily_aggregates` | `category_code + date` | Category-level daily aggregate prices. | Derived from snapshots/source products. |
| `sql_products` | `source_product_id` | Flat sync target for SQL-like product reads. | Mirrors selected `source_products` fields. |
| `sql_product_prices_daily` | `source_product_id + date` | Flat sync target for product daily prices. | Mirrors `product_daily_prices`. |
| `sql_category_aggregates` | `category_code + date` | Flat sync target for category aggregates. | Mirrors `category_daily_aggregates`. |
| `vector_index_records` | `source_product_id + embedding_model` | Flat sync target for vector records. | Mirrors `embedding_records`. |
| `canonical_products` | `canonical_product_id` | Deterministic cross-source product groups. | Target of `canonical_product_mappings`; referenced by product catalog, basket planning, saved lists, watchlist tracker, and meal bridge. Invalid records may carry additive no-delete `data_quality_status = "invalid"` quarantine markers. |
| `canonical_product_mappings` | `source_product_id` | Link from source product to canonical product. | Connects `source_products.source_product_id` to `canonical_products.canonical_product_id`. |
| `canonical_enrichment_store` | `canonical_fingerprint` | Additive LLM/cached enrichment for canonical product concepts, including optional Phase 15.9 search aliases/category flags, v3 open taxonomy classification, and v3 repair metadata. | Fingerprint currently aligns with canonical product ID. Must not mutate canonical grouping truth. Pilot writes are limited to this collection and may cache canonical-name hash plus `enrichment_repair_status`, `repair_warnings`, `discarded_fields`, and review metadata. |
| `semantic_term_registry` | `term_id` | Reusable semantic normalization vocabulary for `canonical_semantic_v3`, including hierarchical `product_taxonomy` terms. | Seeded from existing Phase 15 enum-like terms plus broad product-taxonomy starter departments/children; referenced by v3 registry matches and proposal `existing_term_id` values. |
| `semantic_term_registry_proposals` | `proposal_id` | Pending review queue for LLM-proposed aliases, new terms, and relationships. | Written from v3 `registry_actions` and `taxonomy_classification.proposed_terms`; proposals are pending by default and never directly activate registry terms. |
| `canonical_enrichment_failed_responses` | `failed_response_id` | Redacted malformed provider-response artifacts for canonical enrichment batches. | References run/batch/product ids for debugging; no secrets, no canonical writes on parse failure. |
| `retailer_locations` | `location_id` | Deterministic store/location read model extracted from raw store names where source text contains city/address hints. | Derived from `raw_price_snapshots` and `source_products`; preserves provenance and leaves coordinates null until geocoding. |
| `retailer_location_geocodes` | `geocode_id` | Additive geocoding cache/read model for retailer locations. | References `retailer_locations.location_id`; keyed by normalized country/city/raw address/store identity; provider results must not mutate raw location fields. |
| `manual_location_geocodes` | `geocode_id` | Additive cache/read model for user-triggered manual-address coordinate lookup. | User-scoped provenance over raw address text; matched coordinates require explicit confirmation before use or saving. |
| `location_review_candidates` | `candidate_id` | Deterministic admin-review queue for risky or valuable geocoded locations. | References source rows by `source_type` and `source_id`; approved corrections stay additive on the candidate. |
| `reviewed_location_coordinates` | `reviewed_coordinate_id` | Additive publication layer for approved location-review coordinate corrections. | References `location_review_candidates.source_candidate_id` and the original source identity; one active row per source identity, consumed by nearest availability only when `coordinate_mode = "reviewed_first"`. |
| `canonical_disambiguation_queue` | `warning_id` | Potential canonical grouping conflicts requiring review. | Stores product pair payloads and pair fingerprint. |
| `canonical_disambiguation_decisions` | `decision_id` | LLM/human decisions for queued canonical conflicts. | Reused by `pair_fingerprint`; provenance only unless later applied as a view. |
| `ingredient_families` | `ingredient_family_id` | Meal-domain ingredient family hierarchy. | Parent for categories and ingredients. |
| `ingredient_categories` | `ingredient_category_id` | Meal-domain ingredient categories. | References `ingredient_family_id`; parent for ingredients. |
| `ingredients` | `ingredient_id` | Canonical meal-domain ingredients with BG/EN names and aliases. | Referenced by product ingredient mappings, unit rules, and Postgres ingredient nutrition mappings by string ID. |
| `product_ingredient_mappings` | `mapping_id` | Bridge from retailer canonical products to meal ingredients. | Links `canonical_product_id` to `ingredient_id`; does not mutate either side. |
| `units` | `unit_id` | Unit catalog for meal quantities. | Referenced by conversions and ingredient unit rules. |
| `unit_conversions` | `conversion_id` | Generic conversions within unit types. | Links `from_unit_id` to `to_unit_id`. |
| `ingredient_unit_rules` | `ingredient_rule_id` | Ingredient-specific conversion/yield rules. | References `ingredient_id`. |
| `ingest_runs` | `ingest_run_id` | Production ingest run metadata. | Summarizes KolkoStruva import and canonicalization outcomes. |
| `admin_ingest_jobs` | `job_id` | Admin Console historical ingest planning and visibility records. | Planned/running/succeeded/failed/cancelled job metadata; endpoint V1 creates planned records only and does not process ZIPs synchronously. |
| `pipeline_logs` | `log_id` | Pipeline log records. | Append-only diagnostics. |
| `analytics_events` | `analytics_event_id` | Query/product/user analytics events. | Optional user/query/source product links. |
| `basket_analytics_store` | `analytics_id` | Persisted basket quality/optimizer metrics when explicitly requested. | Observation-only; must not affect basket output. |
| `gap_signal_store` | `signal_id` | Internal market-gap signals from search, resolver, shopping-list/basket input, and watchlist additions, with nullable locality, chain, and store context. | Observation-only; read by `phase18/gap_detection.js` for global `GET /analytics/gap-detection`, locality rollups on `GET /analytics/gap-detection/localities`, chain coverage via `GET /analytics/gap-detection/coverage-by-chain`, business-readable opportunity reports via `GET /analytics/opportunities`, and merchant/admin insight rollups under `GET /analytics/insights/*`. |
| `saved_lists_store` | `list_id` | Backend saved shopping lists. | Owner-scoped records storing user input only; Phase 18.7 mobile screens consume this through `/lists` CRUD without adding client persistence. |
| `watchlist_store` | `watch_id` | Backend canonical-product watchlist tracker. | Owner-scoped references to canonical products; price view is computed, not copied. |
| `user_product_family_preferences` | `preference_id` | Owner-scoped preferred attributes and brand hints by shopping product family. | Read by `phase15/shopping_intent.js` only as deterministic suggested defaults; does not select or mutate canonical products/offers. |
| `saved_user_locations` | `location_id` | Consented saved user locations for opt-in location-aware search. | User-scoped preference records; can resolve Phase 2B availability requests by saved location id, unambiguous label, or default location. |
| `watchlist_alert_events` | `alert_id` | Price drop alert events. | Links to user and `source_product_id`. |
| `notification_events` | `notification_id` | Notification send attempts/results. | Links to alert/user/source product. |
| `watchlist_profiles` | `watchlist_key` | Phase 9 watchlist intelligence profile. | Separate from Phase 17 tracker; source-product oriented. |
| `watchlist_recurring_patterns` | `recurrence_id` | Recurring watchlist timing patterns. | Source-product/user pattern records. |
| `watchlist_insight_events` | `insight_id` | Watchlist price insight events. | Source-product/user/snapshot records. |
| `watchlist_daily_summaries` | `summary_id` | Daily watchlist user summaries. | User/date aggregate. |
| `demand_logs` | `demand_log_id` | Raw unmet/manual demand events. | Feeds demand aggregates. |
| `demand_aggregates` | `demand_key` | Aggregated demand by normalized query/locality. | Feeds demand embeddings/clusters. |
| `demand_embeddings` | `demand_key + embedding_model` | Demand query embeddings. | One or more per demand key/model. |
| `demand_clusters` | `cluster_id` | Demand cluster records. | Stores member demand keys as JSON. |
| `canonical_terms` | `term_id` | Search canonical term records. | Used by Phase 12 query canonicalization. |
| `synonym_map` | `synonym_id` | Synonyms/typos mapped to canonical terms. | References canonical terms by `canonical_term_id` value. |
| `user_tiers` | `user_id` | Backend monetization tier records. | Backend-authoritative for premium gating. |
| `revenuecat_events` | `revenuecat_event_id` | RevenueCat entitlement event records. | Feeds/updates `user_tiers`. |

## Core Runtime Relationships

### Price and Product Runtime

```text
raw_price_snapshots.source_product_id
  -> source_products.source_product_id
  -> canonical_product_mappings.source_product_id
  -> canonical_products.canonical_product_id
```

Important rules:
- `raw_price_snapshots` preserves source row truth and is append/idempotency oriented.
- `source_products` is stable source identity; do not replace it with canonical identity.
- `canonical_products` is a grouping layer over source identity, not the raw source of prices.
- `canonical_product_mappings` is the bridge for product catalog, shopping-list resolution, and basket planning.
- Product detail may expose a bounded list of `canonical_product_mappings.source_product_id` values for QA/navigation; this is an API convenience over the same mapping rows, not a new persistence collection.
- Historical ingest may append `raw_price_snapshots`, `product_daily_prices`, `ingest_runs`, and `pipeline_logs` for old dates. It must not delete catalog/current read-model rows, and it must not publish current read models unless the operator explicitly targets them.

### Current Price Lookup

```text
canonical_product_id
  -> canonical_product_mappings
  -> current_product_offers / canonical_current_offer_summary
  -> fallback legacy scoped mappings/source_products/latest raw_price_snapshots per source_product_id when compact offers are absent
```

Owner:
- `phase16/price_lookup.js`

Rules:
- Source prices are treated as EUR.
- Current-price display should prefer `current_product_offers` and `canonical_current_offer_summary` because they are compact and route-safe.
- Product catalog detail/search may read scoped `canonical_product_mappings` and `source_products` for canonical products that lack a compact current summary, exposing `current_offer_count = 0`, historical/source counts, retailer evidence, and `last_seen_at` while leaving price min/max/avg unavailable.
- Legacy mappings/source/snapshot lookup remains bounded fallback behavior until the compact model is populated.
- Staleness and missing-price state must be explicit in responses.
- Invalid/quarantined `source_products` or invalid offer rows are excluded from compact current-offer reads and legacy fallback price records; current-offer summaries are not rewritten by quarantine mode.

### Incremental Latest Update

```text
new latest snapshot
  -> build current_product_offers in memory
  -> build current_offer_fingerprints
  -> compare with existing/exported fingerprints
  -> write only changed offers/fingerprints/events
  -> rebuild only affected canonical_current_offer_summary rows
  -> record one snapshot_manifest
```

Rules:
- Direct Firestore comparison reads one existing fingerprint or current-offer row per incoming source product. At production scale this can mean 1M+ reads, so full dry-runs should use an exported fingerprint baseline or a prebuilt manifest/cache.
- The baseline export command reads `current_product_offers` page-by-page and writes a compact local JSONL file. It does not write Firestore data unless the operator explicitly enables the guarded backfill mode.
- Daily diff categories are `unchanged`, `new_offers`, `price_changed`, `promo_changed`, `availability_changed`, `metadata_changed_only`, `canonical_mapping_changed`, `other_changed`, and `missing_removed`. The default event policy is `price_promo_availability`, which avoids event writes for metadata-only changes unless explicitly enabled.
- Dry-run `diff_diagnostics` is report-only and does not add persistence. It summarizes category churn by chain/category, samples source products and price/canonical changes, and only estimates replacement churn when the baseline includes enough old-side offer detail.
- Missing/removed offers are reported and may affect summaries, but no documents are deleted by default.
- Historical backfill remains append/idempotency oriented for date-specific archive/history rows and must not recompute latest/current read models by default.

### Shopping and Basket Flow

```text
user input text
  -> phase15/shopping_intent family/attribute clarification when the term is broad
  -> phase15/shopping_list resolution
  -> canonical_products candidates
  -> phase15/basket_planner
  -> phase16/price_lookup
  -> phase16/basket_optimizer
  -> optional explanation / convenience / metrics / analytics / health layers
```

Persistence rules:
- Shopping intent preferences store owner-scoped family defaults only; they are hints before canonical product selection.
- The shopping-list and basket planner `intent_first` adapter is opt-in only. It may read `user_product_family_preferences` through scoped owner/family queries, but ambiguous intent stays transient in `clarification_needed` / `clarification_items` response fields and never writes a new schema row.
- Saved lists store user input and owner metadata only.
- Mobile saved-list editing sends normalized item strings back to the same saved-list records and navigates current items into `/optimize`; optimization output is not written to saved lists.
- Optimizer, explanation, metrics, and health outputs are recomputed unless explicitly persisted as analytics.
- Basket analytics is observation-only.

### Meal Ingredient Bridge

```text
canonical_products.canonical_product_id
  -> product_ingredient_mappings.canonical_product_id
  -> ingredients.ingredient_id
  -> ingredient_unit_rules / Postgres ingredient_nutrition_mappings
```

Rules:
- Retailer product truth and meal ingredient truth are separate domains.
- `product_ingredient_mappings` bridges domains without mutating either side.
- User-facing/searchable ingredient records need BG/EN names and aliases.

### Watchlist Layers

There are two watchlist concepts:

| Layer | Collection | Identity | Purpose |
| --- | --- | --- | --- |
| Phase 17 tracker | `watchlist_store` | `watch_id`, owner, `canonical_product_id` | CRUD watchlist for canonical products and computed current price view. |
| Phase 9 intelligence | `watchlist_profiles`, `watchlist_*` events | user and `source_product_id` | Price-drop insights, alerts, recurrence, summaries. |

Do not collapse these without a phase plan. The tracker is canonical-product oriented; intelligence is source-product/price-history oriented.

### Gap Detection Analytics

```text
search / resolver / watchlist input
  -> gap_signal_store
  -> phase18/gap_detection.js summary groups
```

Rules:
- `gap_signal_store` is an internal analytics collection and is not a user-facing product/search source of truth.
- Signal writes must be deterministic and observation-only; they must not alter resolver, basket, watchlist, canonical, enrichment, or price behavior.
- Classification is explainable: unresolved-heavy groups are `missing_supply`, ambiguous-heavy groups are `poor_match_quality`, and groups priced above the category baseline are `high_price_pressure`.
- `locality_code` is optional context, not verified supply truth. Global summaries can still be read without locality, while locality views segment the same signals by city/region code when present.
- `chain_id` and `store_id` are also optional context. They can be used for explicit filtered summaries or chain coverage reads, but they must never become required for default gap UX or signal capture.

## Runtime Field Notes by Domain

For complete field lists, see [DATA_MODEL.md](DATA_MODEL.md). This section explains connection semantics.

### Source Price Fields

`raw_price_snapshots`:
- Identity: `snapshot_id`
- Source product link: `source_product_id`
- Source provenance: `source_file_name`, `source_file_name_raw`, `source_file_stem`, `source_chain_name_raw`, `source_chain_name_normalized`, `source_file_numeric_id`, `row_number`, `raw_source_row`
- Price facts: `retail_price`, `promo_price`, raw text price fields
- Date/locality: `snapshot_date`, `locality_code`

`source_products`:
- Identity: `source_product_id`
- Product source identity fields: `locality_code`, `store_name_raw`, `product_code`, `category_code`
- Latest source display fields: `latest_product_name_raw`, `latest_snapshot_id`
- Lifecycle: `first_seen_date`, `last_seen_date`, `is_active`, `needs_revalidation`, `drift_level`

### Canonical Product Fields

`canonical_products`:
- Identity: `canonical_product_id`
- Grouping key: `canonical_product_key`
- Display/classification: `canonical_display_name`, `canonical_brand`, `canonical_product_type`, `canonical_category_code`
- Size: `canonical_size_value`, `canonical_size_unit`
- Deterministic markers: `canonical_attributes_json`, including compact legacy marker strings and optional structured `size_marker`
- Provenance: `source_example_name`, `source_product_count`
- Backfill metadata: optional `canonical_marker_backfill_version`, `canonical_marker_backfilled_at`

Structured `size_marker` normalizes extracted size/package markers into comparable and display-safe fields while preserving `raw_text`. It stores `quantity`, `unit`, `total_quantity`, `total_unit`, optional `pack_count`, optional `unit_quantity`, optional `unit_quantity_unit`, `display`, and `normalized_display`. Unit variants such as `гр`, `г`, `кг`, `мл`, `л`, and `бр` normalize to `g`, `kg`, `ml`, `l`, or `pcs`; comparable mass/volume totals are expressed in `g` or `ml`.

Product detail and product search expose this field as `markers.size_marker` when it exists on the canonical product. Legacy compact marker fields remain in `markers` for backward compatibility.

Phase 15 price normalization is additive metadata derived from deterministic markers and conservative category/name evidence. It exposes `explicit_quantity_detected`, `inferred_selling_unit`, `comparison_basis`, `uom_inference_confidence`, `uom_inference_reason`, `needs_uom_review`, optional `explicit_quantity`, and optional `price_per_comparison_basis`. It must not invent a package quantity for loose-weight products; for example inferred kg/per_kg chicken has `explicit_quantity = null` on product-level metadata. Product detail/search can derive current-summary `price_per_comparison_basis` from existing current summary prices when compact summary normalization is missing or `unknown`.

Canonical marker backfill ownership:
- Script: `scripts/backfill_canonical_markers_firestore.js`
- Command: `npm run phase6:backfill-canonical-markers`
- Scope: scans only `canonical_products`; reads matching `canonical_enrichment_store` docs only when a safe brand cleanup needs enrichment alignment.
- Forbidden collections: `raw_price_snapshots`, `current_product_offers`, `product_daily_prices`, `canonical_product_mappings`, and `source_products`.
- The script patches changed fields only and never rewrites canonical IDs, mappings, offers, raw rows, or history rows.

`canonical_product_mappings`:
- Source side: `source_product_id`, `dedupe_key`
- Canonical side: `canonical_product_id`
- Provenance: `mapping_confidence`, `mapping_method`, `mapped_at`

### Enrichment and Review Fields

`canonical_enrichment_store`:
- Identity: `canonical_fingerprint`
- Enrichment payload: nested `enrichment.*`; rich v2 records use `enrichment.enrichment_version = "canonical_semantic_v2"` and may include identity/classification, generalized `category_l1`/`category_l2`/`category_l3` paths, food/beverage/dairy/baby/package/search/shopping-intent/quality fields. Optional v3 records use `enrichment.schema_version = "canonical_semantic_v3"` and preserve raw terms/descriptions separately from registry matches, proposed aliases/new terms, search buckets, warnings, and review flags. V3 product taxonomy uses `enrichment.taxonomy_classification` with `product_taxonomy` registry matches, index-aligned path term ids, raw category terms, proposed taxonomy terms, confidence, and review flags. The older `product_category` category object remains readable for compatibility; legacy `food_category` remains readable only for food terms. V3.1 may also include `enrichment.semantic_usage_profile` for additive cuisine/flavor/culinary role/meal context/common use/pairing/substitute/search-intent/not-for metadata and `enrichment.semantic_embedding_summary` for concise embedding-ready prose with language, aspects, capped evidence, confidence, and review flag.
- Cache metadata: `canonical_product_id`, `canonical_name_hash`, `enrichment_version`, and `enrichment_source`; the Phase 15.9 pilot skips records whose canonical id, name hash, and v2 version already match.
- Explicit claim provenance: `explicit_claim_evidence[]` for deterministic diet/attribute alias matches where available
- Provenance: `model_name`, `prompt_version`, `created_at`

`semantic_term_registry`:
- Identity: `term_id`
- Domain fields: `domain`, `canonical_label`, `display_label`, `definition`, `aliases[]`
- Relationships: `parent_term_id`, `related_term_ids[]`
- Workflow/provenance: `status`, `source`, `confidence`, `evidence_examples[]`, timestamps
- Seed taxonomy domains include hierarchical `product_taxonomy` departments (`Grocery`, `Personal Care`, `Household`, `Baby & Kids`, `Pet Care`, `Automotive`, `Sports & Outdoors`, `Tools & Hardware`, `Garden & Outdoor`, `Electronics`, `Home Appliances`, `Clothing`, `Health`, `Office & School`) plus starter tested children for grocery, personal care, automotive, and garden products. Existing `product_category` and `sem_food_category_*` records remain backward-compatible, but new open taxonomy proposals should use `product_taxonomy` and non-food proposals must not use `food_category`.

`semantic_term_registry_proposals`:
- Identity: `proposal_id`
- Proposal fields: `domain`, `action`, `proposed_label`, `proposed_alias`, `proposed_aliases[]`, `existing_term_id`, `parent_term_id`, `parent_label`
- Evidence/workflow: `evidence_product_ids[]`, `evidence_terms[]`, `confidence`, `status`, timestamps
- `product_taxonomy` new-term proposals are deduped by domain plus normalized proposed label plus parent term id.

`canonical_enrichment_failed_responses`:
- Identity: `failed_response_id`
- Debug fields: `run_id`, `batch_index`, `product_ids[]`, `provider`, `model`, `error_type`, `parse_error`, `raw_content_redacted`, `created_at`

`canonical_disambiguation_queue`:
- Identity: `warning_id`
- Reuse key: `pair_fingerprint`
- Product pair payloads: `product_a`, `product_b`
- Workflow: `warning_reason`, `status`, timestamps

`canonical_disambiguation_decisions`:
- Identity: `decision_id`
- Pair link: `pair_fingerprint`
- Decision: `decision`, `confidence`, `reason_short`, `decisive_features`
- Provenance: `decision_source`, `model_name`, `prompt_version`, `review_note`, `reviewed_by`

### Retailer Location Fields

`retailer_locations`:
- Identity: `location_id`
- Chain/store identity: `chain_id`, `chain_name_raw`, `chain_name_normalized`, `store_name_raw`, `store_name_normalized`, `branch_name`
- Location text: `raw_address`, `city`, `locality_code`, `country`
- Coordinates: `latitude`, `longitude`, both null before geocoding
- Extraction metadata: `source`, `confidence`, `confidence_reason`, `extraction_method`, `rules_version`, `needs_geocoding`
- Provenance: `provenance.source_file_name`, `provenance.source_file_name_raw`, `provenance.source_file_stem`, `provenance.source_file_numeric_id`, `provenance.source_chain_name_raw`, `provenance.source_chain_name_normalized`, `provenance.snapshot_ids[]`, `provenance.source_product_ids[]`, `provenance.raw_store_names[]`
- Lifecycle/counters: `first_seen_date`, `last_seen_date`, `snapshot_count`, `source_product_count`, `extracted_at`, `updated_at`

Rules:
- The collection is derived and additive; it must not overwrite `raw_price_snapshots`, `source_products`, product search, basket planning, price lookup, or canonical grouping.
- No LLM or external geocoding calls run during extraction.
- Rows with only a store name are retained at low confidence for auditability; rows with city/address text set `needs_geocoding = true`.

`retailer_location_geocodes`:
- Identity/cache: `geocode_id`, `cache_key`, `location_id`
- Provider fields: `provider`, `provider_place_id`, `query_text`, `formatted_address`, `raw_provider_result`
- Coordinates: `latitude`, `longitude`
- Quality/status: `confidence`, `confidence_reason`, `status`, `rules_version`
- Provenance: `provenance.source`, `provenance.location_id`, `provenance.country`, `provenance.city`, `provenance.raw_address`, `provenance.chain_id`, `provenance.chain_name_normalized`, `provenance.store_name_raw`, `provenance.store_name_normalized`, `provenance.branch_name`
- Lifecycle: `geocoded_at`, `updated_at`

Rules:
- Geocoding is additive and cache-first; it must not rewrite `retailer_locations` raw fields or coordinates.
- Phase 2A tests use a fake provider only; no live Google, Mapbox, Nominatim, LLM, or other external provider call is part of test execution.
- Consumer product search, price lookup, basket planning, and canonical grouping must continue to work without geocodes.
- `skipped` rows represent locations without enough address/city context; `ambiguous` rows preserve multiple provider candidates without selecting coordinates.

`manual_location_geocodes`:
- Identity/cache: `geocode_id`, `cache_key`, `user_id`
- Provider fields: `provider`, `provider_place_id`, `query_text`, `formatted_address`, `raw_provider_result`
- Coordinates: `latitude`, `longitude`
- Quality/status: `confidence`, `confidence_reason`, `status`, `rules_version`
- Provenance: `provenance.source`, `provenance.user_id`, `provenance.country`, `provenance.city`, `provenance.address_raw`, `provenance.display_name`
- Lifecycle: `geocoded_at`, `updated_at`

Rules:
- Manual-address geocoding is cache-first and user-triggered through `POST /user/locations/geocode-address`.
- The app must not geocode while the user types, and matched coordinates must not populate manual fields until the user confirms them.
- Ambiguous, failed, skipped, and invalid-input states are surfaced without selecting coordinates.
- Saved Home/Work/Custom records can preserve the confirmed provider/provenance fields with `source = "geocoded"`.
- Normal product search and nearest availability do not call live geocoding.

`location_review_candidates`:
- Identity/source: `candidate_id`, `source_type`, `source_id`, `related_location_id`
- Display/context: `title`, `query_text`, `raw_address`, `city`, `country`, `provider`, `provider_place_id`, `formatted_address`
- Coordinates/quality: `latitude`, `longitude`, `confidence`, `source_status`, `reuse_count`, `risk_score`, `risk_factors[]`
- Review fields: `review_status`, `reviewed_by`, `reviewed_at`, `reviewer_note`, `approved_latitude`, `approved_longitude`, `correction_reason`
- Evidence/lifecycle: `evidence`, `rules_version`, `created_at`, `updated_at`

Rules:
- Candidates are deterministic and ranked by source status risk, low confidence, reuse count, missing coordinates, and provider ambiguity/mismatch.
- Source rows include retailer geocodes, manual geocodes, saved geocoded locations, and address-like retailer locations with no coordinates.
- Allowed review statuses are `pending`, `approved`, `rejected`, and `needs_more_info`.
- Approved coordinates are additive review corrections only; they must not overwrite raw source/user address or provider cache rows.
- No maps UI, live provider calls, or LLM calls are part of candidate generation or review.
- Phase 2G exposes guarded internal review routes that require `x-pricer-admin-id` or `x-pricer-operator-id`; route decisions still write only to `location_review_candidates`.

`reviewed_location_coordinates`:
- Identity/source: `reviewed_coordinate_id`, `source_candidate_id`, `source_type`, `source_id`, `location_id`, `source_identity`
- Coordinates/review: `latitude`, `longitude`, `confidence`, `correction_reason`, `approved_by`, `approved_at`
- Supersession: `supersedes_id`, `is_active`
- Provenance/lifecycle: `provenance`, `rules_version`, `published_at`, `updated_at`

Rules:
- Publication reads only approved `location_review_candidates` with valid approved coordinates.
- Records are additive and do not overwrite retailer locations, retailer/manual geocode cache rows, or saved user locations.
- Only one reviewed coordinate is active per deterministic source identity; older active rows are retained with `is_active = false` when superseded.
- Phase 2H did not feed reviewed coordinates into consumer nearest availability or normal product search.
- Phase 2I exposes guarded internal read/diagnostic handlers for active rows, superseded rows, detail, and dry-run coordinate resolution.
- Dry-run precedence is active reviewed coordinate first, matched provider coordinate second, and unavailable otherwise.
- Phase 2J lets opt-in nearest availability use the same precedence only when `coordinate_mode = "reviewed_first"`; the default remains `provider_only`.
- Phase 2K exposes guarded rollout diagnostics for provider-vs-reviewed mode counts, changed-coordinate distance deltas, high-reuse reviewed coverage, and reviewed confidence distribution before any default switch.
- Phase 2L allows `DEFAULT_COORDINATE_MODE` to set the nearest-availability default to `provider_only` or `reviewed_first`; unset or invalid config falls back to `provider_only`, and explicit request `coordinate_mode` wins over config.

### Location-Aware Availability Read Layer

Phase 2B adds `phase6/location_availability.js` as an opt-in read helper. It does not introduce a new persisted collection. It reads:

- `canonical_products`
- `canonical_product_mappings`
- `source_products`
- latest `raw_price_snapshots`
- `retailer_locations`
- matched-only `retailer_location_geocodes`

Rules:
- By default, only `retailer_location_geocodes.status = "matched"` rows with valid coordinates can contribute to distance results.
- With explicit `coordinate_mode = "reviewed_first"`, an active reviewed coordinate for the retailer location wins before falling back to the matched provider geocode.
- Returned offers include `coordinate_source` as `provider` or `reviewed` for debugging and rollout monitoring.
- Internal rollout diagnostics do not change nearest-availability defaults; Phase 2L config can change the default only when `DEFAULT_COORDINATE_MODE` is explicitly set to `reviewed_first`.
- Missing coordinates return explicit states instead of changing normal product search behavior.
- Radius and limit are bounded to 50 km and 50 rows.
- No external geocoding, maps, routing, LLM, or saved-user-location dependency is introduced.

### Saved User Location Fields

`saved_user_locations`:
- Identity/user: `location_id`, `user_id`
- Label/display: `label`, `display_name`, `address_raw`
- Coordinates: `latitude`, `longitude`
- Search defaults: `default_radius_km`, `default_sort`
- Provenance: `source`, `provider`, `provider_place_id`, `formatted_address`, `confidence`, `confidence_reason`, `provenance`
- Defaults/lifecycle: `is_default`, `created_at`, `updated_at`

Rules:
- Saved locations are explicit user preferences only; do not infer home/work from behavior.
- Allowed labels are `home`, `work`, and `custom`; labels must be unambiguous when resolving by label.
- Radius is bounded to 50 km and sort is restricted to `nearest`, `cheapest`, or `best_value`.
- Phase 2C does not request device GPS, call geocoding APIs, call LLMs, or add maps UI.
- Phase 2D exposes this collection through owner-header-scoped backend endpoints and Flutter API methods. CRUD requires `x-pricer-owner-id`; one-off coordinate availability stays opt-in and does not create saved locations.
- Phase 2E-3 allows confirmed manual-address geocode results to be saved with provider and provenance fields; the raw address remains preserved.

## Client Firestore Schema

Mobile app-owned user state is nested under anonymous local identity:

```text
users/{anon_id}
  lists/{list_id}
    items/{item_id}
  watchlist/{source_product_id}
  billing/profile
```

Owner:
- `app/mobile/lib/core/services/firestore_repositories.dart`
- `app/mobile/lib/core/services/billing_repositories.dart`

### `users/{anon_id}/lists/{list_id}`

Fields:
- `name`
- `created_at`
- `updated_at`
- `item_count`

### `users/{anon_id}/lists/{list_id}/items/{item_id}`

Fields:
- `query_text`
- `matched_product_id`
- `quantity`
- `added_at`

### `users/{anon_id}/watchlist/{source_product_id}`

Fields:
- `display_name`
- `target_price`
- `current_price`
- `added_at`

### `users/{anon_id}/billing/profile`

Fields mirror backend entitlement cache:
- `user_id`
- `tier`
- `premium_active`
- `ads_enabled`
- `alerts_enabled`
- `optimizer_multi_store_enabled`
- `max_optimizer_items`
- `max_watchlist_items`
- `max_target_price_alerts`
- RevenueCat IDs/status/source
- `expires_at`
- `updated_at`

Rules:
- Client billing profile is a cache, not backend premium truth.
- Lists/watchlist are keyed by anonymous local device identity until real auth is introduced.

## Postgres Sidecar Schema

Postgres runs locally from `docker-compose.yml`:

```text
host: localhost
port: 5433
database: pricer_dev
user: pricer
password: pricer_dev_password
```

Migration owner:
- `db/migrations/`
- `functions/src/db/migrations.js`
- `scripts/run_postgres_migrations.js`

Repository owner:
- `functions/src/db/`
- `functions/src/db/usda/`
- mirrored `app/functions/src/db/`

### Sidecar Relationship Overview

```text
source_datasets
  -> source_files
  -> import_batches
       -> usda_import_runs

usda_foods
  -> usda_food_nutrients -> usda_nutrients
  -> usda_food_portions  -> usda_measure_units
  -> usda_food_cluster_candidates
  -> usda_food_cluster_members -> usda_food_clusters
                               -> usda_food_cluster_review_history
                               -> ingredient_nutrition_mappings
                                    -> ingredient_nutrition_mapping_review_history
                                    -> ingredients
                                    -> ingredient_nutrition_profile_candidates
                                         -> ingredient_nutrition_profiles
                                         -> ingredient_nutrition_profile_review_history

ingredients
  -> ingredient_product_mappings
       -> ingredient_product_candidates
  -> ingredient_substitution_groups
  -> recipes
       -> ingredient_gap_candidates
       -> recipe_ingredients
       -> recipe_steps
       -> recipe_nutrition_profile_candidates
            -> recipe_nutrition_profiles
            -> recipe_nutrition_profile_review_history

ingredient_nutrition_profiles
  -> recipe_nutrition_profile_candidates

recipe_ingest_jobs
  -> recipe_ingest_staged_recipes
       -> recipe_ingest_staged_ingredients
       -> recipe_ingest_staged_steps
       -> recipe_ingest_staged_tools
       -> recipe_ingest_staged_methods
       -> recipe_ingest_staged_tags
       -> recipe_ingest_staged_state_changes
       -> recipe_ingest_staged_substitution_hints
       -> recipe_ingest_staged_quality_signals
       -> recipe_promotion_history
            -> recipes
```

`ingredient_nutrition_mappings.ingredient_id` remains a string link for historical DB2.5 compatibility. DB3A adds a Postgres `ingredients` table, and DB4A recipe ingredient lines use a Postgres FK to `ingredients.ingredient_id`.

DB3A adds a Postgres sidecar `ingredients` table as canonical Pricer ingredient truth for future nutrition profiles. It remains sidecar-only and is not read by product, shopping, basket, or mobile runtime paths.

DB3E adds Postgres sidecar `ingredient_product_candidates`, `ingredient_product_mappings`, and `ingredient_substitution_groups`. It stores reviewable ingredient-to-product equivalence suggestions only; no generated mapping is auto-approved and existing approved/rejected decisions are preserved. DB3E uses migration `017_db3e_ingredient_product_equivalence.sql` because migration `016` is already occupied by DB5B.

DB4A adds Postgres sidecar `recipes`, `recipe_ingredients`, and `recipe_steps` tables for fixture-only canonical recipes. They remain sidecar-only and are not read by product, shopping, basket, meal planner, or mobile runtime paths.

DB4B adds Postgres sidecar `recipe_nutrition_profile_candidates` generated from `recipe_ingredients.quantity_grams` and approved `ingredient_nutrition_profiles`. It does not map recipes directly to USDA rows and does not publish runtime nutrition.

DB4C adds Postgres sidecar `recipe_nutrition_profiles` and `recipe_nutrition_profile_review_history` tables. They promote reviewed DB4B candidates into approved recipe profiles without Firestore publishing or runtime read-path changes.

DB4D adds no new tables. It is a read-only reporting layer over `recipes`, `recipe_ingredients`, `recipe_nutrition_profiles`, `ingredient_nutrition_profiles`, `ingredient_product_mappings`, and `ingredient_gap_candidates` so reviewers can see recommendation, nutrition, and product-mapping readiness without mutating canonical recipe state.

UX1 adds Postgres sidecar `user_food_profiles`, `user_food_constraints`, `user_food_preferences`, and `user_equipment` tables for future user-specific food preference and constraint modeling. These rows are domain-only and are not yet used by runtime recommendation, planner, swipe, product, or recipe read paths.

UX2 adds Postgres sidecar `recipe_feedback_events` and `recipe_feedback_note_signals` as append-only explicit behavior history. PROF1 adds append-only `user_taste_profile_snapshots` and `user_taste_profile_signal_sources` built deterministically from UX1 plus UX2 plus promoted recipe metadata. None of these rows change runtime recommendation, planner, or UI behavior yet.

PLAN1 adds Postgres sidecar `meal_plans` and `meal_plan_items`. These rows are explicit planner output only. They do not mutate canonical recipes, alter runtime recommendation behavior, or trigger basket optimization.

PLAN2A adds Postgres sidecar `meal_plan_requirements` and `meal_plan_requirement_items`. These rows aggregate canonical recipe ingredient demand from one stored meal plan, preserve missing-ingredient and missing-grams signals, and prepare later product-mapping work without calling the runtime basket stack yet.

PLAN2A.1 adds Postgres sidecar `meal_plan_net_requirements` and `meal_plan_net_requirement_items`. These rows derive net shopping demand by subtracting active inventory grams from PLAN2A requirement items, but they do not mutate either the original requirement bundle or the source inventory.

PLAN2B adds Postgres sidecar `meal_plan_product_candidate_sets` and `meal_plan_product_candidates`. These rows translate PLAN2A.1 net requirement demand into runtime-compatible canonical product candidate options by reading approved DB3E `ingredient_product_mappings` plus the existing runtime `canonical_products`, `canonical_product_mappings`, `source_products`, and `raw_price_snapshots` read models. PLAN2B remains adapter-only and does not call the basket optimizer.

PLAN2C adds Postgres sidecar `meal_plan_optimized_baskets` and `meal_plan_optimized_basket_items`. These rows adapt PLAN2B candidate rows into a synthetic Phase 16 basket-plan plus synthetic price-lookup contract, reuse the existing single-store and multi-store optimizer functions, and store explicit selected, covered, missing, and optimizer-excluded outputs without mutating runtime basket state.

INVENTORY1 adds Postgres sidecar `user_inventories` and `inventory_items`. These rows track current pantry/fridge/freezer stock by canonical ingredient when possible and fall back to product identity or name snapshots otherwise. They stay sidecar-only and do not yet alter planner, shopping, basket, or runtime recommendation behavior.

DB5A adds Postgres sidecar `recipe_ingest_*` staging tables for raw-preserving rich recipe ingest. DB5B adds bounded LLM extraction into those staging tables only. They do not write canonical recipes, create ingredients, or publish runtime read models.

#### `ingredients`

| Column | Type | Notes |
| --- | --- | --- |
| `ingredient_id` | text | Primary key. Stable Pricer ingredient id, not a USDA FDC id. |
| `ingredient_key` | text | Unique deterministic key. |
| `name_en` | text | Required English name. |
| `name_bg` | text | Bulgarian name when known. |
| `canonical_name` | text | Canonical display/source name. |
| `normalized_name` | text | Search-normalized name. |
| `ingredient_type` | text | Ingredient concept type. |
| `food_family` | text | Broad family, such as fruit or grain. |
| `default_unit` | text | Default recipe/nutrition unit. |
| `shopping_unit` | text | Default shopping unit. |
| `density_g_per_ml` | numeric | Optional liquid density. |
| `grams_per_piece` | numeric | Optional piece weight. |
| `edible_portion_factor` | numeric | Optional edible yield, 0 through 1. |
| `aliases_json` | jsonb | Localized aliases; commonly `en`, `bg`, and normalized `all`. |
| `tags_json` | jsonb | Deterministic tags. |
| `state_defaults_json` | jsonb | Default raw/cooked/canned state hints. |
| `allergen_flags_json` | jsonb | Allergen flags. |
| `dietary_flags_json` | jsonb | Dietary flags. |
| `review_status` | text | `draft`, `active`, `rejected`, or `needs_review`. |
| `source` | text | Seed/source provenance. |
| `generation_method` | text | Deterministic generation method. |
| `rules_version` | text | Rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `meal_plan_net_requirements`

| Column | Type | Notes |
| --- | --- | --- |
| `net_requirement_id` | text | Primary key. Stable id derived from deterministic `net_requirement_key`. |
| `requirement_id` | text | FK to `meal_plan_requirements.requirement_id`. |
| `plan_id` | text | FK to `meal_plans.plan_id`. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `user_id` | text | External/app user identifier snapshot from the source requirement bundle. |
| `net_requirement_key` | text | Unique deterministic key from `requirement_id + rules_version`. |
| `generation_method` | text | Deterministic PLAN2A.1 builder method identifier. |
| `rules_version` | text | PLAN2A.1 builder rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `meal_plan_net_requirement_items`

| Column | Type | Notes |
| --- | --- | --- |
| `net_requirement_item_id` | text | Primary key. Stable item id derived from `net_requirement_id + requirement_item_id`. |
| `net_requirement_id` | text | FK to `meal_plan_net_requirements.net_requirement_id`. |
| `requirement_item_id` | text | Stable snapshot pointer back to the source PLAN2A requirement item. This is intentionally not a live FK so derived rows can remain rebuildable without mutating PLAN2A source rows. |
| `ingredient_id` | text | Nullable FK to canonical `ingredients.ingredient_id`. |
| `ingredient_key_snapshot` | text | Snapshot key used for inventory fallback matching when canonical ingredient links are missing. |
| `display_name` | text | Human-readable ingredient label carried forward from PLAN2A. |
| `required_quantity_grams` | numeric | Gross requirement grams from PLAN2A when available. |
| `inventory_applied_grams` | numeric | Non-negative grams covered by currently active inventory items. |
| `net_quantity_grams` | numeric | Remaining grams after subtraction; zero when fully covered, null when the source requirement had no grams. |
| `inventory_item_ids_json` | jsonb | Sorted inventory item ids used for the subtraction evidence. |
| `source_recipe_ids_json` | jsonb | Sorted source recipe ids preserved from PLAN2A. |
| `source_recipe_ingredient_ids_json` | jsonb | Sorted source recipe-ingredient ids preserved from PLAN2A. |
| `shopping_unit` | text | Preferred shopping unit preserved from PLAN2A / canonical ingredient metadata. |
| `estimated_shopping_quantity` | numeric | Recomputed conservative shopping quantity from net grams. |
| `estimated_shopping_unit` | text | Derived unit such as `kg`, `g`, or `piece`. |
| `inventory_status` | text | `no_inventory`, `partially_covered`, `fully_covered`, `missing_ingredient`, `missing_quantity`, or `needs_review`. |
| `adapter_status` | text | `ready_for_product_mapping`, `covered_by_inventory`, `missing_ingredient`, `missing_quantity`, or `needs_review`. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `meal_plan_product_candidate_sets`

| Column | Type | Notes |
| --- | --- | --- |
| `candidate_set_id` | text | Primary key. Deterministic from `net_requirement_id + rules_version`. |
| `net_requirement_id` | text | FK to `meal_plan_net_requirements.net_requirement_id`. |
| `plan_id` | text | FK to `meal_plans.plan_id`. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `user_id` | text | External user identifier snapshot. |
| `candidate_set_key` | text | Unique deterministic upsert key for one PLAN2B adapter bundle. |
| `generation_method` | text | Deterministic PLAN2B builder method identifier. |
| `rules_version` | text | PLAN2B rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `meal_plan_product_candidates`

| Column | Type | Notes |
| --- | --- | --- |
| `candidate_id` | text | Primary key. Deterministic from candidate set, net requirement item, and product identity or marker status. |
| `candidate_set_id` | text | FK to `meal_plan_product_candidate_sets.candidate_set_id`. |
| `net_requirement_item_id` | text | FK to `meal_plan_net_requirement_items.net_requirement_item_id`. |
| `ingredient_id` | text | Nullable FK to `ingredients.ingredient_id`. Null when the source net requirement item was unmatched. |
| `ingredient_key_snapshot` | text | Ingredient key snapshot preserved from PLAN2A / PLAN2A.1. |
| `display_name` | text | Human-readable label carried forward from PLAN2A / PLAN2A.1. |
| `product_id` | text | Runtime-compatible canonical product id when resolved, otherwise nullable marker row. |
| `product_name_snapshot` | text | Product display name snapshot from runtime canonical product truth or DB3E candidate metadata. |
| `brand` | text | Optional brand snapshot. |
| `chain_id` | text | Optional best-price chain id from runtime price lookup. |
| `store_id` | text | Optional best-price store id from runtime price lookup. |
| `price_id` | text | Optional runtime price-record source id, currently snapshot/source-product provenance. |
| `product_size_quantity` | numeric | Package size quantity from runtime canonical product size or DB3E fallback metadata. |
| `product_size_unit` | text | Package size unit from runtime canonical product size or DB3E fallback metadata. |
| `product_size_grams` | numeric | Deterministically normalized gram equivalent when known. |
| `required_quantity_grams` | numeric | Net grams still required after inventory subtraction. |
| `units_needed` | integer | Rounded-up package count needed for one candidate when size is known. |
| `total_purchased_grams` | numeric | Gross grams bought when selecting this candidate package count. |
| `overage_grams` | numeric | Deterministic overbuy amount from package sizing. |
| `unit_price` | numeric | Best current unit/package price from runtime price lookup when available. |
| `total_estimated_price` | numeric | `units_needed * unit_price` when both are known. |
| `currency` | text | Runtime currency, currently `EUR`. |
| `mapping_id` | text | Nullable DB3E `ingredient_product_mappings.mapping_id` provenance. |
| `mapping_confidence` | numeric | Approved DB3E mapping confidence snapshot. |
| `candidate_confidence` | numeric | Deterministic PLAN2B candidate confidence after identity/size/price checks. |
| `candidate_status` | text | `ready_for_optimizer`, `missing_product_mapping`, `missing_product_size`, `missing_price`, `covered_by_inventory`, or `needs_review`. |
| `selection_reason_json` | jsonb | Deterministic provenance payload including mapping/product identity, size source, price state, and source recipe evidence. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `meal_plan_optimized_baskets`

| Column | Type | Notes |
| --- | --- | --- |
| `optimized_basket_id` | text | Primary key. Deterministic from `optimizer_run_key`. |
| `candidate_set_id` | text | FK to `meal_plan_product_candidate_sets.candidate_set_id`. |
| `net_requirement_id` | text | FK to `meal_plan_net_requirements.net_requirement_id`. |
| `plan_id` | text | FK to `meal_plans.plan_id`. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `user_id` | text | External user identifier snapshot from the source candidate-set bundle. |
| `optimizer_run_key` | text | Unique deterministic key from `candidate_set_id + optimizer_version + rules_version`. |
| `optimizer_version` | text | Underlying optimizer contract version, currently the reused Phase 16 optimizer lineage. |
| `total_estimated_price` | numeric | Final selected basket total from the reused optimizer output. |
| `currency` | text | Optimizer currency, currently `EUR`. |
| `selected_chain_id` | text | Selected chain id when the reused optimizer recommends a single-store option; null for multi-store baskets. |
| `selected_store_id` | text | Selected store id when the reused optimizer recommends a single-store option with a concrete store; null otherwise. |
| `item_count` | integer | Total persisted output items, including selected rows plus covered or missing markers. |
| `covered_requirement_count` | integer | Count of requirements satisfied either by selected products or existing inventory. |
| `missing_requirement_count` | integer | Count of requirements still missing products, prices, or reviewable completeness. |
| `optimizer_summary_json` | jsonb | Deterministic provenance payload containing the synthetic basket-plan summary, synthetic price-lookup summary, selected strategy, raw reused optimizer outputs, and final status counts. |
| `generation_method` | text | Deterministic PLAN2C adapter method identifier. |
| `rules_version` | text | PLAN2C rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `meal_plan_optimized_basket_items`

| Column | Type | Notes |
| --- | --- | --- |
| `optimized_basket_item_id` | text | Primary key. Deterministic from optimized basket, net requirement item, and final item status. |
| `optimized_basket_id` | text | FK to `meal_plan_optimized_baskets.optimized_basket_id`. |
| `candidate_id` | text | Nullable PLAN2B candidate provenance. Present for selected rows and preserved marker rows when a representative candidate exists. |
| `net_requirement_item_id` | text | FK to `meal_plan_net_requirement_items.net_requirement_item_id`. |
| `ingredient_id` | text | Nullable FK to canonical `ingredients.ingredient_id`. |
| `ingredient_key_snapshot` | text | Ingredient key snapshot preserved from PLAN2A / PLAN2A.1 / PLAN2B. |
| `display_name` | text | Human-readable requirement label. |
| `product_id` | text | Runtime canonical product id for selected rows, nullable for inventory or missing-product markers. |
| `product_name_snapshot` | text | Product display name snapshot when available. |
| `brand` | text | Optional product brand snapshot. |
| `chain_id` | text | Selected chain id for priced rows. |
| `store_id` | text | Selected store id for priced rows. |
| `price_id` | text | Selected runtime price-record source id for priced rows. |
| `units_selected` | integer | Selected package count for priced rows. |
| `total_purchased_grams` | numeric | Selected purchased grams when known. |
| `required_quantity_grams` | numeric | Original net grams still required for the requirement item. |
| `overage_grams` | numeric | Deterministic package overbuy amount for priced rows when known. |
| `unit_price` | numeric | Selected per-package price for priced rows. |
| `total_price` | numeric | Final selected line total for priced rows. |
| `currency` | text | Runtime currency, currently `EUR`. |
| `selection_reason_json` | jsonb | Deterministic provenance payload combining reused optimizer reasoning with source candidate status and evidence. |
| `item_status` | text | `selected`, `covered_by_inventory`, `missing_product`, `missing_price`, `optimizer_excluded`, or `needs_review`. |
| `created_at` | timestamptz | Defaults to `now()`. |

#### `meal_plan_shopping_runs`

| Column | Type | Notes |
| --- | --- | --- |
| `run_id` | text | Primary key. Deterministic from `run_key`. |
| `user_id` | text | External user identifier for the shopping-run owner. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `plan_id` | text | Nullable FK to `meal_plans.plan_id`. |
| `plan_key` | text | Nullable plan key snapshot. Used for deterministic orchestration identity. |
| `requirement_id` | text | Nullable FK to `meal_plan_requirements.requirement_id`. |
| `net_requirement_id` | text | Nullable FK to `meal_plan_net_requirements.net_requirement_id`. |
| `candidate_set_id` | text | Nullable FK to `meal_plan_product_candidate_sets.candidate_set_id`. |
| `optimized_basket_id` | text | Nullable FK to `meal_plan_optimized_baskets.optimized_basket_id`. |
| `run_key` | text | Unique deterministic key from `user_id + plan_key + rules_version`. |
| `run_status` | text | `started`, `completed`, `partial`, or `failed`. |
| `summary_json` | jsonb | Deterministic run summary with totals, coverage, status counts, and step-level errors. |
| `generation_method` | text | Deterministic PLAN2D orchestration method identifier. |
| `rules_version` | text | PLAN2D rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `ingredient_product_candidates`

| Column | Type | Notes |
| --- | --- | --- |
| `candidate_id` | text | Primary key. Stable candidate id derived from product id. |
| `product_id` | text | Unique product identifier from existing or future product ingestion. No FK yet because the product Postgres layer is future work. |
| `product_name` | text | Product display/source name used for matching evidence. |
| `normalized_product_name` | text | Search-normalized product name. |
| `brand` | text | Optional brand. |
| `size` | numeric | Optional parsed size. |
| `unit` | text | Optional parsed unit. |
| `parsed_attributes_json` | jsonb | Deterministic attributes such as category hints, type, or fat percent. |
| `proposed_ingredient_key` | text | Deterministic ingredient-key hint when available. |
| `match_confidence` | numeric | Candidate confidence from deterministic parsing. |
| `generation_method` | text | Deterministic generation method. |
| `review_status` | text | `suggested`, `approved`, `rejected`, or `needs_review`; reviewed statuses are preserved on regeneration. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `ingredient_product_mappings`

| Column | Type | Notes |
| --- | --- | --- |
| `mapping_id` | text | Primary key. Stable id derived from ingredient id and product id. |
| `ingredient_id` | text | FK to DB3A `ingredients.ingredient_id`. |
| `product_id` | text | Product id from candidate/product source. |
| `mapping_type` | text | `exact_match`, `close_match`, `substitute`, or `rejected`. |
| `confidence` | numeric | Deterministic match confidence, 0 through 1. |
| `review_status` | text | `suggested`, `approved`, `rejected`, or `needs_review`; approved/rejected mappings are not overwritten by later suggestions. |
| `reviewed_by` | text | Optional reviewer name. |
| `reviewed_at` | timestamptz | Optional review timestamp. |
| `review_reason` | text | Optional review rationale. |
| `generation_method` | text | Deterministic generation method. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `ingredient_substitution_groups`

| Column | Type | Notes |
| --- | --- | --- |
| `substitution_group_id` | text | Primary key. |
| `ingredient_id` | text | FK to DB3A `ingredients.ingredient_id`. |
| `substitution_type` | text | Substitution family or context. |
| `constraints_json` | jsonb | Reviewable substitution constraints. |
| `priority_rank` | integer | Lower values rank first. |
| `created_at` | timestamptz | Defaults to `now()`. |

#### `recipes`

| Column | Type | Notes |
| --- | --- | --- |
| `recipe_id` | text | Primary key. Stable Pricer recipe id. |
| `recipe_key` | text | Unique deterministic recipe key. |
| `title_en` | text | Required English title. |
| `title_bg` | text | Bulgarian title when known. |
| `canonical_title` | text | Canonical display/source title. |
| `normalized_title` | text | Search-normalized title. |
| `description` | text | Optional seed description. |
| `cuisine_tags_json` | jsonb | Cuisine tags. |
| `dietary_tags_json` | jsonb | Dietary tags. |
| `meal_type_tags_json` | jsonb | Meal type tags. |
| `servings` | numeric | Required positive serving count. |
| `yield_quantity` | numeric | Optional positive yield quantity. |
| `yield_unit` | text | Optional yield unit. |
| `source` | text | Seed/source provenance. |
| `review_status` | text | `draft`, `active`, `rejected`, or `needs_review`. |
| `generation_method` | text | Deterministic generation method. |
| `rules_version` | text | Rules version. |
| `usability_status` | text | DB5C usability gate: `draft`, `dormant`, `needs_ingredient_mapping`, `needs_nutrition`, `usable`, or `meal_plan_ready`. |
| `ingredient_match_rate` | numeric | DB5C matched-ingredient coverage from 0 to 1. |
| `nutrition_coverage_rate` | numeric | DB5C approved-nutrition coverage from 0 to 1. |
| `product_coverage_rate` | numeric | DB5C approved-product-equivalence coverage from 0 to 1. |
| `last_quality_computed_at` | timestamptz | Last DB5C metrics refresh time. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

DB5C uses `usability_status` as the downstream readiness gate. Canonical recipe rows may exist while still being `dormant`, `needs_ingredient_mapping`, or `needs_nutrition`.

#### `recipe_ingredients`

| Column | Type | Notes |
| --- | --- | --- |
| `recipe_ingredient_id` | text | Primary key. Stable recipe-line id. |
| `recipe_id` | text | FK to `recipes.recipe_id`. |
| `ingredient_id` | text | Nullable FK to DB3A `ingredients.ingredient_id`; not a USDA FDC id. DB5C may keep unmatched lines null. |
| `matched_ingredient_id` | text | Nullable DB5C match snapshot to DB3A `ingredients.ingredient_id`. |
| `ingredient_key_snapshot` | text | Ingredient key snapshot at seed/review time. |
| `display_name` | text | Recipe-line display name. |
| `quantity` | numeric | Source quantity when known. |
| `unit` | text | Source unit when known. |
| `quantity_grams` | numeric | Deterministic gram amount when known. |
| `preparation_note` | text | Optional prep note. |
| `optional` | boolean | Optional ingredient marker. |
| `sort_order` | integer | Line order within the recipe. |
| `match_method` | text | Link method, currently `existing_ingredient_key` for fixtures. |
| `match_confidence` | numeric | 0 through 1 confidence snapshot. |
| `review_status` | text | `draft`, `active`, `rejected`, or `needs_review`. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `recipe_steps`

| Column | Type | Notes |
| --- | --- | --- |
| `recipe_step_id` | text | Primary key. Stable recipe-step id. |
| `recipe_id` | text | FK to `recipes.recipe_id`. |
| `step_number` | integer | Ordered step number. |
| `instruction` | text | Step instruction. |
| `duration_minutes` | numeric | Optional duration. |
| `temperature_c` | numeric | Optional temperature. |
| `equipment_tags_json` | jsonb | Optional equipment tags. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `recipe_nutrition_profile_candidates`

| Column | Type | Notes |
| --- | --- | --- |
| `recipe_profile_candidate_id` | text | Primary key. Stable candidate id derived from `recipe_id`. |
| `recipe_id` | text | FK to `recipes.recipe_id`; unique one candidate per recipe. |
| `total_kcal` | numeric | Total recipe energy from valid ingredient gram quantities. |
| `total_protein_g` | numeric | Total recipe protein. |
| `total_fat_g` | numeric | Total recipe fat. |
| `total_carbs_g` | numeric | Total recipe carbohydrates. |
| `total_fiber_g` | numeric | Total recipe fiber. |
| `total_sugar_g` | numeric | Total recipe sugar. |
| `total_sodium_mg` | numeric | Total recipe sodium. |
| `per_serving_kcal` | numeric | Energy divided by recipe servings. |
| `per_serving_protein_g` | numeric | Protein divided by recipe servings. |
| `per_serving_fat_g` | numeric | Fat divided by recipe servings. |
| `per_serving_carbs_g` | numeric | Carbohydrates divided by recipe servings. |
| `per_serving_fiber_g` | numeric | Fiber divided by recipe servings. |
| `per_serving_sugar_g` | numeric | Sugar divided by recipe servings. |
| `per_serving_sodium_mg` | numeric | Sodium divided by recipe servings. |
| `servings` | numeric | Recipe servings snapshot; defaults to `1` when source servings are absent. |
| `ingredient_count` | integer | Count of recipe ingredient rows considered. |
| `ingredients_with_nutrition` | integer | Count with positive `quantity_grams` and an approved ingredient profile. |
| `ingredients_missing_nutrition` | integer | Count missing grams or approved ingredient nutrition. |
| `missing_ingredient_ids_json` | jsonb | Ingredient ids missing nutrition input. |
| `source_profile_ids_json` | jsonb | Approved ingredient nutrition profile ids used. |
| `confidence` | text | `high`, `medium`, or `low` based on nutrition coverage. |
| `review_status` | text | `candidate`, `approved`, `rejected`, or `needs_review`. Preserved on regeneration. |
| `generation_method` | text | Deterministic generation method. |
| `rules_version` | text | Rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `recipe_nutrition_profiles`

| Column | Type | Notes |
| --- | --- | --- |
| `recipe_profile_id` | text | Primary key. Approved/supersedable profile id. |
| `recipe_id` | text | FK to `recipes.recipe_id`. |
| `total_kcal` | numeric | Approved total recipe energy. |
| `total_protein_g` | numeric | Approved total protein. |
| `total_fat_g` | numeric | Approved total fat. |
| `total_carbs_g` | numeric | Approved total carbohydrates. |
| `total_fiber_g` | numeric | Approved total fiber. |
| `total_sugar_g` | numeric | Approved total sugar. |
| `total_sodium_mg` | numeric | Approved total sodium. |
| `per_serving_kcal` | numeric | Approved per-serving energy. |
| `per_serving_protein_g` | numeric | Approved per-serving protein. |
| `per_serving_fat_g` | numeric | Approved per-serving fat. |
| `per_serving_carbs_g` | numeric | Approved per-serving carbohydrates. |
| `per_serving_fiber_g` | numeric | Approved per-serving fiber. |
| `per_serving_sugar_g` | numeric | Approved per-serving sugar. |
| `per_serving_sodium_mg` | numeric | Approved per-serving sodium. |
| `servings` | numeric | Servings snapshot from candidate. |
| `ingredient_count` | integer | Candidate ingredient count snapshot. |
| `ingredients_with_nutrition` | integer | Candidate coverage snapshot. |
| `ingredients_missing_nutrition` | integer | Candidate missing input count snapshot. |
| `missing_ingredient_ids_json` | jsonb | Missing ingredient ids from candidate. |
| `source_profile_ids_json` | jsonb | Approved ingredient nutrition profile ids used by DB4B. |
| `source_recipe_profile_candidate_id` | text | FK to `recipe_nutrition_profile_candidates`; unique to prevent reapproval from the same candidate. |
| `confidence` | text | Candidate confidence snapshot. |
| `review_status` | text | `approved`, `rejected`, `needs_review`, or `superseded`. |
| `reviewed_by` | text | Reviewer. |
| `reviewed_at` | timestamptz | Review time. |
| `review_decision` | text | Decision snapshot. |
| `review_reason` | text | Review reason. |
| `generation_method` | text | Candidate generation method. |
| `rules_version` | text | Candidate rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

Only one `approved` recipe nutrition profile may exist for a `recipe_id`. Approving a replacement candidate supersedes the previous approved profile before inserting the replacement profile.

#### `recipe_nutrition_profile_review_history`

| Column | Type | Notes |
| --- | --- | --- |
| `review_event_id` | text | Primary key. |
| `source_recipe_profile_candidate_id` | text | Candidate reviewed. |
| `recipe_profile_id` | text | Profile created by the review when applicable. |
| `superseded_recipe_profile_id` | text | Previous approved profile superseded when applicable. |
| `recipe_id` | text | Recipe snapshot. |
| `previous_candidate_review_status` | text | Candidate status before decision. |
| `previous_profile_review_status` | text | Profile status snapshot when applicable. |
| `review_decision` | text | `approved`, `rejected`, `needs_review`, or `superseded`. |
| `reviewed_by` | text | Reviewer. |
| `reviewed_at` | timestamptz | Review time. |
| `review_reason` | text | Reason. |
| `review_note` | text | Optional note. |
| `created_at` | timestamptz | Defaults to `now()`. |

#### `recipe_ingest_jobs`

| Column | Type | Notes |
| --- | --- | --- |
| `job_id` | text | Primary key. |
| `source_type` | text | Source type, such as fixture, url, text, or future import source. |
| `source_name` | text | Source label. |
| `source_url` | text | Optional source URL. |
| `raw_text` | text | Preserved raw recipe text. |
| `raw_json` | jsonb | Preserved raw/source payload. |
| `language` | text | Source language hint. |
| `status` | text | `pending`, `extracting`, `staged`, `needs_review`, `completed`, `failed`, or `cancelled`. |
| `generation_method` | text | Deterministic staging method. |
| `rules_version` | text | Staging rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

DB5B records extraction status, prompt version, model name, raw LLM response, and failure details under `raw_json.db5b`. Raw source text remains in `raw_text`.

#### `recipe_ingest_staged_recipes`

| Column | Type | Notes |
| --- | --- | --- |
| `staged_recipe_id` | text | Primary key. |
| `job_id` | text | FK to `recipe_ingest_jobs`. |
| `proposed_recipe_key` | text | Proposed deterministic canonical key, not promoted in DB5A. |
| `title_original` | text | Source title. |
| `title_en` | text | English staged title. |
| `title_bg` | text | Bulgarian staged title when known. |
| `description` | text | Staged description. |
| `servings` | numeric | Parsed servings. |
| `yield_quantity` | numeric | Parsed yield amount. |
| `yield_unit` | text | Parsed yield unit. |
| `cuisine_tags_json` | jsonb | Cuisine tags. |
| `region_tags_json` | jsonb | Region tags. |
| `dietary_tags_json` | jsonb | Dietary tags. |
| `meal_type_tags_json` | jsonb | Meal type tags. |
| `feeling_tags_json` | jsonb | Feeling/use-context tags. |
| `flavor_profile_json` | jsonb | Flavor profile payload. |
| `texture_profile_json` | jsonb | Texture profile payload. |
| `difficulty_level` | text | Staged difficulty. |
| `budget_level` | text | Staged budget level. |
| `prep_time_minutes` | numeric | Parsed prep time. |
| `cook_time_minutes` | numeric | Parsed cook time. |
| `rest_time_minutes` | numeric | Parsed rest time. |
| `total_time_minutes` | numeric | Parsed total time. |
| `review_status` | text | `staged`, `needs_review`, `approved`, `rejected`, or `promoted`. |
| `confidence` | numeric | 0 through 1 extraction confidence. |
| `extraction_json` | jsonb | Extraction provenance/evidence. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

DB5B stores parsed strict-JSON extraction output and ingredient-match provenance under `extraction_json.db5b`. DB5C may later promote these rows into canonical recipes, but the staged bundle remains preserved review evidence.

#### DB5A Staged Child Tables

All DB5A child tables reference `recipe_ingest_staged_recipes.staged_recipe_id` and remain staging-only.

| Table | Primary ID | Key fields |
| --- | --- | --- |
| `recipe_ingest_staged_ingredients` | `staged_recipe_ingredient_id` | `raw_line`, original/EN/BG ingredient names, `proposed_ingredient_key`, nullable `matched_ingredient_id`, quantity/unit/grams, prep note, optional flag, sort order, match confidence, review status, extraction JSON. |
| `recipe_ingest_staged_steps` | `staged_recipe_step_id` | Step number, original/EN/BG instruction, optional duration/temperature, state-change summary, extraction JSON. |
| `recipe_ingest_staged_tools` | `staged_recipe_tool_id` | Tool key, EN/BG names, confidence, evidence text, extraction JSON. |
| `recipe_ingest_staged_methods` | `staged_recipe_method_id` | Method key, EN/BG names, confidence, evidence text, extraction JSON. |
| `recipe_ingest_staged_tags` | `staged_recipe_tag_id` | Tag type, tag key, tag value, confidence, evidence text, extraction JSON. |
| `recipe_ingest_staged_state_changes` | `staged_recipe_state_change_id` | State-change key, ingredient name, from/to state, confidence, evidence text, extraction JSON. |
| `recipe_ingest_staged_substitution_hints` | `staged_recipe_substitution_hint_id` | Substitution key, original ingredient, substitute ingredient, reason, confidence, evidence text, extraction JSON. |
| `recipe_ingest_staged_quality_signals` | `staged_recipe_quality_signal_id` | Signal key/name/value, severity, confidence, evidence text, extraction JSON. |

#### `ingredient_gap_candidates`

| Column | Type | Notes |
| --- | --- | --- |
| `gap_id` | text | Primary key. Stable DB5C gap id for a recipe plus normalized unmatched ingredient name. |
| `source_type` | text | Currently `recipe`. |
| `recipe_id` | text | FK to `recipes.recipe_id`. |
| `raw_name` | text | Original unmatched ingredient display name from staging. |
| `normalized_name` | text | Deterministic normalized gap name. Unique per `recipe_id` and `source_type`. |
| `proposed_ingredient_key` | text | Staged ingredient-key hint when available. |
| `occurrences` | integer | Aggregated DB5C promotion occurrence count for the same recipe/name gap. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `recipe_promotion_history`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text | Primary key. Deterministic DB5C review-history id scoped to staged recipe plus ordinal. |
| `staged_recipe_id` | text | FK to `recipe_ingest_staged_recipes.staged_recipe_id`. |
| `recipe_id` | text | Nullable FK to `recipes.recipe_id`; null for rejected or needs-review outcomes that did not promote. |
| `decision` | text | `approved`, `rejected`, or `needs_review`. |
| `reason` | text | Review/promotion reason. |
| `metrics_json` | jsonb | Snapshot of DB5C promotion metrics such as total ingredients, match counts, and coverage rates. |
| `created_at` | timestamptz | Defaults to `now()`. |

#### `meal_plans`

| Column | Type | Notes |
| --- | --- | --- |
| `plan_id` | text | Primary key. Stable sidecar meal-plan id derived from deterministic `plan_key`. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `user_id` | text | External/app user identifier snapshot. |
| `plan_key` | text | Unique deterministic key from `profile_id + start_date + rules_version`. |
| `start_date` | date | Inclusive first day of the weekly plan. |
| `days` | integer | Positive plan length in days. |
| `meals_per_day` | integer | Positive bounded meal-slot count, max 4. |
| `target_calories_per_day` | numeric | Daily calorie target snapshot from UX1. |
| `target_protein_g` | numeric | Daily protein target snapshot from UX1. |
| `target_carbs_g` | numeric | Daily carb target snapshot from UX1. |
| `target_fat_g` | numeric | Daily fat target snapshot from UX1. |
| `generation_method` | text | Deterministic planner method identifier. |
| `rules_version` | text | Planner rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |

#### `meal_plan_items`

| Column | Type | Notes |
| --- | --- | --- |
| `item_id` | text | Primary key. Deterministic per plan/day/meal-slot id. |
| `plan_id` | text | FK to `meal_plans.plan_id`. |
| `day_index` | integer | Zero-based day offset within the plan. |
| `meal_type` | text | `breakfast`, `lunch`, `dinner`, or `snack`. |
| `recipe_id` | text | FK to canonical `recipes.recipe_id`. |
| `recipe_key_snapshot` | text | Canonical recipe-key snapshot at selection time. |
| `calories` | numeric | Per-serving calorie snapshot from approved recipe nutrition. |
| `protein_g` | numeric | Per-serving protein snapshot. |
| `carbs_g` | numeric | Per-serving carb snapshot. |
| `fat_g` | numeric | Per-serving fat snapshot. |
| `selection_score` | numeric | Final deterministic PLAN1 score used for ranking. |
| `selection_reason_json` | jsonb | Auditable score components, matched taste signals, and target snapshots. |
| `created_at` | timestamptz | Defaults to `now()`. |

#### `meal_plan_requirements`

| Column | Type | Notes |
| --- | --- | --- |
| `requirement_id` | text | Primary key. Stable sidecar requirement id derived from deterministic `requirement_key`. |
| `plan_id` | text | FK to `meal_plans.plan_id`. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `user_id` | text | External/app user identifier snapshot from the source meal plan. |
| `requirement_key` | text | Unique deterministic key from `plan_id + rules_version`. |
| `generation_method` | text | Deterministic PLAN2A builder method identifier. |
| `rules_version` | text | PLAN2A builder rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `meal_plan_requirement_items`

| Column | Type | Notes |
| --- | --- | --- |
| `requirement_item_id` | text | Primary key. Stable item id derived from requirement id plus aggregate key. |
| `requirement_id` | text | FK to `meal_plan_requirements.requirement_id`. |
| `ingredient_id` | text | Nullable FK to canonical `ingredients.ingredient_id`. Null means the recipe line is still missing canonical ingredient mapping. |
| `ingredient_key_snapshot` | text | Snapshot of the canonical ingredient key or staged proposed key used for aggregation. |
| `display_name` | text | Human-readable ingredient line label preserved from canonical recipe input. |
| `total_quantity_grams` | numeric | Summed grams across all contributing recipe lines when grams are known. |
| `recipe_count` | integer | Number of meal-plan recipe occurrences contributing to this aggregate item. |
| `source_recipe_ids_json` | jsonb | Sorted contributing canonical `recipe_id` values. |
| `source_recipe_ingredient_ids_json` | jsonb | Sorted contributing canonical `recipe_ingredient_id` values. |
| `shopping_unit` | text | Canonical ingredient shopping unit when a canonical ingredient exists. |
| `estimated_shopping_quantity` | numeric | Conservative derived shopping quantity in the best available shopping unit. |
| `estimated_shopping_unit` | text | Derived shopping unit such as `kg`, `g`, or `piece`. |
| `has_canonical_ingredient` | boolean | True when the aggregate row is linked to a canonical ingredient id. |
| `has_quantity_grams` | boolean | True only when every contributing source line has known grams. |
| `adapter_status` | text | `ready_for_product_mapping`, `missing_ingredient`, `missing_quantity`, or `needs_review`. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `user_inventories`

| Column | Type | Notes |
| --- | --- | --- |
| `inventory_id` | text | Primary key. Stable sidecar inventory id derived from the owning `user_id`. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. Unique so one sidecar inventory maps to one UX1 profile. |
| `user_id` | text | External/app user identifier. Unique. |
| `inventory_key` | text | Unique deterministic inventory key derived from the owning `user_id`. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `inventory_items`

| Column | Type | Notes |
| --- | --- | --- |
| `inventory_item_id` | text | Primary key. Stable item id derived from inventory id plus logical identity and storage context. |
| `inventory_id` | text | FK to `user_inventories.inventory_id`. |
| `ingredient_id` | text | Nullable FK to canonical `ingredients.ingredient_id`. Preferred identity when canonical ingredient mapping exists. |
| `ingredient_key_snapshot` | text | Snapshot of the canonical ingredient key or normalized fallback key at write time. |
| `product_id` | text | Nullable string product id snapshot for product-level fallback tracking. |
| `product_name_snapshot` | text | Nullable product-name snapshot when no canonical ingredient link exists yet. |
| `quantity_grams` | numeric | Nullable non-negative gram quantity for mass-based tracking. |
| `quantity_units` | numeric | Nullable non-negative count or package quantity for unit-based tracking. |
| `unit` | text | Unit label such as `g`, `kg`, `piece`, or `bottle`. |
| `estimated_remaining_ratio` | numeric | Bounded `0..1` remaining-stock estimate. Zeroed rows preserve history without hard deletion. |
| `storage_type` | text | `pantry`, `fridge`, or `freezer`. |
| `perishability_class` | text | `short`, `medium`, or `long`. |
| `estimated_expiry_date` | date | Nullable conservative expiry estimate. INVENTORY1 derives this from ingredient shelf-life hints when available. |
| `last_updated_source` | text | `manual`, `receipt`, or `system`. Receipt scanning is reserved for later; INVENTORY1 uses manual/system only. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `user_food_profiles`

| Column | Type | Notes |
| --- | --- | --- |
| `profile_id` | text | Primary key. Deterministic UX1 profile id derived from `user_id`. |
| `user_id` | text | External/app user identifier. Unique. |
| `household_size` | integer | Optional positive household size. |
| `default_servings` | integer | Optional positive default serving count. |
| `weekly_budget_amount` | numeric | Optional non-negative weekly meal budget. |
| `weekly_budget_currency` | text | Optional budget currency, typically `EUR`. |
| `preferred_language` | text | Optional language preference such as `en` or `bg`. |
| `cooking_skill_level` | text | Optional free-text skill label. |
| `max_prep_time_minutes` | integer | Optional non-negative prep-time cap. |
| `max_total_time_minutes` | integer | Optional non-negative total-time cap. |
| `meal_prep_preference` | text | Optional preference for batch, family-style, quick-simple, and similar workflow labels. |
| `nutrition_goal` | text | Optional free-text goal label. |
| Nutrition target columns | numeric | Optional non-negative daily calorie, macro, fiber, and sodium targets. |
| `review_status` | text | `draft`, `active`, `inactive`, or `needs_review`. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `user_food_constraints`

| Column | Type | Notes |
| --- | --- | --- |
| `constraint_id` | text | Primary key. Deterministic from profile plus logical target fields. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `constraint_type` | text | `allergy`, `intolerance`, `religious`, `medical`, `dislike`, `avoid`, or `required`. |
| `target_type` | text | `ingredient`, `ingredient_family`, `tag`, `cuisine`, `nutrient`, or `product_attribute`. |
| `target_key` | text | Deterministic normalized target identifier. |
| `severity` | text | `hard`, `soft`, or `preference`. |
| `notes` | text | Optional reviewer/user notes. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

Constraint uniqueness is `(profile_id, constraint_type, target_type, target_key)`.

#### `user_food_preferences`

| Column | Type | Notes |
| --- | --- | --- |
| `preference_id` | text | Primary key. Deterministic from profile plus preference type/key. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `preference_type` | text | Flavor/texture/cuisine/region/feeling/meal-type/cooking-method/budget/convenience preference domain. |
| `preference_key` | text | Deterministic normalized preference identifier. |
| `preference_score` | numeric | Required bounded score between `-1.0` and `1.0`. |
| `source` | text | `explicit`, `inferred`, `swipe`, or `note`. |
| `confidence` | numeric | Optional probability between `0` and `1`. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

Preference uniqueness is `(profile_id, preference_type, preference_key)`.

#### `user_equipment`

| Column | Type | Notes |
| --- | --- | --- |
| `equipment_id` | text | Primary key. Deterministic from profile plus equipment key. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `equipment_key` | text | Deterministic normalized equipment identifier. |
| `available` | boolean | Mutable availability flag; UX1 updates this instead of deleting equipment rows. |
| `notes` | text | Optional notes. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `recipe_feedback_events`

| Column | Type | Notes |
| --- | --- | --- |
| `feedback_id` | text | Primary key. Deterministic fixture/event identity. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `user_id` | text | External user id snapshot. |
| `recipe_id` | text | FK to `recipes.recipe_id`. |
| `recipe_key_snapshot` | text | Canonical recipe key snapshot for review-safe provenance. |
| `event_type` | text | `impression`, `swipe_left`, `swipe_right`, `swipe_up`, `saved`, `cooked`, `cooked_again`, or `dismissed`. |
| `sentiment_score` | numeric | Optional bounded score between `-1.0` and `1.0`. |
| `intent_score` | numeric | Optional bounded score between `0.0` and `1.0`. |
| `reason_tags_json` | jsonb | Required array of deterministic reason tags. |
| `note_text` | text | Optional free-text note. |
| `note_language` | text | Optional note language. |
| `source` | text | `swipe`, `explicit`, `note`, or `system`. |
| `context_json` | jsonb | Required object for surface/session metadata. |
| `created_at` | timestamptz | Defaults to `now()`. |

UX2 keeps these rows append-only. Feedback is explicit user history, not inferred taste truth.

#### `recipe_feedback_note_signals`

| Column | Type | Notes |
| --- | --- | --- |
| `signal_id` | text | Primary key. Deterministic child id for manual or future extracted note signals. |
| `feedback_id` | text | FK to `recipe_feedback_events.feedback_id`. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `recipe_id` | text | FK to `recipes.recipe_id`. |
| `signal_type` | text | `taste`, `texture`, `timing`, `difficulty`, `substitution`, `portion_size`, `family_response`, `price`, or `availability`. |
| `signal_key` | text | Deterministic normalized signal identifier. |
| `signal_value` | text | Optional free-form normalized value. |
| `polarity` | text | `positive`, `negative`, or `neutral`. |
| `confidence` | numeric | Optional bounded score between `0.0` and `1.0`. |
| `extraction_method` | text | `manual_tag`, `future_llm`, or `rule`. |
| `created_at` | timestamptz | Defaults to `now()`. |

#### `user_taste_profile_snapshots`

| Column | Type | Notes |
| --- | --- | --- |
| `snapshot_id` | text | Primary key. Deterministic from profile id and append-only snapshot version. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `user_id` | text | External user id snapshot. |
| `snapshot_version` | integer | Append-only positive version number; unique per profile. |
| `source_event_count` | integer | Feedback events used for this build. |
| `source_recipe_count` | integer | Unique recipes referenced by the contributing feedback events. |
| `*_vector_json` | jsonb | Deterministic normalized vectors for flavor, texture, cuisine, region, feeling, meal type, and cooking method. |
| `dietary_pattern_json` | jsonb | Explicit constraints plus inferred dietary-tag pattern summary. |
| `disliked_patterns_json` | jsonb | Explicit dislikes/avoids plus negative-signal summary. |
| `preferred_constraints_json` | jsonb | Explicit required/religious constraints plus bounded profile defaults such as servings and time caps. |
| `confidence_json` | jsonb | Confidence label and supporting counts for the snapshot. |
| `generation_method` | text | Deterministic PROF1 generation method. |
| `rules_version` | text | PROF1 rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |

Only one row may exist for a `(profile_id, snapshot_version)` pair. PROF1 appends new versions instead of overwriting old taste snapshots.

#### `user_taste_profile_signal_sources`

| Column | Type | Notes |
| --- | --- | --- |
| `source_id` | text | Primary key. Deterministic from snapshot id plus ordinal. |
| `snapshot_id` | text | FK to `user_taste_profile_snapshots.snapshot_id`. |
| `profile_id` | text | FK to `user_food_profiles.profile_id`. |
| `source_type` | text | `explicit_preference`, `swipe_feedback`, `note_signal`, or `recipe_metadata`. |
| `source_ref_id` | text | Reference id for the originating preference, feedback, note signal, or recipe metadata source when available. |
| `signal_family` | text | `flavor`, `texture`, `cuisine`, `region`, `feeling`, `meal_type`, `cooking_method`, `dietary`, or `dislike`. |
| `signal_key` | text | Deterministic normalized signal identifier. |
| `signal_score` | numeric | Bounded contribution score from `-1.0` to `1.0`. |
| `weight` | numeric | Non-negative contribution weight. |
| `evidence_json` | jsonb | Review/audit metadata such as feedback id, event type, or staged recipe provenance. |
| `created_at` | timestamptz | Defaults to `now()`. |

#### `ingredient_nutrition_profile_candidates`

| Column | Type | Notes |
| --- | --- | --- |
| `profile_candidate_id` | text | Primary key. Deterministic from the approved mapping. |
| `ingredient_id` | text | Pricer ingredient id. |
| `mapping_id` | text | FK to `ingredient_nutrition_mappings`; one candidate per mapping. |
| `cluster_id` | text | USDA cluster snapshot from the mapping. |
| `representative_fdc_id` | bigint | USDA representative food id from the approved mapping. |
| `basis_amount` | numeric | Always `100`. |
| `basis_unit` | text | Always `g`. |
| `kcal` | numeric | Energy per 100g where available. |
| `protein_g` | numeric | Protein per 100g where available. |
| `fat_g` | numeric | Fat per 100g where available. |
| `carbs_g` | numeric | Carbohydrate per 100g where available. |
| `fiber_g` | numeric | Fiber per 100g where available. |
| `sugar_g` | numeric | Sugar per 100g where available. |
| `sodium_mg` | numeric | Sodium per 100g where available. |
| `source_nutrients_json` | jsonb | Source USDA nutrient rows used for traceability. |
| `review_status` | text | `candidate`, `approved`, `rejected`, or `needs_review`. Preserved on regeneration. |
| `source` | text | Source provenance. |
| `generation_method` | text | Deterministic generation method. |
| `rules_version` | text | Rules version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `ingredient_nutrition_profiles`

| Column | Type | Notes |
| --- | --- | --- |
| `profile_id` | text | Primary key. Approved/supersedable profile id. |
| `ingredient_id` | text | Pricer ingredient id. |
| `mapping_id` | text | FK to `ingredient_nutrition_mappings`. |
| `cluster_id` | text | USDA cluster snapshot. |
| `representative_fdc_id` | bigint | USDA representative food id. |
| `default_for_state` | text | State from the approved mapping. |
| `mapping_type` | text | Mapping type from the approved mapping. |
| `kcal_per_100g` | numeric | Energy per 100g. |
| `protein_g_per_100g` | numeric | Protein per 100g. |
| `fat_g_per_100g` | numeric | Fat per 100g. |
| `carbs_g_per_100g` | numeric | Carbohydrate per 100g. |
| `fiber_g_per_100g` | numeric | Fiber per 100g. |
| `sugar_g_per_100g` | numeric | Sugar per 100g. |
| `sodium_mg_per_100g` | numeric | Sodium per 100g. |
| `source_nutrients_json` | jsonb | USDA nutrient traceability payload. |
| `source_profile_candidate_id` | text | FK to profile candidate source. |
| `confidence` | numeric | Mapping confidence snapshot. |
| `review_status` | text | `approved`, `rejected`, `needs_review`, or `superseded`. |
| `reviewed_by` | text | Reviewer. |
| `reviewed_at` | timestamptz | Review time. |
| `review_decision` | text | Decision snapshot. |
| `review_reason` | text | Review reason. |
| `generation_method` | text | Candidate generation method. |
| `rules_version` | text | Candidate rules version. |
| `source_version` | text | Source version from mapping. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

Only one `approved` profile may exist for an `(ingredient_id, mapping_type, default_for_state)` group. Approving a replacement profile supersedes the previous approved row.

#### `ingredient_nutrition_profile_review_history`

| Column | Type | Notes |
| --- | --- | --- |
| `review_event_id` | text | Primary key. |
| `source_profile_candidate_id` | text | Candidate reviewed. |
| `profile_id` | text | Profile created by the review when applicable. |
| `superseded_profile_id` | text | Previous approved profile superseded when applicable. |
| `ingredient_id` | text | Ingredient snapshot. |
| `mapping_id` | text | Mapping snapshot. |
| `cluster_id` | text | Cluster snapshot. |
| `previous_candidate_review_status` | text | Candidate status before decision. |
| `previous_profile_review_status` | text | Profile status snapshot when applicable. |
| `review_decision` | text | `approved`, `rejected`, `needs_review`, or `superseded`. |
| `reviewed_by` | text | Reviewer. |
| `reviewed_at` | timestamptz | Review time. |
| `review_reason` | text | Reason. |
| `review_note` | text | Optional note. |
| `created_at` | timestamptz | Defaults to `now()`. |

### Migration Tracking

`schema_migrations` is created by the migration runner, not by a numbered SQL migration.

| Column | Type | Notes |
| --- | --- | --- |
| `migration_name` | text | Primary key. SQL filename. |
| `checksum` | text | SQL checksum for drift detection. |
| `applied_at` | timestamptz | Apply timestamp. |

### Import Metadata Tables

#### `source_datasets`

| Column | Type | Notes |
| --- | --- | --- |
| `dataset_id` | text | Primary key. Stable dataset identity. |
| `source_name` | text | Required source label. |
| `source_type` | text | Required source type, such as USDA. |
| `version` | text | Optional source version. |
| `root_path` | text | Local/source root path. |
| `license_note` | text | Source license/provenance note. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

#### `source_files`

| Column | Type | Notes |
| --- | --- | --- |
| `source_file_id` | text | Primary key. |
| `dataset_id` | text | FK to `source_datasets`; cascade delete. |
| `path` | text | Required file path. |
| `format` | text | Optional format, such as CSV. |
| `bytes` | bigint | Nonnegative when present. |
| `row_count` | bigint | Nonnegative when present. |
| `checksum` | text | File checksum. |
| `created_at` | timestamptz | Defaults to `now()`. |

Index:
- `source_files_dataset_id_idx`

#### `import_batches`

| Column | Type | Notes |
| --- | --- | --- |
| `import_batch_id` | text | Primary key. |
| `dataset_id` | text | FK to `source_datasets`; cascade delete. |
| `status` | text | `pending`, `running`, `completed`, `failed`, `cancelled`. |
| `started_at` | timestamptz | Defaults to `now()`. |
| `completed_at` | timestamptz | Optional. |
| `error_message` | text | Optional failure text. |
| `metadata_json` | jsonb | Import counters/warnings. Defaults to `{}`. |

Indexes:
- `import_batches_dataset_id_idx`
- `import_batches_status_idx`

### USDA Macro Tables

DB2 imports only macro nutrient IDs:

```text
1008, 1003, 1004, 1005, 1079, 2000, 1093, 2047, 2048
```

#### `usda_food_categories`

| Column | Type | Notes |
| --- | --- | --- |
| `food_category_id` | integer | Primary key. |
| `code` | text | Source category code. |
| `description` | text | Required source category text. |
| `created_at` | timestamptz | Defaults to `now()`. |

#### `usda_measure_units`

| Column | Type | Notes |
| --- | --- | --- |
| `measure_unit_id` | integer | Primary key. |
| `name` | text | Required measure unit name. |
| `created_at` | timestamptz | Defaults to `now()`. |

#### `usda_nutrients`

| Column | Type | Notes |
| --- | --- | --- |
| `nutrient_id` | integer | Primary key. |
| `name` | text | Required nutrient name. |
| `unit_name` | text | Source unit. |
| `nutrient_nbr` | text | Source nutrient number. |
| `rank` | numeric | Source display/order rank. |
| `created_at` | timestamptz | Defaults to `now()`. |

#### `usda_foods`

| Column | Type | Notes |
| --- | --- | --- |
| `fdc_id` | bigint | Primary key. USDA food ID. |
| `data_type` | text | USDA data type, such as Foundation or SR Legacy. |
| `description` | text | Required raw USDA description. |
| `food_category_id` | text | Stored as text because real USDA rows may contain category text. |
| `publication_date` | date | Source publication date. |
| `raw_json` | jsonb | Preserved raw row payload. |
| `created_at` | timestamptz | Defaults to `now()`. |

Indexes:
- `usda_foods_data_type_idx`
- `usda_foods_food_category_id_idx`

#### `usda_food_nutrients`

| Column | Type | Notes |
| --- | --- | --- |
| `food_nutrient_id` | bigint | Primary key. |
| `fdc_id` | bigint | FK to `usda_foods`; cascade delete. |
| `nutrient_id` | integer | FK to `usda_nutrients`; restrict delete. |
| `amount` | numeric | Nutrient amount. |
| `derivation_id` | text | Source derivation. |
| `data_points` | integer | Source count. |
| `min` | numeric | Source min. |
| `max` | numeric | Source max. |
| `median` | numeric | Source median. |
| `footnote` | text | Source footnote. |
| `created_at` | timestamptz | Defaults to `now()`. |

Indexes:
- `usda_food_nutrients_fdc_id_idx`
- `usda_food_nutrients_nutrient_id_idx`

#### `usda_food_portions`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint | Primary key. |
| `fdc_id` | bigint | FK to `usda_foods`; cascade delete. |
| `amount` | numeric | Portion amount. |
| `measure_unit_id` | integer | FK to `usda_measure_units`; set null on delete. |
| `portion_description` | text | Source description. |
| `modifier` | text | Source modifier. |
| `gram_weight` | numeric | Gram weight. |
| `created_at` | timestamptz | Defaults to `now()`. |

Index:
- `usda_food_portions_fdc_id_idx`

#### `usda_import_runs`

| Column | Type | Notes |
| --- | --- | --- |
| `usda_import_run_id` | text | Primary key. |
| `import_batch_id` | text | FK to `import_batches`; cascade delete. |
| `dataset_root` | text | Required dataset root. |
| `status` | text | `pending`, `running`, `completed`, `failed`, `cancelled`. |
| `foods_imported` | bigint | Count. |
| `nutrients_imported` | bigint | Count. |
| `food_nutrients_imported` | bigint | Count. |
| `portions_imported` | bigint | Count. |
| `started_at` | timestamptz | Defaults to `now()`. |
| `completed_at` | timestamptz | Optional. |
| `error_message` | text | Optional failure text. |
| `metadata_json` | jsonb | Row-quality counters and warnings. |

Indexes:
- `usda_import_runs_import_batch_id_idx`
- `usda_import_runs_status_idx`

### USDA Cluster Candidate Tables

#### `usda_food_cluster_candidates`

| Column | Type | Notes |
| --- | --- | --- |
| `candidate_id` | text | Primary key. |
| `candidate_key` | text | Deterministic grouping candidate key. |
| `core_food_name` | text | Human-readable core food. |
| `core_food_normalized` | text | Normalized core food. |
| `source_fdc_id` | bigint | FK to `usda_foods`; unique; cascade delete. |
| `source_description` | text | USDA description used for parsing. |
| `source_data_type` | text | USDA data type. |
| `source_food_category_id` | text | Source food category. |
| `parsed_qualifiers_json` | jsonb | Parsed raw/cooked/form/etc. qualifiers. |
| `hard_boundary_signature` | text | Boundary signature that prevents unsafe collapse. |
| `representative_score` | numeric | Candidate representative score. |
| `representative_score_json` | jsonb | Score explanation. |
| `confidence` | text | `high`, `medium`, `low`. |
| `review_status` | text | `candidate`, `needs_review`, `approved`, `rejected`. |
| `generation_method` | text | Generator method. |
| `rules_version` | text | Parser/rules version. |
| `source_version` | text | Source dataset version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

Indexes:
- unique `source_fdc_id`
- `candidate_key`
- `review_status`

### USDA Cluster Preview and Review Tables

#### `usda_food_clusters`

| Column | Type | Notes |
| --- | --- | --- |
| `cluster_id` | text | Primary key. |
| `cluster_key` | text | Unique deterministic cluster key. |
| `core_food_name` | text | Display core food. |
| `core_food_normalized` | text | Normalized core food. |
| `food_category_hint` | text | Optional category hint. |
| `source_category_ids` | jsonb | Source category IDs. |
| `parsed_shared_qualifiers_json` | jsonb | Qualifiers shared by cluster. |
| `representative_fdc_id` | bigint | FK to `usda_foods`; set null on delete. |
| `representative_selection_reason` | text | Why representative was chosen. |
| `confidence` | text | `high`, `medium`, `low`. |
| `review_status` | text | `pending_review`, `approved`, `rejected`, `needs_split`, `needs_merge`. |
| `generation_method` | text | Generation method. |
| `rules_version` | text | Rules version. |
| `source_version` | text | Source version. |
| `reviewed_by` | text | Reviewer. |
| `reviewed_at` | timestamptz | Review timestamp. |
| `review_decision` | text | Review decision. |
| `review_reason` | text | Review reason. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

Indexes:
- `review_status`
- `core_food_normalized`

#### `usda_food_cluster_members`

| Column | Type | Notes |
| --- | --- | --- |
| `cluster_member_id` | text | Primary key. |
| `cluster_id` | text | FK to `usda_food_clusters`; cascade delete. |
| `fdc_id` | bigint | FK to `usda_foods`; cascade delete. |
| `member_role` | text | `representative`, `included`, `candidate`. |
| `confidence` | text | `high`, `medium`, `low`. |
| `inclusion_reason` | text | Why included. |
| `exclusion_flags` | jsonb | Boundary flags. |
| `source_data_type` | text | USDA data type. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

Constraints/indexes:
- Unique `(cluster_id, fdc_id)`
- `cluster_id`
- `fdc_id`

#### `usda_food_cluster_review_history`

| Column | Type | Notes |
| --- | --- | --- |
| `review_event_id` | text | Primary key. |
| `cluster_id` | text | FK to `usda_food_clusters`; cascade delete. |
| `cluster_key` | text | Snapshot of cluster key. |
| `previous_review_status` | text | Prior status. |
| `review_decision` | text | `pending_review`, `approved`, `rejected`, `needs_split`, `needs_merge`. |
| `reviewed_by` | text | Reviewer. |
| `reviewed_at` | timestamptz | Defaults to `now()`. |
| `review_reason` | text | Reason. |
| `review_note` | text | Optional note. |
| `created_at` | timestamptz | Defaults to `now()`. |

Indexes:
- `cluster_id`
- `cluster_key`

### Ingredient Nutrition Mapping Tables

#### `ingredient_nutrition_mappings`

| Column | Type | Notes |
| --- | --- | --- |
| `mapping_id` | text | Primary key. |
| `ingredient_id` | text | Runtime ingredient ID; no Postgres FK today. |
| `cluster_id` | text | FK to `usda_food_clusters`; cascade delete. |
| `representative_fdc_id` | bigint | FK to `usda_foods`; set null on delete. |
| `default_for_state` | text | Raw/cooked/state default. |
| `mapping_type` | text | `default_raw`, `default_cooked`, `alternate_state`, `product_specific`, `rejected_candidate`. |
| `confidence` | numeric | 0 through 1. |
| `source` | text | Mapping source. |
| `review_status` | text | `suggested`, `approved`, `rejected`, `needs_review`. |
| `notes` | text | Optional notes. |
| `suggestion_reason_json` | jsonb | Suggestion evidence. |
| `reviewed_by` | text | Reviewer. |
| `reviewed_at` | timestamptz | Review timestamp. |
| `review_decision` | text | Review decision. |
| `review_reason` | text | Review reason. |
| `generation_method` | text | Generator method. |
| `rules_version` | text | Rules version. |
| `source_version` | text | Source version. |
| `created_at` | timestamptz | Defaults to `now()`. |
| `updated_at` | timestamptz | Defaults to `now()`. |

Constraints/indexes:
- Unique `(ingredient_id, cluster_id, default_for_state)`
- `ingredient_id`
- `cluster_id`
- `review_status`

#### `ingredient_nutrition_mapping_review_history`

| Column | Type | Notes |
| --- | --- | --- |
| `review_event_id` | text | Primary key. |
| `mapping_id` | text | FK to `ingredient_nutrition_mappings`; cascade delete. |
| `ingredient_id` | text | Runtime ingredient ID snapshot. |
| `cluster_id` | text | USDA cluster ID snapshot. |
| `previous_review_status` | text | Prior status. |
| `review_decision` | text | `suggested`, `approved`, `rejected`, `needs_review`. |
| `reviewed_by` | text | Reviewer. |
| `reviewed_at` | timestamptz | Defaults to `now()`. |
| `review_reason` | text | Reason. |
| `review_note` | text | Optional note. |
| `created_at` | timestamptz | Defaults to `now()`. |

Indexes:
- `mapping_id`
- `ingredient_id`

## Ingest and Publication Rules

All new external source schemas must follow [data_ingest_rules.md](../data_ingest_rules.md):

```text
raw import
  -> source row identity
  -> deterministic normalization
  -> source-level dedupe
  -> canonical candidate matching
  -> existing canonical link or net-new candidate
  -> enrichment only for net-new / enrichment-missing concepts
  -> confidence scoring
  -> review when needed
  -> runtime-safe read model
```

Schema implications:
- Raw source records or raw-file references must be preserved.
- Product source rows must pass Phase 6 row/product-name validation before they can create `raw_price_snapshots`, `source_products`, canonical mappings, canonical products, current offers, search records, or enrichment candidates. Quote-only brand-style product names are warning-level and remain runtime-eligible; invalid row-corruption patterns remain blocked.
- Existing `canonical_products` and `source_products` are audited through a dry-run report command with `valid`, `warning`, `suspicious`, and `invalid` quality levels. After review, the same command can mark only `invalid` / `quarantinable` records with additive no-delete quarantine fields; warning records stay visible, and no cleanup plan may delete data by default.
- Repeated fact rows should not be LLM-enriched.
- Enrichment tables/collections must carry model, prompt/version, confidence, source/canonical link, and timestamp.
- Runtime read models must be compact and app-safe.
- Searchable/user-facing entities need BG/EN names and aliases.

## Where to Change What

| You are changing | Update these files |
| --- | --- |
| Runtime flat collection fields | `docs/DATA_MODEL.md`, this file, owning phase module, tests. |
| Runtime collection identity/document ID | `phase1/store.js` in both backend trees, this file, tests. |
| New backend runtime collection | `createEmptyDataBackbone()` and `COLLECTION_DOCUMENT_IDS` in both backend trees, `DATA_MODEL.md`, this file, tests. |
| Postgres table/constraint/index | New `db/migrations/NNN_*.sql`, `DATA_MODEL.md`, this file, repository code, tests. |
| New source ingest | `data_ingest_rules.md` compliance notes, import metadata linkage, source-specific repository/importer, docs, tests. |
| Mobile Firestore user state | Mobile repository/service files, `DATA_MODEL.md`, this file, Flutter tests. |
| Canonical product grouping behavior | `phase6/ingest.js`, `phase6/disambiguation.js`, `DATA_MODEL.md`, decision log, tests. |
| Ingredient or nutrition bridge | `meal/`, `db/usda/ingredient_nutrition_mapping_*`, `DATA_MODEL.md`, this file, tests. |

## Maintenance Rules

- Update this document whenever persistent shape, identity, relationship, or schema ownership changes.
- Update [REPO_MAP.md](REPO_MAP.md) when a new schema area introduces new files, scripts, or test families.
- Update [DATA_MODEL.md](DATA_MODEL.md) for field-level runtime or sidecar schema changes.
- Add a [decision_log.md](decision_log.md) entry when a schema boundary changes, such as moving a read path, changing a source of truth, or linking two domains in a new way.
- Add or update test registry/test-run records when schema behavior is verified as part of a phase.
