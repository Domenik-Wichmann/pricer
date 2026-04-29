const assert = require('node:assert/strict');

const {
  USDA_CLUSTER_GENERATION_METHOD,
  USDA_CLUSTER_RULES_VERSION,
  buildUsdaClusterCandidate,
  listMigrationFiles,
  normalizeUsdaFoodClusterCandidate,
  parseUsdaFoodDescription,
  upsertUsdaFoodClusterCandidates,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('DB2.5 migration includes USDA cluster candidate table and required fields', () => {
  const db25 = listMigrationFiles().find((file) => file.name === '005_db2_5_usda_food_cluster_candidates.sql');
  assert.ok(db25);
  [
    'candidate_id',
    'candidate_key',
    'core_food_name',
    'source_fdc_id',
    'parsed_qualifiers_json',
    'hard_boundary_signature',
    'representative_score',
    'review_status',
    'rules_version',
  ].forEach((fieldName) => {
    assert.match(db25.sql, new RegExp(fieldName));
  });
});

test('parser extracts deterministic qualifiers from USDA comma-separated descriptions', () => {
  const parsed = parseUsdaFoodDescription('Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, braised');
  assert.equal(parsed.core_food_name, 'chicken breast');
  assert.equal(parsed.qualifiers.state, 'cooked');
  assert.equal(parsed.qualifiers.cooking_method, 'braised');
  assert.equal(parsed.qualifiers.skin_state, 'without_skin');
  assert.equal(parsed.qualifiers.bone_state, 'boneless');
  assert.equal(parsed.qualifiers.cut_or_part, 'breast');
});

test('candidate generation rejects branded foods in DB2.5 first pass', () => {
  assert.equal(buildUsdaClusterCandidate({
    fdc_id: 1,
    data_type: 'branded_food',
    description: 'RAW CASHEWS',
    food_category_id: 'Popcorn, Peanuts, Seeds & Related Snacks',
  }), null);
});

test('apple raw, juice, and sauce do not over-collapse', () => {
  const appleRaw = candidateKey(1105430, 'foundation_food', 'Apples, red delicious, with skin, raw', '9');
  const appleJuice = candidateKey(2003590, 'foundation_food', 'Apple juice, with added vitamin C, from concentrate, shelf stable', '9');
  const applesauce = candidateKey(2263892, 'foundation_food', 'Applesauce, unsweetened, with added vitamin C', '9');

  assert.notEqual(appleRaw, appleJuice);
  assert.notEqual(appleRaw, applesauce);
  assert.notEqual(appleJuice, applesauce);
  assert.match(appleRaw, /state_raw/);
  assert.match(appleJuice, /form_juice/);
  assert.match(applesauce, /form_sauce/);
});

test('raw rice, cooked rice, and rice flour do not over-collapse', () => {
  const rawRice = candidateKey(2512381, 'foundation_food', 'Rice, white, long grain, unenriched, raw', '20');
  const cookedRice = candidateKey(1, 'sr_legacy_food', 'Rice, white, long-grain, regular, cooked', '20');
  const riceFlour = candidateKey(790214, 'foundation_food', 'Flour, rice, white, unenriched', '20');

  assert.notEqual(rawRice, cookedRice);
  assert.notEqual(rawRice, riceFlour);
  assert.notEqual(cookedRice, riceFlour);
  assert.match(rawRice, /grain_state_raw/);
  assert.match(cookedRice, /grain_state_cooked/);
  assert.match(riceFlour, /grain_form_flour/);
});

test('whole milk and skim milk do not over-collapse', () => {
  const whole = candidateKey(322892, 'foundation_food', 'Milk, whole, 3.25% milkfat, with added vitamin D', '1');
  const skim = candidateKey(322559, 'foundation_food', 'Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)', '1');

  assert.notEqual(whole, skim);
  assert.match(whole, /milk_fat_whole_3_25/);
  assert.match(skim, /milk_fat_nonfat_skim/);
});

test('raw chicken breast and cooked or breaded chicken do not over-collapse', () => {
  const raw = candidateKey(2646170, 'foundation_food', 'Chicken, breast, boneless, skinless, raw', '5');
  const cooked = candidateKey(331960, 'foundation_food', 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, braised', '5');
  const breaded = candidateKey(171514, 'sr_legacy_food', 'Chicken breast tenders, breaded, cooked, microwaved', '5');

  assert.notEqual(raw, cooked);
  assert.notEqual(raw, breaded);
  assert.notEqual(cooked, breaded);
  assert.match(raw, /state_raw/);
  assert.match(cooked, /cook_braised/);
  assert.match(breaded, /breaded_breaded/);
});

test('shiitake mushroom and generic mushroom do not over-collapse', () => {
  const shiitake = candidateKey(1750346, 'foundation_food', 'Mushrooms, shiitake', '11');
  const generic = candidateKey(999, 'sr_legacy_food', 'Mushrooms, raw', '11');

  assert.notEqual(shiitake, generic);
  assert.match(shiitake, /species_shiitake/);
});

test('canned beans drained and solids/liquids do not over-collapse', () => {
  const drained = candidateKey(2644285, 'foundation_food', 'Beans, black, canned, sodium added, drained and rinsed', '16');
  const solidsAndLiquids = candidateKey(168502, 'sr_legacy_food', 'Beans, snap, green, canned, no salt added, solids and liquids', '11');

  assert.notEqual(drained, solidsAndLiquids);
  assert.match(drained, /drained_drained_rinsed/);
  assert.match(solidsAndLiquids, /drained_solids_and_liquids/);
});

test('representative scoring prefers foundation and simple macro-backed candidates', () => {
  const foundation = buildUsdaClusterCandidate({
    fdc_id: 2512381,
    data_type: 'foundation_food',
    description: 'Rice, white, long grain, unenriched, raw',
    food_category_id: '20',
  });
  const legacy = buildUsdaClusterCandidate({
    fdc_id: 1,
    data_type: 'sr_legacy_food',
    description: 'Rice, white, long-grain, regular, cooked',
    food_category_id: '20',
  });
  assert.equal(foundation.generation_method, USDA_CLUSTER_GENERATION_METHOD);
  assert.equal(foundation.rules_version, USDA_CLUSTER_RULES_VERSION);
  assert.equal(foundation.representative_score > legacy.representative_score, true);
});

test('cluster candidate repository upserts normalized records idempotently', async () => {
  const client = new FakeClusterCandidateClient();
  const candidate = buildUsdaClusterCandidate({
    fdc_id: 2512381,
    data_type: 'foundation_food',
    description: 'Rice, white, long grain, unenriched, raw',
    food_category_id: '20',
  });
  assert.equal(normalizeUsdaFoodClusterCandidate(candidate).source_fdc_id, 2512381);

  await upsertUsdaFoodClusterCandidates(client, [candidate]);
  await upsertUsdaFoodClusterCandidates(client, [candidate]);
  assert.equal(client.rows.size, 1);
  assert.equal(client.rows.get(candidate.candidate_id).candidate_key, candidate.candidate_key);
});

function candidateKey(fdcId, dataType, description, foodCategoryId) {
  return buildUsdaClusterCandidate({
    fdc_id: fdcId,
    data_type: dataType,
    description,
    food_category_id: foodCategoryId,
  }).candidate_key;
}

class FakeClusterCandidateClient {
  constructor() {
    this.rows = new Map();
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('INSERT INTO usda_food_cluster_candidates')) {
      const columns = [
        'candidate_id',
        'candidate_key',
        'core_food_name',
        'core_food_normalized',
        'source_fdc_id',
        'source_description',
        'source_data_type',
        'source_food_category_id',
        'parsed_qualifiers_json',
        'hard_boundary_signature',
        'representative_score',
        'representative_score_json',
        'confidence',
        'review_status',
        'generation_method',
        'rules_version',
        'source_version',
      ];
      for (let offset = 0; offset < params.length; offset += columns.length) {
        const row = {};
        columns.forEach((column, index) => {
          const value = params[offset + index];
          row[column] = column.endsWith('_json') ? JSON.parse(value) : value;
        });
        this.rows.set(row.candidate_id, row);
      }
      return { rows: [] };
    }
    throw new Error(`Unexpected fake query: ${normalized.slice(0, 120)}`);
  }
}

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

  console.log(`\nDB2.5 USDA clustering tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
