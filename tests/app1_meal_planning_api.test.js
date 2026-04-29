const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getMealPlanDetail,
  getMealPlanOptimizedBasketDetail,
  getMealPlanShoppingRunDetail,
  handleGenerateMealPlanRequest,
  handleGetMealPlanOptimizedBasketRequest,
  handleGetMealPlanRequest,
  handleGetMealPlanShoppingRunRequest,
  handleRunMealPlanShoppingRequest,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({name, fn});
}

class FakePgClient {
  constructor(fixtures = {}) {
    this.fixtures = fixtures;
    this.queries = [];
  }

  async query(sql, params = []) {
    const text = String(sql || '').replace(/\s+/gu, ' ').trim();
    this.queries.push({text, params});

    if (text === 'SELECT * FROM meal_plans WHERE plan_id = $1') {
      return {
        rows: maybeArray(this.fixtures.planRowsById?.[params[0]]),
      };
    }

    if (text.includes('FROM meal_plan_items mpi')) {
      return {
        rows: this.fixtures.planItemRowsByPlanId?.[params[0]] || [],
      };
    }

    if (text === 'SELECT * FROM meal_plan_shopping_runs WHERE run_id = $1') {
      return {
        rows: maybeArray(this.fixtures.runRowsById?.[params[0]]),
      };
    }

    if (text === 'SELECT * FROM meal_plan_optimized_baskets WHERE optimized_basket_id = $1') {
      return {
        rows: maybeArray(this.fixtures.basketRowsById?.[params[0]]),
      };
    }

    if (text.includes('FROM meal_plan_optimized_basket_items')) {
      return {
        rows: this.fixtures.basketItemRowsByBasketId?.[params[0]] || [],
      };
    }

    throw new Error(`Unhandled SQL in fake client: ${text}`);
  }
}

function maybeArray(row) {
  return row ? [row] : [];
}

