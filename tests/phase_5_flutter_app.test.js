const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const files = [
  'app/mobile/pubspec.yaml',
  'app/mobile/analysis_options.yaml',
  'app/mobile/lib/main.dart',
  'app/mobile/lib/app.dart',
  'app/mobile/lib/firebase_options.dart',
  'app/mobile/lib/core/models/app_models.dart',
  'app/mobile/lib/core/services/api_client.dart',
  'app/mobile/lib/core/services/app_dependencies.dart',
  'app/mobile/lib/core/services/firestore_repositories.dart',
  'app/mobile/lib/core/services/local_identity_service.dart',
  'app/mobile/lib/core/services/voice_input_service.dart',
  'app/mobile/lib/core/utils/formatters.dart',
  'app/mobile/lib/features/search/home_screen.dart',
  'app/mobile/lib/features/results/results_screen.dart',
  'app/mobile/lib/features/product/product_detail_screen.dart',
  'app/mobile/lib/features/lists/shopping_lists_screen.dart',
  'app/mobile/lib/features/lists/shopping_list_detail_screen.dart',
  'app/mobile/lib/features/watchlist/watchlist_screen.dart',
  'app/mobile/test/widget_smoke_test.dart',
];

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('flutter phase 5 scaffold files exist', () => {
  for (const file of files) {
    assert.equal(fs.existsSync(path.join(process.cwd(), file)), true, `${file} should exist`);
  }
});

test('pubspec declares required phase 5 dependencies', () => {
  const pubspec = fs.readFileSync(path.join(process.cwd(), 'app/mobile/pubspec.yaml'), 'utf8');
  for (const dependency of ['cloud_firestore', 'firebase_core', 'speech_to_text', 'fl_chart', 'http']) {
    assert.equal(pubspec.includes(`${dependency}:`), true, `${dependency} should be declared`);
  }
});

test('app dependencies include backend api base url and firestore fallback', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'app/mobile/lib/core/services/app_dependencies.dart'), 'utf8');
  assert.equal(source.includes("PRICER_API_BASE_URL"), true);
  assert.equal(source.includes('InMemoryShoppingListsRepository'), true);
  assert.equal(source.includes('FirestoreShoppingListsRepository'), true);
});

test('widget tests cover localized shell and core watchlist/result flows', () => {
  const testSource = fs.readFileSync(path.join(process.cwd(), 'app/mobile/test/widget_smoke_test.dart'), 'utf8');
  assert.equal(testSource.includes('english rendering shows localized app shell'), true);
  assert.equal(testSource.includes('bulgarian rendering shows localized app shell'), true);
  assert.equal(testSource.includes('unsupported locale falls back safely to english'), true);
  assert.equal(testSource.includes('watchlist summary banner still renders with localization'), true);
});

async function run() {
  let failed = 0;

  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error.stack);
    }
  }

  console.log(`\nPhase 5 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
