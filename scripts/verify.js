const fs = require('fs');
const required = [
  'README.md',
  'AGENTS.md',
  'docs/PHASE_PLAN.md',
  'docs/DATA_MODEL.md',
  'docs/TEST_STRATEGY.md',
  'docs/decision_log.md',
  'docs/test_registry.json',
  'docs/prompts/README.md'
];

const missing = required.filter((p) => !fs.existsSync(p));
if (missing.length) {
  console.error('Missing required files:\n' + missing.join('\n'));
  process.exit(1);
}
console.log('Basic verify passed.');