function createFixtures() {
  return {
    planRowsById: {
      meal_plan_1: {
        plan_id: 'meal_plan_1',
        profile_id: 'profile_1',
        user_id: 'user_1',
        plan_key: 'meal_plan:key_1',
        start_date: '2026-04-29',
        days: 7,
        meals_per_day: 3,
        target_calories_per_day: 2100,
        target_protein_g: 150,
        target_carbs_g: 180,
        target_fat_g: 70,
        generation_method: 'plan1_deterministic_meal_planner_v1',
        rules_version: 'plan1_meal_planner_rules_v1',
      },
    },
    planItemRowsByPlanId: {
      meal_plan_1: [
        {
          item_id: 'meal_plan_item_1',
          plan_id: 'meal_plan_1',
          day_index: 0,
          meal_type: 'breakfast',
          recipe_id: 'recipe_1',
          recipe_key_snapshot: 'chicken_rice_bowl',
          calories: 520,
          protein_g: 34,
          carbs_g: 48,
          fat_g: 16,
          selection_score: 0.882,
          selection_reason_json: JSON.stringify({
            taste_score: 0.9,
            nutrition_score: 0.82,
          }),
          recipe_key: 'chicken_rice_bowl',
          title_en: 'Chicken Rice Bowl',
          title_bg: 'Купа с пиле и ориз',
          canonical_title: 'Chicken Rice Bowl',
          description: 'Simple bowl.',
          usability_status: 'usable',
          recipe_review_status: 'active',
          servings: 2,
        },
        {
          item_id: 'meal_plan_item_2',
          plan_id: 'meal_plan_1',
          day_index: 0,
          meal_type: 'lunch',
          recipe_id: 'recipe_2',
          recipe_key_snapshot: 'tomato_cucumber_salad',
          calories: 260,
          protein_g: 8,
          carbs_g: 20,
          fat_g: 12,
          selection_score: 0.801,
          selection_reason_json: JSON.stringify({
            taste_score: 0.78,
            nutrition_score: 0.76,
          }),
          recipe_key: 'tomato_cucumber_salad',
          title_en: 'Tomato Cucumber Salad',
          title_bg: 'Салата домати и краставици',
          canonical_title: 'Tomato Cucumber Salad',
          description: 'Fresh salad.',
          usability_status: 'usable',
          recipe_review_status: 'active',
          servings: 2,
        },
      ],
    },
    runRowsById: {
      run_1: {
        run_id: 'run_1',
        user_id: 'user_1',
        profile_id: 'profile_1',
        plan_id: 'meal_plan_1',
        plan_key: 'meal_plan:key_1',
        requirement_id: 'req_1',
        net_requirement_id: 'net_req_1',
        candidate_set_id: 'candidate_set_1',
        optimized_basket_id: 'basket_1',
        run_key: 'run_key_1',
        run_status: 'partial',
        summary_json: JSON.stringify({
          total_required_grams: 1400,
          inventory_coverage_percent: 25,
          total_estimated_price: 18.5,
          missing_items_count: 1,
          ready_items_count: 3,
        }),
      },
    },
    basketRowsById: {
      basket_1: {
        optimized_basket_id: 'basket_1',
        candidate_set_id: 'candidate_set_1',
        net_requirement_id: 'net_req_1',
        plan_id: 'meal_plan_1',
        profile_id: 'profile_1',
        user_id: 'user_1',
        optimizer_run_key: 'optimizer_run_1',
        optimizer_version: 'phase16_basket_optimizer_v1',
        total_estimated_price: 18.5,
        currency: 'EUR',
        selected_chain_id: 'lidl',
        selected_store_id: 'lidl::sofia-center',
        item_count: 3,
        covered_requirement_count: 2,
        missing_requirement_count: 1,
        optimizer_summary_json: JSON.stringify({
          selected_strategy: 'multi_store',
        }),
      },
    },
    basketItemRowsByBasketId: {
      basket_1: [
        {
          optimized_basket_item_id: 'basket_item_selected',
          optimized_basket_id: 'basket_1',
          candidate_id: 'candidate_1',
          net_requirement_item_id: 'net_item_1',
          ingredient_id: 'ingredient_rice',
          ingredient_key_snapshot: 'rice',
          display_name: 'Rice',
          product_id: 'cp_rice',
          product_name_snapshot: 'Rice 1kg',
          brand: 'Store Brand',
          chain_id: 'lidl',
          store_id: 'lidl::sofia-center',
          price_id: 'price_rice',
          units_selected: 1,
          total_purchased_grams: 1000,
          required_quantity_grams: 600,
          overage_grams: 400,
          unit_price: 3.2,
          total_price: 3.2,
          currency: 'EUR',
          selection_reason_json: JSON.stringify({
            item_status: 'selected',
          }),
          item_status: 'selected',
        },
        {
          optimized_basket_item_id: 'basket_item_inventory',
          optimized_basket_id: 'basket_1',
          candidate_id: null,
          net_requirement_item_id: 'net_item_2',
          ingredient_id: 'ingredient_chicken',
          ingredient_key_snapshot: 'chicken_breast',
          display_name: 'Chicken Breast',
          product_id: null,
          product_name_snapshot: null,
          brand: null,
          chain_id: null,
          store_id: null,
          price_id: null,
          units_selected: null,
          total_purchased_grams: 0,
          required_quantity_grams: 300,
          overage_grams: 0,
          unit_price: null,
          total_price: null,
          currency: 'EUR',
          selection_reason_json: JSON.stringify({
            item_status: 'covered_by_inventory',
          }),
          item_status: 'covered_by_inventory',
        },
        {
          optimized_basket_item_id: 'basket_item_missing',
          optimized_basket_id: 'basket_1',
          candidate_id: 'candidate_3',
          net_requirement_item_id: 'net_item_3',
          ingredient_id: 'ingredient_soy_sauce',
          ingredient_key_snapshot: 'soy_sauce',
          display_name: 'Soy Sauce',
          product_id: null,
          product_name_snapshot: null,
          brand: null,
          chain_id: null,
          store_id: null,
          price_id: null,
          units_selected: null,
          total_purchased_grams: null,
          required_quantity_grams: 120,
          overage_grams: null,
          unit_price: null,
          total_price: null,
          currency: 'EUR',
          selection_reason_json: JSON.stringify({
            item_status: 'missing_product',
          }),
          item_status: 'missing_product',
        },
      ],
    },
  };
}

