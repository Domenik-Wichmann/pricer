const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  DEFAULT_PRODUCT_LAYER_MODE,
  GROCERY_SYNONYM_CONCEPTS,
  InMemoryDataBackboneStore,
  LAYER_SELECTIONS,
  buildCurrentOfferReadModel,
  buildGroceryQueryExpansion,
  handleCanonicalProductFilterFacetsRequest,
  handleGetCanonicalProductRequest,
  handleGetEnrichmentAnalyticsSummaryRequest,
  handleSearchCanonicalProductsRequest,
  importDailySnapshotCsvStream,
  selectEnrichmentPilotCandidates,
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
  const milkCanonical = state.canonical_products.find((product) => product.canonical_product_id === milkId);
  if (milkCanonical) {
    milkCanonical.canonical_attributes_json = JSON.stringify({
      volume_marker: '1000ml',
      size_marker: {
        raw_text: '1L',
        quantity: 1000,
        unit: 'ml',
        total_quantity: 1000,
        total_unit: 'ml',
        pack_count: null,
        unit_quantity: null,
        unit_quantity_unit: null,
        display: '1000 ml',
        normalized_display: '1000 ml',
      },
    });
  }

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
  const readModelState = await store.load();
  const readModel = buildCurrentOfferReadModel({
    state: readModelState,
    generatedAt: '2026-04-23T12:04:00.000Z',
  });
  readModelState.current_product_offers = readModel.current_product_offers;
  readModelState.canonical_current_offer_summary = readModel.canonical_current_offer_summary;
  await store.save(readModelState);

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
  assert.equal(response.body.markers.size_marker.normalized_display, '1000 ml');
  assert.equal(response.body.markers.size_marker.total_quantity, 1000);
  assert.equal(response.body.markers.size_marker.total_unit, 'ml');
  assert.equal(response.body.enrichment.base_product, 'milk');
  assert.equal(Array.isArray(response.body.provenance.source_product_ids), true);
  assert.equal(response.body.provenance.source_product_ids.length, 1);
  assert.equal(typeof response.body.provenance.source_product_ids[0], 'string');
  assert.equal(Array.isArray(response.body.provenance.canonical_mappings), true);
  assert.equal(response.body.provenance.canonical_mappings[0].source_product_id, response.body.provenance.source_product_ids[0]);
  assert.equal(Array.isArray(response.body.current_offers), true);
  assert.equal(response.body.current_offers.length, 1);
  assert.equal(response.body.current_offers[0].source_product_id, response.body.provenance.source_product_ids[0]);
  assert.equal(response.body.current_offer_summary.offer_count, 1);
});

test('product detail uses scoped catalog reads without raw snapshots', async () => {
  const { store, milkId } = await createApiStore();
  const scopedStore = createScopedStoreProxy(store);
  const response = await handleGetCanonicalProductRequest({
    store: scopedStore,
    params: { id: milkId },
  });

  assert.equal(response.status, 200);
  assert.equal(scopedStore.calls.some((call) => call.type === 'load'), false);
  assert.equal(scopedStore.loadedCollections.has('canonical_products'), false);
  assert.equal(scopedStore.loadedCollections.has('canonical_enrichment_store'), false);
  assert.equal(scopedStore.loadedCollections.has('raw_price_snapshots'), false);
  assert.equal(scopedStore.loadedCollections.has('product_daily_prices'), false);
  assert.equal(scopedStore.calls.some((call) =>
    call.type === 'queryCollectionByFieldValues' &&
    call.collectionName === 'current_product_offers' &&
    call.fieldName === 'canonical_product_id'
  ), true);
  assert.equal(scopedStore.calls.some((call) =>
    call.type === 'queryCollection' &&
    call.collectionName === 'canonical_product_mappings' &&
    call.fieldName === 'canonical_product_id'
  ), true);
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
  assert.equal(response.body.results[0].markers.volume_marker, '1000ml');
  assert.equal(response.body.results[0].markers.size_marker.normalized_display, '1000 ml');
  assert.equal(response.body.results[0].markers.size_marker.total_quantity, 1000);
  assert.equal(response.body.results[0].current_offer_summary.min_current_price, 2.99);
  assert.equal(response.body.results[0].current_offer_summary.max_current_price, 2.99);
  assert.equal(response.body.results[0].current_offer_summary.avg_current_price, 2.99);
  assert.equal(response.body.results[0].current_offer_summary.offer_count, 1);
  assert.equal(typeof response.body.results[0].current_offer_summary.cheapest_offer_id, 'string');
  assert.equal(response.body.results[0].current_offer_summary.currency, 'EUR');
  assert.equal(typeof response.body.results[0].search_debug.match_tier, 'string');
});

