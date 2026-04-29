const DEFAULT_USDA_CLUSTER_REPORT_LIMIT = 100;
const DEFAULT_USDA_CLUSTER_MIN_CONFIDENCE = 0.75;

async function buildUsdaClusterCandidateInspectionReport({
  client,
  limit = DEFAULT_USDA_CLUSTER_REPORT_LIMIT,
  minConfidence = DEFAULT_USDA_CLUSTER_MIN_CONFIDENCE,
  candidateKey = null,
  coreFood = null,
} = {}) {
  requireClient(client);
  const options = normalizeClusterReportOptions({
    limit,
    minConfidence,
    candidateKey,
    coreFood,
  });
  const filter = buildCandidateFilter(options);
  const scoreThreshold = options.minConfidence * 100;

  // Keep reads sequential on a single pg client. The queries are bounded and
  // independent, and sequential execution avoids pg client query-queue warnings.
  const totals = await queryTotals(client, filter);
  const bySourceDataType = await queryGroupCounts(client, filter, 'source_data_type');
  const byReviewStatus = await queryGroupCounts(client, filter, 'review_status');
  const candidateKeyCollisions = await queryCandidateKeyCollisions(client, filter, options.limit);
  const hardBoundaryCollisions = await queryHardBoundaryCollisions(client, filter, options.limit);
  const lowConfidenceExamples = await queryLowConfidenceExamples(client, filter, scoreThreshold, options.limit);
  const missingQualifierExamples = await queryMissingQualifierExamples(client, filter, options.limit);
  const scoreStats = await queryScoreStats(client, filter);
  const topAmbiguousCoreFoods = await queryTopAmbiguousCoreFoods(client, filter, scoreThreshold, options.limit);

  return {
    generated_at: new Date().toISOString(),
    filters: {
      limit: options.limit,
      min_confidence: options.minConfidence,
      candidate_key: options.candidateKey,
      core_food: options.coreFood,
    },
    total_candidates: totals.total_candidates,
    distinct_candidate_key_count: totals.distinct_candidate_key_count,
    summary_by_source_data_type: bySourceDataType,
    summary_by_review_status: byReviewStatus,
    candidate_key_collision_report: candidateKeyCollisions,
    hard_boundary_signature_collision_report: hardBoundaryCollisions,
    low_confidence_candidates: lowConfidenceExamples,
    candidates_missing_expected_parsed_qualifiers: missingQualifierExamples,
    representative_score_distribution: scoreStats,
    top_ambiguous_core_food_normalized_values: topAmbiguousCoreFoods,
    recommended_next_review_targets: buildRecommendedReviewTargets({
      candidateKeyCollisions,
      hardBoundaryCollisions,
      lowConfidenceExamples,
      missingQualifierExamples,
      topAmbiguousCoreFoods,
    }),
  };
}

async function queryTotals(client, filter) {
  const result = await client.query(`
    SELECT
      COUNT(*)::bigint AS total_candidates,
      COUNT(DISTINCT candidate_key)::bigint AS distinct_candidate_key_count
    FROM usda_food_cluster_candidates
    ${filter.whereSql}
  `, filter.params);
  const row = result.rows[0] || {};
  return {
    total_candidates: Number(row.total_candidates || 0),
    distinct_candidate_key_count: Number(row.distinct_candidate_key_count || 0),
  };
}

async function queryGroupCounts(client, filter, column) {
  assertSafeGroupColumn(column);
  const result = await client.query(`
    SELECT ${column} AS key, COUNT(*)::bigint AS count
    FROM usda_food_cluster_candidates
    ${filter.whereSql}
    GROUP BY ${column}
    ORDER BY count DESC, key ASC
  `, filter.params);
  return (result.rows || []).map((row) => ({
    key: row.key,
    count: Number(row.count || 0),
  }));
}

async function queryCandidateKeyCollisions(client, filter, limit) {
  const result = await client.query(`
    SELECT
      candidate_key,
      COUNT(*)::bigint AS candidate_count,
      COUNT(DISTINCT hard_boundary_signature)::bigint AS distinct_hard_boundary_count,
      (ARRAY_AGG(source_fdc_id ORDER BY representative_score DESC, source_fdc_id ASC))[1:5] AS example_fdc_ids,
      (ARRAY_AGG(source_description ORDER BY representative_score DESC, source_fdc_id ASC))[1:5] AS example_descriptions
    FROM usda_food_cluster_candidates
    ${filter.whereSql}
    GROUP BY candidate_key
    HAVING COUNT(*) > 1
    ORDER BY candidate_count DESC, candidate_key ASC
    LIMIT $${filter.params.length + 1}
  `, [...filter.params, limit]);
  return (result.rows || []).map(normalizeCollisionRow);
}

