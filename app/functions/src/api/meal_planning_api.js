const {
  generateMealPlan,
} = require('../db/planner/meal_planner_engine');
const {
  hydrateMealPlanOptimizedBasketItemRow,
  hydrateMealPlanOptimizedBasketRow,
} = require('../db/planner/meal_plan_basket_optimizer_adapter');
const {
  hydrateMealPlanShoppingRunRow,
  runMealPlanShoppingOrchestration,
} = require('../db/planner/meal_plan_shopping_orchestrator');

const MEAL_TYPE_ORDER = Object.freeze({
  breakfast: 1,
  lunch: 2,
  dinner: 3,
  snack: 4,
});

async function handleGenerateMealPlanRequest({
  client,
  body = {},
  api_adapter,
}) {
  requireClient(client);
  const input = normalizeMealPlanGenerateRequest(body);
  if (input.error) {
    return input.error;
  }

  const adapter = resolveMealPlanningApiAdapter(api_adapter);
  try {
    const report = await adapter.generateMealPlan(client, input.value);
    const detail = report.dry_run
      ? buildMealPlanDetailFromGenerationReport(report)
      : await getMealPlanDetail(client, {
        planId: report?.plan?.plan_id,
      });

    return {
      status: 200,
      body: {
        dry_run: Boolean(report.dry_run),
        plan: detail?.plan || report.plan || null,
        items: detail?.items || report.items || [],
        summary: detail?.summary || buildMealPlanDetailSummary(report.plan, report.items || []),
        generation_report: buildGenerationReportSummary(report),
      },
    };
  } catch (error) {
    const response = mapMealPlanningError(error, {
      missing_profile_error: 'meal plan profile not found',
    });
    if (response) {
      return response;
    }
    throw error;
  }
}

async function handleGetMealPlanRequest({
  client,
  params = {},
}) {
  requireClient(client);
  const planId = requiredRouteId(params.planId || params.id, 'planId');
  if (planId.error) {
    return planId.error;
  }

  const detail = await getMealPlanDetail(client, {
    planId: planId.value,
  });
  if (!detail) {
    return notFound('meal plan not found');
  }

  return {
    status: 200,
    body: detail,
  };
}

async function handleRunMealPlanShoppingRequest({
  client,
  store,
  params = {},
  body = {},
  api_adapter,
}) {
  requireClient(client);
  const planId = requiredRouteId(params.planId || params.id, 'planId');
  if (planId.error) {
    return planId.error;
  }
  const input = normalizeMealPlanShoppingRunRequest(body);
  if (input.error) {
    return input.error;
  }

  const existingPlan = await getMealPlanRow(client, planId.value);
  if (!existingPlan) {
    return notFound('meal plan not found');
  }

  const adapter = resolveMealPlanningApiAdapter(api_adapter);
  try {
    const report = await adapter.runMealPlanShoppingOrchestration(client, {
      planId: planId.value,
      profileId: existingPlan.profile_id,
      userId: existingPlan.user_id,
      dryRun: input.value.dry_run,
      store,
    });
    if (report.run_status === 'failed') {
      return {
        status: 500,
        body: {
          error: 'meal plan shopping run failed',
          run_status: report.run_status,
          artifact_ids: report.ids || buildRunArtifactIds(report.run),
          errors: report.errors || [],
        },
      };
    }

    const detail = report.dry_run || !report.run?.run_id
      ? buildMealPlanShoppingRunDetailFromReport(report)
      : await getMealPlanShoppingRunDetail(client, {
        runId: report.run.run_id,
      });

    return {
      status: 200,
      body: {
        dry_run: Boolean(report.dry_run),
        run: detail?.run || report.run || null,
        artifact_ids: detail?.artifact_ids || report.ids || buildRunArtifactIds(report.run),
        summary: detail?.summary || report.run?.summary_json || null,
        orchestration_report: {
          run_status: report.run_status,
          total_estimated_price: nullableNumber(report.total_estimated_price) || 0,
          inventory_coverage_percent: nullableNumber(report.inventory_coverage_percent) || 0,
          missing_items_count: positiveInteger(report.missing_items_count, 0),
          ready_items_count: positiveInteger(report.ready_items_count, 0),
          errors: report.errors || [],
        },
      },
    };
  } catch (error) {
    const response = mapMealPlanningError(error);
    if (response) {
      return response;
    }
    throw error;
  }
}

