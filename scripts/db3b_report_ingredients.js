const fs = require('node:fs');
const path = require('node:path');

const {
  buildIngredientInspectionReport,
  createPostgresPool,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before reporting on DB3 ingredients.');
    console.log('Local example: docker compose up -d postgres');
    console.log('Then set DATABASE_URL=postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await buildIngredientInspectionReport({
        client,
        limit: args.limit,
        reviewStatus: args.reviewStatus,
        missingBg: args.missingBg,
        withoutMapping: args.withoutMapping,
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
  console.log('DB3 Ingredient Inspection');
  console.log(`Total ingredients: ${report.total_ingredients}`);
  console.log('');
  console.log('By review status:');
  report.summary_by_review_status.forEach((row) => console.log(`- ${row.key}: ${row.count}`));
  console.log('');
  console.log('By food family:');
  report.summary_by_food_family.forEach((row) => console.log(`- ${row.key}: ${row.count}`));
  console.log('');
  console.log(`Missing BG names: ${report.missing_bulgarian_names.length}`);
  console.log(`Missing units: ${report.missing_default_units.length}`);
  console.log(`Duplicate normalized names: ${report.duplicate_normalized_names.length}`);
  console.log(`Alias collisions: ${report.alias_collision_report.length}`);
  console.log(`Without nutrition mappings: ${report.ingredients_without_nutrition_mappings.length}`);
  console.log('');
  console.log('Recommended next review targets:');
  report.recommended_next_review_targets.forEach((target) => {
    console.log(`- ${target.priority}: ${target.reason} (${target.count})`);
  });
}

function parseArgs(argv) {
  const parsed = {
    json: false,
    out: null,
    limit: 100,
    reviewStatus: null,
    missingBg: false,
    withoutMapping: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') parsed.json = true;
    else if (arg.startsWith('--out=')) parsed.out = arg.slice('--out='.length);
    else if (arg === '--out') {
      parsed.out = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--limit=')) parsed.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') {
      parsed.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--review-status=')) parsed.reviewStatus = arg.slice('--review-status='.length);
    else if (arg === '--review-status') {
      parsed.reviewStatus = argv[index + 1];
      index += 1;
    } else if (arg === '--missing-bg') parsed.missingBg = true;
    else if (arg === '--without-mapping') parsed.withoutMapping = true;
  }

  return parsed;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  printHumanReport,
};
