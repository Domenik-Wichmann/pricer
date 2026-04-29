const OPTIONAL_ARRAY_FIELDS = Object.freeze([
  'steps',
  'tools',
  'methods',
  'tags',
  'state_changes',
  'substitution_hints',
  'quality_signals',
]);

function parseRecipeExtractionJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    throw validationError('Recipe extraction response must be a JSON object.');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw validationError('Recipe extraction response is empty.');
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw validationError('Recipe extraction response must be a JSON object.');
    }
    return parsed;
  } catch (error) {
    if (error && error.code === 'recipe_extraction_validation') throw error;
    throw validationError('Recipe extraction response must be valid strict JSON.');
  }
}

function validateRecipeExtractionPayload(value) {
  const payload = parseRecipeExtractionJson(value);
  const recipeInput = requireObject(payload.recipe, 'recipe');
  const title = firstString(recipeInput.title_original, recipeInput.title_en, recipeInput.title_bg);
  if (!title) {
    throw validationError('Recipe extraction is missing a recipe title.');
  }

  const ingredientInputs = normalizeObjectArray(payload.ingredients, 'ingredients');
  if (ingredientInputs.length === 0) {
    throw validationError('Recipe extraction must include at least one ingredient.');
  }

  return {
    recipe: normalizeRecipe(recipeInput, title),
    ingredients: ingredientInputs.map(normalizeIngredient),
    steps: normalizeObjectArray(payload.steps, 'steps').map(normalizeStep),
    tools: normalizeObjectArray(payload.tools, 'tools').map((item, index) => normalizeNamedChild(item, index, 'tool')),
    methods: normalizeObjectArray(payload.methods, 'methods').map((item, index) => normalizeNamedChild(item, index, 'method')),
    tags: normalizeObjectArray(payload.tags, 'tags').map(normalizeTag),
    state_changes: normalizeObjectArray(payload.state_changes, 'state_changes').map(normalizeStateChange),
    substitution_hints: normalizeObjectArray(payload.substitution_hints, 'substitution_hints').map(normalizeSubstitutionHint),
    quality_signals: normalizeObjectArray(payload.quality_signals, 'quality_signals').map(normalizeQualitySignal),
  };
}

function normalizeRecipe(input, title) {
  return {
    proposed_recipe_key: normalizeKey(input.proposed_recipe_key || title, 'recipe.proposed_recipe_key'),
    title_original: nullableString(input.title_original),
    title_en: nullableString(input.title_en),
    title_bg: nullableString(input.title_bg),
    description: nullableString(input.description),
    servings: nullableNumber(input.servings, 'recipe.servings'),
    yield_quantity: nullableNumber(input.yield_quantity, 'recipe.yield_quantity'),
    yield_unit: nullableString(input.yield_unit),
    cuisine_tags: normalizeStringArray(input.cuisine_tags, 'recipe.cuisine_tags'),
    region_tags: normalizeStringArray(input.region_tags, 'recipe.region_tags'),
    dietary_tags: normalizeStringArray(input.dietary_tags, 'recipe.dietary_tags'),
    meal_type_tags: normalizeStringArray(input.meal_type_tags, 'recipe.meal_type_tags'),
    feeling_tags: normalizeStringArray(input.feeling_tags, 'recipe.feeling_tags'),
    flavor_profile: normalizeObject(input.flavor_profile, 'recipe.flavor_profile'),
    texture_profile: normalizeObject(input.texture_profile, 'recipe.texture_profile'),
    difficulty_level: nullableString(input.difficulty_level),
    budget_level: nullableString(input.budget_level),
    prep_time_minutes: nullableNumber(input.prep_time_minutes, 'recipe.prep_time_minutes'),
    cook_time_minutes: nullableNumber(input.cook_time_minutes, 'recipe.cook_time_minutes'),
    rest_time_minutes: nullableNumber(input.rest_time_minutes, 'recipe.rest_time_minutes'),
    total_time_minutes: nullableNumber(input.total_time_minutes, 'recipe.total_time_minutes'),
    confidence: nullableConfidence(input.confidence, 'recipe.confidence'),
  };
}

function normalizeIngredient(input, index) {
  return {
    raw_line: nullableString(input.raw_line),
    ingredient_name_original: nullableString(input.ingredient_name_original),
    ingredient_name_en: nullableString(input.ingredient_name_en),
    ingredient_name_bg: nullableString(input.ingredient_name_bg),
    proposed_ingredient_key: normalizeKey(
      input.proposed_ingredient_key ||
      input.ingredient_name_en ||
      input.ingredient_name_original ||
      input.raw_line ||
      `ingredient_${index + 1}`,
      `ingredients[${index}].proposed_ingredient_key`,
    ),
    quantity: nullableNumber(input.quantity, `ingredients[${index}].quantity`),
    unit: nullableString(input.unit),
    quantity_grams: nullableNumber(input.quantity_grams, `ingredients[${index}].quantity_grams`),
    preparation_note: nullableString(input.preparation_note),
    optional: Boolean(input.optional),
    sort_order: positiveInteger(input.sort_order, index + 1),
    confidence: nullableConfidence(input.confidence, `ingredients[${index}].confidence`),
  };
}

