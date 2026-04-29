const crypto = require('node:crypto');

const {
  DEFAULT_MEAL_PLAN_DAYS,
  DEFAULT_MEALS_PER_DAY,
  generateMealPlan,
} = require('./meal_planner_engine');
const {
  buildMealPlanRequirements,
} = require('./meal_plan_requirements_builder');
const {
  buildMealPlanNetRequirements,
} = require('./meal_plan_net_requirements_builder');
const {
  buildMealPlanProductCandidateSet,
} = require('./meal_plan_product_candidate_builder');
const {
  optimizeMealPlanBasket,
} = require('./meal_plan_basket_optimizer_adapter');

const MEAL_PLAN_SHOPPING_ORCHESTRATION_GENERATION_METHOD = 'plan2d_meal_plan_shopping_orchestrator_v1';
const MEAL_PLAN_SHOPPING_ORCHESTRATION_RULES_VERSION = 'plan2d_meal_plan_shopping_orchestrator_rules_v1';
const SUPPORTED_MEAL_PLAN_SHOPPING_RUN_STATUSES = Object.freeze([
  'started',
  'completed',
  'partial',
  'failed',
]);

async function runMealPlanShoppingOrchestration(client, options = {}) {
  requireClient(client);
  const normalized = normalizeMealPlanShoppingOrchestrationOptions(options);
  const adapter = resolveMealPlanShoppingOrchestrationAdapter(
    normalized.orchestration_adapter,
  );
  const context = {
    plan_generated: false,
    plan: null,
    requirement: null,
    net_requirement: null,
    candidate_set: null,
    optimized_basket: null,
    reports: {
      plan: null,
      requirements: null,
      net_requirements: null,
      candidate_set: null,
      optimized_basket: null,
    },
    errors: [],
  };

  try {
    context.reports.plan = normalized.plan_id || normalized.plan_key
      ? await loadExistingPlanReport(client, normalized)
      : await adapter.generateMealPlan(client, {
        profileId: normalized.profile_id,
        userId: normalized.user_id,
        startDate: normalized.start_date,
        days: normalized.days,
        mealsPerDay: normalized.meals_per_day,
        // PLAN2D needs deterministic upstream artifacts for chaining, so the top-level dry-run
        // only suppresses the orchestration run row rather than forcing every upstream phase to stay dry.
        dryRun: false,
      });
    context.plan_generated = !(normalized.plan_id || normalized.plan_key);
    context.plan = requiredObject(context.reports.plan.plan, 'plan');
  } catch (error) {
    context.errors.push(buildStepError('plan', error));
    return buildFailedOrchestrationReport({
      normalized,
      context,
      run: null,
      run_status: 'failed',
    });
  }

  const run = buildMealPlanShoppingRunRecord({
    user_id: normalized.user_id || context.plan.user_id,
    profile_id: context.plan.profile_id,
    plan_id: context.plan.plan_id,
    plan_key: context.plan.plan_key,
    requirement_id: null,
    net_requirement_id: null,
    candidate_set_id: null,
    optimized_basket_id: null,
    run_status: 'started',
    summary_json: buildRunSummary({
      normalized,
      context,
      run_status: 'started',
    }),
  });

  if (!normalized.dry_run) {
    await upsertMealPlanShoppingRun(client, run);
  }

  try {
    context.reports.requirements = await adapter.buildMealPlanRequirements(client, {
      planId: context.plan.plan_id,
      dryRun: false,
    });
    context.requirement = requiredObject(
      context.reports.requirements.requirement,
      'requirement',
    );

    context.reports.net_requirements = await adapter.buildMealPlanNetRequirements(client, {
      requirementId: context.requirement.requirement_id,
      dryRun: false,
    });
    context.net_requirement = requiredObject(
      context.reports.net_requirements.net_requirement,
      'net_requirement',
    );

    context.reports.candidate_set = await adapter.buildMealPlanProductCandidateSet(client, {
      netRequirementId: context.net_requirement.net_requirement_id,
      dryRun: false,
      store: normalized.store,
    });
    context.candidate_set = requiredObject(
      context.reports.candidate_set.candidate_set,
      'candidate_set',
    );

    context.reports.optimized_basket = await adapter.optimizeMealPlanBasket(client, {
      candidateSetId: context.candidate_set.candidate_set_id,
      dryRun: false,
      store: normalized.store,
    });
    context.optimized_basket = requiredObject(
      context.reports.optimized_basket.optimized_basket,
      'optimized_basket',
    );
  } catch (error) {
    context.errors.push(buildStepError(resolveFailedStep(context), error));
    const failedReport = buildFailedOrchestrationReport({
      normalized,
      context,
      run,
      run_status: 'failed',
    });
    if (!normalized.dry_run) {
      await upsertMealPlanShoppingRun(client, failedReport.run);
    }
    return failedReport;
  }

  const runStatus = determineMealPlanShoppingRunStatus(context);
  const completedRun = buildMealPlanShoppingRunRecord({
    user_id: run.user_id,
    profile_id: run.profile_id,
    plan_id: context.plan.plan_id,
    plan_key: context.plan.plan_key,
    requirement_id: context.requirement.requirement_id,
    net_requirement_id: context.net_requirement.net_requirement_id,
    candidate_set_id: context.candidate_set.candidate_set_id,
    optimized_basket_id: context.optimized_basket.optimized_basket_id,
    run_status: runStatus,
    summary_json: buildRunSummary({
      normalized,
      context,
      run_status: runStatus,
    }),
  });

  if (!normalized.dry_run) {
    await upsertMealPlanShoppingRun(client, completedRun);
  }

  return buildMealPlanShoppingOrchestrationReport({
    normalized,
    context,
    run: completedRun,
  });
}