test('search and enrichment pilot exclude suspicious multi-row canonical products', async () => {
  const badName = 'Krina; Бял боб,7208918,46,1.84,\n68134,107 - Sofia/bul. Test,Eko Mes,7208342,28,7.66,Colgate shampoo,coffee,water,ham';
  const store = new InMemoryDataBackboneStore({
    canonical_products: [
      productFixture('cp_bad_chunk', badName, 'pastry_sheets', 'боб'),
      productFixture('cp_good_beans', 'Krina Бял боб консерва 400 г', 'beans', 'Krina'),
      productFixture('cp_quoted_brand', 'КРАВЕ СИРЕНЕ САЛАКИС "ПРЕЗИДЕНТ"', 'cheese', 'Президент'),
      {
        ...productFixture('cp_quarantined_beans', 'Krina bad quarantined beans 800 g', 'beans', 'Krina'),
        data_quality_status: 'invalid',
        data_quality_reasons: ['contains_newline'],
        quarantine_source: 'phase6_bad_product_audit_v1',
      },
    ],
    canonical_product_mappings: [],
    canonical_enrichment_store: [],
    gap_signal_store: [],
  });

  const response = await handleSearchCanonicalProductsRequest({
    store,
    body: { query: 'боб', limit: 10 },
  });
  const quotedBrandResponse = await handleSearchCanonicalProductsRequest({
    store,
    body: { query: 'президент', limit: 10 },
  });
  const state = await store.load();
  const candidates = selectEnrichmentPilotCandidates({
    state,
    query: 'боб',
    limit: 10,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.results.some((item) => item.canonical_product_id === 'cp_bad_chunk'), false);
  assert.equal(response.body.results.some((item) => item.canonical_product_id === 'cp_quarantined_beans'), false);
  assert.equal(response.body.results.some((item) => item.canonical_product_id === 'cp_good_beans'), true);
  assert.equal(quotedBrandResponse.body.results.some((item) => item.canonical_product_id === 'cp_quoted_brand'), true);
  assert.equal(candidates.some((item) => item.canonical_product_id === 'cp_bad_chunk'), false);
  assert.equal(candidates.some((item) => item.canonical_product_id === 'cp_quarantined_beans'), false);
});

test('search uses scoped catalog reads and gap-signal upsert without raw snapshots', async () => {
  const { store } = await createApiStore();
  const scopedStore = createScopedStoreProxy(store);
  const response = await handleSearchCanonicalProductsRequest({
    store: scopedStore,
    body: {
      query: 'chocolate milk',
      limit: 5,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(scopedStore.calls.some((call) => call.type === 'load'), false);
  assert.equal(scopedStore.calls.some((call) =>
    call.type === 'queryCollectionPrefix' &&
    call.collectionName === 'canonical_products'
  ), true);
  assert.equal(scopedStore.loadedCollections.has('canonical_product_mappings'), false);
  assert.equal(scopedStore.loadedCollections.has('raw_price_snapshots'), false);
  assert.equal(scopedStore.loadedCollections.has('product_daily_prices'), false);
  assert.equal(scopedStore.loadedCollections.has('canonical_current_offer_summary'), false);
  assert.equal(scopedStore.calls.some((call) =>
    call.type === 'queryCollectionByFieldValues' &&
    call.collectionName === 'canonical_current_offer_summary' &&
    call.fieldName === 'canonical_product_id' &&
    call.values.length > 0 &&
    call.values.length <= 100
  ), true);
  assert.equal(scopedStore.calls.some((call) => call.type === 'upsertRecord' && call.collectionName === 'gap_signal_store'), true);
});

test('search returns null price summary when the compact summary is missing', async () => {
  const { store } = await createApiStore();
  const state = await store.load();
  state.canonical_current_offer_summary = [];
  await store.save(state);

  const response = await handleSearchCanonicalProductsRequest({
    store,
    body: {
      query: 'chocolate milk',
      limit: 5,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.results.length > 0, true);
  assert.equal(response.body.results[0].current_offer_summary, null);
});

test('search result shape remains backward-compatible after price summary is added', async () => {
  const { store } = await createApiStore();
  const response = await handleSearchCanonicalProductsRequest({
    store,
    body: {
      query: 'chocolate milk',
      limit: 5,
    },
  });
  const result = response.body.results[0];

  assert.equal(response.status, 200);
  assert.equal(typeof result.canonical_product_id, 'string');
  assert.equal(typeof result.canonical_name, 'string');
  assert.equal(typeof result.markers, 'object');
  assert.equal(typeof result.enrichment, 'object');
  assert.equal(typeof result.search_debug, 'object');
  assert.equal(typeof result.current_offer_summary, 'object');
});

test('search scoped prefix reads include uppercase Cyrillic variants', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [{
      canonical_product_id: 'cp_upper_milk',
      canonical_display_name: '\u041c\u041b\u042f\u041a\u041e \u0422\u0415\u0421\u0422 1\u041b',
      canonical_brand: null,
      canonical_product_type: null,
      canonical_category_code: '6',
      canonical_attributes_json: JSON.stringify({ volume_marker: '1000ml' }),
      source_example_name: '\u041c\u041b\u042f\u041a\u041e \u0422\u0415\u0421\u0422 1\u041b',
      source_product_count: 1,
    }],
    canonical_enrichment_store: [],
    gap_signal_store: [],
  });
  const scopedStore = createScopedStoreProxy(store);
  const response = await handleSearchCanonicalProductsRequest({
    store: scopedStore,
    body: {
      query: '\u043c\u043b\u044f\u043a\u043e',
      limit: 5,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.results[0].canonical_product_id, 'cp_upper_milk');
  assert.equal(scopedStore.calls.some((call) =>
    call.type === 'queryCollectionPrefix' &&
    call.collectionName === 'canonical_products' &&
    call.prefix === '\u041c\u041b\u042f\u041a\u041e'
  ), true);
});

test('grocery synonym foundation expands common English queries to Bulgarian equivalents', () => {
  assert.equal(GROCERY_SYNONYM_CONCEPTS.length, 101);
  assert.deepEqual(
    buildGroceryQueryExpansion('milk').expanded_terms.includes('\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e'),
    true
  );
  assert.equal(buildGroceryQueryExpansion('yogurt').expanded_terms.includes('\u043a\u0438\u0441\u0435\u043b\u043e \u043c\u043b\u044f\u043a\u043e'), true);
  assert.equal(buildGroceryQueryExpansion('butter').expanded_terms.includes('\u043a\u0440\u0430\u0432\u0435 \u043c\u0430\u0441\u043b\u043e'), true);
  assert.equal(buildGroceryQueryExpansion('olive oil').expanded_terms.includes('\u0437\u0435\u0445\u0442\u0438\u043d'), true);
  assert.equal(buildGroceryQueryExpansion('olive oil').matched_concepts.some((concept) => concept.id === 'oil_sunflower'), false);
  assert.equal(buildGroceryQueryExpansion('olive oil').expanded_terms.includes('\u043a\u0440\u0430\u0432\u0435 \u043c\u0430\u0441\u043b\u043e'), false);
  assert.equal(buildGroceryQueryExpansion('baby formula').expanded_terms.includes('\u0430\u0434\u0430\u043f\u0442\u0438\u0440\u0430\u043d\u043e \u043c\u043b\u044f\u043a\u043e'), true);
});

test('cookies and snacks expand to deterministic BG category terms', () => {
  const cookies = buildGroceryQueryExpansion('cookies');
  const snacks = buildGroceryQueryExpansion('snacks');

  assert.equal(cookies.expanded_terms.includes('\u0431\u0438\u0441\u043a\u0432\u0438\u0442\u0438'), true);
  assert.equal(cookies.expanded_terms.includes('\u043a\u0443\u0440\u0430\u0431\u0438\u0438'), true);
  assert.equal(cookies.expanded_terms.includes('\u0441\u043b\u0430\u0434\u043a\u0438'), true);
  assert.equal(snacks.expanded_terms.includes('\u0447\u0438\u043f\u0441'), true);
  assert.equal(snacks.expanded_terms.includes('\u0441\u043e\u043b\u0435\u0442\u0438'), true);
  assert.equal(snacks.expanded_terms.includes('\u043a\u0440\u0435\u043a\u0435\u0440\u0438'), true);
  assert.equal(snacks.expanded_terms.includes('\u0432\u0430\u0444\u043b\u0438'), true);
  assert.equal(snacks.expanded_terms.includes('\u0434\u0435\u0441\u0435\u0440\u0442'), true);
});

test('Coca-Cola and coke expand to beverage aliases without shampoo equivalence', () => {
  const cola = buildGroceryQueryExpansion('Coca-Cola');
  const coke = buildGroceryQueryExpansion('coke');

  assert.equal(cola.expanded_terms.includes('coca cola'), true);
  assert.equal(cola.expanded_terms.includes('\u043a\u043e\u043a\u0430-\u043a\u043e\u043b\u0430'), true);
  assert.equal(coke.expanded_terms.includes('\u043a\u043e\u043b\u0430'), true);
  assert.equal(cola.expanded_terms.includes('shampoo'), false);
});

test('search uses enrichment aliases and product_type for cookies and snacks', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [
      productFixture('cp_cookie_alias', 'Sweet round 200 g', null),
      productFixture('cp_chips_alias', 'Crunchy potato 90 g', null),
    ],
    canonical_enrichment_store: [],
    gap_signal_store: [],
  });
  const state = await store.load();
  storeEnrichment(state, 'cp_cookie_alias', enrichment({
    base_product: 'cookie',
    product_type: 'cookie',
    product_family: 'snacks',
    category_l2: 'Bakery',
    category_l3: 'Biscuits',
    category: 'snacks',
    subcategory: 'biscuits',
    brand: null,
    flavor: [],
    attributes: [],
    allergens: [],
    product_form: 'solid',
    packaging: 'box',
    usage_context: ['snack'],
    search_aliases_bg: ['\u0431\u0438\u0441\u043a\u0432\u0438\u0442\u0438', '\u043a\u0443\u0440\u0430\u0431\u0438\u0438'],
    search_aliases_en: ['cookies', 'biscuits'],
  }));
  storeEnrichment(state, 'cp_chips_alias', enrichment({
    base_product: 'chips',
    product_type: 'chips',
    product_family: 'snacks',
    category_l2: 'Snacks',
    category_l3: 'Chips',
    category: 'snacks',
    subcategory: 'chips',
    brand: null,
    flavor: [],
    attributes: [],
    allergens: [],
    product_form: 'solid',
    packaging: 'bag',
    usage_context: ['snack'],
    search_aliases_bg: ['\u0447\u0438\u043f\u0441', '\u0441\u043d\u0430\u043a\u0441'],
    search_aliases_en: ['snacks', 'chips'],
  }));
  await store.save(state);

  const cookies = await handleSearchCanonicalProductsRequest({ store, body: { query: 'cookies', limit: 5 } });
  const snacks = await handleSearchCanonicalProductsRequest({ store, body: { query: 'snacks', limit: 5 } });

  assert.equal(cookies.status, 200);
  assert.equal(cookies.body.results[0].canonical_product_id, 'cp_cookie_alias');
  assert.equal(cookies.body.results[0].search_debug.matched_enrichment.product_type, 'cookie');
  assert.equal(snacks.status, 200);
  assert.equal(snacks.body.results.some((item) => item.canonical_product_id === 'cp_chips_alias'), true);
});

test('cola beverage intent demotes personal care shampoo when enrichment exists', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [
      productFixture('cp_cola_beverage', 'Coca-Cola Original 1L', null, 'Coca-Cola'),
      productFixture('cp_cola_shampoo', 'Cola Shampoo 400 ml', null, null),
    ],
    canonical_enrichment_store: [],
    gap_signal_store: [],
  });
  const state = await store.load();
  storeEnrichment(state, 'cp_cola_beverage', enrichment({
    base_product: 'cola',
    product_type: 'soft drink',
    product_family: 'beverages',
    category_l2: 'Beverages',
    category_l3: 'Soft Drinks',
    category: 'beverages',
    subcategory: 'soft drinks',
    brand: 'coca-cola',
    brand_normalized: 'coca-cola',
    product_line: 'coca-cola',
    flavor: ['cola'],
    flavor_terms: ['cola'],
    attributes: ['sparkling'],
    allergens: [],
    product_form: 'liquid',
    packaging: 'bottle',
    usage_context: ['refreshment'],
    search_aliases_bg: ['\u043a\u043e\u043a\u0430 \u043a\u043e\u043b\u0430', '\u043a\u043e\u043a\u0430-\u043a\u043e\u043b\u0430', '\u043a\u043e\u043b\u0430'],
    search_aliases_en: ['coca cola', 'coca-cola', 'coke', 'cola'],
    is_beverage: true,
  }));
  storeEnrichment(state, 'cp_cola_shampoo', enrichment({
    base_product: 'shampoo',
    product_type: 'shampoo',
    product_family: 'personal care',
    category_l1: 'Personal Care',
    category_l2: 'Hair Care',
    category_l3: 'Shampoo',
    category: 'personal care',
    subcategory: 'shampoo',
    brand: null,
    flavor: ['cola'],
    flavor_terms: ['cola'],
    attributes: [],
    allergens: [],
    product_form: 'liquid',
    packaging: 'bottle',
    usage_context: ['hair care'],
    search_aliases_en: ['cola shampoo', 'shampoo'],
    is_beverage: false,
    is_personal_care: true,
  }));
  await store.save(state);

  const response = await handleSearchCanonicalProductsRequest({
    store,
    body: { query: 'Coca-Cola', limit: 5 },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.results[0].canonical_product_id, 'cp_cola_beverage');
  const shampooIndex = response.body.results.findIndex((item) => item.canonical_product_id === 'cp_cola_shampoo');
  assert.equal(shampooIndex === -1 || shampooIndex > 0, true);
  if (shampooIndex !== -1) {
    assert.equal(
      response.body.results[shampooIndex].search_debug.demotion_reason,
      'personal_care_vs_beverage_demotion'
    );
  }
});

