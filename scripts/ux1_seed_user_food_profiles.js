const fs = require('node:fs');
const path = require('node:path');

const {
  addOrUpdateUserEquipment,
  addOrUpdateUserFoodPreference,
  addUserFoodConstraint,
  createPostgresPool,
  getUserFoodProfileBundle,
  isPostgresConfigured,
  runPostgresMigrations,
  upsertUserFoodProfileByUserId,
} = require('../functions/src');

async function seedUserFoodProfiles({
  client,
  dryRun = false,
  limit = 100,
  seedPath = defaultSeedPath(),
} = {}) {
  const seeds = JSON.parse(fs.readFileSync(seedPath, 'utf8')).slice(0, positiveInteger(limit, 100));
  const report = {
    dry_run: Boolean(dryRun),
    seed_path: seedPath,
    scanned: seeds.length,
    profiles_upserted: 0,
    constraints_upserted: 0,
    preferences_upserted: 0,
    equipment_upserted: 0,
    bundles: [],
  };

  for (const seed of seeds) {
    if (dryRun) {
      report.bundles.push(seed);
      continue;
    }

    const profile = await upsertUserFoodProfileByUserId(client, seed);
    report.profiles_upserted += 1;

    for (const constraint of seed.constraints || []) {
      await addUserFoodConstraint(client, {
        profileId: profile.profile_id,
        ...constraint,
      });
      report.constraints_upserted += 1;
    }

    for (const preference of seed.preferences || []) {
      await addOrUpdateUserFoodPreference(client, {
        profileId: profile.profile_id,
        ...preference,
      });
      report.preferences_upserted += 1;
    }

    for (const equipment of seed.equipment || []) {
      await addOrUpdateUserEquipment(client, {
        profileId: profile.profile_id,
        ...equipment,
      });
      report.equipment_upserted += 1;
    }

    report.bundles.push(await getUserFoodProfileBundle(client, { profileId: profile.profile_id }));
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before seeding UX1 user food profiles.');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await seedUserFoodProfiles({ client, ...args });
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
  return path.join(__dirname, '..', 'data', 'seeds', 'user_food_profiles_seed.json');
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
    'UX1 user food profile seed',
    `Dry run: ${report.dry_run}`,
    `Scanned: ${report.scanned}`,
    `Profiles upserted: ${report.profiles_upserted}`,
    `Constraints upserted: ${report.constraints_upserted}`,
    `Preferences upserted: ${report.preferences_upserted}`,
    `Equipment upserted: ${report.equipment_upserted}`,
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
  seedUserFoodProfiles,
};
