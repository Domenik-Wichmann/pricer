const DEFAULT_RECIPE_QUALITY_REPORT_LIMIT = 100;
const SUPPORTED_RECIPE_QUALITY_STATUSES = Object.freeze([
  'draft',
  'dormant',
  'needs_ingredient_mapping',
  'needs_nutrition',
  'usable',
  'meal_plan_ready',
]);
const SUPPORTED_RECIPE_READINESS_STATUSES = Object.freeze([
  'dormant',
  'needs_ingredient_mapping',
  'needs_grams',
  'needs_nutrition',
  'needs_product_mapping',
  'usable',
  'meal_plan_ready',
]);

async function buildRecipeQualityReport({
  client,
  limit = DEFAULT_RECIPE_QUALITY_REPORT_LIMIT,
  recipe = null,
  status = null,
  missingIngredients = false,
  missingNutrition = false,
  missingProducts = false,
} = {}) {
  requireClient(client);
  const options = normalizeRecipeQualityReportOptions({
    limit,
    recipe,
    status,
    missingIngredients,
    missingNutrition,
    missingProducts,
  });

  // DB4D is intentionally review/reporting-only. We keep the read surface small:
  // one recipe summary query, one ingredient coverage query, and one gap query.
  const recipeRows = await fetchRecipeQualityRecipeRows(client);
  const ingredientRows = await fetchRecipeQualityIngredientRows(client);
  const gapRows = await fetchIngredientGapRows(client);

  const ingredientRowsByRecipeId = groupRowsByKey(ingredientRows, 'recipe_id');
  const readinessRows = recipeRows
    .map((row) => buildRecipeReadinessRow(row, ingredientRowsByRecipeId.get(row.recipe_id) || []))
    .filter((row) => recipeMatchesFilters(row, options))
    .sort(compareRecipeReadinessRows);

  const selectedRecipeIds = new Set(readinessRows.map((row) => row.recipe_id));
  const scopedIngredientRows = ingredientRows
    .filter((row) => selectedRecipeIds.has(row.recipe_id))
    .sort(compareIngredientIssueRows);
  const scopedGapRows = gapRows
    .filter((row) => !row.recipe_id || selectedRecipeIds.has(row.recipe_id))
    .sort(compareGapRows);

  const dormantRecipes = readinessRows.filter((row) => row.readiness_status === 'dormant');
  const needsIngredientMappingRecipes = readinessRows.filter((row) => row.readiness_status === 'needs_ingredient_mapping');
  const needsNutritionRecipes = readinessRows.filter((row) => row.readiness_status === 'needs_nutrition');
  const usableRecipes = readinessRows.filter((row) => row.readiness_status === 'usable');
  const mealPlanReadyRecipes = readinessRows.filter((row) => row.readiness_status === 'meal_plan_ready');

  const ingredientsMissingMatchedIngredientId = scopedIngredientRows
    .filter((row) => !row.matched_ingredient_id);
  const ingredientsMissingQuantityGrams = scopedIngredientRows
    .filter((row) => !isPositiveNumber(row.quantity_grams));
  const ingredientsMissingApprovedNutrition = scopedIngredientRows
    .filter((row) => !row.has_approved_ingredient_nutrition);
  const ingredientsMissingApprovedProductMappings = scopedIngredientRows
    .filter((row) => !row.has_approved_product_mapping);

  const recipesWithApprovedNutritionProfiles = readinessRows
    .filter((row) => row.has_approved_recipe_nutrition);
  const recipesWithoutApprovedNutritionProfiles = readinessRows
    .filter((row) => !row.has_approved_recipe_nutrition);

  return {
    generated_at: new Date().toISOString(),
    filters: {
      limit: options.limit,
      recipe: options.recipe,
      status: options.status,
      missing_ingredients: options.missingIngredients,
      missing_nutrition: options.missingNutrition,
      missing_products: options.missingProducts,
    },
    total_recipes: readinessRows.length,
    summary_by_review_status: summarizeCounts(readinessRows, 'review_status'),
    summary_by_usability_status: summarizeCounts(readinessRows, 'usability_status'),
    summary_by_readiness_status: summarizeCounts(readinessRows, 'readiness_status'),
    recipe_readiness: readinessRows.slice(0, options.limit),
    dormant_recipes: dormantRecipes.slice(0, options.limit),
    needs_ingredient_mapping_recipes: needsIngredientMappingRecipes.slice(0, options.limit),
    needs_nutrition_recipes: needsNutritionRecipes.slice(0, options.limit),
    usable_recipes: usableRecipes.slice(0, options.limit),
    meal_plan_ready_recipes: mealPlanReadyRecipes.slice(0, options.limit),
    ingredients_missing_matched_ingredient_id: ingredientsMissingMatchedIngredientId.slice(0, options.limit),
    ingredients_missing_quantity_grams: ingredientsMissingQuantityGrams.slice(0, options.limit),
    ingredients_missing_approved_nutrition: ingredientsMissingApprovedNutrition.slice(0, options.limit),
    ingredients_missing_approved_product_mappings: ingredientsMissingApprovedProductMappings.slice(0, options.limit),
    recipes_with_approved_nutrition_profiles: recipesWithApprovedNutritionProfiles.slice(0, options.limit),
    recipes_without_approved_nutrition_profiles: recipesWithoutApprovedNutritionProfiles.slice(0, options.limit),
    top_ingredient_gap_candidates: scopedGapRows.slice(0, options.limit),
    suggested_next_review_targets: buildRecommendedRecipeQualityTargets({
      dormantRecipes,
      needsIngredientMappingRecipes,
      needsNutritionRecipes,
      ingredientsMissingMatchedIngredientId,
      ingredientsMissingQuantityGrams,
      ingredientsMissingApprovedNutrition,
      ingredientsMissingApprovedProductMappings,
      recipesWithoutApprovedNutritionProfiles,
      gapRows: scopedGapRows,
    }),
  };
}

