const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

test('l10n config and arb files exist', () => {
  for (const file of [
    'app/mobile/l10n.yaml',
    'app/mobile/lib/l10n/app_en.arb',
    'app/mobile/lib/l10n/app_bg.arb',
  ]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), file)), true, `${file} should exist`);
  }
});

test('app root wires Flutter localization delegates and supported locales', () => {
  const source = read('app/mobile/lib/app.dart');
  assert.equal(source.includes('AppLocalizations.delegate'), true);
  assert.equal(source.includes("Locale('en')"), true);
  assert.equal(source.includes("Locale('bg')"), true);
  assert.equal(source.includes('localeResolutionCallback'), true);
});

test('major screens import and use AppLocalizations', () => {
  for (const file of [
    'app/mobile/lib/features/search/home_screen.dart',
    'app/mobile/lib/features/results/results_screen.dart',
    'app/mobile/lib/features/product/product_detail_screen.dart',
    'app/mobile/lib/features/lists/shopping_lists_screen.dart',
    'app/mobile/lib/features/lists/shopping_list_detail_screen.dart',
    'app/mobile/lib/features/watchlist/watchlist_screen.dart',
    'app/mobile/lib/core/ui/app_widgets.dart',
  ]) {
    const source = read(file);
    assert.equal(source.includes('AppLocalizations'), true, `${file} should use AppLocalizations`);
  }
});

test('widget tests cover english, bulgarian, and fallback localization behavior', () => {
  const source = read('app/mobile/test/widget_smoke_test.dart');
  assert.equal(source.includes('english rendering shows localized app shell'), true);
  assert.equal(source.includes('bulgarian rendering shows localized app shell'), true);
  assert.equal(source.includes('unsupported locale falls back safely to english'), true);
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

  console.log(`\nPhase 5.6 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
