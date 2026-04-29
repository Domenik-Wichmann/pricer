const DEFAULT_RECIPE_PROFILE_CANDIDATE_LIMIT = 100;
const RECIPE_NUTRITION_PROFILE_METHOD = 'deterministic_recipe_ingredient_profiles_v1';
const RECIPE_NUTRITION_PROFILE_RULES_VERSION = 'db4b_recipe_nutrition_profiles_v1';

async function generateRecipeNutritionProfileCandidates(client, options = {}) {
  requireClient(client);
  const normalized = normalizeRecipeNutritionProfileOptions(options);
  const sourceRows = await fetchRecipeNutritionProfileSourceRows(client, normalized);
  const candidates = buildRecipeNutritionProfileCandidates(sourceRows);
  const recipeIdsWithCandidates = new Set(candidates.map((candidate) => candidate.recipe_id));
  const recipeIdsSeen = new Set(sourceRows.map((row) => row.recipe_id).filter(Boolean));
  const missingCountsByRecipeId = summarizeMissingNutritionInputs(sourceRows);

  const report = {
    dry_run: normalized.dryRun,
    recipes_seen: recipeIdsSeen.size,
    recipes_with_profiles: candidates.length,
    recipes_missing_data: 0,
    ingredients_missing_total: [...missingCountsByRecipeId.values()].reduce((sum, count) => sum + count, 0),
    upserted: 0,
    errors: [],
    candidates,
  };

  for (const recipeId of recipeIdsSeen) {
    const missingCount = missingCountsByRecipeId.get(recipeId) || 0;
    if (!recipeIdsWithCandidates.has(recipeId) || missingCount > 0) {
      report.recipes_missing_data += 1;
    }
    if (!recipeIdsWithCandidates.has(recipeId)) {
      report.errors.push({
        recipe_id: recipeId,
        reason: 'zero_valid_ingredients',
      });
    }
  }

  if (!normalized.dryRun && candidates.length > 0) {
    const upserted = await upsertRecipeNutritionProfileCandidates(client, candidates);
    report.upserted = upserted.length;
    report.candidates = upserted;
  }

  return report;
}

function summarizeMissingNutritionInputs(rows = []) {
  const missingByRecipeId = new Map();
  for (const row of rows) {
    if (!row || !row.recipe_id || !row.recipe_ingredient_id) continue;
    const grams = nullableNumber(row.quantity_grams);
    if (!grams || grams <= 0 || !row.profile_id) {
      missingByRecipeId.set(row.recipe_id, (missingByRecipeId.get(row.recipe_id) || 0) + 1);
    }
  }
  return missingByRecipeId;
}

async function fetchRecipeNutritionProfileSourceRows(client, {
  limit = DEFAULT_RECIPE_PROFILE_CANDIDATE_LIMIT,
  recipeKey = null,
} = {}) {
  requireClient(client);
  const params = [];
  const recipeFilter = nullableString(recipeKey);
  let whereSql = '';
  if (recipeFilter) {
    params.push(recipeFilter);
    whereSql = `WHERE recipe_key = $${params.length}`;
  }
  params.push(positiveInteger(limit, DEFAULT_RECIPE_PROFILE_CANDIDATE_LIMIT));

  const result = await client.query(`
    WITH selected_recipes AS (
      SELECT *
      FROM recipes
      ${whereSql}
      ORDER BY recipe_key ASC
      LIMIT $${params.length}
    ),
    approved_profiles AS (
      SELECT *
      FROM (
        SELECT
          p.*,
          ROW_NUMBER() OVER (
            PARTITION BY p.ingredient_id
            ORDER BY
              CASE
                WHEN p.mapping_type = 'default_raw' THEN 0
                WHEN p.mapping_type = 'default_cooked' THEN 1
                ELSE 2
              END ASC,
              p.reviewed_at DESC NULLS LAST,
              p.created_at DESC,
              p.profile_id ASC
          ) AS profile_rank
        FROM ingredient_nutrition_profiles p
        WHERE p.review_status = 'approved'
      ) ranked_profiles
      WHERE profile_rank = 1
    )
    SELECT
      r.recipe_id,
      r.recipe_key,
      r.servings,
      ri.recipe_ingredient_id,
      ri.ingredient_id,
      ri.quantity_grams,
      ri.sort_order,
      p.profile_id,
      p.kcal_per_100g,
      p.protein_g_per_100g,
      p.fat_g_per_100g,
      p.carbs_g_per_100g,
      p.fiber_g_per_100g,
      p.sugar_g_per_100g,
      p.sodium_mg_per_100g
    FROM selected_recipes r
    LEFT JOIN recipe_ingredients ri
      ON ri.recipe_id = r.recipe_id
    LEFT JOIN approved_profiles p
      ON p.ingredient_id = ri.ingredient_id
    ORDER BY r.recipe_key ASC, ri.sort_order ASC, ri.recipe_ingredient_id ASC
  `, params);
  return result.rows || [];
}

