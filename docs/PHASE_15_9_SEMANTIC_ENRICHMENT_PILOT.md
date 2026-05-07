# Phase 15.9 Semantic Enrichment Pilot

Date: 2026-05-05
Status: IMPLEMENTED - DRY-RUN FIRST; V3 REGISTRY HARDENING ADDED

## Goal

Improve semantic product search for focused QA failures without enriching the whole catalog.

Target examples:

- `cookies` should retrieve biscuit/cookie products even when the literal English word is absent.
- `snacks` should retrieve chips, crackers, wafers, pretzels/solети, and dessert snack products.
- `Coca-Cola`, `coke`, and `кока кола` should favor cola soft drinks.
- Cola beverage intent should not rank shampoo/personal-care products above beverages just because `cola` appears in a scent/flavor name.

## Deterministic Layer First

`phase15/search_synonyms.js` remains the first search-quality layer. It now includes deterministic aliases for cookies, snacks, cola/Coca-Cola/coke, and soft drinks. These aliases are query-expansion and ranking hints only. They do not merge products, rewrite canonical truth, or create offers.

`phase15/price_normalization.js` adds a deterministic price-normalization metadata layer before any LLM evidence. It distinguishes explicit package facts from inferred selling basis:

- explicit `size_marker` facts set `explicit_quantity_detected = true` and can support `per_kg`, `per_liter`, or `per_piece` calculations when a current offer price exists
- meat, fish, deli, produce, and loose-cheese keywords without explicit quantity infer `inferred_selling_unit = "kg"` and `comparison_basis = "per_kg"` without creating a fake package quantity
- loose/draft liquids infer `per_liter` only with strong loose/draft evidence
- eggs/count items infer `per_piece` only with strong count evidence
- ambiguous packaged/no-size products remain `unknown`/`per_pack` with `needs_uom_review`

LLM enrichment may provide supporting semantic context, but deterministic explicit markers override inferred or LLM-suggested unit semantics.

Search ranking now also reads optional enrichment fields when present:

- `product_type`
- `product_family`
- `category`
- `subcategory`
- `brand_normalized`
- `flavor_terms`
- `search_aliases_bg`
- `search_aliases_en`
- `is_food`
- `is_beverage`
- `is_personal_care`
- `exclusion_terms`
- `dairy_type`
- `beverage_type`
- `synonym_terms`
- `should_match_queries`
- `negative_match_hints`
- `do_not_match_queries`

The cola guardrail boosts beverage/soft-drink products and demotes or excludes personal-care products when enrichment explicitly says they are not beverages. Rich v2 `do_not_match_queries` and `negative_match_hints` add another additive demotion layer for false positives such as shampoo/collagen versus cola and personal-care milk wording versus dairy milk.

Base ingredient/product queries now add soft selection weighting before any LLM call. For broad terms such as chicken/`пилешко`, milk, beef, cheese, bread, soap, and shampoo, raw/simple evidence such as `филе`, `бутче`, `гърди`, `месо`, `охладено`, `замразено`, `насипно`, `fillet`, `breast`, `thigh`, `meat`, `fresh`, `chilled`, `frozen`, `raw`, or `loose` receives a small `base_product_boost`. Processed or compound evidence such as `пюре`, `бебешко`, `супа`, `готово`, `ястие`, `снакс`, `вкус`, `flavored`, `puree`, `baby food`, `soup`, or `ready meal` receives soft demotions with debug reasons `processed_product_demotion`, `baby_food_demotion`, and/or `prepared_meal_demotion`. These are ranking changes only; they do not hide or delete processed candidates.

## Enrichment Schema Extension

The canonical enrichment schema is backward-compatible. Existing strict v1 records remain valid. New rich v2 pilot records use:

- `enrichment.enrichment_version = "canonical_semantic_v2"`
- top-level `enrichment_version = "canonical_semantic_v2"`
- `canonical_name_hash`
- `enrichment_source` / `enrichment.enrichment_source`

The v2 payload adds optional fields for:

