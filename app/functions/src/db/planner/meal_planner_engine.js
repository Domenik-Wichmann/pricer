const crypto = require('node:crypto');

const { getUserFoodProfileBundle } = require('../users/user_food_profile_repository');
const { listUserTasteProfileSnapshots } = require('../users/user_taste_profile_engine');

const MEAL_PLAN_GENERATION_METHOD = 'plan1_deterministic_meal_planner_v1';
const MEAL_PLAN_RULES_VERSION = 'plan1_meal_planner_rules_v1';
const DEFAULT_MEAL_PLAN_DAYS = 7;
const DEFAULT_MEALS_PER_DAY = 3;
const SUPPORTED_MEAL_PLAN_MEAL_TYPES = Object.freeze([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
]);
const SCORE_WEIGHTS = Object.freeze({
  taste: 0.45,
  nutrition: 0.4,
  time: 0.15,
});

async function generateMealPlan(client, options = {}) {
  requireClient(client);
  const normalized = normalizeMealPlanOptions(options);
  const bundle = await getUserFoodProfileBundle(client, {
    profileId: normalized.profile_id,
    userId: normalized.user_id,
  });
  if (!bundle || !bundle.profile) {
    throw new Error('User food profile not found for PLAN1 meal plan generation.');
  }

  const [latestTasteProfile] = await listUserTasteProfileSnapshots(client, {
    profileId: bundle.profile.profile_id,
    limit: 1,
  });
  const effectiveTasteProfile = latestTasteProfile || buildFallbackTasteProfile(bundle);
  const allRecipes = await fetchEligibleRecipes(client);
  const filtered = buildFilteredRecipeSet(allRecipes, bundle);
  if (filtered.recipes.length === 0) {
    throw new Error('No eligible recipes remain after PLAN1 filtering.');
  }

  const planKey = buildMealPlanKey(bundle.profile.profile_id, normalized.start_date, MEAL_PLAN_RULES_VERSION);
  const recipePlan = buildMealPlan({
    recipes: filtered.recipes,
    bundle,
    tasteProfile: effectiveTasteProfile,
    startDate: normalized.start_date,
    days: normalized.days,
    mealsPerDay: normalized.meals_per_day,
    planKey,
  });

  const report = {
    dry_run: normalized.dry_run,
    plan: {
      plan_id: buildMealPlanId(planKey),
      plan_key: planKey,
      profile_id: bundle.profile.profile_id,
      user_id: bundle.profile.user_id,
      start_date: normalized.start_date,
      days: normalized.days,
      meals_per_day: normalized.meals_per_day,
      target_calories_per_day: nullableNumber(bundle.profile.daily_calorie_target),
      target_protein_g: nullableNumber(bundle.profile.protein_target_g),
      target_carbs_g: nullableNumber(bundle.profile.carbs_target_g),
      target_fat_g: nullableNumber(bundle.profile.fat_target_g),
      generation_method: MEAL_PLAN_GENERATION_METHOD,
      rules_version: MEAL_PLAN_RULES_VERSION,
    },
    recipes_considered: allRecipes.length,
    recipes_filtered: filtered.filtered_count,
    filtered_out_by_reason: filtered.filtered_out_by_reason,
    plan_items_created: recipePlan.items.length,
    average_selection_score: averageSelectionScore(recipePlan.items),
    daily_calorie_summary: recipePlan.daily_summary,
    macro_summary: recipePlan.macro_summary,
    items: recipePlan.items,
    errors: [],
  };

  if (normalized.dry_run) {
    return report;
  }

  await persistMealPlan(client, {
    plan: report.plan,
    items: report.items,
  });
  return report;
}

