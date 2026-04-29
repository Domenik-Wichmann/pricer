const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MEAL_PLAN_SHOPPING_ORCHESTRATION_RULES_VERSION,
  buildMealPlanShoppingRunKey,
  normalizeMealPlanShoppingOrchestrationOptions,
  runMealPlanShoppingOrchestration,
} = require('../app/functions/src');
const { parseArgs } = require('../scripts/plan2d_run_meal_plan_shopping');

function makeFixtureClient() {
  const state = buildFixtureState();
  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });

      if (normalizedSql === 'SELECT * FROM meal_plans WHERE plan_id = $1') {
        return { rows: state.planById.get(params[0]) ? [state.planById.get(params[0])] : [] };
      }
      if (normalizedSql === 'SELECT * FROM meal_plans WHERE plan_key = $1') {
        return { rows: state.planByKey.get(params[0]) ? [state.planByKey.get(params[0])] : [] };
      }
      if (normalizedSql.startsWith('INSERT INTO meal_plan_shopping_runs')) {
        const row = shoppingRunFromParams(params);
        const existing = state.runsByKey.get(row.run_key);
        const stored = {
          ...(existing || {}),
          ...row,
          run_id: existing ? existing.run_id : row.run_id,
          created_at: existing ? existing.created_at : '2026-04-25T15:00:00.000Z',
          updated_at: '2026-04-25T15:30:00.000Z',
        };
        state.runsByKey.set(stored.run_key, stored);
        return { rows: [stored] };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function buildFixtureState() {
  const existingPlan = {
    plan_id: 'meal_plan:existing',
    plan_key: 'meal_plan:existing:key',
    profile_id: 'user_food_profile:user_demo',
    user_id: 'user_demo',
    start_date: '2026-04-28',
    days: 7,
    meals_per_day: 3,
  };
  return {
    existingPlan,
    planById: new Map([[existingPlan.plan_id, existingPlan]]),
    planByKey: new Map([[existingPlan.plan_key, existingPlan]]),
    runsByKey: new Map(),
    commands: [],
  };
}

function shoppingRunFromParams(params) {
  return {
    run_id: params[0],
    user_id: params[1],
    profile_id: params[2],
    plan_id: params[3],
    plan_key: params[4],
    requirement_id: params[5],
    net_requirement_id: params[6],
    candidate_set_id: params[7],
    optimized_basket_id: params[8],
    run_key: params[9],
    run_status: params[10],
    summary_json: JSON.parse(params[11]),
    generation_method: params[12],
    rules_version: params[13],
  };
}

function makeCompleteReports(plan) {
  return {
    plan: {
      dry_run: false,
      plan,
      errors: [],
    },
    requirements: {
      requirement: {
        requirement_id: 'meal_plan_requirement:demo',
        plan_id: plan.plan_id,
        profile_id: plan.profile_id,
        user_id: plan.user_id,
        requirement_key: 'meal_plan_requirement:demo:key',
      },
      items_created: 2,
      total_quantity_grams: 1000,
      ready_for_product_mapping: 2,
      missing_ingredient: 0,
      missing_quantity: 0,
      needs_review: 0,
      errors: [],
    },
    net_requirements: {
      net_requirement: {
        net_requirement_id: 'meal_plan_net_requirement:demo',
        requirement_id: 'meal_plan_requirement:demo',
        plan_id: plan.plan_id,
        profile_id: plan.profile_id,
        user_id: plan.user_id,
        net_requirement_key: 'meal_plan_net_requirement:demo:key',
      },
      items_created: 2,
      total_required_grams: 1000,
      total_inventory_applied_grams: 250,
      total_net_grams: 750,
      fully_covered: 0,
      partially_covered: 1,
      no_inventory: 1,
      missing_ingredient: 0,
      missing_quantity: 0,
      ready_for_product_mapping: 2,
      covered_by_inventory: 0,
      errors: [],
    },
    candidate_set: {
      candidate_set: {
        candidate_set_id: 'meal_plan_product_candidate_set:demo',
        net_requirement_id: 'meal_plan_net_requirement:demo',
        plan_id: plan.plan_id,
        profile_id: plan.profile_id,
        user_id: plan.user_id,
        candidate_set_key: 'meal_plan_product_candidate_set:demo:key',
      },
      requirement_items_seen: 2,
      candidates_created: 2,
      covered_by_inventory: 0,
      missing_product_mapping: 0,
      missing_product_size: 0,
      missing_price: 0,
      ready_for_optimizer: 2,
      total_required_grams: 750,
      total_estimated_price_min: 8.1,
      total_estimated_price_max: 8.1,
      candidates: [
        { candidate_id: 'candidate:1', candidate_status: 'ready_for_optimizer' },
        { candidate_id: 'candidate:2', candidate_status: 'ready_for_optimizer' },
      ],
      errors: [],
    },
    optimized_basket: {
      optimized_basket: {
        optimized_basket_id: 'meal_plan_optimized_basket:demo',
        candidate_set_id: 'meal_plan_product_candidate_set:demo',
        net_requirement_id: 'meal_plan_net_requirement:demo',
        plan_id: plan.plan_id,
        profile_id: plan.profile_id,
        user_id: plan.user_id,
        optimizer_run_key: 'meal_plan_optimizer_run:demo',
        total_estimated_price: 8.1,
        currency: 'EUR',
        covered_requirement_count: 2,
        missing_requirement_count: 0,
      },
      ready_candidates: 2,
      covered_by_inventory: 0,
      missing_product: 0,
      missing_price: 0,
      optimizer_excluded: 0,
      needs_review: 0,
      selected_items: 2,
      total_estimated_price: 8.1,
      currency: 'EUR',
      items: [
        { item_status: 'selected' },
        { item_status: 'selected' },
      ],
      errors: [],
    },
  };
}

function makePartialReports(plan) {
  const base = makeCompleteReports(plan);
  return {
    ...base,
    candidate_set: {
      ...base.candidate_set,
      candidates_created: 2,
      missing_product_mapping: 1,
      ready_for_optimizer: 1,
      candidates: [
        { candidate_id: 'candidate:1', candidate_status: 'ready_for_optimizer' },
        { candidate_id: 'candidate:2', candidate_status: 'missing_product_mapping' },
      ],
    },
    optimized_basket: {
      ...base.optimized_basket,
      optimized_basket: {
        ...base.optimized_basket.optimized_basket,
        total_estimated_price: 4.2,
        covered_requirement_count: 1,
        missing_requirement_count: 1,
      },
      missing_product: 1,
      selected_items: 1,
      total_estimated_price: 4.2,
      items: [
        { item_status: 'selected' },
        { item_status: 'missing_product' },
      ],
    },
  };
}

function makeAdapter(reports, calls) {
  return {
    async generateMealPlan(_client, options) {
      calls.push({ step: 'plan', options });
      return reports.plan;
    },
    async buildMealPlanRequirements(_client, options) {
      calls.push({ step: 'requirements', options });
      return reports.requirements;
    },
    async buildMealPlanNetRequirements(_client, options) {
      calls.push({ step: 'net', options });
      return reports.net_requirements;
    },
    async buildMealPlanProductCandidateSet(_client, options) {
      calls.push({ step: 'candidates', options });
      return reports.candidate_set;
    },
    async optimizeMealPlanBasket(_client, options) {
      calls.push({ step: 'optimize', options });
      return reports.optimized_basket;
    },
  };
}

async function run() {
  await testFullPipelineWithExistingPlan();
  await testFullPipelineWithGeneratedPlan();
  await testPartialRunWithMissingProductMappings();
  await testIdempotentRunKeyBehavior();
  await testNormalizationAndCliArgs();
  await testSourceKeepsAdapterBoundary();
  console.log('PLAN2D meal-plan shopping orchestrator tests passed');
}

async function testFullPipelineWithExistingPlan() {
  const client = makeFixtureClient();
  const plan = client.state.existingPlan;
  const reports = makeCompleteReports(plan);
  const calls = [];
  const store = { name: 'runtime_store' };

  const report = await runMealPlanShoppingOrchestration(client, {
    planId: plan.plan_id,
    store,
    orchestrationAdapter: makeAdapter(reports, calls),
  });

  assert.equal(report.run_status, 'completed');
  assert.equal(report.plan_generated, false);
  assert.equal(report.ids.plan_id, plan.plan_id);
  assert.equal(report.ids.requirement_id, reports.requirements.requirement.requirement_id);
  assert.equal(report.ids.net_requirement_id, reports.net_requirements.net_requirement.net_requirement_id);
  assert.equal(report.ids.candidate_set_id, reports.candidate_set.candidate_set.candidate_set_id);
  assert.equal(report.ids.optimized_basket_id, reports.optimized_basket.optimized_basket.optimized_basket_id);
  assert.equal(report.total_estimated_price, 8.1);
  assert.equal(report.inventory_coverage_percent, 25);
  assert.equal(report.missing_items_count, 0);
  assert.equal(report.ready_items_count, 2);
  assert.deepEqual(
    calls.map((entry) => entry.step),
    ['requirements', 'net', 'candidates', 'optimize'],
  );
  assert.equal(calls[0].options.planId, plan.plan_id);
  assert.equal(calls[1].options.requirementId, reports.requirements.requirement.requirement_id);
  assert.equal(calls[2].options.netRequirementId, reports.net_requirements.net_requirement.net_requirement_id);
  assert.equal(calls[2].options.store, store);
  assert.equal(calls[3].options.candidateSetId, reports.candidate_set.candidate_set.candidate_set_id);
  assert.equal(calls[3].options.store, store);

  const expectedRunKey = buildMealPlanShoppingRunKey(
    plan.user_id,
    plan.plan_key,
    MEAL_PLAN_SHOPPING_ORCHESTRATION_RULES_VERSION,
  );
  assert.equal(report.run.run_key, expectedRunKey);
  assert.equal(client.state.runsByKey.size, 1);
  assert.equal(client.state.runsByKey.get(expectedRunKey).run_status, 'completed');
}

async function testFullPipelineWithGeneratedPlan() {
  const client = makeFixtureClient();
  const generatedPlan = {
    plan_id: 'meal_plan:generated',
    plan_key: 'meal_plan:generated:key',
    profile_id: 'user_food_profile:user_demo',
    user_id: 'user_demo',
    start_date: '2026-05-05',
    days: 7,
    meals_per_day: 3,
  };
  const reports = makeCompleteReports(generatedPlan);
  const calls = [];

  const report = await runMealPlanShoppingOrchestration(client, {
    profileId: generatedPlan.profile_id,
    startDate: generatedPlan.start_date,
    store: { name: 'runtime_store' },
    orchestrationAdapter: makeAdapter(reports, calls),
  });

  assert.equal(report.run_status, 'completed');
  assert.equal(report.plan_generated, true);
  assert.equal(report.ids.plan_id, generatedPlan.plan_id);
  assert.deepEqual(
    calls.map((entry) => entry.step),
    ['plan', 'requirements', 'net', 'candidates', 'optimize'],
  );
  assert.equal(calls[0].options.profileId, generatedPlan.profile_id);
  assert.equal(calls[0].options.startDate, generatedPlan.start_date);
  assert.equal(calls[1].options.planId, generatedPlan.plan_id);
}

async function testPartialRunWithMissingProductMappings() {
  const client = makeFixtureClient();
  const plan = client.state.existingPlan;
  const reports = makePartialReports(plan);

  const report = await runMealPlanShoppingOrchestration(client, {
    planKey: plan.plan_key,
    store: { name: 'runtime_store' },
    orchestrationAdapter: makeAdapter(reports, []),
  });

  assert.equal(report.run_status, 'partial');
  assert.equal(report.total_estimated_price, 4.2);
  assert.equal(report.missing_items_count, 1);
  assert.equal(report.ready_items_count, 1);
  assert.equal(report.coverage_breakdown.optimized_item_status_counts.missing_product, 1);
}

async function testIdempotentRunKeyBehavior() {
  const client = makeFixtureClient();
  const plan = client.state.existingPlan;
  const reports = makeCompleteReports(plan);
  const adapter = makeAdapter(reports, []);

  const first = await runMealPlanShoppingOrchestration(client, {
    planId: plan.plan_id,
    store: { name: 'runtime_store' },
    orchestrationAdapter: adapter,
  });
  const second = await runMealPlanShoppingOrchestration(client, {
    planId: plan.plan_id,
    store: { name: 'runtime_store' },
    orchestrationAdapter: adapter,
  });

  assert.equal(first.run.run_key, second.run.run_key);
  assert.equal(first.run.run_id, second.run.run_id);
  assert.equal(client.state.runsByKey.size, 1);
}

async function testNormalizationAndCliArgs() {
  assert.throws(
    () => normalizeMealPlanShoppingOrchestrationOptions({}),
    /plan_id, plan_key, profile_id, or user_id is required/,
  );

  const normalized = normalizeMealPlanShoppingOrchestrationOptions({
    planId: 'meal_plan:demo',
    dryRun: true,
    days: 10,
    mealsPerDay: 4,
  });
  assert.equal(normalized.plan_id, 'meal_plan:demo');
  assert.equal(normalized.dry_run, true);
  assert.equal(normalized.days, 10);
  assert.equal(normalized.meals_per_day, 4);

  assert.deepEqual(parseArgs([
    '--user-id=user_demo',
    '--profile-id=user_food_profile:user_demo',
    '--plan-id=meal_plan:demo',
    '--plan-key=meal_plan:demo:key',
    '--start-date=2026-05-05',
    '--days=5',
    '--meals-per-day=2',
    '--dry-run',
    '--json',
    '--out=tmp/plan2d.json',
  ]), {
    userId: 'user_demo',
    profileId: 'user_food_profile:user_demo',
    planId: 'meal_plan:demo',
    planKey: 'meal_plan:demo:key',
    startDate: '2026-05-05',
    days: 5,
    mealsPerDay: 2,
    dryRun: true,
    json: true,
    out: 'tmp/plan2d.json',
  });
}

async function testSourceKeepsAdapterBoundary() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'src', 'db', 'planner', 'meal_plan_shopping_orchestrator.js'),
    'utf8',
  );
  assert.match(source, /buildMealPlanProductCandidateSet/);
  assert.match(source, /optimizeMealPlanBasket/);
  assert.doesNotMatch(source, /optimizeBasketSingleStore/);
  assert.doesNotMatch(source, /optimizeBasketMultiStore/);
  assert.doesNotMatch(source, /lookupCanonicalProductPrices/);
  assert.doesNotMatch(source, /firebase|firestore/i);
  assert.doesNotMatch(source, /llm|openai|grok/i);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