async function loadExistingPlanReport(client, options = {}) {
  const plan = await getMealPlanForOrchestration(client, options);
  if (!plan) {
    throw new Error('Meal plan not found for PLAN2D orchestration.');
  }
  return {
    dry_run: Boolean(options.dry_run),
    plan,
    recipes_considered: null,
    recipes_filtered: null,
    plan_items_created: null,
    average_selection_score: null,
    daily_calorie_summary: [],
    macro_summary: {},
    items: [],
    errors: [],
  };
}

async function getMealPlanForOrchestration(client, options = {}) {
  const planId = nullableString(options.plan_id || options.planId);
  const planKey = nullableString(options.plan_key || options.planKey);
  if (planId) {
    const result = await client.query(
      'SELECT * FROM meal_plans WHERE plan_id = $1',
      [planId],
    );
    return result.rows[0] || null;
  }
  const result = await client.query(
    'SELECT * FROM meal_plans WHERE plan_key = $1',
    [requiredString(planKey, 'plan_key')],
  );
  return result.rows[0] || null;
}

function buildMealPlanShoppingOrchestrationReport({
  normalized,
  context,
  run,
}) {
  const summary = buildRunSummary({
    normalized,
    context,
    run_status: run.run_status,
  });
  return {
    dry_run: normalized.dry_run,
    run,
    runs_created: 1,
    plans_used_or_created: 1,
    requirements_created: context.requirement ? 1 : 0,
    net_requirements_created: context.net_requirement ? 1 : 0,
    candidate_sets_created: context.candidate_set ? 1 : 0,
    optimized_baskets_created: context.optimized_basket ? 1 : 0,
    total_estimated_price: summary.total_estimated_price,
    inventory_coverage_percent: summary.inventory_coverage_percent,
    missing_items_count: summary.missing_items_count,
    ready_items_count: summary.ready_items_count,
    run_status: run.run_status,
    plan_generated: context.plan_generated,
    ids: {
      plan_id: context.plan?.plan_id || null,
      plan_key: context.plan?.plan_key || null,
      requirement_id: context.requirement?.requirement_id || null,
      net_requirement_id: context.net_requirement?.net_requirement_id || null,
      candidate_set_id: context.candidate_set?.candidate_set_id || null,
      optimized_basket_id: context.optimized_basket?.optimized_basket_id || null,
    },
    coverage_breakdown: summary.coverage_breakdown,
    reports: context.reports,
    errors: context.errors,
  };
}