async function fetchEligibleRecipes(client) {
  const recipeResult = await client.query(`
    SELECT
      r.recipe_id,
      r.recipe_key,
      r.title_en,
      r.title_bg,
      r.canonical_title,
      r.description,
      r.usability_status,
      r.servings,
      r.cuisine_tags_json,
      r.dietary_tags_json,
      r.meal_type_tags_json,
      p.recipe_profile_id,
      p.per_serving_kcal,
      p.per_serving_protein_g,
      p.per_serving_carbs_g,
      p.per_serving_fat_g,
      p.total_kcal,
      p.total_protein_g,
      p.total_carbs_g,
      p.total_fat_g
    FROM recipes r
    JOIN (
      SELECT DISTINCT ON (recipe_id)
        recipe_profile_id,
        recipe_id,
        per_serving_kcal,
        per_serving_protein_g,
        per_serving_carbs_g,
        per_serving_fat_g,
        total_kcal,
        total_protein_g,
        total_carbs_g,
        total_fat_g,
        reviewed_at,
        created_at
      FROM recipe_nutrition_profiles
      WHERE review_status = 'approved'
      ORDER BY recipe_id ASC, reviewed_at DESC NULLS LAST, created_at DESC, recipe_profile_id DESC
    ) p
      ON p.recipe_id = r.recipe_id
    WHERE r.usability_status IN ('usable', 'meal_plan_ready')
    ORDER BY r.recipe_key ASC
  `);
  const baseRecipes = (recipeResult.rows || []).map((row) => ({
    recipe_id: row.recipe_id,
    recipe_key: row.recipe_key,
    title_en: row.title_en,
    title_bg: row.title_bg || null,
    canonical_title: row.canonical_title || row.title_en,
    description: row.description || null,
    usability_status: row.usability_status,
    servings: nullableNumber(row.servings),
    cuisine_tags_json: parseJson(row.cuisine_tags_json, []),
    dietary_tags_json: parseJson(row.dietary_tags_json, []),
    meal_type_tags_json: parseJson(row.meal_type_tags_json, []),
    recipe_profile_id: row.recipe_profile_id,
    per_serving_kcal: nullableNumber(row.per_serving_kcal),
    per_serving_protein_g: nullableNumber(row.per_serving_protein_g),
    per_serving_carbs_g: nullableNumber(row.per_serving_carbs_g),
    per_serving_fat_g: nullableNumber(row.per_serving_fat_g),
    total_kcal: nullableNumber(row.total_kcal),
    total_protein_g: nullableNumber(row.total_protein_g),
    total_carbs_g: nullableNumber(row.total_carbs_g),
    total_fat_g: nullableNumber(row.total_fat_g),
  }));
  if (baseRecipes.length === 0) return [];

  const recipeIds = baseRecipes.map((row) => row.recipe_id);
  const [ingredientRows, stepRows, metadataByRecipeId] = await Promise.all([
    fetchRecipeIngredients(client, recipeIds),
    fetchRecipeSteps(client, recipeIds),
    fetchRecipeMetadata(client, recipeIds),
  ]);
  const ingredientsByRecipeId = groupRowsByKey(ingredientRows, 'recipe_id');
  const stepsByRecipeId = groupRowsByKey(stepRows, 'recipe_id');

  return baseRecipes.map((row) => {
    const metadata = metadataByRecipeId.get(row.recipe_id) || {};
    const steps = stepsByRecipeId.get(row.recipe_id) || [];
    const ingredientLines = ingredientsByRecipeId.get(row.recipe_id) || [];
    const methodKeys = normalizeStringArray((metadata.methods || []).map((entry) => entry.method_key || entry.name_en));
    const stagedTagKeys = normalizeStringArray((metadata.tags || []).flatMap((entry) => [entry.tag_key, entry.tag_value]));
    const equipmentKeys = normalizeStringArray(steps.flatMap((step) => step.equipment_tags_json || []));
    const prepTime = nullableNumber(metadata.prep_time_minutes);
    const totalTime = firstNonNull([
      nullableNumber(metadata.total_time_minutes),
      sumPositiveNumbers(steps.map((step) => step.duration_minutes)),
    ]);
    return {
      ...row,
      cuisine_tags_json: normalizeStringArray(row.cuisine_tags_json),
      dietary_tags_json: normalizeStringArray(row.dietary_tags_json),
      meal_type_tags_json: normalizeStringArray(row.meal_type_tags_json),
      ingredients: ingredientLines,
      steps,
      metadata: {
        region_tags_json: normalizeStringArray(metadata.region_tags_json),
        feeling_tags_json: normalizeStringArray(metadata.feeling_tags_json),
        flavor_profile_json: parseJson(metadata.flavor_profile_json, {}),
        texture_profile_json: parseJson(metadata.texture_profile_json, {}),
        methods: metadata.methods || [],
        tags: metadata.tags || [],
        prep_time_minutes: prepTime,
        cook_time_minutes: nullableNumber(metadata.cook_time_minutes),
        total_time_minutes: totalTime,
      },
      method_keys: methodKeys,
      staged_tag_keys: stagedTagKeys,
      equipment_keys: equipmentKeys,
      prep_time_minutes: prepTime,
      total_time_minutes: totalTime,
      primary_cuisine: normalizeStringArray(row.cuisine_tags_json)[0] || null,
    };
  });
}

async function fetchRecipeIngredients(client, recipeIds) {
  const result = await client.query(`
    SELECT
      ri.recipe_id,
      ri.recipe_ingredient_id,
      ri.sort_order,
      ri.display_name,
      ri.ingredient_key_snapshot,
      ri.ingredient_id,
      ri.matched_ingredient_id,
      ri.quantity_grams,
      i.ingredient_key,
      i.food_family,
      i.tags_json,
      i.allergen_flags_json
    FROM recipe_ingredients ri
    LEFT JOIN ingredients i
      ON i.ingredient_id = COALESCE(ri.matched_ingredient_id, ri.ingredient_id)
    WHERE ri.recipe_id = ANY($1::text[])
    ORDER BY ri.recipe_id ASC, ri.sort_order ASC, ri.recipe_ingredient_id ASC
  `, [recipeIds]);
  return (result.rows || []).map((row) => ({
    recipe_id: row.recipe_id,
    recipe_ingredient_id: row.recipe_ingredient_id,
    sort_order: positiveInteger(row.sort_order, 0),
    display_name: row.display_name,
    ingredient_key_snapshot: row.ingredient_key_snapshot || null,
    ingredient_id: row.ingredient_id || null,
    matched_ingredient_id: row.matched_ingredient_id || null,
    quantity_grams: nullableNumber(row.quantity_grams),
    ingredient_key: row.ingredient_key || null,
    food_family: row.food_family || null,
    tags_json: normalizeStringArray(parseJson(row.tags_json, [])),
    allergen_flags_json: parseJson(row.allergen_flags_json, {}),
  }));
}

