const crypto = require('node:crypto');

const DEFAULT_INGREDIENT_PRODUCT_GENERATION_METHOD = 'db3e_deterministic_ingredient_product_matching_v1';
const INGREDIENT_PRODUCT_MAPPING_TYPES = Object.freeze(['exact_match', 'close_match', 'substitute', 'rejected']);
const INGREDIENT_PRODUCT_REVIEW_STATUSES = Object.freeze(['suggested', 'approved', 'rejected', 'needs_review']);
const TERMINAL_REVIEW_STATUSES = Object.freeze(['approved', 'rejected']);

async function insertProductCandidate(client, input = {}) {
  requireClient(client);
  const record = normalizeProductCandidate(input);
  const result = await client.query(`
    INSERT INTO ingredient_product_candidates (
      candidate_id, product_id, product_name, normalized_product_name, brand, size, unit,
      parsed_attributes_json, proposed_ingredient_key, match_confidence, generation_method,
      review_status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
    ON CONFLICT (product_id) DO UPDATE SET
      product_name = EXCLUDED.product_name,
      normalized_product_name = EXCLUDED.normalized_product_name,
      brand = EXCLUDED.brand,
      size = EXCLUDED.size,
      unit = EXCLUDED.unit,
      parsed_attributes_json = EXCLUDED.parsed_attributes_json,
      proposed_ingredient_key = EXCLUDED.proposed_ingredient_key,
      match_confidence = EXCLUDED.match_confidence,
      generation_method = EXCLUDED.generation_method,
      review_status = CASE
        WHEN ingredient_product_candidates.review_status IN ('approved', 'rejected')
          THEN ingredient_product_candidates.review_status
        ELSE EXCLUDED.review_status
      END,
      updated_at = NOW()
    RETURNING *
  `, productCandidateParams(record));
  return hydrateProductCandidateRow(result.rows[0]);
}

async function insertProductCandidates(client, candidates = []) {
  const rows = [];
  for (const candidate of candidates) {
    rows.push(await insertProductCandidate(client, candidate));
  }
  return rows;
}

async function upsertIngredientProductMapping(client, input = {}) {
  requireClient(client);
  const record = normalizeIngredientProductMapping(input);
  const result = await client.query(`
    INSERT INTO ingredient_product_mappings (
      mapping_id, ingredient_id, product_id, mapping_type, confidence, review_status,
      reviewed_by, reviewed_at, review_reason, generation_method
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (ingredient_id, product_id) DO UPDATE SET
      mapping_type = CASE
        WHEN ingredient_product_mappings.review_status IN ('approved', 'rejected')
          THEN ingredient_product_mappings.mapping_type
        ELSE EXCLUDED.mapping_type
      END,
      confidence = CASE
        WHEN ingredient_product_mappings.review_status IN ('approved', 'rejected')
          THEN ingredient_product_mappings.confidence
        ELSE EXCLUDED.confidence
      END,
      review_status = CASE
        WHEN ingredient_product_mappings.review_status IN ('approved', 'rejected')
          THEN ingredient_product_mappings.review_status
        ELSE EXCLUDED.review_status
      END,
      reviewed_by = CASE
        WHEN ingredient_product_mappings.review_status IN ('approved', 'rejected')
          THEN ingredient_product_mappings.reviewed_by
        ELSE EXCLUDED.reviewed_by
      END,
      reviewed_at = CASE
        WHEN ingredient_product_mappings.review_status IN ('approved', 'rejected')
          THEN ingredient_product_mappings.reviewed_at
        ELSE EXCLUDED.reviewed_at
      END,
      review_reason = CASE
        WHEN ingredient_product_mappings.review_status IN ('approved', 'rejected')
          THEN ingredient_product_mappings.review_reason
        ELSE EXCLUDED.review_reason
      END,
      generation_method = CASE
        WHEN ingredient_product_mappings.review_status IN ('approved', 'rejected')
          THEN ingredient_product_mappings.generation_method
        ELSE EXCLUDED.generation_method
      END,
      updated_at = NOW()
    RETURNING *
  `, ingredientProductMappingParams(record));
  return hydrateIngredientProductMappingRow(result.rows[0]);
}

async function upsertIngredientProductMappings(client, mappings = []) {
  const rows = [];
  for (const mapping of mappings) {
    rows.push(await upsertIngredientProductMapping(client, mapping));
  }
  return rows;
}

