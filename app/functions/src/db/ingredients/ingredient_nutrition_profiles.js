const { USDA_MACRO_NUTRIENTS } = require('../usda/macro_constants');

const DEFAULT_PROFILE_CANDIDATE_LIMIT = 1000;
const PROFILE_CANDIDATE_METHOD = 'deterministic_approved_mapping_usda_macros_v1';
const PROFILE_CANDIDATE_RULES_VERSION = 'db3c_ingredient_nutrition_profiles_v1';

async function generateIngredientNutritionProfileCandidates({
  client,
  dryRun = false,
  limit = DEFAULT_PROFILE_CANDIDATE_LIMIT,
} = {}) {
  requireClient(client);
  const options = normalizeProfileCandidateOptions({ dryRun, limit });
  const rows = await fetchApprovedMappingsWithMacroNutrients(client, options);
  const candidates = buildIngredientNutritionProfileCandidates(rows);
  const report = {
    dry_run: options.dryRun,
    approved_mappings_scanned: countDistinct(rows.map((row) => row.mapping_id)),
    candidates_built: candidates.length,
    upserted: 0,
    candidates: candidates.slice(0, options.limit),
    filters: {
      limit: options.limit,
    },
  };
  if (!options.dryRun && candidates.length > 0) {
    report.upserted = await upsertIngredientNutritionProfileCandidates(client, candidates);
  }
  return report;
}

async function fetchApprovedMappingsWithMacroNutrients(client, { limit } = {}) {
  requireClient(client);
  const result = await client.query(`
    SELECT
      inm.mapping_id,
      inm.ingredient_id,
      inm.cluster_id,
      inm.representative_fdc_id,
      inm.review_status AS mapping_review_status,
      ufn.nutrient_id,
      un.name AS nutrient_name,
      un.unit_name,
      ufn.amount
    FROM ingredient_nutrition_mappings inm
    JOIN usda_food_nutrients ufn
      ON ufn.fdc_id = inm.representative_fdc_id
    JOIN usda_nutrients un
      ON un.nutrient_id = ufn.nutrient_id
    WHERE inm.review_status = 'approved'
      AND inm.representative_fdc_id IS NOT NULL
      AND ufn.nutrient_id = ANY($1::int[])
    ORDER BY inm.ingredient_id ASC, inm.mapping_id ASC, ufn.nutrient_id ASC
    LIMIT $2
  `, [
    [
      USDA_MACRO_NUTRIENTS.ENERGY_KCAL,
      USDA_MACRO_NUTRIENTS.PROTEIN_G,
      USDA_MACRO_NUTRIENTS.FAT_G,
      USDA_MACRO_NUTRIENTS.CARBOHYDRATE_G,
      USDA_MACRO_NUTRIENTS.FIBER_G,
      USDA_MACRO_NUTRIENTS.SUGARS_G,
      USDA_MACRO_NUTRIENTS.SODIUM_MG,
      USDA_MACRO_NUTRIENTS.ENERGY_ATWATER_GENERAL_KCAL,
      USDA_MACRO_NUTRIENTS.ENERGY_ATWATER_SPECIFIC_KCAL,
    ],
    positiveInteger(limit, DEFAULT_PROFILE_CANDIDATE_LIMIT) * 9,
  ]);
  return result.rows || [];
}

function buildIngredientNutritionProfileCandidates(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const mappingId = requiredString(row.mapping_id, 'mapping_id');
    if (!grouped.has(mappingId)) {
      grouped.set(mappingId, {
        profile_candidate_id: `ingredient_nutrition_profile_candidate:${mappingId}`,
        ingredient_id: row.ingredient_id,
        mapping_id: mappingId,
        cluster_id: row.cluster_id,
        representative_fdc_id: Number(row.representative_fdc_id),
        basis_amount: 100,
        basis_unit: 'g',
        nutrientsById: new Map(),
      });
    }
    const candidate = grouped.get(mappingId);
    const nutrientId = Number(row.nutrient_id);
    const amount = nullableNumber(row.amount);
    if (amount !== null) {
      candidate.nutrientsById.set(nutrientId, {
        nutrient_id: nutrientId,
        nutrient_name: row.nutrient_name,
        unit_name: row.unit_name,
        amount,
      });
    }
  }

  return [...grouped.values()].map((candidate) => {
    const nutrients = candidate.nutrientsById;
    const sourceNutrients = {};
    for (const [nutrientId, nutrient] of nutrients.entries()) {
      sourceNutrients[nutrientId] = nutrient;
    }
    return {
      profile_candidate_id: candidate.profile_candidate_id,
      ingredient_id: candidate.ingredient_id,
      mapping_id: candidate.mapping_id,
      cluster_id: candidate.cluster_id,
      representative_fdc_id: candidate.representative_fdc_id,
      basis_amount: 100,
      basis_unit: 'g',
      kcal: getFirstNutrientAmount(nutrients, [
        USDA_MACRO_NUTRIENTS.ENERGY_KCAL,
        USDA_MACRO_NUTRIENTS.ENERGY_ATWATER_SPECIFIC_KCAL,
        USDA_MACRO_NUTRIENTS.ENERGY_ATWATER_GENERAL_KCAL,
      ]),
      protein_g: getNutrientAmount(nutrients, USDA_MACRO_NUTRIENTS.PROTEIN_G),
      fat_g: getNutrientAmount(nutrients, USDA_MACRO_NUTRIENTS.FAT_G),
      carbs_g: getNutrientAmount(nutrients, USDA_MACRO_NUTRIENTS.CARBOHYDRATE_G),
      fiber_g: getNutrientAmount(nutrients, USDA_MACRO_NUTRIENTS.FIBER_G),
      sugar_g: getNutrientAmount(nutrients, USDA_MACRO_NUTRIENTS.SUGARS_G),
      sodium_mg: getNutrientAmount(nutrients, USDA_MACRO_NUTRIENTS.SODIUM_MG),
      source_nutrients_json: sourceNutrients,
      review_status: 'candidate',
      source: 'approved_ingredient_nutrition_mapping',
      generation_method: PROFILE_CANDIDATE_METHOD,
      rules_version: PROFILE_CANDIDATE_RULES_VERSION,
    };
  }).sort((left, right) => (
    left.ingredient_id.localeCompare(right.ingredient_id)
    || left.mapping_id.localeCompare(right.mapping_id)
  ));
}