async function fetchRecipeSteps(client, recipeIds) {
  const result = await client.query(`
    SELECT
      recipe_id,
      recipe_step_id,
      step_number,
      duration_minutes,
      equipment_tags_json
    FROM recipe_steps
    WHERE recipe_id = ANY($1::text[])
    ORDER BY recipe_id ASC, step_number ASC, recipe_step_id ASC
  `, [recipeIds]);
  return (result.rows || []).map((row) => ({
    recipe_id: row.recipe_id,
    recipe_step_id: row.recipe_step_id,
    step_number: positiveInteger(row.step_number, 0),
    duration_minutes: nullableNumber(row.duration_minutes),
    equipment_tags_json: normalizeStringArray(parseJson(row.equipment_tags_json, [])),
  }));
}

async function fetchRecipeMetadata(client, recipeIds) {
  const metadataResult = await client.query(`
    SELECT
      ph.recipe_id,
      ph.staged_recipe_id,
      ph.created_at,
      ph.id AS promotion_history_id,
      sr.region_tags_json,
      sr.feeling_tags_json,
      sr.flavor_profile_json,
      sr.texture_profile_json,
      sr.prep_time_minutes,
      sr.cook_time_minutes,
      sr.total_time_minutes
    FROM recipe_promotion_history ph
    JOIN recipe_ingest_staged_recipes sr
      ON sr.staged_recipe_id = ph.staged_recipe_id
    WHERE ph.recipe_id = ANY($1::text[])
      AND ph.decision = 'approved'
    ORDER BY ph.recipe_id ASC, ph.created_at DESC, ph.id DESC
  `, [recipeIds]);

  const metadataByRecipeId = new Map();
  for (const row of metadataResult.rows || []) {
    if (metadataByRecipeId.has(row.recipe_id)) continue;
    metadataByRecipeId.set(row.recipe_id, {
      recipe_id: row.recipe_id,
      staged_recipe_id: row.staged_recipe_id,
      region_tags_json: parseJson(row.region_tags_json, []),
      feeling_tags_json: parseJson(row.feeling_tags_json, []),
      flavor_profile_json: parseJson(row.flavor_profile_json, {}),
      texture_profile_json: parseJson(row.texture_profile_json, {}),
      prep_time_minutes: row.prep_time_minutes,
      cook_time_minutes: row.cook_time_minutes,
      total_time_minutes: row.total_time_minutes,
      methods: [],
      tags: [],
    });
  }

  const stagedRecipeIds = [...new Set(
    [...metadataByRecipeId.values()]
      .map((row) => nullableString(row.staged_recipe_id))
      .filter(Boolean),
  )];
  if (stagedRecipeIds.length === 0) {
    return metadataByRecipeId;
  }

  const [methodsResult, tagsResult] = await Promise.all([
    client.query(`
      SELECT
        staged_recipe_id,
        staged_recipe_method_id,
        method_key,
        method_name_en
      FROM recipe_ingest_staged_methods
      WHERE staged_recipe_id = ANY($1::text[])
      ORDER BY staged_recipe_id ASC, method_key ASC, staged_recipe_method_id ASC
    `, [stagedRecipeIds]),
    client.query(`
      SELECT
        staged_recipe_id,
        staged_recipe_tag_id,
        tag_type,
        tag_key,
        tag_value
      FROM recipe_ingest_staged_tags
      WHERE staged_recipe_id = ANY($1::text[])
      ORDER BY staged_recipe_id ASC, tag_type ASC, tag_key ASC, staged_recipe_tag_id ASC
    `, [stagedRecipeIds]),
  ]);

  const methodsByStagedRecipeId = groupRowsByKey((methodsResult.rows || []).map((row) => ({
    staged_recipe_id: row.staged_recipe_id,
    staged_recipe_method_id: row.staged_recipe_method_id,
    method_key: row.method_key,
    name_en: row.method_name_en || null,
  })), 'staged_recipe_id');
  const tagsByStagedRecipeId = groupRowsByKey((tagsResult.rows || []).map((row) => ({
    staged_recipe_id: row.staged_recipe_id,
    staged_recipe_tag_id: row.staged_recipe_tag_id,
    tag_type: row.tag_type,
    tag_key: row.tag_key,
    tag_value: row.tag_value || null,
  })), 'staged_recipe_id');

  for (const metadata of metadataByRecipeId.values()) {
    metadata.methods = methodsByStagedRecipeId.get(metadata.staged_recipe_id) || [];
    metadata.tags = tagsByStagedRecipeId.get(metadata.staged_recipe_id) || [];
  }
  return metadataByRecipeId;
}