test('grocery synonym concepts keep sirene and kashkaval related but distinct', () => {
  const sirene = GROCERY_SYNONYM_CONCEPTS.find((concept) => concept.id === 'cheese_sirene');
  const kashkaval = GROCERY_SYNONYM_CONCEPTS.find((concept) => concept.id === 'yellow_cheese_kashkaval');

  assert.equal(sirene.bg_terms.includes('\u0441\u0438\u0440\u0435\u043d\u0435'), true);
  assert.equal(sirene.bg_terms.includes('\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b'), false);
  assert.equal(sirene.related_but_not_equivalent.includes('\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b'), true);
  assert.equal(kashkaval.bg_terms.includes('\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b'), true);
  assert.equal(kashkaval.related_but_not_equivalent.includes('\u0441\u0438\u0440\u0435\u043d\u0435'), true);
});

test('search ranking prioritizes phrase and all-token matches over any-token matches', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [
      productFixture('cp_butter', '\u041a\u0440\u0430\u0432\u0435 \u043c\u0430\u0441\u043b\u043e 125 \u0433', 'butter'),
      productFixture('cp_oil', '\u041e\u043b\u0438\u043e \u043c\u0430\u0441\u043b\u043e 1 \u043b', 'oil'),
      productFixture('cp_cow_cheese', '\u041a\u0440\u0430\u0432\u0435 \u0441\u0438\u0440\u0435\u043d\u0435 400 \u0433', 'cheese'),
    ],
    canonical_enrichment_store: [],
    gap_signal_store: [],
  });

  const response = await handleSearchCanonicalProductsRequest({
    store,
    body: {
      query: '\u043a\u0440\u0430\u0432\u0435 \u043c\u0430\u0441\u043b\u043e',
      limit: 5,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.results[0].canonical_product_id, 'cp_butter');
  assert.equal(response.body.results[0].search_debug.match_tier, 'exact_phrase');
  assert.equal(response.body.results.findIndex((item) => item.canonical_product_id === 'cp_butter') <
    response.body.results.findIndex((item) => item.canonical_product_id === 'cp_oil'), true);
});

