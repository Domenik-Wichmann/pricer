const fs = require('node:fs');
const path = require('node:path');

const {
  createPostgresPool,
  getRecipePromotionCandidateDetail,
  isPostgresConfigured,
  listRecipePromotionCandidates,
  reviewAndPromoteRecipe,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running DB5C recipe promotion.');
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

async function runCommand(client, args = {}) {
  if (args.jobId && args.decision) {
    return {
      action: 'review_or_promote',
      result: await reviewAndPromoteRecipe(client, {
        jobId: args.jobId,
        decision: args.decision,
        reason: args.reason,
      }),
    };
  }

  if (args.jobId) {
    return {
      action: 'inspect',
      detail: await getRecipePromotionCandidateDetail(client, {
        jobId: args.jobId,
      }),
    };
  }

  return {
    action: 'list',
    recipes: await listRecipePromotionCandidates(client, {
      status: args.status,
      limit: args.limit,
    }),
  };
}

function parseArgs(argv) {
  const args = {
    list: false,
    status: 'staged',
    jobId: null,
    decision: null,
    reason: null,
    json: false,
    out: null,
    limit: 100,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--list') args.list = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--status=')) args.status = arg.slice('--status='.length);
    else if (arg === '--status') args.status = argv[++index];
    else if (arg.startsWith('--job-id=')) args.jobId = arg.slice('--job-id='.length);
    else if (arg === '--job-id') args.jobId = argv[++index];
    else if (arg.startsWith('--decision=')) args.decision = arg.slice('--decision='.length);
    else if (arg === '--decision') args.decision = argv[++index];
    else if (arg.startsWith('--reason=')) args.reason = arg.slice('--reason='.length);
    else if (arg === '--reason') args.reason = argv[++index];
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
  }
  return args;
}

function human(report) {
  if (report.action === 'inspect') {
    if (!report.detail) return 'Candidate not found.';
    return [
      `Job: ${report.detail.job.job_id}`,
      `Recipe: ${report.detail.staged_recipe.proposed_recipe_key}`,
      `Total ingredients: ${report.detail.metrics.total_ingredients}`,
      `Matched ingredients: ${report.detail.metrics.matched_ingredients}`,
      `Ingredient match rate: ${report.detail.metrics.ingredient_match_rate}`,
      `Usability: ${report.detail.usability_status}`,
    ].join('\n');
  }
  if (report.action === 'review_or_promote') {
    const result = report.result;
    return [
      `Decision: ${result.decision}`,
      `Usability: ${result.usability_status}`,
      `Ingredient match rate: ${result.metrics.ingredient_match_rate}`,
      `Gap candidates: ${(result.gap_candidates || []).length}`,
    ].join('\n');
  }
  return `Candidates: ${(report.recipes || []).length}`;
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
