const DEFAULT_MAPPING_SUGGESTION_LIMIT = 1000;
const MAPPING_SUGGESTION_METHOD = 'deterministic_approved_cluster_to_ingredient_v1';

async function suggestIngredientNutritionMappings({
  client,
  dryRun = false,
  limit = DEFAULT_MAPPING_SUGGESTION_LIMIT,
  ingredient = null,
  clusterKey = null,
} = {}) {
  requireClient(client);
  const options = normalizeMappingSuggestionOptions({ dryRun, limit, ingredient, clusterKey });
  const clusters = await fetchApprovedUsdaClustersForMapping(client, options);
  const ingredients = await fetchPricerIngredientsForMapping(client, options);
  const suggestions = buildIngredientNutritionMappingSuggestions({ clusters, ingredients });
  const summary = {
    dry_run: options.dryRun,
    approved_clusters_scanned: clusters.length,
    ingredients_scanned: ingredients.length,
    suggestions: suggestions.slice(0, options.limit),
    suggested_count: suggestions.length,
    upserted: 0,
    filters: {
      limit: options.limit,
      ingredient: options.ingredient,
      cluster_key: options.clusterKey,
    },
  };
  if (!options.dryRun && suggestions.length > 0) {
    summary.upserted = await upsertIngredientNutritionMappingSuggestions(client, suggestions);
  }
  return summary;
}

async function fetchApprovedUsdaClustersForMapping(client, options) {
  requireClient(client);
  const conditions = ['review_status = $1'];
  const params = ['approved'];
  if (options.clusterKey) {
    params.push(options.clusterKey);
    conditions.push(`cluster_key = $${params.length}`);
  }
  params.push(options.limit);
  const result = await client.query(`
    SELECT
      cluster_id,
      cluster_key,
      core_food_name,
      core_food_normalized,
      parsed_shared_qualifiers_json,
      representative_fdc_id,
      confidence,
      review_status,
      generation_method,
      rules_version,
      source_version
    FROM usda_food_clusters
    WHERE ${conditions.join(' AND ')}
    ORDER BY core_food_normalized ASC, cluster_key ASC
    LIMIT $${params.length}
  `, params);
  return (result.rows || []).map((row) => ({
    ...row,
    representative_fdc_id: Number(row.representative_fdc_id),
    parsed_shared_qualifiers_json: row.parsed_shared_qualifiers_json || {},
  }));
}

async function fetchPricerIngredientsForMapping(client, options) {
  requireClient(client);
  const params = [];
  const conditions = ["COALESCE(review_status, 'active') = 'active'"];
  if (options.ingredient) {
    params.push(`%${options.ingredient}%`);
    conditions.push(`(ingredient_id ILIKE $${params.length} OR name_en ILIKE $${params.length} OR name_bg ILIKE $${params.length})`);
  }
  params.push(options.limit);
  const result = await client.query(`
    SELECT
      ingredient_id,
      name_en,
      name_bg,
      aliases_json,
      review_status
    FROM ingredients
    WHERE ${conditions.join(' AND ')}
    ORDER BY ingredient_id ASC
    LIMIT $${params.length}
  `, params);
  return (result.rows || []).map(normalizeIngredientRow);
}

function buildIngredientNutritionMappingSuggestions({ clusters, ingredients }) {
  const suggestions = [];
  for (const cluster of clusters) {
    for (const ingredient of ingredients) {
      const match = matchClusterToIngredient(cluster, ingredient);
      if (!match) continue;
      const state = inferClusterState(cluster);
      suggestions.push({
        mapping_id: `ingredient_nutrition_mapping:${ingredient.ingredient_id}:${cluster.cluster_id}:${state || 'generic'}`,
        ingredient_id: ingredient.ingredient_id,
        cluster_id: cluster.cluster_id,
        representative_fdc_id: cluster.representative_fdc_id,
        default_for_state: state,
        mapping_type: inferMappingType(state, match),
        confidence: match.confidence,
        source: 'usda_cluster_reviewed',
        review_status: match.confidence >= 0.9 ? 'suggested' : 'needs_review',
        notes: null,
        suggestion_reason_json: {
          match_type: match.match_type,
          matched_value: match.matched_value,
          cluster_key: cluster.cluster_key,
          cluster_state: state,
          no_direct_usda_food_mapping: true,
        },
        generation_method: MAPPING_SUGGESTION_METHOD,
        rules_version: cluster.rules_version,
        source_version: cluster.source_version,
      });
    }
  }
  return suggestions.sort((left, right) => (
    right.confidence - left.confidence
    || left.ingredient_id.localeCompare(right.ingredient_id)
    || left.cluster_id.localeCompare(right.cluster_id)
  ));
}

function matchClusterToIngredient(cluster, ingredient) {
  const clusterTerms = new Set([
    normalizeName(cluster.core_food_normalized),
    normalizeName(cluster.core_food_name),
  ].filter(Boolean));
  const exactTerms = [
    ingredient.name_en,
    ingredient.name_bg,
    ingredient.ingredient_id,
  ].map(normalizeName).filter(Boolean);
  const exactMatch = exactTerms.find((term) => clusterTerms.has(term));
  if (exactMatch) {
    return { match_type: 'exact_name', matched_value: exactMatch, confidence: 0.95 };
  }
  const aliasMatch = ingredient.aliases
    .map(normalizeName)
    .find((term) => clusterTerms.has(term));
  if (aliasMatch) {
    return { match_type: 'alias', matched_value: aliasMatch, confidence: 0.9 };
  }
  const state = inferClusterState(cluster);
  if (state && exactTerms.some((term) => term && [...clusterTerms].some((clusterTerm) => clusterTerm.includes(term)))) {
    return { match_type: 'state_aware_partial', matched_value: state, confidence: 0.72 };
  }
  return null;
}