async function fetchRecipeQualityRecipeRows(client) {
  const result = await client.query(`
    SELECT
      r.recipe_id,
      r.recipe_key,
      r.title_en,
      r.title_bg,
      r.canonical_title,
      r.normalized_title,
      r.review_status,
      r.usability_status,
      r.ingredient_match_rate,
      r.nutrition_coverage_rate,
      r.product_coverage_rate,
      r.last_quality_computed_at,
      CASE
        WHEN arp.recipe_id IS NULL THEN FALSE
        ELSE TRUE
      END AS has_approved_recipe_nutrition
    FROM recipes r
    LEFT JOIN (
      SELECT recipe_id
      FROM recipe_nutrition_profiles
      WHERE review_status = 'approved'
      GROUP BY recipe_id
    ) arp
      ON arp.recipe_id = r.recipe_id
    ORDER BY r.recipe_key ASC
  `);
  return (result.rows || []).map((row) => ({
    recipe_id: row.recipe_id,
    recipe_key: row.recipe_key,
    title_en: row.title_en,
    title_bg: row.title_bg,
    canonical_title: row.canonical_title,
    normalized_title: row.normalized_title,
    review_status: row.review_status,
    usability_status: row.usability_status,
    ingredient_match_rate: nullableNumber(row.ingredient_match_rate),
    nutrition_coverage_rate: nullableNumber(row.nutrition_coverage_rate),
    product_coverage_rate: nullableNumber(row.product_coverage_rate),
    last_quality_computed_at: row.last_quality_computed_at || null,
    has_approved_recipe_nutrition: Boolean(row.has_approved_recipe_nutrition),
  }));
}

async function fetchRecipeQualityIngredientRows(client) {
  const result = await client.query(`
    SELECT
      r.recipe_id,
      r.recipe_key,
      r.title_en,
      ri.recipe_ingredient_id,
      ri.sort_order,
      ri.display_name,
      ri.ingredient_key_snapshot,
      ri.ingredient_id,
      ri.matched_ingredient_id,
      ri.quantity,
      ri.unit,
      ri.quantity_grams,
      ri.match_confidence,
      ri.review_status,
      i.ingredient_key AS matched_ingredient_key,
      i.name_en AS matched_ingredient_name_en,
      i.name_bg AS matched_ingredient_name_bg,
      CASE
        WHEN inp.ingredient_id IS NULL THEN FALSE
        ELSE TRUE
      END AS has_approved_ingredient_nutrition,
      CASE
        WHEN ipm.ingredient_id IS NULL THEN FALSE
        ELSE TRUE
      END AS has_approved_product_mapping
    FROM recipe_ingredients ri
    JOIN recipes r
      ON r.recipe_id = ri.recipe_id
    LEFT JOIN ingredients i
      ON i.ingredient_id = ri.matched_ingredient_id
    LEFT JOIN (
      SELECT DISTINCT ingredient_id
      FROM ingredient_nutrition_profiles
      WHERE review_status = 'approved'
    ) inp
      ON inp.ingredient_id = COALESCE(ri.matched_ingredient_id, ri.ingredient_id)
    LEFT JOIN (
      SELECT DISTINCT ingredient_id
      FROM ingredient_product_mappings
      WHERE review_status = 'approved'
        AND mapping_type <> 'rejected'
    ) ipm
      ON ipm.ingredient_id = COALESCE(ri.matched_ingredient_id, ri.ingredient_id)
    ORDER BY r.recipe_key ASC, ri.sort_order ASC, ri.recipe_ingredient_id ASC
  `);
  return (result.rows || []).map(normalizeRecipeIngredientCoverageRow);
}

