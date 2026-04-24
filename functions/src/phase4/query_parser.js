const { inferCategoryCodes, inferProductType } = require('../phase2/filter');
const { normalizeInput, tokenizeInput } = require('../phase2/normalize');

const CHEAP_KEYWORDS = new Set([
  '\u0435\u0432\u0442\u0438\u043d\u043e',
  '\u043d\u0430\u0439-\u0435\u0432\u0442\u0438\u043d\u043e',
  '\u0435\u0432\u0442\u0438\u043d',
]);

const CATEGORY_KEYWORDS = new Set([
  '\u043c\u0435\u0441\u043e',
  '\u043c\u043b\u044f\u043a\u043e',
  '\u0445\u043b\u044f\u0431',
  '\u043a\u043e\u0440\u0438',
  '\u0441\u0438\u0440\u0435\u043d\u0435',
  '\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b',
]);

const LOCATION_TOKENS = new Set([
  '\u0441\u043e\u0444\u0438\u044f',
  '\u043f\u043b\u043e\u0432\u0434\u0438\u0432',
  '\u0432\u0430\u0440\u043d\u0430',
  '\u0431\u0443\u0440\u0433\u0430\u0441',
]);

function parseQuery(rawQuery) {
  const normalized_query = normalizeInput(rawQuery);
  const tokens = tokenizeInput(rawQuery);
  const price_max = parsePriceMax(normalized_query);
  const location = tokens.find((token) => LOCATION_TOKENS.has(token)) || null;
  const product_type = inferProductType(tokens);
  const category_codes = inferCategoryCodes(tokens);
  const brand = inferBrandToken(tokens, { product_type, location, price_max });
  const intent = inferIntent(tokens);

  return {
    raw_query: rawQuery,
    normalized_query,
    tokens,
    product_type: product_type || null,
    brand: brand || null,
    category_code: category_codes[0] || null,
    constraints_price_max: price_max,
    constraints_location: location,
    intent,
  };
}

function parsePriceMax(normalizedQuery) {
  const match = normalizedQuery.match(/\u043f\u043e\u0434\s+(\d+(?:[.,]\d+)?)/u);
  if (!match) {
    return null;
  }

  return Number.parseFloat(match[1].replace(',', '.'));
}

function inferIntent(tokens) {
  if (tokens.some((token) => CHEAP_KEYWORDS.has(token))) {
    return 'cheap';
  }

  if (tokens.some((token) => CATEGORY_KEYWORDS.has(token)) && tokens.length <= 2) {
    return 'category';
  }

  return 'product';
}

function inferBrandToken(tokens, { product_type, location, price_max }) {
  const ignore = new Set([
    ...(product_type ? [product_type] : []),
    ...(location ? [location] : []),
    ...CHEAP_KEYWORDS,
    ...CATEGORY_KEYWORDS,
  ]);

  return tokens.find((token) => {
    if (ignore.has(token)) {
      return false;
    }

    if (/^\d/u.test(token) || token.includes('%')) {
      return false;
    }

    if (price_max !== null && token === String(price_max)) {
      return false;
    }

    return true;
  }) || null;
}

module.exports = {
  parseQuery,
};
