const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  buildBasketPlanFromResolvedItems,
  handleLookupCanonicalProductPricesRequest,
  importDailySnapshotCsvStream,
  lookupCanonicalProductPrices,
  lookupPricesForBasketPlan,
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
  snapshotDate,
  sourceFileName,
  ingestedAt,
}) {
  return importDailySnapshotCsvStream({
    store,
    csvStream: createCsv(rows),
    snapshotDate,
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
    allergens: ['milk'],
    product_form: 'liquid',
    packaging: 'carton',
    usage_context: ['breakfast'],
    quality_tier: null,
    confidence: 0.9,
    ...overrides,
  });
}

async function createPriceLookupStore() {
  const store = new InMemoryDataBackboneStore();

  const first = await importInlineCsv({
    store,
    snapshotDate: '2026-04-24',
    sourceFileName: 'KAUFLAND_100.csv',
    ingestedAt: '2026-04-24T09:00:00.000Z',
    rows: [
      '"1000","Kaufland Mladost","Chocolate Milk 1L","1001","6","2.49","0"',
      '"1000","Kaufland Mladost","Whole Milk 1L","1002","6","2.79","2.29"',
    ],
  });
  await importInlineCsv({
    store,
    snapshotDate: '2026-04-24',
    sourceFileName: 'LIDL_100.csv',
    ingestedAt: '2026-04-24T10:00:00.000Z',
    rows: [
      '"1000","Lidl Mladost","Chocolate Milk 1L","2001","6","2.39","0"',
    ],
  });
  await importInlineCsv({
    store,
    snapshotDate: '2026-04-01',
    sourceFileName: 'FANTASTICO_100.csv',
    ingestedAt: '2026-04-01T11:00:00.000Z',
    rows: [
      '"1000","Fantastico Mladost","Free Range Eggs 10 Count","3001","8","5.19","0"',
    ],
  });

  const state = await store.load();
  const canonicalByName = new Map(
    state.canonical_products.map((product) => [product.canonical_display_name, product.canonical_product_id])
  );
  const chocolateMilkId = canonicalByName.get('Chocolate Milk 1L');
  const wholeMilkId = canonicalByName.get('Whole Milk 1L');
  const eggsId = canonicalByName.get('Free Range Eggs 10 Count');

  storeEnrichment(state, chocolateMilkId, enrichment({
    flavor: ['chocolate'],
    attributes: ['sweetened'],
    confidence: 0.96,
  }), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-24T11:00:00.000Z',
  });
  storeEnrichment(state, wholeMilkId, enrichment({
    attributes: ['whole'],
    confidence: 0.91,
  }), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-24T11:00:30.000Z',
  });
  storeEnrichment(state, eggsId, enrichment({
    base_product: 'eggs',
    category_l3: null,
    product_form: 'solid',
    packaging: 'carton',
    usage_context: ['breakfast', 'cooking'],
    confidence: 0.89,
  }), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-24T11:01:00.000Z',
  });
  await store.save(state);

  return {
    store,
    canonicalIds: {
      chocolateMilkId,
      wholeMilkId,
      eggsId,
    },
  };
}

async function buildBasketPlan(store, items, options = {}) {
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

test('latest price lookup by canonical product id returns priced records and deterministic best price', async () => {
  const { store, canonicalIds } = await createPriceLookupStore();
  const result = await lookupCanonicalProductPrices({
    store,
    canonicalProductIds: [canonicalIds.chocolateMilkId],
  });

  assert.equal(result.price_mode, 'latest');
  assert.equal(result.currency, 'EUR');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].price_status, 'priced');
  assert.equal(result.items[0].price_records.length, 2);
  assert.equal(result.items[0].best_price.price, 2.39);
  assert.equal(result.items[0].best_price.chain_id, 'lidl');
});

test('price lookup scopes Firestore-style reads to requested canonical and source ids', async () => {
  const { store, canonicalIds } = await createPriceLookupStore();
  const calls = [];
  const scopedStore = {
    async load() {
      calls.push({ type: 'load' });
      throw new Error('full store load should not be used for price lookup');
    },
    async queryCollectionByFieldValues(collectionName, options) {
      calls.push({ type: 'queryCollectionByFieldValues', collectionName, options });
      return store.queryCollectionByFieldValues(collectionName, options);
    },
  };

  const result = await lookupCanonicalProductPrices({
    store: scopedStore,
    canonicalProductIds: [canonicalIds.chocolateMilkId],
  });

  assert.equal(result.items[0].price_status, 'priced');
  assert.deepEqual(calls.map((call) => call.collectionName), [
    'canonical_product_mappings',
    'source_products',
    'raw_price_snapshots',
  ]);
  assert.equal(calls.some((call) => call.collectionName === 'product_daily_prices'), false);
  assert.deepEqual(calls[0].options, {
    fieldName: 'canonical_product_id',
    values: [canonicalIds.chocolateMilkId],
  });
});