function buildFailedOrchestrationReport({
  normalized,
  context,
  run,
  run_status,
}) {
  const failedRun = run
    ? buildMealPlanShoppingRunRecord({
      user_id: run.user_id,
      profile_id: run.profile_id,
      plan_id: context.plan?.plan_id || run.plan_id || null,
      plan_key: context.plan?.plan_key || run.plan_key || null,
      requirement_id: context.requirement?.requirement_id || null,
      net_requirement_id: context.net_requirement?.net_requirement_id || null,
      candidate_set_id: context.candidate_set?.candidate_set_id || null,
      optimized_basket_id: context.optimized_basket?.optimized_basket_id || null,
      run_status,
      summary_json: buildRunSummary({
        normalized,
        context,
        run_status,
      }),
    })
    : null;

  return {
    dry_run: normalized.dry_run,
    run: failedRun,
    runs_created: failedRun ? 1 : 0,
    plans_used_or_created: context.plan ? 1 : 0,
    requirements_created: context.requirement ? 1 : 0,
    net_requirements_created: context.net_requirement ? 1 : 0,
    candidate_sets_created: context.candidate_set ? 1 : 0,
    optimized_baskets_created: context.optimized_basket ? 1 : 0,
    total_estimated_price: nullableNumber(context.optimized_basket?.total_estimated_price) || 0,
    inventory_coverage_percent: buildRunSummary({
      normalized,
      context,
      run_status,
    }).inventory_coverage_percent,
    missing_items_count: buildRunSummary({
      normalized,
      context,
      run_status,
    }).missing_items_count,
    ready_items_count: buildRunSummary({
      normalized,
      context,
      run_status,
    }).ready_items_count,
    run_status,
    plan_generated: context.plan_generated,
    ids: {
      plan_id: context.plan?.plan_id || null,
      plan_key: context.plan?.plan_key || null,
      requirement_id: context.requirement?.requirement_id || null,
      net_requirement_id: context.net_requirement?.net_requirement_id || null,
      candidate_set_id: context.candidate_set?.candidate_set_id || null,
      optimized_basket_id: context.optimized_basket?.optimized_basket_id || null,
    },
    coverage_breakdown: buildRunSummary({
      normalized,
      context,
      run_status,
    }).coverage_breakdown,
    reports: context.reports,
    errors: context.errors,
  };
}

function buildRunSummary({
  normalized,
  context,
  run_status,
}) {
  const totalRequiredGrams = nullableNumber(
    context.reports.net_requirements?.total_required_grams
      ?? context.reports.requirements?.total_quantity_grams,
  ) || 0;
  const inventoryAppliedGrams = nullableNumber(
    context.reports.net_requirements?.total_inventory_applied_grams,
  ) || 0;
  const totalNetGrams = nullableNumber(
    context.reports.net_requirements?.total_net_grams,
  ) || 0;
  const inventoryCoveragePercent = totalRequiredGrams > 0
    ? roundNumber((inventoryAppliedGrams / totalRequiredGrams) * 100)
    : 0;
  const optimizedStatusCounts = summarizeOptimizedItemStatuses(
    context.reports.optimized_basket?.items || [],
  );
  const candidateStatusCounts = summarizeCandidateStatuses(
    context.reports.candidate_set?.candidates || [],
  );
  const missingItemsCount = optimizedStatusCounts.total > 0
    ? (
      optimizedStatusCounts.missing_product
      + optimizedStatusCounts.missing_price
      + optimizedStatusCounts.optimizer_excluded
      + optimizedStatusCounts.needs_review
    )
    : (
      candidateStatusCounts.missing_product_mapping
      + candidateStatusCounts.missing_product_size
      + candidateStatusCounts.missing_price
      + candidateStatusCounts.needs_review
    );
  const readyItemsCount = optimizedStatusCounts.total > 0
    ? (optimizedStatusCounts.selected + optimizedStatusCounts.covered_by_inventory)
    : (candidateStatusCounts.ready_for_optimizer + candidateStatusCounts.covered_by_inventory);

  return {
    dry_run: normalized.dry_run,
    dry_run_scope: normalized.dry_run ? 'suppresses shopping-run persistence only' : 'full_persist',
    plan_generated: context.plan_generated,
    total_required_grams: totalRequiredGrams,
    inventory_applied_grams: inventoryAppliedGrams,
    total_net_grams: totalNetGrams,
    inventory_coverage_percent: inventoryCoveragePercent,
    total_estimated_price: nullableNumber(context.optimized_basket?.total_estimated_price) || 0,
    currency: nullableString(context.optimized_basket?.currency)
      || nullableString(context.reports.optimized_basket?.currency)
      || 'EUR',
    missing_items_count: missingItemsCount,
    ready_items_count: readyItemsCount,
    run_status,
    coverage_breakdown: {
      requirement_items_created: positiveInteger(context.reports.requirements?.items_created, 0),
      net_requirement_items_created: positiveInteger(context.reports.net_requirements?.items_created, 0),
      candidate_count: positiveInteger(context.reports.candidate_set?.candidates_created, 0),
      candidate_status_counts: candidateStatusCounts,
      optimized_item_status_counts: optimizedStatusCounts,
    },
    errors: context.errors,
  };
}