async function suggestIngredientProductMappings(client, suggestions = []) {
  return upsertIngredientProductMappings(client, suggestions.map((suggestion) => ({
    ...suggestion,
    review_status: suggestion.review_status || 'suggested',
  })));
}

async function listIngredientProductMappingsByIngredient(client, ingredientId, { limit = 100 } = {}) {
  requireClient(client);
  const result = await client.query(`
    SELECT *
    FROM ingredient_product_mappings
    WHERE ingredient_id = $1
    ORDER BY review_status ASC, confidence DESC NULLS LAST, product_id ASC
    LIMIT $2
  `, [requiredString(ingredientId, 'ingredient_id'), positiveInteger(limit, 100)]);
  return (result.rows || []).map(hydrateIngredientProductMappingRow);
}

async function listProductsByIngredient(client, ingredientId, { reviewStatus = 'approved', limit = 100 } = {}) {
  requireClient(client);
  const status = normalizeReviewStatus(reviewStatus);
  const result = await client.query(`
    SELECT
      m.*,
      c.candidate_id,
      c.product_name,
      c.normalized_product_name,
      c.brand,
      c.size,
      c.unit,
      c.parsed_attributes_json,
      c.proposed_ingredient_key
    FROM ingredient_product_mappings m
    LEFT JOIN ingredient_product_candidates c
      ON c.product_id = m.product_id
    WHERE m.ingredient_id = $1
      AND m.review_status = $2
    ORDER BY m.confidence DESC NULLS LAST, m.product_id ASC
    LIMIT $3
  `, [requiredString(ingredientId, 'ingredient_id'), status, positiveInteger(limit, 100)]);
  return (result.rows || []).map(hydrateIngredientProductLinkRow);
}

async function reviewIngredientProductMapping(client, {
  mappingId = null,
  ingredientId = null,
  productId = null,
  reviewStatus,
  mappingType = null,
  reviewedBy = null,
  reviewReason = null,
} = {}) {
  requireClient(client);
  const status = normalizeReviewStatus(reviewStatus);
  const type = mappingType ? normalizeMappingType(mappingType) : status === 'rejected' ? 'rejected' : null;
  const result = mappingId
    ? await client.query(`
      UPDATE ingredient_product_mappings
      SET review_status = $2,
          mapping_type = COALESCE($3, mapping_type),
          reviewed_by = $4,
          reviewed_at = NOW(),
          review_reason = $5,
          updated_at = NOW()
      WHERE mapping_id = $1
      RETURNING *
    `, [mappingId, status, type, nullableString(reviewedBy), nullableString(reviewReason)])
    : await client.query(`
      UPDATE ingredient_product_mappings
      SET review_status = $3,
          mapping_type = COALESCE($4, mapping_type),
          reviewed_by = $5,
          reviewed_at = NOW(),
          review_reason = $6,
          updated_at = NOW()
      WHERE ingredient_id = $1
        AND product_id = $2
      RETURNING *
    `, [requiredString(ingredientId, 'ingredient_id'), requiredString(productId, 'product_id'), status, type, nullableString(reviewedBy), nullableString(reviewReason)]);
  return hydrateIngredientProductMappingRow(result.rows[0] || null);
}

function normalizeProductCandidate(input = {}) {
  const productId = requiredString(input.product_id || input.productId, 'product_id');
  const productName = requiredString(input.product_name || input.productName || input.name, 'product_name');
  return {
    candidate_id: nullableString(input.candidate_id || input.candidateId) || buildProductCandidateId(productId),
    product_id: productId,
    product_name: productName,
    normalized_product_name: normalizeName(input.normalized_product_name || input.normalizedProductName || productName),
    brand: nullableString(input.brand),
    size: nullableNumber(input.size, 'size'),
    unit: nullableString(input.unit),
    parsed_attributes_json: normalizeJsonObject(input.parsed_attributes_json || input.parsedAttributesJson || input.attributes || {}),
    proposed_ingredient_key: nullableString(input.proposed_ingredient_key || input.proposedIngredientKey),
    match_confidence: nullableConfidence(input.match_confidence ?? input.matchConfidence),
    generation_method: requiredString(input.generation_method || input.generationMethod || DEFAULT_INGREDIENT_PRODUCT_GENERATION_METHOD, 'generation_method'),
    review_status: normalizeReviewStatus(input.review_status || input.reviewStatus || 'suggested'),
  };
}