function normalizeStep(input, index) {
  return {
    step_number: positiveInteger(input.step_number, index + 1),
    instruction_original: nullableString(input.instruction_original),
    instruction_en: nullableString(input.instruction_en),
    instruction_bg: nullableString(input.instruction_bg),
    duration_minutes: nullableNumber(input.duration_minutes, `steps[${index}].duration_minutes`),
    temperature_c: nullableNumber(input.temperature_c, `steps[${index}].temperature_c`),
    state_change_summary: nullableString(input.state_change_summary),
    confidence: nullableConfidence(input.confidence, `steps[${index}].confidence`),
  };
}

function normalizeNamedChild(input, index, kind) {
  return {
    key: normalizeKey(input.key || input[`${kind}_key`] || input.name_en || input.name || `${kind}_${index + 1}`, `${kind}s[${index}].key`),
    name_en: nullableString(input.name_en || input.name),
    name_bg: nullableString(input.name_bg),
    confidence: nullableConfidence(input.confidence, `${kind}s[${index}].confidence`),
    evidence_text: nullableString(input.evidence_text),
  };
}

function normalizeTag(input, index) {
  return {
    tag_type: normalizeKey(input.tag_type || 'general', `tags[${index}].tag_type`),
    tag_key: normalizeKey(input.tag_key || input.key || input.tag_value || `tag_${index + 1}`, `tags[${index}].tag_key`),
    tag_value: nullableString(input.tag_value || input.value),
    confidence: nullableConfidence(input.confidence, `tags[${index}].confidence`),
    evidence_text: nullableString(input.evidence_text),
  };
}

function normalizeStateChange(input, index) {
  return {
    state_change_key: normalizeKey(input.state_change_key || input.key || `state_change_${index + 1}`, `state_changes[${index}].state_change_key`),
    ingredient_name: nullableString(input.ingredient_name),
    from_state: nullableString(input.from_state),
    to_state: nullableString(input.to_state),
    confidence: nullableConfidence(input.confidence, `state_changes[${index}].confidence`),
    evidence_text: nullableString(input.evidence_text),
  };
}

function normalizeSubstitutionHint(input, index) {
  return {
    substitution_key: normalizeKey(input.substitution_key || input.key || `substitution_${index + 1}`, `substitution_hints[${index}].substitution_key`),
    original_ingredient_name: nullableString(input.original_ingredient_name),
    substitute_ingredient_name: nullableString(input.substitute_ingredient_name),
    reason: nullableString(input.reason),
    confidence: nullableConfidence(input.confidence, `substitution_hints[${index}].confidence`),
    evidence_text: nullableString(input.evidence_text),
  };
}

function normalizeQualitySignal(input, index) {
  return {
    signal_key: normalizeKey(input.signal_key || input.key || input.signal_name || `quality_${index + 1}`, `quality_signals[${index}].signal_key`),
    signal_name: nullableString(input.signal_name || input.name),
    signal_value: nullableString(input.signal_value || input.value),
    severity: nullableString(input.severity),
    confidence: nullableConfidence(input.confidence, `quality_signals[${index}].confidence`),
    evidence_text: nullableString(input.evidence_text),
  };
}

function normalizeObjectArray(value, fieldName) {
  if (value === undefined || value === null) {
    return OPTIONAL_ARRAY_FIELDS.includes(fieldName) ? [] : [];
  }
  if (!Array.isArray(value)) {
    throw validationError(`${fieldName} must be an array.`);
  }
  return value.map((entry, index) => requireObject(entry, `${fieldName}[${index}]`));
}

function normalizeStringArray(value, fieldName) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw validationError(`${fieldName} must be an array.`);
  return value.map((entry) => nullableString(entry)).filter(Boolean);
}

function normalizeObject(value, fieldName) {
  if (value === undefined || value === null) return {};
  return requireObject(value, fieldName);
}

function requireObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(`${fieldName} must be an object.`);
  }
  return { ...value };
}

function normalizeKey(value, fieldName) {
  const normalized = normalizeName(value);
  if (!normalized) throw validationError(`${fieldName} is required.`);
  return normalized;
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}0-9]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function firstString(...values) {
  return values.map(nullableString).find(Boolean) || null;
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function nullableNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw validationError(`${fieldName} must be numeric or null.`);
  }
  return normalized;
}

function nullableConfidence(value, fieldName) {
  const normalized = nullableNumber(value, fieldName);
  if (normalized === null) return null;
  if (normalized < 0 || normalized > 1) {
    throw validationError(`${fieldName} must be between 0 and 1.`);
  }
  return normalized;
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function validationError(message) {
  const error = new Error(message);
  error.code = 'recipe_extraction_validation';
  return error;
}

module.exports = {
  parseRecipeExtractionJson,
  validateRecipeExtractionPayload,
};
