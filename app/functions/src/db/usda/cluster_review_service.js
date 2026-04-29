const SUPPORTED_CLUSTER_REVIEW_DECISIONS = Object.freeze([
  'pending_review',
  'approved',
  'rejected',
  'needs_split',
  'needs_merge',
]);

const TERMINAL_CLUSTER_REVIEW_STATUSES = new Set(['approved', 'rejected']);
const DEFAULT_CLUSTER_REVIEW_LIMIT = 100;

async function listUsdaFoodClustersForReview(client, {
  reviewStatus = 'pending_review',
  limit = DEFAULT_CLUSTER_REVIEW_LIMIT,
} = {}) {
  requireClient(client);
  const normalizedStatus = normalizeReviewDecision(reviewStatus);
  const result = await client.query(`
    SELECT *
    FROM usda_food_clusters
    WHERE review_status = $1
    ORDER BY confidence ASC, core_food_normalized ASC, cluster_key ASC
    LIMIT $2
  `, [normalizedStatus, positiveInteger(limit, DEFAULT_CLUSTER_REVIEW_LIMIT)]);
  return result.rows || [];
}

async function getUsdaFoodClusterReviewDetail(client, {
  clusterKey,
} = {}) {
  requireClient(client);
  const key = requiredString(clusterKey, 'cluster_key');
  const clusterResult = await client.query(`
    SELECT *
    FROM usda_food_clusters
    WHERE cluster_key = $1
  `, [key]);
  const cluster = clusterResult.rows[0] || null;
  if (!cluster) {
    return null;
  }

  const membersResult = await client.query(`
    SELECT *
    FROM usda_food_cluster_members
    WHERE cluster_id = $1
    ORDER BY
      CASE member_role
        WHEN 'representative' THEN 0
        WHEN 'included' THEN 1
        ELSE 2
      END,
      fdc_id ASC
  `, [cluster.cluster_id]);

  const historyResult = await client.query(`
    SELECT *
    FROM usda_food_cluster_review_history
    WHERE cluster_id = $1
    ORDER BY reviewed_at DESC, created_at DESC
  `, [cluster.cluster_id]);

  return {
    cluster,
    members: membersResult.rows || [],
    review_history: historyResult.rows || [],
  };
}

async function reviewUsdaFoodCluster(client, {
  clusterKey,
  decision,
  reviewedBy = 'unknown_reviewer',
  reviewReason = null,
  reviewNote = null,
  reviewedAt = null,
} = {}) {
  requireClient(client);
  const key = requiredString(clusterKey, 'cluster_key');
  const nextDecision = normalizeReviewDecision(decision);
  const reviewer = requiredString(reviewedBy, 'reviewed_by');
  const timestamp = reviewedAt ? new Date(reviewedAt) : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('reviewed_at must be a valid timestamp.');
  }

  await client.query('BEGIN');
  try {
    const clusterResult = await client.query(`
      SELECT *
      FROM usda_food_clusters
      WHERE cluster_key = $1
      FOR UPDATE
    `, [key]);
    const cluster = clusterResult.rows[0] ? { ...clusterResult.rows[0] } : null;
    if (!cluster) {
      throw new Error(`USDA food cluster not found for cluster_key: ${key}`);
    }

    validateReviewTransition(cluster.review_status, nextDecision);
    const eventId = buildReviewEventId({
      clusterId: cluster.cluster_id,
      decision: nextDecision,
      reviewedAt: timestamp.toISOString(),
      reviewedBy: reviewer,
    });

    const updatedResult = await client.query(`
      UPDATE usda_food_clusters
      SET
        review_status = $1,
        reviewed_by = $2,
        reviewed_at = $3,
        review_decision = $1,
        review_reason = $4,
        updated_at = NOW()
      WHERE cluster_id = $5
      RETURNING *
    `, [
      nextDecision,
      reviewer,
      timestamp.toISOString(),
      nullableString(reviewReason),
      cluster.cluster_id,
    ]);

    await client.query(`
      INSERT INTO usda_food_cluster_review_history (
        review_event_id,
        cluster_id,
        cluster_key,
        previous_review_status,
        review_decision,
        reviewed_by,
        reviewed_at,
        review_reason,
        review_note
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (review_event_id) DO UPDATE SET
        review_reason = EXCLUDED.review_reason,
        review_note = EXCLUDED.review_note
    `, [
      eventId,
      cluster.cluster_id,
      cluster.cluster_key,
      cluster.review_status,
      nextDecision,
      reviewer,
      timestamp.toISOString(),
      nullableString(reviewReason),
      nullableString(reviewNote),
    ]);

    await client.query('COMMIT');
    return {
      cluster: updatedResult.rows[0],
      review_event_id: eventId,
      previous_review_status: cluster.review_status,
      review_decision: nextDecision,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function validateReviewTransition(previousStatus, nextStatus) {
  const previous = normalizeReviewDecision(previousStatus);
  const next = normalizeReviewDecision(nextStatus);
  if (previous === next) {
    return true;
  }
  if (TERMINAL_CLUSTER_REVIEW_STATUSES.has(previous)) {
    throw new Error(`Invalid USDA cluster review transition from ${previous} to ${next}. Terminal review decisions cannot be changed by this workflow.`);
  }
  return true;
}

function normalizeReviewDecision(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!SUPPORTED_CLUSTER_REVIEW_DECISIONS.includes(normalized)) {
    throw new Error(`Unsupported USDA cluster review decision: ${value}`);
  }
  return normalized;
}

function buildReviewEventId({
  clusterId,
  decision,
  reviewedAt,
  reviewedBy,
}) {
  return `usda_food_cluster_review:${slugify(clusterId)}:${slugify(reviewedAt)}:${slugify(reviewedBy)}:${slugify(decision)}`;
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return fallback;
  }
  return normalized;
}

function requiredString(value, fieldName) {
  const normalized = nullableString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

function nullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_CLUSTER_REVIEW_LIMIT,
  SUPPORTED_CLUSTER_REVIEW_DECISIONS,
  buildReviewEventId,
  getUsdaFoodClusterReviewDetail,
  listUsdaFoodClustersForReview,
  normalizeReviewDecision,
  reviewUsdaFoodCluster,
  validateReviewTransition,
};
