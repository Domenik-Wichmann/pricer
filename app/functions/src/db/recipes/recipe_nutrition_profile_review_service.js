const SUPPORTED_RECIPE_PROFILE_REVIEW_DECISIONS = Object.freeze(['approved', 'rejected', 'needs_review']);
const TERMINAL_RECIPE_PROFILE_CANDIDATE_STATUSES = new Set(['approved', 'rejected']);
const DEFAULT_RECIPE_PROFILE_REVIEW_LIMIT = 100;

async function listRecipeNutritionProfileCandidatesForReview(client, {
  reviewStatus = 'candidate',
  recipe = null,
  limit = DEFAULT_RECIPE_PROFILE_REVIEW_LIMIT,
} = {}) {
  requireClient(client);
  const filter = buildCandidateListFilter({ reviewStatus, recipe });
  const result = await client.query(`
    SELECT ${candidateDetailColumns()}
    FROM recipe_nutrition_profile_candidates c
    JOIN recipes r
      ON r.recipe_id = c.recipe_id
    ${filter.whereSql}
    ORDER BY c.review_status ASC, r.recipe_key ASC, c.recipe_profile_candidate_id ASC
    LIMIT $${filter.params.length + 1}
  `, [...filter.params, positiveInteger(limit, DEFAULT_RECIPE_PROFILE_REVIEW_LIMIT)]);
  return (result.rows || []).map(normalizeCandidateDetailRow);
}

async function listApprovedRecipeNutritionProfiles(client, {
  recipe = null,
  reviewStatus = 'approved',
  limit = DEFAULT_RECIPE_PROFILE_REVIEW_LIMIT,
} = {}) {
  requireClient(client);
  const filter = buildApprovedProfileListFilter({ recipe, reviewStatus });
  const result = await client.query(`
    SELECT p.*
    FROM recipe_nutrition_profiles p
    LEFT JOIN recipes r
      ON r.recipe_id = p.recipe_id
    ${filter.whereSql}
    ORDER BY p.recipe_id ASC, p.reviewed_at DESC NULLS LAST, p.created_at DESC, p.recipe_profile_id ASC
    LIMIT $${filter.params.length + 1}
  `, [...filter.params, positiveInteger(limit, DEFAULT_RECIPE_PROFILE_REVIEW_LIMIT)]);
  return (result.rows || []).map(hydrateRecipeNutritionProfileRow);
}

async function getRecipeNutritionProfileCandidateDetail(client, { candidateId } = {}) {
  requireClient(client);
  const id = requiredString(candidateId, 'candidate_id');
  const candidateResult = await client.query(`
    SELECT ${candidateDetailColumns()}
    FROM recipe_nutrition_profile_candidates c
    JOIN recipes r
      ON r.recipe_id = c.recipe_id
    WHERE c.recipe_profile_candidate_id = $1
  `, [id]);
  const candidate = candidateResult.rows[0] ? normalizeCandidateDetailRow(candidateResult.rows[0]) : null;
  if (!candidate) return null;

  // Candidate detail intentionally carries recipe context and line-level gaps so review can happen
  // without consulting runtime app paths or direct USDA rows.
  const ingredientResult = await client.query(`
    SELECT
      ri.*,
      i.ingredient_key,
      i.name_en AS ingredient_name_en,
      i.name_bg AS ingredient_name_bg,
      (c.missing_ingredient_ids_json ? ri.ingredient_id) AS missing_nutrition
    FROM recipe_ingredients ri
    LEFT JOIN ingredients i
      ON i.ingredient_id = ri.ingredient_id
    JOIN recipe_nutrition_profile_candidates c
      ON c.recipe_id = ri.recipe_id
    WHERE ri.recipe_id = $1
      AND c.recipe_profile_candidate_id = $2
    ORDER BY ri.sort_order ASC, ri.recipe_ingredient_id ASC
  `, [candidate.recipe_id, id]);
  const historyResult = await client.query(`
    SELECT *
    FROM recipe_nutrition_profile_review_history
    WHERE source_recipe_profile_candidate_id = $1
    ORDER BY reviewed_at DESC, created_at DESC
  `, [id]);

  return {
    candidate,
    recipe: {
      recipe_id: candidate.recipe_id,
      recipe_key: candidate.recipe_key,
      title_en: candidate.title_en,
      title_bg: candidate.title_bg,
      canonical_title: candidate.canonical_title,
      normalized_title: candidate.normalized_title,
      servings: candidate.recipe_servings,
    },
    ingredients: ingredientResult.rows || [],
    missing_nutrition_ingredient_ids: candidate.missing_ingredient_ids_json,
    review_history: historyResult.rows || [],
  };
}

