const fs = require('node:fs');
const path = require('node:path');

const {
  createPostgresPool,
  isPostgresConfigured,
  materializeUsdaClustersPreview,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before materializing USDA cluster previews.');
    console.log('Local example: docker compose up -d postgres');
    console.log('Then set DATABASE_URL=postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await materializeUsdaClustersPreview({
        client,
        dryRun: args.dryRun,
        limit: args.limit,
        batchSize: args.batchSize,
        candidateKey: args.candidateKey,
        coreFood: args.coreFood,
        reviewStatus: args.reviewStatus,
      });
      if (args.out) {
        fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
        fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
      }
      if (args.json || args.out) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printHumanReport(report);
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function printHumanReport(report) {
  console.log('USDA Cluster Materialization Preview');
  console.log(`Dry run: ${report.dry_run}`);
  console.log(`Scanned candidates: ${report.scanned_candidates}`);
  console.log(`Proposed clusters: ${report.proposed_clusters}`);
  console.log(`Proposed members: ${report.proposed_members}`);
  console.log(`Upserted clusters: ${report.upserted_clusters}`);
  console.log(`Upserted members: ${report.upserted_members}`);
  console.log('');
  console.log('First proposed clusters:');
  report.clusters.slice(0, 10).forEach((cluster) => {
    console.log(`- ${cluster.cluster_key}: representative ${cluster.representative_fdc_id}, ${cluster.confidence}`);
  });
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    limit: 1000,
    batchSize: 500,
    candidateKey: null,
    coreFood: null,
    reviewStatus: 'pending_review',
    json: false,
    out: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      parsed.limit = Number(arg.slice('--limit='.length));
      continue;
    }
    if (arg === '--limit') {
      parsed.limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--batch-size=')) {
      parsed.batchSize = Number(arg.slice('--batch-size='.length));
      continue;
    }
    if (arg === '--batch-size') {
      parsed.batchSize = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--candidate-key=')) {
      parsed.candidateKey = arg.slice('--candidate-key='.length);
      continue;
    }
    if (arg === '--candidate-key') {
      parsed.candidateKey = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--core-food=')) {
      parsed.coreFood = arg.slice('--core-food='.length);
      continue;
    }
    if (arg === '--core-food') {
      parsed.coreFood = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--review-status=')) {
      parsed.reviewStatus = arg.slice('--review-status='.length);
      continue;
    }
    if (arg === '--review-status') {
      parsed.reviewStatus = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--out=')) {
      parsed.out = arg.slice('--out='.length);
      continue;
    }
    if (arg === '--out') {
      parsed.out = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
