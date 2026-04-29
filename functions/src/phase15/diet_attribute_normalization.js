const DIET_TAG_VOCABULARY = Object.freeze({
  vegan: Object.freeze([
    'vegan',
    'vegan food',
    'vegan product',
    'veganisch',
    'veganistisch',
    'vegano',
    'vegana',
    'веган',
    'вегански',
    'веганска',
    'веганско',
    'веганский',
    'веганская',
    'веганское',
    'веганський',
    'веганська',
    'веганське',
  ]),
  vegetarian: Object.freeze([
    'vegetarian',
    'vegetarian food',
    'vegetarian product',
    'vegetarisch',
    'vejetaryen',
    'vegetariano',
    'vegetariana',
    'вегетариански',
    'вегетарианска',
    'вегетарианско',
    'вегетарианский',
    'вегетарианская',
    'вегетарианское',
    'вегетаріанський',
    'вегетаріанська',
    'вегетаріанське',
  ]),
});

const ATTRIBUTE_VOCABULARY = Object.freeze({
  organic: Object.freeze([
    'organic',
    'bio',
    'biological',
    'biologic',
    'biologisch',
    'organik',
    'органик',
    'органік',
    'organisch',
    'orgánico',
    'organico',
    'ecológico',
    'ecologico',
    'био',
    'біо',
    'биологичен',
    'биологична',
    'биологично',
    'биологически',
    'биологический',
    'биологическая',
    'биологическое',
    'біологічний',
    'біологічна',
    'біологічне',
  ]),
  gluten_free: Object.freeze([
    'gluten free',
    'gluten-free',
    'glutenfrei',
    'glutensiz',
    'gluten içermez',
    'gluten icermez',
    'glutenvrij',
    'sin gluten',
    'libre de gluten',
    'без глутен',
    'без глютена',
    'не содержит глютен',
    'не содержит глютена',
    'без глютену',
    'не містить глютен',
    'не містить глютену',
  ]),
  lactose_free: Object.freeze([
    'lactose free',
    'lactose-free',
    'laktosefrei',
    'laktozsuz',
    'laktoz içermez',
    'laktoz icermez',
    'lactosevrij',
    'sin lactosa',
    'libre de lactosa',
    'без лактоза',
    'без лактозы',
    'не содержит лактозу',
    'не содержит лактозы',
    'без лактози',
    'не містить лактозу',
    'не містить лактози',
  ]),
  sugar_free: Object.freeze([
    'sugar free',
    'sugar-free',
    'zuckerfrei',
    'şekersiz',
    'sekersiz',
    'şeker içermez',
    'seker icermez',
    'suikervrij',
    'zonder suiker',
    'sin azúcar',
    'sin azucar',
    'libre de azúcar',
    'libre de azucar',
    'без захар',
    'без сахара',
    'не содержит сахара',
    'без цукру',
    'не містить цукру',
  ]),
  low_fat: Object.freeze([
    'low fat',
    'low-fat',
    'fat free',
    'fettarm',
    'az yağlı',
    'az yagli',
    'düşük yağlı',
    'dusuk yagli',
    'vetarm',
    'mager',
    'bajo en grasa',
    'baja en grasa',
    'desnatado',
    'desnatada',
    'нискомаслен',
    'нискомаслена',
    'нискомаслено',
    'обезжиренный',
    'обезжиренная',
    'низкой жирности',
    'с низким содержанием жира',
    'знежирений',
    'знежирена',
    'низької жирності',
    'з низьким вмістом жиру',
  ]),
  high_protein: Object.freeze([
    'high protein',
    'high-protein',
    'protein rich',
    'protein-rich',
    'proteinreich',
    'yüksek proteinli',
    'yuksek proteinli',
    'protein yüksek',
    'protein yuksek',
    'eiwitrijk',
    'hoog eiwit',
    'hoog proteïne',
    'hoog proteine',
    'alto en proteína',
    'alto en proteina',
    'alta en proteína',
    'alta en proteina',
    'високо протеинов',
    'високопротеинов',
    'високо протеинова',
    'високопротеинова',
    'високо протеиново',
    'високопротеиново',
    'высокобелковый',
    'высокобелковая',
    'с высоким содержанием белка',
    'високобілковий',
    'високобілкова',
    'з високим вмістом білка',
  ]),
  plant_based: Object.freeze([
    'plant based',
    'plant-based',
    'pflanzlich',
    'bitkisel bazlı',
    'bitkisel bazli',
    'bitki bazlı',
    'bitki bazli',
    'plantaardig',
    'op plantaardige basis',
    'de origen vegetal',
    'a base de plantas',
    'vegetal',
    'растителен',
    'растителна',
    'растително',
    'на растителна основа',
    'растительный',
    'растительная',
    'на растительной основе',
    'рослинний',
    'рослинна',
    'на рослинній основі',
  ]),
  halal: Object.freeze([
    'halal',
    'helal',
    'халал',
    'халяль',
  ]),
  kosher: Object.freeze([
    'kosher',
    'koşer',
    'koser',
    'koosjer',
    'casher',
    'кошер',
    'кошерный',
    'кошерная',
    'кошерное',
    'кошерний',
    'кошерна',
    'кошерне',
  ]),
  no_added_sugar: Object.freeze([
    'no added sugar',
    'without added sugar',
    'ohne zuckerzusatz',
    'ilave şekersiz',
    'ilave sekersiz',
    'şeker ilavesiz',
    'seker ilavesiz',
    'zonder toegevoegde suiker',
    'geen toegevoegde suiker',
    'sin azúcar añadido',
    'sin azucar anadido',
    'sin azúcares añadidos',
    'sin azucares anadidos',
    'без добавена захар',
    'без добавленного сахара',
    'без добавления сахара',
    'без доданого цукру',
    'без додавання цукру',
  ]),
  wholegrain: Object.freeze([
    'wholegrain',
    'whole grain',
    'vollkorn',
    'tam tahıllı',
    'tam tahilli',
    'tam buğday',
    'tam bugday',
    'volkoren',
    'integral',
    'grano entero',
    'cereal integral',
    'пълнозърнест',
    'пълнозърнеста',
    'пълнозърнесто',
    'цельнозерновой',
    'цельнозерновая',
    'из цельного зерна',
    'цільнозерновий',
    'цільнозернова',
    'з цільного зерна',
  ]),
});

