const DEFAULT_INGREDIENT_REPORT_LIMIT = 100;
const SUPPORTED_REPORT_REVIEW_STATUSES = ['draft', 'active', 'rejected', 'needs_review'];

async function buildIngredientInspectionReport({
  client,
  limit = DEFAULT_INGREDIENT_REPORT_LIMIT,
  reviewStatus = null,
  missingBg = false,
  withoutMapping = false,
} = {}) {
  requireClient(client);
  const options = normalizeIngredientReportOptions({ limit, reviewStatus, missingBg, withoutMapping });
  const filter = buildIngredientFilter(options);

  // Keep these reads sequential on one pg client. The report is intentionally
  // read-only and bounded so it can be run safely during review sessions.
  const totalIngredients = await queryTotalIngredients(client, filter);
  const byReviewStatus = await queryGroupCounts(client, filter, 'review_status');
  const byFoodFamily = await queryGroupCounts(client, filter, 'food_family');
  const missingBulgarianNames = await queryMissingBulgarianNames(client, filter, options.limit);
  const missingDefaultUnits = await queryMissingDefaultUnits(client, filter, options.limit);
  const duplicateNormalizedNames = await queryDuplicateNormalizedNames(client, filter, options.limit);
  const aliasCollisions = await queryAliasCollisions(client, filter, options.limit);
  const ingredientsWithoutNutritionMappings = await queryIngredientsWithoutNutritionMappings(client, filter, options.limit);

  return {
    generated_at: new Date().toISOString(),
    filters: {
      limit: options.limit,
      review_status: options.reviewStatus,
      missing_bg: options.missingBg,
      without_mapping: options.withoutMapping,
    },
    total_ingredients: totalIngredients,
    summary_by_review_status: byReviewStatus,
    summary_by_food_family: byFoodFamily,
    missing_bulgarian_names: missingBulgarianNames,
    missing_default_units: missingDefaultUnits,
    duplicate_normalized_names: duplicateNormalizedNames,
    alias_collision_report: aliasCollisions,
    ingredients_without_nutrition_mappings: ingredientsWithoutNutritionMappings,
    recommended_next_review_targets: buildRecommendedIngredientReviewTargets({
      missingBulgarianNames,
      missingDefaultUnits,
      duplicateNormalizedNames,
      aliasCollisions,
      ingredientsWithoutNutritionMappings,
    }),
  };
}

async function queryTotalIngredients(client, filter) {
  const result = await client.query(`
    SELECT COUNT(*)::bigint AS total_ingredients
    FROM ingredients i
    ${filter.whereSql}
  `, filter.params);
  return Number((result.rows[0] || {}).total_ingredients || 0);
}

async function queryGroupCounts(client, filter, column) {
  assertSafeGroupColumn(column);
  const result = await client.query(`
    SELECT i.${column} AS key, COUNT(*)::bigint AS count
    FROM ingredients i
    ${filter.whereSql}
    GROUP BY i.${column}
    ORDER BY count DESC, key ASC
  `, filter.params);
  return (result.rows || []).map((row) => ({
    key: row.key,
    count: Number(row.count || 0),
  }));
}

async function queryMissingBulgarianNames(client, filter, limit) {
  const scoped = addFilterCondition(filter, "(i.name_bg IS NULL OR btrim(i.name_bg) = '')");
  const result = await client.query(`
    SELECT ${ingredientExampleColumns()}
    FROM ingredients i
    ${scoped.whereSql}
    ORDER BY i.review_status DESC, i.ingredient_key ASC
    LIMIT $${scoped.params.length + 1}
  `, [...scoped.params, limit]);
  return (result.rows || []).map(normalizeIngredientExample);
}

async function queryMissingDefaultUnits(client, filter, limit) {
  const scoped = addFilterCondition(filter, "((i.default_unit IS NULL OR btrim(i.default_unit) = '') OR (i.shopping_unit IS NULL OR btrim(i.shopping_unit) = ''))");
  const result = await client.query(`
    SELECT ${ingredientExampleColumns()}
    FROM ingredients i
    ${scoped.whereSql}
    ORDER BY i.review_status DESC, i.ingredient_key ASC
    LIMIT $${scoped.params.length + 1}
  `, [...scoped.params, limit]);
  return (result.rows || []).map(normalizeIngredientExample);
}

