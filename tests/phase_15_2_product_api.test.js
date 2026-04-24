const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  DEFAULT_PRODUCT_LAYER_MODE,
  InMemoryDataBackboneStore,
  LAYER_SELECTIONS,
  handleCanonicalProductFilterFacetsRequest,
  handleGetCanonicalProductRequest,
  handleGetEnrichmentAnalyticsSummaryRequest,
  handleSearchCanonicalProductsRequest,
  importDailySnapshotCsvStream,
  storeEnrichment,
  upsertCanonicalDisambiguationDecision,
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
    snapshotDate: '2026-04-23',
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
    brand: 'vereya',
    product_line: null,
    flavor: ['chocolate'],
    attributes: ['low fat'],
    diet_tags: [],
    allergens: ['milk'],
    product_form: 'liquid',
    packaging: 'carton',
    usage_context: ['breakfast'],
    quality_tier: null,
    confidence: 0.91,
    ...overrides,
  });
}

async function createApiStore() {
  const store = new InMemoryDataBackboneStore();
  const result = await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Low Fat Chocolate Milk 1L","1001","6","2.99","0"',
      '"1000","Store A","Sparkling Water Lemon 1L","1002","6","1.49","0"',
      '"1000","Store A","Orange Juice Premium 1L","1003","6","3.29","0"',
    ],
    ingestedAt: '2026-04-23T12:00:00.000Z',
  });
  const state = await store.load();
  const canonicalByName = new Map(
    result.state.canonical_products.map((product) => [product.canonical_display_name, product.canonical_product_id])
  );
  const milkId = canonicalByName.get('Low Fat Chocolate Milk 1L');
  const waterId = canonicalByName.get('Sparkling Water Lemon 1L');
  const juiceId = canonicalByName.get('Orange Juice Premium 1L');

  storeEnrichment(state, milkId, enrichment(), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-23T12:01:00.000Z',
  });
  storeEnrichment(state, waterId, enrichment({
    base_product: 'water',
    category_l1: 'Food & Beverage',
    category_l2: 'Beverages',
    category_l3: 'Water',
    brand: null,
    flavor: ['lemon'],
    attributes: ['sparkling'],
    allergens: [],
    packaging: 'bottle',
    usage_context: ['hydration'],
    confidence: 0.84,
  }), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-23T12:02:00.000Z',
  });

  state.canonical_disambiguation_queue = [{
    warning_id: 'warn_product_api_merge',
    pair_fingerprint: 'fp_product_api_merge',
    product_a: {
      canonical_candidate_id: milkId,
      markers: {
        volume_marker: '1000ml',
        count_marker: null,
        age_band_marker: null,
        reserve_marker: null,
      },
    },
    product_b: {
      canonical_candidate_id: juiceId,
      markers: {
        volume_marker: '1000ml',
        count_marker: null,
        age_band_marker: null,
        reserve_marker: null,
      },
    },
    warning_reason: 'potential_over_canonicalization_name_divergence',
    status: 'reviewed_human',
    created_at: '2026-04-23T12:03:00.000Z',
    last_seen_at: '2026-04-23T12:03:00.000Z',
  }];
  upsertCanonicalDisambiguationDecision(state, {
    pair_fingerprint: 'fp_product_api_merge',
    decision: 'merge',
    confidence: 'high',
    reason_short: 'product api layer test',
    decisive_features: ['human_review'],
    decision_source: 'human',
    created_at: '2026-04-23T12:03:30.000Z',
  });
  await store.save(state);

  return {
    store,
    milkId,
    waterId,
    juiceId,
  };
}

