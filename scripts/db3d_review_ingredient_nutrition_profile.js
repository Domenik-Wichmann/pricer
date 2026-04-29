const fs = require('node:fs');
const path = require('node:path');

const {
  createPostgresPool,
  getIngredientNutritionProfileCandidateDetail,
  isPostgresConfigured,
  listApprovedIngredientNutritionProfiles,
  listIngredientNutritionProfileCandidatesForReview,
  reviewIngredientNutritionProfileCandidate,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before reviewing ingredient nutrition profiles.');
    return;
  }
  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await runCommand(client, args);
      if (args.out) {
        fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
        fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
      }
      console.log(args.json || args.out ? JSON.stringify(report, null, 2) : human(report));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function runCommand(client, args) {
  if (args.listApproved) {
    return {
      action: 'list_approved_profiles',
      profiles: await listApprovedIngredientNutritionProfiles(client, args),
    };
  }
  if (args.candidateId && !args.decision) {
    return {
      action: 'show_candidate',
      detail: await getIngredientNutritionProfileCandidateDetail(client, { candidateId: args.candidateId }),
    };
  }
  if (args.decision) {
    return {
      action: 'review_candidate',
      result: await reviewIngredientNutritionProfileCandidate(client, args),
    };
  }
  return {
    action: 'list_candidates',
    candidates: await listIngredientNutritionProfileCandidatesForReview(client, args),
  };
}

function parseArgs(argv) {
  const args = {
    candidateId: null,
    ingredient: null,
    reviewStatus: 'candidate',
    decision: null,
    reviewReason: null,
    reviewedBy: process.env.USER || process.env.USERNAME || 'unknown_reviewer',
    limit: 100,
    json: false,
    out: null,
    listApproved: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--list-approved' || arg === '--profiles') args.listApproved = true;
    else if (arg.startsWith('--candidate-id=')) args.candidateId = arg.slice('--candidate-id='.length);
    else if (arg === '--candidate-id') args.candidateId = argv[++index];
    else if (arg.startsWith('--ingredient=')) args.ingredient = arg.slice('--ingredient='.length);
    else if (arg === '--ingredient') args.ingredient = argv[++index];
    else if (arg.startsWith('--review-status=')) args.reviewStatus = arg.slice('--review-status='.length);
    else if (arg === '--review-status') args.reviewStatus = argv[++index];
    else if (arg.startsWith('--decision=')) args.decision = arg.slice('--decision='.length);
    else if (arg === '--decision') args.decision = argv[++index];
    else if (arg.startsWith('--reason=')) args.reviewReason = arg.slice('--reason='.length);
    else if (arg === '--reason') args.reviewReason = argv[++index];
    else if (arg.startsWith('--reviewed-by=')) args.reviewedBy = arg.slice('--reviewed-by='.length);
    else if (arg === '--reviewed-by') args.reviewedBy = argv[++index];
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
  }
  return args;
}

function human(report) {
  if (report.action === 'list_approved_profiles') return `Approved profiles: ${report.profiles.length}`;
  if (report.action === 'show_candidate') {
    return report.detail
      ? `${report.detail.candidate.profile_candidate_id}: ${report.detail.candidate.review_status}`
      : 'Candidate not found.';
  }
  if (report.action === 'review_candidate') {
    return `${report.result.candidate.profile_candidate_id}: ${report.result.previous_candidate_review_status} -> ${report.result.review_decision}`;
  }
  return `Candidates: ${report.candidates.length}`;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  runCommand,
};
