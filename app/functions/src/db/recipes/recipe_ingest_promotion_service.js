const crypto = require('node:crypto');

const {
  getStagedRecipeDetail,
  listStagedRecipes,
  updateStagedRecipeReviewStatus,
} = require('./recipe_ingest_staging_repository');

const PROMOTION_METHOD = 'db5c_staged_recipe_promotion_v1';
const PROMOTION_RULES_VERSION = 'db5c_recipe_promotion_usability_v1';
const SUPPORTED_PROMOTION_DECISIONS = Object.freeze(['approved', 'rejected', 'needs_review']);
const SUPPORTED_RECIPE_USABILITY_STATUSES = Object.freeze([
  'draft',
  'dormant',
  'needs_ingredient_mapping',
  'needs_nutrition',
  'usable',
  'meal_plan_ready',
]);

async function listRecipePromotionCandidates(client, {
  status = 'staged',
  limit = 100,
} = {}) {
  return listStagedRecipes(client, {
    reviewStatus: status,
    limit,
  });
}

async function getRecipePromotionCandidateDetail(client, {
  jobId = null,
  stagedRecipeId = null,
} = {}) {
  const detail = stagedRecipeId
    ? await getStagedRecipeDetail(client, { stagedRecipeId })
    : await getStagedRecipeDetailByJobId(client, { jobId });
  if (!detail) return null;
  const metrics = await computeRecipePromotionMetrics(client, detail);
  return {
    ...detail,
    metrics,
    usability_status: classifyRecipeUsability(metrics),
  };
}

async function reviewAndPromoteRecipe(client, {
  jobId = null,
  stagedRecipeId = null,
  decision,
  reason = null,
} = {}) {
  requireClient(client);
  const normalizedDecision = normalizeDecision(decision);
  const detail = await getRecipePromotionCandidateDetail(client, { jobId, stagedRecipeId });
  if (!detail) {
    throw new Error('Staged recipe not found for DB5C promotion.');
  }

  if (normalizedDecision === 'needs_review' || normalizedDecision === 'rejected') {
    const updated = await updateStagedRecipeReviewStatus(client, {
      stagedRecipeId: detail.staged_recipe.staged_recipe_id,
      reviewStatus: normalizedDecision,
    });
    const history = await appendRecipePromotionHistory(client, {
      stagedRecipeId: detail.staged_recipe.staged_recipe_id,
      recipeId: null,
      decision: normalizedDecision,
      reason,
      metrics: detail.metrics,
    });
    return {
      action: 'reviewed_staged_recipe',
      decision: normalizedDecision,
      staged_recipe: updated,
      metrics: detail.metrics,
      usability_status: classifyRecipeUsability(detail.metrics),
      history,
    };
  }

  return promoteStagedRecipeToCanonical(client, {
    detail,
    reason,
  });
}