async function queryHardBoundaryCollisions(client, filter, limit) {
  const result = await client.query(`
    SELECT
      hard_boundary_signature,
      COUNT(*)::bigint AS candidate_count,
      COUNT(DISTINCT candidate_key)::bigint AS distinct_candidate_key_count,
      (ARRAY_AGG(DISTINCT core_food_normalized ORDER BY core_food_normalized ASC))[1:5] AS example_core_foods
    FROM usda_food_cluster_candidates
    ${filter.whereSql}
    GROUP BY hard_boundary_signature
    HAVING COUNT(*) > 1
    ORDER BY distinct_candidate_key_count DESC, candidate_count DESC, hard_boundary_signature ASC
    LIMIT $${filter.params.length + 1}
  `, [...filter.params, limit]);
  return (result.rows || []).map((row) => ({
    hard_boundary_signature: row.hard_boundary_signature,
    candidate_count: Number(row.candidate_count || 0),
    distinct_candidate_key_count: Number(row.distinct_candidate_key_count || 0),
    example_core_foods: row.example_core_foods || [],
  }));
}

async function queryLowConfidenceExamples(client, filter, scoreThreshold, limit) {
  const query = addFilterCondition(filter, '(representative_score < $next OR confidence = $next2 OR review_status = $next3)', [
    scoreThreshold,
    'low',
    'needs_review',
  ]);
  const result = await client.query(`
    SELECT ${candidateExampleColumns()}
    FROM usda_food_cluster_candidates
    ${query.whereSql}
    ORDER BY representative_score ASC, source_fdc_id ASC
    LIMIT $${query.params.length + 1}
  `, [...query.params, limit]);
  return (result.rows || []).map(normalizeCandidateExample);
}

async function queryMissingQualifierExamples(client, filter, limit) {
  const query = addFilterCondition(filter, `(
    parsed_qualifiers_json IS NULL
    OR parsed_qualifiers_json = '{}'::jsonb
    OR NOT (parsed_qualifiers_json ? 'hard_boundary_tokens')
    OR jsonb_typeof(parsed_qualifiers_json->'hard_boundary_tokens') <> 'array'
    OR hard_boundary_signature IS NULL
    OR hard_boundary_signature = ''
  )`);
  const result = await client.query(`
    SELECT ${candidateExampleColumns()}
    FROM usda_food_cluster_candidates
    ${query.whereSql}
    ORDER BY representative_score ASC, source_fdc_id ASC
    LIMIT $${query.params.length + 1}
  `, [...query.params, limit]);
  return (result.rows || []).map(normalizeCandidateExample);
}

async function queryScoreStats(client, filter) {
  const result = await client.query(`
    SELECT
      MIN(representative_score)::numeric AS min_score,
      MAX(representative_score)::numeric AS max_score,
      AVG(representative_score)::numeric AS average_score,
      COUNT(*) FILTER (WHERE representative_score < 55)::bigint AS low_bucket_count,
      COUNT(*) FILTER (WHERE representative_score >= 55 AND representative_score < 75)::bigint AS medium_bucket_count,
      COUNT(*) FILTER (WHERE representative_score >= 75)::bigint AS high_bucket_count
    FROM usda_food_cluster_candidates
    ${filter.whereSql}
  `, filter.params);
  const row = result.rows[0] || {};
  return {
    min_score: nullableNumber(row.min_score),
    max_score: nullableNumber(row.max_score),
    average_score: nullableNumber(row.average_score),
    buckets: {
      low_lt_55: Number(row.low_bucket_count || 0),
      medium_55_to_74: Number(row.medium_bucket_count || 0),
      high_gte_75: Number(row.high_bucket_count || 0),
    },
  };
}

async function queryTopAmbiguousCoreFoods(client, filter, scoreThreshold, limit) {
  const result = await client.query(`
    SELECT
      core_food_normalized,
      MIN(core_food_name) AS core_food_name,
      COUNT(*)::bigint AS candidate_count,
      COUNT(DISTINCT candidate_key)::bigint AS distinct_candidate_key_count,
      COUNT(*) FILTER (WHERE representative_score < $${filter.params.length + 1} OR confidence = 'low')::bigint AS low_confidence_count,
      COUNT(*) FILTER (WHERE review_status = 'needs_review')::bigint AS needs_review_count,
      (ARRAY_AGG(DISTINCT candidate_key ORDER BY candidate_key ASC))[1:5] AS example_candidate_keys
    FROM usda_food_cluster_candidates
    ${filter.whereSql}
    GROUP BY core_food_normalized
    HAVING COUNT(DISTINCT candidate_key) > 1 OR COUNT(*) FILTER (WHERE review_status = 'needs_review') > 0
    ORDER BY distinct_candidate_key_count DESC, needs_review_count DESC, candidate_count DESC, core_food_normalized ASC
    LIMIT $${filter.params.length + 2}
  `, [...filter.params, scoreThreshold, limit]);
  return (result.rows || []).map((row) => ({
    core_food_normalized: row.core_food_normalized,
    core_food_name: row.core_food_name,
    candidate_count: Number(row.candidate_count || 0),
    distinct_candidate_key_count: Number(row.distinct_candidate_key_count || 0),
    low_confidence_count: Number(row.low_confidence_count || 0),
    needs_review_count: Number(row.needs_review_count || 0),
    example_candidate_keys: row.example_candidate_keys || [],
  }));
}

