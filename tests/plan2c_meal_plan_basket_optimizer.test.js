const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  lookupCanonicalProductPrices,
  MEAL_PLAN_BASKET_OPTIMIZER_RULES_VERSION,
  MEAL_PLAN_BASKET_OPTIMIZER_VERSION,
  buildMealPlanOptimizerRunKey,
  normalizeMealPlanBasketOptimizerOptions,
  optimizeBasketMultiStore,
  optimizeBasketSingleStore,
  optimizeMealPlanBasket,
} = require('../app/functions/src');
const { parseArgs } = require('../scripts/plan2c_optimize_meal_plan_basket');

function makeFixtureStore() {
  return {
    async load() {
      return {
        canonical_products: [
          {
            canonical_product_id: 'cp_rice_1kg',
            canonical_display_name: 'Rice 1kg',
            canonical_brand: 'Budget Rice',
            canonical_size_value: 1000,
            canonical_size_unit: 'g',
          },
          {
            canonical_product_id: 'cp_rice_500g',
            canonical_display_name: 'Rice 500g',
            canonical_brand: 'Quick Rice',
            canonical_size_value: 500,
            canonical_size_unit: 'g',
          },
          {
            canonical_product_id: 'cp_eggs_10',
            canonical_display_name: 'Eggs 10 Count',
            canonical_brand: 'Farm Eggs',
            canonical_size_value: 10,
            canonical_size_unit: 'count',
          },
        ],
        canonical_product_mappings: [
          { canonical_product_id: 'cp_rice_1kg', source_product_id: 'sp_rice_1kg_kaufland' },
          { canonical_product_id: 'cp_rice_1kg', source_product_id: 'sp_rice_1kg_billa' },
          { canonical_product_id: 'cp_rice_500g', source_product_id: 'sp_rice_500g_billa' },
          { canonical_product_id: 'cp_rice_500g', source_product_id: 'sp_rice_500g_kaufland' },
          { canonical_product_id: 'cp_eggs_10', source_product_id: 'sp_eggs_10_billa' },
          { canonical_product_id: 'cp_eggs_10', source_product_id: 'sp_eggs_10_kaufland' },
        ],
        source_products: [
          makeSourceProduct('sp_rice_1kg_kaufland', 'Kaufland', 'sofia', 'Kaufland Mladost'),
          makeSourceProduct('sp_rice_1kg_billa', 'Billa', 'sofia', 'Billa Center'),
          makeSourceProduct('sp_rice_500g_billa', 'Billa', 'sofia', 'Billa Center'),
          makeSourceProduct('sp_rice_500g_kaufland', 'Kaufland', 'sofia', 'Kaufland Mladost'),
          makeSourceProduct('sp_eggs_10_billa', 'Billa', 'sofia', 'Billa Center'),
          makeSourceProduct('sp_eggs_10_kaufland', 'Kaufland', 'sofia', 'Kaufland Mladost'),
        ],
        raw_price_snapshots: [
          makeSnapshot('sp_rice_1kg_kaufland', 'snap_rice_1kg_kaufland', 3.2, null, '2026-04-25', 'Kaufland', 'Kaufland Mladost', 'sofia'),
          makeSnapshot('sp_rice_1kg_billa', 'snap_rice_1kg_billa', 2.0, null, '2026-04-25', 'Billa', 'Billa Center', 'sofia'),
          makeSnapshot('sp_rice_500g_billa', 'snap_rice_500g_billa', 1.4, null, '2026-04-25', 'Billa', 'Billa Center', 'sofia'),
          makeSnapshot('sp_rice_500g_kaufland', 'snap_rice_500g_kaufland', 1.7, null, '2026-04-25', 'Kaufland', 'Kaufland Mladost', 'sofia'),
          makeSnapshot('sp_eggs_10_billa', 'snap_eggs_10_billa', 3.0, null, '2026-04-25', 'Billa', 'Billa Center', 'sofia'),
          makeSnapshot('sp_eggs_10_kaufland', 'snap_eggs_10_kaufland', 1.5, null, '2026-04-25', 'Kaufland', 'Kaufland Mladost', 'sofia'),
        ],
        product_daily_prices: [],
      };
    },
  };
}