function normalizeIngredientProductMapping(input = {}) {
  const ingredientId = requiredString(input.ingredient_id || input.ingredientId, 'ingredient_id');
  const productId = requiredString(input.product_id || input.productId, 'product_id');
  return {
    mapping_id: nullableString(input.mapping_id || input.mappingId) || buildIngredientProductMappingId(ingredientId, productId),
    ingredient_id: ingredientId,
    product_id: productId,
    mapping_type: normalizeMappingType(input.mapping_type || input.mappingType || 'close_match'),
    confidence: nullableConfidence(input.confidence),
    review_status: normalizeReviewStatus(input.review_status || input.reviewStatus || 'suggested'),
    reviewed_by: nullableString(input.reviewed_by || input.reviewedBy),
    reviewed_at: nullableString(input.reviewed_at || input.reviewedAt),
    review_reason: nullableString(input.review_reason || input.reviewReason),
    generation_method: requiredString(input.generation_method || input.generationMethod || DEFAULT_INGREDIENT_PRODUCT_GENERATION_METHOD, 'generation_method'),
  };
}

function productCandidateParams(record) {
  return [
    record.candidate_id,
    record.product_id,
    record.product_name,
    record.normalized_product_name,
    record.brand,
    record.size,
    record.unit,
    JSON.stringify(record.parsed_attributes_json),
    record.proposed_ingredient_key,
    record.match_confidence,
    record.generation_method,
    record.review_status,
  ];
}

function ingredientProductMappingParams(record) {
  return [
    record.mapping_id,
    record.ingredient_id,
    record.product_id,
    record.mapping_type,
    record.confidence,
    record.review_status,
    record.reviewed_by,
    record.reviewed_at,
    record.review_reason,
    record.generation_method,
  ];
}

function hydrateProductCandidateRow(row) {
  if (!row) return null;
  return {
    ...row,
    parsed_attributes_json: parseJson(row.parsed_attributes_json, {}),
  };
}

function hydrateIngredientProductMappingRow(row) {
  return row ? { ...row } : null;
}

function hydrateIngredientProductLinkRow(row) {
  if (!row) return null;
  return {
    mapping: hydrateIngredientProductMappingRow(row),
    product: {
      candidate_id: row.candidate_id || null,
      product_id: row.product_id,
      product_name: row.product_name || null,
      normalized_product_name: row.normalized_product_name || null,
      brand: row.brand || null,
      size: row.size ?? null,
      unit: row.unit || null,
      parsed_attributes_json: parseJson(row.parsed_attributes_json, {}),
      proposed_ingredient_key: row.proposed_ingredient_key || null,
    },
  };
}

function buildProductCandidateId(productId) {
  return `ingredient_product_candidate:${stableHash(productId)}`;
}

function buildIngredientProductMappingId(ingredientId, productId) {
  return `ingredient_product_mapping:${stableHash(`${ingredientId}|${productId}`)}`;
}

function normalizeMappingType(value) {
  const normalized = requiredString(value, 'mapping_type');
  if (!INGREDIENT_PRODUCT_MAPPING_TYPES.includes(normalized)) {
    throw new Error(`Unsupported ingredient product mapping_type: ${value}`);
  }
  return normalized;
}

function normalizeReviewStatus(value) {
  const normalized = requiredString(value, 'review_status');
  if (!INGREDIENT_PRODUCT_REVIEW_STATUSES.includes(normalized)) {
    throw new Error(`Unsupported ingredient product review_status: ${value}`);
  }
  return normalized;
}

function normalizeJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'string') return parseJson(value, {});
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}0-9]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function nullableConfidence(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    throw new Error(`confidence must be between 0 and 1: ${value}`);
  }
  return normalized;
}

function nullableNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) throw new Error(`${fieldName} must be numeric.`);
  return normalized;
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
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_INGREDIENT_PRODUCT_GENERATION_METHOD,
  INGREDIENT_PRODUCT_MAPPING_TYPES,
  INGREDIENT_PRODUCT_REVIEW_STATUSES,
  TERMINAL_REVIEW_STATUSES,
  buildIngredientProductMappingId,
  buildProductCandidateId,
  hydrateIngredientProductMappingRow,
  hydrateProductCandidateRow,
  insertProductCandidate,
  insertProductCandidates,
  listIngredientProductMappingsByIngredient,
  listProductsByIngredient,
  normalizeIngredientProductMapping,
  normalizeName,
  normalizeProductCandidate,
  reviewIngredientProductMapping,
  suggestIngredientProductMappings,
  upsertIngredientProductMapping,
  upsertIngredientProductMappings,
};