function buildRecommendedReviewTargets({
  candidateKeyCollisions,
  hardBoundaryCollisions,
  lowConfidenceExamples,
  missingQualifierExamples,
  topAmbiguousCoreFoods,
}) {
  const targets = [];
  if (missingQualifierExamples.length > 0) {
    targets.push({
      priority: 'high',
      reason: 'missing_expected_parsed_qualifiers',
      count: missingQualifierExamples.length,
      examples: missingQualifierExamples.slice(0, 5).map((row) => row.candidate_id),
    });
  }
  if (candidateKeyCollisions.length > 0) {
    targets.push({
      priority: 'high',
      reason: 'candidate_key_collisions',
      count: candidateKeyCollisions.length,
      examples: candidateKeyCollisions.slice(0, 5).map((row) => row.candidate_key),
    });
  }
  if (topAmbiguousCoreFoods.length > 0) {
    targets.push({
      priority: 'medium',
      reason: 'ambiguous_core_foods',
      count: topAmbiguousCoreFoods.length,
      examples: topAmbiguousCoreFoods.slice(0, 5).map((row) => row.core_food_normalized),
    });
  }
  if (lowConfidenceExamples.length > 0) {
    targets.push({
      priority: 'medium',
      reason: 'low_confidence_candidates',
      count: lowConfidenceExamples.length,
      examples: lowConfidenceExamples.slice(0, 5).map((row) => row.candidate_id),
    });
  }
  if (hardBoundaryCollisions.length > 0) {
    targets.push({
      priority: 'low',
      reason: 'hard_boundary_signature_broad_groups',
      count: hardBoundaryCollisions.length,
      examples: hardBoundaryCollisions.slice(0, 5).map((row) => row.hard_boundary_signature),
    });
  }
  return targets;
}

function buildCandidateFilter({ candidateKey, coreFood }) {
  const conditions = [];
  const params = [];
  if (candidateKey) {
    params.push(candidateKey);
    conditions.push(`candidate_key = $${params.length}`);
  }
  if (coreFood) {
    params.push(`%${coreFood}%`);
    conditions.push(`(core_food_normalized ILIKE $${params.length} OR core_food_name ILIKE $${params.length})`);
  }
  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function addFilterCondition(filter, conditionTemplate, values = []) {
  const params = [...filter.params];
  let condition = conditionTemplate;
  values.forEach((value, index) => {
    params.push(value);
    condition = condition.replace(index === 0 ? '$next' : `$next${index + 1}`, `$${params.length}`);
  });
  const existing = filter.whereSql ? filter.whereSql.replace(/^WHERE\s+/i, '') : '';
  return {
    whereSql: `WHERE ${[existing, condition].filter(Boolean).join(' AND ')}`,
    params,
  };
}

function normalizeClusterReportOptions({
  limit,
  minConfidence,
  candidateKey,
  coreFood,
} = {}) {
  return {
    limit: positiveInteger(limit, DEFAULT_USDA_CLUSTER_REPORT_LIMIT),
    minConfidence: boundedConfidence(minConfidence),
    candidateKey: nullableString(candidateKey),
    coreFood: nullableString(coreFood),
  };
}

function candidateExampleColumns() {
  return [
    'candidate_id',
    'candidate_key',
    'core_food_name',
    'core_food_normalized',
    'source_fdc_id',
    'source_description',
    'source_data_type',
    'hard_boundary_signature',
    'representative_score',
    'representative_score_json',
    'confidence',
    'review_status',
  ].join(', ');
}

function normalizeCollisionRow(row) {
  return {
    candidate_key: row.candidate_key,
    candidate_count: Number(row.candidate_count || 0),
    distinct_hard_boundary_count: Number(row.distinct_hard_boundary_count || 0),
    example_fdc_ids: (row.example_fdc_ids || []).map(Number),
    example_descriptions: row.example_descriptions || [],
  };
}

function normalizeCandidateExample(row) {
  return {
    candidate_id: row.candidate_id,
    candidate_key: row.candidate_key,
    core_food_name: row.core_food_name,
    core_food_normalized: row.core_food_normalized,
    source_fdc_id: Number(row.source_fdc_id),
    source_description: row.source_description,
    source_data_type: row.source_data_type,
    hard_boundary_signature: row.hard_boundary_signature,
    representative_score: nullableNumber(row.representative_score),
    representative_score_json: row.representative_score_json || {},
    confidence: row.confidence,
    review_status: row.review_status,
  };
}

function assertSafeGroupColumn(column) {
  if (!['source_data_type', 'review_status'].includes(column)) {
    throw new Error(`Unsupported group column: ${column}`);
  }
}

function nullableNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return fallback;
  }
  return normalized;
}

function boundedConfidence(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return DEFAULT_USDA_CLUSTER_MIN_CONFIDENCE;
  }
  return Math.min(1, Math.max(0, normalized));
}

function nullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_USDA_CLUSTER_MIN_CONFIDENCE,
  DEFAULT_USDA_CLUSTER_REPORT_LIMIT,
  buildUsdaClusterCandidateInspectionReport,
  normalizeClusterReportOptions,
};