async function reviewRecipeNutritionProfileCandidate(client, {
  candidateId,
  decision,
  reviewedBy = 'unknown_reviewer',
  reviewReason = null,
  reviewNote = null,
  reviewedAt = null,
} = {}) {
  requireClient(client);
  const id = requiredString(candidateId, 'candidate_id');
  const nextDecision = normalizeRecipeProfileReviewDecision(decision);
  const reviewer = requiredString(reviewedBy, 'reviewed_by');
  const timestamp = reviewedAt ? new Date(reviewedAt) : new Date();
  if (Number.isNaN(timestamp.getTime())) throw new Error('reviewed_at must be a valid timestamp.');

  await client.query('BEGIN');
  try {
    const candidateResult = await client.query(`
      SELECT ${candidateDetailColumns()}
      FROM recipe_nutrition_profile_candidates c
      JOIN recipes r
        ON r.recipe_id = c.recipe_id
      WHERE c.recipe_profile_candidate_id = $1
      FOR UPDATE OF c
    `, [id]);
    const candidate = candidateResult.rows[0] ? normalizeCandidateDetailRow(candidateResult.rows[0]) : null;
    if (!candidate) throw new Error(`Recipe nutrition profile candidate not found: ${id}`);
    validateRecipeProfileCandidateReviewTransition(candidate.review_status, nextDecision);

    let profile = null;
    let supersededProfile = null;
    if (nextDecision === 'approved') {
      const approved = await approveRecipeNutritionProfileCandidate(client, {
        candidate,
        reviewedBy: reviewer,
        reviewedAt: timestamp.toISOString(),
        reviewReason: nullableString(reviewReason),
      });
      profile = approved.profile;
      supersededProfile = approved.superseded_profile;
    }

    const updatedCandidateResult = await client.query(`
      UPDATE recipe_nutrition_profile_candidates
      SET review_status = $1,
          updated_at = NOW()
      WHERE recipe_profile_candidate_id = $2
      RETURNING *
    `, [nextDecision, id]);

    const eventId = buildRecipeProfileReviewEventId({
      candidateId: id,
      decision: nextDecision,
      reviewedAt: timestamp.toISOString(),
      reviewedBy: reviewer,
    });
    await client.query(`
      INSERT INTO recipe_nutrition_profile_review_history (
        review_event_id,
        source_recipe_profile_candidate_id,
        recipe_profile_id,
        superseded_recipe_profile_id,
        recipe_id,
        previous_candidate_review_status,
        previous_profile_review_status,
        review_decision,
        reviewed_by,
        reviewed_at,
        review_reason,
        review_note
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (review_event_id) DO UPDATE SET
        review_reason = EXCLUDED.review_reason,
        review_note = EXCLUDED.review_note
    `, [
      eventId,
      id,
      profile ? profile.recipe_profile_id : null,
      supersededProfile ? supersededProfile.recipe_profile_id : null,
      candidate.recipe_id,
      candidate.review_status,
      profile ? profile.review_status : null,
      nextDecision,
      reviewer,
      timestamp.toISOString(),
      nullableString(reviewReason),
      nullableString(reviewNote),
    ]);

    await client.query('COMMIT');
    return {
      candidate: hydrateRecipeNutritionCandidateRow(updatedCandidateResult.rows[0]),
      profile,
      superseded_profile: supersededProfile,
      review_event_id: eventId,
      previous_candidate_review_status: candidate.review_status,
      review_decision: nextDecision,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function approveRecipeNutritionProfileCandidate(client, {
  candidate,
  reviewedBy,
  reviewedAt,
  reviewReason,
}) {
  const existingFromSameCandidate = await client.query(`
    SELECT *
    FROM recipe_nutrition_profiles
    WHERE source_recipe_profile_candidate_id = $1
    FOR UPDATE
  `, [candidate.recipe_profile_candidate_id]);
  if ((existingFromSameCandidate.rows || []).length > 0) {
    throw new Error(`Approved recipe nutrition profile already exists for candidate: ${candidate.recipe_profile_candidate_id}`);
  }

  const previousApprovedResult = await client.query(`
    SELECT *
    FROM recipe_nutrition_profiles
    WHERE recipe_id = $1
      AND review_status = 'approved'
    ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
    LIMIT 1
    FOR UPDATE
  `, [candidate.recipe_id]);
  let previousApproved = previousApprovedResult.rows[0] ? hydrateRecipeNutritionProfileRow(previousApprovedResult.rows[0]) : null;
  if (previousApproved) {
    const supersededResult = await client.query(`
      UPDATE recipe_nutrition_profiles
      SET review_status = 'superseded',
          review_decision = 'superseded',
          review_reason = COALESCE($2, review_reason),
          updated_at = NOW()
      WHERE recipe_profile_id = $1
      RETURNING *
    `, [previousApproved.recipe_profile_id, reviewReason || `Superseded by ${candidate.recipe_profile_candidate_id}`]);
    previousApproved = supersededResult.rows[0]
      ? hydrateRecipeNutritionProfileRow(supersededResult.rows[0])
      : previousApproved;
  }

  const profileId = buildRecipeNutritionProfileId(candidate.recipe_profile_candidate_id);
  const insertResult = await client.query(`
    INSERT INTO recipe_nutrition_profiles (
      recipe_profile_id,
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
      source_recipe_profile_candidate_id,
      confidence,
      review_status,
      reviewed_by,
      reviewed_at,
      review_decision,
      review_reason,
      generation_method,
      rules_version
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21::jsonb, $22::jsonb,
      $23, $24, 'approved', $25, $26, 'approved',
      $27, $28, $29
    )
    RETURNING *
  `, [
    profileId,
    candidate.recipe_id,
    candidate.total_kcal,
    candidate.total_protein_g,
    candidate.total_fat_g,
    candidate.total_carbs_g,
    candidate.total_fiber_g,
    candidate.total_sugar_g,
    candidate.total_sodium_mg,
    candidate.per_serving_kcal,
    candidate.per_serving_protein_g,
    candidate.per_serving_fat_g,
    candidate.per_serving_carbs_g,
    candidate.per_serving_fiber_g,
    candidate.per_serving_sugar_g,
    candidate.per_serving_sodium_mg,
    candidate.servings,
    candidate.ingredient_count,
    candidate.ingredients_with_nutrition,
    candidate.ingredients_missing_nutrition,
    JSON.stringify(candidate.missing_ingredient_ids_json || []),
    JSON.stringify(candidate.source_profile_ids_json || []),
    candidate.recipe_profile_candidate_id,
    candidate.confidence,
    reviewedBy,
    reviewedAt,
    reviewReason,
    candidate.generation_method,
    candidate.rules_version,
  ]);
  return {
    profile: hydrateRecipeNutritionProfileRow(insertResult.rows[0]),
    superseded_profile: previousApproved,
  };
}

function validateRecipeProfileCandidateReviewTransition(previousStatus, nextStatus) {
  const previous = normalizeCandidateReviewStatus(previousStatus);
  const next = normalizeRecipeProfileReviewDecision(nextStatus);
  if (previous === next) return true;
  if (TERMINAL_RECIPE_PROFILE_CANDIDATE_STATUSES.has(previous)) {
    throw new Error(`Invalid recipe nutrition profile candidate transition from ${previous} to ${next}.`);
  }
  return true;
}

function normalizeRecipeProfileReviewDecision(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!SUPPORTED_RECIPE_PROFILE_REVIEW_DECISIONS.includes(normalized)) {
    throw new Error(`Unsupported recipe nutrition profile review decision: ${value}`);
  }
  return normalized;
}

function normalizeCandidateReviewStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const supported = ['candidate', ...SUPPORTED_RECIPE_PROFILE_REVIEW_DECISIONS];
  if (!supported.includes(normalized)) {
    throw new Error(`Unsupported recipe nutrition profile candidate status: ${value}`);
  }
  return normalized;
}

function normalizeApprovedProfileReviewStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!['approved', 'rejected', 'needs_review', 'superseded'].includes(normalized)) {
    throw new Error(`Unsupported recipe nutrition profile status: ${value}`);
  }
  return normalized;
}

