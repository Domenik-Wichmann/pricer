# Diet + Attribute Normalization

Last updated: 2026-04-26

Phase 15.6 adds a deterministic guard for explicit diet and product-claim tags in canonical enrichment. Phase 15.7 expands the reviewed alias set. The guard supports Bulgarian, English, German, Turkish, Russian, Ukrainian, Dutch, and Spanish terminology and runs alongside LLM enrichment without changing canonical product identity or grouping.

## Explicit-Only Rule

Tags are extracted only when an alias is explicitly present in the product name or source text used for canonical enrichment. The extractor must not infer claims from category, product family, ingredient category, or retailer grouping alone.

Examples:
- `Био веган шоколад без глутен` -> `diet_tags: ["vegan"]`, `attributes: ["organic", "gluten_free"]`
- `Bio vegan Schokolade glutenfrei` -> `diet_tags: ["vegan"]`, `attributes: ["organic", "gluten_free"]`
- `organik glutensiz laktozsuz` -> `attributes: ["organic", "gluten_free", "lactose_free"]`
- `органик без сахара` -> `attributes: ["organic", "sugar_free"]`
- `без глютену веганський` -> `diet_tags: ["vegan"]`, `attributes: ["gluten_free"]`
- `biologisch glutenvrij` -> `attributes: ["organic", "gluten_free"]`
- `sin azúcar añadido integral` -> `attributes: ["no_added_sugar", "wholegrain"]`
- `Chocolate category dairy snacks` -> no diet or claim tags
- `Plain tofu protein snack` -> no vegan claim, because `tofu` is not enough evidence
- `Natural low sugar snack` -> no organic or sugar-free claim

## Controlled Vocabulary

`diet_tags`:
- `vegan`
- `vegetarian`

`attributes`:
- `organic`
- `gluten_free`
- `lactose_free`
- `sugar_free`
- `low_fat`
- `high_protein`
- `plant_based`
- `halal`
- `kosher`
- `no_added_sugar`
- `wholegrain`

Aliases include reviewed variants from BG/EN/DE/TR/RU/UK/NL/ES such as:
- `organic`: `organic`, `bio`, `biological`, `био`, `біо`, `biologisch`, `organik`, `органик`, `органік`, `organisch`, `orgánico`, `ecológico`
- `vegan`: `vegan`, `веган`, `вегански`, `веганский`, `веганський`, `veganisch`, `veganistisch`, `vegano`, `vegana`
- `vegetarian`: `vegetarian`, `вегетариански`, `вегетарианский`, `вегетаріанський`, `vegetarisch`, `vejetaryen`, `vegetariano`, `vegetariana`
- `gluten_free`: `gluten free`, `gluten-free`, `без глутен`, `без глютена`, `без глютену`, `glutenfrei`, `glutensiz`, `gluten içermez`, `glutenvrij`, `sin gluten`
- `lactose_free`: `lactose free`, `lactose-free`, `без лактоза`, `без лактозы`, `без лактози`, `laktosefrei`, `laktozsuz`, `lactosevrij`, `sin lactosa`
- `sugar_free`: `sugar free`, `sugar-free`, `без захар`, `без сахара`, `без цукру`, `zuckerfrei`, `şekersiz`, `suikervrij`, `sin azúcar`
- `no_added_sugar`: `no added sugar`, `ohne zuckerzusatz`, `без добавена захар`, `без добавленного сахара`, `без доданого цукру`, `ilave şekersiz`, `zonder toegevoegde suiker`, `sin azúcar añadido`
- `low_fat`: `low fat`, `low-fat`, `нискомаслен`, `обезжиренный`, `знежирений`, `fettarm`, `az yağlı`, `vetarm`, `bajo en grasa`
- `high_protein`: `high protein`, `high-protein`, `високо протеинов`, `высокобелковый`, `високобілковий`, `proteinreich`, `yüksek proteinli`, `eiwitrijk`, `alto en proteína`
- `plant_based`: `plant based`, `plant-based`, `на растителна основа`, `на растительной основе`, `на рослинній основі`, `pflanzlich`, `bitkisel bazlı`, `plantaardig`, `de origen vegetal`
- `halal`: `halal`, `helal`, `халал`, `халяль`
- `kosher`: `kosher`, `кошер`, `кошерный`, `кошерний`, `koşer`, `koosjer`, `casher`
- `wholegrain`: `wholegrain`, `whole grain`, `пълнозърнест`, `цельнозерновой`, `цільнозерновий`, `vollkorn`, `tam tahıllı`, `volkoren`, `integral`

## Runtime Behavior

- `extractExplicitDietAndAttributeTags(text)` returns normalized `diet_tags`, `attributes`, and evidence entries with the matched source text.
- LLM-provided synonyms such as `bio`, `gluten free`, `glutenvrij`, `organik`, `без сахара`, and `sin lactosa` normalize into controlled values during `validateEnrichmentResponse(...)`.
- Unknown/unmapped diet or claim attributes are ignored by the normalization pass.
- Explicit deterministic claims are merged into the validated enrichment before writing `canonical_enrichment_store`.
- Duplicate claims are deduped.
- Evidence is stored on the enrichment record as `explicit_claim_evidence`, outside the strict `enrichment` payload, so the enrichment schema remains closed.
- Existing enrichment filters for `diet_tags` and controlled claim `attributes` continue to work because readers already filter the normalized arrays.

## Downstream Impact

Normalized tags improve:
- product search and app-facing filters
- saved-list and basket product matching signals
- gap detection rollups
- market intelligence and merchant insight categories

## Limitations

This layer recognizes only explicit surface aliases. It does not parse nutrition facts, ingredient lists, allergen tables, certifications, or package images. It also does not infer vegan, organic, gluten-free, or similar claims from category membership.

Future expansion should add reviewed aliases for Romanian, Serbian/Croatian, Greek, French, Italian, Polish, Arabic, and Hebrew, preferably with tests for word-boundary behavior and false positives.
