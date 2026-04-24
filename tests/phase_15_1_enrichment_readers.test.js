const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  LAYER_SELECTIONS,
  buildCanonicalEnrichmentAnalytics,
  getCanonicalProductViewById,
  importDailySnapshotCsvStream,
  isLlmEnrichmentEnabled,
  listCanonicalProductViews,
  searchCanonicalProductViews,
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
  canonicalEnrichmentClient = null,
  enableLlmEnrichment = undefined,
  enrichmentApiKey = undefined,
}) {
  return importDailySnapshotCsvStream({
    store,
    csvStream: createCsv(rows),
    snapshotDate: '2026-04-23',
    sourceFileName,
    ingestedAt,
    canonicalEnrichmentClient,
    enableLlmEnrichment,
    enrichmentApiKey,
  });
}

function normalizedEnrichment(overrides = {}) {
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

async function createStoreWithCanonicalProducts() {
  const store = new InMemoryDataBackboneStore();
  const result = await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","Low Fat Chocolate Milk 1L","1001","6","2.99","0"',
      '"1000","Store A","Sparkling Water Lemon 1L","1002","6","1.49","0"',
      '"1000","Store A","Orange Juice Premium 1L","1003","6","3.29","0"',
    ],
    ingestedAt: '2026-04-23T11:00:00.000Z',
    enableLlmEnrichment: false,
  });
  const state = await store.load();
  const canonicalByName = new Map(
    result.state.canonical_products.map((product) => [product.canonical_display_name, product.canonical_product_id])
  );

  storeEnrichment(state, canonicalByName.get('Low Fat Chocolate Milk 1L'), normalizedEnrichment(), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-23T11:01:00.000Z',
  });
  storeEnrichment(state, canonicalByName.get('Sparkling Water Lemon 1L'), normalizedEnrichment({
    base_product: 'water',
    category_l1: 'Food & Beverage',
    category_l2: 'Beverages',
    category_l3: 'Water',
    brand: null,
    flavor: ['lemon'],
    attributes: ['sparkling'],
    allergens: [],
    usage_context: ['hydration'],
    packaging: 'bottle',
    confidence: 0.84,
  }), {
    modelName: 'seed-model',
    promptVersion: 'v1',
    createdAt: '2026-04-23T11:02:00.000Z',
  });
  await store.save(state);

  return {
    store,
    state: await store.load(),
    canonicalByName,
  };
}

test('canonical product view can combine canonical truth, applied view, and enrichment explicitly', async () => {
  const { store, state, canonicalByName } = await createStoreWithCanonicalProducts();
  const milkId = canonicalByName.get('Low Fat Chocolate Milk 1L');
  const juiceId = canonicalByName.get('Orange Juice Premium 1L');
  const nextState = await store.load();
  nextState.canonical_disambiguation_queue = [{
    warning_id: 'warn_phase15_1_merge',
    pair_fingerprint: 'fp_phase15_1_merge',
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
    created_at: '2026-04-23T11:03:00.000Z',
    last_seen_at: '2026-04-23T11:03:00.000Z',
  }];
  upsertCanonicalDisambiguationDecision(nextState, {
    pair_fingerprint: 'fp_phase15_1_merge',
    decision: 'merge',
    confidence: 'high',
    reason_short: 'reviewed for applied grouping test',
    decisive_features: ['human_review'],
    decision_source: 'human',
    created_at: '2026-04-23T11:03:30.000Z',
  });
  await store.save(nextState);

  const view = getCanonicalProductViewById({
    state: await store.load(),
    canonicalProductId: juiceId,
    layerSelection: LAYER_SELECTIONS.CANONICAL_WITH_APPLIED_VIEW_AND_ENRICHMENT,
  });

  assert.equal(view.layer_selection, LAYER_SELECTIONS.CANONICAL_WITH_APPLIED_VIEW_AND_ENRICHMENT);
  assert.equal(view.canonical_product_id, juiceId);
  assert.equal(view.effective_canonical_product_id, milkId);
  assert.equal(view.applied_view.merged_into_canonical_product_id, milkId);
  assert.deepEqual(view.applied_view.group_member_canonical_product_ids, [milkId, juiceId]);
  assert.equal(view.enrichment, null);
});