async function upsertIngredientNutritionMappingSuggestions(client, mappings) {
  requireClient(client);
  if (!mappings || mappings.length === 0) return 0;
  const columns = [
    'mapping_id',
    'ingredient_id',
    'cluster_id',
    'representative_fdc_id',
    'default_for_state',
    'mapping_type',
    'confidence',
    'source',
    'review_status',
    'notes',
    'suggestion_reason_json',
    'generation_method',
    'rules_version',
    'source_version',
  ];
  const values = [];
  const rows = mappings.map((mapping, rowIndex) => `(${columns.map((column, columnIndex) => {
    const value = column === 'suggestion_reason_json'
      ? JSON.stringify(mapping[column] || {})
      : mapping[column];
    values.push(value);
    return `$${rowIndex * columns.length + columnIndex + 1}${column === 'suggestion_reason_json' ? '::jsonb' : ''}`;
  }).join(', ')})`);
  await client.query(`
    INSERT INTO ingredient_nutrition_mappings (${columns.join(', ')})
    VALUES ${rows.join(', ')}
    ON CONFLICT (ingredient_id, cluster_id, default_for_state) DO UPDATE SET
      representative_fdc_id = CASE
        WHEN ingredient_nutrition_mappings.review_status IN ('approved', 'rejected') THEN ingredient_nutrition_mappings.representative_fdc_id
        ELSE EXCLUDED.representative_fdc_id
      END,
      default_for_state = EXCLUDED.default_for_state,
      mapping_type = CASE
        WHEN ingredient_nutrition_mappings.review_status IN ('approved', 'rejected') THEN ingredient_nutrition_mappings.mapping_type
        ELSE EXCLUDED.mapping_type
      END,
      confidence = CASE
        WHEN ingredient_nutrition_mappings.review_status IN ('approved', 'rejected') THEN ingredient_nutrition_mappings.confidence
        ELSE EXCLUDED.confidence
      END,
      source = CASE
        WHEN ingredient_nutrition_mappings.review_status IN ('approved', 'rejected') THEN ingredient_nutrition_mappings.source
        ELSE EXCLUDED.source
      END,
      review_status = CASE
        WHEN ingredient_nutrition_mappings.review_status IN ('approved', 'rejected') THEN ingredient_nutrition_mappings.review_status
        ELSE EXCLUDED.review_status
      END,
      notes = COALESCE(ingredient_nutrition_mappings.notes, EXCLUDED.notes),
      suggestion_reason_json = CASE
        WHEN ingredient_nutrition_mappings.review_status IN ('approved', 'rejected') THEN ingredient_nutrition_mappings.suggestion_reason_json
        ELSE EXCLUDED.suggestion_reason_json
      END,
      generation_method = CASE
        WHEN ingredient_nutrition_mappings.review_status IN ('approved', 'rejected') THEN ingredient_nutrition_mappings.generation_method
        ELSE EXCLUDED.generation_method
      END,
      rules_version = CASE
        WHEN ingredient_nutrition_mappings.review_status IN ('approved', 'rejected') THEN ingredient_nutrition_mappings.rules_version
        ELSE EXCLUDED.rules_version
      END,
      source_version = CASE
        WHEN ingredient_nutrition_mappings.review_status IN ('approved', 'rejected') THEN ingredient_nutrition_mappings.source_version
        ELSE EXCLUDED.source_version
      END,
      updated_at = NOW()
  `, values);
  return mappings.length;
}

function inferClusterState(cluster) {
  const qualifiers = cluster.parsed_shared_qualifiers_json || {};
  if (qualifiers.state === 'raw' || qualifiers.grain_state === 'raw') return 'raw';
  if (qualifiers.state === 'cooked' || qualifiers.grain_state === 'cooked' || qualifiers.cooking_method) return 'cooked';
  if (qualifiers.state === 'dried') return 'dried';
  return null;
}

function inferMappingType(state, match) {
  if (state === 'raw') return 'default_raw';
  if (state === 'cooked') return 'default_cooked';
  if (state) return 'alternate_state';
  return match.match_type === 'state_aware_partial' ? 'alternate_state' : 'alternate_state';
}

function normalizeIngredientRow(row) {
  return {
    ...row,
    aliases: normalizeAliasesJson(row.aliases_json),
  };
}

function normalizeAliasesJson(value) {
  const parsed = typeof value === 'string' ? parseJson(value, {}) : (value || {});
  return [
    ...normalizeAliasArray(parsed.en),
    ...normalizeAliasArray(parsed.bg),
    ...normalizeAliasArray(parsed.all),
    ...normalizeAliasArray(parsed.aliases_en),
    ...normalizeAliasArray(parsed.aliases_bg),
  ];
}

function normalizeAliasArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch (error) {
      return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeMappingSuggestionOptions({ dryRun, limit, ingredient, clusterKey } = {}) {
  return {
    dryRun: Boolean(dryRun),
    limit: positiveInteger(limit, DEFAULT_MAPPING_SUGGESTION_LIMIT),
    ingredient: nullableString(ingredient),
    clusterKey: nullableString(clusterKey),
  };
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}0-9]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function nullableString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_MAPPING_SUGGESTION_LIMIT,
  MAPPING_SUGGESTION_METHOD,
  buildIngredientNutritionMappingSuggestions,
  fetchApprovedUsdaClustersForMapping,
  fetchPricerIngredientsForMapping,
  inferClusterState,
  matchClusterToIngredient,
  normalizeMappingSuggestionOptions,
  suggestIngredientNutritionMappings,
  upsertIngredientNutritionMappingSuggestions,
};