async function queryDuplicateNormalizedNames(client, filter, limit) {
  const result = await client.query(`
    SELECT
      i.normalized_name,
      COUNT(*)::bigint AS ingredient_count,
      (ARRAY_AGG(i.ingredient_id ORDER BY i.ingredient_key ASC))[1:10] AS ingredient_ids,
      (ARRAY_AGG(i.ingredient_key ORDER BY i.ingredient_key ASC))[1:10] AS ingredient_keys,
      (ARRAY_AGG(i.name_en ORDER BY i.ingredient_key ASC))[1:10] AS names_en
    FROM ingredients i
    ${filter.whereSql}
    GROUP BY i.normalized_name
    HAVING COUNT(*) > 1
    ORDER BY ingredient_count DESC, i.normalized_name ASC
    LIMIT $${filter.params.length + 1}
  `, [...filter.params, limit]);
  return (result.rows || []).map((row) => ({
    normalized_name: row.normalized_name,
    ingredient_count: Number(row.ingredient_count || 0),
    ingredient_ids: row.ingredient_ids || [],
    ingredient_keys: row.ingredient_keys || [],
    names_en: row.names_en || [],
  }));
}

async function queryAliasCollisions(client, filter, limit) {
  const result = await client.query(`
    WITH scoped_ingredients AS (
      SELECT i.*
      FROM ingredients i
      ${filter.whereSql}
    ),
    ingredient_aliases AS (
      SELECT
        lower(alias_value) AS normalized_alias,
        ingredient_id,
        ingredient_key,
        name_en
      FROM scoped_ingredients
      CROSS JOIN LATERAL jsonb_array_elements_text(
        COALESCE(aliases_json->'all', '[]'::jsonb)
        || COALESCE(aliases_json->'en', '[]'::jsonb)
        || COALESCE(aliases_json->'bg', '[]'::jsonb)
      ) AS alias_value
      WHERE btrim(alias_value) <> ''
    )
    SELECT
      normalized_alias,
      COUNT(DISTINCT ingredient_id)::bigint AS ingredient_count,
      (ARRAY_AGG(DISTINCT ingredient_key ORDER BY ingredient_key ASC))[1:10] AS ingredient_keys,
      (ARRAY_AGG(DISTINCT name_en ORDER BY name_en ASC))[1:10] AS names_en
    FROM ingredient_aliases
    GROUP BY normalized_alias
    HAVING COUNT(DISTINCT ingredient_id) > 1
    ORDER BY ingredient_count DESC, normalized_alias ASC
    LIMIT $${filter.params.length + 1}
  `, [...filter.params, limit]);
  return (result.rows || []).map((row) => ({
    normalized_alias: row.normalized_alias,
    ingredient_count: Number(row.ingredient_count || 0),
    ingredient_keys: row.ingredient_keys || [],
    names_en: row.names_en || [],
  }));
}

async function queryIngredientsWithoutNutritionMappings(client, filter, limit) {
  const scoped = addFilterCondition(filter, `NOT EXISTS (
    SELECT 1
    FROM ingredient_nutrition_mappings inm
    WHERE inm.ingredient_id = i.ingredient_id
      AND inm.review_status IN ('suggested', 'approved', 'needs_review')
  )`);
  const result = await client.query(`
    SELECT ${ingredientExampleColumns()}
    FROM ingredients i
    ${scoped.whereSql}
    ORDER BY
      CASE i.review_status
        WHEN 'active' THEN 0
        WHEN 'needs_review' THEN 1
        WHEN 'draft' THEN 2
        ELSE 3
      END,
      i.ingredient_key ASC
    LIMIT $${scoped.params.length + 1}
  `, [...scoped.params, limit]);
  return (result.rows || []).map(normalizeIngredientExample);
}

