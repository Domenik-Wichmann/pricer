const DEFAULT_INGREDIENT_RULES_VERSION = 'db3a_ingredient_rules_v1';
const DEFAULT_INGREDIENT_GENERATION_METHOD = 'fixture_seed_v1';
const SUPPORTED_INGREDIENT_REVIEW_STATUSES = ['draft', 'active', 'rejected', 'needs_review'];

async function createIngredient(client, ingredient) {
  requireClient(client);
  const record = normalizeIngredientRecord(ingredient);
  const result = await client.query(`
    INSERT INTO ingredients (
      ingredient_id, ingredient_key, name_en, name_bg, canonical_name, normalized_name,
      ingredient_type, food_family, default_unit, shopping_unit, density_g_per_ml,
      grams_per_piece, edible_portion_factor, aliases_json, tags_json, state_defaults_json,
      allergen_flags_json, dietary_flags_json, review_status, source, generation_method,
      rules_version
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14::jsonb, $15::jsonb, $16::jsonb,
      $17::jsonb, $18::jsonb, $19, $20, $21,
      $22
    )
    RETURNING *
  `, ingredientParams(record));
  return hydrateIngredientRow(result.rows[0]);
}

async function upsertIngredientByKey(client, ingredient) {
  requireClient(client);
  const record = normalizeIngredientRecord(ingredient);
  const result = await client.query(`
    INSERT INTO ingredients (
      ingredient_id, ingredient_key, name_en, name_bg, canonical_name, normalized_name,
      ingredient_type, food_family, default_unit, shopping_unit, density_g_per_ml,
      grams_per_piece, edible_portion_factor, aliases_json, tags_json, state_defaults_json,
      allergen_flags_json, dietary_flags_json, review_status, source, generation_method,
      rules_version
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14::jsonb, $15::jsonb, $16::jsonb,
      $17::jsonb, $18::jsonb, $19, $20, $21,
      $22
    )
    ON CONFLICT (ingredient_key) DO UPDATE SET
      name_en = EXCLUDED.name_en,
      name_bg = EXCLUDED.name_bg,
      canonical_name = EXCLUDED.canonical_name,
      normalized_name = EXCLUDED.normalized_name,
      ingredient_type = EXCLUDED.ingredient_type,
      food_family = EXCLUDED.food_family,
      default_unit = EXCLUDED.default_unit,
      shopping_unit = EXCLUDED.shopping_unit,
      density_g_per_ml = EXCLUDED.density_g_per_ml,
      grams_per_piece = EXCLUDED.grams_per_piece,
      edible_portion_factor = EXCLUDED.edible_portion_factor,
      aliases_json = EXCLUDED.aliases_json,
      tags_json = EXCLUDED.tags_json,
      state_defaults_json = EXCLUDED.state_defaults_json,
      allergen_flags_json = EXCLUDED.allergen_flags_json,
      dietary_flags_json = EXCLUDED.dietary_flags_json,
      review_status = EXCLUDED.review_status,
      source = EXCLUDED.source,
      generation_method = EXCLUDED.generation_method,
      rules_version = EXCLUDED.rules_version,
      updated_at = NOW()
    RETURNING *
  `, ingredientParams(record));
  return hydrateIngredientRow(result.rows[0]);
}

async function getIngredientById(client, ingredientId) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM ingredients WHERE ingredient_id = $1',
    [requiredString(ingredientId, 'ingredient_id')],
  );
  return hydrateIngredientRow(result.rows[0] || null);
}

async function getIngredientByKey(client, ingredientKey) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM ingredients WHERE ingredient_key = $1',
    [normalizeIngredientKey(ingredientKey)],
  );
  return hydrateIngredientRow(result.rows[0] || null);
}

async function searchIngredients(client, { query, limit = 25 } = {}) {
  requireClient(client);
  const normalized = normalizeName(requiredString(query, 'query'));
  const result = await client.query(`
    SELECT *
    FROM ingredients
    WHERE normalized_name ILIKE $1
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(
           COALESCE(aliases_json->'all', '[]'::jsonb)
         ) AS alias_value
         WHERE alias_value ILIKE $1
       )
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(
           COALESCE(aliases_json->'en', '[]'::jsonb) || COALESCE(aliases_json->'bg', '[]'::jsonb)
         ) AS alias_value
         WHERE alias_value ILIKE $1
       )
    ORDER BY ingredient_key ASC
    LIMIT $2
  `, [`%${normalized}%`, positiveInteger(limit, 25)]);
  return (result.rows || []).map(hydrateIngredientRow);
}

async function listIngredientsByReviewStatus(client, reviewStatus, { limit = 1000 } = {}) {
  requireClient(client);
  const status = normalizeReviewStatus(reviewStatus);
  const result = await client.query(`
    SELECT *
    FROM ingredients
    WHERE review_status = $1
    ORDER BY ingredient_key ASC
    LIMIT $2
  `, [status, positiveInteger(limit, 1000)]);
  return (result.rows || []).map(hydrateIngredientRow);
}

function deleteIngredient() {
  throw new Error('Ingredients are append-preserving canonical records and must not be deleted.');
}