function makeSourceProduct(sourceProductId, chainNameRaw, localityCode, storeNameRaw) {
  return {
    source_product_id: sourceProductId,
    source_chain_name_raw: chainNameRaw,
    source_chain_name_normalized: chainNameRaw.toLowerCase(),
    locality_code: localityCode,
    store_name_raw: storeNameRaw,
  };
}

function makeSnapshot(
  sourceProductId,
  snapshotId,
  retailPrice,
  promoPrice,
  snapshotDate,
  chainNameRaw,
  storeNameRaw,
  localityCode,
) {
  return {
    source_product_id: sourceProductId,
    snapshot_id: snapshotId,
    retail_price: retailPrice,
    promo_price: promoPrice,
    snapshot_date: snapshotDate,
    source_chain_name_raw: chainNameRaw,
    source_chain_name_normalized: chainNameRaw.toLowerCase(),
    store_name_raw: storeNameRaw,
    locality_code: localityCode,
    ingested_at: `${snapshotDate}T10:00:00.000Z`,
  };
}

function makeFixtureClient() {
  const state = buildFixtureState();
  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });

      if (normalizedSql === 'BEGIN' || normalizedSql === 'COMMIT' || normalizedSql === 'ROLLBACK') {
        return { rows: [] };
      }
      if (normalizedSql === 'SELECT * FROM meal_plan_product_candidate_sets WHERE candidate_set_id = $1') {
        return { rows: state.candidateSet.candidate_set_id === params[0] ? [state.candidateSet] : [] };
      }
      if (normalizedSql === 'SELECT * FROM meal_plan_product_candidate_sets WHERE candidate_set_key = $1') {
        return { rows: state.candidateSet.candidate_set_key === params[0] ? [state.candidateSet] : [] };
      }
      if (normalizedSql.startsWith('SELECT * FROM meal_plan_product_candidates')) {
        const [candidateSetId, limit] = params;
        return {
          rows: state.candidates
            .filter((row) => row.candidate_set_id === candidateSetId)
            .slice(0, limit),
        };
      }
      if (normalizedSql.startsWith('INSERT INTO meal_plan_optimized_baskets')) {
        const row = optimizedBasketFromParams(params);
        const existing = state.optimizedBasketsByKey.get(row.optimizer_run_key);
        const stored = {
          ...(existing || {}),
          ...row,
          optimized_basket_id: existing ? existing.optimized_basket_id : row.optimized_basket_id,
          created_at: existing ? existing.created_at : '2026-04-25T11:00:00.000Z',
          updated_at: '2026-04-25T11:30:00.000Z',
        };
        state.optimizedBasketsByKey.set(stored.optimizer_run_key, stored);
        return { rows: [stored] };
      }
      if (normalizedSql === 'DELETE FROM meal_plan_optimized_basket_items WHERE optimized_basket_id = $1') {
        state.optimizedBasketItemsByBasketId.set(params[0], []);
        return { rows: [] };
      }
      if (normalizedSql.startsWith('INSERT INTO meal_plan_optimized_basket_items')) {
        const row = optimizedBasketItemFromParams(params);
        const current = state.optimizedBasketItemsByBasketId.get(row.optimized_basket_id) || [];
        current.push(row);
        state.optimizedBasketItemsByBasketId.set(row.optimized_basket_id, current);
        return { rows: [row] };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function buildFixtureState() {
  return {
    candidateSet: {
      candidate_set_id: 'meal_plan_product_candidate_set:demo',
      net_requirement_id: 'meal_plan_net_requirement:demo',
      plan_id: 'meal_plan:demo',
      profile_id: 'user_food_profile:user_demo',
      user_id: 'user_demo',
      candidate_set_key: 'meal_plan_product_candidate_set:demo:key',
      generation_method: 'plan2b_meal_plan_product_candidate_builder_v1',
      rules_version: 'plan2b_meal_plan_product_candidate_rules_v1',
    },
    candidates: [
      makeCandidate('001a', {
        net_requirement_item_id: 'meal_plan_net_requirement_item:001',
        ingredient_id: 'ingredient:rice',
        ingredient_key_snapshot: 'rice',
        display_name: 'rice',
        product_id: 'cp_rice_1kg',
        product_name_snapshot: 'Rice 1kg',
        brand: 'Budget Rice',
        product_size_quantity: 1000,
        product_size_unit: 'g',
        product_size_grams: 1000,
        required_quantity_grams: 600,
        units_needed: 1,
        total_purchased_grams: 1000,
        overage_grams: 400,
        unit_price: 2.0,
        total_estimated_price: 2.0,
        mapping_id: 'mapping:rice:1kg',
        mapping_confidence: 0.92,
        candidate_confidence: 1.0,
        candidate_status: 'ready_for_optimizer',
      }),
      makeCandidate('001b', {
        net_requirement_item_id: 'meal_plan_net_requirement_item:001',
        ingredient_id: 'ingredient:rice',
        ingredient_key_snapshot: 'rice',
        display_name: 'rice',
        product_id: 'cp_rice_500g',
        product_name_snapshot: 'Rice 500g',
        brand: 'Quick Rice',
        product_size_quantity: 500,
        product_size_unit: 'g',
        product_size_grams: 500,
        required_quantity_grams: 600,
        units_needed: 2,
        total_purchased_grams: 1000,
        overage_grams: 400,
        unit_price: 1.4,
        total_estimated_price: 2.8,
        mapping_id: 'mapping:rice:500g',
        mapping_confidence: 0.88,
        candidate_confidence: 0.98,
        candidate_status: 'ready_for_optimizer',
      }),
      makeCandidate('002', {
        net_requirement_item_id: 'meal_plan_net_requirement_item:002',
        ingredient_id: 'ingredient:eggs',
        ingredient_key_snapshot: 'eggs',
        display_name: 'eggs',
        product_id: 'cp_eggs_10',
        product_name_snapshot: 'Eggs 10 Count',
        brand: 'Farm Eggs',
        product_size_quantity: 10,
        product_size_unit: 'count',
        product_size_grams: 600,
        required_quantity_grams: 600,
        units_needed: 1,
        total_purchased_grams: 600,
        overage_grams: 0,
        unit_price: 1.5,
        total_estimated_price: 1.5,
        mapping_id: 'mapping:eggs',
        mapping_confidence: 0.9,
        candidate_confidence: 1.0,
        candidate_status: 'ready_for_optimizer',
      }),
      makeCandidate('003', {
        net_requirement_item_id: 'meal_plan_net_requirement_item:003',
        ingredient_id: 'ingredient:yogurt',
        ingredient_key_snapshot: 'yogurt',
        display_name: 'yogurt',
        candidate_status: 'covered_by_inventory',
        required_quantity_grams: 250,
      }),
      makeCandidate('004', {
        net_requirement_item_id: 'meal_plan_net_requirement_item:004',
        ingredient_id: null,
        ingredient_key_snapshot: 'fresh_dill',
        display_name: 'fresh dill',
        candidate_status: 'missing_product_mapping',
        required_quantity_grams: 40,
      }),
      makeCandidate('005', {
        net_requirement_item_id: 'meal_plan_net_requirement_item:005',
        ingredient_id: 'ingredient:green_beans',
        ingredient_key_snapshot: 'green_beans',
        display_name: 'green beans',
        product_id: 'cp_green_beans',
        product_name_snapshot: 'Green Beans 400g',
        brand: 'Bean Farm',
        product_size_quantity: 400,
        product_size_unit: 'g',
        product_size_grams: 400,
        required_quantity_grams: 200,
        units_needed: 1,
        total_purchased_grams: 400,
        overage_grams: 200,
        unit_price: null,
        total_estimated_price: null,
        mapping_id: 'mapping:green_beans',
        mapping_confidence: 0.82,
        candidate_confidence: 0.82,
        candidate_status: 'missing_price',
      }),
      makeCandidate('006', {
        net_requirement_item_id: 'meal_plan_net_requirement_item:006',
        ingredient_id: 'ingredient:spice_mix',
        ingredient_key_snapshot: 'spice_mix',
        display_name: 'spice mix',
        product_id: 'cp_spice_mix',
        product_name_snapshot: 'Spice Mix',
        brand: 'Spice Co',
        product_size_quantity: null,
        product_size_unit: null,
        product_size_grams: null,
        required_quantity_grams: 120,
        units_needed: null,
        total_purchased_grams: null,
        overage_grams: null,
        unit_price: null,
        total_estimated_price: null,
        mapping_id: 'mapping:spice_mix',
        mapping_confidence: 0.7,
        candidate_confidence: 0.7,
        candidate_status: 'missing_product_size',
      }),
    ],
    optimizedBasketsByKey: new Map(),
    optimizedBasketItemsByBasketId: new Map(),
    commands: [],
  };
}

function makeCandidate(suffix, overrides) {
  return {
    candidate_id: `meal_plan_product_candidate:${suffix}`,
    candidate_set_id: 'meal_plan_product_candidate_set:demo',
    net_requirement_item_id: null,
    ingredient_id: null,
    ingredient_key_snapshot: null,
    display_name: null,
    product_id: null,
    product_name_snapshot: null,
    brand: null,
    chain_id: null,
    store_id: null,
    price_id: null,
    product_size_quantity: null,
    product_size_unit: null,
    product_size_grams: null,
    required_quantity_grams: null,
    units_needed: null,
    total_purchased_grams: null,
    overage_grams: null,
    unit_price: null,
    total_estimated_price: null,
    currency: 'EUR',
    mapping_id: null,
    mapping_confidence: null,
    candidate_confidence: null,
    candidate_status: 'needs_review',
    selection_reason_json: {
      source: 'fixture',
    },
    ...overrides,
  };
}

function optimizedBasketFromParams(params) {
  return {
    optimized_basket_id: params[0],
    candidate_set_id: params[1],
    net_requirement_id: params[2],
    plan_id: params[3],
    profile_id: params[4],
    user_id: params[5],
    optimizer_run_key: params[6],
    optimizer_version: params[7],
    total_estimated_price: params[8],
    currency: params[9],
    selected_chain_id: params[10],
    selected_store_id: params[11],
    item_count: params[12],
    covered_requirement_count: params[13],
    missing_requirement_count: params[14],
    optimizer_summary_json: JSON.parse(params[15]),
    generation_method: params[16],
    rules_version: params[17],
  };
}

function optimizedBasketItemFromParams(params) {
  return {
    optimized_basket_item_id: params[0],
    optimized_basket_id: params[1],
    candidate_id: params[2],
    net_requirement_item_id: params[3],
    ingredient_id: params[4],
    ingredient_key_snapshot: params[5],
    display_name: params[6],
    product_id: params[7],
    product_name_snapshot: params[8],
    brand: params[9],
    chain_id: params[10],
    store_id: params[11],
    price_id: params[12],
    units_selected: params[13],
    total_purchased_grams: params[14],
    required_quantity_grams: params[15],
    overage_grams: params[16],
    unit_price: params[17],
    total_price: params[18],
    currency: params[19],
    selection_reason_json: JSON.parse(params[20]),
    item_status: params[21],
  };
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '027_plan2c_meal_plan_optimized_baskets.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS meal_plan_optimized_baskets'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS meal_plan_optimized_basket_items'));
  assert(migration.includes('covered_by_inventory'));
  assert(migration.includes('missing_product'));
  assert(migration.includes('missing_price'));
  assert(migration.includes('optimizer_excluded'));

  assert.deepStrictEqual(normalizeMealPlanBasketOptimizerOptions({
    candidateSetId: 'meal_plan_product_candidate_set:demo',
    dryRun: true,
    store: makeFixtureStore(),
  }).candidate_set_id, 'meal_plan_product_candidate_set:demo');
  assert.throws(
    () => normalizeMealPlanBasketOptimizerOptions({ dryRun: true }),
    /candidate_set_id or candidate_set_key is required/,
  );

  const runKeyA = buildMealPlanOptimizerRunKey(
    'meal_plan_product_candidate_set:demo',
    MEAL_PLAN_BASKET_OPTIMIZER_VERSION,
    MEAL_PLAN_BASKET_OPTIMIZER_RULES_VERSION,
  );
  const runKeyB = buildMealPlanOptimizerRunKey(
    'meal_plan_product_candidate_set:demo',
    MEAL_PLAN_BASKET_OPTIMIZER_VERSION,
    MEAL_PLAN_BASKET_OPTIMIZER_RULES_VERSION,
  );
  assert.equal(runKeyA, runKeyB, 'optimizer run key should be deterministic');

  const store = makeFixtureStore();
  const dryRunClient = makeFixtureClient();
  const adapterCalls = {
    lookup: 0,
    single: 0,
    multi: 0,
    basketPlan: null,
    priceLookup: null,
  };
  const spyAdapter = {
    async lookupCanonicalProductPrices(args) {
      adapterCalls.lookup += 1;
      return lookupCanonicalProductPrices(args);
    },
    optimizeBasketSingleStore(args) {
      adapterCalls.single += 1;
      adapterCalls.basketPlan = args.basketPlan;
      adapterCalls.priceLookup = args.priceLookup;
      return optimizeBasketSingleStore(args);
    },
    optimizeBasketMultiStore(args) {
      adapterCalls.multi += 1;
      return optimizeBasketMultiStore(args);
    },
  };
  const dryRun = await optimizeMealPlanBasket(dryRunClient, {
    candidateSetId: 'meal_plan_product_candidate_set:demo',
    dryRun: true,
    store,
    optimizerAdapter: spyAdapter,
  });

  assert.equal(adapterCalls.lookup, 1, 'adapter should call existing price lookup once');
  assert.equal(adapterCalls.single, 1, 'adapter should call existing single-store optimizer');
  assert.equal(adapterCalls.multi, 1, 'adapter should call existing multi-store optimizer');
  assert.equal(adapterCalls.basketPlan.ready_items.length, 1, 'single-candidate groups should become ready items');
  assert.equal(adapterCalls.basketPlan.ambiguous_items.length, 1, 'multi-candidate groups should become ambiguous items');
  assert.equal(adapterCalls.basketPlan.ambiguous_items[0].carried_candidates.length, 2);

  const rice500Synthetic = adapterCalls.priceLookup.items.find(
    (item) => item.canonical_product_id === 'meal_plan_product_candidate:001b',
  );
  const rice500BillaRecord = rice500Synthetic.price_records.find((record) => record.chain_id === 'billa');
  assert.equal(rice500BillaRecord.price, 2.8, 'adapter should multiply underlying price by units_needed before optimization');
  assert.equal(dryRun.optimized_basket.item_count, 6, 'dry run should still compute persisted item shape');

  const client = makeFixtureClient();
  const report = await optimizeMealPlanBasket(client, {
    candidateSetId: 'meal_plan_product_candidate_set:demo',
    store,
  });

  assert.equal(report.candidate_sets_seen, 1);
  assert.equal(report.ready_candidates, 3);
  assert.equal(report.selected_strategy, 'multi_store');
  assert.equal(report.selected_items, 2);
  assert.equal(report.covered_by_inventory, 1);
  assert.equal(report.missing_product, 1);
  assert.equal(report.missing_price, 1);
  assert.equal(report.optimizer_excluded, 1);
  assert.equal(report.optimized_baskets_created, 1);
  assert.equal(report.total_estimated_price, 3.5);
  assert.equal(report.currency, 'EUR');
  assert.equal(client.state.optimizedBasketsByKey.size, 1);

  const optimizedBasket = [...client.state.optimizedBasketsByKey.values()][0];
  assert.equal(optimizedBasket.total_estimated_price, 3.5);
  assert.equal(optimizedBasket.selected_chain_id, null, 'multi-store recommendation should not collapse to one chain id');
  assert.equal(optimizedBasket.covered_requirement_count, 3);
  assert.equal(optimizedBasket.missing_requirement_count, 3);

  const storedItems = client.state.optimizedBasketItemsByBasketId.get(optimizedBasket.optimized_basket_id) || [];
  assert.equal(storedItems.length, 6, 'selected plus preserved items should be stored once per requirement');

  const selectedRice = storedItems.find((item) => item.net_requirement_item_id === 'meal_plan_net_requirement_item:001');
  assert.equal(selectedRice.item_status, 'selected');
  assert.equal(selectedRice.candidate_id, 'meal_plan_product_candidate:001a', 'multi-store optimizer should choose the 1kg rice candidate');
  assert.equal(selectedRice.chain_id, 'billa');
  assert.equal(selectedRice.units_selected, 1);
  assert.equal(selectedRice.unit_price, 2);
  assert.equal(selectedRice.total_price, 2);

  const selectedEggs = storedItems.find((item) => item.net_requirement_item_id === 'meal_plan_net_requirement_item:002');
  assert.equal(selectedEggs.item_status, 'selected');
  assert.equal(selectedEggs.chain_id, 'kaufland');
  assert.equal(selectedEggs.units_selected, 1);
  assert.equal(selectedEggs.total_price, 1.5);

  const covered = storedItems.find((item) => item.net_requirement_item_id === 'meal_plan_net_requirement_item:003');
  assert.equal(covered.item_status, 'covered_by_inventory');
  assert.equal(covered.total_price, null);

  const missingProduct = storedItems.find((item) => item.net_requirement_item_id === 'meal_plan_net_requirement_item:004');
  assert.equal(missingProduct.item_status, 'missing_product');

  const missingPrice = storedItems.find((item) => item.net_requirement_item_id === 'meal_plan_net_requirement_item:005');
  assert.equal(missingPrice.item_status, 'missing_price');

  const excluded = storedItems.find((item) => item.net_requirement_item_id === 'meal_plan_net_requirement_item:006');
  assert.equal(excluded.item_status, 'optimizer_excluded');

  const rerun = await optimizeMealPlanBasket(client, {
    candidateSetKey: 'meal_plan_product_candidate_set:demo:key',
    store,
  });
  assert.equal(rerun.optimized_basket.optimizer_run_key, report.optimized_basket.optimizer_run_key);
  assert.equal(client.state.optimizedBasketsByKey.size, 1, 'optimizer basket upsert should stay idempotent');
  assert.equal(
    (client.state.optimizedBasketItemsByBasketId.get(optimizedBasket.optimized_basket_id) || []).length,
    6,
    'reruns should rebuild optimized basket items without duplicates',
  );

  assert.deepStrictEqual(parseArgs([
    '--candidate-set-id=meal_plan_product_candidate_set:demo',
    '--dry-run',
    '--json',
    '--out=tmp/plan2c.json',
  ]), {
    candidateSetId: 'meal_plan_product_candidate_set:demo',
    candidateSetKey: null,
    dryRun: true,
    json: true,
    out: 'tmp/plan2c.json',
  });

  const source = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'src', 'db', 'planner', 'meal_plan_basket_optimizer_adapter.js'),
    'utf8',
  );
  assert(/optimizeBasketSingleStore/.test(source), 'PLAN2C should reuse the existing single-store optimizer');
  assert(/optimizeBasketMultiStore/.test(source), 'PLAN2C should reuse the existing multi-store optimizer');
  assert(!/firestore|sponsored/i.test(source), 'PLAN2C must stay out of Firestore and sponsored logic');

  console.log('PLAN2C meal-plan basket optimizer tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
