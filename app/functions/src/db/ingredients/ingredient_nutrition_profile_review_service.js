const SUPPORTED_PROFILE_REVIEW_DECISIONS = Object.freeze(['approved', 'rejected', 'needs_review']);
const TERMINAL_CANDIDATE_REVIEW_STATUSES = new Set(['approved', 'rejected']);
const DEFAULT_PROFILE_REVIEW_LIMIT = 100;

async function listIngredientNutritionProfileCandidatesForReview(client, {
  reviewStatus = 'candidate',
  ingredient = null,
  limit = DEFAULT_PROFILE_REVIEW_LIMIT,
} = {}) {
  requireClient(client);
  const filter = buildCandidateListFilter({ reviewStatus, ingredient, limit });
  const result = await client.query(`
    SELECT ${candidateDetailColumns()}
    FROM ingredient_nutrition_profile_candidates c
    JOIN ingredient_nutrition_mappings m
      ON m.mapping_id = c.mapping_id
    LEFT JOIN ingredients i
      ON i.ingredient_id = c.ingredient_id
    ${filter.whereSql}
    ORDER BY c.review_status ASC, c.ingredient_id ASC, c.profile_candidate_id ASC
    LIMIT $${filter.params.length + 1}
  `, [...filter.params, positiveInteger(limit, DEFAULT_PROFILE_REVIEW_LIMIT)]);
  return (result.rows || []).map(normalizeCandidateDetailRow);
}

async function listApprovedIngredientNutritionProfiles(client, {
  ingredient = null,
  reviewStatus = 'approved',
  limit = DEFAULT_PROFILE_REVIEW_LIMIT,
} = {}) {
  requireClient(client);
  const filter = buildApprovedProfileListFilter({ ingredient, reviewStatus });
  const result = await client.query(`
    SELECT p.*
    FROM ingredient_nutrition_profiles p
    LEFT JOIN ingredients i
      ON i.ingredient_id = p.ingredient_id
    ${filter.whereSql}
    ORDER BY p.ingredient_id ASC, p.mapping_type ASC, p.default_for_state ASC, p.profile_id ASC
    LIMIT $${filter.params.length + 1}
  `, [...filter.params, positiveInteger(limit, DEFAULT_PROFILE_REVIEW_LIMIT)]);
  return result.rows || [];
}

async function getIngredientNutritionProfileCandidateDetail(client, { candidateId } = {}) {
  requireClient(client);
  const id = requiredString(candidateId, 'candidate_id');
  const candidateResult = await client.query(`
    SELECT ${candidateDetailColumns()}
    FROM ingredient_nutrition_profile_candidates c
    JOIN ingredient_nutrition_mappings m
      ON m.mapping_id = c.mapping_id
    LEFT JOIN ingredients i
      ON i.ingredient_id = c.ingredient_id
    WHERE c.profile_candidate_id = $1
  `, [id]);
  const candidate = candidateResult.rows[0] ? normalizeCandidateDetailRow(candidateResult.rows[0]) : null;
  if (!candidate) return null;
  const historyResult = await client.query(`
    SELECT *
    FROM ingredient_nutrition_profile_review_history
    WHERE source_profile_candidate_id = $1
    ORDER BY reviewed_at DESC, created_at DESC
  `, [id]);
  return {
    candidate,
    review_history: historyResult.rows || [],
  };
}