async function handleGetMealPlanShoppingRunRequest({
  client,
  params = {},
}) {
  requireClient(client);
  const runId = requiredRouteId(params.runId || params.id, 'runId');
  if (runId.error) {
    return runId.error;
  }

  const detail = await getMealPlanShoppingRunDetail(client, {
    runId: runId.value,
  });
  if (!detail) {
    return notFound('meal plan shopping run not found');
  }

  return {
    status: 200,
    body: detail,
  };
}

async function handleGetMealPlanOptimizedBasketRequest({
  client,
  params = {},
}) {
  requireClient(client);
  const basketId = requiredRouteId(params.basketId || params.id, 'basketId');
  if (basketId.error) {
    return basketId.error;
  }

  const detail = await getMealPlanOptimizedBasketDetail(client, {
    basketId: basketId.value,
  });
  if (!detail) {
    return notFound('meal plan optimized basket not found');
  }

  return {
    status: 200,
    body: detail,
  };
}

async function getMealPlanDetail(client, {
  planId,
}) {
  requireClient(client);
  const plan = await getMealPlanRow(client, planId);
  if (!plan) {
    return null;
  }

  const itemsResult = await client.query(`
    SELECT
      mpi.*,
      r.recipe_key,
      r.title_en,
      r.title_bg,
      r.canonical_title,
      r.description,
      r.usability_status,
      r.review_status AS recipe_review_status,
      r.servings
    FROM meal_plan_items mpi
    LEFT JOIN recipes r
      ON r.recipe_id = mpi.recipe_id
    WHERE mpi.plan_id = $1
    ORDER BY
      mpi.day_index ASC,
      CASE mpi.meal_type
        WHEN 'breakfast' THEN 1
        WHEN 'lunch' THEN 2
        WHEN 'dinner' THEN 3
        WHEN 'snack' THEN 4
        ELSE 99
      END ASC,
      mpi.item_id ASC
  `, [requiredString(planId, 'plan_id')]);

  const items = (itemsResult.rows || []).map(hydrateMealPlanItemRow);
  return {
    plan,
    items,
    summary: buildMealPlanDetailSummary(plan, items),
  };
}

async function getMealPlanShoppingRunDetail(client, {
  runId,
}) {
  requireClient(client);
  const runResult = await client.query(
    'SELECT * FROM meal_plan_shopping_runs WHERE run_id = $1',
    [requiredString(runId, 'run_id')],
  );
  const run = hydrateMealPlanShoppingRunRow(runResult.rows?.[0] || null);
  if (!run) {
    return null;
  }

  return {
    run,
    artifact_ids: buildRunArtifactIds(run),
    summary: run.summary_json || {},
  };
}

async function getMealPlanOptimizedBasketDetail(client, {
  basketId,
}) {
  requireClient(client);
  const basketResult = await client.query(
    'SELECT * FROM meal_plan_optimized_baskets WHERE optimized_basket_id = $1',
    [requiredString(basketId, 'basket_id')],
  );
  const optimizedBasket = hydrateMealPlanOptimizedBasketRow(basketResult.rows?.[0] || null);
  if (!optimizedBasket) {
    return null;
  }

  const itemsResult = await client.query(`
    SELECT *
    FROM meal_plan_optimized_basket_items
    WHERE optimized_basket_id = $1
    ORDER BY
      CASE item_status
        WHEN 'selected' THEN 1
        WHEN 'covered_by_inventory' THEN 2
        WHEN 'missing_product' THEN 3
        WHEN 'missing_price' THEN 4
        WHEN 'optimizer_excluded' THEN 5
        WHEN 'needs_review' THEN 6
        ELSE 99
      END ASC,
      display_name ASC,
      optimized_basket_item_id ASC
  `, [requiredString(basketId, 'basket_id')]);

  const items = (itemsResult.rows || []).map(hydrateMealPlanOptimizedBasketItemRow);
  return {
    optimized_basket: optimizedBasket,
    items,
    summary: {
      item_status_counts: summarizeByKey(items, 'item_status'),
      item_count: items.length,
      covered_requirement_count: positiveInteger(optimizedBasket.covered_requirement_count, 0),
      missing_requirement_count: positiveInteger(optimizedBasket.missing_requirement_count, 0),
      total_estimated_price: nullableNumber(optimizedBasket.total_estimated_price) || 0,
      currency: optimizedBasket.currency || 'EUR',
    },
  };
}

function buildMealPlanDetailFromGenerationReport(report) {
  const items = Array.isArray(report?.items)
    ? report.items.map((item) => ({
      ...item,
      selection_reason_json: item.selection_reason_json || {},
      recipe_snapshot: null,
    }))
    : [];
  return {
    plan: report?.plan || null,
    items,
    summary: buildMealPlanDetailSummary(report?.plan || null, items, {
      average_selection_score: nullableNumber(report?.average_selection_score),
      daily_calorie_summary: Array.isArray(report?.daily_calorie_summary)
        ? report.daily_calorie_summary
        : [],
      macro_summary: report?.macro_summary || {},
    }),
  };
}