async function upsertIngredientNutritionProfileCandidates(client, candidates) {
  requireClient(client);
  if (!candidates || candidates.length === 0) return 0;
  const columns = [
    'profile_candidate_id',
    'ingredient_id',
    'mapping_id',
    'cluster_id',
    'representative_fdc_id',
    'basis_amount',
    'basis_unit',
    'kcal',
    'protein_g',
    'fat_g',
    'carbs_g',
    'fiber_g',
    'sugar_g',
    'sodium_mg',
    'source_nutrients_json',
    'review_status',
    'source',
    'generation_method',
    'rules_version',
  ];
  const values = [];
  const rows = candidates.map((candidate, rowIndex) => `(${columns.map((column, columnIndex) => {
    const value = column === 'source_nutrients_json'
      ? JSON.stringify(candidate[column] || {})
      : candidate[column];
    values.push(value);
    return `$${rowIndex * columns.length + columnIndex + 1}${column === 'source_nutrients_json' ? '::jsonb' : ''}`;
  }).join(', ')})`);
  await client.query(`
    INSERT INTO ingredient_nutrition_profile_candidates (${columns.join(', ')})
    VALUES ${rows.join(', ')}
    ON CONFLICT (mapping_id) DO UPDATE SET
      ingredient_id = EXCLUDED.ingredient_id,
      cluster_id = EXCLUDED.cluster_id,
      representative_fdc_id = EXCLUDED.representative_fdc_id,
      basis_amount = EXCLUDED.basis_amount,
      basis_unit = EXCLUDED.basis_unit,
      kcal = EXCLUDED.kcal,
      protein_g = EXCLUDED.protein_g,
      fat_g = EXCLUDED.fat_g,
      carbs_g = EXCLUDED.carbs_g,
      fiber_g = EXCLUDED.fiber_g,
      sugar_g = EXCLUDED.sugar_g,
      sodium_mg = EXCLUDED.sodium_mg,
      source_nutrients_json = EXCLUDED.source_nutrients_json,
      review_status = ingredient_nutrition_profile_candidates.review_status,
      source = EXCLUDED.source,
      generation_method = EXCLUDED.generation_method,
      rules_version = EXCLUDED.rules_version,
      updated_at = NOW()
  `, values);
  return candidates.length;
}

function getNutrientAmount(nutrients, nutrientId) {
  return nutrients.has(nutrientId) ? nutrients.get(nutrientId).amount : null;
}

function getFirstNutrientAmount(nutrients, nutrientIds) {
  for (const nutrientId of nutrientIds) {
    const amount = getNutrientAmount(nutrients, nutrientId);
    if (amount !== null) return amount;
  }
  return null;
}

function normalizeProfileCandidateOptions({ dryRun, limit } = {}) {
  return {
    dryRun: Boolean(dryRun),
    limit: positiveInteger(limit, DEFAULT_PROFILE_CANDIDATE_LIMIT),
  };
}

function countDistinct(values) {
  return new Set(values.filter(Boolean)).size;
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function requiredString(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${fieldName} is required.`);
  return normalized;
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_PROFILE_CANDIDATE_LIMIT,
  PROFILE_CANDIDATE_METHOD,
  PROFILE_CANDIDATE_RULES_VERSION,
  buildIngredientNutritionProfileCandidates,
  fetchApprovedMappingsWithMacroNutrients,
  generateIngredientNutritionProfileCandidates,
  normalizeProfileCandidateOptions,
  upsertIngredientNutritionProfileCandidates,
};
