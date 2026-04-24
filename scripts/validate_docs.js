const fs = require('fs');
const jsonFiles = [
  'docs/test_registry.json',
  'docs/feature_registry.json',
  'docs/current_state.json',
  'docs/next_steps.json'
];

for (const file of jsonFiles) {
  JSON.parse(fs.readFileSync(file, 'utf8'));
}
console.log('JSON docs parse successfully.');
