const DEFAULT_RECIPE_RULES_VERSION = 'db4a_recipe_rules_v1';
const DEFAULT_RECIPE_GENERATION_METHOD = 'fixture_seed_v1';
const SUPPORTED_RECIPE_REVIEW_STATUSES = ['draft', 'active', 'rejected', 'needs_review'];

async function upsertRecipeByKey(client, recipe) {
  requireClient(client);
  const record = normalizeRecipeRecord(recipe);
  // Recipe ids are stable Pricer ids. Upsert by key refreshes reviewable
  // metadata while intentionally preserving the original recipe_id.
  const result = await client.query(`
    INSERT INTO recipes (
      recipe_id,
      recipe_key,
      title_en,
      title_bg,
      canonical_title,
      normalized_title,
      description,
      cuisine_tags_json,
      dietary_tags_json,
      meal_type_tags_json,
      servings,
      yield_quantity,
      yield_unit,
      source,
      review_status,
      generation_method,
      rules_version
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8::jsonb, $9::jsonb, $10::jsonb,
      $11, $12, $13, $14, $15, $16, $17
    )
    ON CONFLICT (recipe_key) DO UPDATE SET
      title_en = EXCLUDED.title_en,
      title_bg = EXCLUDED.title_bg,
      canonical_title = EXCLUDED.canonical_title,
      normalized_title = EXCLUDED.normalized_title,
      description = EXCLUDED.description,
      cuisine_tags_json = EXCLUDED.cuisine_tags_json,
      dietary_tags_json = EXCLUDED.dietary_tags_json,
      meal_type_tags_json = EXCLUDED.meal_type_tags_json,
      servings = EXCLUDED.servings,
      yield_quantity = EXCLUDED.yield_quantity,
      yield_unit = EXCLUDED.yield_unit,
      source = EXCLUDED.source,
      review_status = EXCLUDED.review_status,
      generation_method = EXCLUDED.generation_method,
      rules_version = EXCLUDED.rules_version,
      updated_at = NOW()
    RETURNING *
  `, recipeParams(record));
  return hydrateRecipeRow(result.rows[0]);
}

async function upsertRecipeIngredients(client, { recipeId, recipeKey, ingredients = [] } = {}) {
  requireClient(client);
  const id = requiredString(recipeId, 'recipe_id');
  const key = normalizeRecipeKey(recipeKey || recipeId);
  const rows = [];
  for (let index = 0; index < ingredients.length; index += 1) {
    // DB4A links only to existing DB3A ingredients. Callers must supply
    // ingredient_id after validation; this repository never auto-creates it.
    const record = normalizeRecipeIngredientRecord(ingredients[index], {
      recipeId: id,
      recipeKey: key,
      sortOrder: index + 1,
    });
    const result = await client.query(`
      INSERT INTO recipe_ingredients (
        recipe_ingredient_id,
        recipe_id,
        ingredient_id,
        matched_ingredient_id,
        ingredient_key_snapshot,
        display_name,
        quantity,
        unit,
        quantity_grams,
        preparation_note,
        optional,
        sort_order,
        match_method,
        match_confidence,
        review_status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (recipe_ingredient_id) DO UPDATE SET
        ingredient_id = EXCLUDED.ingredient_id,
        matched_ingredient_id = EXCLUDED.matched_ingredient_id,
        ingredient_key_snapshot = EXCLUDED.ingredient_key_snapshot,
        display_name = EXCLUDED.display_name,
        quantity = EXCLUDED.quantity,
        unit = EXCLUDED.unit,
        quantity_grams = EXCLUDED.quantity_grams,
        preparation_note = EXCLUDED.preparation_note,
        optional = EXCLUDED.optional,
        sort_order = EXCLUDED.sort_order,
        match_method = EXCLUDED.match_method,
        match_confidence = EXCLUDED.match_confidence,
        review_status = EXCLUDED.review_status,
        updated_at = NOW()
      RETURNING *
    `, recipeIngredientParams(record));
    rows.push(hydrateRecipeIngredientRow(result.rows[0]));
  }
  return rows;
}

