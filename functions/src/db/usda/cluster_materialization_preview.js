const DEFAULT_USDA_CLUSTER_MATERIALIZATION_LIMIT = 1000;
const DEFAULT_USDA_CLUSTER_MATERIALIZATION_BATCH_SIZE = 500;
const MATERIALIZATION_METHOD = 'deterministic_candidate_group_preview_v1';

async function materializeUsdaClustersPreview({
  client,
  dryRun = false,
  limit = DEFAULT_USDA_CLUSTER_MATERIALIZATION_LIMIT,
  batchSize = DEFAULT_USDA_CLUSTER_MATERIALIZATION_BATCH_SIZE,
  candidateKey = null,
  coreFood = null,
  reviewStatus = null,
} = {}) {
  requireClient(client);
  const options = normalizeClusterMaterializationOptions({
    dryRun,
    limit,
    batchSize,
    candidateKey,
    coreFood,
    reviewStatus,
  });
  const candidates = await fetchClusterMaterializationCandidates(client, options);
  const groups = groupCandidates(candidates);
  const clusters = groups.map((group) => buildProposedCluster(group, options.reviewStatus));
  const members = groups.flatMap((group) => buildProposedMembers(group, group.representative));

  const summary = {
    dry_run: options.dryRun,
    scanned_candidates: candidates.length,
    proposed_clusters: clusters.length,
    proposed_members: members.length,
    upserted_clusters: 0,
    upserted_members: 0,
    filters: {
      limit: options.limit,
      batch_size: options.batchSize,
      candidate_key: options.candidateKey,
      core_food: options.coreFood,
      review_status: options.reviewStatus,
    },
    clusters: clusters.slice(0, options.limit),
    members: members.slice(0, options.limit),
  };

  if (!options.dryRun && clusters.length > 0) {
    summary.upserted_clusters = await upsertUsdaFoodClusters(client, clusters);
    summary.upserted_members = await upsertUsdaFoodClusterMembers(client, members);
  }

  return summary;
}

async function fetchClusterMaterializationCandidates(client, options) {
  requireClient(client);
  const conditions = [];
  const params = [];
  if (options.candidateKey) {
    params.push(options.candidateKey);
    conditions.push(`candidate_key = $${params.length}`);
  }
  if (options.coreFood) {
    params.push(`%${options.coreFood}%`);
    conditions.push(`(core_food_normalized ILIKE $${params.length} OR core_food_name ILIKE $${params.length})`);
  }
  params.push(options.limit);
  const result = await client.query(`
    SELECT
      candidate_id,
      candidate_key,
      core_food_name,
      core_food_normalized,
      source_fdc_id,
      source_description,
      source_data_type,
      source_food_category_id,
      parsed_qualifiers_json,
      hard_boundary_signature,
      representative_score,
      representative_score_json,
      confidence,
      review_status,
      generation_method,
      rules_version,
      source_version
    FROM usda_food_cluster_candidates
    ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY candidate_key ASC, hard_boundary_signature ASC, representative_score DESC, source_fdc_id ASC
    LIMIT $${params.length}
  `, params);
  return (result.rows || []).map(normalizeCandidateRow);
}

function groupCandidates(candidates) {
  const groupsByKey = new Map();
  for (const candidate of candidates) {
    const groupKey = `${candidate.candidate_key}::${candidate.hard_boundary_signature}`;
    if (!groupsByKey.has(groupKey)) {
      groupsByKey.set(groupKey, []);
    }
    groupsByKey.get(groupKey).push(candidate);
  }
  return [...groupsByKey.entries()].map(([groupKey, rows]) => {
    const sortedRows = [...rows].sort(compareRepresentativeCandidates);
    return {
      group_key: groupKey,
      candidate_key: sortedRows[0].candidate_key,
      hard_boundary_signature: sortedRows[0].hard_boundary_signature,
      candidates: sortedRows,
      representative: sortedRows[0],
    };
  });
}

