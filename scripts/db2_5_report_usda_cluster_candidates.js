const fs = require('node:fs');
const path = require('node:path');

const {
  buildUsdaClusterCandidateInspectionReport,
  createPostgresPool,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before reporting on USDA cluster candidates.');
    console.log('Local example: docker compose up -d postgres');
    console.log('Then set DATABASE_URL=postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await buildUsdaClusterCandidateInspectionReport({
        client,
        limit: args.limit,
        minConfidence: args.minConfidence,
        candidateKey: args.candidateKey,
        coreFood: args.coreFood,
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
  console.log('USDA Cluster Candidate Inspection');
  console.log(`Total candidates: ${report.total_candidates}`);
  console.log(`Distinct candidate keys: ${report.distinct_candidate_key_count}`);
  console.log('');
  console.log('By source data type:');
  report.summary_by_source_data_type.forEach((row) => console.log(`- ${row.key}: ${row.count}`));
  console.log('');
  console.log('By review status:');
  report.summary_by_review_status.forEach((row) => console.log(`- ${row.key}: ${row.count}`));
  console.log('');
  console.log('Representative score distribution:');
  console.log(`- min: ${report.representative_score_distribution.min_score}`);
  console.log(`- avg: ${report.representative_score_distribution.average_score}`);
  console.log(`- max: ${report.representative_score_distribution.max_score}`);
  console.log(`- low/medium/high: ${report.representative_score_distribution.buckets.low_lt_55}/${report.representative_score_distribution.buckets.medium_55_to_74}/${report.representative_score_distribution.buckets.high_gte_75}`);
  console.log('');
  console.log('Recommended next review targets:');
  report.recommended_next_review_targets.forEach((target) => {
    console.log(`- ${target.priority}: ${target.reason} (${target.count})`);
  });
}

function parseArgs(argv) {
  const parsed = {
    limit: 100,
    minConfidence: 0.75,
    candidateKey: null,
    coreFood: null,
    json: false,
    out: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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
    if (arg.startsWith('--min-confidence=')) {
      parsed.minConfidence = Number(arg.slice('--min-confidence='.length));
      continue;
    }
    if (arg === '--min-confidence') {
      parsed.minConfidence = Number(argv[index + 1]);
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
