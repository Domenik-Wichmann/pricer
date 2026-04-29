function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

async function upsertUsdaFoodClusterCandidates(client, candidates) {
  requireClient(client);
  if (!candidates || candidates.length === 0) {
    return 0;
  }

  const columns = [
    'candidate_id',
    'candidate_key',
    'core_food_name',
    'core_food_normalized',
    'source_fdc_id',
    'source_description',
    'source_data_type',
    'source_food_category_id',
    'parsed_qualifiers_json',
    'hard_boundary_signature',
    'representative_score',
    'representative_score_json',
    'confidence',
    'review_status',
    'generation_method',
    'rules_version',
    'source_version',
  ];
  const values = [];
  const rows = candidates.map((candidate, rowIndex) => {
    const record = normalizeUsdaFoodClusterCandidate(candidate);
    return `(${columns.map((column, columnIndex) => {
      values.push(jsonColumns.has(column) ? JSON.stringify(record[column] || {}) : record[column]);
      const cast = jsonColumns.has(column) ? '::jsonb' : '';
      return `$${rowIndex * columns.length + columnIndex + 1}${cast}`;
    }).join(', ')})`;
  });

  await client.query(`
    INSERT INTO usda_food_cluster_candidates (${columns.join(', ')})
    VALUES ${rows.join(', ')}
    ON CONFLICT (candidate_id) DO UPDATE SET
      candidate_key = EXCLUDED.candidate_key,
      core_food_name = EXCLUDED.core_food_name,
      core_food_normalized = EXCLUDED.core_food_normalized,
      source_fdc_id = EXCLUDED.source_fdc_id,
      source_description = EXCLUDED.source_description,
      source_data_type = EXCLUDED.source_data_type,
      source_food_category_id = EXCLUDED.source_food_category_id,
      parsed_qualifiers_json = EXCLUDED.parsed_qualifiers_json,
      hard_boundary_signature = EXCLUDED.hard_boundary_signature,
      representative_score = EXCLUDED.representative_score,
      representative_score_json = EXCLUDED.representative_score_json,
      confidence = EXCLUDED.confidence,
      review_status = EXCLUDED.review_status,
      generation_method = EXCLUDED.generation_method,
      rules_version = EXCLUDED.rules_version,
      source_version = EXCLUDED.source_version,
      updated_at = NOW()
  `, values);
  return candidates.length;
}

async function listUsdaFoodClusterCandidatesByKey(client, candidateKey) {
  requireClient(client);
  const result = await client.query(`
    SELECT *
    FROM usda_food_cluster_candidates
    WHERE candidate_key = $1
    ORDER BY representative_score DESC, source_data_type, source_fdc_id
  `, [requiredString(candidateKey, 'candidate_key')]);
  return result.rows || [];
}

function normalizeUsdaFoodClusterCandidate(candidate = {}) {
  return {
    candidate_id: requiredString(candidate.candidate_id || candidate.candidateId, 'candidate_id'),
    candidate_key: requiredString(candidate.candidate_key || candidate.candidateKey, 'candidate_key'),
    core_food_name: requiredString(candidate.core_food_name || candidate.coreFoodName, 'core_food_name'),
    core_food_normalized: requiredString(candidate.core_food_normalized || candidate.coreFoodNormalized, 'core_food_normalized'),
    source_fdc_id: requiredNumber(candidate.source_fdc_id || candidate.sourceFdcId, 'source_fdc_id'),
    source_description: requiredString(candidate.source_description || candidate.sourceDescription, 'source_description'),
    source_data_type: requiredString(candidate.source_data_type || candidate.sourceDataType, 'source_data_type'),
    source_food_category_id: nullableString(candidate.source_food_category_id || candidate.sourceFoodCategoryId),
    parsed_qualifiers_json: candidate.parsed_qualifiers_json || candidate.parsedQualifiersJson || {},
    hard_boundary_signature: requiredString(candidate.hard_boundary_signature || candidate.hardBoundarySignature, 'hard_boundary_signature'),
    representative_score: requiredNumber(candidate.representative_score || candidate.representativeScore || 0, 'representative_score'),
    representative_score_json: candidate.representative_score_json || candidate.representativeScoreJson || {},
    confidence: requiredString(candidate.confidence, 'confidence'),
    review_status: requiredString(candidate.review_status || candidate.reviewStatus, 'review_status'),
    generation_method: requiredString(candidate.generation_method || candidate.generationMethod, 'generation_method'),
    rules_version: requiredString(candidate.rules_version || candidate.rulesVersion, 'rules_version'),
    source_version: nullableString(candidate.source_version || candidate.sourceVersion),
  };
}

const jsonColumns = new Set(['parsed_qualifiers_json', 'representative_score_json']);

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

module.exports = {
  listUsdaFoodClusterCandidatesByKey,
  normalizeUsdaFoodClusterCandidate,
  upsertUsdaFoodClusterCandidates,
};