- identity/classification: normalized BG/EN display names, brand candidates, product family/type/form, category path, comparable class, variant attributes
- grocery semantics: food/beverage/alcohol/baby/pet/household/personal-care/medicine flags, storage type, meal role, preparation and pantry-staple hints
- dietary/nutrition-ish hints: dairy/meat/vegetarian/vegan/gluten/sugar/fat/wholegrain/organic flags, allergens and ingredient hints
- package/size: size marker, package quantity/unit, total quantity/unit, multipack and unit quantities
- dairy, beverage, and baby-specific fields such as `dairy_type`, `milk_source`, `uht_or_fresh`, `beverage_type`, `carbonated`, `baby_stage`, and formula/age fields
- search and shopping-intent fields such as aliases, synonyms, negative/do-not-match hints, should-match queries, shopping family, clarification attributes, and preference relevance flags
- quality/audit fields such as `data_quality_status`, ambiguous fields, uncertainty reasons, short explanation, review status, and human-review flag

Validation still rejects uncontrolled fields and invalid controlled category hierarchy values. Rich prompts list exact controlled enum values, including `product_form`, and instruct the model not to invent enum values. The unsupported `product_form` near-misses `semi-solid` and `semi solid` are normalized to `null` with validation/run warnings instead of being collapsed into `solid`, `cream`, `gel`, or `paste`. LLM output remains additive and must never mutate `canonical_products`, `canonical_product_mappings`, source products, raw snapshots, offers, or prices.

The prompt is batch-first. It requires strict JSON with one `products[]` entry per input `canonical_product_id`, says the work is classification/metadata only and not canonical merging, requires conservative output, and tells the model to use null/unknown/false/empty arrays when the product name does not strongly support a value. It explicitly calls out fresh milk versus yogurt, baby formula, body-care/shampoo milk wording, Milka chocolate, cola beverages, collagen, chocolate, and shampoo false positives.

## Semantic Registry V3

`canonical_semantic_v3` is additive and opt-in:

```powershell
$env:PRICER_ENRICHMENT_VERSION='canonical_semantic_v3'
```

V3 keeps v2 readable and separates raw product meaning from registry-backed normalization:

- raw observed terms and descriptions are preserved in `packaging`, `product_form`, `category`, and attributes
- registry matches point to `semantic_term_registry` terms when accurate
- search buckets are stored separately from the raw truth
- `semantic_usage_profile` preserves richer culinary/search meaning for future deterministic embedding descriptions, including cuisine contexts, flavor profile, culinary and dish roles, meal contexts, common uses, preparation contexts, pairing suggestions, substitutes, consumer search intents, and not-for hints
- `registry_actions` propose aliases, new terms, relationships, or review work
- LLM output never activates registry terms directly

New runtime collections:

- `semantic_term_registry`: canonical reusable terms seeded from existing enum-like Phase 15 values across packaging, product form, open hierarchical product taxonomy, generalized legacy product category, legacy food category, dairy type, milk source, quality tier, storage type, flavor, dietary claim, material, and preparation state.
- `semantic_term_registry_proposals`: pending review proposals deduped by domain/action/label/alias/existing term, with `product_taxonomy` new-term proposals deduped by domain plus normalized label plus parent term id.
- `canonical_enrichment_failed_responses`: redacted malformed provider responses with run id, batch index, product ids, provider/model, parse error, and creation time.

V3 taxonomy now uses `taxonomy_classification` plus the `product_taxonomy` registry domain as the general open product taxonomy. The schema is strict, but vocabulary is flexible:

- `taxonomy_path_labels` is a human-readable broad-to-specific path, such as `Personal Care > Bath & Body > Soap > Bar Soap`.
- `taxonomy_path_term_ids` aligns index-for-index with labels and uses `null` for proposed or unmatched nodes.
- `primary_taxonomy_label` is usually the deepest confident node.
- `raw_category_terms` preserves category/source words from product text.
- `registry_matches` references approved `product_taxonomy` terms when they fit.
- `proposed_terms` queues new labels under the best known parent without auto-activating them.

