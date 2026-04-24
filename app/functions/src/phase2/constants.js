const BG_STOPWORDS = new Set([
  '\u0438',
  '\u0438\u043b\u0438',
  '\u0437\u0430',
  '\u043d\u0430',
  '\u0441',
  '\u0441\u044a\u0441',
  '\u043e\u0442',
  '\u0434\u043e',
  '\u0432',
  '\u043f\u043e',
  '\u043c\u0438',
  '\u0434\u0430\u0439',
  '\u0438\u0441\u043a\u0430\u043c',
  '\u0442\u044a\u0440\u0441\u044f',
  '\u043c\u043e\u043b\u044f',
]);

const BG_CATEGORY_HINTS = Object.freeze({
  '\u043c\u043b\u044f\u043a\u043e': ['6'],
  '\u043f\u0440\u044f\u0441\u043d\u043e': ['6'],
  '\u0445\u043b\u044f\u0431': ['1', '2', '4'],
  '\u0431\u044f\u043b': ['1'],
  '\u0442\u0438\u043f\u043e\u0432': ['4'],
  '\u043a\u043e\u0440\u0438': ['5'],
  '\u0442\u043e\u0447\u0435\u043d\u0438': ['5'],
  '\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b': ['7'],
  '\u0441\u0438\u0440\u0435\u043d\u0435': ['8'],
  '\u043f\u0438\u043b\u0435': ['9'],
  '\u0441\u0432\u0438\u043d\u0441\u043a\u043e': ['10'],
  '\u0440\u0438\u0431\u0430': ['11'],
});

const PRODUCT_TYPE_HINTS_BG = Object.freeze({
  '\u043c\u043b\u044f\u043a\u043e': 'fresh_milk',
  '\u043f\u0440\u044f\u0441\u043d\u043e': 'fresh_milk',
  '\u0445\u043b\u044f\u0431': 'bread',
  '\u043a\u043e\u0440\u0438': 'pastry_sheets',
  '\u0442\u043e\u0447\u0435\u043d\u0438': 'pastry_sheets',
  '\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b': 'yellow_cheese',
  '\u0441\u0438\u0440\u0435\u043d\u0435': 'white_cheese',
  '\u043f\u0438\u043b\u0435': 'chicken',
  '\u0441\u0432\u0438\u043d\u0441\u043a\u043e': 'pork',
  '\u0440\u0438\u0431\u0430': 'fish',
});

module.exports = {
  BG_CATEGORY_HINTS,
  BG_STOPWORDS,
  PRODUCT_TYPE_HINTS_BG,
};
