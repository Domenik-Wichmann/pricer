const {
  DEFAULT_INGREDIENT_PRODUCT_GENERATION_METHOD,
  normalizeName,
  normalizeProductCandidate,
} = require('./ingredient_product_repository');

const CATEGORY_HINTS = Object.freeze({
  dairy: ['dairy', 'milk', 'cheese', 'yogurt', 'cream'],
  meat: ['meat', 'chicken', 'pork', 'beef', 'turkey'],
  vegetable: ['vegetable', 'vegetables', 'tomato', 'cucumber', 'potato', 'beans'],
  fruit: ['fruit', 'apple', 'banana', 'orange'],
  grain: ['grain', 'rice', 'flour', 'pasta', 'bread'],
});

function buildProductCandidates(products = []) {
  return products.map((product) => normalizeProductCandidate({
    ...product,
    parsed_attributes_json: product.parsed_attributes_json || product.parsedAttributesJson || product.attributes || parseProductAttributes(product),
    proposed_ingredient_key: product.proposed_ingredient_key || product.proposedIngredientKey || inferIngredientKeyFromProduct(product),
    generation_method: product.generation_method || DEFAULT_INGREDIENT_PRODUCT_GENERATION_METHOD,
    review_status: product.review_status || 'suggested',
  }));
}

function buildIngredientProductMappingSuggestions({ ingredients = [], productCandidates = [], threshold = 0.72 } = {}) {
  const suggestions = [];
  for (const candidate of productCandidates.map(normalizeProductCandidate)) {
    for (const ingredient of ingredients) {
      const match = matchProductCandidateToIngredient(candidate, ingredient);
      if (match.confidence >= threshold) {
        suggestions.push({
          ingredient_id: ingredient.ingredient_id,
          product_id: candidate.product_id,
          mapping_type: match.mapping_type,
          confidence: match.confidence,
          review_status: 'suggested',
          generation_method: DEFAULT_INGREDIENT_PRODUCT_GENERATION_METHOD,
          match_reason_json: match.match_reason_json,
        });
      }
    }
  }
  return suggestions.sort((left, right) => (
    String(left.ingredient_id).localeCompare(String(right.ingredient_id)) ||
    String(left.product_id).localeCompare(String(right.product_id))
  ));
}

function matchProductCandidateToIngredient(candidateInput, ingredient = {}) {
  const candidate = normalizeProductCandidate(candidateInput);
  const productName = normalizeName(candidate.normalized_product_name || candidate.product_name);
  const ingredientKey = normalizeName(ingredient.ingredient_key);
  const aliases = ingredientAliases(ingredient);
  const names = [
    ingredientKey,
    normalizeName(ingredient.name_en),
    normalizeName(ingredient.name_bg),
    normalizeName(ingredient.normalized_name),
    ...aliases,
  ].filter(Boolean);
  const reason = [];
  let confidence = 0;

  if (candidate.proposed_ingredient_key && normalizeName(candidate.proposed_ingredient_key) === ingredientKey) {
    confidence = Math.max(confidence, 0.94);
    reason.push('proposed_ingredient_key');
  }

  for (const name of names) {
    if (productName === name) {
      confidence = Math.max(confidence, 0.96);
      reason.push('exact_normalized_name');
    } else if (name.length >= 3 && containsToken(productName, name)) {
      confidence = Math.max(confidence, aliases.includes(name) ? 0.88 : 0.84);
      reason.push(aliases.includes(name) ? 'alias_contained' : 'name_contained');
    }
  }

  if (categoryMatchesIngredient(candidate, ingredient)) {
    confidence = Math.min(0.99, confidence + 0.06);
    reason.push('category_hint');
  }

  if (attributeMatchesIngredient(candidate, ingredient)) {
    confidence = Math.min(0.99, confidence + 0.04);
    reason.push('attribute_match');
  }

  const rounded = Math.round(confidence * 10000) / 10000;
  return {
    ingredient_id: ingredient.ingredient_id || null,
    product_id: candidate.product_id,
    mapping_type: mappingTypeForConfidence(rounded),
    confidence: rounded,
    review_status: 'suggested',
    match_reason_json: {
      reasons: [...new Set(reason)],
      candidate_product_name: candidate.product_name,
      ingredient_key: ingredient.ingredient_key || null,
    },
  };
}

function parseProductAttributes(product = {}) {
  return {
    category_hint: product.category_hint || product.categoryHint || product.category || null,
    fat_percent: product.fat_percent ?? product.fatPercent ?? null,
    product_type: product.product_type || product.productType || null,
  };
}

function inferIngredientKeyFromProduct(product = {}) {
  return normalizeName(product.proposed_ingredient_key || product.product_name || product.productName || product.name);
}

function ingredientAliases(ingredient = {}) {
  const aliasesJson = typeof ingredient.aliases_json === 'string'
    ? safeParseJson(ingredient.aliases_json, {})
    : ingredient.aliases_json || {};
  return [
    ...arrayOf(aliasesJson.all),
    ...arrayOf(aliasesJson.en),
    ...arrayOf(aliasesJson.bg),
  ].map(normalizeName).filter(Boolean);
}

function categoryMatchesIngredient(candidate = {}, ingredient = {}) {
  const attrs = candidate.parsed_attributes_json || {};
  const haystack = [
    attrs.category_hint,
    attrs.category,
    attrs.product_type,
    attrs.food_family,
    candidate.product_name,
  ].map(normalizeName).join('_');
  const family = normalizeName(ingredient.food_family);
  if (family && containsAny(haystack, CATEGORY_HINTS[family] || [family])) return true;
  return Object.entries(CATEGORY_HINTS).some(([key, hints]) => family === key && containsAny(haystack, hints));
}

function attributeMatchesIngredient(candidate = {}, ingredient = {}) {
  const attrs = candidate.parsed_attributes_json || {};
  const stateDefaults = typeof ingredient.state_defaults_json === 'string'
    ? safeParseJson(ingredient.state_defaults_json, {})
    : ingredient.state_defaults_json || {};
  if (attrs.fat_percent !== undefined && attrs.fat_percent !== null && stateDefaults.fat_percent !== undefined) {
    return Number(attrs.fat_percent) === Number(stateDefaults.fat_percent);
  }
  const type = normalizeName(attrs.type || attrs.product_type);
  const ingredientType = normalizeName(ingredient.ingredient_type);
  return Boolean(type && ingredientType && type === ingredientType);
}

function mappingTypeForConfidence(confidence) {
  if (confidence >= 0.92) return 'exact_match';
  if (confidence >= 0.78) return 'close_match';
  if (confidence >= 0.6) return 'substitute';
  return 'rejected';
}

function containsToken(haystack, needle) {
  return (`_${haystack}_`).includes(`_${needle}_`) || haystack.includes(needle);
}

function containsAny(haystack, values) {
  return values.map(normalizeName).some((value) => value && haystack.includes(value));
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

module.exports = {
  buildIngredientProductMappingSuggestions,
  buildProductCandidates,
  matchProductCandidateToIngredient,
  parseProductAttributes,
};
