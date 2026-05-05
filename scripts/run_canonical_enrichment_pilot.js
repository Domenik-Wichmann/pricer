#!/usr/bin/env node
'use strict';

const {
  createRuntimeDataBackboneStore,
  runCanonicalEnrichmentPilot,
} = require('../functions/src');

async function main() {
  const store = await createRuntimeDataBackboneStore({
    env: process.env,
  });
  const summary = await runCanonicalEnrichmentPilot({
    store,
    env: process.env,
  });
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[${new Date().toISOString()}] Canonical enrichment pilot failed.`);
    console.error(error);
    process.exitCode = 1;
  });
}