test('generic milk search demotes baby formula below ordinary milk when both exist', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [
      productFixture('cp_formula', '\u041c\u041b\u042f\u041a\u041e APTAMIL PRONUTRA+ 4 800 \u0413\u0420 \u041d\u0410\u0414 24 \u041c\u0415\u0421\u0415\u0426\u0410', 'baby_formula', 'APTAMIL'),
      productFixture('cp_fresh_milk', '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 1 \u043b', 'fresh_milk'),
      productFixture('cp_yogurt', '\u041a\u0438\u0441\u0435\u043b\u043e \u043c\u043b\u044f\u043a\u043e 400 \u0433', 'yogurt'),
    ],
    canonical_enrichment_store: [],
    gap_signal_store: [],
  });

  const milkResponse = await handleSearchCanonicalProductsRequest({
    store,
    body: { query: '\u043c\u043b\u044f\u043a\u043e', limit: 5 },
  });
  const formulaResponse = await handleSearchCanonicalProductsRequest({
    store,
    body: { query: '\u0430\u0434\u0430\u043f\u0442\u0438\u0440\u0430\u043d\u043e \u043c\u043b\u044f\u043a\u043e', limit: 5 },
  });

  assert.equal(milkResponse.status, 200);
  assert.notEqual(milkResponse.body.results[0].canonical_product_id, 'cp_formula');
  assert.equal(formulaResponse.body.results[0].canonical_product_id, 'cp_formula');
});

