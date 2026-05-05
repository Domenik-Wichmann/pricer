const { normalizeSearchText, tokenizeSearchText } = require('../phase12/canonicalization');

const GROCERY_SYNONYM_CONCEPTS = Object.freeze([
  c('bread', ['хляб'], ['bread'], ['hlyab'], 'bakery'),
  c('white_bread', ['бял хляб'], ['white bread'], [], 'bakery'),
  c('wholegrain_bread', ['пълнозърнест хляб'], ['wholegrain bread', 'whole wheat bread'], ['пълнозърнест'], 'bakery'),
  c('rye_bread', ['ръжен хляб'], ['rye bread'], [], 'bakery'),
  c('toast_bread', ['тостерен хляб'], ['toast bread', 'sandwich bread'], ['тост хляб'], 'bakery'),
  c('banitsa', ['баница'], ['banitsa'], [], 'bakery'),
  c('pastry_sheets', ['точени кори', 'кори за баница'], ['pastry sheets', 'filo pastry'], ['фини кори'], 'bakery'),
  c('croissant', ['кроасан'], ['croissant'], [], 'bakery'),
  c('biscuits', ['бисквити', 'курабии', 'сладки'], ['biscuits', 'cookies'], ['cookie'], 'snacks'),
  c('snacks', ['снакс', 'чипс', 'солети', 'крекери', 'вафли', 'десерт'], ['snacks', 'snack'], ['chips', 'crisps', 'crackers', 'wafers', 'dessert'], 'snacks', {
    related_but_not_equivalent: ['candy', 'chocolate'],
  }),
  c('crackers', ['крекери'], ['crackers'], [], 'snacks'),
  c('milk', ['прясно мляко', 'мляко'], ['milk', 'fresh milk'], ['uht milk'], 'dairy', {
    related_but_not_equivalent: ['кисело мляко', 'адаптирано мляко', 'сухо мляко'],
  }),
  c('yogurt', ['кисело мляко'], ['yogurt', 'yoghurt'], ['kисело мляко'], 'dairy', {
    related_but_not_equivalent: ['прясно мляко', 'айрян'],
  }),
  c('butter', ['краве масло', 'масло'], ['butter', 'cow butter'], [], 'dairy', {
    related_but_not_equivalent: ['олио', 'зехтин', 'маргарин'],
  }),
  c('margarine', ['маргарин'], ['margarine'], [], 'dairy'),
  c('cream', ['сметана'], ['cream'], ['готварска сметана'], 'dairy'),
  c('sour_cream', ['заквасена сметана'], ['sour cream'], [], 'dairy'),
  c('cheese_sirene', ['сирене', 'бяло сирене'], ['sirene', 'white cheese', 'feta style cheese'], ['краве сирене'], 'dairy', {
    related_but_not_equivalent: ['кашкавал'],
  }),
  c('yellow_cheese_kashkaval', ['кашкавал'], ['kashkaval', 'yellow cheese'], ['кашкавал краве'], 'dairy', {
    related_but_not_equivalent: ['сирене'],
  }),
  c('cream_cheese', ['крема сирене'], ['cream cheese'], [], 'dairy'),
  c('processed_cheese', ['топено сирене'], ['processed cheese'], [], 'dairy'),
  c('cottage_cheese', ['извара'], ['cottage cheese', 'curd'], [], 'dairy'),
  c('eggs', ['яйца'], ['eggs'], ['egg'], 'eggs'),
  c('oil_sunflower', ['олио', 'слънчогледово олио'], ['sunflower oil', 'cooking oil'], ['oil'], 'pantry', {
    related_but_not_equivalent: ['зехтин', 'краве масло'],
  }),
  c('olive_oil', ['зехтин'], ['olive oil'], ['extra virgin olive oil'], 'pantry', {
    related_but_not_equivalent: ['олио', 'краве масло'],
  }),
  c('vinegar', ['оцет'], ['vinegar'], [], 'pantry'),
  c('salt', ['сол'], ['salt'], [], 'pantry'),
  c('sugar', ['захар'], ['sugar'], [], 'pantry'),
  c('brown_sugar', ['кафява захар'], ['brown sugar'], [], 'pantry'),
  c('flour', ['брашно'], ['flour'], [], 'pantry'),
  c('rice', ['ориз'], ['rice'], [], 'pantry'),
  c('pasta', ['паста', 'макарони'], ['pasta', 'macaroni'], ['спагети'], 'pantry'),
  c('spaghetti', ['спагети'], ['spaghetti'], [], 'pantry'),
  c('lentils', ['леща'], ['lentils'], [], 'pantry'),
  c('beans', ['боб', 'фасул'], ['beans'], [], 'pantry'),
  c('chickpeas', ['нахут'], ['chickpeas'], [], 'pantry'),
  c('cornmeal', ['царевично брашно'], ['corn flour', 'cornmeal'], [], 'pantry'),
  c('semolina', ['грис'], ['semolina'], [], 'pantry'),
  c('oats', ['овесени ядки'], ['oats', 'oat flakes'], [], 'cereal'),
  c('muesli', ['мюсли'], ['muesli'], [], 'cereal'),
  c('cornflakes', ['корнфлейкс'], ['cornflakes'], [], 'cereal'),
  c('coffee', ['кафе'], ['coffee'], [], 'beverages'),
  c('instant_coffee', ['разтворимо кафе'], ['instant coffee'], [], 'beverages'),
  c('tea', ['чай'], ['tea'], [], 'beverages'),
  c('water', ['вода'], ['water'], [], 'beverages'),
  c('mineral_water', ['минерална вода'], ['mineral water'], [], 'beverages'),
  c('sparkling_water', ['газирана вода'], ['sparkling water'], [], 'beverages'),
  c('soft_drink', ['безалкохолно', 'газирано', 'газирана напитка'], ['soft drink', 'soda'], ['carbonated drink', 'fizzy drink'], 'beverages'),
  c('cola', ['кока кола', 'кока-кола', 'кола'], ['coca cola', 'coca-cola', 'cola', 'coke'], [], 'beverages', {
    notes: 'Beverage intent. Personal-care cola scent/flavor terms are not equivalent.',
    related_but_not_equivalent: ['shampoo', 'шампоан'],
  }),
  c('juice', ['сок'], ['juice'], [], 'beverages'),
  c('orange_juice', ['портокалов сок', 'сок портокал'], ['orange juice'], [], 'beverages'),
  c('beer', ['бира'], ['beer'], [], 'beverages'),
  c('wine', ['вино'], ['wine'], [], 'beverages'),
  c('pork', ['свинско', 'свинско месо'], ['pork'], [], 'meat'),
  c('chicken', ['пилешко', 'пилешко месо'], ['chicken'], [], 'meat'),
  c('beef', ['телешко', 'говеждо'], ['beef', 'veal'], [], 'meat'),
  c('minced_meat', ['кайма'], ['minced meat', 'ground meat'], [], 'meat'),
  c('sausages', ['кренвирши', 'наденица'], ['sausages'], [], 'meat'),
  c('ham', ['шунка'], ['ham'], [], 'meat'),
  c('salami', ['салам'], ['salami'], [], 'meat'),
  c('bacon', ['бекон'], ['bacon'], [], 'meat'),
  c('fish', ['риба'], ['fish'], [], 'fish'),
  c('tuna', ['риба тон'], ['tuna'], [], 'fish'),
  c('salmon', ['сьомга'], ['salmon'], [], 'fish'),
  c('potatoes', ['картофи'], ['potatoes'], [], 'produce'),
  c('tomatoes', ['домати'], ['tomatoes'], [], 'produce'),
  c('cucumbers', ['краставици'], ['cucumbers'], [], 'produce'),
  c('onions', ['лук'], ['onions'], [], 'produce'),
  c('garlic', ['чесън'], ['garlic'], [], 'produce'),
  c('carrots', ['моркови'], ['carrots'], [], 'produce'),
  c('peppers', ['чушки', 'пипер'], ['peppers'], [], 'produce'),
  c('apples', ['ябълки'], ['apples'], [], 'produce'),
  c('bananas', ['банани'], ['bananas'], [], 'produce'),
  c('oranges', ['портокали'], ['oranges'], [], 'produce'),
  c('lemons', ['лимони'], ['lemons'], [], 'produce'),
  c('frozen_vegetables', ['замразени зеленчуци'], ['frozen vegetables'], [], 'frozen'),
  c('ice_cream', ['сладолед'], ['ice cream'], [], 'frozen'),
  c('chocolate', ['шоколад'], ['chocolate'], [], 'sweets'),
  c('wafer', ['вафла'], ['wafer'], [], 'sweets'),
  c('honey', ['мед'], ['honey'], [], 'pantry'),
  c('jam', ['сладко', 'конфитюр'], ['jam', 'marmalade'], [], 'pantry'),
  c('mayonnaise', ['майонеза'], ['mayonnaise'], [], 'condiments'),
  c('ketchup', ['кетчуп'], ['ketchup'], [], 'condiments'),
  c('mustard', ['горчица'], ['mustard'], [], 'condiments'),
  c('tomato_paste', ['доматено пюре'], ['tomato paste'], [], 'pantry'),
  c('canned_tomatoes', ['домати консерва'], ['canned tomatoes'], [], 'pantry'),
  c('pickles', ['кисели краставички'], ['pickles'], [], 'pantry'),
  c('olives', ['маслини'], ['olives'], [], 'pantry'),
  c('nuts', ['ядки'], ['nuts'], [], 'snacks'),
  c('sunflower_seeds', ['слънчогледови семки'], ['sunflower seeds'], [], 'snacks'),
  c('chips', ['чипс'], ['chips', 'crisps'], [], 'snacks'),
  c('baby_formula', ['адаптирано мляко', 'бебешко мляко', 'мляко за кърмачета'], ['baby formula', 'infant formula', 'follow-on milk', 'toddler milk'], ['aptamil', 'аптамил', 'pronutra'], 'baby_food', {
    related_but_not_equivalent: ['прясно мляко', 'кисело мляко'],
  }),
  c('baby_food_puree', ['бебешко пюре'], ['baby food', 'baby puree'], [], 'baby_food'),
  c('diapers', ['памперси', 'пелени'], ['diapers', 'nappies'], [], 'baby'),
  c('toilet_paper', ['тоалетна хартия'], ['toilet paper'], [], 'household'),
  c('paper_towels', ['кухненска хартия'], ['paper towels'], [], 'household'),
  c('detergent', ['перилен препарат'], ['detergent', 'laundry detergent'], [], 'household'),
  c('dish_soap', ['препарат за съдове'], ['dish soap', 'dishwashing liquid'], [], 'household'),
  c('shampoo', ['шампоан'], ['shampoo'], [], 'personal_care'),
  c('energy_drink', ['енергийна напитка'], ['energy drink'], [], 'beverages'),
  c('soap', ['сапун'], ['soap'], [], 'personal_care'),
]);

