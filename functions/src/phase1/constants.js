const SOURCE_HEADERS = Object.freeze({
  localityCode: '\u041d\u0430\u0441\u0435\u043b\u0435\u043d\u043e \u043c\u044f\u0441\u0442\u043e',
  storeNameRaw: '\u0422\u044a\u0440\u0433\u043e\u0432\u0441\u043a\u0438 \u043e\u0431\u0435\u043a\u0442',
  productNameRaw: '\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435 \u043d\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430',
  productCode: '\u041a\u043e\u0434 \u043d\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430',
  categoryCode: '\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f',
  retailPrice: '\u0426\u0435\u043d\u0430 \u043d\u0430 \u0434\u0440\u0435\u0431\u043d\u043e',
  promoPrice: '\u0426\u0435\u043d\u0430 \u0432 \u043f\u0440\u043e\u043c\u043e\u0446\u0438\u044f',
});

const CATEGORY_SEARCH_MAP = Object.freeze({
  '1': 'bread',
  '2': 'bread',
  '4': 'bread',
  '5': 'pastry',
  '6': 'milk',
});

const GENERIC_PRODUCT_TERMS = new Set([
  '\u0431\u044f\u043b',
  '\u0445\u043b\u044f\u0431',
  '\u0442\u0438\u043f\u043e\u0432',
  '\u043f\u0440\u044f\u0441\u043d\u043e',
  '\u043c\u043b\u044f\u043a\u043e',
  '\u0442\u043e\u0447\u0435\u043d\u0438',
  '\u043a\u043e\u0440\u0438',
  '\u0444\u0438\u043d\u0438',
  '\u043f\u044a\u043b\u043d\u043e\u0437\u044a\u0440\u043d\u0435\u0441\u0442\u0438',
  '\u0441\u044a\u0441',
  '\u0437\u0430\u043a\u0432\u0430\u0441\u043a\u0430',
  '\u0434\u043e\u0431\u0440\u0443\u0434\u0436\u0430',
  '\u0447\u0443\u0434\u043d\u043e',
]);

const UNIT_MAP = Object.freeze({
  '\u0433\u0440': 'g',
  '\u0433': 'g',
  '\u043a\u0433': 'kg',
  '\u043c\u043b': 'ml',
  '\u043b': 'l',
});

const PRODUCT_TYPE_PATTERNS = Object.freeze({
  freshMilk: '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e',
  pastrySheets: '\u0442\u043e\u0447\u0435\u043d\u0438 \u043a\u043e\u0440\u0438',
  pastrySheetsToken: '\u043a\u043e\u0440\u0438',
  bread: '\u0445\u043b\u044f\u0431',
});

const BULGARIAN_SIZE_UNITS_PATTERN = '\u0433\u0440|\u0433|\u043a\u0433|\u043c\u043b|\u043b';

module.exports = {
  BULGARIAN_SIZE_UNITS_PATTERN,
  CATEGORY_SEARCH_MAP,
  GENERIC_PRODUCT_TERMS,
  PRODUCT_TYPE_PATTERNS,
  SOURCE_HEADERS,
  UNIT_MAP,
};
