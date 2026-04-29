const assert = require('node:assert/strict');

const {
  buildClusterKey,
  compareRepresentativeCandidates,
  listMigrationFiles,
  materializeUsdaClustersPreview,
  normalizeClusterMaterializationOptions,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('DB2.5D migration creates proposed cluster and member tables', () => {
  const migration = listMigrationFiles().find((file) => file.name === '006_db2_5_usda_food_clusters_preview.sql');
  assert.ok(migration);
  [
    'usda_food_clusters',
    'usda_food_cluster_members',
    'cluster_key',
    'representative_fdc_id',
    'representative_selection_reason',
    'member_role',
    'pending_review',
  ].forEach((token) => assert.match(migration.sql, new RegExp(token)));
});

test('DB2.5D normalizes materialization options deterministically', () => {
  const options = normalizeClusterMaterializationOptions({
    dryRun: true,
    limit: 0,
    batchSize: 0,
    candidateKey: ' apple__state_raw ',
    coreFood: ' apple ',
  });
  assert.equal(options.dryRun, true);
  assert.equal(options.limit, 1000);
  assert.equal(options.batchSize, 500);
  assert.equal(options.candidateKey, 'apple__state_raw');
  assert.equal(options.coreFood, 'apple');
  assert.equal(options.reviewStatus, 'pending_review');
});

test('DB2.5D representative sorting follows score and deterministic tie-breakers', () => {
  const foundation = candidate({ fdc: 20, dataType: 'foundation_food', score: 70, confidence: 'medium', description: 'Apple, raw' });
  const legacy = candidate({ fdc: 10, dataType: 'sr_legacy_food', score: 70, confidence: 'medium', description: 'Apple, raw' });
  assert.equal(compareRepresentativeCandidates(foundation, legacy) < 0, true);

  const shorter = candidate({ fdc: 50, dataType: 'foundation_food', score: 80, confidence: 'high', description: 'Rice, raw' });
  const longer = candidate({ fdc: 1, dataType: 'foundation_food', score: 80, confidence: 'high', description: 'Rice, white, long grain, raw' });
  assert.equal(compareRepresentativeCandidates(shorter, longer) < 0, true);
});

test('DB2.5D dry-run proposes clusters and members without writes', async () => {
  const client = new FakeMaterializationClient();
  const result = await materializeUsdaClustersPreview({
    client,
    dryRun: true,
    limit: 20,
  });

  assert.equal(result.scanned_candidates, 5);
  assert.equal(result.proposed_clusters, 3);
  assert.equal(result.proposed_members, 5);
  assert.equal(result.upserted_clusters, 0);
  assert.equal(result.upserted_members, 0);
  assert.equal(client.clusters.size, 0);
  assert.equal(client.members.size, 0);

  const appleCluster = result.clusters.find((cluster) => cluster.core_food_normalized === 'apple');
  assert.equal(appleCluster.representative_fdc_id, 101);
  assert.equal(appleCluster.review_status, 'pending_review');
  assert.deepEqual(appleCluster.source_category_ids, ['9']);
  assert.equal(appleCluster.parsed_shared_qualifiers_json.hard_boundary_signature, 'state:raw');

  const appleMembers = result.members.filter((member) => member.cluster_id === appleCluster.cluster_id);
  assert.equal(appleMembers.find((member) => member.fdc_id === 101).member_role, 'representative');
  assert.equal(appleMembers.find((member) => member.fdc_id === 100).member_role, 'included');
});

test('DB2.5D non-dry-run upserts idempotently and preserves reviewed cluster status', async () => {
  const client = new FakeMaterializationClient();
  const clusterKey = buildClusterKey('apple__state_raw', 'state:raw');
  client.clusters.set(clusterKey, {
    cluster_key: clusterKey,
    review_status: 'approved',
  });

  const first = await materializeUsdaClustersPreview({ client, limit: 20 });
  const second = await materializeUsdaClustersPreview({ client, limit: 20 });

  assert.equal(first.upserted_clusters, 3);
  assert.equal(first.upserted_members, 5);
  assert.equal(second.upserted_clusters, 3);
  assert.equal(second.upserted_members, 5);
  assert.equal(client.clusters.size, 3);
  assert.equal(client.members.size, 5);
  assert.equal(client.clusters.get(clusterKey).review_status, 'approved');
});

test('DB2.5D candidate-key and core-food filters scope proposed output', async () => {
  const client = new FakeMaterializationClient();
  const byKey = await materializeUsdaClustersPreview({
    client,
    dryRun: true,
    candidateKey: 'rice__grain_state_cooked',
  });
  assert.equal(byKey.proposed_clusters, 1);
  assert.equal(byKey.clusters[0].core_food_normalized, 'rice');

  const byCore = await materializeUsdaClustersPreview({
    client,
    dryRun: true,
    coreFood: 'apple',
  });
  assert.equal(byCore.proposed_clusters, 2);
  assert.equal(byCore.proposed_members, 4);
});

class FakeMaterializationClient {
  constructor() {
    this.candidates = [
      candidate({ fdc: 100, dataType: 'sr_legacy_food', score: 80, confidence: 'high', key: 'apple__state_raw', core: 'apple', name: 'Apple', description: 'Apples, raw', category: '9' }),
      candidate({ fdc: 101, dataType: 'foundation_food', score: 80, confidence: 'high', key: 'apple__state_raw', core: 'apple', name: 'Apple', description: 'Apples, with skin, raw', category: '9' }),
      candidate({ fdc: 200, dataType: 'sr_legacy_food', score: 70, confidence: 'medium', key: 'rice__grain_state_cooked', core: 'rice', name: 'Rice', description: 'Rice, cooked', category: '20', hardBoundary: 'grain_state:cooked', qualifiers: { hard_boundary_tokens: ['grain_state:cooked'], grain_state: 'cooked' } }),
      candidate({ fdc: 300, dataType: 'foundation_food', score: 48, confidence: 'low', key: 'applesauce__form_sauce', core: 'applesauce', name: 'Applesauce', description: 'Applesauce, sweetened', category: '9', hardBoundary: 'form:sauce|sweet:sweetened', reviewStatus: 'needs_review', qualifiers: { hard_boundary_tokens: ['form:sauce', 'sweet:sweetened'], form: 'sauce', sweetened_status: 'sweetened' } }),
      candidate({ fdc: 301, dataType: 'sr_legacy_food', score: 42, confidence: 'low', key: 'applesauce__form_sauce', core: 'applesauce', name: 'Applesauce', description: 'Applesauce, canned, sweetened', category: '9', hardBoundary: 'form:sauce|sweet:sweetened', reviewStatus: 'needs_review', qualifiers: { hard_boundary_tokens: ['form:sauce', 'sweet:sweetened'], form: 'sauce', sweetened_status: 'sweetened' } }),
    ];
    this.clusters = new Map();
    this.members = new Map();
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT candidate_id,')) {
      let rows = [...this.candidates];
      if (normalized.includes('candidate_key =')) {
        const key = params.find((param) => String(param).includes('__'));
        rows = rows.filter((candidateRow) => candidateRow.candidate_key === key);
      }
      if (normalized.includes('core_food_normalized ILIKE')) {
        const pattern = params.find((param) => String(param).startsWith('%'));
        const term = String(pattern || '').replace(/%/g, '').toLowerCase();
        rows = rows.filter((candidateRow) => (
          candidateRow.core_food_normalized.includes(term)
          || candidateRow.core_food_name.toLowerCase().includes(term)
        ));
      }
      const limit = Number(params[params.length - 1]) || 1000;
      return { rows: rows.slice(0, limit) };
    }

    if (normalized.startsWith('INSERT INTO usda_food_clusters')) {
      const columns = [
        'cluster_id',
        'cluster_key',
        'core_food_name',
        'core_food_normalized',
        'food_category_hint',
        'source_category_ids',
        'parsed_shared_qualifiers_json',
        'representative_fdc_id',
        'representative_selection_reason',
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
          row[column] = column.endsWith('_json') || column === 'source_category_ids' ? JSON.parse(value) : value;
        });
        const existing = this.clusters.get(row.cluster_key);
        if (existing && ['approved', 'rejected'].includes(existing.review_status)) {
          row.review_status = existing.review_status;
        }
        this.clusters.set(row.cluster_key, row);
      }
      return { rows: [] };
    }

    if (normalized.startsWith('INSERT INTO usda_food_cluster_members')) {
      const columns = [
        'cluster_member_id',
        'cluster_id',
        'fdc_id',
        'member_role',
        'confidence',
        'inclusion_reason',
        'exclusion_flags',
        'source_data_type',
      ];
      for (let offset = 0; offset < params.length; offset += columns.length) {
        const row = {};
        columns.forEach((column, index) => {
          const value = params[offset + index];
          row[column] = column === 'exclusion_flags' ? JSON.parse(value) : value;
        });
        this.members.set(`${row.cluster_id}:${row.fdc_id}`, row);
      }
      return { rows: [] };
    }

    throw new Error(`Unexpected fake query: ${normalized.slice(0, 160)}`);
  }
}

function candidate({
  fdc,
  dataType,
  score,
  confidence,
  key = 'apple__state_raw',
  core = 'apple',
  name = 'Apple',
  description = 'Apples, raw',
  category = '9',
  hardBoundary = 'state:raw',
  reviewStatus = 'candidate',
  qualifiers = { hard_boundary_tokens: ['state:raw'], state: 'raw' },
}) {
  return {
    candidate_id: `candidate:${fdc}`,
    candidate_key: key,
    core_food_name: name,
    core_food_normalized: core,
    source_fdc_id: fdc,
    source_description: description,
    source_data_type: dataType,
    source_food_category_id: category,
    parsed_qualifiers_json: qualifiers,
    hard_boundary_signature: hardBoundary,
    representative_score: score,
    representative_score_json: { score, has_macro_data: true },
    confidence,
    review_status: reviewStatus,
    generation_method: 'deterministic_foundation_sr_legacy_v1',
    rules_version: 'db2_5_usda_cluster_rules_v1',
    source_version: 'fixture',
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

  console.log(`\nDB2.5 USDA cluster materialization tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
