const assert = require('node:assert/strict');
const path = require('node:path');

const {
  USDA_MACRO_NUTRIENT_IDS,
  buildUsdaDatasetId,
  getUsdaFoodWithMacros,
  importUsdaMacros,
  isUsdaMacroNutrientId,
  listMigrationFiles,
  normalizeUsdaImportRun,
  normalizeFood,
  normalizeFoodNutrient,
  normalizeFoodPortion,
  normalizeMeasureUnit,
  normalizeNutrient,
  parseCsvRecord,
  resolveUsdaFilePaths,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('macro nutrient constants include only the DB2 macro subset', () => {
  assert.deepEqual(USDA_MACRO_NUTRIENT_IDS, [
    1008,
    1003,
    1004,
    1005,
    1079,
    2000,
    1093,
    2047,
    2048,
  ]);
  assert.equal(isUsdaMacroNutrientId('1008'), true);
  assert.equal(isUsdaMacroNutrientId('1257'), false);
});

test('CSV parsing and USDA row normalization preserve source IDs and values', () => {
  assert.deepEqual(parseCsvRecord('"1","Milk, whole","quoted ""value"""'), [
    '1',
    'Milk, whole',
    'quoted "value"',
  ]);

  assert.deepEqual(normalizeFood({
    fdc_id: '100002',
    data_type: 'branded_food',
    description: 'Example Cereal',
    food_category_id: 'Breakfast Cereals',
    publication_date: '2025-12-18',
  }), {
    fdc_id: 100002,
    data_type: 'branded_food',
    description: 'Example Cereal',
    food_category_id: 'Breakfast Cereals',
    publication_date: '2025-12-18',
    raw_json: {
      fdc_id: '100002',
      data_type: 'branded_food',
      description: 'Example Cereal',
      food_category_id: 'Breakfast Cereals',
      publication_date: '2025-12-18',
    },
  });

  assert.equal(normalizeNutrient({ id: '1003', name: 'Protein', unit_name: 'G', nutrient_nbr: '203', rank: '600.0' }).nutrient_id, 1003);
  assert.equal(normalizeMeasureUnit({ id: '1000', name: 'cup' }).measure_unit_id, 1000);
  assert.equal(normalizeFoodPortion({ id: '11', fdc_id: '100001', amount: '1.0', measure_unit_id: '1000', gram_weight: '244.0' }).gram_weight, 244);
  assert.equal(normalizeFoodNutrient({ id: '1', fdc_id: '100001', nutrient_id: '1008', amount: '61.0' }).amount, 61);
});

test('migration includes required DB2 USDA macro tables', () => {
  const files = listMigrationFiles();
  const db2 = files.find((file) => file.name === '002_db2_usda_macro_import.sql');
  assert.ok(db2);
  [
    'usda_foods',
    'usda_nutrients',
    'usda_food_nutrients',
    'usda_food_portions',
    'usda_measure_units',
    'usda_food_categories',
    'usda_import_runs',
  ].forEach((tableName) => {
    assert.match(db2.sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}`));
  });
});

test('fixture import is macro-only and safely repeatable with new import batches', async () => {
  const client = new FakeUsdaClient();
  const datasetRoot = path.resolve(__dirname, 'fixtures', 'usda_macro');
  const files = resolveUsdaFilePaths(datasetRoot);
  assert.equal(path.basename(files.foodNutrient), 'food_nutrient.csv');

  const first = await importUsdaMacros({
    client,
    datasetRoot,
    datasetVersion: 'fixture',
    importBatchId: 'db2_fixture_batch_1',
    importRunId: 'db2_fixture_run_1',
    batchSize: 2,
    logger: silentLogger,
  });

  assert.equal(first.status, 'completed');
  assert.equal(first.dataset_id, buildUsdaDatasetId('fixture'));
  assert.equal(first.foods_imported, 2);
  assert.equal(first.nutrients_imported, 9);
  assert.equal(first.food_nutrients_imported, 8);
  assert.equal(first.portions_imported, 2);
  assert.equal(first.metadata_json.invalid_food_rows, 2);
  assert.equal(first.metadata_json.invalid_nutrient_rows, 1);
  assert.equal(first.metadata_json.invalid_food_nutrient_rows, 1);
  assert.equal(first.metadata_json.invalid_food_portion_rows, 1);
  assert.equal(first.metadata_json.orphan_food_nutrient_rows, 1);
  assert.equal(first.metadata_json.orphan_food_portion_rows, 1);
  assert.equal(first.metadata_json.non_macro_nutrient_rows_skipped, 3);
  assert.equal(first.metadata_json.sample_invalid_rows.length, 5);
  assert.equal(client.tables.usda_food_nutrients.has(8), false);
  assert.equal(client.tables.usda_food_nutrients.has(10), false);
  assert.equal(client.tables.usda_food_nutrients.has(11), false);
  assert.equal(client.tables.usda_food_nutrients.has(12), false);
  assert.equal(client.tables.usda_foods.has(100003), false);
  assert.equal(client.tables.usda_food_portions.has(13), false);
  assert.equal(client.tables.usda_food_portions.has(14), false);
  assert.equal(client.tables.usda_import_runs.get('db2_fixture_run_1').metadata_json.invalid_food_rows, 2);

  const second = await importUsdaMacros({
    client,
    datasetRoot,
    datasetVersion: 'fixture',
    importBatchId: 'db2_fixture_batch_2',
    importRunId: 'db2_fixture_run_2',
    batchSize: 3,
    logger: silentLogger,
  });

  assert.equal(second.status, 'completed');
  assert.equal(client.tables.usda_foods.size, 2);
  assert.equal(client.tables.usda_nutrients.size, 9);
  assert.equal(client.tables.usda_food_nutrients.size, 8);
  assert.equal(client.tables.usda_food_portions.size, 2);
  assert.equal(client.tables.source_files.size, 6);
});

test('USDA import-run normalization preserves row-quality metadata', () => {
  const normalized = normalizeUsdaImportRun({
    usdaImportRunId: 'run_meta',
    importBatchId: 'batch_meta',
    datasetRoot: 'datasets/usda',
    metadataJson: {
      invalid_food_rows: 1,
      warnings: [],
    },
  });
  assert.equal(normalized.metadata_json.invalid_food_rows, 1);
});

test('repository read returns USDA food with imported macro rows', async () => {
  const client = new FakeUsdaClient();
  await importUsdaMacros({
    client,
    datasetRoot: path.resolve(__dirname, 'fixtures', 'usda_macro'),
    datasetVersion: 'fixture',
    importBatchId: 'db2_fixture_batch_read',
    importRunId: 'db2_fixture_run_read',
    batchSize: 10,
    logger: silentLogger,
  });

  const food = await getUsdaFoodWithMacros(client, 100001);
  assert.equal(food.description, 'Milk, whole');
  assert.deepEqual(food.macro_nutrients.map((row) => row.nutrient_id), [1003, 1004, 1005, 1008, 1079, 1093, 2000]);
});

const silentLogger = {
  log() {},
};

class FakeUsdaClient {
  constructor() {
    this.tables = {
      source_datasets: new Map(),
      source_files: new Map(),
      import_batches: new Map(),
      usda_import_runs: new Map(),
      usda_food_categories: new Map(),
      usda_measure_units: new Map(),
      usda_nutrients: new Map(),
      usda_foods: new Map(),
      usda_food_nutrients: new Map(),
      usda_food_portions: new Map(),
    };
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('INSERT INTO source_datasets')) {
      const record = {
        dataset_id: params[0],
        source_name: params[1],
        source_type: params[2],
        version: params[3],
        root_path: params[4],
        license_note: params[5],
      };
      this.tables.source_datasets.set(record.dataset_id, record);
      return { rows: [record] };
    }

    if (normalized.startsWith('INSERT INTO source_files')) {
      const record = {
        source_file_id: params[0],
        dataset_id: params[1],
        path: params[2],
        format: params[3],
        bytes: params[4],
        row_count: params[5],
        checksum: params[6],
      };
      this.tables.source_files.set(record.source_file_id, record);
      return { rows: [record] };
    }

    if (normalized.startsWith('INSERT INTO import_batches')) {
      const record = {
        import_batch_id: params[0],
        dataset_id: params[1],
        status: params[2],
        started_at: params[3],
        metadata_json: JSON.parse(params[4]),
      };
      this.tables.import_batches.set(record.import_batch_id, record);
      return { rows: [record] };
    }

    if (normalized.startsWith('UPDATE import_batches')) {
      const record = this.tables.import_batches.get(params[0]);
      record.status = params[1];
      record.completed_at = params[2];
      record.error_message = params[3];
      return { rows: [record] };
    }

    if (normalized.startsWith('INSERT INTO usda_import_runs')) {
      const record = {
        usda_import_run_id: params[0],
        import_batch_id: params[1],
        dataset_root: params[2],
        status: params[3],
        foods_imported: params[4],
        nutrients_imported: params[5],
        food_nutrients_imported: params[6],
        portions_imported: params[7],
        metadata_json: JSON.parse(params[8]),
        started_at: params[9],
      };
      this.tables.usda_import_runs.set(record.usda_import_run_id, record);
      return { rows: [record] };
    }

    if (normalized.startsWith('UPDATE usda_import_runs')) {
      const record = this.tables.usda_import_runs.get(params[0]);
      record.status = params[1];
      record.foods_imported = params[2];
      record.nutrients_imported = params[3];
      record.food_nutrients_imported = params[4];
      record.portions_imported = params[5];
      record.metadata_json = JSON.parse(params[6]);
      record.completed_at = params[7];
      record.error_message = params[8];
      return { rows: [record] };
    }

    if (normalized.startsWith('INSERT INTO usda_food_categories')) {
      return this.upsertRows('usda_food_categories', ['food_category_id', 'code', 'description'], params);
    }
    if (normalized.startsWith('INSERT INTO usda_measure_units')) {
      return this.upsertRows('usda_measure_units', ['measure_unit_id', 'name'], params);
    }
    if (normalized.startsWith('INSERT INTO usda_nutrients')) {
      return this.upsertRows('usda_nutrients', ['nutrient_id', 'name', 'unit_name', 'nutrient_nbr', 'rank'], params);
    }
    if (normalized.startsWith('INSERT INTO usda_foods')) {
      return this.upsertRows('usda_foods', ['fdc_id', 'data_type', 'description', 'food_category_id', 'publication_date', 'raw_json'], params, {
        raw_json: JSON.parse,
      });
    }
    if (normalized.startsWith('INSERT INTO usda_food_nutrients')) {
      return this.upsertRows('usda_food_nutrients', ['food_nutrient_id', 'fdc_id', 'nutrient_id', 'amount', 'derivation_id', 'data_points', 'min', 'max', 'median', 'footnote'], params);
    }
    if (normalized.startsWith('INSERT INTO usda_food_portions')) {
      return this.upsertRows('usda_food_portions', ['id', 'fdc_id', 'amount', 'measure_unit_id', 'portion_description', 'modifier', 'gram_weight'], params);
    }

    if (normalized.startsWith('SELECT * FROM usda_foods WHERE fdc_id')) {
      return { rows: this.tables.usda_foods.has(params[0]) ? [this.tables.usda_foods.get(params[0])] : [] };
    }

    if (normalized.startsWith('SELECT fn.*, n.name, n.unit_name, n.nutrient_nbr')) {
      const rows = [...this.tables.usda_food_nutrients.values()]
        .filter((row) => row.fdc_id === params[0])
        .sort((left, right) => left.nutrient_id - right.nutrient_id)
        .map((row) => ({
          ...row,
          ...this.tables.usda_nutrients.get(row.nutrient_id),
        }));
      return { rows };
    }

    throw new Error(`Unexpected fake query: ${normalized.slice(0, 160)}`);
  }

  upsertRows(tableName, columns, params, transforms = {}) {
    const table = this.tables[tableName];
    const keyColumn = columns[0];
    for (let offset = 0; offset < params.length; offset += columns.length) {
      const record = {};
      columns.forEach((column, index) => {
        const value = params[offset + index];
        record[column] = transforms[column] ? transforms[column](value) : value;
      });
      table.set(record[keyColumn], record);
    }
    return { rows: [] };
  }
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

  console.log(`\nDB2 USDA macro import tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