async function upsertRecipeSteps(client, { recipeId, recipeKey, steps = [] } = {}) {
  requireClient(client);
  const id = requiredString(recipeId, 'recipe_id');
  const key = normalizeRecipeKey(recipeKey || recipeId);
  const rows = [];
  for (let index = 0; index < steps.length; index += 1) {
    // Deterministic step ids keep repeated fixture seeding idempotent without
    // deleting prior recipe or step history.
    const record = normalizeRecipeStepRecord(steps[index], {
      recipeId: id,
      recipeKey: key,
      stepNumber: index + 1,
    });
    const result = await client.query(`
      INSERT INTO recipe_steps (
        recipe_step_id,
        recipe_id,
        step_number,
        instruction,
        duration_minutes,
        temperature_c,
        equipment_tags_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (recipe_step_id) DO UPDATE SET
        step_number = EXCLUDED.step_number,
        instruction = EXCLUDED.instruction,
        duration_minutes = EXCLUDED.duration_minutes,
        temperature_c = EXCLUDED.temperature_c,
        equipment_tags_json = EXCLUDED.equipment_tags_json,
        updated_at = NOW()
      RETURNING *
    `, recipeStepParams(record));
    rows.push(hydrateRecipeStepRow(result.rows[0]));
  }
  return rows;
}

async function getRecipeDetail(client, { recipeId = null, recipeKey = null } = {}) {
  requireClient(client);
  const recipe = await getRecipeRow(client, { recipeId, recipeKey });
  if (!recipe) return null;

  const ingredientResult = await client.query(`
    SELECT ri.*
    FROM recipe_ingredients ri
    WHERE ri.recipe_id = $1
    ORDER BY ri.sort_order ASC, ri.recipe_ingredient_id ASC
  `, [recipe.recipe_id]);

  const stepResult = await client.query(`
    SELECT rs.*
    FROM recipe_steps rs
    WHERE rs.recipe_id = $1
    ORDER BY rs.step_number ASC, rs.recipe_step_id ASC
  `, [recipe.recipe_id]);

  return {
    recipe,
    ingredients: (ingredientResult.rows || []).map(hydrateRecipeIngredientRow),
    steps: (stepResult.rows || []).map(hydrateRecipeStepRow),
  };
}

async function getRecipeByKey(client, recipeKey) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM recipes WHERE recipe_key = $1',
    [normalizeRecipeKey(recipeKey)],
  );
  return hydrateRecipeRow(result.rows[0] || null);
}

async function getRecipeById(client, recipeId) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM recipes WHERE recipe_id = $1',
    [requiredString(recipeId, 'recipe_id')],
  );
  return hydrateRecipeRow(result.rows[0] || null);
}

async function listRecipesByReviewStatus(client, reviewStatus, { limit = 1000 } = {}) {
  requireClient(client);
  const status = normalizeReviewStatus(reviewStatus);
  const result = await client.query(`
    SELECT *
    FROM recipes
    WHERE review_status = $1
    ORDER BY recipe_key ASC
    LIMIT $2
  `, [status, positiveInteger(limit, 1000)]);
  return (result.rows || []).map(hydrateRecipeRow);
}

async function searchRecipesByNormalizedTitle(client, { query, limit = 25 } = {}) {
  requireClient(client);
  const normalized = normalizeName(requiredString(query, 'query'));
  const result = await client.query(`
    SELECT *
    FROM recipes
    WHERE normalized_title ILIKE $1
       OR title_en ILIKE $2
       OR title_bg ILIKE $2
    ORDER BY recipe_key ASC
    LIMIT $3
  `, [`%${normalized}%`, `%${requiredString(query, 'query')}%`, positiveInteger(limit, 25)]);
  return (result.rows || []).map(hydrateRecipeRow);
}

async function getIngredientsByKeys(client, ingredientKeys = []) {
  requireClient(client);
  const keys = [...new Set((ingredientKeys || []).map(normalizeIngredientKey))];
  if (keys.length === 0) return [];
  const result = await client.query(`
    SELECT ingredient_id, ingredient_key, name_en, name_bg
    FROM ingredients
    WHERE ingredient_key = ANY($1::text[])
    ORDER BY ingredient_key ASC
  `, [keys]);
  return result.rows || [];
}

function deleteRecipe() {
  throw new Error('Recipes are append-preserving canonical records and must not be deleted.');
}

async function getRecipeRow(client, { recipeId, recipeKey }) {
  if (recipeId) return getRecipeById(client, recipeId);
  if (recipeKey) return getRecipeByKey(client, recipeKey);
  throw new Error('recipe_id or recipe_key is required.');
}

