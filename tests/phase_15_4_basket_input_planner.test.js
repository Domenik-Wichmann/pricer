const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  buildBasketPlanFromResolvedItems,
  handleBuildBasketPlanRequest,
  importDailySnapshotCsvStream,
  resolveShoppingListItems,
  storeEnrichment,
  validateEnrichmentResponse,
} = require('../app/functions/src');
const { SOURCE_HEADERS } = require('../app/functions/src/phase1/constants');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createCsv(rows) {
  const header = [
    SOURCE_HEADERS.localityCode,
    SOURCE_HEADERS.storeNameRaw,
    SOURCE_HEADERS.productNameRaw,
    SOURCE_HEADERS.productCode,
    SOURCE_HEADERS.categoryCode,
    SOURCE_HEADERS.retailPrice,
    SOURCE_HEADERS.promoPrice,
  ].map((value) => `"${value}"`).join(',');

  return Readable.from([[header, ...rows].join('\n')]);
}

async function importInlineCsv({
  store,
  rows,
  sourceFileName = 'CHAIN_A_100.csv',
  ingestedAt,
}) {
  return importDailySnapshotCsvStream({
    store,
    csvStream: createCsv(rows),
    snapshotDate: '2026-04-24',
    sourceFileName,
    ingestedAt,
    enableLlmEnrichment: false,
  });
}

function enrichment(overrides = {}) {
  return validateEnrichmentResponse({
    base_product: 'milk',
    category_l1: 'Food & Beverage',
    category_l2: 'Dairy',
    category_l3: 'Milk',
    category_l4: null,
    brand: null,
    product_line: null,
    flavor: [],
    attributes: [],
    diet_tags: [],
    allergens: [],
    product_form: 'liquid',
    packaging: 'carton',
    usage_context: ['breakfast'],
    quality_tier: null,
    confidence: 0.9,
    ...overrides,
  });
}

async function createPlannerStore() {
  const store = new InMemoryDataBackboneStore();
  const result = await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Chocolate Milk 1L","1001","6","2.99","0"',
      '"1000","Store A","Whole Milk 1L","1002","6","2.49","0"',
      '"1000","Store A","Free Range Eggs 10 Count","1003","8","5.49","0"',
      '"1000","Store A","Toilet Paper 10 Roll","1004","9","8.99","0"',
    ],
    ingestedAt: '2026-04-24T13:00:00.000Z',
  });
  const state = await store.load();
  const canonicalByName = new Map(
    result.state.canonical_products.map((product) => [product.canonical_display_name, product.canonical_product_id])
  );

  storeEnrichment(state, canonicalByName.get('Chocolate Milk 1L'), enrichment({
    flavor: ['chocolate'],
    attributes: ['sweetened'],
    confidence: 0.96,
  }), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-24T13:01:00.000Z',
  });
  storeEnrichment(state, canonicalByName.get('Whole Milk 1L'), enrichment({
    attributes: ['whole'],
    confidence: 0.92,
  }), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-24T13:01:30.000Z',
  });
  storeEnrichment(state, canonicalByName.get('Free Range Eggs 10 Count'), enrichment({
    base_product: 'eggs',
    category_l2: 'Dairy',
    category_l3: null,
    product_form: 'solid',
    packaging: 'carton',
    usage_context: ['breakfast', 'cooking'],
    confidence: 0.89,
  }), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-24T13:02:00.000Z',
  });
  storeEnrichment(state, canonicalByName.get('Toilet Paper 10 Roll'), enrichment({
    base_product: 'toilet paper',
    category_l1: 'Household',
    category_l2: 'Paper Goods',
    category_l3: 'Toilet Paper',
    product_form: 'solid',
    packaging: 'bag',
    usage_context: ['home'],
    confidence: 0.87,
  }), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-24T13:02:30.000Z',
  });
  await store.save(state);

  return { store };
}

async function buildPlanForItems(store, items, options = {}) {
  const resolved = await resolveShoppingListItems({
    store,
    items,
  });

  return buildBasketPlanFromResolvedItems({
    resolvedItems: resolved.items,
    layerMode: resolved.layer_mode,
    options,
  });
}