`taxonomy_classification.registry_matches` is intentionally product-taxonomy-only. If a provider spills legacy `product_category` or `food_category` matches into this field, validation keeps valid `product_taxonomy` matches, moves usable legacy matches to the backward-compatible `category.registry_matches` surface, and drops null/unusable spillover entries rather than rejecting the whole product enrichment. This preserves useful evidence while keeping the primary taxonomy path scoped to `product_taxonomy`.

`primary_taxonomy_label` and `primary_taxonomy_term_id` are normalized against the path instead of being hard-fail membership checks. If a usable primary label or product-taxonomy term id is missing from `taxonomy_path_labels` / `taxonomy_path_term_ids`, validation appends or fills the matching leaf slot so the arrays remain aligned. If primary fields are null or unusable, validation derives them from the deepest valid path label and product-taxonomy term id. Malformed path array lengths and impossible high-confidence contradictions still reject the item.

V3 partial salvage now runs before final strict validation. Truly fatal cases still reject and do not write enrichment: malformed JSON, missing whole enrichment objects, unexpected/duplicate/wrong product IDs, product-identity mismatches, and invalid batch shapes. Repairable field-level issues are normalized instead: misplaced non-product registry matches are moved to `category.registry_matches` when usable, null spillover and invalid optional registry matches are dropped, missing primary taxonomy is derived from the deepest path item, and invalid optional semantic usage/embedding fields are discarded. These records write with `enrichment_repair_status = "repaired"` or `"partial"`, `repair_warnings[]`, `discarded_fields[]`, and `needs_human_review = true`; run summaries also include `validation_warnings`.

Seeded `product_taxonomy` terms are intentionally broad starter vocabulary, not a closed list. Top-level seeds include `Grocery`, `Personal Care`, `Household`, `Baby & Kids`, `Pet Care`, `Automotive`, `Sports & Outdoors`, `Tools & Hardware`, `Garden & Outdoor`, `Electronics`, `Home Appliances`, `Clothing`, `Health`, and `Office & School`. Starter child branches cover current tests, including:

- `Grocery > Meat & Seafood > Poultry > Chicken`
- `Grocery > Dairy`
- `Grocery > Bread & Bakery`
- `Grocery > Beverages`
- `Grocery > Snacks & Sweets`
- `Grocery > Pantry`
- `Grocery > Produce`
- `Grocery > Frozen Food`
- `Personal Care > Bath & Body > Soap > Bar Soap`
- `Personal Care > Bath & Body > Soap > Shower Gel`
- `Personal Care > Hair Care > Shampoo`
- `Personal Care > Hair Care > Conditioner`
- `Automotive > Car Care > Fluids > Motor Oil`
- `Garden & Outdoor > Garden Tools > Shovels`

The older category object and `product_category` domain remain readable for compatibility. `food_category` remains readable for existing `sem_food_category_*` records and food-only terms, but registry actions must not propose non-food terms under it.

Dairy fields remain as category-specific extensions. V3 also allows conditional `attributes.personal_care` for shampoo/conditioner-style metadata such as `target_hair_type`, `target_skin_type`, `scent`, `active_claims`, and `use_area`, while `attributes.household` is reserved for additive household-specific metadata.

The v3 prompt includes an exact JSON schema and a registry snapshot. It tells the model to use existing registry terms only when accurate, preserve unfamiliar real-world terms such as `кофичка`, avoid unsafe mappings such as blindly treating `пакетирано` as `packet`, and propose aliases/new terms instead of inventing activated canonical terms.

V3.1 keeps the existing v3 fields and adds `semantic_usage_profile` additively. The prompt asks for conservative inference only from product name, product type, category, and deterministic markers. It may infer broad usage such as yogurt for breakfast/snacks/cooking, kashkaval as a melting cheese/topping/sandwich ingredient, or sirene for shopska salad/banitsa/table cheese when the product type strongly supports it. It must not invent specific claims such as organic, lactose-free, vegan, gluten-free, or sugar-free unless stated. Broad cuisine contexts such as Bulgarian/Balkan are allowed only when strongly supported by product type/name.

