const assert = require('node:assert/strict');

const {
  generateUsdaClusterCandidatesBatch,
  normalizeClusterBatchOptions,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('DB2.5B normalizes batch options deterministically', () => {
  const options = normalizeClusterBatchOptions({
    batchSize: 0,
    limit: '3',
    dataTypes: ['foundation_food', 'sr_legacy_food', 'foundation_food'],
    dryRun: true,
    sourceVersion: 'fixture',
  });
  assert.equal(options.batchSize, 500);
  assert.equal(options.limit, 3);
  assert.deepEqual(options.dataTypes, ['foundation_food', 'sr_legacy_food']);
  assert.equal(options.dryRun, true);
  assert.equal(options.sourceVersion, 'fixture');
});

test('DB2.5B dry run scans eligible macro-backed foods without writing candidates', async () => {
  const client = new FakeClusterBatchClient();
  const summary = await generateUsdaClusterCandidatesBatch({
    client,
    dryRun: true,
    batchSize: 2,
    limit: 3,
    sourceVersion: 'fixture',
  });

  assert.equal(summary.scanned, 3);
  assert.equal(summary.eligible, 3);
  assert.equal(summary.skipped_no_macro_data, 1);
  assert.equal(summary.generated, 2);
  assert.equal(summary.upserted, 0);
  assert.equal(client.candidates.size, 0);
});

test('DB2.5B upserts candidates idempotently across repeated runs', async () => {
  const client = new FakeClusterBatchClient();
  const first = await generateUsdaClusterCandidatesBatch({
    client,
    batchSize: 3,
    sourceVersion: 'fixture',
  });
  const second = await generateUsdaClusterCandidatesBatch({
    client,
    batchSize: 3,
    sourceVersion: 'fixture',
  });

  assert.equal(first.generated, 4);
  assert.equal(first.upserted, 4);
  assert.equal(second.generated, 4);
  assert.equal(second.upserted, 4);
  assert.equal(client.candidates.size, 4);
});

test('DB2.5B supports max rows and data-type filters', async () => {
  const client = new FakeClusterBatchClient();
  const summary = await generateUsdaClusterCandidatesBatch({
    client,
    limit: 2,
    batchSize: 10,
    dataTypes: ['foundation_food'],
    sourceVersion: 'fixture',
  });

  assert.equal(summary.scanned, 2);
  assert.equal(summary.eligible, 2);
  assert.equal(summary.generated, 1);
  assert.equal(summary.skipped_no_macro_data, 1);
  assert.equal(client.candidates.size, 1);
  assert.equal([...client.candidates.values()][0].source_data_type, 'foundation_food');
});

test('DB2.5B explicitly skips unsupported data types when requested', async () => {
  const client = new FakeClusterBatchClient();
  const summary = await generateUsdaClusterCandidatesBatch({
    client,
    dataTypes: ['branded_food'],
    batchSize: 5,
    sourceVersion: 'fixture',
  });

  assert.equal(summary.scanned, 1);
  assert.equal(summary.eligible, 0);
  assert.equal(summary.skipped_unsupported_data_type, 1);
  assert.equal(summary.generated, 0);
  assert.equal(client.candidates.size, 0);
});

test('DB2.5B embeds has_macro_data in representative score JSON', async () => {
  const client = new FakeClusterBatchClient();
  await generateUsdaClusterCandidatesBatch({
    client,
    dataTypes: ['sr_legacy_food'],
    batchSize: 10,
    sourceVersion: 'fixture',
  });

  const rice = [...client.candidates.values()]
    .find((candidate) => candidate.source_description.includes('Rice'));
  assert.ok(rice);
  assert.equal(rice.representative_score_json.has_macro_data, true);
});

class FakeClusterBatchClient {
  constructor() {
    this.foods = [
      {
        fdc_id: 100,
        data_type: 'foundation_food',
        description: 'Apples, red delicious, with skin, raw',
        food_category_id: '9',
      },
      {
        fdc_id: 101,
        data_type: 'foundation_food',
        description: 'Milk, whole, 3.25% milkfat, with added vitamin D',
        food_category_id: '1',
      },
      {
        fdc_id: 102,
        data_type: 'sr_legacy_food',
        description: 'Rice, white, long-grain, regular, cooked',
        food_category_id: '20',
      },
      {
        fdc_id: 103,
        data_type: 'sr_legacy_food',
        description: 'Beans, black, canned, sodium added, drained and rinsed',
        food_category_id: '16',
      },
      {
        fdc_id: 104,
        data_type: 'branded_food',
        description: 'BRANDED APPLE SNACK',
        food_category_id: 'snacks',
      },
      {
        fdc_id: 105,
        data_type: 'foundation_food',
        description: 'Mushrooms, shiitake',
        food_category_id: '11',
      },
    ];
    this.macroFdcIds = new Set([100, 102, 103, 104, 105]);
    this.candidates = new Map();
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT fdc_id, data_type, description, food_category_id FROM usda_foods')) {
      const [afterFdcId, dataTypes, limit] = params;
      return {
        rows: this.foods
          .filter((food) => food.fdc_id > Number(afterFdcId))
          .filter((food) => dataTypes.includes(food.data_type))
          .sort((left, right) => left.fdc_id - right.fdc_id)
          .slice(0, Number(limit)),
      };
    }

    if (normalized.startsWith('SELECT DISTINCT fn.fdc_id FROM usda_food_nutrients')) {
      const [fdcIds] = params;
      return {
        rows: fdcIds
          .map((fdcId) => Number(fdcId))
          .filter((fdcId) => this.macroFdcIds.has(fdcId))
          .map((fdcId) => ({ fdc_id: fdcId })),
      };
    }

    if (normalized.startsWith('INSERT INTO usda_food_cluster_candidates')) {
      const columns = [
        'candidate_id',
        'candidate_key',
        'core_food_name',
        'core_food_normalized',
        'source_fdc_id',
        'source_description',
        'source_data_type',
        'source_food_category_id',
        'parsed_qualifiers_json',
        'hard_boundary_signature',
        'representative_score',
        'representative_score_json',
        'confidence',
        'review_status',
        'generation_method',
        'rules_version',
        'source_version',
      ];
      for (let offset = 0; offset < params.length; offset += columns.length) {
        const row = {};
        columns.forEach((column, index) => {
          const value = params[offset + index];
          row[column] = column.endsWith('_json') ? JSON.parse(value) : value;
        });
        this.candidates.set(row.candidate_id, row);
      }
      return { rows: [] };
    }

    throw new Error(`Unexpected fake query: ${normalized.slice(0, 160)}`);
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

  console.log(`\nDB2.5 USDA cluster batch tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
