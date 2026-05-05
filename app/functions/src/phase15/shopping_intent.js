const crypto = require('node:crypto');

const {
  normalizeSearchText,
  tokenizeSearchText,
} = require('../phase12/canonicalization');
const {
  normalizeOwnerContext,
  resolveOwnerContextFromRequest,
} = require('../phase17/saved_lists');

const SHOPPING_INTENT_RULES_VERSION = 'shopping_intent_v1';
const FAMILY_PREFERENCE_SOURCES = Object.freeze([
  'explicit_user_choice',
  'inferred_repeated_choices',
  'imported_profile',
]);
const FAMILY_ATTRIBUTE_INTENTS = Object.freeze([
  'required',
  'preferred',
  'optional',
]);
const DEFAULT_PREFERENCE_CONFIDENCE_THRESHOLD = 0.7;

const PRODUCT_FAMILY_DEFINITIONS = Object.freeze([
  family({
    family_id: 'yogurt',
    display_name_bg: 'кисело мляко',
    display_name_en: 'yogurt',
    aliases_bg: ['кисело мляко', 'йогурт'],
    aliases_en: ['yogurt', 'yoghurt'],
    attributes: [
      attribute('style', 'вид', 'style', 'required', 10, [
        value('plain', 'обикновено', 'plain', ['natural yogurt']),
        value('greek', 'гръцко', 'Greek', ['greek yogurt']),
        value('drinkable', 'питейно', 'drinkable', ['ayran', 'drinkable yogurt']),
        value('flavored', 'плодово', 'flavored', ['fruit yogurt']),
      ]),
      attribute('fat_percent', 'масленост', 'fat percent', 'preferred', 20, [
        value('0_1', '0.1%', '0.1%', ['skim']),
        value('2', '2%', '2%', ['low fat']),
        value('3_6', '3.6%', '3.6%', ['whole milk yogurt']),
        value('4_5', '4.5%', '4.5%', ['full fat']),
      ]),
      attribute('size', 'размер', 'size', 'preferred', 30, [
        value('400g', '400 г', '400g', ['400 g']),
        value('500g', '500 г', '500g', ['500 g']),
        value('1kg', '1 кг', '1kg', ['1000g']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 40, []),
    ],
  }),
  family({
    family_id: 'milk',
    display_name_bg: 'прясно мляко',
    display_name_en: 'milk',
    aliases_bg: ['прясно мляко', 'мляко'],
    aliases_en: ['milk', 'fresh milk'],
    attributes: [
      attribute('kind', 'вид', 'kind', 'required', 10, [
        value('cow', 'краве', 'cow', ['cow milk']),
        value('goat', 'козе', 'goat', ['goat milk']),
        value('plant_based', 'растително', 'plant-based', ['oat milk', 'soy milk', 'almond milk']),
      ]),
      attribute('fat_percent', 'масленост', 'fat percent', 'preferred', 20, [
        value('0_1', '0.1%', '0.1%', ['skim']),
        value('1_5', '1.5%', '1.5%', ['low fat']),
        value('3', '3%', '3%', ['whole milk']),
        value('3_6', '3.6%', '3.6%', ['full fat']),
      ]),
      attribute('size', 'размер', 'size', 'preferred', 30, [
        value('1l', '1 л', '1L', ['1 l', '1000ml']),
        value('500ml', '500 мл', '500ml', ['0.5l']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 40, []),
    ],
  }),
  family({
    family_id: 'bread',
    display_name_bg: 'хляб',
    display_name_en: 'bread',
    aliases_bg: ['хляб'],
    aliases_en: ['bread'],
    attributes: [
      attribute('type', 'вид', 'type', 'required', 10, [
        value('white', 'бял', 'white', ['white bread']),
        value('wholegrain', 'пълнозърнест', 'wholegrain', ['whole grain', 'whole wheat']),
        value('rye', 'ръжен', 'rye', ['rye bread']),
        value('toast', 'тостерен', 'toast', ['toast bread']),
        value('sliced', 'нарязан', 'sliced', ['sliced bread']),
      ]),
      attribute('size', 'размер', 'size', 'preferred', 20, [
        value('500g', '500 г', '500g', ['500 g']),
        value('650g', '650 г', '650g', ['650 g']),
        value('700g', '700 г', '700g', ['700 g']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 30, []),
    ],
  }),
  family({
    family_id: 'sirene',
    display_name_bg: 'сирене',
    display_name_en: 'sirene / white brined cheese',
    aliases_bg: ['сирене', 'бяло сирене'],
    aliases_en: ['sirene', 'white cheese', 'brined cheese', 'cheese'],
    attributes: [
      attribute('milk_type', 'мляко', 'milk type', 'preferred', 10, [
        value('cow', 'краве', 'cow', ['cow cheese']),
        value('sheep', 'овче', 'sheep', ['sheep cheese']),
        value('goat', 'козе', 'goat', ['goat cheese']),
        value('mixed', 'смес', 'mixed', ['mixed milk']),
      ]),
      attribute('package', 'опаковка', 'package', 'preferred', 20, [
        value('vacuum', 'вакуум', 'vacuum', ['vacuum pack']),
        value('tin', 'кутия', 'tin', ['can']),
        value('bulk', 'насипно', 'bulk', ['loose']),
      ]),
      attribute('size', 'размер', 'size', 'preferred', 30, [
        value('400g', '400 г', '400g', ['400 g']),
        value('800g', '800 г', '800g', ['800 g']),
        value('1kg', '1 кг', '1kg', ['1000g']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 40, []),
    ],
  }),
  family({
    family_id: 'kashkaval',
    display_name_bg: 'кашкавал',
    display_name_en: 'kashkaval / yellow cheese',
    aliases_bg: ['кашкавал'],
    aliases_en: ['kashkaval', 'yellow cheese', 'cheese'],
    attributes: [
      attribute('milk_type', 'мляко', 'milk type', 'preferred', 10, [
        value('cow', 'краве', 'cow', ['cow kashkaval']),
        value('sheep', 'овче', 'sheep', ['sheep kashkaval']),
        value('mixed', 'смес', 'mixed', ['mixed milk']),
      ]),
      attribute('package', 'опаковка', 'package', 'preferred', 20, [
        value('block', 'пита/парче', 'block', ['piece']),
        value('sliced', 'слайс', 'sliced', ['slices']),
        value('grated', 'настърган', 'grated', ['shredded']),
      ]),
      attribute('size', 'размер', 'size', 'preferred', 30, [
        value('250g', '250 г', '250g', ['250 g']),
        value('400g', '400 г', '400g', ['400 g']),
        value('1kg', '1 кг', '1kg', ['1000g']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 40, []),
    ],
  }),
  family({
    family_id: 'cream_cheese',
    display_name_bg: 'крема сирене',
    display_name_en: 'cream cheese',
    aliases_bg: ['крема сирене', 'крем сирене'],
    aliases_en: ['cream cheese', 'cheese spread', 'cheese'],
    attributes: [
      attribute('style', 'вид', 'style', 'required', 10, [
        value('plain', 'натурално', 'plain', ['classic']),
        value('herb', 'с билки', 'herb', ['herbs']),
        value('light', 'леко', 'light', ['low fat']),
      ]),
      attribute('size', 'размер', 'size', 'preferred', 20, [
        value('125g', '125 г', '125g', ['125 g']),
        value('200g', '200 г', '200g', ['200 g']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 30, []),
    ],
  }),
  family({
    family_id: 'juice',
    display_name_bg: 'сок',
    display_name_en: 'juice',
    aliases_bg: ['сок', 'плодов сок'],
    aliases_en: ['juice', 'fruit juice'],
    attributes: [
      attribute('flavor', 'вкус', 'flavor', 'required', 10, [
        value('orange', 'портокал', 'orange', ['orange juice']),
        value('apple', 'ябълка', 'apple', ['apple juice']),
        value('multifruit', 'мултивитамин', 'multifruit', ['multi fruit']),
        value('cherry', 'вишна/череша', 'cherry', ['sour cherry']),
        value('grape', 'грозде', 'grape', ['grape juice']),
      ]),
      attribute('sugar', 'захар', 'sugar', 'preferred', 20, [
        value('regular', 'обикновен', 'regular', ['sweetened']),
        value('no_added_sugar', 'без добавена захар', 'no added sugar', ['no sugar added']),
      ]),
      attribute('size', 'размер', 'size', 'preferred', 30, [
        value('1l', '1 л', '1L', ['1 l', '1000ml']),
        value('250ml', '250 мл', '250ml', ['0.25l']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 40, []),
    ],
  }),
  family({
    family_id: 'coffee',
    display_name_bg: 'кафе',
    display_name_en: 'coffee',
    aliases_bg: ['кафе'],
    aliases_en: ['coffee'],
    attributes: [
      attribute('form', 'форма', 'form', 'required', 10, [
        value('beans', 'на зърна', 'beans', ['whole bean']),
        value('ground', 'мляно', 'ground', ['ground coffee']),
        value('instant', 'разтворимо', 'instant', ['soluble']),
        value('capsules', 'капсули', 'capsules', ['pods']),
      ]),
      attribute('roast', 'изпичане', 'roast', 'preferred', 20, [
        value('light', 'светло', 'light', []),
        value('medium', 'средно', 'medium', []),
        value('dark', 'тъмно', 'dark', []),
      ]),
      attribute('size', 'размер', 'size', 'preferred', 30, [
        value('250g', '250 г', '250g', ['250 g']),
        value('1kg', '1 кг', '1kg', ['1000g']),
        value('10_capsules', '10 капсули', '10 capsules', ['10 pods']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 40, []),
    ],
  }),
  family({
    family_id: 'rice',
    display_name_bg: 'ориз',
    display_name_en: 'rice',
    aliases_bg: ['ориз'],
    aliases_en: ['rice'],
    attributes: [
      attribute('type', 'вид', 'type', 'required', 10, [
        value('white', 'бял', 'white', ['white rice']),
        value('brown', 'кафяв', 'brown', ['brown rice']),
        value('basmati', 'басмати', 'basmati', []),
        value('jasmine', 'жасмин', 'jasmine', []),
        value('risotto', 'ризото', 'risotto', ['arborio']),
      ]),
      attribute('size', 'размер', 'size', 'preferred', 20, [
        value('500g', '500 г', '500g', ['500 g']),
        value('1kg', '1 кг', '1kg', ['1000g']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 30, []),
    ],
  }),
  family({
    family_id: 'pasta',
    display_name_bg: 'паста',
    display_name_en: 'pasta',
    aliases_bg: ['паста', 'макарони', 'спагети'],
    aliases_en: ['pasta', 'macaroni', 'spaghetti'],
    attributes: [
      attribute('shape', 'форма', 'shape', 'required', 10, [
        value('spaghetti', 'спагети', 'spaghetti', []),
        value('penne', 'пене', 'penne', []),
        value('fusilli', 'фусили', 'fusilli', []),
        value('macaroni', 'макарони', 'macaroni', []),
      ]),
      attribute('grain', 'състав', 'grain', 'preferred', 20, [
        value('regular', 'обикновена', 'regular', ['wheat']),
        value('wholegrain', 'пълнозърнеста', 'wholegrain', ['whole wheat']),
        value('gluten_free', 'без глутен', 'gluten-free', ['gluten free']),
      ]),
      attribute('size', 'размер', 'size', 'preferred', 30, [
        value('400g', '400 г', '400g', ['400 g']),
        value('500g', '500 г', '500g', ['500 g']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 40, []),
    ],
  }),
  family({
    family_id: 'oil',
    display_name_bg: 'олио',
    display_name_en: 'oil',
    aliases_bg: ['олио', 'зехтин', 'масло за готвене'],
    aliases_en: ['oil', 'cooking oil', 'olive oil', 'sunflower oil'],
    attributes: [
      attribute('type', 'вид', 'type', 'required', 10, [
        value('sunflower', 'слънчогледово', 'sunflower', ['sunflower oil']),
        value('olive', 'зехтин', 'olive', ['olive oil']),
        value('rapeseed', 'рапица', 'rapeseed', ['canola']),
      ]),
      attribute('quality', 'качество', 'quality', 'preferred', 20, [
        value('regular', 'обикновено', 'regular', []),
        value('extra_virgin', 'екстра върджин', 'extra virgin', ['extra virgin olive oil']),
        value('cold_pressed', 'студено пресовано', 'cold pressed', []),
      ]),
      attribute('size', 'размер', 'size', 'preferred', 30, [
        value('1l', '1 л', '1L', ['1 l', '1000ml']),
        value('500ml', '500 мл', '500ml', ['0.5l']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 40, []),
    ],
  }),
  family({
    family_id: 'eggs',
    display_name_bg: 'яйца',
    display_name_en: 'eggs',
    aliases_bg: ['яйца'],
    aliases_en: ['eggs', 'egg'],
    attributes: [
      attribute('count', 'брой', 'count', 'required', 10, [
        value('6', '6 бр.', '6 count', ['6 eggs']),
        value('10', '10 бр.', '10 count', ['10 eggs']),
        value('12', '12 бр.', '12 count', ['12 eggs']),
        value('30', '30 бр.', '30 count', ['30 eggs']),
      ]),
      attribute('size_class', 'размер', 'size class', 'preferred', 20, [
        value('m', 'M', 'M', ['medium']),
        value('l', 'L', 'L', ['large']),
        value('xl', 'XL', 'XL', ['extra large']),
      ]),
      attribute('production_method', 'отглеждане', 'production method', 'preferred', 30, [
        value('standard', 'стандартни', 'standard', []),
        value('free_range', 'свободно отглеждане', 'free-range', ['free range']),
        value('organic', 'био', 'organic', ['bio']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 40, []),
    ],
  }),
  family({
    family_id: 'chicken',
    display_name_bg: 'пилешко',
    display_name_en: 'chicken',
    aliases_bg: ['пилешко', 'пиле'],
    aliases_en: ['chicken'],
    attributes: [
      attribute('cut', 'разфасовка', 'cut', 'required', 10, [
        value('whole', 'цяло пиле', 'whole', ['whole chicken']),
        value('breast', 'филе/гърди', 'breast', ['chicken breast', 'fillet']),
        value('thigh', 'бут', 'thigh', ['legs', 'drumsticks']),
        value('wings', 'крилца', 'wings', ['chicken wings']),
      ]),
      attribute('state', 'състояние', 'state', 'preferred', 20, [
        value('fresh', 'охладено', 'fresh', ['chilled']),
        value('frozen', 'замразено', 'frozen', []),
      ]),
      attribute('size', 'размер', 'size', 'optional', 30, [
        value('500g', '500 г', '500g', ['500 g']),
        value('1kg', '1 кг', '1kg', ['1000g']),
      ]),
      attribute('brand', 'марка', 'brand', 'optional', 40, []),
    ],
  }),
]);

const FAMILY_BY_ID = new Map(PRODUCT_FAMILY_DEFINITIONS.map((entry) => [entry.family_id, entry]));

async function handleResolveShoppingIntentRequest({
  store,
  body = {},
  req,
}) {
  const text = typeof body.term === 'string'
    ? body.term
    : body.text || body.query || body.item_text;
  const ownerContext = body.owner_context || buildOwnerContextFromBody(body) || resolveOwnerContextFromRequest(req);
  const result = await resolveShoppingIntent({
    store,
    text,
    ownerContext,
    selectedFamilyId: body.family_id || body.selected_family_id,
    selectedAttributes: body.selected_attributes || body.attributes || {},
    inlinePreference: body.existing_preference || body.preference || null,
    preferenceConfidenceThreshold: body.preference_confidence_threshold,
  });
  return {
    status: result.status === 'invalid' ? 400 : 200,
    body: result.status === 'invalid' ? { error: result.error } : result,
  };
}

async function resolveShoppingIntent({
  store = null,
  text = '',
  ownerContext = {},
  selectedFamilyId = null,
  selectedAttributes = {},
  inlinePreference = null,
  preferenceConfidenceThreshold = DEFAULT_PREFERENCE_CONFIDENCE_THRESHOLD,
} = {}) {
  const inputText = typeof text === 'string' ? text.trim() : '';
  if (!inputText) {
    return {
      status: 'invalid',
      error: 'term is required',
    };
  }

  const owner = normalizeOwnerContext(ownerContext);
  const normalizedQuery = normalizeSearchText(inputText);
  const tokens = tokenizeSearchText(inputText);
  const possibleFamilies = identifyProductFamilies({
    text: inputText,
    selectedFamilyId,
  });

  if (possibleFamilies.length === 0) {
    return {
      input_text: inputText,
      normalized_query: normalizedQuery,
      status: 'unresolved',
      possible_families: [],
      selected_family: null,
      resolved_attributes: {},
      missing_attributes: [],
      clarification_questions: [],
      suggested_defaults: {},
      rules_version: SHOPPING_INTENT_RULES_VERSION,
    };
  }

  if (!selectedFamilyId && isFamilySelectionAmbiguous(possibleFamilies)) {
    return {
      input_text: inputText,
      normalized_query: normalizedQuery,
      status: 'family_ambiguous',
      possible_families: possibleFamilies,
      selected_family: null,
      resolved_attributes: {},
      missing_attributes: [],
      clarification_questions: [buildFamilyClarificationQuestion(possibleFamilies)],
      suggested_defaults: {},
      rules_version: SHOPPING_INTENT_RULES_VERSION,
    };
  }

  const selectedFamily = selectedFamilyId
    ? FAMILY_BY_ID.get(selectedFamilyId)
    : FAMILY_BY_ID.get(possibleFamilies[0].family_id);
  if (!selectedFamily) {
    return {
      status: 'invalid',
      error: 'unknown family_id',
    };
  }

  const persistedPreference = store
    ? await loadUserProductFamilyPreference({
      store,
      ownerContext: owner,
      familyId: selectedFamily.family_id,
    })
    : null;
  const normalizedInlinePreference = normalizeInlinePreference({
    ownerContext: owner,
    familyId: selectedFamily.family_id,
    preference: inlinePreference,
  });
  const effectivePreference = normalizedInlinePreference || persistedPreference;
  const inferredFromText = inferAttributesFromText({
    family: selectedFamily,
    text: inputText,
    tokens,
  });
  const normalizedSelectedAttributes = normalizeSelectedAttributes({
    family: selectedFamily,
    attributes: {
      ...inferredFromText,
      ...selectedAttributes,
    },
  });
  const suggestedDefaults = buildSuggestedDefaults({
    family: selectedFamily,
    preference: effectivePreference,
    confidenceThreshold: preferenceConfidenceThreshold,
  });
  const missingAttributes = buildMissingAttributes({
    family: selectedFamily,
    selectedAttributes: normalizedSelectedAttributes,
    suggestedDefaults,
  });
  const clarificationQuestions = missingAttributes
    .filter((entry) => !entry.suggested_default)
    .map((entry) => buildAttributeClarificationQuestion({
      family: selectedFamily,
      missingAttribute: entry,
    }));

  return {
    input_text: inputText,
    normalized_query: normalizedQuery,
    status: clarificationQuestions.length > 0 ? 'needs_clarification' : 'ready_for_product_selection',
    possible_families: possibleFamilies,
    selected_family: buildFamilySummary(selectedFamily),
    resolved_attributes: normalizedSelectedAttributes,
    missing_attributes: missingAttributes,
    clarification_questions: clarificationQuestions,
    suggested_defaults: suggestedDefaults,
    preference: effectivePreference ? buildPreferenceSummary(effectivePreference) : null,
    preference_record: effectivePreference ? clone(effectivePreference) : null,
    rules_version: SHOPPING_INTENT_RULES_VERSION,
  };
}

function identifyProductFamilies({
  text,
  selectedFamilyId = null,
} = {}) {
  if (selectedFamilyId) {
    const familyDefinition = FAMILY_BY_ID.get(selectedFamilyId);
    return familyDefinition ? [buildFamilyMatch(familyDefinition, 1, ['selected_family_id'])] : [];
  }

  const normalized = normalizeSearchText(text);
  const tokens = tokenizeSearchText(text);
  const tokenSet = new Set(tokens);
  return PRODUCT_FAMILY_DEFINITIONS
    .map((definition) => scoreFamilyMatch({
      familyDefinition: definition,
      normalized,
      tokenSet,
    }))
    .filter((match) => match.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.family_id.localeCompare(right.family_id);
    });
}

function isFamilySelectionAmbiguous(possibleFamilies) {
  if (possibleFamilies.length <= 1) {
    return false;
  }
  const [best, second] = possibleFamilies;
  return (best.score - second.score) < 0.4;
}

async function upsertUserProductFamilyPreference({
  store,
  ownerContext,
  preference,
  updatedAt = new Date().toISOString(),
}) {
  requireStore(store);
  const normalized = normalizeUserProductFamilyPreference({
    ownerContext,
    preference,
    updatedAt,
  });
  if (normalized.error) {
    return normalized.error;
  }

  const existing = await loadUserProductFamilyPreference({
    store,
    ownerContext: normalized.value,
    familyId: normalized.value.family_id,
  });
  const record = {
    ...normalized.value,
    created_at: existing?.created_at || normalized.value.updated_at,
  };
  await upsertPreferenceRecord(store, record);
  return {
    status: 200,
    body: {
      preference: clone(record),
    },
  };
}

async function listUserProductFamilyPreferences({
  store,
  ownerContext,
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  const rows = await loadPreferencesForOwner(store, owner);
  return rows
    .filter((row) => canAccessPreference(owner, row))
    .sort((left, right) => String(left.family_id).localeCompare(String(right.family_id)))
    .map((row) => clone(row));
}

async function loadUserProductFamilyPreference({
  store,
  ownerContext,
  familyId,
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  const normalizedFamilyId = normalizeIdentifier(familyId);
  if (!normalizedFamilyId) {
    return null;
  }
  const preferenceId = buildUserProductFamilyPreferenceId({
    owner,
    familyId: normalizedFamilyId,
  });

  if (typeof store.queryCollection === 'function') {
    const rows = await store.queryCollection('user_product_family_preferences', {
      fieldName: 'preference_id',
      value: preferenceId,
    });
    return rows.find((row) => canAccessPreference(owner, row)) || null;
  }

  const state = await store.load();
  return (state.user_product_family_preferences || [])
    .find((row) => row.preference_id === preferenceId && canAccessPreference(owner, row)) || null;
}

function normalizeUserProductFamilyPreference({
  ownerContext,
  preference = {},
  updatedAt,
}) {
  const owner = normalizeOwnerContext(ownerContext);
  const familyId = normalizeIdentifier(preference.family_id);
  const familyDefinition = FAMILY_BY_ID.get(familyId);
  if (!familyDefinition) {
    return badRequest('unknown family_id');
  }

  const source = normalizePreferenceSource(preference.source);
  if (!source) {
    return badRequest('invalid preference source');
  }

  const confidence = normalizeConfidence(preference.confidence);
  if (confidence === null) {
    return badRequest('confidence must be between 0 and 1');
  }

  const preferredAttributes = normalizeSelectedAttributes({
    family: familyDefinition,
    attributes: preference.preferred_attributes || {},
  });
  const timestamp = normalizeTimestamp(updatedAt);
  const lastConfirmedAt = normalizeNullableTimestamp(preference.last_confirmed_at) || timestamp;
  return {
    value: {
      preference_id: buildUserProductFamilyPreferenceId({
        owner,
        familyId,
      }),
      owner_id: owner.owner_id,
      owner_type: owner.owner_type,
      family_id: familyId,
      preferred_attributes: preferredAttributes,
      preferred_brands: normalizeBrandList(preference.preferred_brands),
      avoided_brands: normalizeBrandList(preference.avoided_brands),
      confidence,
      source,
      last_confirmed_at: lastConfirmedAt,
      updated_at: timestamp,
    },
  };
}

function normalizeInlinePreference({
  ownerContext,
  familyId,
  preference,
}) {
  if (!preference || typeof preference !== 'object' || Array.isArray(preference)) {
    return null;
  }
  const normalizedFamilyId = normalizeIdentifier(preference.family_id || familyId);
  if (normalizedFamilyId !== familyId) {
    return null;
  }
  const normalized = normalizeUserProductFamilyPreference({
    ownerContext,
    preference: {
      ...preference,
      family_id: normalizedFamilyId,
      source: preference.source || 'explicit_user_choice',
      confidence: preference.confidence ?? DEFAULT_PREFERENCE_CONFIDENCE_THRESHOLD,
    },
    updatedAt: preference.updated_at || preference.last_confirmed_at || new Date().toISOString(),
  });
  return normalized.value ? normalized.value : null;
}

function buildOwnerContextFromBody(body = {}) {
  const ownerId = body.owner_id || body.user_id;
  if (!ownerId) {
    return null;
  }
  return {
    owner_id: ownerId,
    owner_type: body.owner_type || 'user',
  };
}

function scoreFamilyMatch({
  familyDefinition,
  normalized,
  tokenSet,
}) {
  const phrases = buildFamilyPhrases(familyDefinition);
  const exactPhrase = phrases.find((phrase) => phrase === normalized);
  if (exactPhrase) {
    return buildFamilyMatch(familyDefinition, 1, ['exact_family_phrase']);
  }

  const containedPhrase = phrases.find((phrase) => phrase && normalized.includes(phrase));
  if (containedPhrase) {
    return buildFamilyMatch(familyDefinition, 0.9, ['family_phrase']);
  }

  let bestTokenCoverage = 0;
  for (const phrase of phrases) {
    const phraseTokens = tokenizeSearchText(phrase);
    if (phraseTokens.length === 0) {
      continue;
    }
    const matched = phraseTokens.filter((token) => tokenSet.has(token)).length;
    bestTokenCoverage = Math.max(bestTokenCoverage, matched / phraseTokens.length);
  }

  if (bestTokenCoverage === 1) {
    return buildFamilyMatch(familyDefinition, 0.8, ['family_tokens']);
  }
  if (bestTokenCoverage > 0) {
    return buildFamilyMatch(familyDefinition, 0.35, ['partial_family_token']);
  }

  return buildFamilyMatch(familyDefinition, 0, []);
}

function buildMissingAttributes({
  family,
  selectedAttributes,
  suggestedDefaults,
}) {
  return family.attributes
    .filter((attributeDefinition) => attributeDefinition.intent !== 'optional')
    .filter((attributeDefinition) => !selectedAttributes[attributeDefinition.attribute_id])
    .sort((left, right) => left.clarification_priority - right.clarification_priority)
    .map((attributeDefinition) => ({
      attribute_id: attributeDefinition.attribute_id,
      display_name_bg: attributeDefinition.display_name_bg,
      display_name_en: attributeDefinition.display_name_en,
      intent: attributeDefinition.intent,
      clarification_priority: attributeDefinition.clarification_priority,
      suggested_default: suggestedDefaults[attributeDefinition.attribute_id] || null,
    }));
}

function buildSuggestedDefaults({
  family,
  preference,
  confidenceThreshold,
}) {
  const threshold = normalizeConfidence(confidenceThreshold) ?? DEFAULT_PREFERENCE_CONFIDENCE_THRESHOLD;
  if (!preference || normalizeConfidence(preference.confidence) < threshold) {
    return {};
  }

  const defaults = {};
  for (const [attributeId, valueId] of Object.entries(preference.preferred_attributes || {})) {
    const normalizedValue = normalizeAttributeValue({
      family,
      attributeId,
      value: valueId,
    });
    if (normalizedValue) {
      defaults[attributeId] = {
        value_id: normalizedValue.value_id,
        display_name_bg: normalizedValue.display_name_bg,
        display_name_en: normalizedValue.display_name_en,
        confidence: preference.confidence,
        source: preference.source,
        last_confirmed_at: preference.last_confirmed_at || null,
      };
    }
  }
  return defaults;
}

function inferAttributesFromText({
  family,
  text,
}) {
  const normalized = normalizeSearchText(text);
  const inferred = {};
  for (const attributeDefinition of family.attributes) {
    for (const valueDefinition of attributeDefinition.values || []) {
      const phrases = [
        valueDefinition.value_id,
        valueDefinition.display_name_bg,
        valueDefinition.display_name_en,
        ...(valueDefinition.aliases || []),
      ].map(normalizeSearchText).filter(Boolean);
      if (phrases.some((phrase) => normalized === phrase || normalized.includes(phrase))) {
        inferred[attributeDefinition.attribute_id] = valueDefinition.value_id;
        break;
      }
    }
  }
  return inferred;
}

function normalizeSelectedAttributes({
  family,
  attributes = {},
}) {
  const normalized = {};
  for (const [attributeId, rawValue] of Object.entries(attributes || {})) {
    const attributeDefinition = family.attributes.find((entry) => entry.attribute_id === attributeId);
    if (!attributeDefinition) {
      continue;
    }
    if (attributeDefinition.attribute_id === 'brand') {
      const brand = normalizeBrand(rawValue);
      if (brand) {
        normalized[attributeId] = brand;
      }
      continue;
    }

    const valueDefinition = normalizeAttributeValue({
      family,
      attributeId,
      value: rawValue,
    });
    if (valueDefinition) {
      normalized[attributeId] = valueDefinition.value_id;
    }
  }
  return normalized;
}

function normalizeAttributeValue({
  family,
  attributeId,
  value: rawValue,
}) {
  const attributeDefinition = family.attributes.find((entry) => entry.attribute_id === attributeId);
  if (!attributeDefinition) {
    return null;
  }
  const normalizedValue = normalizeSearchText(rawValue);
  return (attributeDefinition.values || []).find((valueDefinition) => {
    const phrases = [
      valueDefinition.value_id,
      valueDefinition.display_name_bg,
      valueDefinition.display_name_en,
      ...(valueDefinition.aliases || []),
    ].map(normalizeSearchText).filter(Boolean);
    return phrases.includes(normalizedValue);
  }) || null;
}

function buildAttributeClarificationQuestion({
  family,
  missingAttribute,
}) {
  const attributeDefinition = family.attributes.find(
    (entry) => entry.attribute_id === missingAttribute.attribute_id
  );
  return {
    question_id: `${family.family_id}:${missingAttribute.attribute_id}`,
    family_id: family.family_id,
    attribute_id: missingAttribute.attribute_id,
    prompt_bg: buildPrompt({
      locale: 'bg',
      family,
      attributeDefinition,
    }),
    prompt_en: buildPrompt({
      locale: 'en',
      family,
      attributeDefinition,
    }),
    intent: missingAttribute.intent,
    clarification_priority: missingAttribute.clarification_priority,
    options: (attributeDefinition?.values || []).map(buildValueSummary),
  };
}

function buildFamilyClarificationQuestion(possibleFamilies) {
  return {
    question_id: 'product_family',
    attribute_id: 'family_id',
    prompt_bg: 'Кой вид продукт имате предвид?',
    prompt_en: 'Which product family do you mean?',
    intent: 'required',
    clarification_priority: 0,
    options: possibleFamilies.map((entry) => ({
      family_id: entry.family_id,
      display_name_bg: entry.display_name_bg,
      display_name_en: entry.display_name_en,
      score: entry.score,
    })),
  };
}

function buildPrompt({
  locale,
  family,
  attributeDefinition,
}) {
  if (locale === 'bg') {
    return `Какъв ${attributeDefinition.display_name_bg} за ${family.display_name_bg}?`;
  }
  return `Which ${attributeDefinition.display_name_en} for ${family.display_name_en}?`;
}

function buildFamilyMatch(familyDefinition, score, reasons) {
  return {
    ...buildFamilySummary(familyDefinition),
    score: roundScore(score),
    match_reasons: reasons,
  };
}

function buildFamilySummary(familyDefinition) {
  return {
    family_id: familyDefinition.family_id,
    display_name_bg: familyDefinition.display_name_bg,
    display_name_en: familyDefinition.display_name_en,
  };
}

function buildValueSummary(valueDefinition) {
  return {
    value_id: valueDefinition.value_id,
    display_name_bg: valueDefinition.display_name_bg,
    display_name_en: valueDefinition.display_name_en,
  };
}

function buildPreferenceSummary(preference) {
  return {
    preference_id: preference.preference_id,
    family_id: preference.family_id,
    confidence: preference.confidence,
    source: preference.source,
    last_confirmed_at: preference.last_confirmed_at || null,
  };
}

function family(definition) {
  return Object.freeze({
    ...definition,
    attributes: Object.freeze(definition.attributes.map(Object.freeze)),
  });
}

function attribute(attributeId, displayNameBg, displayNameEn, intent, priority, values) {
  return {
    attribute_id: attributeId,
    display_name_bg: displayNameBg,
    display_name_en: displayNameEn,
    intent,
    clarification_priority: priority,
    values: Object.freeze(values),
  };
}

function value(valueId, displayNameBg, displayNameEn, aliases = []) {
  return Object.freeze({
    value_id: valueId,
    display_name_bg: displayNameBg,
    display_name_en: displayNameEn,
    aliases,
  });
}

function buildFamilyPhrases(familyDefinition) {
  return [
    familyDefinition.family_id,
    familyDefinition.display_name_bg,
    familyDefinition.display_name_en,
    ...(familyDefinition.aliases_bg || []),
    ...(familyDefinition.aliases_en || []),
  ].map(normalizeSearchText).filter(Boolean);
}

function buildUserProductFamilyPreferenceId({
  owner,
  familyId,
}) {
  const normalizedOwner = normalizeOwnerContext(owner);
  return `upfp_${crypto
    .createHash('sha256')
    .update(`${normalizedOwner.owner_type}|${normalizedOwner.owner_id}|${familyId}`)
    .digest('hex')
    .slice(0, 32)}`;
}

async function loadPreferencesForOwner(store, owner) {
  if (typeof store.queryCollection === 'function' && owner.owner_type !== 'system') {
    return store.queryCollection('user_product_family_preferences', {
      fieldName: 'owner_id',
      value: owner.owner_id,
    });
  }
  if (typeof store.loadCollections === 'function') {
    const state = await store.loadCollections(['user_product_family_preferences']);
    return state.user_product_family_preferences || [];
  }
  const state = await store.load();
  return state.user_product_family_preferences || [];
}

async function upsertPreferenceRecord(store, record) {
  if (typeof store.upsertRecord === 'function') {
    await store.upsertRecord('user_product_family_preferences', record);
    return;
  }
  const state = await store.load();
  state.user_product_family_preferences = Array.isArray(state.user_product_family_preferences)
    ? state.user_product_family_preferences
    : [];
  const index = state.user_product_family_preferences.findIndex(
    (entry) => entry.preference_id === record.preference_id
  );
  if (index >= 0) {
    state.user_product_family_preferences[index] = record;
  } else {
    state.user_product_family_preferences.push(record);
  }
  await store.save(state);
}

function canAccessPreference(ownerContext, preference) {
  const owner = normalizeOwnerContext(ownerContext);
  if (owner.owner_type === 'system') {
    return true;
  }
  return preference?.owner_id === owner.owner_id && preference?.owner_type === owner.owner_type;
}

function normalizePreferenceSource(value) {
  const normalized = String(value || '').trim();
  return FAMILY_PREFERENCE_SOURCES.includes(normalized) ? normalized : null;
}

function normalizeConfidence(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return null;
  }
  return Math.round(parsed * 1000) / 1000;
}

function normalizeBrandList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(normalizeBrand)
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizeBrand(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/gu, '_').replace(/^_+|_+$/gu, '');
}

function normalizeTimestamp(value) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
}

function normalizeNullableTimestamp(value) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function roundScore(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function badRequest(error) {
  return {
    error: {
      status: 400,
      body: {
        error,
      },
    },
  };
}

function requireStore(store) {
  if (!store) {
    throw new Error('store is required');
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  DEFAULT_PREFERENCE_CONFIDENCE_THRESHOLD,
  FAMILY_ATTRIBUTE_INTENTS,
  FAMILY_PREFERENCE_SOURCES,
  PRODUCT_FAMILY_DEFINITIONS,
  SHOPPING_INTENT_RULES_VERSION,
  buildUserProductFamilyPreferenceId,
  handleResolveShoppingIntentRequest,
  identifyProductFamilies,
  listUserProductFamilyPreferences,
  loadUserProductFamilyPreference,
  normalizeUserProductFamilyPreference,
  resolveShoppingIntent,
  upsertUserProductFamilyPreference,
};
