# Search Synonyms And Bulgarian Parsing

Last updated: 2026-05-03

## Synonym Layer

Phase 15 product search now has a deterministic grocery synonym module:

- `functions/src/phase15/search_synonyms.js`
- `app/functions/src/phase15/search_synonyms.js`

The module defines 101 common grocery concepts with stable IDs, Bulgarian equivalent terms, English equivalent terms, common variants, optional category hints, notes, and `related_but_not_equivalent` terms.

Synonyms are used only for query expansion and ranking. They do not merge products, rewrite canonical names, create canonical products, or change Phase 6 canonical grouping.

## Equivalent Versus Related

Equivalent terms are terms that can safely help retrieve the same product concept. Example: `milk`, `fresh milk`, `мляко`, and `прясно мляко`.

Related terms are deliberately kept out of expansion when they are close but not equivalent. Examples:

- `сирене` and `кашкавал` are related dairy concepts, but distinct.
- `зехтин`, `олио`, and `краве масло` are related fats/oils, but not equivalent.
- `прясно мляко`, `кисело мляко`, and `адаптирано мляко` are milk-related, but distinct product intents.

## Ranking Policy

Product search preserves the existing API shape and adds backward-compatible `search_debug` metadata on result items.

Ranking now prioritizes:

1. Exact normalized phrase matches.
2. All original query tokens present.
3. Equivalent phrase/token matches from synonym expansion.
4. Any-token fallback matches.

This prevents a query such as `краве масло` from being dominated by products that only contain `краве` or only contain `масло`.

Generic milk searches apply a conservative baby-formula demotion when ordinary milk/yogurt candidates exist. Explicit baby-formula searches such as `адаптирано мляко` or `baby formula` boost baby formula/toddler milk products.

Phase 15.9 adds deterministic QA aliases before any LLM calls:

- `cookies` expands to `бисквити`, `курабии`, and `сладки`.
- `snacks` expands to `снакс`, `чипс`, `солети`, `крекери`, `вафли`, and `десерт`.
- `Coca-Cola`, `coke`, and `cola` expand to `coca cola`, `coca-cola`, `кока кола`, `кока-кола`, and `кола`.
- `soft drink` expands to `безалкохолно`, `газирано`, and `газирана напитка`.

When enrichment is present, search can also rank against `product_type`, `product_family`, `category`, `subcategory`, `brand_normalized`, `flavor_terms`, `search_aliases_bg`, and `search_aliases_en`. Cola/soft-drink intent boosts beverages and demotes personal-care products with `is_personal_care=true` / `is_beverage=false`, so cola-scent shampoo should not outrank cola beverages.

## Bulgarian Parser Caveats

Phase 1/6 parsing now treats Bulgarian and Latin unit tokens as never-brand terms, including `г`, `гр`, `грам`, `грама`, `кг`, `мл`, `л`, `бр`, `брой`, and `броя`.

The parser recognizes common marker forms such as:

- `800 ГР` / `800 гр` -> `800g`
- `1,5 Л` -> `1500ml`
- `0,5 кг` -> `500g`
- `2x500 г` -> count `2`, volume/weight `500g`
- `6 бр x 330 мл` -> count `6`, volume `330ml`
- `над 24 месеца`, `6+ месеца`, `12м+`, and `над 3 години` as age-band markers

The canonical marker backfill also writes structured `size_marker` data alongside compact markers. Examples:

- `100 гр` / `100g` -> `display: "100 g"`, `quantity: 100`, `unit: "g"`
- `0,5 кг` -> `display: "500 g"`, `quantity: 500`, `unit: "g"`
- `1.5 л` -> `display: "1500 ml"`, `quantity: 1500`, `unit: "ml"`
- `2x500 г` -> `display: "2 pcs x 500 g / total 1000 g"`, `pack_count: 2`, `unit_quantity: 500`, `total_quantity: 1000`
- `6 бр x 330 мл` -> `display: "6 pcs x 330 ml / total 1980 ml"`, `pack_count: 6`, `unit_quantity: 330`, `total_quantity: 1980`

Bare decimal size inference is conservative: it is kept for beverage/alcohol contexts such as `White wine reserve 0,750`, but price-like decimals without size context are not normalized.

Baby formula/toddler milk hints currently include `APTAMIL`, `Аптамил`, `Pronutra`, `адаптирано мляко`, `бебешко мляко`, `follow-on milk`, and `toddler milk`. These hints improve product type and ranking only; they do not perform unsafe product merging.

## Production Data Note

Search ranking changes affect the live backend once deployed because they run at read time.

Parser marker and brand fixes affect newly generated canonical records automatically. Existing production canonical records can now be refreshed with the canonical-only backfill:

```powershell
$env:PRICER_FIRESTORE_PROJECT_ID='pricer-ee440'
$env:PRICER_FIRESTORE_DATABASE_ID='(default)'
$env:PRICER_FIRESTORE_COLLECTION_PREFIX='prod'
$env:PRICER_BACKFILL_DRY_RUN='true'
npm run phase6:backfill-canonical-markers
```

Run a dry-run first and inspect examples before approving `PRICER_BACKFILL_DRY_RUN=false`. This backfill does not touch raw snapshots, source products, current offers, daily prices, or canonical mappings. A full Phase 6 ingest/publisher is still needed when raw source rows, source-product identity, canonical grouping, mappings, offer read models, or price/history collections need to be regenerated.

The focused semantic enrichment pilot is separate from the marker backfill:

```powershell
$env:PRICER_ENRICHMENT_PILOT_QUERY='cola'
$env:PRICER_ENRICHMENT_DRY_RUN='true'
npm run phase15:enrichment-pilot
```

It selects only bounded candidate products for the pilot families, reports estimated tokens/cost, and writes nothing by default. Real LLM writes require both `PRICER_ENRICHMENT_DRY_RUN=false` and `PRICER_ENRICHMENT_RUN_LLM=true`; those writes are limited to `canonical_enrichment_store`.