function buildCandidateListFilter({ reviewStatus, recipe }) {
  const conditions = [];
  const params = [];
  if (reviewStatus) {
    params.push(normalizeCandidateReviewStatus(reviewStatus));
    conditions.push(`c.review_status = $${params.length}`);
  }
  const recipeFilter = nullableString(recipe);
  if (recipeFilter) {
    params.push(`%${recipeFilter}%`);
    conditions.push(`(
      c.recipe_id ILIKE $${params.length}
      OR r.recipe_key ILIKE $${params.length}
      OR r.title_en ILIKE $${params.length}
      OR r.title_bg ILIKE $${params.length}
      OR r.normalized_title ILIKE $${params.length}
    )`);
  }
  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function buildApprovedProfileListFilter({ recipe, reviewStatus }) {
  const conditions = [];
  const params = [];
  if (reviewStatus) {
    params.push(normalizeApprovedProfileReviewStatus(reviewStatus));
    conditions.push(`p.review_status = $${params.length}`);
  }
  const recipeFilter = nullableString(recipe);
  if (recipeFilter) {
    params.push(`%${recipeFilter}%`);
    conditions.push(`(
      p.recipe_id ILIKE $${params.length}
      OR r.recipe_key ILIKE $${params.length}
      OR r.title_en ILIKE $${params.length}
      OR r.title_bg ILIKE $${params.length}
      OR r.normalized_title ILIKE $${params.length}
    )`);
  }
  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function candidateDetailColumns() {
  return [
    'c.recipe_profile_candidate_id',
    'c.recipe_id',
    'c.total_kcal',
    'c.total_protein_g',
    'c.total_fat_g',
    'c.total_carbs_g',
    'c.total_fiber_g',
    'c.total_sugar_g',
    'c.total_sodium_mg',
    'c.per_serving_kcal',
    'c.per_serving_protein_g',
    'c.per_serving_fat_g',
    'c.per_serving_carbs_g',
    'c.per_serving_fiber_g',
    'c.per_serving_sugar_g',
    'c.per_serving_sodium_mg',
    'c.servings',
    'c.ingredient_count',
    'c.ingredients_with_nutrition',
    'c.ingredients_missing_nutrition',
    'c.missing_ingredient_ids_json',
    'c.source_profile_ids_json',
    'c.confidence',
    'c.review_status',
    'c.generation_method',
    'c.rules_version',
    'r.recipe_key',
    'r.title_en',
    'r.title_bg',
    'r.canonical_title',
    'r.normalized_title',
    'r.servings AS recipe_servings',
  ].join(', ');
}

function normalizeCandidateDetailRow(row) {
  return hydrateRecipeNutritionCandidateRow(row);
}

function hydrateRecipeNutritionCandidateRow(row) {
  if (!row) return null;
  return {
    ...row,
    total_kcal: nullableNumber(row.total_kcal),
    total_protein_g: nullableNumber(row.total_protein_g),
    total_fat_g: nullableNumber(row.total_fat_g),
    total_carbs_g: nullableNumber(row.total_carbs_g),
    total_fiber_g: nullableNumber(row.total_fiber_g),
    total_sugar_g: nullableNumber(row.total_sugar_g),
    total_sodium_mg: nullableNumber(row.total_sodium_mg),
    per_serving_kcal: nullableNumber(row.per_serving_kcal),
    per_serving_protein_g: nullableNumber(row.per_serving_protein_g),
    per_serving_fat_g: nullableNumber(row.per_serving_fat_g),
    per_serving_carbs_g: nullableNumber(row.per_serving_carbs_g),
    per_serving_fiber_g: nullableNumber(row.per_serving_fiber_g),
    per_serving_sugar_g: nullableNumber(row.per_serving_sugar_g),
    per_serving_sodium_mg: nullableNumber(row.per_serving_sodium_mg),
    servings: nullableNumber(row.servings),
    ingredient_count: nullableInteger(row.ingredient_count),
    ingredients_with_nutrition: nullableInteger(row.ingredients_with_nutrition),
    ingredients_missing_nutrition: nullableInteger(row.ingredients_missing_nutrition),
    missing_ingredient_ids_json: parseJson(row.missing_ingredient_ids_json, []),
    source_profile_ids_json: parseJson(row.source_profile_ids_json, []),
  };
}

function hydrateRecipeNutritionProfileRow(row) {
  if (!row) return null;
  return {
    ...row,
    missing_ingredient_ids_json: parseJson(row.missing_ingredient_ids_json, []),
    source_profile_ids_json: parseJson(row.source_profile_ids_json, []),
  };
}

function buildRecipeNutritionProfileId(candidateId) {
  return `recipe_nutrition_profile:${slugify(candidateId)}`;
}

function buildRecipeProfileReviewEventId({ candidateId, decision, reviewedAt, reviewedBy }) {
  return `recipe_nutrition_profile_review:${slugify(candidateId)}:${slugify(reviewedAt)}:${slugify(reviewedBy)}:${slugify(decision)}`;
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
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function nullableInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  return Number.isInteger(normalized) ? normalized : null;
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
  DEFAULT_RECIPE_PROFILE_REVIEW_LIMIT,
  SUPPORTED_RECIPE_PROFILE_REVIEW_DECISIONS,
  buildRecipeNutritionProfileId,
  buildRecipeProfileReviewEventId,
  getRecipeNutritionProfileCandidateDetail,
  listApprovedRecipeNutritionProfiles,
  listRecipeNutritionProfileCandidatesForReview,
  normalizeRecipeProfileReviewDecision,
  reviewRecipeNutritionProfileCandidate,
  validateRecipeProfileCandidateReviewTransition,
};
