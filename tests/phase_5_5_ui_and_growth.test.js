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

test('shared ui system files exist for spacing, theme, and widgets', () => {
  for (const file of [
    'app/mobile/lib/core/ui/app_spacing.dart',
    'app/mobile/lib/core/ui/app_theme.dart',
    'app/mobile/lib/core/ui/app_widgets.dart',
    'app/mobile/lib/core/services/recent_activity_service.dart',
  ]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), file)), true, `${file} should exist`);
  }
});

test('home screen includes daily insight and recent rerun hooks', () => {
  const source = read('app/mobile/lib/features/search/home_screen.dart');
  assert.equal(source.includes('QuickInsightCard'), true);
  assert.equal(source.includes('l10n.recentSearchesTitle'), true);
  assert.equal(source.includes('l10n.recentListsTitle'), true);
});

test('results and product screens include savings, share, and good-price hooks', () => {
  const results = read('app/mobile/lib/features/results/results_screen.dart');
  const product = read('app/mobile/lib/features/product/product_detail_screen.dart');
  assert.equal(results.includes('share-results-button'), true);
  assert.equal(results.includes('l10n.resultsSummaryTitle'), true);
  assert.equal(product.includes('good-price-indicator'), true);
});

test('widget tests cover growth hooks and core polished flows', () => {
  const widgetTests = read('app/mobile/test/widget_smoke_test.dart');
  assert.equal(widgetTests.includes('english rendering shows localized app shell'), true);
  assert.equal(widgetTests.includes('search flow still renders localized results'), true);
  assert.equal(widgetTests.includes("find.byKey(const Key('share-results-button'))"), true);
  assert.equal(widgetTests.includes('watchlist summary banner still renders with localization'), true);
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

  console.log(`\nPhase 5.5 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
