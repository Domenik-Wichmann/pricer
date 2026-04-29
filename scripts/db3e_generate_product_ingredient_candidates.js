const fs = require('node:fs');
const path = require('node:path');

const {
  buildIngredientProductMappingSuggestions,
  buildProductCandidates,
  createPostgresPool,
  getIngredientByKey,
  insertProductCandidates,
  isPostgresConfigured,
  listIngredientsByReviewStatus,
  runPostgresMigrations,
  searchCanonicalIngredients,
  suggestIngredientProductMappings,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running DB3E product ingredient matching.');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await generateProductIngredientCandidates(client, args);
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

async function generateProductIngredientCandidates(client, args = {}) {
  const ingredients = await loadIngredients(client, args);
  const productInputs = parseProductInputs(args.product).slice(0, args.limit);
  const productCandidates = buildProductCandidates(productInputs);
  const suggestions = buildIngredientProductMappingSuggestions({
    ingredients,
    productCandidates,
  });

  const report = {
    dry_run: Boolean(args.dryRun),
    products_seen: productInputs.length,
    candidates_generated: productCandidates.length,
    mappings_suggested: suggestions.length,
    candidates_written: 0,
    mappings_written: 0,
    ingredient_filter: args.ingredient || null,
    errors: [],
    candidates: args.json ? productCandidates : undefined,
    suggestions: args.json ? suggestions : undefined,
  };

  if (productInputs.length === 0) {
    report.errors.push('No product input supplied. Use --product=<product name> for DB3E preview generation until a product ingestion table is introduced.');
    return report;
  }

  if (!args.dryRun) {
    report.candidates_written = (await insertProductCandidates(client, productCandidates)).length;
    report.mappings_written = (await suggestIngredientProductMappings(client, suggestions)).length;
  }

  return report;
}

async function loadIngredients(client, args) {
  if (args.ingredient) {
    const exact = await getIngredientByKey(client, args.ingredient);
    if (exact) return [exact];
    return searchCanonicalIngredients(client, { query: args.ingredient, limit: args.limit });
  }
  return listIngredientsByReviewStatus(client, 'active', { limit: args.limit });
}

function parseProductInputs(productArg) {
  if (!productArg) return [];
  const entries = Array.isArray(productArg) ? productArg : [productArg];
  return entries.map((entry) => {
    if (typeof entry === 'object' && entry) return entry;
    const raw = String(entry || '').trim();
    const separator = raw.indexOf('|');
    const productId = separator > 0 ? raw.slice(0, separator).trim() : `manual_product:${normalizeProductText(raw)}`;
    const productName = separator > 0 ? raw.slice(separator + 1).trim() : raw;
    return {
      product_id: productId,
      product_name: productName,
    };
  }).filter((row) => row.product_id && row.product_name);
}

function normalizeProductText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}0-9]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: 100,
    ingredient: null,
    product: [],
    json: false,
    out: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg.startsWith('--ingredient=')) args.ingredient = arg.slice('--ingredient='.length);
    else if (arg === '--ingredient') args.ingredient = argv[++index];
    else if (arg.startsWith('--product=')) args.product.push(arg.slice('--product='.length));
    else if (arg === '--product') args.product.push(argv[++index]);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
  }
  return args;
}

function human(report) {
  return [
    'DB3E ingredient product candidate generation',
    `Dry run: ${report.dry_run}`,
    `Products seen: ${report.products_seen}`,
    `Candidates generated: ${report.candidates_generated}`,
    `Mappings suggested: ${report.mappings_suggested}`,
    `Candidates written: ${report.candidates_written}`,
    `Mappings written: ${report.mappings_written}`,
    `Errors: ${report.errors.length}`,
  ].join('\n');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  generateProductIngredientCandidates,
  parseArgs,
  parseProductInputs,
};
