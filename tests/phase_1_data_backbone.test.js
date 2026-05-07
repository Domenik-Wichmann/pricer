const assert = require('node:assert/strict');
const path = require('path');

const {
  buildCanonicalEn,
  buildDisplayEn,
  buildEnrichment,
  buildEnglishMetadata,
  computeSnapshotId,
  computeSourceProductId,
  importDailySnapshotFile,
  importDailySnapshotText,
  InMemoryDataBackboneStore,
  resolveCollectionName,
  resolveRuntimeStoreConfig,
  upgradeEnrichmentToEnglish,
  upgradeTranslations,
} = require('../app/functions/src');

const BG_LOCALITY_HEADER = '\u041d\u0430\u0441\u0435\u043b\u0435\u043d\u043e \u043c\u044f\u0441\u0442\u043e';
const BG_STORE_HEADER = '\u0422\u044a\u0440\u0433\u043e\u0432\u0441\u043a\u0438 \u043e\u0431\u0435\u043a\u0442';
const BG_PRODUCT_HEADER = '\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435 \u043d\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430';
const BG_PRODUCT_CODE_HEADER = '\u041a\u043e\u0434 \u043d\u0430 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430';
const BG_CATEGORY_HEADER = '\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f';
const BG_RETAIL_HEADER = '\u0426\u0435\u043d\u0430 \u043d\u0430 \u0434\u0440\u0435\u0431\u043d\u043e';
const BG_PROMO_HEADER = '\u0426\u0435\u043d\u0430 \u0432 \u043f\u0440\u043e\u043c\u043e\u0446\u0438\u044f';

const BG_STORE_BORDER = '\u041c\u0430\u0433\u0430\u0437\u0438\u043d \u0413\u0440\u0430\u043d\u0438\u0447\u0430\u0440';
const BG_STORE_WAREHOUSE = '\u0425\u0440\u0430\u043d\u0438\u0442\u0435\u043b\u043d\u0430 \u0431\u043e\u0440\u0441\u0430 \u0421\u0430\u0440\u0430\u043d\u0434\u0438\u0435\u0432';
const BG_MILK = '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0412\u0435\u0440\u0435\u044f 3% 1\u043b';
const BG_MILK_MINOR_DRIFT = '\u041f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0412\u0435\u0440\u0435\u044f 3.0% 1 \u043b';
const BG_PASTRY = '\u0422\u043e\u0447\u0435\u043d\u0438 \u043a\u043e\u0440\u0438 \u0411\u0435\u043b\u0430 400\u0433\u0440.';
const BG_BREAD = '\u0411\u044f\u043b \u0445\u043b\u044f\u0431 \u042f\u043d\u0435\u0432\u0438 650\u0433\u0440.';

function createStore(initialState) {
  return new InMemoryDataBackboneStore(initialState);
}