function normalizeRecipeRecord(input = {}) {
  const key = normalizeRecipeKey(input.recipe_key || input.recipeKey || input.key || input.title_en || input.titleEn);
  const titleEn = requiredString(input.title_en || input.titleEn || input.canonical_title || input.canonicalTitle, 'title_en');
  const canonicalTitle = requiredString(input.canonical_title || input.canonicalTitle || titleEn, 'canonical_title');
  return {
    recipe_id: requiredString(input.recipe_id || input.recipeId || `recipe:${key}`, 'recipe_id'),
    recipe_key: key,
    title_en: titleEn,
    title_bg: nullableString(input.title_bg || input.titleBg),
    canonical_title: canonicalTitle,
    normalized_title: normalizeName(input.normalized_title || input.normalizedTitle || canonicalTitle),
    description: nullableString(input.description),
    cuisine_tags_json: normalizeJsonArray(input.cuisine_tags_json || input.cuisineTagsJson || input.cuisine_tags || input.cuisineTags),
    dietary_tags_json: normalizeJsonArray(input.dietary_tags_json || input.dietaryTagsJson || input.dietary_tags || input.dietaryTags),
    meal_type_tags_json: normalizeJsonArray(input.meal_type_tags_json || input.mealTypeTagsJson || input.meal_type_tags || input.mealTypeTags),
    servings: positiveNumber(input.servings, 'servings'),
    yield_quantity: nullableNumber(input.yield_quantity ?? input.yieldQuantity, 'yield_quantity'),
    yield_unit: nullableString(input.yield_unit || input.yieldUnit),
    source: requiredString(input.source || 'fixture_seed', 'source'),
    review_status: normalizeReviewStatus(input.review_status || input.reviewStatus || 'draft'),
    generation_method: requiredString(input.generation_method || input.generationMethod || DEFAULT_RECIPE_GENERATION_METHOD, 'generation_method'),
    rules_version: requiredString(input.rules_version || input.rulesVersion || DEFAULT_RECIPE_RULES_VERSION, 'rules_version'),
  };
}

function normalizeRecipeIngredientRecord(input = {}, { recipeId, recipeKey, sortOrder } = {}) {
  const order = positiveInteger(input.sort_order || input.sortOrder || sortOrder, 1);
  const keySnapshot = normalizeIngredientKey(input.ingredient_key_snapshot || input.ingredientKeySnapshot || input.ingredient_key || input.ingredientKey);
  const matchedIngredientId = nullableString(input.matched_ingredient_id || input.matchedIngredientId || input.ingredient_id || input.ingredientId);
  return {
    recipe_ingredient_id: requiredString(
      input.recipe_ingredient_id || input.recipeIngredientId || `recipe_ingredient:${recipeKey}:${String(order).padStart(3, '0')}`,
      'recipe_ingredient_id',
    ),
    recipe_id: requiredString(input.recipe_id || input.recipeId || recipeId, 'recipe_id'),
    ingredient_id: matchedIngredientId,
    matched_ingredient_id: matchedIngredientId,
    ingredient_key_snapshot: keySnapshot,
    display_name: requiredString(input.display_name || input.displayName || input.name || keySnapshot.replace(/_/g, ' '), 'display_name'),
    quantity: nullableNumber(input.quantity, 'quantity'),
    unit: nullableString(input.unit),
    quantity_grams: nullableNumber(input.quantity_grams ?? input.quantityGrams, 'quantity_grams'),
    preparation_note: nullableString(input.preparation_note || input.preparationNote),
    optional: Boolean(input.optional),
    sort_order: order,
    match_method: requiredString(input.match_method || input.matchMethod || 'existing_ingredient_key', 'match_method'),
    match_confidence: boundedNumber(input.match_confidence ?? input.matchConfidence ?? 1, 'match_confidence', 0, 1),
    review_status: normalizeReviewStatus(input.review_status || input.reviewStatus || 'active'),
  };
}

function normalizeRecipeStepRecord(input = {}, { recipeId, recipeKey, stepNumber } = {}) {
  const number = positiveInteger(input.step_number || input.stepNumber || stepNumber, 1);
  return {
    recipe_step_id: requiredString(
      input.recipe_step_id || input.recipeStepId || `recipe_step:${recipeKey}:${String(number).padStart(3, '0')}`,
      'recipe_step_id',
    ),
    recipe_id: requiredString(input.recipe_id || input.recipeId || recipeId, 'recipe_id'),
    step_number: number,
    instruction: requiredString(input.instruction, 'instruction'),
    duration_minutes: nullableNumber(input.duration_minutes ?? input.durationMinutes, 'duration_minutes'),
    temperature_c: nullableNumber(input.temperature_c ?? input.temperatureC, 'temperature_c'),
    equipment_tags_json: normalizeJsonArray(input.equipment_tags_json || input.equipmentTagsJson || input.equipment_tags || input.equipmentTags),
  };
}

