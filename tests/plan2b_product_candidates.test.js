const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MEAL_PLAN_PRODUCT_CANDIDATE_RULES_VERSION,
  buildMealPlanProductCandidateSet,
  buildMealPlanProductCandidateSetKey,
  normalizeMealPlanProductCandidateOptions,
} = require('../app/functions/src');
const { parseArgs } = require('../scripts/plan2b_build_product_candidates');

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
            canonical_product_id: 'cp_soy_sauce',
            canonical_display_name: 'Soy Sauce 500ml',
            canonical_brand: 'Soy House',
            canonical_size_value: 500,
            canonical_size_unit: 'ml',
          },
          {
            canonical_product_id: 'cp_spice_mix',
            canonical_display_name: 'Spice Mix',
            canonical_brand: 'Spice Co',
            canonical_size_value: null,
            canonical_size_unit: null,
          },
          {
            canonical_product_id: 'cp_green_beans',
            canonical_display_name: 'Green Beans 400g',
            canonical_brand: 'Bean Farm',
            canonical_size_value: 400,
            canonical_size_unit: 'g',
          },
        ],
        canonical_product_mappings: [
          { canonical_product_id: 'cp_rice_1kg', source_product_id: 'sp_rice_1kg' },
          { canonical_product_id: 'cp_rice_500g', source_product_id: 'sp_rice_500g' },
          { canonical_product_id: 'cp_soy_sauce', source_product_id: 'sp_soy_sauce' },
          { canonical_product_id: 'cp_spice_mix', source_product_id: 'sp_spice_mix' },
          { canonical_product_id: 'cp_green_beans', source_product_id: 'sp_green_beans' },
        ],
        source_products: [
          {
            source_product_id: 'sp_rice_1kg',
            source_chain_name_raw: 'Kaufland',
            source_chain_name_normalized: 'kaufland',
            locality_code: 'sofia',
            store_name_raw: 'Kaufland Mladost',
          },
          {
            source_product_id: 'sp_rice_500g',
            source_chain_name_raw: 'Billa',
            source_chain_name_normalized: 'billa',
            locality_code: 'sofia',
            store_name_raw: 'Billa Center',
          },
          {
            source_product_id: 'sp_soy_sauce',
            source_chain_name_raw: 'Fantastico',
            source_chain_name_normalized: 'fantastico',
            locality_code: 'sofia',
            store_name_raw: 'Fantastico Geo Milev',
          },
          {
            source_product_id: 'sp_spice_mix',
            source_chain_name_raw: 'Lidl',
            source_chain_name_normalized: 'lidl',
            locality_code: 'sofia',
            store_name_raw: 'Lidl Druzhba',
          },
          {
            source_product_id: 'sp_green_beans',
            source_chain_name_raw: 'Billa',
            source_chain_name_normalized: 'billa',
            locality_code: 'sofia',
            store_name_raw: 'Billa Center',
          },
        ],
        raw_price_snapshots: [
          makeSnapshot('sp_rice_1kg', 'snap_rice_1kg', 2.5, null, '2026-04-25', 'Kaufland', 'Kaufland Mladost', 'sofia'),
          makeSnapshot('sp_rice_500g', 'snap_rice_500g', 1.6, 1.4, '2026-04-25', 'Billa', 'Billa Center', 'sofia'),
          makeSnapshot('sp_soy_sauce', 'snap_soy_sauce', 3.2, null, '2026-04-25', 'Fantastico', 'Fantastico Geo Milev', 'sofia'),
          makeSnapshot('sp_spice_mix', 'snap_spice_mix', 1.9, null, '2026-04-25', 'Lidl', 'Lidl Druzhba', 'sofia'),
        ],
        product_daily_prices: [],
      };
    },
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
      if (normalizedSql === 'SELECT * FROM meal_plan_net_requirements WHERE net_requirement_id = $1') {
        return { rows: state.netRequirement.net_requirement_id === params[0] ? [state.netRequirement] : [] };
      }
      if (normalizedSql === 'SELECT * FROM meal_plan_net_requirements WHERE net_requirement_key = $1') {
        return { rows: state.netRequirement.net_requirement_key === params[0] ? [state.netRequirement] : [] };
      }
      if (normalizedSql.startsWith('SELECT * FROM meal_plan_net_requirement_items')) {
        const [netRequirementId, limit] = params;
        return {
          rows: state.netRequirementItems
            .filter((row) => row.net_requirement_id === netRequirementId)
            .slice(0, limit),
        };
      }
      if (normalizedSql.startsWith('SELECT ingredient_id, ingredient_key, density_g_per_ml, grams_per_piece FROM ingredients')) {
        const ids = new Set(params[0] || []);
        return { rows: state.ingredients.filter((row) => ids.has(row.ingredient_id)) };
      }
      if (normalizedSql.startsWith('SELECT m.*, c.candidate_id,')) {
        const ids = new Set(params[0] || []);
        return {
          rows: state.mappings
            .filter((row) => ids.has(row.ingredient_id) && row.review_status === 'approved')
            .map((row) => ({
              ...row,
              ...(state.productCandidatesByProductId.get(row.product_id) || {}),
            })),
        };
      }
      if (normalizedSql.startsWith('INSERT INTO meal_plan_product_candidate_sets')) {
        const row = candidateSetFromParams(params);
        const existing = state.candidateSetsByKey.get(row.candidate_set_key);
        const stored = {
          ...(existing || {}),
          ...row,
          candidate_set_id: existing ? existing.candidate_set_id : row.candidate_set_id,
          created_at: existing ? existing.created_at : '2026-04-25T09:00:00.000Z',
          updated_at: '2026-04-25T09:30:00.000Z',
        };
        state.candidateSetsByKey.set(stored.candidate_set_key, stored);
        return { rows: [stored] };
      }
      if (normalizedSql === 'DELETE FROM meal_plan_product_candidates WHERE candidate_set_id = $1') {
        state.candidatesBySetId.set(params[0], []);
        return { rows: [] };
      }
      if (normalizedSql.startsWith('INSERT INTO meal_plan_product_candidates')) {
        const row = candidateFromParams(params);
        const current = state.candidatesBySetId.get(row.candidate_set_id) || [];
        current.push(row);
        state.candidatesBySetId.set(row.candidate_set_id, current);
        return { rows: [row] };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function buildFixtureState() {
  const netRequirement = {
    net_requirement_id: 'meal_plan_net_requirement:demo',
    requirement_id: 'meal_plan_requirement:demo',
    plan_id: 'meal_plan:demo',
    profile_id: 'user_food_profile:user_demo',
    user_id: 'user_demo',
    net_requirement_key: 'meal_plan_net_requirement:demo:key',
    generation_method: 'plan2a1_meal_plan_net_requirements_builder_v1',
    rules_version: 'plan2a1_meal_plan_net_requirements_rules_v1',
  };

  const netRequirementItems = [
    makeNetRequirementItem(netRequirement.net_requirement_id, '001', {
      ingredient_id: 'ingredient:rice',
      ingredient_key_snapshot: 'rice',
      display_name: 'rice',
      required_quantity_grams: 600,
      inventory_applied_grams: 0,
      net_quantity_grams: 600,
      source_recipe_ids_json: ['recipe:a', 'recipe:b'],
      source_recipe_ingredient_ids_json: ['ri:a:rice', 'ri:b:rice'],
      shopping_unit: 'kg',
      estimated_shopping_quantity: 0.6,
      estimated_shopping_unit: 'kg',
      inventory_status: 'no_inventory',
      adapter_status: 'ready_for_product_mapping',
    }),
    makeNetRequirementItem(netRequirement.net_requirement_id, '002', {
      ingredient_id: 'ingredient:soy_sauce',
      ingredient_key_snapshot: 'soy_sauce',
      display_name: 'soy sauce',
      required_quantity_grams: 300,
      inventory_applied_grams: 0,
      net_quantity_grams: 300,
      source_recipe_ids_json: ['recipe:c'],
      source_recipe_ingredient_ids_json: ['ri:c:soy'],
      shopping_unit: 'g',
      estimated_shopping_quantity: 300,
      estimated_shopping_unit: 'g',
      inventory_status: 'no_inventory',
      adapter_status: 'ready_for_product_mapping',
    }),
    makeNetRequirementItem(netRequirement.net_requirement_id, '003', {
      ingredient_id: null,
      ingredient_key_snapshot: 'fresh_dill',
      display_name: 'fresh dill',
      required_quantity_grams: 40,
      inventory_applied_grams: 0,
      net_quantity_grams: 40,
      source_recipe_ids_json: ['recipe:d'],
      source_recipe_ingredient_ids_json: ['ri:d:dill'],
      shopping_unit: 'g',
      estimated_shopping_quantity: 40,
      estimated_shopping_unit: 'g',
      inventory_status: 'missing_ingredient',
      adapter_status: 'missing_ingredient',
    }),
    makeNetRequirementItem(netRequirement.net_requirement_id, '004', {
      ingredient_id: 'ingredient:parsley',
      ingredient_key_snapshot: 'parsley',
      display_name: 'parsley',
      required_quantity_grams: null,
      inventory_applied_grams: 0,
      net_quantity_grams: null,
      source_recipe_ids_json: ['recipe:e'],
      source_recipe_ingredient_ids_json: ['ri:e:parsley'],
      shopping_unit: 'g',
      estimated_shopping_quantity: null,
      estimated_shopping_unit: 'g',
      inventory_status: 'missing_quantity',
      adapter_status: 'missing_quantity',
    }),
    makeNetRequirementItem(netRequirement.net_requirement_id, '005', {
      ingredient_id: 'ingredient:yogurt',
      ingredient_key_snapshot: 'yogurt',
      display_name: 'yogurt',
      required_quantity_grams: 250,
      inventory_applied_grams: 250,
      net_quantity_grams: 0,
      source_recipe_ids_json: ['recipe:f'],
      source_recipe_ingredient_ids_json: ['ri:f:yogurt'],
      shopping_unit: 'g',
      estimated_shopping_quantity: 0,
      estimated_shopping_unit: 'g',
      inventory_status: 'fully_covered',
      adapter_status: 'covered_by_inventory',
    }),
    makeNetRequirementItem(netRequirement.net_requirement_id, '006', {
      ingredient_id: 'ingredient:spice_mix',
      ingredient_key_snapshot: 'spice_mix',
      display_name: 'spice mix',
      required_quantity_grams: 120,
      inventory_applied_grams: 0,
      net_quantity_grams: 120,
      source_recipe_ids_json: ['recipe:g'],
      source_recipe_ingredient_ids_json: ['ri:g:spice'],
      shopping_unit: 'g',
      estimated_shopping_quantity: 120,
      estimated_shopping_unit: 'g',
      inventory_status: 'no_inventory',
      adapter_status: 'ready_for_product_mapping',
    }),
    makeNetRequirementItem(netRequirement.net_requirement_id, '007', {
      ingredient_id: 'ingredient:green_beans',
      ingredient_key_snapshot: 'green_beans',
      display_name: 'green beans',
      required_quantity_grams: 200,
      inventory_applied_grams: 0,
      net_quantity_grams: 200,
      source_recipe_ids_json: ['recipe:h'],
      source_recipe_ingredient_ids_json: ['ri:h:beans'],
      shopping_unit: 'g',
      estimated_shopping_quantity: 200,
      estimated_shopping_unit: 'g',
      inventory_status: 'no_inventory',
      adapter_status: 'ready_for_product_mapping',
    }),
  ];

  return {
    netRequirement,
    netRequirementItems,
    ingredients: [
      { ingredient_id: 'ingredient:rice', ingredient_key: 'rice', density_g_per_ml: null, grams_per_piece: null },
      { ingredient_id: 'ingredient:soy_sauce', ingredient_key: 'soy_sauce', density_g_per_ml: 1.1, grams_per_piece: null },
      { ingredient_id: 'ingredient:parsley', ingredient_key: 'parsley', density_g_per_ml: null, grams_per_piece: null },
      { ingredient_id: 'ingredient:yogurt', ingredient_key: 'yogurt', density_g_per_ml: 1.02, grams_per_piece: null },
      { ingredient_id: 'ingredient:spice_mix', ingredient_key: 'spice_mix', density_g_per_ml: null, grams_per_piece: null },
      { ingredient_id: 'ingredient:green_beans', ingredient_key: 'green_beans', density_g_per_ml: null, grams_per_piece: null },
    ],
    productCandidatesByProductId: new Map([
      ['cp_rice_1kg', {
        candidate_id: 'ingredient_product_candidate:rice_1kg',
        product_name: 'Rice 1kg',
        normalized_product_name: 'rice_1kg',
        brand: 'Budget Rice',
        size: null,
        unit: null,
        parsed_attributes_json: {},
        proposed_ingredient_key: 'rice',
      }],
      ['cp_rice_500g', {
        candidate_id: 'ingredient_product_candidate:rice_500g',
        product_name: 'Rice 500g',
        normalized_product_name: 'rice_500g',
        brand: 'Quick Rice',
        size: null,
        unit: null,
        parsed_attributes_json: {},
        proposed_ingredient_key: 'rice',
      }],
      ['sp_soy_sauce', {
        candidate_id: 'ingredient_product_candidate:soy_sauce',
        product_name: 'Soy Sauce Bottle',
        normalized_product_name: 'soy_sauce_bottle',
        brand: 'Soy House',
        size: null,
        unit: null,
        parsed_attributes_json: {},
        proposed_ingredient_key: 'soy_sauce',
      }],
      ['cp_spice_mix', {
        candidate_id: 'ingredient_product_candidate:spice_mix',
        product_name: 'Spice Mix',
        normalized_product_name: 'spice_mix',
        brand: 'Spice Co',
        size: null,
        unit: null,
        parsed_attributes_json: {},
        proposed_ingredient_key: 'spice_mix',
      }],
      ['cp_green_beans', {
        candidate_id: 'ingredient_product_candidate:green_beans',
        product_name: 'Green Beans 400g',
        normalized_product_name: 'green_beans_400g',
        brand: 'Bean Farm',
        size: null,
        unit: null,
        parsed_attributes_json: {},
        proposed_ingredient_key: 'green_beans',
      }],
    ]),
    mappings: [
      makeApprovedMapping('ingredient:rice', 'mapping:rice:1kg', 'cp_rice_1kg', 0.92),
      makeApprovedMapping('ingredient:rice', 'mapping:rice:500g', 'cp_rice_500g', 0.88),
      makeRejectedMapping('ingredient:rice', 'mapping:rice:rejected', 'cp_spice_mix', 0.95),
      makeApprovedMapping('ingredient:soy_sauce', 'mapping:soy', 'sp_soy_sauce', 0.9),
      makeApprovedMapping('ingredient:spice_mix', 'mapping:spice', 'cp_spice_mix', 0.7),
      makeApprovedMapping('ingredient:green_beans', 'mapping:beans', 'cp_green_beans', 0.82),
    ],
    candidateSetsByKey: new Map(),
    candidatesBySetId: new Map(),
    commands: [],
  };
}

function makeApprovedMapping(ingredientId, mappingId, productId, confidence) {
  return {
    mapping_id: mappingId,
    ingredient_id: ingredientId,
    product_id: productId,
    mapping_type: 'exact_match',
    confidence,
    review_status: 'approved',
    reviewed_by: 'reviewer',
    reviewed_at: '2026-04-25T08:00:00.000Z',
    review_reason: null,
    generation_method: 'db3e_deterministic_ingredient_product_matching_v1',
  };
}

function makeRejectedMapping(ingredientId, mappingId, productId, confidence) {
  return {
    mapping_id: mappingId,
    ingredient_id: ingredientId,
    product_id: productId,
    mapping_type: 'rejected',
    confidence,
    review_status: 'rejected',
    reviewed_by: 'reviewer',
    reviewed_at: '2026-04-25T08:00:00.000Z',
    review_reason: 'wrong product',
    generation_method: 'db3e_deterministic_ingredient_product_matching_v1',
  };
}

function makeNetRequirementItem(netRequirementId, suffix, overrides) {
  return {
    net_requirement_item_id: `meal_plan_net_requirement_item:${suffix}`,
    net_requirement_id: netRequirementId,
    requirement_item_id: `meal_plan_requirement_item:${suffix}`,
    ingredient_id: null,
    ingredient_key_snapshot: null,
    display_name: null,
    required_quantity_grams: null,
    inventory_applied_grams: 0,
    net_quantity_grams: null,
    inventory_item_ids_json: [],
    source_recipe_ids_json: [],
    source_recipe_ingredient_ids_json: [],
    shopping_unit: null,
    estimated_shopping_quantity: null,
    estimated_shopping_unit: null,
    inventory_status: 'needs_review',
    adapter_status: 'needs_review',
    ...overrides,
  };
}

function candidateSetFromParams(params) {
  const columns = [
    'candidate_set_id',
    'net_requirement_id',
    'plan_id',
    'profile_id',
    'user_id',
    'candidate_set_key',
    'generation_method',
    'rules_version',
  ];
  return Object.fromEntries(columns.map((column, index) => [column, params[index]]));
}

function candidateFromParams(params) {
  return {
    candidate_id: params[0],
    candidate_set_id: params[1],
    net_requirement_item_id: params[2],
    ingredient_id: params[3],
    ingredient_key_snapshot: params[4],
    display_name: params[5],
    product_id: params[6],
    product_name_snapshot: params[7],
    brand: params[8],
    chain_id: params[9],
    store_id: params[10],
    price_id: params[11],
    product_size_quantity: params[12],
    product_size_unit: params[13],
    product_size_grams: params[14],
    required_quantity_grams: params[15],
    units_needed: params[16],
    total_purchased_grams: params[17],
    overage_grams: params[18],
    unit_price: params[19],
    total_estimated_price: params[20],
    currency: params[21],
    mapping_id: params[22],
    mapping_confidence: params[23],
    candidate_confidence: params[24],
    candidate_status: params[25],
    selection_reason_json: JSON.parse(params[26]),
  };
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '026_plan2b_meal_plan_product_candidates.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS meal_plan_product_candidate_sets'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS meal_plan_product_candidates'));
  assert(migration.includes('ready_for_optimizer'));
  assert(migration.includes('covered_by_inventory'));
  assert(migration.includes('missing_product_mapping'));
  assert(migration.includes('missing_product_size'));
  assert(migration.includes('missing_price'));

  const optionsStore = { load: async () => ({}) };
  assert.deepStrictEqual(normalizeMealPlanProductCandidateOptions({
    netRequirementId: 'meal_plan_net_requirement:demo',
    limit: 25,
    dryRun: true,
    store: optionsStore,
  }), {
    net_requirement_id: 'meal_plan_net_requirement:demo',
    net_requirement_key: null,
    dry_run: true,
    limit: 25,
    store: optionsStore,
  });
  assert.throws(
    () => normalizeMealPlanProductCandidateOptions({ dryRun: true }),
    /net_requirement_id or net_requirement_key is required/,
  );

  const keyA = buildMealPlanProductCandidateSetKey(
    'meal_plan_net_requirement:demo',
    MEAL_PLAN_PRODUCT_CANDIDATE_RULES_VERSION,
  );
  const keyB = buildMealPlanProductCandidateSetKey(
    'meal_plan_net_requirement:demo',
    MEAL_PLAN_PRODUCT_CANDIDATE_RULES_VERSION,
  );
  assert.equal(keyA, keyB, 'candidate-set key should be deterministic');

  const client = makeFixtureClient();
  const store = makeFixtureStore();
  const report = await buildMealPlanProductCandidateSet(client, {
    netRequirementId: 'meal_plan_net_requirement:demo',
    store,
  });

  assert.equal(report.net_requirements_seen, 1);
  assert.equal(report.candidate_sets_created, 1);
  assert.equal(report.requirement_items_seen, 7);
  assert.equal(report.covered_by_inventory, 1);
  assert.equal(report.missing_product_mapping, 1);
  assert.equal(report.missing_product_size, 2);
  assert.equal(report.missing_price, 1);
  assert.equal(report.ready_for_optimizer, 2);
  assert.equal(report.candidates_created, 8);
  assert.equal(report.total_required_grams, 1260);
  assert.equal(report.total_estimated_price_min, 5.7);
  assert.equal(report.total_estimated_price_max, 6);
  assert.equal(client.state.candidateSetsByKey.size, 1);

  const riceCandidates = report.candidates
    .filter((candidate) => candidate.net_requirement_item_id === 'meal_plan_net_requirement_item:001')
    .sort((left, right) => left.total_estimated_price - right.total_estimated_price);
  assert.equal(riceCandidates.length, 2, 'approved mappings should create candidates');
  assert(riceCandidates.every((candidate) => candidate.candidate_status === 'ready_for_optimizer'));
  assert(riceCandidates.every((candidate) => candidate.product_id !== 'cp_spice_mix'), 'rejected mappings must be ignored');
  assert.equal(riceCandidates[0].units_needed, 1);
  assert.equal(riceCandidates[0].product_size_grams, 1000);
  assert.equal(riceCandidates[0].total_purchased_grams, 1000);
  assert.equal(riceCandidates[0].overage_grams, 400);
  assert.equal(riceCandidates[0].unit_price, 2.5);
  assert.equal(riceCandidates[0].total_estimated_price, 2.5);
  assert.equal(riceCandidates[1].units_needed, 2);
  assert.equal(riceCandidates[1].total_purchased_grams, 1000);
  assert.equal(riceCandidates[1].overage_grams, 400);
  assert.equal(riceCandidates[1].total_estimated_price, 2.8);

  const soyCandidate = report.candidates.find((candidate) => candidate.net_requirement_item_id === 'meal_plan_net_requirement_item:002');
  assert.equal(soyCandidate.candidate_status, 'ready_for_optimizer');
  assert.equal(soyCandidate.product_id, 'cp_soy_sauce', 'source-product mapping ids should resolve through runtime canonical mappings');
  assert.equal(soyCandidate.product_size_quantity, 500);
  assert.equal(soyCandidate.product_size_unit, 'ml');
  assert.equal(soyCandidate.product_size_grams, 550, 'ml package sizes should convert using ingredient density');
  assert.equal(soyCandidate.units_needed, 1);
  assert.equal(soyCandidate.total_estimated_price, 3.2);

  const dillCandidate = report.candidates.find((candidate) => candidate.net_requirement_item_id === 'meal_plan_net_requirement_item:003');
  assert.equal(dillCandidate.candidate_status, 'missing_product_mapping');

  const parsleyCandidate = report.candidates.find((candidate) => candidate.net_requirement_item_id === 'meal_plan_net_requirement_item:004');
  assert.equal(parsleyCandidate.candidate_status, 'missing_product_size');

  const yogurtCandidate = report.candidates.find((candidate) => candidate.net_requirement_item_id === 'meal_plan_net_requirement_item:005');
  assert.equal(yogurtCandidate.candidate_status, 'covered_by_inventory');
  assert.equal(yogurtCandidate.product_id, null);

  const spiceCandidate = report.candidates.find((candidate) => candidate.net_requirement_item_id === 'meal_plan_net_requirement_item:006');
  assert.equal(spiceCandidate.candidate_status, 'missing_product_size');
  assert.equal(spiceCandidate.product_size_grams, null);
  assert.equal(spiceCandidate.total_estimated_price, null);

  const beansCandidate = report.candidates.find((candidate) => candidate.net_requirement_item_id === 'meal_plan_net_requirement_item:007');
  assert.equal(beansCandidate.candidate_status, 'missing_price');
  assert.equal(beansCandidate.product_size_grams, 400);
  assert.equal(beansCandidate.product_id, 'cp_green_beans');

  const rerun = await buildMealPlanProductCandidateSet(client, {
    netRequirementKey: 'meal_plan_net_requirement:demo:key',
    store,
  });
  assert.equal(rerun.candidate_set.candidate_set_key, report.candidate_set.candidate_set_key);
  assert.equal(client.state.candidateSetsByKey.size, 1, 'candidate-set upsert should stay idempotent');
  assert.equal(
    (client.state.candidatesBySetId.get(report.candidate_set.candidate_set_id) || []).length,
    8,
    'candidate rebuild should replace rows without duplicates',
  );

  const dryRunClient = makeFixtureClient();
  const dryRun = await buildMealPlanProductCandidateSet(dryRunClient, {
    netRequirementId: 'meal_plan_net_requirement:demo',
    dryRun: true,
    store,
  });
  assert.equal(dryRun.candidates_created, 8);
  assert.equal(dryRunClient.state.candidateSetsByKey.size, 0, 'dry-run should not persist candidate sets');

  assert.deepStrictEqual(parseArgs([
    '--net-requirement-id=meal_plan_net_requirement:demo',
    '--dry-run',
    '--json',
    '--out=tmp/plan2b.json',
    '--limit=25',
  ]), {
    netRequirementId: 'meal_plan_net_requirement:demo',
    netRequirementKey: null,
    dryRun: true,
    json: true,
    out: 'tmp/plan2b.json',
    limit: 25,
  });

  const source = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'src', 'db', 'planner', 'meal_plan_product_candidate_builder.js'),
    'utf8',
  );
  assert(!/optimizeBasketSingleStore|optimizeBasketMultiStore|applyBasketConvenienceScoring/i.test(source), 'PLAN2B must not call optimizer paths');
  assert(!/firestore|sponsored/i.test(source), 'PLAN2B must stay out of Firestore and sponsored logic');

  console.log('PLAN2B meal-plan product candidate tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
