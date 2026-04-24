const crypto = require('node:crypto');

const { DEFAULT_FUZZY_RULES, SEARCH_QUALITY_VERSION } = require('./constants');

const BG_STOPWORDS = new Set([
  'и',
  'за',
  'с',
  'на',
  'по',
  'от',
  'или',
  'искам',
  'моля',
  'дай',
  'ми',
  'най',
  'евтин',
  'евтино',
  'евтина',
]);

function normalizeSearchText(rawInput) {
  return String(rawInput || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,!?()[\]{}:/"'`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSearchText(rawInput) {
  return normalizeSearchText(rawInput)
    .split(/[^\p{L}\p{N}%]+/u)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !BG_STOPWORDS.has(token));
}

function extractStructuredAttributes(rawInput) {
  const sizeMatch = String(rawInput || '').match(/(\d+(?:[.,]\d+)?)\s*(гр|г|кг|мл|л)(?=\s|$|[.,])/iu);
  const fatMatch = String(rawInput || '').match(/(\d+(?:[.,]\d+)?)\s*%/u);

  return {
    size_value: sizeMatch ? Number.parseFloat(sizeMatch[1].replace(',', '.')) : null,
    size_unit: sizeMatch ? mapUnit(sizeMatch[2].toLowerCase()) : null,
    fat_percent: fatMatch ? Number.parseFloat(fatMatch[1].replace(',', '.')) : null,
  };
}

function mapUnit(rawUnit) {
  const units = {
    гр: 'g',
    г: 'g',
    кг: 'kg',
    мл: 'ml',
    л: 'l',
  };

  return units[rawUnit] || null;
}

function buildCanonicalQueryObject({
  rawInput,
  canonicalTerms = [],
  synonymMap = [],
  fuzzyRules = DEFAULT_FUZZY_RULES,
}) {
  const normalizedInput = normalizeSearchText(rawInput);
  const tokensBg = tokenizeSearchText(rawInput);
  const structured = extractStructuredAttributes(rawInput);
  const termIndex = buildCanonicalTermIndex(canonicalTerms, synonymMap);
  const rewrites = [];

  const correctedTokens = tokensBg.map((token) => applyBestRewrite({
    token,
    termIndex,
    fuzzyRules,
    rewrites,
  }));

  const expandedTokens = expandCanonicalTokens({
    correctedTokens,
    termIndex,
  });

  const exactPhrases = resolveExactPhraseCanonicalValues({
    normalizedInput,
    termIndex,
  });

  const correctedInput = correctedTokens.join(' ').trim();
  const canonicalTermsApplied = [...new Set([
    ...exactPhrases,
    ...expandedTokens,
  ])];

  return {
    version: SEARCH_QUALITY_VERSION,
    raw_input: rawInput,
    normalized_input: normalizedInput,
    corrected_input: correctedInput || normalizedInput,
    tokens_bg: tokensBg,
    corrected_tokens_bg: correctedTokens,
    expanded_tokens_bg: [...new Set(expandedTokens)],
    canonical_terms: canonicalTermsApplied,
    canonical_categories: inferCanonicalCategories(canonicalTermsApplied, termIndex),
    canonical_product_types: inferCanonicalProductTypes(canonicalTermsApplied, termIndex),
    applied_rewrites: rewrites,
    size_value: structured.size_value,
    size_unit: structured.size_unit,
    fat_percent: structured.fat_percent,
  };
}

function buildCanonicalTermIndex(canonicalTerms, synonymMap) {
  const activeTerms = canonicalTerms.filter((entry) => entry && entry.active !== false);
  const activeSynonyms = synonymMap.filter((entry) => entry && entry.active !== false);
  const byNormalized = new Map();
  const byCanonical = new Map();
  const phraseSynonyms = new Map();

  activeTerms.forEach((entry) => {
    const normalized = normalizeSearchText(entry.normalized_value || entry.canonical_value);
    const row = {
      ...entry,
      normalized_value: normalized,
    };
    byNormalized.set(normalized, row);

    if (!byCanonical.has(row.canonical_value)) {
      byCanonical.set(row.canonical_value, []);
    }
    byCanonical.get(row.canonical_value).push(row);
  });

  activeSynonyms.forEach((entry) => {
    const normalized = normalizeSearchText(entry.normalized_synonym_text || entry.synonym_text);
    const row = {
      ...entry,
      normalized_synonym_text: normalized,
    };

    if (normalized.includes(' ')) {
      phraseSynonyms.set(normalized, row);
    } else {
      byNormalized.set(normalized, row);
    }

    if (!byCanonical.has(row.canonical_value)) {
      byCanonical.set(row.canonical_value, []);
    }
    byCanonical.get(row.canonical_value).push(row);
  });

  return {
    activeTerms,
    byNormalized,
    byCanonical,
    phraseSynonyms,
  };
}

