const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  LAYER_SELECTIONS,
  handleResolveShoppingListItemsRequest,
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

async function createResolutionStore() {
  const store = new InMemoryDataBackboneStore();
  const result = await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Chocolate Milk 1L","1001","6","2.99","0"',
      '"1000","Store A","Whole Milk 1L","1002","6","2.49","0"',
      '"1000","Store A","Free Range Eggs 10 Count","1003","8","5.49","0"',
      '"1000","Store A","Toilet Paper 10 Roll","1004","9","8.99","0"',
    ],
    ingestedAt: '2026-04-24T12:00:00.000Z',
  });
  const state = await store.load();
  const canonicalByName = new Map(
    result.state.canonical_products.map((product) => [product.canonical_display_name, product.canonical_product_id])
  );

  storeEnrichment(state, canonicalByName.get('Chocolate Milk 1L'), enrichment({
    base_product: 'milk',
    flavor: ['chocolate'],
    attributes: ['sweetened'],
    confidence: 0.96,
  }), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-24T12:01:00.000Z',
  });
  storeEnrichment(state, canonicalByName.get('Whole Milk 1L'), enrichment({
    base_product: 'milk',
    attributes: ['whole'],
    confidence: 0.92,
  }), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-24T12:01:30.000Z',
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
    createdAt: '2026-04-24T12:02:00.000Z',
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
    createdAt: '2026-04-24T12:02:30.000Z',
  });
  await store.save(state);

  return {
    store,
    canonicalByName,
  };
}

test('exact simple item resolves to the expected canonical product', async () => {
  const { store, canonicalByName } = await createResolutionStore();
  const result = await resolveShoppingListItems({
    store,
    items: [{ text: 'chocolate milk 1l' }],
  });

  assert.equal(result.layer_mode, LAYER_SELECTIONS.CANONICAL_WITH_ENRICHMENT);
  assert.equal(result.items[0].status, 'resolved');
  assert.equal(result.items[0].confidence, 'high');
  assert.equal(result.items[0].best_match.canonical_product_id, canonicalByName.get('Chocolate Milk 1L'));
  assert.equal(result.summary.resolved_count, 1);
});

test('ambiguous shopping-list items return ambiguous when candidates are close', async () => {
  const { store } = await createResolutionStore();
  const result = await resolveShoppingListItems({
    store,
    items: [{ text: 'milk' }],
  });

  assert.equal(result.items[0].status, 'ambiguous');
  assert.equal(result.items[0].candidates.length >= 2, true);
});

test('items with no candidates return unresolved', async () => {
  const { store } = await createResolutionStore();
  const result = await resolveShoppingListItems({
    store,
    items: [{ text: 'dragonfruit' }],
  });

  assert.equal(result.items[0].status, 'unresolved');
  assert.equal(result.items[0].confidence, 'none');
  assert.equal(result.items[0].best_match, null);
});

test('ranking reasons are included on candidate outputs', async () => {
  const { store } = await createResolutionStore();
  const result = await resolveShoppingListItems({
    store,
    items: [{ text: 'chocolate milk 1l' }],
  });

  const best = result.items[0].best_match;
  assert.equal(Array.isArray(best.match_reasons), true);
  assert.equal(best.match_reasons.includes('token_match'), true);
  assert.equal(best.match_reasons.includes('base_product_match'), true);
  assert.equal(best.match_reasons.includes('volume_match'), true);
});

test('limit_per_item is respected while keeping resolution policy deterministic', async () => {
  const { store } = await createResolutionStore();
  const result = await resolveShoppingListItems({
    store,
    items: [{ text: 'milk' }],
    limitPerItem: 1,
  });

  assert.equal(result.items[0].status, 'ambiguous');
  assert.equal(result.items[0].candidates.length, 1);
});

test('invalid layer mode is rejected safely', async () => {
  const { store } = await createResolutionStore();
  const response = await handleResolveShoppingListItemsRequest({
    store,
    body: {
      items: ['milk'],
      layer_mode: 'bad_layer',
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'invalid layer_mode');
});

test('empty requests are rejected', async () => {
  const { store } = await createResolutionStore();
  const response = await handleResolveShoppingListItemsRequest({
    store,
    body: {
      items: [],
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'items must be a non-empty array');
});

test('string and object item input shapes are both accepted', async () => {
  const { store } = await createResolutionStore();
  const response = await handleResolveShoppingListItemsRequest({
    store,
    body: {
      items: ['milk', { text: 'toilet paper' }],
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 2);
  assert.equal(response.body.items[1].status, 'resolved');
});

test('shopping-list resolution does not mutate canonical products, mappings, or enrichment cache', async () => {
  const { store } = await createResolutionStore();
  const before = await store.load();
  const baseline = JSON.parse(JSON.stringify({
    canonical_products: before.canonical_products,
    canonical_product_mappings: before.canonical_product_mappings,
    canonical_enrichment_store: before.canonical_enrichment_store,
  }));

  await handleResolveShoppingListItemsRequest({
    store,
    body: {
      items: ['milk', '10 eggs', 'toilet paper'],
      limit_per_item: 3,
    },
  });

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

  console.log(`\nPhase 15.3 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