function buildRecipeNutritionProfileCandidates(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    if (!row || !row.recipe_id) continue;
    if (!grouped.has(row.recipe_id)) {
      grouped.set(row.recipe_id, {
        recipe_id: row.recipe_id,
        recipe_key: row.recipe_key,
        servings: positiveNumberOrDefault(row.servings, 1),
        ingredient_rows: [],
      });
    }
    if (row.recipe_ingredient_id) {
      grouped.get(row.recipe_id).ingredient_rows.push(row);
    }
  }

  return [...grouped.values()]
    .map(buildCandidateForRecipe)
    .filter(Boolean);
}

function buildCandidateForRecipe(recipeGroup) {
  const ingredientRows = recipeGroup.ingredient_rows;
  const totals = emptyNutritionTotals();
  const missingIngredientIds = [];
  const sourceProfileIds = [];
  let withNutrition = 0;
  let missingNutrition = 0;

  for (const row of ingredientRows) {
    const grams = nullableNumber(row.quantity_grams);
    if (!grams || grams <= 0 || !row.profile_id) {
      missingNutrition += 1;
      if (row.ingredient_id) missingIngredientIds.push(row.ingredient_id);
      continue;
    }

    withNutrition += 1;
    sourceProfileIds.push(row.profile_id);
    addScaledIngredientNutrition(totals, row, grams);
  }

  if (withNutrition === 0) return null;

  const ingredientCount = ingredientRows.length;
  const servings = positiveNumberOrDefault(recipeGroup.servings, 1);
  return {
    recipe_profile_candidate_id: buildRecipeNutritionProfileCandidateId(recipeGroup.recipe_id),
    recipe_id: recipeGroup.recipe_id,
    total_kcal: roundNumber(totals.kcal),
    total_protein_g: roundNumber(totals.protein_g),
    total_fat_g: roundNumber(totals.fat_g),
    total_carbs_g: roundNumber(totals.carbs_g),
    total_fiber_g: roundNumber(totals.fiber_g),
    total_sugar_g: roundNumber(totals.sugar_g),
    total_sodium_mg: roundNumber(totals.sodium_mg),
    per_serving_kcal: roundNumber(totals.kcal / servings),
    per_serving_protein_g: roundNumber(totals.protein_g / servings),
    per_serving_fat_g: roundNumber(totals.fat_g / servings),
    per_serving_carbs_g: roundNumber(totals.carbs_g / servings),
    per_serving_fiber_g: roundNumber(totals.fiber_g / servings),
    per_serving_sugar_g: roundNumber(totals.sugar_g / servings),
    per_serving_sodium_mg: roundNumber(totals.sodium_mg / servings),
    servings,
    ingredient_count: ingredientCount,
    ingredients_with_nutrition: withNutrition,
    ingredients_missing_nutrition: missingNutrition,
    missing_ingredient_ids_json: uniqueArray(missingIngredientIds),
    source_profile_ids_json: uniqueArray(sourceProfileIds),
    confidence: assignRecipeNutritionConfidence({ withNutrition, ingredientCount }),
    review_status: 'candidate',
    generation_method: RECIPE_NUTRITION_PROFILE_METHOD,
    rules_version: RECIPE_NUTRITION_PROFILE_RULES_VERSION,
  };
}