test('missing canonical product prices return missing status', async () => {
  const { store } = await createPriceLookupStore();
  const result = await lookupCanonicalProductPrices({
    store,
    canonicalProductIds: ['cp_missing'],
  });

  assert.equal(result.items[0].price_status, 'missing');
  assert.equal(result.items[0].price_records.length, 0);
  assert.equal(result.items[0].best_price, null);
});

test('stale prices remain explicit when latest snapshot is older than max_age_days', async () => {
  const { store, canonicalIds } = await createPriceLookupStore();
  const result = await lookupCanonicalProductPrices({
    store,
    canonicalProductIds: [canonicalIds.eggsId],
    options: {
      max_age_days: 14,
    },
  });

  assert.equal(result.items[0].price_status, 'stale');
  assert.equal(result.items[0].best_price, null);
  assert.equal(result.items[0].price_records[0].snapshot_date, '2026-04-01');
});

test('chain and store filters are applied deterministically', async () => {
  const { store, canonicalIds } = await createPriceLookupStore();
  const filteredByChain = await lookupCanonicalProductPrices({
    store,
    canonicalProductIds: [canonicalIds.chocolateMilkId],
    options: {
      chain_ids: ['kaufland'],
    },
  });
  const filteredByStore = await lookupCanonicalProductPrices({
    store,
    canonicalProductIds: [canonicalIds.chocolateMilkId],
    options: {
      store_ids: ['1000::kaufland-mladost'],
    },
  });

  assert.equal(filteredByChain.items[0].price_records.length, 1);
  assert.equal(filteredByChain.items[0].price_records[0].chain_id, 'kaufland');
  assert.equal(filteredByStore.items[0].price_records.length, 1);
  assert.equal(filteredByStore.items[0].price_records[0].store_id, '1000::kaufland-mladost');
});

test('best price uses lowest valid current price after promo normalization', async () => {
  const { store, canonicalIds } = await createPriceLookupStore();
  const result = await lookupCanonicalProductPrices({
    store,
    canonicalProductIds: [canonicalIds.wholeMilkId],
  });

  assert.equal(result.items[0].price_status, 'priced');
  assert.equal(result.items[0].best_price.price, 2.29);
  assert.equal(result.items[0].price_records[0].price, 2.29);
});

test('price lookup endpoint validates bounded request errors safely', async () => {
  const { store } = await createPriceLookupStore();
  const missingIds = await handleLookupCanonicalProductPricesRequest({
    store,
    body: {
      canonical_product_ids: [],
    },
  });
  const invalidMode = await handleLookupCanonicalProductPricesRequest({
    store,
    body: {
      canonical_product_ids: ['cp_1'],
      options: {
        price_mode: 'average',
      },
    },
  });

  assert.equal(missingIds.status, 400);
  assert.equal(missingIds.body.error, 'canonical_product_ids must be a non-empty array');
  assert.equal(invalidMode.status, 400);
  assert.equal(invalidMode.body.error, 'invalid price_mode');
});

test('basket-plan price lookup collects ready items and carried ambiguous candidates', async () => {
  const { store } = await createPriceLookupStore();
  const basketPlan = await buildBasketPlan(store, ['milk', '10 eggs'], {
    ambiguous_policy: 'carry_top_n',
    ambiguous_top_n: 2,
  });
  const result = await lookupPricesForBasketPlan({
    store,
    basketPlan,
  });

  assert.equal(result.price_lookup.summary.requested_count, 3);
  assert.equal(result.price_lookup.items.some((item) => item.price_status === 'stale'), true);
  assert.equal(result.price_lookup.items.some((item) => item.price_status === 'priced'), true);
});

test('price lookup does not mutate basket plans canonical products mappings or snapshots', async () => {
  const { store } = await createPriceLookupStore();
  const basketPlan = await buildBasketPlan(store, ['milk'], {
    ambiguous_policy: 'carry_top_n',
    ambiguous_top_n: 2,
  });
  const before = await store.load();
  const baseline = JSON.parse(JSON.stringify({
    basketPlan,
    canonical_products: before.canonical_products,
    canonical_product_mappings: before.canonical_product_mappings,
    raw_price_snapshots: before.raw_price_snapshots,
  }));

  const result = await lookupPricesForBasketPlan({
    store,
    basketPlan,
  });

  const after = await store.load();
  assert.deepEqual(result.basket_plan, baseline.basketPlan);
  assert.deepEqual(after.canonical_products, baseline.canonical_products);
  assert.deepEqual(after.canonical_product_mappings, baseline.canonical_product_mappings);
  assert.deepEqual(after.raw_price_snapshots, baseline.raw_price_snapshots);
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

  console.log(`\nPhase 16.0 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
