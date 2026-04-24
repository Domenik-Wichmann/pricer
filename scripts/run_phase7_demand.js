const path = require('node:path');

const {
  createRuntimeDataBackboneStore,
  resolveStoreBackend,
  runDemandIntelligenceJobs,
} = require('../app/functions/src');

async function main() {
  const backend = resolveStoreBackend(process.env);
  const stateFile = process.env.PRICER_STATE_FILE
    ? path.resolve(process.env.PRICER_STATE_FILE)
    : path.resolve(process.cwd(), 'runtime_data', 'state.json');
  const store = await createRuntimeDataBackboneStore();
  const summary = await runDemandIntelligenceJobs({ store });

  console.log(JSON.stringify({
    backend,
    state_file: backend === 'json' ? stateFile : null,
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
