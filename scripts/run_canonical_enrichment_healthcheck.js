#!/usr/bin/env node
'use strict';

const {
  runCanonicalEnrichmentHealthcheck,
} = require('../functions/src');

async function main() {
  const summary = await runCanonicalEnrichmentHealthcheck({
    env: {
      ...process.env,
      PRICER_ENRICHMENT_LLM_HEALTHCHECK: process.env.PRICER_ENRICHMENT_LLM_HEALTHCHECK || 'true',
    },
  });
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[${new Date().toISOString()}] Canonical enrichment healthcheck failed.`);
    console.error(error);
    process.exitCode = 1;
  });
}