test('product detail returns expected shape with default canonical_with_enrichment mode', async () => {
  const { store, milkId } = await createApiStore();
  const response = await handleGetCanonicalProductRequest({
    store,
    params: { id: milkId },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.layer_mode, DEFAULT_PRODUCT_LAYER_MODE);
  assert.equal(response.body.canonical_product_id, milkId);
  assert.equal(typeof response.body.canonical_name, 'string');
  assert.equal(typeof response.body.markers, 'object');
  assert.equal(response.body.markers.volume_marker, '1000ml');
  assert.equal(response.body.enrichment.base_product, 'milk');
});

test('search returns expected default layer and structured results', async () => {
  const { store } = await createApiStore();
  const response = await handleSearchCanonicalProductsRequest({
    store,
    body: {
      query: 'chocolate milk',
      filters: {
        category_l2: 'dairy',
      },
      limit: 25,
      offset: 0,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.layer_mode, DEFAULT_PRODUCT_LAYER_MODE);
  assert.equal(response.body.total >= 1, true);
  assert.equal(response.body.limit, 25);
  assert.equal(response.body.offset, 0);
  assert.equal(response.body.results[0].enrichment.category_l2, 'dairy');
});

test('invalid layer mode is rejected safely', async () => {
  const { store } = await createApiStore();
  const response = await handleSearchCanonicalProductsRequest({
    store,
    body: {
      query: 'milk',
      layer_mode: 'made_up_mode',
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'invalid layer_mode');
  assert.equal(Array.isArray(response.body.allowed_layer_modes), true);
});

test('filtering by enrichment fields works through search handler', async () => {
  const { store } = await createApiStore();
  const response = await handleSearchCanonicalProductsRequest({
    store,
    body: {
      query: 'lemon',
      filters: {
        category_l2: 'beverages',
        flavor: 'lemon',
        attributes: 'sparkling',
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.total, 1);
  assert.equal(response.body.results[0].enrichment.base_product, 'water');
});

test('facets return deterministic counts over filtered result set', async () => {
  const { store } = await createApiStore();
  const response = await handleCanonicalProductFilterFacetsRequest({
    store,
    body: {
      query: 'milk water juice',
      filters: {
        category_l1: 'food & beverage',
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.body.facets.category_l1), true);
  assert.equal(response.body.facets.category_l1[0].value, 'food & beverage');
  assert.equal(response.body.facets.base_product.some((entry) => entry.value === 'milk'), true);
  assert.equal(response.body.facets.flavor.some((entry) => entry.value === 'lemon'), true);
});

test('analytics summary returns expected rollups', async () => {
  const { store } = await createApiStore();
  const response = await handleGetEnrichmentAnalyticsSummaryRequest({
    store,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.layer_mode, DEFAULT_PRODUCT_LAYER_MODE);
  assert.equal(response.body.enrichment_coverage.covered_count, 2);
  assert.equal(response.body.counts_by_brand[0].value, 'vereya');
  assert.equal(response.body.counts_by_base_product.some((entry) => entry.value === 'milk'), true);
  assert.equal(response.body.counts_by_flavor.some((entry) => entry.value === 'chocolate'), true);
});

test('canonical ids and mappings are unchanged by product api handlers', async () => {
  const { store } = await createApiStore();
  const before = await store.load();
  const baseline = JSON.parse(JSON.stringify({
    canonical_products: before.canonical_products,
    canonical_product_mappings: before.canonical_product_mappings,
  }));

  await handleGetCanonicalProductRequest({
    store,
    params: { id: baseline.canonical_products[0].canonical_product_id },
  });
  await handleSearchCanonicalProductsRequest({
    store,
    body: {
      query: 'milk',
    },
  });
  await handleCanonicalProductFilterFacetsRequest({
    store,
    body: {
      filters: {
        category_l1: 'food & beverage',
      },
    },
  });
  await handleGetEnrichmentAnalyticsSummaryRequest({
    store,
  });

  const after = await store.load();
  assert.deepEqual(after.canonical_products, baseline.canonical_products);
  assert.deepEqual(after.canonical_product_mappings, baseline.canonical_product_mappings);
});

test('applied-view layer is only used when explicitly requested', async () => {
  const { store, milkId, juiceId } = await createApiStore();
  const defaultResponse = await handleGetCanonicalProductRequest({
    store,
    params: { id: juiceId },
  });
  const explicitAppliedResponse = await handleGetCanonicalProductRequest({
    store,
    params: { id: juiceId },
    query: {
      layer_mode: LAYER_SELECTIONS.CANONICAL_WITH_APPLIED_VIEW_AND_ENRICHMENT,
    },
  });

  assert.equal(defaultResponse.status, 200);
  assert.equal(defaultResponse.body.layer_mode, DEFAULT_PRODUCT_LAYER_MODE);
  assert.equal(defaultResponse.body.provenance.applied_view, null);
  assert.equal(explicitAppliedResponse.status, 200);
  assert.equal(explicitAppliedResponse.body.layer_mode, LAYER_SELECTIONS.CANONICAL_WITH_APPLIED_VIEW_AND_ENRICHMENT);
  assert.equal(explicitAppliedResponse.body.provenance.applied_view.merged_into_canonical_product_id, milkId);
});

test('product detail returns bounded not found response', async () => {
  const { store } = await createApiStore();
  const response = await handleGetCanonicalProductRequest({
    store,
    params: { id: 'missing_product' },
  });

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'product not found');
  assert.equal(response.body.canonical_product_id, 'missing_product');
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

  console.log(`\nPhase 15.2 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