async function promoteStagedRecipeToCanonical(client, {
  detail,
  reason = null,
} = {}) {
  requireClient(client);
  const metrics = detail.metrics || await computeRecipePromotionMetrics(client, detail);
  if (metrics.total_ingredients === 0) {
    await updateStagedRecipeReviewStatus(client, {
      stagedRecipeId: detail.staged_recipe.staged_recipe_id,
      reviewStatus: 'rejected',
    });
    const history = await appendRecipePromotionHistory(client, {
      stagedRecipeId: detail.staged_recipe.staged_recipe_id,
      recipeId: null,
      decision: 'rejected',
      reason: reason || 'Cannot promote a staged recipe with zero ingredients.',
      metrics,
    });
    return {
      action: 'rejected_structurally_invalid',
      decision: 'rejected',
      metrics,
      usability_status: 'rejected',
      gap_candidates: [],
      history,
    };
  }

  const recipeInput = buildRecipeRecordFromStaged(detail, metrics);
  await client.query('BEGIN');
  try {
    const recipe = await upsertPromotedRecipe(client, recipeInput);
    const ingredients = await upsertPromotedRecipeIngredients(client, {
      recipe,
      stagedIngredients: detail.ingredients || [],
    });
    const steps = await upsertPromotedRecipeSteps(client, {
      recipe,
      stagedSteps: detail.steps || [],
    });
    const gapCandidates = [];
    for (const stagedIngredient of detail.ingredients || []) {
      if (!stagedIngredient.matched_ingredient_id) {
        gapCandidates.push(await upsertIngredientGapCandidate(client, {
          recipeId: recipe.recipe_id,
          stagedIngredient,
        }));
      }
    }
    const stagedRecipe = await updateStagedRecipeReviewStatus(client, {
      stagedRecipeId: detail.staged_recipe.staged_recipe_id,
      reviewStatus: 'promoted',
    });
    const history = await appendRecipePromotionHistory(client, {
      stagedRecipeId: detail.staged_recipe.staged_recipe_id,
      recipeId: recipe.recipe_id,
      decision: 'approved',
      reason,
      metrics,
    });
    await client.query('COMMIT');
    return {
      action: 'promoted_to_canonical',
      decision: 'approved',
      recipe,
      staged_recipe: stagedRecipe,
      ingredients,
      steps,
      metrics,
      usability_status: recipe.usability_status,
      gap_candidates: gapCandidates,
      history,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function getStagedRecipeDetailByJobId(client, { jobId } = {}) {
  requireClient(client);
  const id = requiredString(jobId, 'job_id');
  const result = await client.query(`
    SELECT sr.staged_recipe_id
    FROM recipe_ingest_staged_recipes sr
    JOIN recipe_ingest_jobs j
      ON j.job_id = sr.job_id
    WHERE j.job_id = $1
    ORDER BY sr.created_at ASC, sr.staged_recipe_id ASC
    LIMIT 1
  `, [id]);
  const stagedRecipeId = result.rows[0]?.staged_recipe_id;
  return stagedRecipeId ? getStagedRecipeDetail(client, { stagedRecipeId }) : null;
}

async function computeRecipePromotionMetrics(client, detail) {
  const ingredients = detail.ingredients || [];
  const totalIngredients = ingredients.length;
  const matchedIngredientIds = ingredients
    .map((row) => row.matched_ingredient_id)
    .filter(Boolean);
  const uniqueMatchedIds = [...new Set(matchedIngredientIds)];
  const nutritionIds = await fetchApprovedCoverageIds(client, {
    table: 'ingredient_nutrition_profiles',
    ingredientIds: uniqueMatchedIds,
  });
  const productIds = await fetchApprovedCoverageIds(client, {
    table: 'ingredient_product_mappings',
    ingredientIds: uniqueMatchedIds,
  });
  const matchedIngredients = matchedIngredientIds.length;
  const ingredientsWithNutrition = matchedIngredientIds.filter((id) => nutritionIds.has(id)).length;
  const ingredientsWithProducts = matchedIngredientIds.filter((id) => productIds.has(id)).length;
  return {
    total_ingredients: totalIngredients,
    matched_ingredients: matchedIngredients,
    unmatched_ingredients: totalIngredients - matchedIngredients,
    ingredients_with_approved_nutrition: ingredientsWithNutrition,
    ingredients_with_approved_products: ingredientsWithProducts,
    ingredient_match_rate: roundRate(totalIngredients === 0 ? 0 : matchedIngredients / totalIngredients),
    nutrition_coverage_rate: roundRate(totalIngredients === 0 ? 0 : ingredientsWithNutrition / totalIngredients),
    product_coverage_rate: roundRate(totalIngredients === 0 ? 0 : ingredientsWithProducts / totalIngredients),
  };
}

async function fetchApprovedCoverageIds(client, { table, ingredientIds }) {
  if (!ingredientIds || ingredientIds.length === 0) return new Set();
  const result = await client.query(`
    SELECT ingredient_id
    FROM ${table}
    WHERE ingredient_id = ANY($1::text[])
      AND review_status = 'approved'
    GROUP BY ingredient_id
  `, [ingredientIds]);
  return new Set((result.rows || []).map((row) => row.ingredient_id));
}

function classifyRecipeUsability(metrics = {}) {
  const total = Number(metrics.total_ingredients || 0);
  const matchRate = Number(metrics.ingredient_match_rate || 0);
  const nutritionCount = Number(metrics.ingredients_with_approved_nutrition || 0);
  if (total === 0) return 'rejected';
  if (matchRate < 0.4) return 'dormant';
  if (matchRate < 0.7) return 'needs_ingredient_mapping';
  if (nutritionCount <= 0) return 'needs_nutrition';
  return 'usable';
}

function buildRecipeRecordFromStaged(detail, metrics) {
  const staged = detail.staged_recipe;
  const title = requiredString(staged.title_en || staged.title_original, 'title_en');
  const recipeKey = normalizeName(staged.proposed_recipe_key || title);
  return {
    recipe_id: `recipe:${recipeKey}`,
    recipe_key: recipeKey,
    title_en: title,
    title_bg: nullableString(staged.title_bg),
    canonical_title: title,
    normalized_title: normalizeName(title),
    description: nullableString(staged.description),
    cuisine_tags_json: staged.cuisine_tags_json || [],
    dietary_tags_json: staged.dietary_tags_json || [],
    meal_type_tags_json: staged.meal_type_tags_json || [],
    servings: positiveNumber(staged.servings || 1, 'servings'),
    yield_quantity: nullableNumber(staged.yield_quantity),
    yield_unit: nullableString(staged.yield_unit),
    source: 'recipe_ingest_staging',
    review_status: 'active',
    generation_method: PROMOTION_METHOD,
    rules_version: PROMOTION_RULES_VERSION,
    usability_status: normalizeUsabilityStatus(classifyRecipeUsability(metrics)),
    ingredient_match_rate: metrics.ingredient_match_rate,
    nutrition_coverage_rate: metrics.nutrition_coverage_rate,
    product_coverage_rate: metrics.product_coverage_rate,
  };
}

async function upsertPromotedRecipe(client, record) {
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
      rules_version,
      usability_status,
      ingredient_match_rate,
      nutrition_coverage_rate,
      product_coverage_rate,
      last_quality_computed_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8::jsonb, $9::jsonb, $10::jsonb,
      $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, NOW()
    )
    ON CONFLICT (recipe_key) DO UPDATE SET
      title_en = CASE WHEN recipes.review_status = 'active' THEN recipes.title_en ELSE EXCLUDED.title_en END,
      title_bg = CASE WHEN recipes.review_status = 'active' THEN recipes.title_bg ELSE EXCLUDED.title_bg END,
      canonical_title = CASE WHEN recipes.review_status = 'active' THEN recipes.canonical_title ELSE EXCLUDED.canonical_title END,
      normalized_title = CASE WHEN recipes.review_status = 'active' THEN recipes.normalized_title ELSE EXCLUDED.normalized_title END,
      description = CASE WHEN recipes.review_status = 'active' THEN recipes.description ELSE EXCLUDED.description END,
      cuisine_tags_json = CASE WHEN recipes.review_status = 'active' THEN recipes.cuisine_tags_json ELSE EXCLUDED.cuisine_tags_json END,
      dietary_tags_json = CASE WHEN recipes.review_status = 'active' THEN recipes.dietary_tags_json ELSE EXCLUDED.dietary_tags_json END,
      meal_type_tags_json = CASE WHEN recipes.review_status = 'active' THEN recipes.meal_type_tags_json ELSE EXCLUDED.meal_type_tags_json END,
      servings = CASE WHEN recipes.review_status = 'active' THEN recipes.servings ELSE EXCLUDED.servings END,
      yield_quantity = CASE WHEN recipes.review_status = 'active' THEN recipes.yield_quantity ELSE EXCLUDED.yield_quantity END,
      yield_unit = CASE WHEN recipes.review_status = 'active' THEN recipes.yield_unit ELSE EXCLUDED.yield_unit END,
      usability_status = EXCLUDED.usability_status,
      ingredient_match_rate = EXCLUDED.ingredient_match_rate,
      nutrition_coverage_rate = EXCLUDED.nutrition_coverage_rate,
      product_coverage_rate = EXCLUDED.product_coverage_rate,
      last_quality_computed_at = NOW(),
      updated_at = NOW()
    RETURNING *
  `, [
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
    record.usability_status,
    record.ingredient_match_rate,
    record.nutrition_coverage_rate,
    record.product_coverage_rate,
  ]);
  return hydrateJsonFields(result.rows[0], ['cuisine_tags_json', 'dietary_tags_json', 'meal_type_tags_json']);
}

async function upsertPromotedRecipeIngredients(client, { recipe, stagedIngredients }) {
  const rows = [];
  for (let index = 0; index < stagedIngredients.length; index += 1) {
    const staged = stagedIngredients[index];
    const sortOrder = positiveInteger(staged.sort_order, index + 1);
    const matchedIngredientId = nullableString(staged.matched_ingredient_id);
    const ingredientKey = normalizeName(staged.proposed_ingredient_key || staged.ingredient_name_en || staged.ingredient_name_original || `ingredient_${sortOrder}`);
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
    `, [
      `recipe_ingredient:${recipe.recipe_key}:${String(sortOrder).padStart(3, '0')}`,
      recipe.recipe_id,
      matchedIngredientId,
      matchedIngredientId,
      ingredientKey,
      nullableString(staged.ingredient_name_en || staged.ingredient_name_original || staged.raw_line) || ingredientKey.replace(/_/g, ' '),
      nullableNumber(staged.quantity),
      nullableString(staged.unit),
      nullableNumber(staged.quantity_grams),
      nullableString(staged.preparation_note),
      Boolean(staged.optional),
      sortOrder,
      matchedIngredientId ? 'staged_matched_ingredient' : 'staged_unmatched_gap',
      nullableConfidence(staged.match_confidence),
      matchedIngredientId ? 'active' : 'needs_review',
    ]);
    rows.push(result.rows[0]);
  }
  return rows;
}

