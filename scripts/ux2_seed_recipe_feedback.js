const fs = require('node:fs');
const path = require('node:path');

const {
  attachManualNoteSignals,
  createPostgresPool,
  getRecipeByKey,
  getUserFoodProfileByUserId,
  isPostgresConfigured,
  recordRecipeFeedbackEvent,
  runPostgresMigrations,
} = require('../functions/src');

async function seedRecipeFeedback({
  client,
  dryRun = false,
  limit = 100,
  seedPath = defaultSeedPath(),
} = {}) {
  const seeds = JSON.parse(fs.readFileSync(seedPath, 'utf8')).slice(0, positiveInteger(limit, 100));
  const report = {
    dry_run: Boolean(dryRun),
    seed_path: seedPath,
    events_seen: seeds.length,
    events_written: 0,
    signals_written: 0,
    skipped_missing_profiles: 0,
    skipped_missing_recipes: 0,
    errors: [],
    events: [],
  };

  for (const seed of seeds) {
    const profile = await getUserFoodProfileByUserId(client, seed.user_id);
    if (!profile) {
      report.skipped_missing_profiles += 1;
      report.errors.push(`Missing profile for user_id=${seed.user_id}`);
      continue;
    }

    const recipe = await getRecipeByKey(client, seed.recipe_key);
    if (!recipe) {
      report.skipped_missing_recipes += 1;
      report.errors.push(`Missing recipe for recipe_key=${seed.recipe_key}`);
      continue;
    }

    if (dryRun) {
      report.events.push({
        ...seed,
        profile_id: profile.profile_id,
        recipe_id: recipe.recipe_id,
      });
      continue;
    }

    const event = await recordRecipeFeedbackEvent(client, {
      ...seed,
      profileId: profile.profile_id,
      recipeId: recipe.recipe_id,
    });
    report.events_written += 1;

    const noteSignals = Array.isArray(seed.note_signals) ? seed.note_signals : [];
    if (noteSignals.length > 0) {
      const insertedSignals = await attachManualNoteSignals(client, {
        feedbackId: event.feedback_id,
        signals: noteSignals,
      });
      report.signals_written += insertedSignals.length;
    }

    report.events.push({
      feedback_id: event.feedback_id,
      profile_id: event.profile_id,
      recipe_id: event.recipe_id,
      event_type: event.event_type,
      note_signal_count: noteSignals.length,
    });
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before seeding UX2 recipe feedback.');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await seedRecipeFeedback({ client, ...args });
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

function defaultSeedPath() {
  return path.join(__dirname, '..', 'data', 'seeds', 'recipe_feedback_seed.json');
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    json: false,
    out: null,
    limit: 100,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
  }

  return args;
}

function human(report) {
  return [
    'UX2 recipe feedback seed',
    `Dry run: ${report.dry_run}`,
    `Events seen: ${report.events_seen}`,
    `Events written: ${report.events_written}`,
    `Signals written: ${report.signals_written}`,
    `Skipped missing profiles: ${report.skipped_missing_profiles}`,
    `Skipped missing recipes: ${report.skipped_missing_recipes}`,
    `Errors: ${report.errors.length}`,
  ].join('\n');
}

function positiveInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  seedRecipeFeedback,
};