function buildFilteredRecipeSet(recipes, bundle) {
  const profile = bundle.profile || {};
  const constraints = bundle.constraints || [];
  const equipment = bundle.equipment || [];
  const explicitAvailability = new Map(
    equipment
      .filter((row) => row && row.equipment_key)
      .map((row) => [normalizeSignalKey(row.equipment_key), Boolean(row.available)]),
  );
  const hardConstraints = constraints.filter(isHardConstraint);
  const filteredOutByReason = {
    hard_constraint: 0,
    max_prep_time: 0,
    max_total_time: 0,
    equipment_unavailable: 0,
  };

  const kept = [];
  for (const recipe of recipes) {
    const violation = findHardConstraintViolation(recipe, hardConstraints);
    if (violation) {
      filteredOutByReason.hard_constraint += 1;
      continue;
    }

    if (profile.max_prep_time_minutes && recipe.prep_time_minutes && recipe.prep_time_minutes > profile.max_prep_time_minutes) {
      filteredOutByReason.max_prep_time += 1;
      continue;
    }

    if (profile.max_total_time_minutes && recipe.total_time_minutes && recipe.total_time_minutes > profile.max_total_time_minutes) {
      filteredOutByReason.max_total_time += 1;
      continue;
    }

    if (recipe.equipment_keys.some((key) => explicitAvailability.get(key) === false)) {
      filteredOutByReason.equipment_unavailable += 1;
      continue;
    }

    kept.push(recipe);
  }

  return {
    recipes: kept,
    filtered_count: recipes.length - kept.length,
    filtered_out_by_reason: filteredOutByReason,
  };
}

function findHardConstraintViolation(recipe, hardConstraints) {
  for (const constraint of hardConstraints) {
    if (recipeViolatesConstraint(recipe, constraint)) {
      return constraint;
    }
  }
  return null;
}

function recipeViolatesConstraint(recipe, constraint) {
  const targetType = normalizeSignalKey(constraint.target_type);
  const targetKey = normalizeSignalKey(constraint.target_key);
  if (!targetKey) return false;

  if (targetType === 'ingredient') {
    return recipe.ingredients.some((line) => ingredientMatchesTarget(line, targetKey));
  }
  if (targetType === 'ingredient_family') {
    return recipe.ingredients.some((line) => (
      normalizeSignalKey(line.food_family) === targetKey
      || line.tags_json.includes(targetKey)
    ));
  }
  if (targetType === 'tag') {
    return collectRecipeTagUniverse(recipe).includes(targetKey);
  }
  if (targetType === 'cuisine') {
    return recipe.cuisine_tags_json.includes(targetKey)
      || recipe.metadata.region_tags_json.includes(targetKey);
  }
  if (targetType === 'product_attribute') {
    return collectRecipeTagUniverse(recipe).includes(targetKey);
  }
  return false;
}

function ingredientMatchesTarget(line, targetKey) {
  const allergenKeys = Object.entries(line.allergen_flags_json || {})
    .filter(([, value]) => Boolean(value))
    .map(([key]) => normalizeSignalKey(key));
  return [
    normalizeSignalKey(line.ingredient_key),
    normalizeSignalKey(line.ingredient_key_snapshot),
    normalizeSignalKey(line.display_name),
  ].includes(targetKey)
    || line.tags_json.includes(targetKey)
    || allergenKeys.includes(targetKey);
}

function collectRecipeTagUniverse(recipe) {
  return normalizeStringArray([
    ...recipe.cuisine_tags_json,
    ...recipe.dietary_tags_json,
    ...recipe.meal_type_tags_json,
    ...recipe.metadata.region_tags_json,
    ...recipe.metadata.feeling_tags_json,
    ...extractProfileKeys(recipe.metadata.flavor_profile_json),
    ...extractProfileKeys(recipe.metadata.texture_profile_json),
    ...recipe.method_keys,
    ...recipe.staged_tag_keys,
  ]);
}

