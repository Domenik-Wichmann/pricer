const fs = require('node:fs');
const path = require('node:path');

const {
  buildUserTasteProfileSnapshots,
  createPostgresPool,
  isPostgresConfigured,
  runPostgresMigrations,
} = require('../functions/src');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running PROF1 taste profile builds.');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await buildUserTasteProfileSnapshots(client, args);
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

function parseArgs(argv) {
  const args = {
    profileId: null,
    userId: null,
    all: false,
    dryRun: false,
    json: false,
    out: null,
    limit: 100,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all') args.all = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--profile-id=')) args.profileId = arg.slice('--profile-id='.length);
    else if (arg === '--profile-id') args.profileId = argv[++index];
    else if (arg.startsWith('--user-id=')) args.userId = arg.slice('--user-id='.length);
    else if (arg === '--user-id') args.userId = argv[++index];
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--limit') args.limit = Number(argv[++index]);
  }

  return args;
}

function human(report) {
  return [
    'PROF1 Taste Profile Build',
    `Dry run: ${report.dry_run}`,
    `Profiles seen: ${report.profiles_seen}`,
    `Snapshots created: ${report.snapshots_created}`,
    `Source events used: ${report.source_events_used}`,
    `Source recipes used: ${report.source_recipes_used}`,
    `Signal sources written: ${report.signal_sources_written}`,
    `Confidence summary: ${formatConfidenceSummary(report.confidence_summary)}`,
    `Errors: ${report.errors.length}`,
  ].join('\n');
}

function formatConfidenceSummary(summary = {}) {
  return ['low', 'medium', 'high']
    .map((level) => `${level}:${Number(summary[level] || 0)}`)
    .join(', ');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  human,
  parseArgs,
};
