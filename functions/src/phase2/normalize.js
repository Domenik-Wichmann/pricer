const { BG_STOPWORDS } = require('./constants');
const { buildCanonicalQueryObject } = require('../phase12/canonicalization');

function normalizeInput(rawInput) {
  return rawInput
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,!?()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeInput(rawInput) {
  return normalizeInput(rawInput)
    .split(/[^\p{L}\p{N}%]+/u)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !BG_STOPWORDS.has(token));
}

function splitQueryItems(rawInput) {
  return rawInput
    .split(/[\n,;]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseQueryItem(rawItem, options = {}) {
  const normalized = normalizeInput(rawItem);
  const tokens = tokenizeInput(rawItem);
  const size = extractSizeAndFat(rawItem);
  const canonicalQuery = buildCanonicalQueryObject({
    rawInput: rawItem,
    canonicalTerms: options.canonicalTerms || [],
    synonymMap: options.synonymMap || [],
  });

  return {
    raw_input: rawItem,
    normalized_input: normalized,
    tokens_bg: tokens,
    canonical_query: canonicalQuery,
    size_value: size.size_value,
    size_unit: size.size_unit,
    fat_percent: size.fat_percent,
  };
}

function extractSizeAndFat(rawInput) {
  const sizeMatch = rawInput.match(/(\d+(?:[.,]\d+)?)\s*(\u0433\u0440|\u0433|\u043a\u0433|\u043c\u043b|\u043b)(?=\s|$|[.,])/iu);
  const fatMatch = rawInput.match(/(\d+(?:[.,]\d+)?)\s*%/u);

  return {
    size_value: sizeMatch ? Number.parseFloat(sizeMatch[1].replace(',', '.')) : null,
    size_unit: sizeMatch ? mapUnit(sizeMatch[2].toLowerCase()) : null,
    fat_percent: fatMatch ? Number.parseFloat(fatMatch[1].replace(',', '.')) : null,
  };
}

function mapUnit(rawUnit) {
  const map = {
    '\u0433\u0440': 'g',
    '\u0433': 'g',
    '\u043a\u0433': 'kg',
    '\u043c\u043b': 'ml',
    '\u043b': 'l',
  };

  return map[rawUnit] || null;
}

module.exports = {
  normalizeInput,
  parseQueryItem,
  splitQueryItems,
  tokenizeInput,
};