async function upsertRecipeNutritionProfileCandidates(client, candidates = []) {
  requireClient(client);
  const rows = [];
  for (const candidate of candidates) {
    const record = normalizeRecipeNutritionProfileCandidate(candidate);
    const result = await client.query(`
      INSERT INTO recipe_nutrition_profile_candidates (
        recipe_profile_candidate_id,
        recipe_id,
        total_kcal,
        total_protein_g,
        total_fat_g,
        total_carbs_g,
        total_fiber_g,
        total_sugar_g,
        total_sodium_mg,
        per_serving_kcal,
        per_serving_protein_g,
        per_serving_fat_g,
        per_serving_carbs_g,
        per_serving_fiber_g,
        per_serving_sugar_g,
        per_serving_sodium_mg,
        servings,
        ingredient_count,
        ingredients_with_nutrition,
        ingredients_missing_nutrition,
        missing_ingredient_ids_json,
        source_profile_ids_json,
        confidence,
        review_status,
        generation_method,
        rules_version
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21::jsonb, $22::jsonb,
        $23, $24, $25, $26
      )
      ON CONFLICT (recipe_id) DO UPDATE SET
        total_kcal = EXCLUDED.total_kcal,
        total_protein_g = EXCLUDED.total_protein_g,
        total_fat_g = EXCLUDED.total_fat_g,
        total_carbs_g = EXCLUDED.total_carbs_g,
        total_fiber_g = EXCLUDED.total_fiber_g,
        total_sugar_g = EXCLUDED.total_sugar_g,
        total_sodium_mg = EXCLUDED.total_sodium_mg,
        per_serving_kcal = EXCLUDED.per_serving_kcal,
        per_serving_protein_g = EXCLUDED.per_serving_protein_g,
        per_serving_fat_g = EXCLUDED.per_serving_fat_g,
        per_serving_carbs_g = EXCLUDED.per_serving_carbs_g,
        per_serving_fiber_g = EXCLUDED.per_serving_fiber_g,
        per_serving_sugar_g = EXCLUDED.per_serving_sugar_g,
        per_serving_sodium_mg = EXCLUDED.per_serving_sodium_mg,
        servings = EXCLUDED.servings,
        ingredient_count = EXCLUDED.ingredient_count,
        ingredients_with_nutrition = EXCLUDED.ingredients_with_nutrition,
        ingredients_missing_nutrition = EXCLUDED.ingredients_missing_nutrition,
        missing_ingredient_ids_json = EXCLUDED.missing_ingredient_ids_json,
        source_profile_ids_json = EXCLUDED.source_profile_ids_json,
        confidence = EXCLUDED.confidence,
        generation_method = EXCLUDED.generation_method,
        rules_version = EXCLUDED.rules_version,
        updated_at = NOW()
      RETURNING *
    `, recipeNutritionProfileCandidateParams(record));
    rows.push(hydrateRecipeNutritionProfileCandidateRow(result.rows[0]));
  }
  return rows;
}

function normalizeRecipeNutritionProfileCandidate(input = {}) {
  return {
    ...input,
    recipe_profile_candidate_id: requiredString(input.recipe_profile_candidate_id || input.recipeProfileCandidateId, 'recipe_profile_candidate_id'),
    recipe_id: requiredString(input.recipe_id || input.recipeId, 'recipe_id'),
    servings: positiveNumberOrDefault(input.servings, 1),
    ingredient_count: nonNegativeInteger(input.ingredient_count ?? input.ingredientCount, 'ingredient_count'),
    ingredients_with_nutrition: nonNegativeInteger(input.ingredients_with_nutrition ?? input.ingredientsWithNutrition, 'ingredients_with_nutrition'),
    ingredients_missing_nutrition: nonNegativeInteger(input.ingredients_missing_nutrition ?? input.ingredientsMissingNutrition, 'ingredients_missing_nutrition'),
    missing_ingredient_ids_json: normalizeJsonArray(input.missing_ingredient_ids_json || input.missingIngredientIdsJson || []),
    source_profile_ids_json: normalizeJsonArray(input.source_profile_ids_json || input.sourceProfileIdsJson || []),
    confidence: normalizeConfidence(input.confidence),
    review_status: normalizeReviewStatus(input.review_status || input.reviewStatus || 'candidate'),
    generation_method: requiredString(input.generation_method || input.generationMethod || RECIPE_NUTRITION_PROFILE_METHOD, 'generation_method'),
    rules_version: requiredString(input.rules_version || input.rulesVersion || RECIPE_NUTRITION_PROFILE_RULES_VERSION, 'rules_version'),
  };
}