function buildMealPlanShoppingRunDetailFromReport(report) {
  return {
    run: report?.run || null,
    artifact_ids: report?.ids || buildRunArtifactIds(report?.run),
    summary: report?.run?.summary_json || null,
  };
}

function buildMealPlanDetailSummary(plan, items, overrides = {}) {
  const dailyTotals = new Map();
  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  for (const item of items || []) {
    const dayIndex = positiveInteger(item.day_index, 0);
    const entry = dailyTotals.get(dayIndex) || {
      day_index: dayIndex,
      items: 0,
      total_calories: 0,
      total_protein_g: 0,
      total_carbs_g: 0,
      total_fat_g: 0,
    };
    entry.items += 1;
    entry.total_calories = roundNumber(entry.total_calories + (nullableNumber(item.calories) || 0));
    entry.total_protein_g = roundNumber(entry.total_protein_g + (nullableNumber(item.protein_g) || 0));
    entry.total_carbs_g = roundNumber(entry.total_carbs_g + (nullableNumber(item.carbs_g) || 0));
    entry.total_fat_g = roundNumber(entry.total_fat_g + (nullableNumber(item.fat_g) || 0));
    dailyTotals.set(dayIndex, entry);

    totalCalories = roundNumber(totalCalories + (nullableNumber(item.calories) || 0));
    totalProtein = roundNumber(totalProtein + (nullableNumber(item.protein_g) || 0));
    totalCarbs = roundNumber(totalCarbs + (nullableNumber(item.carbs_g) || 0));
    totalFat = roundNumber(totalFat + (nullableNumber(item.fat_g) || 0));
  }

  const itemCount = Array.isArray(items) ? items.length : 0;
  const divisor = Math.max(1, positiveInteger(plan?.days, dailyTotals.size || 1));
  return {
    item_count: itemCount,
    days: positiveInteger(plan?.days, 0),
    meals_per_day: positiveInteger(plan?.meals_per_day, 0),
    average_selection_score: nullableNumber(overrides.average_selection_score)
      ?? averageSelectionScore(items),
    total_calories: totalCalories,
    total_protein_g: totalProtein,
    total_carbs_g: totalCarbs,
    total_fat_g: totalFat,
    average_calories_per_day: roundNumber(totalCalories / divisor),
    average_protein_g_per_day: roundNumber(totalProtein / divisor),
    average_carbs_g_per_day: roundNumber(totalCarbs / divisor),
    average_fat_g_per_day: roundNumber(totalFat / divisor),
    daily_totals: overrides.daily_calorie_summary && overrides.daily_calorie_summary.length > 0
      ? overrides.daily_calorie_summary
      : [...dailyTotals.values()].sort((left, right) => left.day_index - right.day_index),
    macro_summary: overrides.macro_summary && Object.keys(overrides.macro_summary).length > 0
      ? overrides.macro_summary
      : {
        total_calories: totalCalories,
        total_protein_g: totalProtein,
        total_carbs_g: totalCarbs,
        total_fat_g: totalFat,
      },
  };
}

function buildGenerationReportSummary(report) {
  return {
    recipes_considered: positiveInteger(report?.recipes_considered, 0),
    recipes_filtered: positiveInteger(report?.recipes_filtered, 0),
    plan_items_created: positiveInteger(report?.plan_items_created, 0),
    average_selection_score: nullableNumber(report?.average_selection_score) || 0,
    daily_calorie_summary: Array.isArray(report?.daily_calorie_summary)
      ? report.daily_calorie_summary
      : [],
    macro_summary: report?.macro_summary || {},
    errors: Array.isArray(report?.errors) ? report.errors : [],
  };
}

async function getMealPlanRow(client, planId) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM meal_plans WHERE plan_id = $1',
    [requiredString(planId, 'plan_id')],
  );
  return result.rows?.[0] || null;
}

function resolveMealPlanningApiAdapter(adapter) {
  const resolved = adapter && typeof adapter === 'object'
    ? adapter
    : {
      generateMealPlan,
      runMealPlanShoppingOrchestration,
    };
  if (typeof resolved.generateMealPlan !== 'function') {
    throw new Error('meal planning API adapter must provide generateMealPlan');
  }
  if (typeof resolved.runMealPlanShoppingOrchestration !== 'function') {
    throw new Error('meal planning API adapter must provide runMealPlanShoppingOrchestration');
  }
  return resolved;
}