async function fetchIngredientGapRows(client) {
  const result = await client.query(`
    SELECT
      igc.gap_id,
      igc.recipe_id,
      igc.raw_name,
      igc.normalized_name,
      igc.proposed_ingredient_key,
      igc.occurrences,
      igc.created_at,
      igc.updated_at,
      r.recipe_key,
      r.title_en
    FROM ingredient_gap_candidates igc
    LEFT JOIN recipes r
      ON r.recipe_id = igc.recipe_id
    WHERE igc.source_type = 'recipe'
    ORDER BY igc.occurrences DESC, igc.normalized_name ASC, igc.gap_id ASC
  `);
  return (result.rows || []).map((row) => ({
    gap_id: row.gap_id,
    recipe_id: row.recipe_id,
    recipe_key: row.recipe_key || null,
    recipe_title_en: row.title_en || null,
    raw_name: row.raw_name,
    normalized_name: row.normalized_name,
    proposed_ingredient_key: row.proposed_ingredient_key || null,
    occurrences: Number(row.occurrences || 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }));
}

function normalizeRecipeIngredientCoverageRow(row) {
  return {
    recipe_id: row.recipe_id,
    recipe_key: row.recipe_key,
    recipe_title_en: row.title_en,
    recipe_ingredient_id: row.recipe_ingredient_id,
    sort_order: Number(row.sort_order || 0),
    display_name: row.display_name,
    ingredient_key_snapshot: row.ingredient_key_snapshot,
    ingredient_id: row.ingredient_id || null,
    matched_ingredient_id: row.matched_ingredient_id || null,
    quantity: nullableNumber(row.quantity),
    unit: row.unit || null,
    quantity_grams: nullableNumber(row.quantity_grams),
    match_confidence: nullableNumber(row.match_confidence),
    review_status: row.review_status,
    matched_ingredient_key: row.matched_ingredient_key || null,
    matched_ingredient_name_en: row.matched_ingredient_name_en || null,
    matched_ingredient_name_bg: row.matched_ingredient_name_bg || null,
    has_approved_ingredient_nutrition: Boolean(row.has_approved_ingredient_nutrition),
    has_approved_product_mapping: Boolean(row.has_approved_product_mapping),
  };
}

function buildRecipeReadinessRow(recipeRow, ingredientRows) {
  const ingredientCount = ingredientRows.length;
  const matchedIngredients = ingredientRows.filter((row) => row.matched_ingredient_id).length;
  const ingredientsWithGrams = ingredientRows.filter((row) => isPositiveNumber(row.quantity_grams)).length;
  const ingredientsWithApprovedNutrition = ingredientRows
    .filter((row) => row.has_approved_ingredient_nutrition)
    .length;
  const ingredientsWithApprovedProductMappings = ingredientRows
    .filter((row) => row.has_approved_product_mapping)
    .length;

  const ingredientMatchRate = roundRate(ingredientCount === 0 ? 0 : matchedIngredients / ingredientCount);
  const gramsCoverageRate = roundRate(ingredientCount === 0 ? 0 : ingredientsWithGrams / ingredientCount);
  const nutritionCoverageRate = roundRate(ingredientCount === 0 ? 0 : ingredientsWithApprovedNutrition / ingredientCount);
  const productCoverageRate = roundRate(ingredientCount === 0 ? 0 : ingredientsWithApprovedProductMappings / ingredientCount);

  return {
    recipe_id: recipeRow.recipe_id,
    recipe_key: recipeRow.recipe_key,
    title_en: recipeRow.title_en,
    title_bg: recipeRow.title_bg,
    canonical_title: recipeRow.canonical_title,
    normalized_title: recipeRow.normalized_title,
    review_status: recipeRow.review_status,
    usability_status: recipeRow.usability_status,
    ingredient_count: ingredientCount,
    matched_ingredients: matchedIngredients,
    ingredients_with_grams: ingredientsWithGrams,
    ingredients_with_approved_nutrition: ingredientsWithApprovedNutrition,
    ingredients_with_approved_product_mappings: ingredientsWithApprovedProductMappings,
    ingredients_missing_matched_ingredient_id: ingredientCount - matchedIngredients,
    ingredients_missing_quantity_grams: ingredientCount - ingredientsWithGrams,
    ingredients_missing_approved_nutrition: ingredientCount - ingredientsWithApprovedNutrition,
    ingredients_missing_approved_product_mappings: ingredientCount - ingredientsWithApprovedProductMappings,
    ingredient_match_rate: ingredientMatchRate,
    grams_coverage_rate: gramsCoverageRate,
    nutrition_coverage_rate: nutritionCoverageRate,
    product_coverage_rate: productCoverageRate,
    has_approved_recipe_nutrition: Boolean(recipeRow.has_approved_recipe_nutrition),
    readiness_status: determineRecipeReadinessStatus({
      ingredientCount,
      ingredientMatchRate,
      gramsCoverageRate,
      nutritionCoverageRate,
      productCoverageRate,
      hasApprovedRecipeNutrition: recipeRow.has_approved_recipe_nutrition,
    }),
    last_quality_computed_at: recipeRow.last_quality_computed_at,
    stored_metrics: {
      ingredient_match_rate: recipeRow.ingredient_match_rate,
      nutrition_coverage_rate: recipeRow.nutrition_coverage_rate,
      product_coverage_rate: recipeRow.product_coverage_rate,
    },
  };
}

function determineRecipeReadinessStatus({
  ingredientCount,
  ingredientMatchRate,
  gramsCoverageRate,
  nutritionCoverageRate,
  productCoverageRate,
  hasApprovedRecipeNutrition,
}) {
  if (ingredientCount === 0 || ingredientMatchRate < 0.4) {
    return 'dormant';
  }
  if (ingredientMatchRate < 0.7) {
    return 'needs_ingredient_mapping';
  }
  if (gramsCoverageRate < 1) {
    return 'needs_grams';
  }
  if (!hasApprovedRecipeNutrition || nutritionCoverageRate < 1) {
    return 'needs_nutrition';
  }
  if (productCoverageRate < 0.7) {
    return 'needs_product_mapping';
  }
  if (productCoverageRate < 1) {
    return 'usable';
  }
  return 'meal_plan_ready';
}

function recipeMatchesFilters(recipeRow, options) {
  if (options.status && recipeRow.usability_status !== options.status) {
    return false;
  }
  if (options.recipe) {
    const query = normalizeName(options.recipe);
    const haystacks = [
      recipeRow.recipe_key,
      recipeRow.title_en,
      recipeRow.title_bg,
      recipeRow.canonical_title,
      recipeRow.normalized_title,
    ];
    if (!haystacks.some((value) => normalizeName(value).includes(query))) {
      return false;
    }
  }
  if (options.missingIngredients && recipeRow.ingredients_missing_matched_ingredient_id <= 0) {
    return false;
  }
  if (options.missingNutrition && recipeRow.has_approved_recipe_nutrition && recipeRow.ingredients_missing_approved_nutrition <= 0) {
    return false;
  }
  if (options.missingProducts && recipeRow.ingredients_missing_approved_product_mappings <= 0) {
    return false;
  }
  return true;
}

function buildRecommendedRecipeQualityTargets({
  dormantRecipes,
  needsIngredientMappingRecipes,
  needsNutritionRecipes,
  ingredientsMissingMatchedIngredientId,
  ingredientsMissingQuantityGrams,
  ingredientsMissingApprovedNutrition,
  ingredientsMissingApprovedProductMappings,
  recipesWithoutApprovedNutritionProfiles,
  gapRows,
}) {
  const targets = [];
  if (ingredientsMissingMatchedIngredientId.length > 0) {
    targets.push({
      priority: 'high',
      reason: 'missing_ingredient_matches',
      count: ingredientsMissingMatchedIngredientId.length,
      examples: buildUniqueExamples(ingredientsMissingMatchedIngredientId, 'recipe_key'),
    });
  }
  if (gapRows.length > 0) {
    targets.push({
      priority: 'high',
      reason: 'ingredient_gap_candidates',
      count: gapRows.length,
      examples: buildUniqueExamples(gapRows, 'normalized_name'),
    });
  }
  if (ingredientsMissingQuantityGrams.length > 0) {
    targets.push({
      priority: 'medium',
      reason: 'missing_quantity_grams',
      count: ingredientsMissingQuantityGrams.length,
      examples: buildUniqueExamples(ingredientsMissingQuantityGrams, 'recipe_key'),
    });
  }
  if (recipesWithoutApprovedNutritionProfiles.length > 0) {
    targets.push({
      priority: 'medium',
      reason: 'missing_recipe_nutrition_profiles',
      count: recipesWithoutApprovedNutritionProfiles.length,
      examples: buildUniqueExamples(recipesWithoutApprovedNutritionProfiles, 'recipe_key'),
    });
  }
  if (ingredientsMissingApprovedNutrition.length > 0) {
    targets.push({
      priority: 'medium',
      reason: 'missing_ingredient_nutrition_profiles',
      count: ingredientsMissingApprovedNutrition.length,
      examples: buildUniqueExamples(ingredientsMissingApprovedNutrition, 'ingredient_key_snapshot'),
    });
  }
  if (ingredientsMissingApprovedProductMappings.length > 0) {
    targets.push({
      priority: 'medium',
      reason: 'missing_product_mappings',
      count: ingredientsMissingApprovedProductMappings.length,
      examples: buildUniqueExamples(ingredientsMissingApprovedProductMappings, 'ingredient_key_snapshot'),
    });
  }
  if (needsIngredientMappingRecipes.length > 0) {
    targets.push({
      priority: 'low',
      reason: 'recipes_needing_ingredient_mapping',
      count: needsIngredientMappingRecipes.length,
      examples: buildUniqueExamples(needsIngredientMappingRecipes, 'recipe_key'),
    });
  }
  if (needsNutritionRecipes.length > 0) {
    targets.push({
      priority: 'low',
      reason: 'recipes_needing_nutrition',
      count: needsNutritionRecipes.length,
      examples: buildUniqueExamples(needsNutritionRecipes, 'recipe_key'),
    });
  }
  if (dormantRecipes.length > 0) {
    targets.push({
      priority: 'low',
      reason: 'dormant_recipes',
      count: dormantRecipes.length,
      examples: buildUniqueExamples(dormantRecipes, 'recipe_key'),
    });
  }
  return targets;
}

function normalizeRecipeQualityReportOptions({
  limit,
  recipe,
  status,
  missingIngredients,
  missingNutrition,
  missingProducts,
} = {}) {
  return {
    limit: positiveInteger(limit, DEFAULT_RECIPE_QUALITY_REPORT_LIMIT),
    recipe: nullableString(recipe),
    status: normalizeRecipeQualityStatus(status),
    missingIngredients: Boolean(missingIngredients),
    missingNutrition: Boolean(missingNutrition),
    missingProducts: Boolean(missingProducts),
  };
}

function summarizeCounts(rows, column) {
  const counts = new Map();
  rows.forEach((row) => {
    const key = row[column] || null;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || String(left.key).localeCompare(String(right.key)));
}

function groupRowsByKey(rows, column) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row[column];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return groups;
}

function compareRecipeReadinessRows(left, right) {
  return compareByKnownOrder(left.readiness_status, right.readiness_status, SUPPORTED_RECIPE_READINESS_STATUSES)
    || left.recipe_key.localeCompare(right.recipe_key);
}

function compareIngredientIssueRows(left, right) {
  return left.recipe_key.localeCompare(right.recipe_key)
    || left.sort_order - right.sort_order
    || left.recipe_ingredient_id.localeCompare(right.recipe_ingredient_id);
}

function compareGapRows(left, right) {
  return right.occurrences - left.occurrences
    || String(left.normalized_name).localeCompare(String(right.normalized_name))
    || String(left.gap_id).localeCompare(String(right.gap_id));
}

function buildUniqueExamples(rows, field) {
  const examples = [];
  for (const row of rows) {
    const value = row && row[field];
    if (!value || examples.includes(value)) continue;
    examples.push(value);
    if (examples.length >= 5) break;
  }
  return examples;
}

function compareByKnownOrder(left, right, orderedValues) {
  return orderedValues.indexOf(left) - orderedValues.indexOf(right);
}

function normalizeRecipeQualityStatus(value) {
  const normalized = nullableString(value);
  if (!normalized) return null;
  if (!SUPPORTED_RECIPE_QUALITY_STATUSES.includes(normalized)) {
    throw new Error(`Unsupported recipe usability_status: ${value}`);
  }
  return normalized;
}

function roundRate(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isPositiveNumber(value) {
  const numeric = nullableNumber(value);
  return numeric !== null && numeric > 0;
}

function positiveInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function nullableString(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_RECIPE_QUALITY_REPORT_LIMIT,
  SUPPORTED_RECIPE_QUALITY_STATUSES,
  SUPPORTED_RECIPE_READINESS_STATUSES,
  buildRecipeQualityReport,
  determineRecipeReadinessStatus,
  normalizeRecipeQualityReportOptions,
};
