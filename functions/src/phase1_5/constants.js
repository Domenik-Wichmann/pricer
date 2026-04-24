const SUPPORTED_TRANSLATION_LANGS = Object.freeze(['en', 'de', 'uk', 'ru', 'nl']);

const DISPLAY_PREFIXES_EN = Object.freeze({
  fresh_milk: 'Fresh milk',
  yellow_cheese: 'Yellow cheese',
  white_cheese: 'White cheese',
  bread: 'Bread',
  pastry_sheets: 'Pastry sheets',
  chicken: 'Chicken',
  pork: 'Pork',
  fish: 'Fish',
  milk: 'Milk',
  cheese: 'Cheese',
  pastry: 'Pastry',
  meat: 'Meat',
});

const PRODUCT_FAMILY_BY_TYPE = Object.freeze({
  fresh_milk: 'milk',
  yellow_cheese: 'cheese',
  white_cheese: 'cheese',
  bread: 'bread',
  pastry_sheets: 'pastry',
  chicken: 'meat',
  pork: 'meat',
  fish: 'fish',
});

const PRODUCT_TYPE_BY_BG_KEYWORD = Object.freeze({
  '\u043c\u043b\u044f\u043a\u043e': 'fresh_milk',
  '\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b': 'yellow_cheese',
  '\u0441\u0438\u0440\u0435\u043d\u0435': 'white_cheese',
  '\u0445\u043b\u044f\u0431': 'bread',
  '\u043a\u043e\u0440\u0438': 'pastry_sheets',
  '\u043f\u0438\u043b\u0435': 'chicken',
  '\u0441\u0432\u0438\u043d\u0441\u043a\u043e': 'pork',
  '\u0440\u0438\u0431\u0430': 'fish',
});

const UNIT_DISPLAY_MAP = Object.freeze({
  g: 'g',
  kg: 'kg',
  ml: 'mL',
  l: 'L',
  count: 'count',
});

const TRANSLATED_DISPLAY_PREFIXES = Object.freeze({
  de: {
    'Fresh milk': 'Frische Milch',
    'Yellow cheese': 'Gelber Kaese',
    'White cheese': 'Weisser Kaese',
    Bread: 'Brot',
    'Pastry sheets': 'Teigblaetter',
    Chicken: 'Haehnchen',
    Pork: 'Schweinefleisch',
    Fish: 'Fisch',
    Milk: 'Milch',
    Cheese: 'Kaese',
    Pastry: 'Gebaeck',
    Meat: 'Fleisch',
  },
  uk: {
    'Fresh milk': '\u0421\u0432\u0456\u0436\u0435 \u043c\u043e\u043b\u043e\u043a\u043e',
    'Yellow cheese': '\u0416\u043e\u0432\u0442\u0438\u0439 \u0441\u0438\u0440',
    'White cheese': '\u0411\u0456\u043b\u0438\u0439 \u0441\u0438\u0440',
    Bread: '\u0425\u043b\u0456\u0431',
    'Pastry sheets': '\u0422\u0456\u0441\u0442\u043e\u0432\u0456 \u043b\u0438\u0441\u0442\u0438',
    Chicken: '\u041a\u0443\u0440\u044f\u0442\u0438\u043d\u0430',
    Pork: '\u0421\u0432\u0438\u043d\u0438\u043d\u0430',
    Fish: '\u0420\u0438\u0431\u0430',
    Milk: '\u041c\u043e\u043b\u043e\u043a\u043e',
    Cheese: '\u0421\u0438\u0440',
    Pastry: '\u0412\u0438\u043f\u0456\u0447\u043a\u0430',
    Meat: '\u041c\u2019\u044f\u0441\u043e',
  },
  ru: {
    'Fresh milk': '\u0421\u0432\u0435\u0436\u0435\u0435 \u043c\u043e\u043b\u043e\u043a\u043e',
    'Yellow cheese': '\u0416\u0435\u043b\u0442\u044b\u0439 \u0441\u044b\u0440',
    'White cheese': '\u0411\u0435\u043b\u044b\u0439 \u0441\u044b\u0440',
    Bread: '\u0425\u043b\u0435\u0431',
    'Pastry sheets': '\u0422\u0435\u0441\u0442\u043e\u0432\u044b\u0435 \u043b\u0438\u0441\u0442\u044b',
    Chicken: '\u041a\u0443\u0440\u0438\u0446\u0430',
    Pork: '\u0421\u0432\u0438\u043d\u0438\u043d\u0430',
    Fish: '\u0420\u044b\u0431\u0430',
    Milk: '\u041c\u043e\u043b\u043e\u043a\u043e',
    Cheese: '\u0421\u044b\u0440',
    Pastry: '\u0412\u044b\u043f\u0435\u0447\u043a\u0430',
    Meat: '\u041c\u044f\u0441\u043e',
  },
  nl: {
    'Fresh milk': 'Verse melk',
    'Yellow cheese': 'Gele kaas',
    'White cheese': 'Witte kaas',
    Bread: 'Brood',
    'Pastry sheets': 'Deegvellen',
    Chicken: 'Kip',
    Pork: 'Varkensvlees',
    Fish: 'Vis',
    Milk: 'Melk',
    Cheese: 'Kaas',
    Pastry: 'Gebak',
    Meat: 'Vlees',
  },
});

module.exports = {
  DISPLAY_PREFIXES_EN,
  PRODUCT_FAMILY_BY_TYPE,
  PRODUCT_TYPE_BY_BG_KEYWORD,
  SUPPORTED_TRANSLATION_LANGS,
  TRANSLATED_DISPLAY_PREFIXES,
  UNIT_DISPLAY_MAP,
};