test('search falls back to compact catalog load when prefix has no candidates', async () => {
  const store = new InMemoryDataBackboneStore({
    canonical_products: [{
      canonical_product_id: 'cp_middle_milk',
      canonical_display_name: '\u041a\u0418\u0421\u0415\u041b\u041e \u041c\u041b\u042f\u041a\u041e 400\u0413',
      canonical_brand: null,
      canonical_product_type: null,
      canonical_category_code: '6',
      canonical_attributes_json: JSON.stringify({ volume_marker: '400g' }),
      source_example_name: '\u041a\u0418\u0421\u0415\u041b\u041e \u041c\u041b\u042f\u041a\u041e 400\u0413',
      source_product_count: 1,
    }],
    canonical_enrichment_store: [],
    gap_signal_store: [],
  });
  const scopedStore = createScopedStoreProxy(store);
  const response = await handleSearchCanonicalProductsRequest({
    store: scopedStore,
    body: {
      query: '\u043c\u043b\u044f\u043a\u043e',
      limit: 5,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.results[0].canonical_product_id, 'cp_middle_milk');
  assert.equal(scopedStore.loadedCollections.has('canonical_products'), true);
  assert.equal(scopedStore.loadedCollections.has('canonical_enrichment_store'), true);
  assert.equal(scopedStore.loadedCollections.has('canonical_product_mappings'), false);
  assert.equal(scopedStore.loadedCollections.has('raw_price_snapshots'), false);
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
      query: 'chocolate',
      filters: {
        category_l2: 'dairy',
        flavor: 'chocolate',
        attributes: 'low_fat',
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.total, 1);
  assert.equal(response.body.results[0].enrichment.base_product, 'milk');
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

test('applied-view detail scopes in disambiguation collections only when requested', async () => {
  const { store, juiceId } = await createApiStore();
  const scopedStore = createScopedStoreProxy(store);
  const response = await handleGetCanonicalProductRequest({
    store: scopedStore,
    params: { id: juiceId },
    query: {
      layer_mode: LAYER_SELECTIONS.CANONICAL_WITH_APPLIED_VIEW_AND_ENRICHMENT,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(scopedStore.loadedCollections.has('canonical_disambiguation_queue'), true);
  assert.equal(scopedStore.loadedCollections.has('canonical_disambiguation_decisions'), true);
  assert.equal(scopedStore.loadedCollections.has('raw_price_snapshots'), false);
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

function productFixture(id, name, productType = null, brand = null) {
  return {
    canonical_product_id: id,
    canonical_display_name: name,
    canonical_brand: brand,
    canonical_product_type: productType,
    canonical_category_code: null,
    canonical_attributes_json: JSON.stringify({}),
    source_example_name: name,
    source_product_count: 1,
  };
}

function createScopedStoreProxy(store) {
  const calls = [];
  const loadedCollections = new Set();
  return {
    prefersScopedProductSearch: true,
    calls,
    loadedCollections,
    async load() {
      calls.push({ type: 'load' });
      throw new Error('full store load should not be used by scoped product API tests');
    },
    async loadCollections(collectionNames) {
      calls.push({ type: 'loadCollections', collectionNames });
      collectionNames.forEach((collectionName) => loadedCollections.add(collectionName));
      return store.loadCollections(collectionNames);
    },
    async queryCollection(collectionName, query) {
      calls.push({
        type: 'queryCollection',
        collectionName,
        fieldName: query?.fieldName,
        value: query?.value,
      });
      return store.queryCollection(collectionName, query);
    },
    async queryCollectionByFieldValues(collectionName, query) {
      calls.push({
        type: 'queryCollectionByFieldValues',
        collectionName,
        fieldName: query?.fieldName,
        values: query?.values,
      });
      return store.queryCollectionByFieldValues(collectionName, query);
    },
    async queryCollectionPrefix(collectionName, query) {
      calls.push({
        type: 'queryCollectionPrefix',
        collectionName,
        fieldName: query?.fieldName,
        prefix: query?.prefix,
        limit: query?.limit,
      });
      return store.queryCollectionPrefix(collectionName, query);
    },
    async upsertRecord(collectionName, record) {
      calls.push({ type: 'upsertRecord', collectionName });
      return store.upsertRecord(collectionName, record);
    },
  };
}

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