function buildRecommendedIngredientReviewTargets({
  missingBulgarianNames,
  missingDefaultUnits,
  duplicateNormalizedNames,
  aliasCollisions,
  ingredientsWithoutNutritionMappings,
}) {
  const targets = [];
  if (duplicateNormalizedNames.length > 0) {
    targets.push({
      priority: 'high',
      reason: 'duplicate_normalized_names',
      count: duplicateNormalizedNames.length,
      examples: duplicateNormalizedNames.slice(0, 5).map((row) => row.normalized_name),
    });
  }
  if (aliasCollisions.length > 0) {
    targets.push({
      priority: 'high',
      reason: 'alias_collisions',
      count: aliasCollisions.length,
      examples: aliasCollisions.slice(0, 5).map((row) => row.normalized_alias),
    });
  }
  if (missingDefaultUnits.length > 0) {
    targets.push({
      priority: 'medium',
      reason: 'missing_default_units',
      count: missingDefaultUnits.length,
      examples: missingDefaultUnits.slice(0, 5).map((row) => row.ingredient_key),
    });
  }
  if (missingBulgarianNames.length > 0) {
    targets.push({
      priority: 'medium',
      reason: 'missing_bulgarian_names',
      count: missingBulgarianNames.length,
      examples: missingBulgarianNames.slice(0, 5).map((row) => row.ingredient_key),
    });
  }
  if (ingredientsWithoutNutritionMappings.length > 0) {
    targets.push({
      priority: 'low',
      reason: 'ingredients_without_nutrition_mappings',
      count: ingredientsWithoutNutritionMappings.length,
      examples: ingredientsWithoutNutritionMappings.slice(0, 5).map((row) => row.ingredient_key),
    });
  }
  return targets;
}

function buildIngredientFilter({ reviewStatus, missingBg, withoutMapping }) {
  const conditions = [];
  const params = [];
  if (reviewStatus) {
    params.push(reviewStatus);
    conditions.push(`i.review_status = $${params.length}`);
  }
  if (missingBg) {
    conditions.push("(i.name_bg IS NULL OR btrim(i.name_bg) = '')");
  }
  if (withoutMapping) {
    conditions.push(`NOT EXISTS (
      SELECT 1
      FROM ingredient_nutrition_mappings inm
      WHERE inm.ingredient_id = i.ingredient_id
        AND inm.review_status IN ('suggested', 'approved', 'needs_review')
    )`);
  }
  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function addFilterCondition(filter, condition) {
  const existing = filter.whereSql ? filter.whereSql.replace(/^WHERE\s+/i, '') : '';
  return {
    whereSql: `WHERE ${[existing, condition].filter(Boolean).join(' AND ')}`,
    params: [...filter.params],
  };
}

function normalizeIngredientReportOptions({
  limit,
  reviewStatus,
  missingBg,
  withoutMapping,
} = {}) {
  return {
    limit: positiveInteger(limit, DEFAULT_INGREDIENT_REPORT_LIMIT),
    reviewStatus: normalizeReviewStatus(reviewStatus),
    missingBg: Boolean(missingBg),
    withoutMapping: Boolean(withoutMapping),
  };
}

function ingredientExampleColumns() {
  return [
    'i.ingredient_id',
    'i.ingredient_key',
    'i.name_en',
    'i.name_bg',
    'i.normalized_name',
    'i.food_family',
    'i.default_unit',
    'i.shopping_unit',
    'i.review_status',
  ].join(', ');
}

function normalizeIngredientExample(row) {
  return {
    ingredient_id: row.ingredient_id,
    ingredient_key: row.ingredient_key,
    name_en: row.name_en,
    name_bg: row.name_bg,
    normalized_name: row.normalized_name,
    food_family: row.food_family,
    default_unit: row.default_unit,
    shopping_unit: row.shopping_unit,
    review_status: row.review_status,
  };
}

function assertSafeGroupColumn(column) {
  if (!['review_status', 'food_family'].includes(column)) {
    throw new Error(`Unsupported ingredient report group column: ${column}`);
  }
}

function normalizeReviewStatus(value) {
  const normalized = nullableString(value);
  if (!normalized) return null;
  if (!SUPPORTED_REPORT_REVIEW_STATUSES.includes(normalized)) {
    throw new Error(`Unsupported ingredient review_status: ${normalized}`);
  }
  return normalized;
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_INGREDIENT_REPORT_LIMIT,
  buildIngredientFilter,
  buildIngredientInspectionReport,
  buildRecommendedIngredientReviewTargets,
  normalizeIngredientReportOptions,
};