function buildMealPlan({
  recipes,
  bundle,
  tasteProfile,
  startDate,
  days,
  mealsPerDay,
  planKey,
}) {
  const mealTypes = resolveMealTypes(mealsPerDay);
  const targets = buildMealTargets(bundle.profile, mealsPerDay);
  const context = {
    usedRecipeCounts: new Map(),
    cuisineCounts: new Map(),
    previousRecipeId: null,
    previousMealTypeRecipeByDay: new Map(),
  };
  const items = [];
  const dailySummary = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const dayUsedRecipeIds = new Set();
    const dailyTotals = {
      day_index: dayIndex,
      total_calories: 0,
      total_protein_g: 0,
      total_carbs_g: 0,
      total_fat_g: 0,
      items: 0,
    };

    for (const mealType of mealTypes) {
      const scored = recipes
        .map((recipe) => scoreRecipeCandidate({
          recipe,
          mealType,
          bundle,
          tasteProfile,
          targets,
          dayIndex,
          dayUsedRecipeIds,
          context,
        }))
        .sort(compareScoredRecipes);

      const mealTypeScoped = scored.filter((entry) => (
        entry.recipe.meal_type_tags_json.length === 0
        || entry.recipe.meal_type_tags_json.includes(normalizeSignalKey(mealType))
      ));
      const candidatePool = mealTypeScoped.length > 0 ? mealTypeScoped : scored;
      const globallyUnusedSameDay = candidatePool.filter((entry) => (
        !dayUsedRecipeIds.has(entry.recipe.recipe_id)
        && !context.usedRecipeCounts.has(entry.recipe.recipe_id)
      ));
      const sameDayUnused = candidatePool.filter((entry) => !dayUsedRecipeIds.has(entry.recipe.recipe_id));
      const selected = globallyUnusedSameDay[0] || sameDayUnused[0] || candidatePool[0] || scored[0];
      if (!selected) continue;

      const item = buildMealPlanItem({
        planKey,
        dayIndex,
        mealType,
        selected,
      });
      items.push(item);
      dayUsedRecipeIds.add(selected.recipe.recipe_id);
      context.previousRecipeId = selected.recipe.recipe_id;
      context.usedRecipeCounts.set(
        selected.recipe.recipe_id,
        (context.usedRecipeCounts.get(selected.recipe.recipe_id) || 0) + 1,
      );
      if (selected.recipe.primary_cuisine) {
        context.cuisineCounts.set(
          selected.recipe.primary_cuisine,
          (context.cuisineCounts.get(selected.recipe.primary_cuisine) || 0) + 1,
        );
      }
      context.previousMealTypeRecipeByDay.set(`${mealType}:${dayIndex}`, selected.recipe.recipe_id);

      dailyTotals.total_calories = roundNumber(dailyTotals.total_calories + (item.calories || 0));
      dailyTotals.total_protein_g = roundNumber(dailyTotals.total_protein_g + (item.protein_g || 0));
      dailyTotals.total_carbs_g = roundNumber(dailyTotals.total_carbs_g + (item.carbs_g || 0));
      dailyTotals.total_fat_g = roundNumber(dailyTotals.total_fat_g + (item.fat_g || 0));
      dailyTotals.items += 1;
    }

    dailySummary.push(dailyTotals);
  }

  return {
    items,
    daily_summary: dailySummary,
    macro_summary: buildMacroSummary(dailySummary, targets, days),
  };
}

function scoreRecipeCandidate({
  recipe,
  mealType,
  bundle,
  tasteProfile,
  targets,
  dayIndex,
  dayUsedRecipeIds,
  context,
}) {
  const taste = scoreTaste({
    recipe,
    mealType,
    tasteProfile,
  });
  const nutrition = scoreNutrition(recipe, targets);
  const time = scoreTime(recipe, bundle.profile || {});
  const varietyPenalty = scoreVarietyPenalty({
    recipe,
    mealType,
    dayIndex,
    dayUsedRecipeIds,
    context,
  });
  const selectionScore = roundNumber(Math.max(0, (
    (taste.score * SCORE_WEIGHTS.taste)
    + (nutrition.score * SCORE_WEIGHTS.nutrition)
    + (time.score * SCORE_WEIGHTS.time)
    - varietyPenalty
  )));

  return {
    recipe,
    selection_score: selectionScore,
    selection_reason_json: {
      taste_score: taste.score,
      nutrition_score: nutrition.score,
      time_score: time.score,
      variety_penalty: varietyPenalty,
      matched_taste_signals: taste.matches,
      nutrition_targets_per_meal: targets,
      recipe_time: {
        prep_time_minutes: recipe.prep_time_minutes,
        total_time_minutes: recipe.total_time_minutes,
      },
    },
  };
}

function scoreTaste({ recipe, mealType, tasteProfile }) {
  const families = [];
  const matches = {};
  addTasteFamilyScore(families, matches, 'cuisine', recipe.cuisine_tags_json, tasteProfile.cuisine_vector_json);
  addTasteFamilyScore(families, matches, 'flavor', extractProfileKeys(recipe.metadata.flavor_profile_json), tasteProfile.flavor_vector_json);
  addTasteFamilyScore(families, matches, 'texture', extractProfileKeys(recipe.metadata.texture_profile_json), tasteProfile.texture_vector_json);
  addTasteFamilyScore(families, matches, 'feeling', recipe.metadata.feeling_tags_json, tasteProfile.feeling_vector_json);
  addTasteFamilyScore(families, matches, 'cooking_method', recipe.method_keys, tasteProfile.cooking_method_vector_json);
  addTasteFamilyScore(families, matches, 'meal_type', recipe.meal_type_tags_json, tasteProfile.meal_type_vector_json);

  let mealTypeFit = 0.5;
  if (recipe.meal_type_tags_json.length > 0) {
    mealTypeFit = recipe.meal_type_tags_json.includes(normalizeSignalKey(mealType)) ? 1 : 0.2;
  }
  families.push(mealTypeFit);
  matches.meal_slot = {
    requested: mealType,
    recipe_tags: recipe.meal_type_tags_json,
    score: mealTypeFit,
  };

  const score = families.length > 0
    ? roundNumber(families.reduce((sum, value) => sum + value, 0) / families.length)
    : 0.5;
  return { score, matches };
}