V3.1 also adds optional `semantic_embedding_summary` as a richer future-embedding field. The summary is additive prose, not source truth, and contains `summary`, `summary_language`, `included_aspects`, capped `evidence`, `confidence`, and `needs_review`. New provider outputs are asked for one to two sentences, max 120 words, covering product type, packaging/quantity, category/form/storage, flavor or texture profile, cuisine context, explicit or strongly implied ingredients, common use cases, dish/meal role, preparation or pairing context, and consumer-search meaning where supported. Missing summaries in older v3 records normalize to an empty object.

For real provider requests, the full v3 JSON schema is carried through `response_format.json_schema` instead of being duplicated verbosely in the user prompt. Registry context is selected by relevant domains for the batch and bounded by `PRICER_REGISTRY_CONTEXT_MAX_TERMS_PER_DOMAIN` and `PRICER_REGISTRY_CONTEXT_MAX_TOTAL_TERMS`. Evidence arrays in the schema and validation are capped by `PRICER_LLM_MAX_EVIDENCE_ITEMS_PER_FIELD` (default `3`).

xAI requests include strict structured output for v3 by default:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "canonical_semantic_v3_batch",
      "strict": true
    }
  }
}
```

Set `PRICER_ENRICHMENT_STRUCTURED_OUTPUT=false` to fall back to `response_format: { "type": "json_object" }` when a provider endpoint does not support schema mode.

## Pilot Selector

The pilot command is:

```powershell
npm run phase15:enrichment-pilot
```

Environment controls:

- `PRICER_ENRICHMENT_PILOT_LIMIT`, default `50`
- `PRICER_ENRICHMENT_LIMIT`, fallback alias for the pilot limit
- `PRICER_ENRICHMENT_PILOT_QUERY`, examples `cookies`, `snacks`, `cola`, `shampoo`, `baby_food`
- `PRICER_ENRICHMENT_PILOT_GROUP`, optional explicit group: `milk_dairy_eval`, `bread_bakery_eval`, `cola_beverage_eval`, `cookies_snacks_eval`, `personal_care_false_positive_eval`, `baby_food_eval`, `search_quality_eval`, plus legacy aliases `snacks`, `beverages`, `personal_care`, `baby_food`
- `PRICER_ENRICHMENT_PILOT_BATCH_SIZE`, default `10` for v2 and `5` for `canonical_semantic_v3`
- `PRICER_ENRICHMENT_BATCH_SIZE`, fallback alias for pilot batch size
- `PRICER_REGISTRY_CONTEXT_MAX_TERMS_PER_DOMAIN`, v3 registry context cap per selected domain, default `12`
- `PRICER_REGISTRY_CONTEXT_MAX_TOTAL_TERMS`, v3 registry context cap per request, default `48`
- `PRICER_LLM_MAX_EVIDENCE_ITEMS_PER_FIELD`, v3 evidence-array cap per field, default `3`
- `PRICER_ENRICHMENT_DRY_RUN`, default `true`
- `PRICER_ENRICHMENT_RUN_LLM`, default `false`
- `XAI_API_KEY`, required for real LLM runs and live healthcheck requests
- `XAI_GROK_ENDPOINT`, optional xAI-compatible chat completions endpoint override; default `https://api.x.ai/v1/chat/completions`
- `XAI_GROK_MODEL`, optional model override; default `grok-4-1-fast-non-reasoning`
- `PRICER_ENRICHMENT_ENDPOINT`, pilot-specific endpoint fallback used when `XAI_GROK_ENDPOINT` is unset
- `PRICER_ENRICHMENT_MODEL`, pilot-specific model fallback used when `XAI_GROK_MODEL` is unset
- `PRICER_LLM_MAX_RETRIES`, default `3`
- `PRICER_LLM_RETRY_BASE_MS`, default `750`
- `PRICER_LLM_RETRY_MAX_MS`, default `8000`
- `PRICER_LLM_REQUEST_TIMEOUT_MS`, default `300000`