function recipeNutritionProfileCandidateParams(record) {
  return [
    record.recipe_profile_candidate_id,
    record.recipe_id,
    record.total_kcal,
    record.total_protein_g,
    record.total_fat_g,
    record.total_carbs_g,
    record.total_fiber_g,
    record.total_sugar_g,
    record.total_sodium_mg,
    record.per_serving_kcal,
    record.per_serving_protein_g,
    record.per_serving_fat_g,
    record.per_serving_carbs_g,
    record.per_serving_fiber_g,
    record.per_serving_sugar_g,
    record.per_serving_sodium_mg,
    record.servings,
    record.ingredient_count,
    record.ingredients_with_nutrition,
    record.ingredients_missing_nutrition,
    JSON.stringify(record.missing_ingredient_ids_json),
    JSON.stringify(record.source_profile_ids_json),
    record.confidence,
    record.review_status,
    record.generation_method,
    record.rules_version,
  ];
}

function hydrateRecipeNutritionProfileCandidateRow(row) {
  if (!row) return null;
  return {
    ...row,
    missing_ingredient_ids_json: parseJson(row.missing_ingredient_ids_json, []),
    source_profile_ids_json: parseJson(row.source_profile_ids_json, []),
  };
}

function normalizeRecipeNutritionProfileOptions(options = {}) {
  return {
    dryRun: Boolean(options.dryRun || options.dry_run),
    limit: positiveInteger(options.limit, DEFAULT_RECIPE_PROFILE_CANDIDATE_LIMIT),
    recipeKey: nullableString(options.recipeKey || options.recipe || options.recipe_key),
  };
}

function addScaledIngredientNutrition(totals, row, grams) {
  const scale = grams / 100;
  totals.kcal += nullableNumber(row.kcal_per_100g) * scale;
  totals.protein_g += nullableNumber(row.protein_g_per_100g) * scale;
  totals.fat_g += nullableNumber(row.fat_g_per_100g) * scale;
  totals.carbs_g += nullableNumber(row.carbs_g_per_100g) * scale;
  totals.fiber_g += nullableNumber(row.fiber_g_per_100g) * scale;
  totals.sugar_g += nullableNumber(row.sugar_g_per_100g) * scale;
  totals.sodium_mg += nullableNumber(row.sodium_mg_per_100g) * scale;
}

function emptyNutritionTotals() {
  return {
    kcal: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    sodium_mg: 0,
  };
}

function assignRecipeNutritionConfidence({ withNutrition, ingredientCount }) {
  if (ingredientCount > 0 && withNutrition === ingredientCount) return 'high';
  const ratio = ingredientCount > 0 ? withNutrition / ingredientCount : 0;
  if (ratio > 0.7) return 'medium';
  return 'low';
}

function buildRecipeNutritionProfileCandidateId(recipeId) {
  return `recipe_nutrition_profile_candidate:${slugify(recipeId)}`;
}

function uniqueArray(values) {
  return [...new Set((values || []).filter(Boolean).map(String))];
}

function normalizeJsonArray(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    const parsed = parseJson(value, null);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return [String(value)].filter(Boolean);
}

function normalizeConfidence(value) {
  const normalized = requiredString(value, 'confidence');
  if (!['high', 'medium', 'low'].includes(normalized)) {
    throw new Error(`Unsupported recipe nutrition confidence: ${value}`);
  }
  return normalized;
}

function normalizeReviewStatus(value) {
  const normalized = requiredString(value, 'review_status');
  if (!['candidate', 'approved', 'rejected', 'needs_review'].includes(normalized)) {
    throw new Error(`Unsupported recipe nutrition review_status: ${value}`);
  }
  return normalized;
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function nonNegativeInteger(value, fieldName) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) throw new Error(`${fieldName} must be a nonnegative integer.`);
  return normalized;
}

function positiveNumberOrDefault(value, fallback) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return 0;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
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

function roundNumber(value, decimals = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
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

function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_RECIPE_PROFILE_CANDIDATE_LIMIT,
  RECIPE_NUTRITION_PROFILE_METHOD,
  RECIPE_NUTRITION_PROFILE_RULES_VERSION,
  assignRecipeNutritionConfidence,
  buildRecipeNutritionProfileCandidateId,
  buildRecipeNutritionProfileCandidates,
  fetchRecipeNutritionProfileSourceRows,
  generateRecipeNutritionProfileCandidates,
  hydrateRecipeNutritionProfileCandidateRow,
  normalizeRecipeNutritionProfileCandidate,
  normalizeRecipeNutritionProfileOptions,
  summarizeMissingNutritionInputs,
  upsertRecipeNutritionProfileCandidates,
};