function addTasteFamilyScore(families, matches, family, keys, vector = {}) {
  const normalizedKeys = normalizeStringArray(keys);
  const vectorEntries = normalizedKeys
    .filter((key) => Object.prototype.hasOwnProperty.call(vector || {}, key))
    .map((key) => ({
      key,
      raw_score: clampSignedScore(vector[key]),
      normalized_score: normalizeSignedScore(vector[key]),
    }));
  if (vectorEntries.length === 0) return;
  const score = roundNumber(
    vectorEntries.reduce((sum, entry) => sum + entry.normalized_score, 0) / vectorEntries.length,
  );
  families.push(score);
  matches[family] = {
    keys: vectorEntries.map((entry) => entry.key),
    raw_scores: Object.fromEntries(vectorEntries.map((entry) => [entry.key, entry.raw_score])),
    score,
  };
}

function scoreNutrition(recipe, targets) {
  const comparisons = [
    compareTarget(recipe.per_serving_kcal, targets.calories),
    compareTarget(recipe.per_serving_protein_g, targets.protein_g),
    compareTarget(recipe.per_serving_carbs_g, targets.carbs_g),
    compareTarget(recipe.per_serving_fat_g, targets.fat_g),
  ].filter((value) => value !== null);
  if (comparisons.length === 0) return { score: 0.5 };
  return {
    score: roundNumber(comparisons.reduce((sum, value) => sum + value, 0) / comparisons.length),
  };
}

function scoreTime(recipe, profile) {
  const prepScore = profile.max_prep_time_minutes
    ? boundedTimeScore(recipe.prep_time_minutes, profile.max_prep_time_minutes)
    : null;
  const totalScore = profile.max_total_time_minutes
    ? boundedTimeScore(recipe.total_time_minutes, profile.max_total_time_minutes)
    : null;
  const values = [prepScore, totalScore].filter((value) => value !== null);
  if (values.length === 0) {
    return { score: 0.5 };
  }
  return {
    score: roundNumber(values.reduce((sum, value) => sum + value, 0) / values.length),
  };
}

function scoreVarietyPenalty({
  recipe,
  mealType,
  dayIndex,
  dayUsedRecipeIds,
  context,
}) {
  let penalty = 0;
  if (dayUsedRecipeIds.has(recipe.recipe_id)) {
    penalty += 0.45;
  }
  const priorUses = Number(context.usedRecipeCounts.get(recipe.recipe_id) || 0);
  if (priorUses > 0) {
    penalty += Math.min(0.25, priorUses * 0.08);
  }
  if (context.previousRecipeId && context.previousRecipeId === recipe.recipe_id) {
    penalty += 0.25;
  }
  const previousDayMealTypeRecipeId = context.previousMealTypeRecipeByDay.get(`${mealType}:${dayIndex - 1}`);
  if (previousDayMealTypeRecipeId && previousDayMealTypeRecipeId === recipe.recipe_id) {
    penalty += 0.12;
  }
  if (recipe.primary_cuisine) {
    const priorCuisineUses = Number(context.cuisineCounts.get(recipe.primary_cuisine) || 0);
    if (priorCuisineUses > 0) {
      penalty += Math.min(0.12, priorCuisineUses * 0.03);
    }
  }
  return roundNumber(Math.min(0.9, penalty));
}

function buildMealPlanItem({ planKey, dayIndex, mealType, selected }) {
  return {
    item_id: buildMealPlanItemId(planKey, dayIndex, mealType),
    plan_id: buildMealPlanId(planKey),
    day_index: dayIndex,
    meal_type: mealType,
    recipe_id: selected.recipe.recipe_id,
    recipe_key_snapshot: selected.recipe.recipe_key,
    calories: selected.recipe.per_serving_kcal,
    protein_g: selected.recipe.per_serving_protein_g,
    carbs_g: selected.recipe.per_serving_carbs_g,
    fat_g: selected.recipe.per_serving_fat_g,
    selection_score: selected.selection_score,
    selection_reason_json: selected.selection_reason_json,
  };
}

function buildMacroSummary(dailySummary, targets, days) {
  const totals = dailySummary.reduce((accumulator, row) => ({
    total_calories: roundNumber(accumulator.total_calories + row.total_calories),
    total_protein_g: roundNumber(accumulator.total_protein_g + row.total_protein_g),
    total_carbs_g: roundNumber(accumulator.total_carbs_g + row.total_carbs_g),
    total_fat_g: roundNumber(accumulator.total_fat_g + row.total_fat_g),
  }), {
    total_calories: 0,
    total_protein_g: 0,
    total_carbs_g: 0,
    total_fat_g: 0,
  });
  const divisor = Math.max(1, Number(days || 1));
  return {
    ...totals,
    average_calories_per_day: roundNumber(totals.total_calories / divisor),
    average_protein_g_per_day: roundNumber(totals.total_protein_g / divisor),
    average_carbs_g_per_day: roundNumber(totals.total_carbs_g / divisor),
    average_fat_g_per_day: roundNumber(totals.total_fat_g / divisor),
    target_calories_per_meal: targets.calories,
    target_protein_g_per_meal: targets.protein_g,
    target_carbs_g_per_meal: targets.carbs_g,
    target_fat_g_per_meal: targets.fat_g,
  };
}

