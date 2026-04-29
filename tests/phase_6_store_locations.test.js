const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  InMemoryDataBackboneStore,
  importDailySnapshotCsvStream,
  lookupCanonicalProductPrices,
  parseStoreLocationText,
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

async function importRows({
  store,
  rows,
  sourceFileName = 'КООП_000004283.csv',
}) {
  return importDailySnapshotCsvStream({
    store,
    csvStream: createCsv(rows),
    snapshotDate: '2026-04-21',
    sourceFileName,
    ingestedAt: '2026-04-22T08:00:00.000Z',
    enableLlmEnrichment: false,
  });
}

test('store-location parser extracts Bulgarian city and street-like address from raw store names', () => {
  const parsed = parseStoreLocationText('Аптека Марешки / 637 / гр.Пловдив ул. Капитан Райчо 32, ет. 1');

  assert.equal(parsed.city, 'Пловдив');
  assert.equal(parsed.raw_address.startsWith(parsed.city), false);
  assert.equal(parsed.raw_address.includes('32'), true);
  assert.equal(parsed.confidence >= 0.8, true);
  assert.equal(parsed.confidence_reason, 'city_and_street_marker_found');
});

test('store-location parser handles English and German-compatible address forms deterministically', () => {
  const english = parseStoreLocationText('Fresh Market Sofia, Vitosha Boulevard 24');
  const german = parseStoreLocationText('REWE Mitte, Berlin, Invalidenstrasse 117');

  assert.equal(english.city, 'Sofia');
  assert.equal(english.raw_address, 'Vitosha Boulevard 24');
  assert.equal(english.confidence >= 0.7, true);
  assert.equal(german.city, 'Berlin');
  assert.equal(german.raw_address, 'Invalidenstrasse 117');
  assert.equal(german.confidence >= 0.7, true);
});

test('phase 6 ingest derives retailer_locations without mutating product price behavior', async () => {
  const store = new InMemoryDataBackboneStore();
  const result = await importRows({
    store,
    sourceFileName: 'Лидл България_131071587.csv',
    rows: [
      '"68134","187 - София/Околовръстен път 214","Chocolate Milk 1L","1001","6","2.39","0"',
      '"68134","187 - София/Околовръстен път 214","Whole Milk 1L","1002","6","2.79","2.29"',
      '"56784","Аптека Гален 13 - Студентски град, ул. Йордан Йосифов 4","Aspirin 20 tablets","2001","99","3.50","0"',
    ],
  });

  assert.equal(result.state.retailer_locations.length, 2);

  const lidlLocation = result.state.retailer_locations.find((location) => location.store_name_raw.startsWith('187 - София'));
  assert.equal(lidlLocation.city, 'София');
  assert.equal(lidlLocation.raw_address, 'Околовръстен път 214');
  assert.equal(lidlLocation.country, 'BG');
  assert.equal(lidlLocation.latitude, null);
  assert.equal(lidlLocation.longitude, null);
  assert.equal(lidlLocation.needs_geocoding, true);
  assert.equal(lidlLocation.source, 'kolkostruva_snapshot');
  assert.equal(lidlLocation.provenance.source_file_name_raw, 'Лидл България_131071587.csv');
  assert.equal(lidlLocation.provenance.source_file_numeric_id, '131071587');
  assert.equal(lidlLocation.snapshot_count, 2);
  assert.equal(lidlLocation.source_product_count, 2);

  const state = await store.load();
  const canonicalProductId = state.canonical_product_mappings
    .find((mapping) => state.source_products
      .find((product) => product.source_product_id === mapping.source_product_id)
      ?.product_code === '1001')
    .canonical_product_id;
  const priceLookup = await lookupCanonicalProductPrices({
    store,
    canonicalProductIds: [canonicalProductId],
    options: {
      max_age_days: 3650,
    },
  });

  assert.equal(priceLookup.items[0].price_status, 'priced');
  assert.equal(priceLookup.items[0].price_records[0].store_id, '68134::187-софия-околовръстен-път-214');
});

test('store-location extraction keeps low-confidence store-only records auditable', async () => {
  const store = new InMemoryDataBackboneStore();
  const result = await importRows({
    store,
    rows: [
      '"65677","Хранителна борса Сарандиев","Бял хляб 650гр","17","1","0.92","0"',
    ],
  });

  assert.equal(result.state.retailer_locations.length, 1);
  assert.equal(result.state.retailer_locations[0].raw_address, null);
  assert.equal(result.state.retailer_locations[0].city, null);
  assert.equal(result.state.retailer_locations[0].confidence, 0.35);
  assert.equal(result.state.retailer_locations[0].needs_geocoding, false);
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

  console.log(`\nPhase 6 store-location tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