async function reviewIngredientNutritionProfileCandidate(client, {
  candidateId,
  decision,
  reviewedBy = 'unknown_reviewer',
  reviewReason = null,
  reviewNote = null,
  reviewedAt = null,
} = {}) {
  requireClient(client);
  const id = requiredString(candidateId, 'candidate_id');
  const nextDecision = normalizeProfileReviewDecision(decision);
  const reviewer = requiredString(reviewedBy, 'reviewed_by');
  const timestamp = reviewedAt ? new Date(reviewedAt) : new Date();
  if (Number.isNaN(timestamp.getTime())) throw new Error('reviewed_at must be a valid timestamp.');

  await client.query('BEGIN');
  try {
    const candidateResult = await client.query(`
      SELECT ${candidateDetailColumns()}
      FROM ingredient_nutrition_profile_candidates c
      JOIN ingredient_nutrition_mappings m
        ON m.mapping_id = c.mapping_id
    LEFT JOIN ingredients i
      ON i.ingredient_id = c.ingredient_id
    WHERE c.profile_candidate_id = $1
    FOR UPDATE OF c, m
    `, [id]);
    const candidate = candidateResult.rows[0] ? normalizeCandidateDetailRow(candidateResult.rows[0]) : null;
    if (!candidate) throw new Error(`Ingredient nutrition profile candidate not found: ${id}`);
    validateProfileCandidateReviewTransition(candidate.review_status, nextDecision);

    let profile = null;
    let supersededProfile = null;
    if (nextDecision === 'approved') {
      const approved = await approveIngredientNutritionProfileCandidate(client, {
        candidate,
        reviewedBy: reviewer,
        reviewedAt: timestamp.toISOString(),
        reviewReason: nullableString(reviewReason),
      });
      profile = approved.profile;
      supersededProfile = approved.superseded_profile;
    }

    const updatedCandidateResult = await client.query(`
      UPDATE ingredient_nutrition_profile_candidates
      SET review_status = $1,
          updated_at = NOW()
      WHERE profile_candidate_id = $2
      RETURNING *
    `, [nextDecision, id]);

    const eventId = buildProfileReviewEventId({
      candidateId: id,
      decision: nextDecision,
      reviewedAt: timestamp.toISOString(),
      reviewedBy: reviewer,
    });
    await client.query(`
      INSERT INTO ingredient_nutrition_profile_review_history (
        review_event_id,
        source_profile_candidate_id,
        profile_id,
        superseded_profile_id,
        ingredient_id,
        mapping_id,
        cluster_id,
        previous_candidate_review_status,
        previous_profile_review_status,
        review_decision,
        reviewed_by,
        reviewed_at,
        review_reason,
        review_note
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (review_event_id) DO UPDATE SET
        review_reason = EXCLUDED.review_reason,
        review_note = EXCLUDED.review_note
    `, [
      eventId,
      id,
      profile ? profile.profile_id : null,
      supersededProfile ? supersededProfile.profile_id : null,
      candidate.ingredient_id,
      candidate.mapping_id,
      candidate.cluster_id,
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
      candidate: updatedCandidateResult.rows[0],
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

async function approveIngredientNutritionProfileCandidate(client, {
  candidate,
  reviewedBy,
  reviewedAt,
  reviewReason,
}) {
  const existingFromSameCandidate = await client.query(`
    SELECT *
    FROM ingredient_nutrition_profiles
    WHERE source_profile_candidate_id = $1
      AND review_status = 'approved'
    FOR UPDATE
  `, [candidate.profile_candidate_id]);
  if ((existingFromSameCandidate.rows || []).length > 0) {
    throw new Error(`Approved ingredient nutrition profile already exists for candidate: ${candidate.profile_candidate_id}`);
  }

  const previousApprovedResult = await client.query(`
    SELECT *
    FROM ingredient_nutrition_profiles
    WHERE ingredient_id = $1
      AND mapping_type = $2
      AND COALESCE(default_for_state, '') = COALESCE($3, '')
      AND review_status = 'approved'
    ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
    LIMIT 1
    FOR UPDATE
  `, [candidate.ingredient_id, candidate.mapping_type, candidate.default_for_state]);
  const previousApproved = previousApprovedResult.rows[0] || null;
  if (previousApproved) {
    await client.query(`
      UPDATE ingredient_nutrition_profiles
      SET review_status = 'superseded',
          review_decision = 'superseded',
          review_reason = COALESCE($2, review_reason),
          updated_at = NOW()
      WHERE profile_id = $1
      RETURNING *
    `, [previousApproved.profile_id, reviewReason || `Superseded by ${candidate.profile_candidate_id}`]);
  }

  const profileId = buildIngredientNutritionProfileId(candidate.profile_candidate_id);
  const insertResult = await client.query(`
    INSERT INTO ingredient_nutrition_profiles (
      profile_id,
      ingredient_id,
      mapping_id,
      cluster_id,
      representative_fdc_id,
      default_for_state,
      mapping_type,
      kcal_per_100g,
      protein_g_per_100g,
      fat_g_per_100g,
      carbs_g_per_100g,
      fiber_g_per_100g,
      sugar_g_per_100g,
      sodium_mg_per_100g,
      source_nutrients_json,
      source_profile_candidate_id,
      confidence,
      review_status,
      reviewed_by,
      reviewed_at,
      review_decision,
      review_reason,
      generation_method,
      rules_version,
      source_version
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15::jsonb,
      $16, $17, 'approved', $18, $19,
      'approved', $20, $21, $22, $23
    )
    RETURNING *
  `, [
    profileId,
    candidate.ingredient_id,
    candidate.mapping_id,
    candidate.cluster_id,
    candidate.representative_fdc_id,
    candidate.default_for_state,
    candidate.mapping_type,
    candidate.kcal,
    candidate.protein_g,
    candidate.fat_g,
    candidate.carbs_g,
    candidate.fiber_g,
    candidate.sugar_g,
    candidate.sodium_mg,
    JSON.stringify(candidate.source_nutrients_json || {}),
    candidate.profile_candidate_id,
    candidate.confidence,
    reviewedBy,
    reviewedAt,
    reviewReason,
    candidate.generation_method,
    candidate.rules_version,
    candidate.source_version,
  ]);
  return {
    profile: insertResult.rows[0],
    superseded_profile: previousApproved,
  };
}

function validateProfileCandidateReviewTransition(previousStatus, nextStatus) {
  const previous = normalizeCandidateReviewStatus(previousStatus);
  const next = normalizeProfileReviewDecision(nextStatus);
  if (previous === next) return true;
  if (TERMINAL_CANDIDATE_REVIEW_STATUSES.has(previous)) {
    throw new Error(`Invalid ingredient nutrition profile candidate transition from ${previous} to ${next}.`);
  }
  return true;
}

function normalizeProfileReviewDecision(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!SUPPORTED_PROFILE_REVIEW_DECISIONS.includes(normalized)) {
    throw new Error(`Unsupported ingredient nutrition profile review decision: ${value}`);
  }
  return normalized;
}

function normalizeCandidateReviewStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const supported = ['candidate', ...SUPPORTED_PROFILE_REVIEW_DECISIONS];
  if (!supported.includes(normalized)) {
    throw new Error(`Unsupported ingredient nutrition profile candidate status: ${value}`);
  }
  return normalized;
}

function buildCandidateListFilter({ reviewStatus, ingredient }) {
  const conditions = [];
  const params = [];
  if (reviewStatus) {
    params.push(normalizeCandidateReviewStatus(reviewStatus));
    conditions.push(`c.review_status = $${params.length}`);
  }
  const ingredientFilter = nullableString(ingredient);
  if (ingredientFilter) {
    params.push(`%${ingredientFilter}%`);
    conditions.push(`(
      c.ingredient_id ILIKE $${params.length}
      OR i.ingredient_key ILIKE $${params.length}
      OR i.name_en ILIKE $${params.length}
      OR i.name_bg ILIKE $${params.length}
    )`);
  }
  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function buildApprovedProfileListFilter({ ingredient, reviewStatus }) {
  const conditions = [];
  const params = [];
  if (reviewStatus) {
    params.push(normalizeApprovedProfileReviewStatus(reviewStatus));
    conditions.push(`p.review_status = $${params.length}`);
  }
  const ingredientFilter = nullableString(ingredient);
  if (ingredientFilter) {
    params.push(`%${ingredientFilter}%`);
    conditions.push(`(
      p.ingredient_id ILIKE $${params.length}
      OR i.ingredient_key ILIKE $${params.length}
      OR i.name_en ILIKE $${params.length}
      OR i.name_bg ILIKE $${params.length}
    )`);
  }
  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function normalizeApprovedProfileReviewStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!['approved', 'rejected', 'needs_review', 'superseded'].includes(normalized)) {
    throw new Error(`Unsupported ingredient nutrition profile status: ${value}`);
  }
  return normalized;
}

function candidateDetailColumns() {
  return [
    'c.profile_candidate_id',
    'c.ingredient_id',
    'c.mapping_id',
    'c.cluster_id',
    'c.representative_fdc_id',
    'c.kcal',
    'c.protein_g',
    'c.fat_g',
    'c.carbs_g',
    'c.fiber_g',
    'c.sugar_g',
    'c.sodium_mg',
    'c.source_nutrients_json',
    'c.review_status',
    'c.generation_method',
    'c.rules_version',
    'm.default_for_state',
    'm.mapping_type',
    'm.confidence',
    'm.source_version',
    'i.ingredient_key',
    'i.name_en',
    'i.name_bg',
  ].join(', ');
}

function normalizeCandidateDetailRow(row) {
  return {
    ...row,
    representative_fdc_id: Number(row.representative_fdc_id),
    confidence: Number(row.confidence),
    kcal: nullableNumber(row.kcal),
    protein_g: nullableNumber(row.protein_g),
    fat_g: nullableNumber(row.fat_g),
    carbs_g: nullableNumber(row.carbs_g),
    fiber_g: nullableNumber(row.fiber_g),
    sugar_g: nullableNumber(row.sugar_g),
    sodium_mg: nullableNumber(row.sodium_mg),
    source_nutrients_json: parseJson(row.source_nutrients_json, {}),
  };
}

function buildIngredientNutritionProfileId(candidateId) {
  return `ingredient_nutrition_profile:${slugify(candidateId)}`;
}

function buildProfileReviewEventId({ candidateId, decision, reviewedAt, reviewedBy }) {
  return `ingredient_nutrition_profile_review:${slugify(candidateId)}:${slugify(reviewedAt)}:${slugify(reviewedBy)}:${slugify(decision)}`;
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
  DEFAULT_PROFILE_REVIEW_LIMIT,
  SUPPORTED_PROFILE_REVIEW_DECISIONS,
  buildIngredientNutritionProfileId,
  buildProfileReviewEventId,
  getIngredientNutritionProfileCandidateDetail,
  listApprovedIngredientNutritionProfiles,
  listIngredientNutritionProfileCandidatesForReview,
  normalizeProfileReviewDecision,
  reviewIngredientNutritionProfileCandidate,
  validateProfileCandidateReviewTransition,
};