function buildMealTargets(profile, mealsPerDay) {
  const divisor = Math.max(1, Number(mealsPerDay || DEFAULT_MEALS_PER_DAY));
  return {
    calories: divideTarget(profile.daily_calorie_target, divisor),
    protein_g: divideTarget(profile.protein_target_g, divisor),
    carbs_g: divideTarget(profile.carbs_target_g, divisor),
    fat_g: divideTarget(profile.fat_target_g, divisor),
  };
}

function buildFallbackTasteProfile(bundle = {}) {
  const vectors = {
    flavor_vector_json: {},
    texture_vector_json: {},
    cuisine_vector_json: {},
    region_vector_json: {},
    feeling_vector_json: {},
    meal_type_vector_json: {},
    cooking_method_vector_json: {},
  };
  for (const preference of bundle.preferences || []) {
    const key = normalizeSignalKey(preference.preference_key);
    if (!key) continue;
    const field = `${normalizeSignalKey(preference.preference_type)}_vector_json`;
    if (!Object.prototype.hasOwnProperty.call(vectors, field)) continue;
    vectors[field][key] = clampSignedScore(preference.preference_score);
  }
  return {
    snapshot_id: null,
    snapshot_version: 0,
    ...vectors,
    confidence_json: {
      level: 'low',
      source: 'explicit_preferences_fallback',
    },
  };
}

