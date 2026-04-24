const fs = require('node:fs');
const path = require('node:path');

const {
  createRuntimeDataBackboneStore,
  resolveStoreBackend,
  runDailyProductionPipeline,
} = require('../app/functions/src');

async function main() {
  const stateFile = process.env.PRICER_STATE_FILE || path.join(process.cwd(), 'tmp', 'production_state.json');
  const workingDirectory = process.env.PRICER_WORK_DIR || path.join(process.cwd(), 'tmp', 'phase6');
  const backend = resolveStoreBackend(process.env);

  if (backend === 'json') {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  }
  fs.mkdirSync(workingDirectory, { recursive: true });

  const store = await createRuntimeDataBackboneStore();
  const result = await runDailyProductionPipeline({
    store,
    workingDirectory,
  });

  process.stdout.write(`${JSON.stringify({
    backend,
    state_file: backend === 'json' ? stateFile : null,
    result,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