function c(id, bg, en, variants = [], categoryHint = null, extra = {}) {
  return Object.freeze({
    id,
    bg_terms: Object.freeze(bg),
    en_terms: Object.freeze(en),
    variants: Object.freeze(variants),
    category_hint: categoryHint,
    notes: extra.notes || null,
    related_but_not_equivalent: Object.freeze(extra.related_but_not_equivalent || []),
  });
}

function buildGroceryQueryExpansion(queryText) {
  const normalizedQuery = normalizeSearchText(queryText);
  const queryTokens = tokenizeSearchText(queryText);
  const matchedConcepts = GROCERY_SYNONYM_CONCEPTS
    .map((concept) => ({
      concept,
      matched_terms: equivalentTerms(concept).filter((term) => termMatchesQuery(term, normalizedQuery, queryTokens)),
    }))
    .filter((entry) => entry.matched_terms.length > 0);

  const expandedTerms = [...new Set(matchedConcepts.flatMap((entry) => equivalentTerms(entry.concept)))]
    .map((term) => normalizeSearchText(term))
    .filter(Boolean);
  const expandedTokens = [...new Set(expandedTerms.flatMap((term) => tokenizeSearchText(term)))];

  return {
    normalized_query: normalizedQuery,
    query_tokens: queryTokens,
    matched_concepts: matchedConcepts.map((entry) => ({
      id: entry.concept.id,
      matched_terms: entry.matched_terms,
      category_hint: entry.concept.category_hint,
    })),
    expanded_terms: expandedTerms,
    expanded_tokens: expandedTokens,
  };
}

function equivalentTerms(concept) {
  return [
    ...concept.bg_terms,
    ...concept.en_terms,
    ...concept.variants,
  ];
}

function termMatchesQuery(term, normalizedQuery, queryTokens) {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) {
    return false;
  }
  if (normalizedQuery === normalizedTerm || normalizedQuery.includes(normalizedTerm)) {
    const termTokens = tokenizeSearchText(normalizedTerm);
    if (termTokens.length === 1 && queryTokens.length > 1 && normalizedQuery !== normalizedTerm) {
      return false;
    }
    return true;
  }
  const termTokens = tokenizeSearchText(normalizedTerm);
  if (termTokens.length === 1 && queryTokens.length > 1) {
    return false;
  }
  return termTokens.length > 0 && termTokens.every((token) => queryTokens.includes(token));
}

module.exports = {
  GROCERY_SYNONYM_CONCEPTS,
  buildGroceryQueryExpansion,
};