function recipeParams(record) {
  return [
    record.recipe_id,
    record.recipe_key,
    record.title_en,
    record.title_bg,
    record.canonical_title,
    record.normalized_title,
    record.description,
    JSON.stringify(record.cuisine_tags_json),
    JSON.stringify(record.dietary_tags_json),
    JSON.stringify(record.meal_type_tags_json),
    record.servings,
    record.yield_quantity,
    record.yield_unit,
    record.source,
    record.review_status,
    record.generation_method,
    record.rules_version,
  ];
}

function recipeIngredientParams(record) {
  return [
    record.recipe_ingredient_id,
    record.recipe_id,
    record.ingredient_id,
    record.matched_ingredient_id,
    record.ingredient_key_snapshot,
    record.display_name,
    record.quantity,
    record.unit,
    record.quantity_grams,
    record.preparation_note,
    record.optional,
    record.sort_order,
    record.match_method,
    record.match_confidence,
    record.review_status,
  ];
}

function recipeStepParams(record) {
  return [
    record.recipe_step_id,
    record.recipe_id,
    record.step_number,
    record.instruction,
    record.duration_minutes,
    record.temperature_c,
    JSON.stringify(record.equipment_tags_json),
  ];
}

function hydrateRecipeRow(row) {
  if (!row) return null;
  return {
    ...row,
    cuisine_tags_json: parseJson(row.cuisine_tags_json, []),
    dietary_tags_json: parseJson(row.dietary_tags_json, []),
    meal_type_tags_json: parseJson(row.meal_type_tags_json, []),
  };
}

function hydrateRecipeIngredientRow(row) {
  if (!row) return null;
  return {
    ...row,
    optional: Boolean(row.optional),
  };
}

function hydrateRecipeStepRow(row) {
  if (!row) return null;
  return {
    ...row,
    equipment_tags_json: parseJson(row.equipment_tags_json, []),
  };
}

function normalizeRecipeKey(value) {
  const normalized = normalizeName(requiredString(value, 'recipe_key'));
  if (!normalized) throw new Error('recipe_key is required.');
  return normalized;
}

function normalizeIngredientKey(value) {
  const normalized = normalizeName(requiredString(value, 'ingredient_key'));
  if (!normalized) throw new Error('ingredient_key is required.');
  return normalized;
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}0-9]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeReviewStatus(value) {
  const status = requiredString(value, 'review_status');
  if (!SUPPORTED_RECIPE_REVIEW_STATUSES.includes(status)) {
    throw new Error(`Unsupported recipe review_status: ${status}`);
  }
  return status;
}

function normalizeJsonArray(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map(String).map((entry) => entry.trim()).filter(Boolean);
  if (typeof value === 'string') {
    const parsed = parseJson(value, null);
    if (Array.isArray(parsed)) return parsed.map(String).map((entry) => entry.trim()).filter(Boolean);
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return [String(value).trim()].filter(Boolean);
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function positiveNumber(value, fieldName) {
  const normalized = nullableNumber(value, fieldName);
  if (normalized === null || normalized <= 0) throw new Error(`${fieldName} must be greater than zero.`);
  return normalized;
}

function boundedNumber(value, fieldName, min, max) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < min || normalized > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}.`);
  }
  return normalized;
}

function nullableNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) throw new Error(`${fieldName} must be numeric.`);
  return normalized;
}

function requiredString(value, fieldName) {
  const normalized = nullableString(value);
  if (!normalized) throw new Error(`${fieldName} is required.`);
  return normalized;
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_RECIPE_GENERATION_METHOD,
  DEFAULT_RECIPE_RULES_VERSION,
  SUPPORTED_RECIPE_REVIEW_STATUSES,
  deleteRecipe,
  getIngredientsByKeys,
  getRecipeById,
  getRecipeByKey,
  getRecipeDetail,
  hydrateRecipeIngredientRow,
  hydrateRecipeRow,
  hydrateRecipeStepRow,
  listRecipesByReviewStatus,
  normalizeIngredientKey,
  normalizeName,
  normalizeRecipeIngredientRecord,
  normalizeRecipeKey,
  normalizeRecipeRecord,
  normalizeRecipeStepRecord,
  searchRecipesByNormalizedTitle,
  upsertRecipeByKey,
  upsertRecipeIngredients,
  upsertRecipeSteps,
};
