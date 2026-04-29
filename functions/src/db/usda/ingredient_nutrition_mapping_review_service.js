const SUPPORTED_MAPPING_REVIEW_DECISIONS = Object.freeze(['suggested', 'approved', 'rejected', 'needs_review']);
const TERMINAL_MAPPING_REVIEW_STATUSES = new Set(['approved', 'rejected']);
const DEFAULT_MAPPING_REVIEW_LIMIT = 100;

async function listIngredientNutritionMappingsForReview(client, {
  reviewStatus = 'suggested',
  limit = DEFAULT_MAPPING_REVIEW_LIMIT,
} = {}) {
  requireClient(client);
  const status = normalizeMappingReviewDecision(reviewStatus);
  const result = await client.query(`
    SELECT *
    FROM ingredient_nutrition_mappings
    WHERE review_status = $1
    ORDER BY confidence DESC, ingredient_id ASC, mapping_id ASC
    LIMIT $2
  `, [status, positiveInteger(limit, DEFAULT_MAPPING_REVIEW_LIMIT)]);
  return result.rows || [];
}

async function getIngredientNutritionMappingReviewDetail(client, { mappingId } = {}) {
  requireClient(client);
  const id = requiredString(mappingId, 'mapping_id');
  const mappingResult = await client.query(`
    SELECT *
    FROM ingredient_nutrition_mappings
    WHERE mapping_id = $1
  `, [id]);
  const mapping = mappingResult.rows[0] || null;
  if (!mapping) return null;
  const historyResult = await client.query(`
    SELECT *
    FROM ingredient_nutrition_mapping_review_history
    WHERE mapping_id = $1
    ORDER BY reviewed_at DESC, created_at DESC
  `, [id]);
  return { mapping, review_history: historyResult.rows || [] };
}

async function reviewIngredientNutritionMapping(client, {
  mappingId,
  decision,
  reviewedBy = 'unknown_reviewer',
  reviewReason = null,
  reviewNote = null,
  reviewedAt = null,
} = {}) {
  requireClient(client);
  const id = requiredString(mappingId, 'mapping_id');
  const nextDecision = normalizeMappingReviewDecision(decision);
  const reviewer = requiredString(reviewedBy, 'reviewed_by');
  const timestamp = reviewedAt ? new Date(reviewedAt) : new Date();
  if (Number.isNaN(timestamp.getTime())) throw new Error('reviewed_at must be a valid timestamp.');

  await client.query('BEGIN');
  try {
    const mappingResult = await client.query(`
      SELECT *
      FROM ingredient_nutrition_mappings
      WHERE mapping_id = $1
      FOR UPDATE
    `, [id]);
    const mapping = mappingResult.rows[0] ? { ...mappingResult.rows[0] } : null;
    if (!mapping) throw new Error(`Ingredient nutrition mapping not found: ${id}`);
    validateMappingReviewTransition(mapping.review_status, nextDecision);
    const eventId = buildMappingReviewEventId({
      mappingId: id,
      decision: nextDecision,
      reviewedAt: timestamp.toISOString(),
      reviewedBy: reviewer,
    });
    const updatedResult = await client.query(`
      UPDATE ingredient_nutrition_mappings
      SET
        review_status = $1,
        reviewed_by = $2,
        reviewed_at = $3,
        review_decision = $1,
        review_reason = $4,
        mapping_type = CASE WHEN $1 = 'rejected' THEN 'rejected_candidate' ELSE mapping_type END,
        updated_at = NOW()
      WHERE mapping_id = $5
      RETURNING *
    `, [nextDecision, reviewer, timestamp.toISOString(), nullableString(reviewReason), id]);
    await client.query(`
      INSERT INTO ingredient_nutrition_mapping_review_history (
        review_event_id,
        mapping_id,
        ingredient_id,
        cluster_id,
        previous_review_status,
        review_decision,
        reviewed_by,
        reviewed_at,
        review_reason,
        review_note
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (review_event_id) DO UPDATE SET
        review_reason = EXCLUDED.review_reason,
        review_note = EXCLUDED.review_note
    `, [
      eventId,
      id,
      mapping.ingredient_id,
      mapping.cluster_id,
      mapping.review_status,
      nextDecision,
      reviewer,
      timestamp.toISOString(),
      nullableString(reviewReason),
      nullableString(reviewNote),
    ]);
    await client.query('COMMIT');
    return {
      mapping: updatedResult.rows[0],
      review_event_id: eventId,
      previous_review_status: mapping.review_status,
      review_decision: nextDecision,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function validateMappingReviewTransition(previousStatus, nextStatus) {
  const previous = normalizeMappingReviewDecision(previousStatus);
  const next = normalizeMappingReviewDecision(nextStatus);
  if (previous === next) return true;
  if (TERMINAL_MAPPING_REVIEW_STATUSES.has(previous)) {
    throw new Error(`Invalid ingredient nutrition mapping review transition from ${previous} to ${next}.`);
  }
  return true;
}

function normalizeMappingReviewDecision(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!SUPPORTED_MAPPING_REVIEW_DECISIONS.includes(normalized)) {
    throw new Error(`Unsupported ingredient nutrition mapping review decision: ${value}`);
  }
  return normalized;
}

function buildMappingReviewEventId({ mappingId, decision, reviewedAt, reviewedBy }) {
  return `ingredient_nutrition_mapping_review:${slugify(mappingId)}:${slugify(reviewedAt)}:${slugify(reviewedBy)}:${slugify(decision)}`;
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

function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_MAPPING_REVIEW_LIMIT,
  SUPPORTED_MAPPING_REVIEW_DECISIONS,
  buildMappingReviewEventId,
  getIngredientNutritionMappingReviewDetail,
  listIngredientNutritionMappingsForReview,
  normalizeMappingReviewDecision,
  reviewIngredientNutritionMapping,
  validateMappingReviewTransition,
};