function determineMealPlanShoppingRunStatus(context) {
  const optimizedBasket = context.optimized_basket;
  if (!optimizedBasket) {
    return 'failed';
  }

  const missingItems = summarizeOptimizedItemStatuses(
    context.reports.optimized_basket?.items || [],
  );
  const hasMissingRows = (
    missingItems.missing_product > 0
    || missingItems.missing_price > 0
    || missingItems.optimizer_excluded > 0
    || missingItems.needs_review > 0
  );
  const coveredCount = positiveInteger(optimizedBasket.covered_requirement_count, 0);
  const missingCount = positiveInteger(optimizedBasket.missing_requirement_count, 0);
  const majorityResolved = coveredCount > missingCount;
  if (hasMissingRows) {
    return 'partial';
  }
  return majorityResolved ? 'completed' : 'partial';
}

async function upsertMealPlanShoppingRun(client, run) {
  const result = await client.query(`
    INSERT INTO meal_plan_shopping_runs (
      run_id,
      user_id,
      profile_id,
      plan_id,
      plan_key,
      requirement_id,
      net_requirement_id,
      candidate_set_id,
      optimized_basket_id,
      run_key,
      run_status,
      summary_json,
      generation_method,
      rules_version
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12::jsonb, $13, $14
    )
    ON CONFLICT (run_key) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      profile_id = EXCLUDED.profile_id,
      plan_id = EXCLUDED.plan_id,
      plan_key = EXCLUDED.plan_key,
      requirement_id = EXCLUDED.requirement_id,
      net_requirement_id = EXCLUDED.net_requirement_id,
      candidate_set_id = EXCLUDED.candidate_set_id,
      optimized_basket_id = EXCLUDED.optimized_basket_id,
      run_status = EXCLUDED.run_status,
      summary_json = EXCLUDED.summary_json,
      generation_method = EXCLUDED.generation_method,
      rules_version = EXCLUDED.rules_version,
      updated_at = NOW()
    RETURNING *
  `, [
    run.run_id,
    run.user_id,
    run.profile_id,
    run.plan_id,
    run.plan_key,
    run.requirement_id,
    run.net_requirement_id,
    run.candidate_set_id,
    run.optimized_basket_id,
    run.run_key,
    run.run_status,
    JSON.stringify(run.summary_json || {}),
    run.generation_method,
    run.rules_version,
  ]);
  return hydrateMealPlanShoppingRunRow(result.rows[0]);
}

function buildMealPlanShoppingRunRecord({
  user_id,
  profile_id,
  plan_id,
  plan_key,
  requirement_id,
  net_requirement_id,
  candidate_set_id,
  optimized_basket_id,
  run_status,
  summary_json,
}) {
  const runKey = buildMealPlanShoppingRunKey(
    requiredString(user_id, 'user_id'),
    requiredString(plan_key, 'plan_key'),
    MEAL_PLAN_SHOPPING_ORCHESTRATION_RULES_VERSION,
  );
  return {
    run_id: buildMealPlanShoppingRunId(runKey),
    user_id: requiredString(user_id, 'user_id'),
    profile_id: requiredString(profile_id, 'profile_id'),
    plan_id: nullableString(plan_id),
    plan_key: requiredString(plan_key, 'plan_key'),
    requirement_id: nullableString(requirement_id),
    net_requirement_id: nullableString(net_requirement_id),
    candidate_set_id: nullableString(candidate_set_id),
    optimized_basket_id: nullableString(optimized_basket_id),
    run_key: runKey,
    run_status: requiredRunStatus(run_status),
    summary_json: summary_json || {},
    generation_method: MEAL_PLAN_SHOPPING_ORCHESTRATION_GENERATION_METHOD,
    rules_version: MEAL_PLAN_SHOPPING_ORCHESTRATION_RULES_VERSION,
  };
}

function buildMealPlanShoppingRunKey(userId, planKey, rulesVersion) {
  return `meal_plan_shopping_run:${stableHash([
    requiredString(userId, 'user_id'),
    requiredString(planKey, 'plan_key'),
    requiredString(rulesVersion, 'rules_version'),
  ].join('|'))}`;
}

function buildMealPlanShoppingRunId(runKey) {
  return `meal_plan_shopping_run:${stableHash(requiredString(runKey, 'run_key'))}`;
}

function hydrateMealPlanShoppingRunRow(row) {
  if (!row) return null;
  return {
    ...row,
    summary_json: parseJson(row.summary_json, {}),
  };
}