async function upsertPromotedRecipeSteps(client, { recipe, stagedSteps }) {
  const rows = [];
  for (let index = 0; index < stagedSteps.length; index += 1) {
    const staged = stagedSteps[index];
    const stepNumber = positiveInteger(staged.step_number, index + 1);
    const instruction = requiredString(staged.instruction_en || staged.instruction_original || staged.instruction_bg, 'instruction');
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
    `, [
      `recipe_step:${recipe.recipe_key}:${String(stepNumber).padStart(3, '0')}`,
      recipe.recipe_id,
      stepNumber,
      instruction,
      nullableNumber(staged.duration_minutes),
      nullableNumber(staged.temperature_c),
      JSON.stringify([]),
    ]);
    rows.push(hydrateJsonFields(result.rows[0], ['equipment_tags_json']));
  }
  return rows;
}

async function upsertIngredientGapCandidate(client, { recipeId, stagedIngredient }) {
  const rawName = requiredString(
    stagedIngredient.ingredient_name_en || stagedIngredient.ingredient_name_original || stagedIngredient.raw_line,
    'raw_name',
  );
  const normalizedName = normalizeName(rawName);
  const result = await client.query(`
    INSERT INTO ingredient_gap_candidates (
      gap_id,
      source_type,
      recipe_id,
      raw_name,
      normalized_name,
      proposed_ingredient_key,
      occurrences
    )
    VALUES ($1, 'recipe', $2, $3, $4, $5, 1)
    ON CONFLICT (source_type, recipe_id, normalized_name) DO UPDATE SET
      raw_name = EXCLUDED.raw_name,
      proposed_ingredient_key = EXCLUDED.proposed_ingredient_key,
      occurrences = ingredient_gap_candidates.occurrences + 1,
      updated_at = NOW()
    RETURNING *
  `, [
    buildIngredientGapId(recipeId, normalizedName),
    recipeId,
    rawName,
    normalizedName,
    nullableString(stagedIngredient.proposed_ingredient_key),
  ]);
  return result.rows[0];
}

async function appendRecipePromotionHistory(client, {
  stagedRecipeId,
  recipeId = null,
  decision,
  reason = null,
  metrics = {},
} = {}) {
  const ordinal = await nextPromotionHistoryOrdinal(client, stagedRecipeId);
  const result = await client.query(`
    INSERT INTO recipe_promotion_history (
      id,
      staged_recipe_id,
      recipe_id,
      decision,
      reason,
      metrics_json
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING *
  `, [
    buildPromotionHistoryId(stagedRecipeId, ordinal),
    requiredString(stagedRecipeId, 'staged_recipe_id'),
    nullableString(recipeId),
    normalizeDecision(decision),
    nullableString(reason),
    JSON.stringify(metrics || {}),
  ]);
  return hydrateJsonFields(result.rows[0], ['metrics_json']);
}

function buildIngredientGapId(recipeId, normalizedName) {
  return `ingredient_gap:recipe:${stableHash(`${recipeId}|${normalizedName}`)}`;
}

async function nextPromotionHistoryOrdinal(client, stagedRecipeId) {
  const result = await client.query(`
    SELECT COUNT(*) AS total
    FROM recipe_promotion_history
    WHERE staged_recipe_id = $1
  `, [requiredString(stagedRecipeId, 'staged_recipe_id')]);
  const total = Number(result.rows[0]?.total || 0);
  return total + 1;
}

function buildPromotionHistoryId(stagedRecipeId, ordinal) {
  return `recipe_promotion:${stableHash(stagedRecipeId)}:${String(positiveInteger(ordinal, 1)).padStart(4, '0')}`;
}

function normalizeDecision(value) {
  const decision = requiredString(value, 'decision').toLowerCase();
  if (!SUPPORTED_PROMOTION_DECISIONS.includes(decision)) {
    throw new Error(`Unsupported recipe promotion decision: ${value}`);
  }
  return decision;
}

function normalizeUsabilityStatus(value) {
  const status = requiredString(value, 'usability_status');
  if (!SUPPORTED_RECIPE_USABILITY_STATUSES.includes(status)) {
    throw new Error(`Unsupported recipe usability_status: ${value}`);
  }
  return status;
}

function hydrateJsonFields(row, jsonFields = []) {
  if (!row) return null;
  const hydrated = { ...row };
  for (const field of jsonFields) {
    hydrated[field] = parseJson(hydrated[field], field === 'metrics_json' ? {} : []);
  }
  return hydrated;
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}0-9]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function roundRate(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000;
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function positiveNumber(value, fieldName) {
  const normalized = nullableNumber(value);
  if (normalized === null || normalized <= 0) throw new Error(`${fieldName} must be greater than zero.`);
  return normalized;
}

function nullableConfidence(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    throw new Error(`confidence must be between 0 and 1: ${value}`);
  }
  return normalized;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
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
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function stableHash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16);
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  PROMOTION_METHOD,
  PROMOTION_RULES_VERSION,
  SUPPORTED_PROMOTION_DECISIONS,
  SUPPORTED_RECIPE_USABILITY_STATUSES,
  appendRecipePromotionHistory,
  buildIngredientGapId,
  buildPromotionHistoryId,
  classifyRecipeUsability,
  computeRecipePromotionMetrics,
  getRecipePromotionCandidateDetail,
  getStagedRecipeDetailByJobId,
  listRecipePromotionCandidates,
  promoteStagedRecipeToCanonical,
  reviewAndPromoteRecipe,
  upsertIngredientGapCandidate,
};