test('POST generate meal plan returns generated plan detail', async () => {
  const fixtures = createFixtures();
  const client = new FakePgClient(fixtures);
  const calls = [];
  const response = await handleGenerateMealPlanRequest({
    client,
    body: {
      profile_id: 'profile_1',
      start_date: '2026-04-29',
      days: 7,
      meals_per_day: 3,
    },
    api_adapter: {
      async generateMealPlan(dbClient, options) {
        calls.push({dbClient, options});
        return {
          dry_run: false,
          plan: fixtures.planRowsById.meal_plan_1,
          recipes_considered: 12,
          recipes_filtered: 4,
          plan_items_created: 2,
          average_selection_score: 0.842,
          daily_calorie_summary: [],
          macro_summary: {
            total_calories: 780,
          },
          items: [],
          errors: [],
        };
      },
      async runMealPlanShoppingOrchestration() {
        throw new Error('unexpected orchestrator call');
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.profileId, 'profile_1');
  assert.equal(response.body.plan.plan_id, 'meal_plan_1');
  assert.equal(response.body.items.length, 2);
  assert.equal(response.body.items[0].recipe_snapshot.title_en, 'Chicken Rice Bowl');
  assert.equal(response.body.generation_report.recipes_considered, 12);
});

test('GET meal plan detail returns plan items and recipe snapshots', async () => {
  const client = new FakePgClient(createFixtures());
  const response = await handleGetMealPlanRequest({
    client,
    params: {
      planId: 'meal_plan_1',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.plan.plan_key, 'meal_plan:key_1');
  assert.equal(response.body.items.length, 2);
  assert.equal(response.body.items[0].recipe_snapshot.recipe_key, 'chicken_rice_bowl');
  assert.equal(response.body.summary.total_calories, 780);
  assert.equal(response.body.summary.item_count, 2);
});

test('POST shopping run calls PLAN2D using existing plan', async () => {
  const fixtures = createFixtures();
  const client = new FakePgClient(fixtures);
  const store = {
    async load() {
      return {};
    },
  };
  const calls = [];
  const response = await handleRunMealPlanShoppingRequest({
    client,
    store,
    params: {
      planId: 'meal_plan_1',
    },
    body: {},
    api_adapter: {
      async generateMealPlan() {
        throw new Error('unexpected plan generation');
      },
      async runMealPlanShoppingOrchestration(dbClient, options) {
        calls.push({dbClient, options});
        return {
          dry_run: false,
          run_status: 'partial',
          total_estimated_price: 18.5,
          inventory_coverage_percent: 25,
          missing_items_count: 1,
          ready_items_count: 3,
          ids: {
            plan_id: 'meal_plan_1',
            plan_key: 'meal_plan:key_1',
            requirement_id: 'req_1',
            net_requirement_id: 'net_req_1',
            candidate_set_id: 'candidate_set_1',
            optimized_basket_id: 'basket_1',
          },
          run: {
            run_id: 'run_1',
            plan_id: 'meal_plan_1',
            plan_key: 'meal_plan:key_1',
            requirement_id: 'req_1',
            net_requirement_id: 'net_req_1',
            candidate_set_id: 'candidate_set_1',
            optimized_basket_id: 'basket_1',
            run_status: 'partial',
            summary_json: fixtures.runRowsById.run_1.summary_json,
          },
          errors: [],
        };
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.planId, 'meal_plan_1');
  assert.equal(calls[0].options.store, store);
  assert.equal(response.body.run.run_id, 'run_1');
  assert.equal(response.body.artifact_ids.optimized_basket_id, 'basket_1');
  assert.equal(response.body.orchestration_report.run_status, 'partial');
});

test('GET shopping run detail returns summary and linked artifact ids', async () => {
  const client = new FakePgClient(createFixtures());
  const response = await handleGetMealPlanShoppingRunRequest({
    client,
    params: {
      runId: 'run_1',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.run.run_status, 'partial');
  assert.equal(response.body.artifact_ids.requirement_id, 'req_1');
  assert.equal(response.body.summary.total_estimated_price, 18.5);
});

test('GET optimized basket detail returns basket items including missing and covered rows', async () => {
  const client = new FakePgClient(createFixtures());
  const response = await handleGetMealPlanOptimizedBasketRequest({
    client,
    params: {
      basketId: 'basket_1',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.optimized_basket.optimized_basket_id, 'basket_1');
  assert.equal(response.body.items.length, 3);
  assert.equal(response.body.summary.item_status_counts.selected, 1);
  assert.equal(response.body.summary.item_status_counts.covered_by_inventory, 1);
  assert.equal(response.body.summary.item_status_counts.missing_product, 1);
});

test('missing ids return expected errors', async () => {
  const client = new FakePgClient(createFixtures());
  const missingPlan = await handleGetMealPlanRequest({
    client,
    params: {
      planId: 'missing_plan',
    },
  });
  const missingRun = await handleGetMealPlanShoppingRunRequest({
    client,
    params: {
      runId: 'missing_run',
    },
  });
  const missingBasket = await handleGetMealPlanOptimizedBasketRequest({
    client,
    params: {
      basketId: 'missing_basket',
    },
  });
  const missingProfile = await handleGenerateMealPlanRequest({
    client,
    body: {},
  });

  assert.equal(missingPlan.status, 404);
  assert.equal(missingPlan.body.error, 'meal plan not found');
  assert.equal(missingRun.status, 404);
  assert.equal(missingRun.body.error, 'meal plan shopping run not found');
  assert.equal(missingBasket.status, 404);
  assert.equal(missingBasket.body.error, 'meal plan optimized basket not found');
  assert.equal(missingProfile.status, 400);
  assert.equal(missingProfile.body.error, 'profile_id or user_id is required');
});

test('detail helpers return null for missing rows', async () => {
  const client = new FakePgClient(createFixtures());
  const plan = await getMealPlanDetail(client, {planId: 'missing_plan'});
  const run = await getMealPlanShoppingRunDetail(client, {runId: 'missing_run'});
  const basket = await getMealPlanOptimizedBasketDetail(client, {basketId: 'missing_basket'});

  assert.equal(plan, null);
  assert.equal(run, null);
  assert.equal(basket, null);
});

test('meal planning API reuses PLAN1 and PLAN2D handlers without new optimizer logic or Firestore writes', async () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'src', 'api', 'meal_planning_api.js'),
    'utf8',
  );
  const routeSource = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'index.js'),
    'utf8',
  );

  assert.match(source, /generateMealPlan/);
  assert.match(source, /runMealPlanShoppingOrchestration/);
  assert.doesNotMatch(source, /optimizeBasketSingleStore|optimizeBasketMultiStore|buildMealPlanRequirements|buildMealPlanNetRequirements|buildMealPlanProductCandidateSet/);
  assert.doesNotMatch(source, /firestore/iu);

  assert.match(routeSource, /app\.post\("\/meal-plans\/generate"/);
  assert.match(routeSource, /app\.get\("\/meal-plans\/:planId"/);
  assert.match(routeSource, /app\.post\("\/meal-plans\/:planId\/shopping\/run"/);
  assert.match(routeSource, /app\.get\("\/meal-plan-shopping-runs\/:runId"/);
  assert.match(routeSource, /app\.get\("\/meal-plan-optimized-baskets\/:basketId"/);
});

async function run() {
  let failed = 0;

  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error.stack);
    }
  }

  console.log(`\nAPP1 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