async function persistMealPlan(client, { plan, items }) {
  await client.query('BEGIN');
  try {
    const storedPlan = await upsertMealPlan(client, plan);
    await client.query('DELETE FROM meal_plan_items WHERE plan_id = $1', [storedPlan.plan_id]);
    for (const item of items) {
      await insertMealPlanItem(client, {
        ...item,
        plan_id: storedPlan.plan_id,
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function upsertMealPlan(client, plan) {
  const result = await client.query(`
    INSERT INTO meal_plans (
      plan_id,
      profile_id,
      user_id,
      plan_key,
      start_date,
      days,
      meals_per_day,
      target_calories_per_day,
      target_protein_g,
      target_carbs_g,
      target_fat_g,
      generation_method,
      rules_version
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (plan_key) DO UPDATE SET
      profile_id = EXCLUDED.profile_id,
      user_id = EXCLUDED.user_id,
      start_date = EXCLUDED.start_date,
      days = EXCLUDED.days,
      meals_per_day = EXCLUDED.meals_per_day,
      target_calories_per_day = EXCLUDED.target_calories_per_day,
      target_protein_g = EXCLUDED.target_protein_g,
      target_carbs_g = EXCLUDED.target_carbs_g,
      target_fat_g = EXCLUDED.target_fat_g,
      generation_method = EXCLUDED.generation_method,
      rules_version = EXCLUDED.rules_version
    RETURNING *
  `, [
    plan.plan_id,
    plan.profile_id,
    plan.user_id,
    plan.plan_key,
    plan.start_date,
    plan.days,
    plan.meals_per_day,
    plan.target_calories_per_day,
    plan.target_protein_g,
    plan.target_carbs_g,
    plan.target_fat_g,
    plan.generation_method,
    plan.rules_version,
  ]);
  return result.rows[0];
}

async function insertMealPlanItem(client, item) {
  const result = await client.query(`
    INSERT INTO meal_plan_items (
      item_id,
      plan_id,
      day_index,
      meal_type,
      recipe_id,
      recipe_key_snapshot,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      selection_score,
      selection_reason_json
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12::jsonb
    )
    RETURNING *
  `, [
    item.item_id,
    item.plan_id,
    item.day_index,
    item.meal_type,
    item.recipe_id,
    item.recipe_key_snapshot,
    item.calories,
    item.protein_g,
    item.carbs_g,
    item.fat_g,
    item.selection_score,
    JSON.stringify(item.selection_reason_json || {}),
  ]);
  return hydrateJsonFields(result.rows[0], ['selection_reason_json']);
}

function buildMealPlanKey(profileId, startDate, rulesVersion) {
  return `meal_plan:${stableHash([
    requiredString(profileId, 'profile_id'),
    normalizeDateString(startDate),
    requiredString(rulesVersion, 'rules_version'),
  ].join('|'))}`;
}

function buildMealPlanId(planKey) {
  return `meal_plan:${stableHash(requiredString(planKey, 'plan_key'))}`;
}

function buildMealPlanItemId(planKey, dayIndex, mealType) {
  return `meal_plan_item:${stableHash(`${requiredString(planKey, 'plan_key')}|${positiveInteger(dayIndex + 1, 1)}|${requiredString(mealType, 'meal_type')}`)}`;
}

function normalizeMealPlanOptions(options = {}) {
  const profileId = nullableString(options.profileId || options.profile_id);
  const userId = nullableString(options.userId || options.user_id);
  if (!profileId && !userId) {
    throw new Error('profile_id or user_id is required for PLAN1 meal planning.');
  }
  const mealsPerDay = positiveInteger(options.mealsPerDay || options.meals_per_day, DEFAULT_MEALS_PER_DAY);
  if (mealsPerDay > SUPPORTED_MEAL_PLAN_MEAL_TYPES.length) {
    throw new Error(`meals_per_day must be between 1 and ${SUPPORTED_MEAL_PLAN_MEAL_TYPES.length}.`);
  }
  return {
    profile_id: profileId,
    user_id: userId,
    start_date: normalizeDateString(options.startDate || options.start_date || new Date().toISOString().slice(0, 10)),
    days: positiveInteger(options.days, DEFAULT_MEAL_PLAN_DAYS),
    meals_per_day: mealsPerDay,
    dry_run: Boolean(options.dryRun || options.dry_run),
  };
}

function resolveMealTypes(mealsPerDay) {
  return SUPPORTED_MEAL_PLAN_MEAL_TYPES.slice(0, positiveInteger(mealsPerDay, DEFAULT_MEALS_PER_DAY));
}

function compareScoredRecipes(left, right) {
  return right.selection_score - left.selection_score
    || left.recipe.recipe_key.localeCompare(right.recipe.recipe_key);
}

function isHardConstraint(constraint = {}) {
  return normalizeSignalKey(constraint.severity) === 'hard'
    || ['allergy', 'intolerance', 'medical'].includes(normalizeSignalKey(constraint.constraint_type));
}

function compareTarget(value, target) {
  const actual = nullableNumber(value);
  const expected = nullableNumber(target);
  if (actual === null || expected === null || expected <= 0) return null;
  return roundNumber(Math.max(0, 1 - Math.min(1, Math.abs(actual - expected) / expected)));
}

function boundedTimeScore(value, maxValue) {
  const actual = nullableNumber(value);
  const bound = nullableNumber(maxValue);
  if (actual === null || bound === null || bound <= 0) return 0.5;
  return roundNumber(Math.max(0, 1 - Math.min(1, actual / bound)));
}

function divideTarget(value, divisor) {
  const numeric = nullableNumber(value);
  if (numeric === null) return null;
  return roundNumber(numeric / Math.max(1, Number(divisor || 1)));
}

function averageSelectionScore(items = []) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return roundNumber(
    items.reduce((sum, item) => sum + Number(item.selection_score || 0), 0) / items.length,
  );
}

function groupRowsByKey(rows, key) {
  const groups = new Map();
  for (const row of rows || []) {
    const groupKey = row[key];
    const list = groups.get(groupKey) || [];
    list.push(row);
    groups.set(groupKey, list);
  }
  return groups;
}

function extractProfileKeys(profile = {}) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return [];
  const keys = new Set();
  for (const [key, value] of Object.entries(profile)) {
    if (typeof value === 'string') {
      keys.add(normalizeSignalKey(`${key}_${value}`));
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') {
          keys.add(normalizeSignalKey(entry));
        }
      }
    }
  }
  return [...keys].filter(Boolean).sort();
}

function hydrateJsonFields(row, fields = []) {
  if (!row) return null;
  const hydrated = { ...row };
  for (const field of fields) {
    hydrated[field] = parseJson(hydrated[field], {});
  }
  return hydrated;
}

function firstNonNull(values = []) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
}

function sumPositiveNumbers(values = []) {
  const numbers = values.map(nullableNumber).filter((value) => value !== null && value > 0);
  if (numbers.length === 0) return null;
  return roundNumber(numbers.reduce((sum, value) => sum + value, 0));
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeSignalKey).filter(Boolean))].sort();
}

function normalizeSignalKey(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}0-9]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || null;
}

function normalizeSignedScore(value) {
  return roundNumber((clampSignedScore(value) + 1) / 2);
}

function clampSignedScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return roundNumber(Math.max(-1, Math.min(1, numeric)));
}

function normalizeDateString(value) {
  const normalized = requiredString(value, 'start_date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`start_date must be YYYY-MM-DD: ${value}`);
  }
  return normalized;
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function positiveInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function requiredString(value, fieldName) {
  const normalized = nullableString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

function roundNumber(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function stableHash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16);
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_MEAL_PLAN_DAYS,
  DEFAULT_MEALS_PER_DAY,
  MEAL_PLAN_GENERATION_METHOD,
  MEAL_PLAN_RULES_VERSION,
  SCORE_WEIGHTS,
  SUPPORTED_MEAL_PLAN_MEAL_TYPES,
  averageSelectionScore,
  buildFallbackTasteProfile,
  buildMealPlanKey,
  buildMealPlanItemId,
  buildMealPlanId,
  buildMealTargets,
  generateMealPlan,
  normalizeMealPlanOptions,
  scoreRecipeCandidate,
};
