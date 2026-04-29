# CRITICAL INGEST RULES FOR ALL FUTURE DATA SOURCES

Before designing or implementing Postgres ingestion, treat these as mandatory system principles.

## 1. Deduplication comes first

For every data source ingest, the first priority is:

```text
faithful raw import → deterministic identity → reliable dedupe → only then enrichment
```

Do not enrich first.

Every source row/entity must be checked against existing known entities before creating new canonical records.

This applies to:

* products
* packaged products
* ingredients
* recipes
* components
* nutrition source foods
* aliases
* external IDs
* mappings

## 2. Preserve raw source truth

For every import:

* store the raw source record or raw-file reference
* store source name/version
* store import batch ID
* store original source IDs
* store original names/text/units
* never overwrite raw truth with enriched truth

## 3. Net-new entities trigger enrichment

LLM enrichment should happen only for **net-new canonical or candidate entities**, not for every repeated source row.

Example:

```text
source says: apple
↓
normalize/dedupe
↓
does ingredient_apple already exist?
↓
yes → link to existing ingredient
↓
no → create candidate ingredient → enrich once → cache result → review if needed
```

Same principle for:

* products
* ingredients
* recipes
* components
* aliases
* external food records

## 4. Do not LLM-enrich huge fact tables

Do not send high-volume factual rows like individual USDA nutrient records to an LLM.

Instead:

* import factual data deterministically
* aggregate/select useful facts
* enrich only entity-level concepts when useful

Examples:

```text
DO enrich:
- apple as an ingredient concept
- a packaged product as a product concept
- a recipe as a recipe concept
- salsa as a component concept

DO NOT enrich:
- every nutrient row
- every price snapshot
- every repeated source row
- every duplicate barcode occurrence
```

## 5. Enrichment must be cached and reusable

Any LLM enrichment must be:

* stored
* versioned
* linked to source/canonical entity
* confidence-scored
* prompt/model tagged
* reused on later imports

Runtime should read cached enrichment only.

No core shopping, pricing, nutrition, or planning flow should require live LLM calls.

## 6. Enrichment must not mutate canonical truth directly

LLM enrichment is additive.

It may propose:

* aliases
* categories
* culinary traits
* dietary flags
* mappings
* explanations
* search terms
* recipe structure
* component detection

But uncertain or structural changes must go through deterministic validation or review/adjudication.

## 7. Search/user-facing entities require BG + EN

Anything user-facing or searchable from user input must support at least:

* Bulgarian name
* English name
* Bulgarian aliases
* English aliases

This applies to:

* products where applicable
* canonical ingredients
* recipes
* components
* techniques
* dietary tags
* cuisine tags
* search aliases
* user-facing categories

Minimum shape:

```json
{
  "name_bg": "...",
  "name_en": "...",
  "aliases_bg": [],
  "aliases_en": []
}
```

## 8. User-input search must resolve through canonical aliases

User input should not search raw third-party fields directly as runtime truth.

Runtime search should use:

* canonical IDs
* normalized aliases
* reviewed synonyms
* localized BG/EN names
* cached search terms

Raw source text can help candidate discovery, but it should not become the final runtime search layer without normalization.

## 9. Ingest pipeline order

Every source ingest should follow this general order:

```text
1. raw import
2. source row identity
3. deterministic normalization
4. source-level dedupe
5. canonical candidate matching
6. existing canonical link if matched
7. net-new candidate creation if unmatched
8. LLM enrichment only for net-new/enrichment-missing entities
9. confidence scoring
10. review/adjudication if needed
11. publish runtime-safe read model
```

## 10. Required Codex analysis

When proposing DB0/Postgres architecture, explicitly answer:

1. Where does raw import happen?
2. Where does dedupe happen?
3. What is the deterministic identity key for each source type?
4. What counts as net-new?
5. What gets enriched?
6. What does not get enriched?
7. Where is enrichment cached?
8. How are enriched records linked back to source/canonical records?
9. What needs human review?
10. Which runtime read models are published after ingest?
11. Which entities require BG/EN names and aliases?
12. How do we prevent duplicate enrichment costs?
13. How do we keep LLM output additive rather than canonical mutation?

These rules must be reflected in the architecture, schemas, import jobs, and future implementation phases.