function buildProposedCluster(group, reviewStatus = 'pending_review') {
  const representative = group.representative;
  const clusterKey = buildClusterKey(group.candidate_key, group.hard_boundary_signature);
  const sourceCategoryIds = uniqueSorted(group.candidates
    .map((candidate) => candidate.source_food_category_id)
    .filter(Boolean));

  return {
    cluster_id: `usda_food_cluster:${clusterKey}:${representative.rules_version}`,
    cluster_key: clusterKey,
    core_food_name: representative.core_food_name,
    core_food_normalized: representative.core_food_normalized,
    food_category_hint: mostCommon(group.candidates.map((candidate) => candidate.source_food_category_id).filter(Boolean)),
    source_category_ids: sourceCategoryIds,
    parsed_shared_qualifiers_json: buildSharedQualifiers(group.candidates, group.hard_boundary_signature),
    representative_fdc_id: representative.source_fdc_id,
    representative_selection_reason: buildRepresentativeSelectionReason(representative),
    confidence: representative.confidence,
    review_status: reviewStatus || 'pending_review',
    generation_method: MATERIALIZATION_METHOD,
    rules_version: representative.rules_version,
    source_version: representative.source_version,
  };
}

function buildProposedMembers(group, representative) {
  const cluster = buildProposedCluster(group);
  return group.candidates.map((candidate) => {
    const isRepresentative = candidate.source_fdc_id === representative.source_fdc_id;
    const needsReview = candidate.confidence === 'low' || candidate.review_status === 'needs_review';
    const memberRole = isRepresentative ? 'representative' : needsReview ? 'candidate' : 'included';
    return {
      cluster_member_id: `usda_food_cluster_member:${cluster.cluster_id}:${candidate.source_fdc_id}`,
      cluster_id: cluster.cluster_id,
      fdc_id: candidate.source_fdc_id,
      member_role: memberRole,
      confidence: candidate.confidence,
      inclusion_reason: isRepresentative
        ? 'highest_representative_score_with_deterministic_tiebreaks'
        : 'same_candidate_key_and_hard_boundary_signature',
      exclusion_flags: needsReview && !isRepresentative ? ['needs_review_or_low_confidence'] : [],
      source_data_type: candidate.source_data_type,
    };
  });
}

async function upsertUsdaFoodClusters(client, clusters) {
  requireClient(client);
  if (!clusters || clusters.length === 0) {
    return 0;
  }
  const columns = [
    'cluster_id',
    'cluster_key',
    'core_food_name',
    'core_food_normalized',
    'food_category_hint',
    'source_category_ids',
    'parsed_shared_qualifiers_json',
    'representative_fdc_id',
    'representative_selection_reason',
    'confidence',
    'review_status',
    'generation_method',
    'rules_version',
    'source_version',
  ];
  const values = [];
  const rows = clusters.map((cluster, rowIndex) => {
    const record = normalizeClusterRecord(cluster);
    return `(${columns.map((column, columnIndex) => {
      const value = jsonColumns.has(column) ? JSON.stringify(record[column] || (column === 'source_category_ids' ? [] : {})) : record[column];
      values.push(value);
      const cast = jsonColumns.has(column) ? '::jsonb' : '';
      return `$${rowIndex * columns.length + columnIndex + 1}${cast}`;
    }).join(', ')})`;
  });

  await client.query(`
    INSERT INTO usda_food_clusters (${columns.join(', ')})
    VALUES ${rows.join(', ')}
    ON CONFLICT (cluster_key) DO UPDATE SET
      core_food_name = EXCLUDED.core_food_name,
      core_food_normalized = EXCLUDED.core_food_normalized,
      food_category_hint = EXCLUDED.food_category_hint,
      source_category_ids = EXCLUDED.source_category_ids,
      parsed_shared_qualifiers_json = EXCLUDED.parsed_shared_qualifiers_json,
      representative_fdc_id = EXCLUDED.representative_fdc_id,
      representative_selection_reason = EXCLUDED.representative_selection_reason,
      confidence = EXCLUDED.confidence,
      review_status = CASE
        WHEN usda_food_clusters.review_status IN ('approved', 'rejected') THEN usda_food_clusters.review_status
        ELSE EXCLUDED.review_status
      END,
      generation_method = EXCLUDED.generation_method,
      rules_version = EXCLUDED.rules_version,
      source_version = EXCLUDED.source_version,
      updated_at = NOW()
  `, values);
  return clusters.length;
}

