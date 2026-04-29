const {
  createPostgresPool,
  getIngredientNutritionMappingReviewDetail,
  isPostgresConfigured,
  listIngredientNutritionMappingsForReview,
  reviewIngredientNutritionMapping,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before reviewing ingredient nutrition mappings.');
    return;
  }
  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const result = await runCommand(client, args);
      console.log(args.json ? JSON.stringify(result, null, 2) : human(result));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function runCommand(client, args) {
  if (args.list) {
    return { action: 'list', mappings: await listIngredientNutritionMappingsForReview(client, args) };
  }
  if (args.show) {
    return { action: 'show', detail: await getIngredientNutritionMappingReviewDetail(client, { mappingId: args.mappingId }) };
  }
  if (args.decision) {
    return { action: 'review', result: await reviewIngredientNutritionMapping(client, args) };
  }
  throw new Error('Choose --list, --show, --approve, --reject, --needs-review, or --suggested.');
}

function parseArgs(argv) {
  const args = {
    list: false,
    show: false,
    decision: null,
    mappingId: null,
    reviewStatus: 'suggested',
    reviewedBy: process.env.USER || process.env.USERNAME || 'unknown_reviewer',
    reviewReason: null,
    reviewNote: null,
    limit: 100,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--list') args.list = true;
    else if (arg === '--show') args.show = true;
    else if (arg === '--approve') args.decision = 'approved';
    else if (arg === '--reject') args.decision = 'rejected';
    else if (arg === '--needs-review') args.decision = 'needs_review';
    else if (arg === '--suggested') args.decision = 'suggested';
    else if (arg.startsWith('--mapping-id=')) args.mappingId = arg.slice(13);
    else if (arg === '--mapping-id') args.mappingId = argv[++i];
    else if (arg.startsWith('--review-status=')) args.reviewStatus = arg.slice(16);
    else if (arg === '--review-status') args.reviewStatus = argv[++i];
    else if (arg.startsWith('--reviewed-by=')) args.reviewedBy = arg.slice(14);
    else if (arg === '--reviewed-by') args.reviewedBy = argv[++i];
    else if (arg.startsWith('--reason=')) args.reviewReason = arg.slice(9);
    else if (arg === '--reason') args.reviewReason = argv[++i];
    else if (arg.startsWith('--note=')) args.reviewNote = arg.slice(7);
    else if (arg === '--note') args.reviewNote = argv[++i];
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice(8));
    else if (arg === '--limit') args.limit = Number(argv[++i]);
  }
  return args;
}

function human(result) {
  if (result.action === 'list') return `Mappings: ${result.mappings.length}`;
  if (result.action === 'show') return result.detail ? `${result.detail.mapping.mapping_id}: ${result.detail.mapping.review_status}` : 'Mapping not found.';
  return `${result.result.mapping.mapping_id}: ${result.result.previous_review_status} -> ${result.result.review_decision}`;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