test('list and search canonical product views support deterministic enrichment filters', async () => {
  const { state } = await createStoreWithCanonicalProducts();

  const dairyViews = listCanonicalProductViews({
    state,
    layerSelection: LAYER_SELECTIONS.CANONICAL_WITH_ENRICHMENT,
    filters: {
      category_l2: 'dairy',
      brand: 'vereya',
      base_product: 'milk',
    },
  });
  const beverageViews = listCanonicalProductViews({
    state,
    layerSelection: LAYER_SELECTIONS.CANONICAL_WITH_ENRICHMENT,
    filters: {
      category_l2: 'beverages',
    },
  });
  const searchResults = searchCanonicalProductViews({
    state,
    layerSelection: LAYER_SELECTIONS.CANONICAL_WITH_ENRICHMENT,
    queryText: 'lemon sparkling',
    filters: {
      flavor: 'lemon',
      attributes: 'sparkling',
    },
  });

  assert.equal(dairyViews.length, 1);
  assert.equal(dairyViews[0].enrichment.brand, 'vereya');
  assert.equal(beverageViews.length, 1);
  assert.equal(beverageViews[0].enrichment.base_product, 'water');
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].enrichment.flavor[0], 'lemon');
});

test('enrichment analytics return rollups and ingest-run summaries', async () => {
  const { state } = await createStoreWithCanonicalProducts();
  const analytics = buildCanonicalEnrichmentAnalytics({
    state,
    layerSelection: LAYER_SELECTIONS.CANONICAL_WITH_ENRICHMENT,
  });

  assert.equal(analytics.total_view_count, 3);
  assert.equal(analytics.enrichment_coverage.covered_count, 2);
  assert.equal(analytics.enrichment_coverage.uncovered_count, 1);
  assert.equal(analytics.counts_by_category_l2[0].value, 'beverages');
  assert.equal(analytics.counts_by_brand[0].value, 'vereya');
  assert.equal(analytics.counts_by_base_product.some((entry) => entry.value === 'milk'), true);
  assert.equal(analytics.counts_by_flavor.some((entry) => entry.value === 'chocolate'), true);
  assert.equal(typeof analytics.ingest_enrichment_run_summary.ingest_run_count, 'number');
});

test('layer boundary behavior rejects enrichment filters on canonical-truth-only readers', async () => {
  const { state } = await createStoreWithCanonicalProducts();

  assert.throws(
    () => listCanonicalProductViews({
      state,
      layerSelection: LAYER_SELECTIONS.CANONICAL_TRUTH,
      filters: {
        category_l1: 'food & beverage',
      },
    }),
    /does not include enrichment filters/
  );
});

test('live enrichment default intent is enabled unless env explicitly disables it', () => {
  assert.equal(isLlmEnrichmentEnabled({}), true);
  assert.equal(isLlmEnrichmentEnabled({ ENABLE_LLM_ENRICHMENT: 'true' }), true);
  assert.equal(isLlmEnrichmentEnabled({ ENABLE_LLM_ENRICHMENT: 'false' }), false);
});

test('live enrichment remains non-blocking when enabled but XAI_API_KEY is missing', async () => {
  const store = new InMemoryDataBackboneStore();
  const result = await importInlineCsv({
    store,
    rows: [
      '"1000","Store A","New Product Without Cache 1L","9001","6","2.99","0"',
    ],
    ingestedAt: '2026-04-23T11:10:00.000Z',
    enableLlmEnrichment: true,
    enrichmentApiKey: null,
  });

  assert.equal(result.canonical_product_count, 1);
  assert.equal(result.canonical_enrichment_count, 0);
  assert.equal(result.canonical_enrichment_created_count, 0);
  assert.equal(result.canonical_enrichment_rejected_count, 0);
  assert.equal(result.canonical_enrichment_offline_missing_count, 1);
  assert.equal(result.state.canonical_products.length, 1);
  assert.equal(result.state.canonical_product_mappings.length, 1);
});

test('reader and analytics helpers do not mutate canonical truth', async () => {
  const { state } = await createStoreWithCanonicalProducts();
  const before = JSON.parse(JSON.stringify({
    canonical_products: state.canonical_products,
    canonical_product_mappings: state.canonical_product_mappings,
  }));

  listCanonicalProductViews({
    state,
    layerSelection: LAYER_SELECTIONS.CANONICAL_WITH_ENRICHMENT,
  });
  searchCanonicalProductViews({
    state,
    layerSelection: LAYER_SELECTIONS.CANONICAL_WITH_ENRICHMENT,
    queryText: 'milk',
  });
  buildCanonicalEnrichmentAnalytics({
    state,
    layerSelection: LAYER_SELECTIONS.CANONICAL_WITH_ENRICHMENT,
  });

  assert.deepEqual(state.canonical_products, before.canonical_products);
  assert.deepEqual(state.canonical_product_mappings, before.canonical_product_mappings);
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

  console.log(`\nPhase 15.1 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