function applyBestRewrite({
  token,
  termIndex,
  fuzzyRules,
  rewrites,
}) {
  const direct = termIndex.byNormalized.get(token);
  if (direct) {
    if (direct.canonical_value && direct.canonical_value !== token) {
      rewrites.push({
        source: token,
        target: direct.canonical_value,
        rule: direct.relation_type || 'exact_map',
      });
      return direct.canonical_value;
    }

    return token;
  }

  const fuzzy = findBestFuzzyCanonicalValue({
    token,
    candidates: termIndex.activeTerms,
    fuzzyRules,
  });
  if (!fuzzy) {
    return token;
  }

  rewrites.push({
    source: token,
    target: fuzzy.canonical_value,
    rule: 'fuzzy_correction',
    distance: fuzzy.distance,
  });
  return fuzzy.canonical_value;
}

function findBestFuzzyCanonicalValue({
  token,
  candidates,
  fuzzyRules,
}) {
  let best = null;
  let runnerUpDistance = Number.POSITIVE_INFINITY;

  candidates.forEach((entry) => {
    const candidateValue = normalizeSearchText(entry.normalized_value || entry.canonical_value);
    if (!candidateValue || candidateValue.includes(' ')) {
      return;
    }

    const distance = levenshteinDistance(token, candidateValue);
    const maxDistance = candidateValue.length >= 5
      ? fuzzyRules.maxTokenDistanceLong
      : fuzzyRules.maxTokenDistanceShort;

    if (distance > maxDistance) {
      return;
    }

    if (!best || distance < best.distance) {
      runnerUpDistance = best ? best.distance : runnerUpDistance;
      best = {
        canonical_value: entry.canonical_value,
        distance,
      };
    } else if (distance < runnerUpDistance) {
      runnerUpDistance = distance;
    }
  });

  if (!best || best.distance === runnerUpDistance) {
    return null;
  }

  return best;
}

function expandCanonicalTokens({
  correctedTokens,
  termIndex,
}) {
  const expanded = new Set(correctedTokens);

  correctedTokens.forEach((token) => {
    const direct = termIndex.byNormalized.get(token);
    if (direct?.canonical_value) {
      expanded.add(direct.canonical_value);
    }

    const linkedEntries = termIndex.byCanonical.get(token) || [];
    linkedEntries.forEach((entry) => {
      expanded.add(entry.canonical_value);
      const normalizedSource = normalizeSearchText(entry.normalized_value || entry.normalized_synonym_text || entry.synonym_text);
      if (normalizedSource && !normalizedSource.includes(' ')) {
        expanded.add(normalizedSource);
      }
    });
  });

  return [...expanded];
}

function resolveExactPhraseCanonicalValues({
  normalizedInput,
  termIndex,
}) {
  const values = [];
  for (const [phrase, row] of termIndex.phraseSynonyms.entries()) {
    if (normalizedInput.includes(phrase)) {
      values.push(row.canonical_value);
    }
  }
  return values;
}

function inferCanonicalCategories(canonicalTermsApplied, termIndex) {
  return [...new Set(canonicalTermsApplied.flatMap((value) => {
    const entries = termIndex.byCanonical.get(value) || [];
    return entries.map((entry) => entry.category_hint).filter(Boolean);
  }))];
}

function inferCanonicalProductTypes(canonicalTermsApplied, termIndex) {
  return [...new Set(canonicalTermsApplied.flatMap((value) => {
    const entries = termIndex.byCanonical.get(value) || [];
    return entries.map((entry) => entry.product_type_hint).filter(Boolean);
  }))];
}

function buildCanonicalTermRecord({
  canonicalValue,
  termType = 'token',
  locale = 'bg',
  categoryHint = null,
  productTypeHint = null,
  source = 'manual_seed',
  confidence = 1,
  active = true,
  createdAt = new Date().toISOString(),
}) {
  const normalizedValue = normalizeSearchText(canonicalValue);
  return {
    term_id: crypto.createHash('sha256')
      .update([locale, termType, normalizedValue].join('|'))
      .digest('hex'),
    term_type: termType,
    locale,
    canonical_value: canonicalValue,
    normalized_value: normalizedValue,
    category_hint: categoryHint,
    product_type_hint: productTypeHint,
    source,
    confidence,
    active,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function buildSynonymRecord({
  synonymText,
  canonicalTerm,
  matchScope = 'token',
  relationType = 'synonym',
  source = 'manual_seed',
  confidence = 1,
  active = true,
  createdAt = new Date().toISOString(),
}) {
  const normalizedSynonymText = normalizeSearchText(synonymText);
  return {
    synonym_id: crypto.createHash('sha256')
      .update([normalizedSynonymText, canonicalTerm.term_id, relationType].join('|'))
      .digest('hex'),
    synonym_text: synonymText,
    normalized_synonym_text: normalizedSynonymText,
    canonical_term_id: canonicalTerm.term_id,
    canonical_value: canonicalTerm.canonical_value,
    match_scope: matchScope,
    relation_type: relationType,
    confidence,
    source,
    active,
    category_hint: canonicalTerm.category_hint || null,
    product_type_hint: canonicalTerm.product_type_hint || null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function levenshteinDistance(left, right) {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const matrix = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= right.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[left.length][right.length];
}

module.exports = {
  buildCanonicalQueryObject,
  buildCanonicalTermRecord,
  buildSynonymRecord,
  extractStructuredAttributes,
  levenshteinDistance,
  normalizeSearchText,
  tokenizeSearchText,
};
