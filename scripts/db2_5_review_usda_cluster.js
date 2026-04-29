const {
  createPostgresPool,
  getUsdaFoodClusterReviewDetail,
  isPostgresConfigured,
  listUsdaFoodClustersForReview,
  reviewUsdaFoodCluster,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before reviewing USDA clusters.');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const result = await runCommand(client, args);
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printHumanResult(result);
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function runCommand(client, args) {
  if (args.list) {
    return {
      action: 'list',
      clusters: await listUsdaFoodClustersForReview(client, {
        reviewStatus: args.reviewStatus,
        limit: args.limit,
      }),
    };
  }
  if (args.show) {
    return {
      action: 'show',
      detail: await getUsdaFoodClusterReviewDetail(client, {
        clusterKey: args.clusterKey,
      }),
    };
  }
  if (args.decision) {
    return {
      action: 'review',
      result: await reviewUsdaFoodCluster(client, {
        clusterKey: args.clusterKey,
        decision: args.decision,
        reviewedBy: args.reviewedBy,
        reviewReason: args.reason,
        reviewNote: args.note,
      }),
    };
  }
  throw new Error('Choose --list, --show, or a review decision such as --approve / --reject / --needs-split / --needs-merge / --pending-review.');
}

function printHumanResult(result) {
  if (result.action === 'list') {
    console.log(`USDA clusters: ${result.clusters.length}`);
    result.clusters.forEach((cluster) => {
      console.log(`- ${cluster.cluster_key}: ${cluster.review_status}, ${cluster.confidence}, representative ${cluster.representative_fdc_id}`);
    });
    return;
  }
  if (result.action === 'show') {
    if (!result.detail) {
      console.log('Cluster not found.');
      return;
    }
    console.log(`${result.detail.cluster.cluster_key}: ${result.detail.cluster.review_status}`);
    console.log(`Members: ${result.detail.members.length}`);
    result.detail.members.forEach((member) => {
      console.log(`- ${member.member_role}: ${member.fdc_id} (${member.source_data_type})`);
    });
    console.log(`Review events: ${result.detail.review_history.length}`);
    return;
  }
  if (result.action === 'review') {
    console.log(`${result.result.cluster.cluster_key}: ${result.result.previous_review_status} -> ${result.result.review_decision}`);
    console.log(`Review event: ${result.result.review_event_id}`);
  }
}

function parseArgs(argv) {
  const parsed = {
    list: false,
    show: false,
    decision: null,
    clusterKey: null,
    reviewStatus: 'pending_review',
    reviewedBy: process.env.USER || process.env.USERNAME || 'unknown_reviewer',
    reason: null,
    note: null,
    limit: 100,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') parsed.json = true;
    else if (arg === '--list') parsed.list = true;
    else if (arg === '--show') parsed.show = true;
    else if (arg === '--approve') parsed.decision = 'approved';
    else if (arg === '--reject') parsed.decision = 'rejected';
    else if (arg === '--needs-split') parsed.decision = 'needs_split';
    else if (arg === '--needs-merge') parsed.decision = 'needs_merge';
    else if (arg === '--pending-review') parsed.decision = 'pending_review';
    else if (arg.startsWith('--cluster-key=')) parsed.clusterKey = arg.slice('--cluster-key='.length);
    else if (arg === '--cluster-key') {
      parsed.clusterKey = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--review-status=')) parsed.reviewStatus = arg.slice('--review-status='.length);
    else if (arg === '--review-status') {
      parsed.reviewStatus = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--reviewed-by=')) parsed.reviewedBy = arg.slice('--reviewed-by='.length);
    else if (arg === '--reviewed-by') {
      parsed.reviewedBy = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--reason=')) parsed.reason = arg.slice('--reason='.length);
    else if (arg === '--reason') {
      parsed.reason = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--note=')) parsed.note = arg.slice('--note='.length);
    else if (arg === '--note') {
      parsed.note = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--limit=')) parsed.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') {
      parsed.limit = Number(argv[index + 1]);
      index += 1;
    }
  }

  return parsed;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
