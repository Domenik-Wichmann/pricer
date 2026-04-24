const {
  buildCanonicalTermRecord,
  buildSynonymRecord,
  levenshteinDistance,
  normalizeSearchText,
  tokenizeSearchText,
} = require('./canonicalization');
const { DEFAULT_FUZZY_RULES } = require('./constants');

async function seedSearchQualityDefaults({
  store,
  createdAt = new Date().toISOString(),
}) {
  const state = await store.load();
  state.canonical_terms = state.canonical_terms || [];
  state.synonym_map = state.synonym_map || [];

  const existingTerms = new Set(state.canonical_terms.map((row) => row.term_id));
  const existingSynonyms = new Set(state.synonym_map.map((row) => row.synonym_id));

  const defaults = [
    {
      canonical: buildCanonicalTermRecord({
        canonicalValue: 'мляко',
        categoryHint: 'milk',
        productTypeHint: 'fresh_milk',
        createdAt,
      }),
      synonyms: ['прясно мляко'],
    },
    {
      canonical: buildCanonicalTermRecord({
        canonicalValue: 'хляб',
        categoryHint: 'bread',
        productTypeHint: 'bread',
        createdAt,
      }),
      synonyms: ['самун'],
    },
    {
      canonical: buildCanonicalTermRecord({
        canonicalValue: 'кори',
        categoryHint: 'pastry',
        productTypeHint: 'pastry_sheets',
        createdAt,
      }),
      synonyms: ['точени кори'],
    },
  ];

  defaults.forEach((entry) => {
    if (!existingTerms.has(entry.canonical.term_id)) {
      state.canonical_terms.push(entry.canonical);
      existingTerms.add(entry.canonical.term_id);
    }

    entry.synonyms.forEach((synonymText) => {
      const synonym = buildSynonymRecord({
        synonymText,
        canonicalTerm: entry.canonical,
        matchScope: synonymText.includes(' ') ? 'phrase' : 'token',
        createdAt,
      });

      if (!existingSynonyms.has(synonym.synonym_id)) {
        state.synonym_map.push(synonym);
        existingSynonyms.add(synonym.synonym_id);
      }
    });
  });

  await store.save(state);
  return state;
}

async function runSearchQualityFeedbackLoop({
  store,
  learnedAt = new Date().toISOString(),
  fuzzyRules = DEFAULT_FUZZY_RULES,
}) {
  const state = await store.load();
  state.canonical_terms = state.canonical_terms || [];
  state.synonym_map = state.synonym_map || [];
  state.demand_aggregates = state.demand_aggregates || [];

  const synonymIds = new Set(state.synonym_map.map((row) => row.synonym_id));
  let learned = 0;

  state.demand_aggregates.forEach((aggregate) => {
    if ((aggregate.frequency || 0) < fuzzyRules.minDemandFrequencyForLearning) {
      return;
    }

    const query = normalizeSearchText(aggregate.normalized_query || aggregate.last_raw_query || '');
    const tokens = tokenizeSearchText(query);
    if (tokens.length !== 1) {
      return;
    }

    const match = findLearnableCanonicalToken({
      token: tokens[0],
      canonicalTerms: state.canonical_terms,
      fuzzyRules,
    });

    if (!match) {
      return;
    }

    const synonymRecord = buildSynonymRecord({
      synonymText: tokens[0],
      canonicalTerm: match.term,
      relationType: 'fuzzy_correction',
      source: 'phase7_demand_learning',
      confidence: 0.86,
      createdAt: learnedAt,
    });

    if (synonymIds.has(synonymRecord.synonym_id)) {
      return;
    }

    state.synonym_map.push(synonymRecord);
    synonymIds.add(synonymRecord.synonym_id);
    learned += 1;
  });

  await store.save(state);
  return {
    learned_synonyms: learned,
    state,
  };
}

function findLearnableCanonicalToken({
  token,
  canonicalTerms,
  fuzzyRules,
}) {
  let best = null;
  let runnerUpDistance = Number.POSITIVE_INFINITY;

  canonicalTerms
    .filter((row) => row.active !== false)
    .forEach((term) => {
      const normalized = normalizeSearchText(term.normalized_value || term.canonical_value);
      if (!normalized || normalized.includes(' ')) {
        return;
      }

      const maxDistance = normalized.length >= 5
        ? fuzzyRules.maxTokenDistanceLong
        : fuzzyRules.maxTokenDistanceShort;
      const distance = levenshteinDistance(token, normalized);
      if (distance > maxDistance) {
        return;
      }

      if (!best || distance < best.distance) {
        runnerUpDistance = best ? best.distance : runnerUpDistance;
        best = { term, distance };
      } else if (distance < runnerUpDistance) {
        runnerUpDistance = distance;
      }
    });

  if (!best || best.distance === runnerUpDistance) {
    return null;
  }

  return best;
}

module.exports = {
  runSearchQualityFeedbackLoop,
  seedSearchQualityDefaults,
};
