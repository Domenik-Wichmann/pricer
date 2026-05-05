# Phase 15.9 Semantic Enrichment Pilot

Date: 2026-05-05
Status: IMPLEMENTED - DRY-RUN FIRST

## Goal

Improve semantic product search for focused QA failures without enriching the whole catalog.

Target examples:

- `cookies` should retrieve biscuit/cookie products even when the literal English word is absent.
- `snacks` should retrieve chips, crackers, wafers, pretzels/solети, and dessert snack products.
- `Coca-Cola`, `coke`, and `кока кола` should favor cola soft drinks.
- Cola beverage intent should not rank shampoo/personal-care products above beverages just because `cola` appears in a scent/flavor name.

## Deterministic Layer First

`phase15/search_synonyms.js` remains the first search-quality layer. It now includes deterministic aliases for cookies, snacks, cola/Coca-Cola/coke, and soft drinks. These aliases are query-expansion and ranking hints only. They do not merge products, rewrite canonical truth, or create offers.

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
- `PRICER_ENRICHMENT_PILOT_BATCH_SIZE`, default `10`
- `PRICER_ENRICHMENT_BATCH_SIZE`, fallback alias for pilot batch size
- `PRICER_ENRICHMENT_DRY_RUN`, default `true`
- `PRICER_ENRICHMENT_RUN_LLM`, default `false`
- `XAI_API_KEY`, required for real LLM runs and live healthcheck requests
- `XAI_GROK_ENDPOINT`, optional xAI-compatible chat completions endpoint override; default `https://api.x.ai/v1/chat/completions`
- `XAI_GROK_MODEL`, optional model override; default `grok-4-1-fast-reasoning`
- `PRICER_ENRICHMENT_ENDPOINT`, pilot-specific endpoint fallback used when `XAI_GROK_ENDPOINT` is unset
- `PRICER_ENRICHMENT_MODEL`, pilot-specific model fallback used when `XAI_GROK_MODEL` is unset

Dry-run loads only `canonical_products` and `canonical_enrichment_store`, selects a bounded candidate set, prints selected products, batch count, estimated tokens, and estimated cost, and writes nothing.

Real runs require both:

```powershell
$env:PRICER_ENRICHMENT_DRY_RUN='false'
$env:PRICER_ENRICHMENT_RUN_LLM='true'
```

Real runs update only `canonical_enrichment_store`. They cache by `canonical_product_id` plus canonical-name hash plus `canonical_semantic_v2`; existing same-version/same-name records are skipped and reported. They never apply LLM output to canonical merges.

## Cost Controls

- The selector is deterministic and bounded by `PRICER_ENRICHMENT_PILOT_LIMIT`.
- Products are batched for prompting.
- Dry-run is the default and reports estimated tokens/cost before any LLM call.
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

## Run Examples

Dry-run a small cola false-positive pilot:

```powershell
$env:PRICER_ENRICHMENT_PILOT_GROUP='cola_beverage_eval'
$env:PRICER_ENRICHMENT_PILOT_LIMIT='10'
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