function normalizeMealPlanShoppingOrchestrationOptions(options = {}) {
  const planId = nullableString(options.planId || options.plan_id);
  const planKey = nullableString(options.planKey || options.plan_key);
  const profileId = nullableString(options.profileId || options.profile_id);
  const userId = nullableString(options.userId || options.user_id);
  if (!planId && !planKey && !profileId && !userId) {
    throw new Error('plan_id, plan_key, profile_id, or user_id is required for PLAN2D orchestration.');
  }
  return {
    plan_id: planId,
    plan_key: planKey,
    profile_id: profileId,
    user_id: userId,
    start_date: normalizeDateString(options.startDate || options.start_date || new Date().toISOString().slice(0, 10)),
    days: positiveInteger(options.days, DEFAULT_MEAL_PLAN_DAYS),
    meals_per_day: positiveInteger(options.mealsPerDay || options.meals_per_day, DEFAULT_MEALS_PER_DAY),
    dry_run: Boolean(options.dryRun || options.dry_run),
    store: options.store || null,
    orchestration_adapter: options.orchestrationAdapter || options.orchestration_adapter || null,
  };
}

function resolveMealPlanShoppingOrchestrationAdapter(adapter) {
  const resolved = adapter && typeof adapter === 'object'
    ? adapter
    : {
      generateMealPlan,
      buildMealPlanRequirements,
      buildMealPlanNetRequirements,
      buildMealPlanProductCandidateSet,
      optimizeMealPlanBasket,
    };
  for (const methodName of [
    'generateMealPlan',
    'buildMealPlanRequirements',
    'buildMealPlanNetRequirements',
    'buildMealPlanProductCandidateSet',
    'optimizeMealPlanBasket',
  ]) {
    if (typeof resolved[methodName] !== 'function') {
      throw new Error(`orchestration adapter must provide ${methodName}`);
    }
  }
  return resolved;
}

function resolveFailedStep(context) {
  if (!context.reports.requirements) return 'requirements';
  if (!context.reports.net_requirements) return 'net_requirements';
  if (!context.reports.candidate_set) return 'candidate_set';
  if (!context.reports.optimized_basket) return 'optimized_basket';
  return 'unknown';
}

function buildStepError(step, error) {
  return {
    step,
    message: error && error.message ? error.message : String(error),
  };
}

function summarizeCandidateStatuses(candidates = []) {
  return (candidates || []).reduce((counts, candidate) => {
    const key = nullableString(candidate.candidate_status) || 'needs_review';
    counts[key] = (counts[key] || 0) + 1;
    counts.total += 1;
    return counts;
  }, {
    ready_for_optimizer: 0,
    covered_by_inventory: 0,
    missing_product_mapping: 0,
    missing_product_size: 0,
    missing_price: 0,
    needs_review: 0,
    total: 0,
  });
}

function summarizeOptimizedItemStatuses(items = []) {
  return (items || []).reduce((counts, item) => {
    const key = nullableString(item.item_status) || 'needs_review';
    counts[key] = (counts[key] || 0) + 1;
    counts.total += 1;
    return counts;
  }, {
    selected: 0,
    covered_by_inventory: 0,
    missing_product: 0,
    missing_price: 0,
    optimizer_excluded: 0,
    needs_review: 0,
    total: 0,
  });
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

function normalizeDateString(value) {
  const normalized = requiredString(value, 'start_date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`start_date must be YYYY-MM-DD: ${value}`);
  }
  return normalized;
}

function positiveInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function requiredObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} is required.`);
  }
  return value;
}

function requiredRunStatus(value) {
  const normalized = requiredString(value, 'run_status');
  if (!SUPPORTED_MEAL_PLAN_SHOPPING_RUN_STATUSES.includes(normalized)) {
    throw new Error(`Unsupported run_status: ${value}`);
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
  MEAL_PLAN_SHOPPING_ORCHESTRATION_GENERATION_METHOD,
  MEAL_PLAN_SHOPPING_ORCHESTRATION_RULES_VERSION,
  SUPPORTED_MEAL_PLAN_SHOPPING_RUN_STATUSES,
  buildMealPlanShoppingRunId,
  buildMealPlanShoppingRunKey,
  buildMealPlanShoppingRunRecord,
  determineMealPlanShoppingRunStatus,
  hydrateMealPlanShoppingRunRow,
  normalizeMealPlanShoppingOrchestrationOptions,
  resolveMealPlanShoppingOrchestrationAdapter,
  runMealPlanShoppingOrchestration,
};
