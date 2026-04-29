const fs = require('node:fs');
const path = require('node:path');

const {
  createPostgresPool,
  getIngredientByKey,
  isPostgresConfigured,
  listIngredientProductMappingsByIngredient,
  listProductsByIngredient,
  reviewIngredientProductMapping,
  runPostgresMigrations,
  searchCanonicalIngredients,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before reviewing DB3E product ingredient mappings.');
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
  const ingredient = args.ingredient ? await resolveIngredient(client, args.ingredient) : null;
  if (args.reviewStatus) {
    return {
      action: 'review_mapping',
      result: await reviewIngredientProductMapping(client, {
        mappingId: args.mappingId,
        ingredientId: ingredient ? ingredient.ingredient_id : args.ingredientId,
        productId: args.product,
        reviewStatus: args.reviewStatus,
        mappingType: args.mappingType,
        reviewedBy: args.reviewedBy,
        reviewReason: args.reason,
      }),
    };
  }

  if (!ingredient) {
    return {
      action: 'list_mappings',
      mappings: [],
      errors: ['Provide --ingredient=<ingredient_key_or_name> to list or review DB3E mappings.'],
    };
  }

  const mappings = args.products
    ? await listProductsByIngredient(client, ingredient.ingredient_id, { limit: args.limit })
    : await listIngredientProductMappingsByIngredient(client, ingredient.ingredient_id, { limit: args.limit });
  return {
    action: args.products ? 'list_products_by_ingredient' : 'list_mappings',
    ingredient,
    mappings,
  };
}

async function resolveIngredient(client, ingredientInput) {
  const exact = await getIngredientByKey(client, ingredientInput);
  if (exact) return exact;
  const matches = await searchCanonicalIngredients(client, { query: ingredientInput, limit: 1 });
  return matches[0] || null;
}

function parseArgs(argv) {
  const args = {
    mappingId: null,
    ingredient: null,
    ingredientId: null,
    product: null,
    reviewStatus: null,
    mappingType: null,
    reviewedBy: process.env.USER || process.env.USERNAME || 'unknown_reviewer',
    reason: null,
    products: false,
    json: false,
    out: null,
    limit: 100,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--products') args.products = true;
    else if (arg.startsWith('--mapping-id=')) args.mappingId = arg.slice('--mapping-id='.length);
    else if (arg === '--mapping-id') args.mappingId = argv[++index];
    else if (arg.startsWith('--ingredient=')) args.ingredient = arg.slice('--ingredient='.length);
    else if (arg === '--ingredient') args.ingredient = argv[++index];
    else if (arg.startsWith('--ingredient-id=')) args.ingredientId = arg.slice('--ingredient-id='.length);
    else if (arg === '--ingredient-id') args.ingredientId = argv[++index];
    else if (arg.startsWith('--product=')) args.product = arg.slice('--product='.length);
    else if (arg === '--product') args.product = argv[++index];
    else if (arg.startsWith('--review-status=')) args.reviewStatus = arg.slice('--review-status='.length);
    else if (arg === '--review-status') args.reviewStatus = argv[++index];
    else if (arg.startsWith('--mapping-type=')) args.mappingType = arg.slice('--mapping-type='.length);
    else if (arg === '--mapping-type') args.mappingType = argv[++index];
    else if (arg.startsWith('--reason=')) args.reason = arg.slice('--reason='.length);
    else if (arg === '--reason') args.reason = argv[++index];
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
  if (report.action === 'review_mapping') {
    return report.result
      ? `${report.result.mapping_id}: ${report.result.review_status}`
      : 'Mapping not found.';
  }
  return `Mappings: ${(report.mappings || []).length}`;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  resolveIngredient,
  runCommand,
};