test('all resolved items produce an optimization-ready basket plan', async () => {
  const { store } = await createPlannerStore();
  const plan = await buildPlanForItems(store, ['chocolate milk 1l', '10 eggs']);

  assert.equal(plan.optimization_ready, true);
  assert.equal(plan.requires_user_confirmation, false);
  assert.equal(plan.ready_items.length, 2);
  assert.equal(plan.ambiguous_items.length, 0);
  assert.equal(plan.unresolved_items.length, 0);
});

test('ambiguous carry_top_n keeps plan ready but requires confirmation', async () => {
  const { store } = await createPlannerStore();
  const plan = await buildPlanForItems(store, ['milk'], {
    ambiguous_policy: 'carry_top_n',
    ambiguous_top_n: 2,
  });

  assert.equal(plan.optimization_ready, true);
  assert.equal(plan.requires_user_confirmation, true);
  assert.equal(plan.ready_items.length, 0);
  assert.equal(plan.ambiguous_items.length, 1);
  assert.equal(plan.ambiguous_items[0].carried_candidates.length, 2);
});

test('ambiguous require_confirmation blocks optimization readiness', async () => {
  const { store } = await createPlannerStore();
  const plan = await buildPlanForItems(store, ['milk'], {
    ambiguous_policy: 'require_confirmation',
  });

  assert.equal(plan.optimization_ready, false);
  assert.equal(plan.requires_user_confirmation, true);
  assert.equal(plan.ambiguous_items.length, 1);
});

test('unresolved exclude keeps the plan ready while recording unresolved items', async () => {
  const { store } = await createPlannerStore();
  const plan = await buildPlanForItems(store, ['dragonfruit'], {
    unresolved_policy: 'exclude',
  });

  assert.equal(plan.optimization_ready, true);
  assert.equal(plan.unresolved_items.length, 1);
  assert.equal(plan.ready_items.length, 0);
});

test('unresolved block marks the plan as not optimization-ready', async () => {
  const { store } = await createPlannerStore();
  const plan = await buildPlanForItems(store, ['dragonfruit'], {
    unresolved_policy: 'block',
  });

  assert.equal(plan.optimization_ready, false);
  assert.equal(plan.unresolved_items.length, 1);
});

test('quantity and requested markers are preserved for ready items', async () => {
  const { store } = await createPlannerStore();
  const plan = await buildPlanForItems(store, ['chocolate milk 1l', '10 eggs']);

  const milk = plan.ready_items.find((item) => item.input_text === 'chocolate milk 1l');
  const eggs = plan.ready_items.find((item) => item.input_text === '10 eggs');
  assert.equal(milk.requested_quantity, 1);
  assert.equal(milk.requested_markers.volume_marker, '1000ml');
  assert.equal(eggs.requested_markers.count_marker, '10 count');
});

test('candidate carry logic respects ambiguous_top_n deterministically', async () => {
  const { store } = await createPlannerStore();
  const plan = await buildPlanForItems(store, ['milk'], {
    ambiguous_policy: 'carry_top_n',
    ambiguous_top_n: 1,
  });

  assert.equal(plan.ambiguous_items[0].carried_candidates.length, 1);
  assert.equal(plan.ambiguous_items[0].candidates.length >= 2, true);
});

test('basket planner endpoint does not mutate canonical products mappings or enrichment cache', async () => {
  const { store } = await createPlannerStore();
  const before = await store.load();
  const baseline = JSON.parse(JSON.stringify({
    canonical_products: before.canonical_products,
    canonical_product_mappings: before.canonical_product_mappings,
    canonical_enrichment_store: before.canonical_enrichment_store,
  }));

  const response = await handleBuildBasketPlanRequest({
    store,
    body: {
      items: ['milk', 'dragonfruit'],
      planner_options: {
        ambiguous_policy: 'carry_top_n',
        ambiguous_top_n: 2,
        unresolved_policy: 'exclude',
      },
    },
  });

  assert.equal(response.status, 200);
  const after = await store.load();
  assert.deepEqual(after.canonical_products, baseline.canonical_products);
  assert.deepEqual(after.canonical_product_mappings, baseline.canonical_product_mappings);
  assert.deepEqual(after.canonical_enrichment_store, baseline.canonical_enrichment_store);
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

  console.log(`\nPhase 15.4 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