const VOCABULARY_ENTRIES = Object.freeze([
  ...Object.entries(DIET_TAG_VOCABULARY).map(([tag, aliases]) => ({
    field: 'diet_tags',
    tag,
    aliases,
  })),
  ...Object.entries(ATTRIBUTE_VOCABULARY).map(([tag, aliases]) => ({
    field: 'attributes',
    tag,
    aliases,
  })),
]);

const TAG_TO_FIELD = Object.freeze(Object.fromEntries(
  VOCABULARY_ENTRIES.map((entry) => [entry.tag, entry.field])
));

const ALIAS_LOOKUP = Object.freeze(buildAliasLookup());

function extractExplicitDietAndAttributeTags(text) {
  const sourceText = typeof text === 'string' ? text : '';
  const result = {
    diet_tags: [],
    attributes: [],
    evidence: [],
  };
  if (!sourceText.trim()) {
    return result;
  }

  const seenDietTags = new Set();
  const seenAttributes = new Set();
  const seenEvidence = new Set();

  VOCABULARY_ENTRIES.forEach((entry) => {
    entry.aliases.forEach((alias) => {
      const pattern = buildAliasPattern(alias);
      let match = pattern.exec(sourceText);
      while (match) {
        const matchedText = match[1];
        addTag(result, entry.field, entry.tag, entry.field === 'diet_tags' ? seenDietTags : seenAttributes);
        const evidenceKey = `${entry.tag}\u0000${matchedText}`;
        if (!seenEvidence.has(evidenceKey)) {
          seenEvidence.add(evidenceKey);
          result.evidence.push({
            tag: entry.tag,
            matched_text: matchedText,
          });
        }
        match = pattern.exec(sourceText);
      }
    });
  });

  return result;
}

function normalizeDietAndAttributeTags({
  dietTags = [],
  attributes = [],
} = {}) {
  return {
    diet_tags: normalizeControlledArray(dietTags, 'diet_tags'),
    attributes: normalizeControlledArray(attributes, 'attributes'),
  };
}

function mergeDietAndAttributeClaims(enrichment, explicitClaims) {
  const normalized = normalizeDietAndAttributeTags({
    dietTags: enrichment?.diet_tags || [],
    attributes: enrichment?.attributes || [],
  });
  const explicit = explicitClaims || {};

  return {
    ...enrichment,
    diet_tags: mergeArrays(normalized.diet_tags, explicit.diet_tags || []),
    attributes: mergeArrays(normalized.attributes, explicit.attributes || []),
  };
}

function normalizeControlledArray(values, field) {
  const allowedField = field === 'diet_tags' ? 'diet_tags' : 'attributes';
  const seen = new Set();
  const normalized = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const tag = normalizeDietOrAttributeTag(value, allowedField);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      normalized.push(tag);
    }
  });
  return normalized;
}

function normalizeDietOrAttributeTag(value, field = null) {
  const normalized = normalizeAlias(value);
  if (!normalized) {
    return null;
  }

  const directField = TAG_TO_FIELD[normalized];
  if (directField && (!field || directField === field)) {
    return normalized;
  }

  const mapped = ALIAS_LOOKUP[normalized] || null;
  if (!mapped) {
    return null;
  }
  if (field && mapped.field !== field) {
    return null;
  }

  return mapped.tag;
}

function mergeArrays(...arrays) {
  const seen = new Set();
  const merged = [];
  arrays.flat().forEach((entry) => {
    if (typeof entry !== 'string') {
      return;
    }
    const value = entry.trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      merged.push(value);
    }
  });
  return merged;
}

function buildAliasLookup() {
  const lookup = {};
  VOCABULARY_ENTRIES.forEach((entry) => {
    lookup[entry.tag] = {
      field: entry.field,
      tag: entry.tag,
    };
    entry.aliases.forEach((alias) => {
      lookup[normalizeAlias(alias)] = {
        field: entry.field,
        tag: entry.tag,
      };
    });
  });
  return lookup;
}

function buildAliasPattern(alias) {
  const escaped = alias.trim().split(/[\s-]+/u).map(escapeRegExp).join('[\\s-]+');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, 'giu');
}

function normalizeAlias(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ');
}

function addTag(result, field, tag, seen) {
  if (seen.has(tag)) {
    return;
  }
  seen.add(tag);
  result[field].push(tag);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

module.exports = {
  ATTRIBUTE_VOCABULARY,
  DIET_TAG_VOCABULARY,
  extractExplicitDietAndAttributeTags,
  mergeDietAndAttributeClaims,
  normalizeDietAndAttributeTags,
  normalizeDietOrAttributeTag,
};