function normalizeIngredientRecord(input = {}) {
  const key = normalizeIngredientKey(input.ingredient_key || input.ingredientKey || input.key || input.name_en || input.nameEn);
  const nameEn = requiredString(input.name_en || input.nameEn || input.canonical_name || input.canonicalName, 'name_en');
  const canonicalName = requiredString(input.canonical_name || input.canonicalName || nameEn, 'canonical_name');
  return {
    ingredient_id: requiredString(input.ingredient_id || input.ingredientId || `ingredient:${key}`, 'ingredient_id'),
    ingredient_key: key,
    name_en: nameEn,
    name_bg: nullableString(input.name_bg || input.nameBg),
    canonical_name: canonicalName,
    normalized_name: normalizeName(input.normalized_name || input.normalizedName || canonicalName),
    ingredient_type: requiredString(input.ingredient_type || input.ingredientType || 'whole_food', 'ingredient_type'),
    food_family: requiredString(input.food_family || input.foodFamily || 'uncategorized', 'food_family'),
    default_unit: requiredString(input.default_unit || input.defaultUnit || 'g', 'default_unit'),
    shopping_unit: requiredString(input.shopping_unit || input.shoppingUnit || input.default_unit || input.defaultUnit || 'g', 'shopping_unit'),
    density_g_per_ml: nullableNumber(input.density_g_per_ml ?? input.densityGPerMl, 'density_g_per_ml'),
    grams_per_piece: nullableNumber(input.grams_per_piece ?? input.gramsPerPiece, 'grams_per_piece'),
    edible_portion_factor: nullableNumber(input.edible_portion_factor ?? input.ediblePortionFactor, 'edible_portion_factor'),
    aliases_json: normalizeAliasesJson(input.aliases_json || input.aliasesJson || input.aliases || {}),
    tags_json: normalizeJsonObject(input.tags_json || input.tagsJson || input.tags || {}),
    state_defaults_json: normalizeJsonObject(input.state_defaults_json || input.stateDefaultsJson || {}),
    allergen_flags_json: normalizeJsonObject(input.allergen_flags_json || input.allergenFlagsJson || {}),
    dietary_flags_json: normalizeJsonObject(input.dietary_flags_json || input.dietaryFlagsJson || {}),
    review_status: normalizeReviewStatus(input.review_status || input.reviewStatus || 'draft'),
    source: requiredString(input.source || 'fixture_seed', 'source'),
    generation_method: requiredString(input.generation_method || input.generationMethod || DEFAULT_INGREDIENT_GENERATION_METHOD, 'generation_method'),
    rules_version: requiredString(input.rules_version || input.rulesVersion || DEFAULT_INGREDIENT_RULES_VERSION, 'rules_version'),
  };
}

function ingredientParams(record) {
  return [
    record.ingredient_id, record.ingredient_key, record.name_en, record.name_bg,
    record.canonical_name, record.normalized_name, record.ingredient_type,
    record.food_family, record.default_unit, record.shopping_unit,
    record.density_g_per_ml, record.grams_per_piece, record.edible_portion_factor,
    JSON.stringify(record.aliases_json), JSON.stringify(record.tags_json),
    JSON.stringify(record.state_defaults_json), JSON.stringify(record.allergen_flags_json),
    JSON.stringify(record.dietary_flags_json), record.review_status, record.source,
    record.generation_method, record.rules_version,
  ];
}

function hydrateIngredientRow(row) {
  if (!row) return null;
  return {
    ...row,
    aliases_json: parseJson(row.aliases_json, {}),
    tags_json: parseJson(row.tags_json, {}),
    state_defaults_json: parseJson(row.state_defaults_json, {}),
    allergen_flags_json: parseJson(row.allergen_flags_json, {}),
    dietary_flags_json: parseJson(row.dietary_flags_json, {}),
  };
}

function normalizeAliasesJson(value) {
  const parsed = normalizeJsonObject(value);
  const en = normalizeAliasArray(parsed.en || parsed.aliases_en || parsed.aliasesEn);
  const bg = normalizeAliasArray(parsed.bg || parsed.aliases_bg || parsed.aliasesBg);
  const all = [...new Set([...en, ...bg, ...normalizeAliasArray(parsed.all)])]
    .map(normalizeName)
    .filter(Boolean);
  return { en, bg, all };
}

function normalizeJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'string') return parseJson(value, {});
  if (Array.isArray(value)) return { values: value };
  return { ...value };
}

function normalizeAliasArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((entry) => entry.trim()).filter(Boolean);
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean);
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
  if (!SUPPORTED_INGREDIENT_REVIEW_STATUSES.includes(status)) {
    throw new Error(`Unsupported ingredient review_status: ${status}`);
  }
  return status;
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
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

function nullableNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) throw new Error(`${fieldName} must be numeric.`);
  return normalized;
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
  DEFAULT_INGREDIENT_GENERATION_METHOD,
  DEFAULT_INGREDIENT_RULES_VERSION,
  SUPPORTED_INGREDIENT_REVIEW_STATUSES,
  createIngredient,
  deleteIngredient,
  getIngredientById,
  getIngredientByKey,
  hydrateIngredientRow,
  listIngredientsByReviewStatus,
  normalizeAliasesJson,
  normalizeIngredientKey,
  normalizeIngredientRecord,
  normalizeName,
  searchIngredients,
  upsertIngredientByKey,
};