async function upsertUsdaFoodClusterMembers(client, members) {
  requireClient(client);
  if (!members || members.length === 0) {
    return 0;
  }
  const columns = [
    'cluster_member_id',
    'cluster_id',
    'fdc_id',
    'member_role',
    'confidence',
    'inclusion_reason',
    'exclusion_flags',
    'source_data_type',
  ];
  const values = [];
  const rows = members.map((member, rowIndex) => {
    const record = normalizeMemberRecord(member);
    return `(${columns.map((column, columnIndex) => {
      values.push(column === 'exclusion_flags' ? JSON.stringify(record[column] || []) : record[column]);
      const cast = column === 'exclusion_flags' ? '::jsonb' : '';
      return `$${rowIndex * columns.length + columnIndex + 1}${cast}`;
    }).join(', ')})`;
  });

  await client.query(`
    INSERT INTO usda_food_cluster_members (${columns.join(', ')})
    VALUES ${rows.join(', ')}
    ON CONFLICT (cluster_id, fdc_id) DO UPDATE SET
      member_role = EXCLUDED.member_role,
      confidence = EXCLUDED.confidence,
      inclusion_reason = EXCLUDED.inclusion_reason,
      exclusion_flags = EXCLUDED.exclusion_flags,
      source_data_type = EXCLUDED.source_data_type,
      updated_at = NOW()
  `, values);
  return members.length;
}

function compareRepresentativeCandidates(left, right) {
  const scoreDelta = Number(right.representative_score) - Number(left.representative_score);
  if (scoreDelta !== 0) return scoreDelta;
  const dataTypeDelta = dataTypeRank(right.source_data_type) - dataTypeRank(left.source_data_type);
  if (dataTypeDelta !== 0) return dataTypeDelta;
  const confidenceDelta = confidenceRank(right.confidence) - confidenceRank(left.confidence);
  if (confidenceDelta !== 0) return confidenceDelta;
  const lengthDelta = String(left.source_description).length - String(right.source_description).length;
  if (lengthDelta !== 0) return lengthDelta;
  return Number(left.source_fdc_id) - Number(right.source_fdc_id);
}

function buildSharedQualifiers(candidates, hardBoundarySignature) {
  const shared = {
    hard_boundary_signature: hardBoundarySignature,
    hard_boundary_tokens: hardBoundarySignature === 'generic' ? [] : String(hardBoundarySignature).split('|'),
  };
  const keys = new Set(candidates.flatMap((candidate) => Object.keys(candidate.parsed_qualifiers_json || {})));
  for (const key of [...keys].sort()) {
    const values = candidates.map((candidate) => JSON.stringify((candidate.parsed_qualifiers_json || {})[key]));
    if (values.length > 0 && values.every((value) => value === values[0])) {
      shared[key] = JSON.parse(values[0]);
    }
  }
  return shared;
}

function buildRepresentativeSelectionReason(representative) {
  return [
    `score:${representative.representative_score}`,
    `data_type:${representative.source_data_type}`,
    `confidence:${representative.confidence}`,
    'tie_breakers:foundation_then_confidence_then_description_length_then_fdc_id',
  ].join('|');
}

