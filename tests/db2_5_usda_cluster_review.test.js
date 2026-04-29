const assert = require('node:assert/strict');

const {
  SUPPORTED_CLUSTER_REVIEW_DECISIONS,
  getUsdaFoodClusterReviewDetail,
  listMigrationFiles,
  listUsdaFoodClustersForReview,
  normalizeReviewDecision,
  reviewUsdaFoodCluster,
  validateUsdaClusterReviewTransition,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('DB2.5E migration adds review provenance and history table', () => {
  const migration = listMigrationFiles().find((file) => file.name === '007_db2_5_usda_cluster_review_workflow.sql');
  assert.ok(migration);
  [
    'usda_food_cluster_review_history',
    'reviewed_by',
    'reviewed_at',
    'review_decision',
    'review_reason',
    'needs_split',
    'needs_merge',
  ].forEach((token) => assert.match(migration.sql, new RegExp(token)));
});

test('DB2.5E validates review decisions and terminal transitions', () => {
  assert.deepEqual(SUPPORTED_CLUSTER_REVIEW_DECISIONS, [
    'pending_review',
    'approved',
    'rejected',
    'needs_split',
    'needs_merge',
  ]);
  assert.equal(normalizeReviewDecision(' APPROVED '), 'approved');
  assert.throws(() => normalizeReviewDecision('maybe'), /Unsupported/);
  assert.equal(validateUsdaClusterReviewTransition('pending_review', 'needs_split'), true);
  assert.throws(() => validateUsdaClusterReviewTransition('approved', 'rejected'), /Invalid USDA cluster review transition/);
});

test('DB2.5E lists clusters by review status for queue work', async () => {
  const client = new FakeReviewClient();
  const pending = await listUsdaFoodClustersForReview(client, {
    reviewStatus: 'pending_review',
    limit: 10,
  });
  assert.equal(pending.length, 2);
  assert.equal(pending[0].cluster_key, 'apple__state_raw__hb_state_raw');
});

test('DB2.5E shows cluster detail with members and review history', async () => {
  const client = new FakeReviewClient();
  const detail = await getUsdaFoodClusterReviewDetail(client, {
    clusterKey: 'apple__state_raw__hb_state_raw',
  });
  assert.equal(detail.cluster.cluster_key, 'apple__state_raw__hb_state_raw');
  assert.equal(detail.members.length, 2);
  assert.equal(detail.members[0].member_role, 'representative');
  assert.equal(detail.review_history.length, 0);
});

test('DB2.5E reviews cluster, updates provenance, and appends history', async () => {
  const client = new FakeReviewClient();
  const result = await reviewUsdaFoodCluster(client, {
    clusterKey: 'apple__state_raw__hb_state_raw',
    decision: 'approved',
    reviewedBy: 'tester',
    reviewReason: 'clear generic raw apple cluster',
    reviewNote: 'Representative looks correct.',
    reviewedAt: '2026-04-24T12:00:00.000Z',
  });
  assert.equal(result.previous_review_status, 'pending_review');
  assert.equal(result.review_decision, 'approved');
  assert.equal(result.cluster.review_status, 'approved');
  assert.equal(result.cluster.reviewed_by, 'tester');
  assert.equal(client.history.length, 1);
  assert.equal(client.history[0].previous_review_status, 'pending_review');
  assert.equal(client.history[0].review_note, 'Representative looks correct.');
  assert.equal(client.members.size, 3);
});

test('DB2.5E rejects invalid review changes and rolls back', async () => {
  const client = new FakeReviewClient();
  await reviewUsdaFoodCluster(client, {
    clusterKey: 'apple__state_raw__hb_state_raw',
    decision: 'approved',
    reviewedBy: 'tester',
    reviewedAt: '2026-04-24T12:00:00.000Z',
  });
  await assert.rejects(() => reviewUsdaFoodCluster(client, {
    clusterKey: 'apple__state_raw__hb_state_raw',
    decision: 'rejected',
    reviewedBy: 'tester',
    reviewedAt: '2026-04-24T13:00:00.000Z',
  }), /Invalid USDA cluster review transition/);
  assert.equal(client.clusters.get('apple__state_raw__hb_state_raw').review_status, 'approved');
  assert.equal(client.history.length, 1);
  assert.equal(client.rollbacks, 1);
});

class FakeReviewClient {
  constructor() {
    this.clusters = new Map([
      ['apple__state_raw__hb_state_raw', cluster('cluster:apple', 'apple__state_raw__hb_state_raw', 'pending_review', 'high')],
      ['rice__grain_state_cooked__hb_grain_state_cooked', cluster('cluster:rice', 'rice__grain_state_cooked__hb_grain_state_cooked', 'pending_review', 'medium')],
      ['milk__milk_fat_whole__hb_milk_fat_whole', cluster('cluster:milk', 'milk__milk_fat_whole__hb_milk_fat_whole', 'needs_split', 'low')],
    ]);
    this.members = new Map([
      ['cluster:apple:100', member('cluster:apple', 100, 'representative')],
      ['cluster:apple:101', member('cluster:apple', 101, 'included')],
      ['cluster:rice:200', member('cluster:rice', 200, 'representative')],
    ]);
    this.history = [];
    this.rollbacks = 0;
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (normalized === 'BEGIN' || normalized === 'COMMIT') return { rows: [] };
    if (normalized === 'ROLLBACK') {
      this.rollbacks += 1;
      return { rows: [] };
    }
    if (normalized.startsWith('SELECT * FROM usda_food_clusters WHERE review_status')) {
      const [status, limit] = params;
      return {
        rows: [...this.clusters.values()]
          .filter((row) => row.review_status === status)
          .sort((left, right) => left.confidence.localeCompare(right.confidence) || left.core_food_normalized.localeCompare(right.core_food_normalized))
          .slice(0, Number(limit)),
      };
    }
    if (normalized.startsWith('SELECT * FROM usda_food_clusters WHERE cluster_key') && normalized.includes('FOR UPDATE')) {
      return { rows: [this.clusters.get(params[0])].filter(Boolean) };
    }
    if (normalized.startsWith('SELECT * FROM usda_food_clusters WHERE cluster_key')) {
      return { rows: [this.clusters.get(params[0])].filter(Boolean) };
    }
    if (normalized.startsWith('SELECT * FROM usda_food_cluster_members')) {
      return {
        rows: [...this.members.values()]
          .filter((row) => row.cluster_id === params[0])
          .sort((left, right) => roleRank(left.member_role) - roleRank(right.member_role) || left.fdc_id - right.fdc_id),
      };
    }
    if (normalized.startsWith('SELECT * FROM usda_food_cluster_review_history')) {
      return { rows: this.history.filter((row) => row.cluster_id === params[0]) };
    }
    if (normalized.startsWith('UPDATE usda_food_clusters')) {
      const [status, reviewedBy, reviewedAt, reason, clusterId] = params;
      const current = [...this.clusters.values()].find((row) => row.cluster_id === clusterId);
      Object.assign(current, {
        review_status: status,
        reviewed_by: reviewedBy,
        reviewed_at: reviewedAt,
        review_decision: status,
        review_reason: reason,
      });
      return { rows: [current] };
    }
    if (normalized.startsWith('INSERT INTO usda_food_cluster_review_history')) {
      const [
        review_event_id,
        cluster_id,
        cluster_key,
        previous_review_status,
        review_decision,
        reviewed_by,
        reviewed_at,
        review_reason,
        review_note,
      ] = params;
      const existing = this.history.find((row) => row.review_event_id === review_event_id);
      if (existing) {
        existing.review_reason = review_reason;
        existing.review_note = review_note;
      } else {
        this.history.push({
          review_event_id,
          cluster_id,
          cluster_key,
          previous_review_status,
          review_decision,
          reviewed_by,
          reviewed_at,
          review_reason,
          review_note,
        });
      }
      return { rows: [] };
    }
    throw new Error(`Unexpected fake query: ${normalized.slice(0, 160)}`);
  }
}

function cluster(clusterId, clusterKey, status, confidence) {
  return {
    cluster_id: clusterId,
    cluster_key: clusterKey,
    core_food_normalized: clusterKey.split('__')[0],
    review_status: status,
    confidence,
    representative_fdc_id: 100,
  };
}

function member(clusterId, fdcId, role) {
  return {
    cluster_member_id: `${clusterId}:${fdcId}`,
    cluster_id: clusterId,
    fdc_id: fdcId,
    member_role: role,
    source_data_type: 'foundation_food',
  };
}

function roleRank(role) {
  if (role === 'representative') return 0;
  if (role === 'included') return 1;
  return 2;
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

  console.log(`\nDB2.5 USDA cluster review tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