function buildFixture(rows) {
  const header = [
    BG_LOCALITY_HEADER,
    BG_STORE_HEADER,
    BG_PRODUCT_HEADER,
    BG_PRODUCT_CODE_HEADER,
    BG_CATEGORY_HEADER,
    BG_RETAIL_HEADER,
    BG_PROMO_HEADER,
  ].join('\t');

  return [header, ...rows.map((row) => row.join('\t'))].join('\n');
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('snapshot key stability', () => {
  const payload = {
    snapshotDate: '2026-04-21',
    localityCode: '65677',
    storeNameRaw: BG_STORE_BORDER,
    productCode: '1',
    categoryCode: '1',
  };

  assert.equal(computeSnapshotId(payload), computeSnapshotId(payload));
});

test('source product key stability across dates', () => {
  const first = computeSourceProductId({
    localityCode: '65677',
    storeNameRaw: BG_STORE_WAREHOUSE,
    productCode: '1001228',
    categoryCode: '6',
  });

  const second = computeSourceProductId({
    localityCode: '65677',
    storeNameRaw: BG_STORE_WAREHOUSE,
    productCode: '1001228',
    categoryCode: '6',
  });

  assert.equal(first, second);
});

test('runtime store config resolves Firestore target without secrets', () => {
  const config = resolveRuntimeStoreConfig({
    PRICER_STORE_BACKEND: 'firestore',
    PRICER_FIRESTORE_PROJECT_ID: 'pricer-ee440',
    PRICER_FIRESTORE_DATABASE_ID: '(default)',
    PRICER_FIRESTORE_COLLECTION_PREFIX: 'prod',
    GOOGLE_APPLICATION_CREDENTIALS: 'C:\\secrets\\service-account.json',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  });

  assert.equal(config.backend, 'firestore');
  assert.equal(config.firestore.projectId, 'pricer-ee440');
  assert.equal(config.firestore.databaseId, '(default)');
  assert.equal(config.firestore.collectionPrefix, 'prod');
  assert.equal(config.firestore.googleApplicationCredentialsPresent, true);
  assert.equal(config.firestore.emulator.active, true);
  assert.equal(config.firestore.emulator.firestoreEmulatorHost, '127.0.0.1:8080');
});

test('runtime collection names use the configured Firestore prefix only when present', () => {
  assert.equal(resolveCollectionName('prod', 'canonical_products'), 'prod_canonical_products');
  assert.equal(resolveCollectionName('', 'canonical_products'), 'canonical_products');
});

test('outlet differentiation', () => {
  const left = computeSourceProductId({
    localityCode: '65677',
    storeNameRaw: BG_STORE_WAREHOUSE,
    productCode: '17',
    categoryCode: '1',
  });
  const right = computeSourceProductId({
    localityCode: '65677',
    storeNameRaw: BG_STORE_BORDER,
    productCode: '17',
    categoryCode: '1',
  });

  assert.notEqual(left, right);
});

test('locality differentiation', () => {
  const left = computeSourceProductId({
    localityCode: '65677',
    storeNameRaw: BG_STORE_BORDER,
    productCode: '17',
    categoryCode: '1',
  });
  const right = computeSourceProductId({
    localityCode: '99999',
    storeNameRaw: BG_STORE_BORDER,
    productCode: '17',
    categoryCode: '1',
  });

  assert.notEqual(left, right);
});

test('promo normalization treats blank promo price as zero', async () => {
  const store = createStore();
  const sourceText = buildFixture([
    ['65677', BG_STORE_BORDER, BG_MILK, '1001228', '6', '1.66', ''],
  ]);

  const result = await importDailySnapshotText({
    store,
    sourceText,
    snapshotDate: '2026-04-21',
    sourceFileName: 'promo_blank.tsv',
    ingestedAt: '2026-04-22T10:00:00.000Z',
  });

  assert.equal(result.state.raw_price_snapshots[0].promo_price, 0);
  assert.equal(result.state.raw_price_snapshots[0].promo_price_raw, '');
});

test('net-new enrichment reuse only enriches once until revalidation is needed', async () => {
  const store = createStore();
  const sourceText = buildFixture([
    ['65677', BG_STORE_BORDER, BG_MILK, '1001228', '6', '1.66', '0'],
  ]);

  const first = await importDailySnapshotText({
    store,
    sourceText,
    snapshotDate: '2026-04-21',
    sourceFileName: 'day1.tsv',
    ingestedAt: '2026-04-22T10:00:00.000Z',
  });
  const second = await importDailySnapshotText({
    store,
    sourceText,
    snapshotDate: '2026-04-22',
    sourceFileName: 'day2.tsv',
    ingestedAt: '2026-04-22T11:00:00.000Z',
  });

  assert.equal(first.enrichment_runs, 1);
  assert.equal(second.enrichment_runs, 0);
  assert.equal(second.state.source_product_enrichment.length, 1);
  assert.equal(second.state.source_product_enrichment[0].enriched_at, '2026-04-22T10:00:00.000Z');
});

test('name drift handling keeps minor drift cheap and flags major drift for revalidation', async () => {
  const store = createStore();
  const firstDay = buildFixture([
    ['65677', BG_STORE_BORDER, BG_MILK, '1001228', '6', '1.66', '0'],
  ]);
  const minorDriftDay = buildFixture([
    ['65677', BG_STORE_BORDER, BG_MILK_MINOR_DRIFT, '1001228', '6', '1.69', '0'],
  ]);
  const majorDriftDay = buildFixture([
    ['65677', BG_STORE_BORDER, BG_PASTRY, '1001228', '6', '1.69', '0'],
  ]);

  const first = await importDailySnapshotText({
    store,
    sourceText: firstDay,
    snapshotDate: '2026-04-21',
    sourceFileName: 'day1.tsv',
    ingestedAt: '2026-04-22T10:00:00.000Z',
  });
  const minor = await importDailySnapshotText({
    store,
    sourceText: minorDriftDay,
    snapshotDate: '2026-04-22',
    sourceFileName: 'day2.tsv',
    ingestedAt: '2026-04-22T11:00:00.000Z',
  });
  const major = await importDailySnapshotText({
    store,
    sourceText: majorDriftDay,
    snapshotDate: '2026-04-23',
    sourceFileName: 'day3.tsv',
    ingestedAt: '2026-04-22T12:00:00.000Z',
  });

  assert.equal(first.enrichment_runs, 1);
  assert.equal(minor.enrichment_runs, 0);
  assert.equal(minor.state.source_products[0].latest_product_name_raw, BG_MILK_MINOR_DRIFT);
  assert.equal(minor.state.source_products[0].drift_level, 'minor');
  assert.equal(major.enrichment_runs, 1);
  assert.equal(major.state.source_products[0].drift_level, 'major');
  assert.equal(major.state.source_products[0].needs_revalidation, false);
  assert.equal(major.state.source_product_enrichment[0].based_on_product_name_raw, BG_PASTRY);
});

test('missing product retention keeps unseen products with inactive lifecycle state', async () => {
  const store = createStore();
  const dayOne = buildFixture([
    ['65677', BG_STORE_WAREHOUSE, BG_BREAD, '17', '1', '0.92', '0'],
    ['65677', BG_STORE_WAREHOUSE, BG_MILK, '1001228', '6', '1.66', '0'],
  ]);
  const dayTwo = buildFixture([
    ['65677', BG_STORE_WAREHOUSE, BG_MILK, '1001228', '6', '1.70', '0'],
  ]);

  await importDailySnapshotText({
    store,
    sourceText: dayOne,
    snapshotDate: '2026-04-21',
    sourceFileName: 'day1.tsv',
    ingestedAt: '2026-04-22T10:00:00.000Z',
  });
  const second = await importDailySnapshotText({
    store,
    sourceText: dayTwo,
    snapshotDate: '2026-04-22',
    sourceFileName: 'day2.tsv',
    ingestedAt: '2026-04-22T11:00:00.000Z',
  });

  assert.equal(second.state.source_products.length, 2);
  const inactiveBread = second.state.source_products.find((product) => product.product_code === '17');
  const activeMilk = second.state.source_products.find((product) => product.product_code === '1001228');

  assert.equal(inactiveBread.is_active, false);
  assert.equal(inactiveBread.last_seen_date, '2026-04-21');
  assert.equal(activeMilk.is_active, true);
  assert.equal(activeMilk.last_seen_date, '2026-04-22');
});

test('sample Bulgarian fixture imports and preserves raw rows with deterministic enrichment', async () => {
  const store = createStore();
  const result = await importDailySnapshotFile({
    store,
    filePath: path.join(__dirname, '..', 'data_samples', 'kolkostruva_sample.tsv'),
    snapshotDate: '2026-04-21',
    ingestedAt: '2026-04-22T13:00:00.000Z',
  });

  assert.equal(result.imported_rows > 0, true);
  assert.equal(result.state.raw_price_snapshots[0].raw_source_row[BG_PRODUCT_HEADER].length > 0, true);
  const milk = result.state.source_product_enrichment.find((entry) => entry.product_type_guess === 'fresh_milk');
  assert.deepEqual(
    buildEnrichment({ productNameRaw: BG_MILK, categoryCode: '6' }),
    {
      normalized_name: '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0432\u0435\u0440\u0435\u044f 3% 1\u043b',
      tokens: [
        '\u043f\u0440\u044f\u0441\u043d\u043e',
        '\u043c\u043b\u044f\u043a\u043e',
        '\u0432\u0435\u0440\u0435\u044f',
        '3%',
        '1\u043b',
      ],
      brand_guess: '\u0412\u0435\u0440\u0435\u044f',
      product_type_guess: 'fresh_milk',
      size_text: '1\u043b',
      size_value: 1,
      size_unit: 'l',
      fat_percent: 3,
      canonical_search_category: 'milk',
      alias_candidates: [
        '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e \u0432\u0435\u0440\u0435\u044f 3% 1\u043b',
        '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 3% 1\u043b',
        '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e 3%',
        '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e',
      ],
      parse_confidence: 1,
      canonical_en: {
        product_type: 'fresh_milk',
        product_family: 'milk',
        brand: '\u0412\u0435\u0440\u0435\u044f',
        size_value: 1,
        size_unit: 'l',
        fat_percent: 3,
      },
      display_en: 'Fresh milk \u0412\u0435\u0440\u0435\u044f 3% 1L',
      i18n_status: 'complete',
      display: {
        en: 'Fresh milk \u0412\u0435\u0440\u0435\u044f 3% 1L',
        de: null,
        uk: null,
        ru: null,
        nl: null,
      },
      translation_status: {
        en: 'complete',
        de: 'pending',
        uk: 'pending',
        ru: 'pending',
        nl: 'pending',
      },
    }
  );
  assert.equal(Boolean(milk), true);
});

test('canonical_en generation maps Bulgarian enrichment into deterministic English metadata', () => {
  const canonicalEn = buildCanonicalEn(
    buildEnrichment({ productNameRaw: BG_MILK, categoryCode: '6' })
  );

  assert.deepEqual(canonicalEn, {
    product_type: 'fresh_milk',
    product_family: 'milk',
    brand: '\u0412\u0435\u0440\u0435\u044f',
    size_value: 1,
    size_unit: 'l',
    fat_percent: 3,
  });
});

test('display_en formatting follows deterministic ordering with partial-data fallback', () => {
  assert.equal(
    buildDisplayEn({
      product_type: 'fresh_milk',
      product_family: 'milk',
      brand: 'Vereya',
      size_value: 1,
      size_unit: 'l',
      fat_percent: 3,
    }),
    'Fresh milk Vereya 3% 1L'
  );

  assert.equal(
    buildDisplayEn({
      product_type: null,
      product_family: 'milk',
      brand: 'Vereya',
      size_value: null,
      size_unit: null,
      fat_percent: null,
    }),
    'Milk Vereya'
  );
});

test('new products automatically get English metadata and pending translation slots', async () => {
  const store = createStore();
  const sourceText = buildFixture([
    ['65677', BG_STORE_BORDER, BG_MILK, '1001228', '6', '1.66', '0'],
  ]);

  const result = await importDailySnapshotText({
    store,
    sourceText,
    snapshotDate: '2026-04-24',
    sourceFileName: 'phase15_new.tsv',
    ingestedAt: '2026-04-24T10:00:00.000Z',
  });

  const enrichment = result.state.source_product_enrichment[0];
  assert.equal(enrichment.display_en, 'Fresh milk \u0412\u0435\u0440\u0435\u044f 3% 1L');
  assert.equal(enrichment.display.en, enrichment.display_en);
  assert.equal(enrichment.translation_status.de, 'pending');
  assert.equal(enrichment.i18n_status, 'complete');
});

test('upgradeEnrichmentToEnglish backfills missing English fields without overwriting existing values', async () => {
  const store = createStore();
  await importDailySnapshotText({
    store,
    sourceText: buildFixture([
      ['65677', BG_STORE_BORDER, BG_MILK, '1001228', '6', '1.66', '0'],
    ]),
    snapshotDate: '2026-04-24',
    sourceFileName: 'phase15_backfill.tsv',
    ingestedAt: '2026-04-24T11:00:00.000Z',
  });

  const state = await store.load();
  const original = state.source_product_enrichment[0];
  state.source_product_enrichment[0] = {
    ...original,
  };
  delete state.source_product_enrichment[0].canonical_en;
  delete state.source_product_enrichment[0].display_en;
  delete state.source_product_enrichment[0].i18n_status;
  delete state.source_product_enrichment[0].display;
  delete state.source_product_enrichment[0].translation_status;
  await store.save(state);

  const first = await upgradeEnrichmentToEnglish({
    store,
    upgradedAt: '2026-04-24T12:00:00.000Z',
  });
  assert.equal(first.upgraded, 1);
  assert.equal(first.state.source_product_enrichment[0].display_en, 'Fresh milk \u0412\u0435\u0440\u0435\u044f 3% 1L');

  const customState = await store.load();
  customState.source_product_enrichment[0].display_en = 'Custom English Name';
  customState.source_product_enrichment[0].display.en = 'Custom English Name';
  customState.source_product_enrichment[0].canonical_en = {
    product_type: 'custom_type',
    product_family: 'custom_family',
    brand: 'Custom Brand',
    size_value: null,
    size_unit: null,
    fat_percent: null,
  };
  customState.source_product_enrichment[0].i18n_status = 'complete';
  await store.save(customState);

  const second = await upgradeEnrichmentToEnglish({
    store,
    upgradedAt: '2026-04-24T13:00:00.000Z',
  });
  assert.equal(second.upgraded, 0);
  assert.equal(second.state.source_product_enrichment[0].display_en, 'Custom English Name');
  assert.equal(second.state.source_product_enrichment[0].canonical_en.product_type, 'custom_type');
});

test('translation storage writes translated values and marks statuses complete', async () => {
  const metadata = buildEnglishMetadata(buildEnrichment({ productNameRaw: BG_MILK, categoryCode: '6' }));
  const store = createStore({
    raw_price_snapshots: [],
    source_products: [],
    source_product_enrichment: [
      {
        source_product_id: 'sp1',
        enriched_at: '2026-04-24T10:00:00.000Z',
        enrichment_version: 'phase1.5-deterministic-v1',
        based_on_product_name_raw: BG_MILK,
        ...metadata,
      },
    ],
  });

  const result = await upgradeTranslations({
    store,
    languages: ['de', 'ru'],
  });

  assert.equal(result.completed, 2);
  assert.equal(result.state.source_product_enrichment[0].display.de, 'Frische Milch \u0412\u0435\u0440\u0435\u044f 3% 1L');
  assert.equal(result.state.source_product_enrichment[0].display.ru, '\u0421\u0432\u0435\u0436\u0435\u0435 \u043c\u043e\u043b\u043e\u043a\u043e \u0412\u0435\u0440\u0435\u044f 3% 1L');
  assert.equal(result.state.source_product_enrichment[0].translation_status.de, 'complete');
  assert.equal(result.state.source_product_enrichment[0].translation_status.ru, 'complete');
});

test('translation idempotency does not overwrite or retranslate existing values', async () => {
  let calls = 0;
  const metadata = buildEnglishMetadata(buildEnrichment({ productNameRaw: BG_MILK, categoryCode: '6' }));
  const store = createStore({
    raw_price_snapshots: [],
    source_products: [],
    source_product_enrichment: [
      {
        source_product_id: 'sp2',
        enriched_at: '2026-04-24T10:00:00.000Z',
        enrichment_version: 'phase1.5-deterministic-v1',
        based_on_product_name_raw: BG_MILK,
        ...metadata,
      },
    ],
  });

  const translator = async (text, lang) => {
    calls += 1;
    return `${lang}:${text}`;
  };

  const first = await upgradeTranslations({
    store,
    languages: ['de'],
    translator,
  });
  const second = await upgradeTranslations({
    store,
    languages: ['de'],
    translator,
  });

  assert.equal(first.state.source_product_enrichment[0].display.de, `de:${metadata.display_en}`);
  assert.equal(second.state.source_product_enrichment[0].display.de, `de:${metadata.display_en}`);
  assert.equal(calls, 1);
});

test('translation failure handling marks failed status without overwriting successes', async () => {
  const metadata = buildEnglishMetadata(buildEnrichment({ productNameRaw: BG_MILK, categoryCode: '6' }));
  const store = createStore({
    raw_price_snapshots: [],
    source_products: [],
    source_product_enrichment: [
      {
        source_product_id: 'sp3',
        enriched_at: '2026-04-24T10:00:00.000Z',
        enrichment_version: 'phase1.5-deterministic-v1',
        based_on_product_name_raw: BG_MILK,
        ...metadata,
      },
    ],
  });

  const result = await upgradeTranslations({
    store,
    languages: ['de', 'ru'],
    translator: async (text, lang) => {
      if (lang === 'ru') {
        throw new Error('translation failed');
      }

      return `${lang}:${text}`;
    },
  });

  assert.equal(result.completed, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.state.source_product_enrichment[0].display.de, `de:${metadata.display_en}`);
  assert.equal(result.state.source_product_enrichment[0].display.ru, null);
  assert.equal(result.state.source_product_enrichment[0].translation_status.de, 'complete');
  assert.equal(result.state.source_product_enrichment[0].translation_status.ru, 'failed');
});

test('translation cost control respects the per-run limit', async () => {
  const metadata = buildEnglishMetadata(buildEnrichment({ productNameRaw: BG_MILK, categoryCode: '6' }));
  const store = createStore({
    raw_price_snapshots: [],
    source_products: [],
    source_product_enrichment: [
      {
        source_product_id: 'sp4',
        enriched_at: '2026-04-24T10:00:00.000Z',
        enrichment_version: 'phase1.5-deterministic-v1',
        based_on_product_name_raw: BG_MILK,
        ...metadata,
      },
    ],
  });

  const result = await upgradeTranslations({
    store,
    languages: ['de', 'ru'],
    limit: 1,
    translator: async (text, lang) => `${lang}:${text}`,
  });

  assert.equal(result.processed, 1);
  assert.equal(result.completed, 1);
  assert.equal(result.state.source_product_enrichment[0].display.de, `de:${metadata.display_en}`);
  assert.equal(result.state.source_product_enrichment[0].display.ru, null);
  assert.equal(result.state.source_product_enrichment[0].translation_status.ru, 'pending');
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

  console.log(`\nPhase tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