function hydrateMealPlanItemRow(row) {
  return {
    item_id: row.item_id,
    plan_id: row.plan_id,
    day_index: positiveInteger(row.day_index, 0),
    meal_type: nullableString(row.meal_type),
    recipe_id: nullableString(row.recipe_id),
    recipe_key_snapshot: nullableString(row.recipe_key_snapshot),
    calories: nullableNumber(row.calories),
    protein_g: nullableNumber(row.protein_g),
    carbs_g: nullableNumber(row.carbs_g),
    fat_g: nullableNumber(row.fat_g),
    selection_score: nullableNumber(row.selection_score),
    selection_reason_json: parseJson(row.selection_reason_json, {}),
    recipe_snapshot: {
      recipe_id: nullableString(row.recipe_id),
      recipe_key: nullableString(row.recipe_key) || nullableString(row.recipe_key_snapshot),
      title_en: nullableString(row.title_en),
      title_bg: nullableString(row.title_bg),
      canonical_title: nullableString(row.canonical_title),
      description: nullableString(row.description),
      usability_status: nullableString(row.usability_status),
      review_status: nullableString(row.recipe_review_status),
      servings: nullableNumber(row.servings),
    },
  };
}

function buildRunArtifactIds(run) {
  return {
    plan_id: nullableString(run?.plan_id),
    plan_key: nullableString(run?.plan_key),
    requirement_id: nullableString(run?.requirement_id),
    net_requirement_id: nullableString(run?.net_requirement_id),
    candidate_set_id: nullableString(run?.candidate_set_id),
    optimized_basket_id: nullableString(run?.optimized_basket_id),
  };
}

function normalizeMealPlanGenerateRequest(body) {
  if (!isPlainObject(body)) {
    return badRequest('request body must be an object');
  }
  const profileId = nullableString(body.profile_id || body.profileId);
  const userId = nullableString(body.user_id || body.userId);
  if (!profileId && !userId) {
    return badRequest('profile_id or user_id is required');
  }
  return {
    value: {
      profileId,
      userId,
      startDate: nullableString(body.start_date || body.startDate) || undefined,
      days: body.days,
      mealsPerDay: body.meals_per_day || body.mealsPerDay,
      dryRun: Boolean(body.dry_run || body.dryRun),
    },
  };
}

function normalizeMealPlanShoppingRunRequest(body) {
  if (!isPlainObject(body)) {
    return badRequest('request body must be an object');
  }
  return {
    value: {
      dry_run: Boolean(body.dry_run || body.dryRun),
    },
  };
}

function mapMealPlanningError(error, overrides = {}) {
  const message = String(error?.message || '').trim();
  if (!message) {
    return null;
  }
  if (/user food profile not found/i.test(message)) {
    return notFound(overrides.missing_profile_error || 'user food profile not found');
  }
  if (/meal plan not found/i.test(message)) {
    return notFound('meal plan not found');
  }
  if (/optimized basket not found/i.test(message)) {
    return notFound('meal plan optimized basket not found');
  }
  if (
    /is required/i.test(message)
    || /must be/i.test(message)
    || /unsupported/i.test(message)
    || /invalid/i.test(message)
  ) {
    return badRequest(message).error;
  }
  return null;
}

function summarizeByKey(rows, key) {
  return (rows || []).reduce((counts, row) => {
    const groupKey = nullableString(row?.[key]) || 'unknown';
    counts[groupKey] = (counts[groupKey] || 0) + 1;
    counts.total = (counts.total || 0) + 1;
    return counts;
  }, {
    total: 0,
  });
}

function averageSelectionScore(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }
  return roundNumber(
    items.reduce((sum, item) => sum + (nullableNumber(item.selection_score) || 0), 0) / items.length,
  );
}

function requiredRouteId(value, fieldName) {
  const normalized = nullableString(value);
  if (!normalized) {
    return badRequest(`${fieldName} is required`);
  }
  return { value: normalized };
}

function badRequest(error) {
  return {
    error: {
      status: 400,
      body: { error },
    },
  };
}

function notFound(error) {
  return {
    status: 404,
    body: { error },
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function positiveInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
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

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  getMealPlanDetail,
  getMealPlanOptimizedBasketDetail,
  getMealPlanShoppingRunDetail,
  handleGenerateMealPlanRequest,
  handleGetMealPlanOptimizedBasketRequest,
  handleGetMealPlanRequest,
  handleGetMealPlanShoppingRunRequest,
  handleRunMealPlanShoppingRequest,
  resolveMealPlanningApiAdapter,
};