Dry-run loads only `canonical_products` and `canonical_enrichment_store`, selects a bounded candidate set, prints selected products, batch count, estimated tokens, and estimated cost, and writes nothing.

When targeting Firestore, the pilot reads the runtime collections selected by the same store environment as the deployed API. Production/admin product search data is normally in prefixed collections such as `prod_canonical_products`, so local pilot/debug commands must set the same prefix:

```powershell
$env:PRICER_STORE_BACKEND='firestore'
$env:PRICER_FIRESTORE_PROJECT_ID='pricer-ee440'
$env:PRICER_FIRESTORE_DATABASE_ID='(default)'
$env:PRICER_FIRESTORE_COLLECTION_PREFIX='prod'
npm run debug:runtime-store
```

If `PRICER_FIRESTORE_COLLECTION_PREFIX` is unset, the Firestore adapter reads unprefixed collections such as `canonical_products`. That read can succeed with `row_count: 0` even while the app/admin console sees many products from `prod_canonical_products`.

Real runs require both:

```powershell
$env:PRICER_ENRICHMENT_DRY_RUN='false'
$env:PRICER_ENRICHMENT_RUN_LLM='true'
```

Real runs update only `canonical_enrichment_store`. They cache by `canonical_product_id` plus canonical-name hash plus `canonical_semantic_v2`; existing same-version/same-name records are skipped and reported. They never apply LLM output to canonical merges.

When `PRICER_ENRICHMENT_VERSION=canonical_semantic_v3`, real runs may also seed `semantic_term_registry`, write pending `semantic_term_registry_proposals`, and store malformed provider responses in `canonical_enrichment_failed_responses`. They still do not update raw/source/offer rows, prices, mappings, or canonical product grouping.

## Enrichment Inspection

After a real enrichment run, inspect the records that were actually written:

```powershell
npm run debug:enrichment -- <canonical_product_id...>
```

To inspect the newest written records for one schema version:

```powershell
npm run debug:enrichment -- --latest 10 --version canonical_semantic_v3
```

The command is read-only and prints compact JSON per product: canonical product identity, canonical name, enrichment version, canonical-name hash, model, timestamp, repair status, repair warnings, discarded fields, taxonomy path labels, primary taxonomy, taxonomy registry matches/proposed terms/confidence/review flag, generalized category summary/path, packaging and product-form raw/registry/proposal fields, semantic usage profile, semantic embedding summary, dairy attributes, personal-care attributes, quantity/storage attributes, registry actions, warnings, human-review flag, and overall confidence. It does not print provider secrets or environment values.

## Provider Retry Reliability

The xAI provider path retries transient failures inside the same pilot run. Retryable failures include:

- socket/network failures such as `UND_ERR_SOCKET`, `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, and `fetch failed` with `SocketError`
- request timeouts from `AbortController`
- HTTP `408`, `425`, `429`, `500`, `502`, `503`, and `504`
- HTTP `409` only when the provider body indicates a retryable/temporary conflict

Non-retryable failures include local validation errors, bad request/schema errors, HTTP `400`, and auth/permission failures such as `401` or `403`.

Every provider request has an AbortController timeout. Backoff is exponential with jitter and bounded by `PRICER_LLM_RETRY_MAX_MS`. `ENOTFOUND` is retried at most once. Run summaries include:

- `provider_attempt_count`
- `retry_count`
- `retryable_error_count`
- `provider_attempt_history[]` with per-batch attempts, status/cause codes, timeout flags, retryability, attempt duration, prompt/request size, schema-size metadata, and `exhausted_retries`

Large request bodies are classified as `possible_local_request_bloat` when a retryable provider failure occurs above `PRICER_LLM_REQUEST_BLOAT_CHAR_THRESHOLD` (default `100000` characters). This keeps local prompt/schema/context bloat visible instead of attributing every socket failure to the provider.

Provider calls send `Connection: close` to avoid depending on a reused socket that the provider may close between requests. This is the smallest current mitigation for Node/undici keep-alive socket reuse; if xAI publishes more specific transport guidance, replace this with a provider-recommended dispatcher/agent configuration.

## Cost Controls

- The selector is deterministic and bounded by `PRICER_ENRICHMENT_PILOT_LIMIT`.
- Products are batched for prompting.
- Dry-run is the default and reports estimated tokens/cost before any LLM call.
- Dry-run and real-run summaries report prompt/request character counts, estimated prompt/request tokens, registry context term counts/domains, JSON schema size, response-format schema inclusion, and per-batch token estimates.
- Existing same-version/name-hash enrichment is skipped before prompting to avoid duplicate costs.
- Real writes are opt-in and limited to `canonical_enrichment_store`.
- Globally invalid batch response shapes are rejected/quarantined in the run report. Per-item validation failures reject only the affected canonical product, report rejected product ids and field-level reasons, and still allow valid sibling items in the same batch to be written. Invalid enrichment is not written.

## LLM Healthcheck

Use the healthcheck before a real pilot when provider connectivity or model configuration is in doubt:

```powershell
npm run phase15:enrichment-healthcheck
```

The default healthcheck is config-only. It prints whether `XAI_API_KEY` is present without printing the key, the provider, endpoint, endpoint host, model, and Node `fetch` availability. It does not load or write Firestore and does not make a live LLM request unless explicitly enabled.

To make the smallest live provider request after the operator approves token usage:

```powershell
$env:PRICER_ENRICHMENT_LLM_HEALTHCHECK_LIVE='true'
npm run phase15:enrichment-healthcheck
```

On failure the healthcheck and real pilot batch reports include provider, endpoint host, model, batch index when applicable, error type, error name/code, nested cause name/code/message, and HTTP status/body for non-2xx responses. Network-level failures such as Node `fetch failed` are reported separately from HTTP and validation failures.

Live healthcheck requests now use the same provider request path as enrichment, including model, timeout, retry config, and v3 `response_format` when `PRICER_ENRICHMENT_VERSION=canonical_semantic_v3`.

## Run Examples

Dry-run a small cola false-positive pilot:

```powershell
$env:PRICER_ENRICHMENT_PILOT_GROUP='cola_beverage_eval'
$env:PRICER_ENRICHMENT_PILOT_LIMIT='10'
$env:PRICER_ENRICHMENT_DRY_RUN='true'
npm run phase15:enrichment-pilot
```

Dry-run the milk pilot against the same product data used by the production/admin API:

```powershell
$env:PRICER_STORE_BACKEND='firestore'
$env:PRICER_FIRESTORE_PROJECT_ID='pricer-ee440'
$env:PRICER_FIRESTORE_DATABASE_ID='(default)'
$env:PRICER_FIRESTORE_COLLECTION_PREFIX='prod'
$env:PRICER_ENRICHMENT_PILOT_QUERY='milk мляко'
$env:PRICER_ENRICHMENT_DRY_RUN='true'
npm run phase15:enrichment-pilot
```

Small real pilot, not run unless explicitly approved by the operator:

```powershell
$env:PRICER_ENRICHMENT_PILOT_GROUP='cola_beverage_eval'
$env:PRICER_ENRICHMENT_PILOT_LIMIT='10'
$env:PRICER_ENRICHMENT_PILOT_BATCH_SIZE='5'
$env:PRICER_ENRICHMENT_DRY_RUN='false'
$env:PRICER_ENRICHMENT_RUN_LLM='true'
npm run phase15:enrichment-pilot
```

Do not run full-catalog enrichment from this command. Keep pilots bounded, inspect the report, and promote search behavior only after validation.

## Admin QA

The Admin Console Product Search tab now summarizes top-result `search_debug` fields, including matched enrichment category/product type, matched aliases, and demotion reason when returned.