function normalizeClusterMaterializationOptions({
  dryRun,
  limit,
  batchSize,
  candidateKey,
  coreFood,
  reviewStatus,
} = {}) {
  return {
    dryRun: Boolean(dryRun),
    limit: positiveInteger(limit, DEFAULT_USDA_CLUSTER_MATERIALIZATION_LIMIT),
    batchSize: positiveInteger(batchSize, DEFAULT_USDA_CLUSTER_MATERIALIZATION_BATCH_SIZE),
    candidateKey: nullableString(candidateKey),
    coreFood: nullableString(coreFood),
    reviewStatus: nullableString(reviewStatus) || 'pending_review',
  };
}

function normalizeCandidateRow(row) {
  return {
    ...row,
    source_fdc_id: Number(row.source_fdc_id),
    source_food_category_id: nullableString(row.source_food_category_id),
    parsed_qualifiers_json: row.parsed_qualifiers_json || {},
    representative_score: Number(row.representative_score || 0),
  };
}

function normalizeClusterRecord(cluster) {
  return {
    ...cluster,
    cluster_id: requiredString(cluster.cluster_id, 'cluster_id'),
    cluster_key: requiredString(cluster.cluster_key, 'cluster_key'),
    core_food_name: requiredString(cluster.core_food_name, 'core_food_name'),
    core_food_normalized: requiredString(cluster.core_food_normalized, 'core_food_normalized'),
    food_category_hint: nullableString(cluster.food_category_hint),
    source_category_ids: cluster.source_category_ids || [],
    parsed_shared_qualifiers_json: cluster.parsed_shared_qualifiers_json || {},
    representative_fdc_id: requiredNumber(cluster.representative_fdc_id, 'representative_fdc_id'),
    representative_selection_reason: requiredString(cluster.representative_selection_reason, 'representative_selection_reason'),
    confidence: requiredString(cluster.confidence, 'confidence'),
    review_status: requiredString(cluster.review_status, 'review_status'),
    generation_method: requiredString(cluster.generation_method, 'generation_method'),
    rules_version: requiredString(cluster.rules_version, 'rules_version'),
    source_version: nullableString(cluster.source_version),
  };
}

function normalizeMemberRecord(member) {
  return {
    cluster_member_id: requiredString(member.cluster_member_id, 'cluster_member_id'),
    cluster_id: requiredString(member.cluster_id, 'cluster_id'),
    fdc_id: requiredNumber(member.fdc_id, 'fdc_id'),
    member_role: requiredString(member.member_role, 'member_role'),
    confidence: requiredString(member.confidence, 'confidence'),
    inclusion_reason: requiredString(member.inclusion_reason, 'inclusion_reason'),
    exclusion_flags: member.exclusion_flags || [],
    source_data_type: requiredString(member.source_data_type, 'source_data_type'),
  };
}

function buildClusterKey(candidateKey, hardBoundarySignature) {
  return `${candidateKey}__hb_${slugify(hardBoundarySignature || 'generic')}`;
}

function dataTypeRank(value) {
  if (value === 'foundation_food') return 2;
  if (value === 'sr_legacy_food') return 1;
  return 0;
}

function confidenceRank(value) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  if (value === 'low') return 1;
  return 0;
}

function mostCommon(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))[0]?.[0] || null;
}

function uniqueSorted(values) {
  return [...new Set(values.map(String))].sort();
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

function requiredNumber(value, fieldName) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new Error(`${fieldName} must be numeric.`);
  }
  return normalized;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'generic';
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

const jsonColumns = new Set(['source_category_ids', 'parsed_shared_qualifiers_json']);

module.exports = {
  DEFAULT_USDA_CLUSTER_MATERIALIZATION_BATCH_SIZE,
  DEFAULT_USDA_CLUSTER_MATERIALIZATION_LIMIT,
  MATERIALIZATION_METHOD,
  buildClusterKey,
  buildProposedCluster,
  buildProposedMembers,
  compareRepresentativeCandidates,
  fetchClusterMaterializationCandidates,
  materializeUsdaClustersPreview,
  normalizeClusterMaterializationOptions,
  upsertUsdaFoodClusterMembers,
  upsertUsdaFoodClusters,
};
