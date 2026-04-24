const {
  BULGARIAN_SIZE_UNITS_PATTERN,
  CATEGORY_SEARCH_MAP,
  GENERIC_PRODUCT_TERMS,
  PRODUCT_TYPE_PATTERNS,
  UNIT_MAP,
} = require('./constants');
const { mergeEnglishMetadata } = require('../phase1_5/display_builder');

function collapseWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeName(rawName) {
  return collapseWhitespace(
    rawName
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[.,]+/g, ' ')
      .replace(/[()]/g, ' ')
  );
}

function tokenize(normalizedName) {
  return normalizedName
    .split(/[^\p{L}\p{N}%]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function extractSize(rawName) {
  const match = rawName.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${BULGARIAN_SIZE_UNITS_PATTERN})(?=\\s|$|[.,])`, 'iu'));
  if (!match) {
    return { sizeText: null, sizeValue: null, sizeUnit: null };
  }

  return {
    sizeText: collapseWhitespace(match[0]),
    sizeValue: Number.parseFloat(match[1].replace(',', '.')),
    sizeUnit: UNIT_MAP[match[2].toLowerCase()] || null,
  };
}

function extractFatPercent(rawName) {
  const match = rawName.match(/(\d+(?:[.,]\d+)?)\s*%/u);
  if (!match) {
    return null;
  }

  return Number.parseFloat(match[1].replace(',', '.'));
}

function guessProductType(normalizedName) {
  if (normalizedName.includes(PRODUCT_TYPE_PATTERNS.freshMilk)) {
    return 'fresh_milk';
  }

  if (
    normalizedName.includes(PRODUCT_TYPE_PATTERNS.pastrySheets) ||
    normalizedName.includes(PRODUCT_TYPE_PATTERNS.pastrySheetsToken)
  ) {
    return 'pastry_sheets';
  }

  if (normalizedName.includes(PRODUCT_TYPE_PATTERNS.bread)) {
    return 'bread';
  }

  return null;
}

function guessBrand(rawName, tokens) {
  const originalTokens = collapseWhitespace(rawName)
    .split(/\s+/u)
    .map((token) => token.replace(/[.,]/g, ''))
    .filter(Boolean);

  for (const token of originalTokens) {
    const lowered = token.toLowerCase();
    if (/^\d/u.test(lowered) || lowered.includes('%') || GENERIC_PRODUCT_TERMS.has(lowered)) {
      continue;
    }

    if (tokens.includes(lowered) && /\p{Script=Cyrillic}/u.test(lowered)) {
      return token;
    }
  }

  return null;
}

function guessCanonicalSearchCategory({ categoryCode, productTypeGuess }) {
  return CATEGORY_SEARCH_MAP[categoryCode] || productTypeGuess || 'unknown';
}

function buildAliasCandidates({ normalizedName, brandGuess, sizeText, fatPercent }) {
  const aliases = new Set([normalizedName]);
  const withoutBrand = brandGuess
    ? collapseWhitespace(
        normalizedName.replace(new RegExp(`(^|\\s)${escapeRegex(brandGuess.toLowerCase())}(?=\\s|$)`, 'u'), ' ')
      )
    : normalizedName;

  if (withoutBrand && withoutBrand !== normalizedName) {
    aliases.add(withoutBrand);
  }

  let compact = withoutBrand;
  if (sizeText) {
    compact = collapseWhitespace(compact.replace(new RegExp(escapeRegex(sizeText.toLowerCase()), 'u'), ' '));
    if (compact) {
      aliases.add(compact);
    }
  }

  if (typeof fatPercent === 'number') {
    compact = collapseWhitespace(compact.replace(new RegExp(`${fatPercent.toString().replace('.', '[.,]')}\\s*%`, 'u'), ' '));
    if (compact) {
      aliases.add(compact);
    }
  }

  return [...aliases].filter(Boolean);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeParseConfidence({ productTypeGuess, sizeValue, fatPercent, brandGuess }) {
  let confidence = 0.2;

  if (productTypeGuess) {
    confidence += 0.3;
  }

  if (sizeValue !== null) {
    confidence += 0.2;
  }

  if (fatPercent !== null) {
    confidence += 0.1;
  }

  if (brandGuess) {
    confidence += 0.2;
  }

  return Math.min(1, Number(confidence.toFixed(2)));
}

function buildEnrichment({ productNameRaw, categoryCode, existingEnrichment = null }) {
  const normalizedName = normalizeName(productNameRaw);
  const tokens = tokenize(normalizedName);
  const brandGuess = guessBrand(productNameRaw, tokens);
  const productTypeGuess = guessProductType(normalizedName);
  const { sizeText, sizeValue, sizeUnit } = extractSize(productNameRaw);
  const fatPercent = extractFatPercent(productNameRaw);
  const canonicalSearchCategory = guessCanonicalSearchCategory({
    categoryCode,
    productTypeGuess,
  });
  const aliasCandidates = buildAliasCandidates({
    normalizedName,
    brandGuess,
    sizeText,
    fatPercent,
  });
  const parseConfidence = computeParseConfidence({
    productTypeGuess,
    sizeValue,
    fatPercent,
    brandGuess,
  });

  const baseEnrichment = {
    normalized_name: normalizedName,
    tokens,
    brand_guess: brandGuess,
    product_type_guess: productTypeGuess,
    size_text: sizeText,
    size_value: sizeValue,
    size_unit: sizeUnit,
    fat_percent: fatPercent,
    canonical_search_category: canonicalSearchCategory,
    alias_candidates: aliasCandidates,
    parse_confidence: parseConfidence,
  };

  return {
    ...baseEnrichment,
    ...mergeEnglishMetadata(baseEnrichment, existingEnrichment),
  };
}

function normalizedNameForDrift(rawName) {
  return collapseWhitespace(
    rawName
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\d+(?:[.,]\d+)?\s*%/gu, ' ')
      .replace(new RegExp(`\\d+(?:[.,]\\d+)?\\s*(?:g|kg|ml|l|${BULGARIAN_SIZE_UNITS_PATTERN})(?=\\s|$|[.,])`, 'giu'), ' ')
      .replace(/[.,]+/g, ' ')
      .replace(/[()]/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function detectNameDrift(previousRawName, nextRawName) {
  if (!previousRawName || previousRawName === nextRawName) {
    return { driftLevel: 'none', needsRevalidation: false };
  }

  const previousNormalized = normalizedNameForDrift(previousRawName);
  const nextNormalized = normalizedNameForDrift(nextRawName);

  if (previousNormalized === nextNormalized) {
    return { driftLevel: 'minor', needsRevalidation: false };
  }

  const previousTokens = new Set(tokenize(previousNormalized));
  const nextTokens = new Set(tokenize(nextNormalized));
  const shared = [...previousTokens].filter((token) => nextTokens.has(token));
  const overlap = shared.length / Math.max(previousTokens.size, nextTokens.size, 1);

  if (overlap >= 0.8) {
    return { driftLevel: 'minor', needsRevalidation: false };
  }

  return { driftLevel: 'major', needsRevalidation: true };
}

module.exports = {
  buildEnrichment,
  detectNameDrift,
  normalizeName,
  normalizedNameForDrift,
  tokenize,
};
