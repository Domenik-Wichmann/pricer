const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildIngredientNutritionProfileCandidates,
  generateIngredientNutritionProfileCandidates,
  normalizeProfileCandidateOptions,
} = require('../app/functions/src');

function makeFixtureClient() {
  const state = {
    mappings: [
      {
        mapping_id: 'mapping:apple_raw',
        ingredient_id: 'ingredient:apple',
        cluster_id: 'cluster:apple_raw',
        representative_fdc_id: 1001,
        review_status: 'approved',
      },
      {
        mapping_id: 'mapping:rice_cooked',
        ingredient_id: 'ingredient:rice',
        cluster_id: 'cluster:rice_cooked',
        representative_fdc_id: 2002,
        review_status: 'approved',
      },
      {
        mapping_id: 'mapping:banana_suggested',
        ingredient_id: 'ingredient:banana',
        cluster_id: 'cluster:banana_raw',
        representative_fdc_id: 3003,
        review_status: 'suggested',
      },
    ],
    nutrients: [
      nutrientRow(1001, 1008, 'Energy', 'kcal', 52),
      nutrientRow(1001, 1003, 'Protein', 'g', 0.26),
      nutrientRow(1001, 1004, 'Total lipid (fat)', 'g', 0.17),
      nutrientRow(1001, 1005, 'Carbohydrate, by difference', 'g', 13.81),
      nutrientRow(1001, 1079, 'Fiber, total dietary', 'g', 2.4),
      nutrientRow(1001, 2000, 'Sugars, total including NLEA', 'g', 10.39),
      nutrientRow(1001, 1093, 'Sodium, Na', 'mg', 1),
      nutrientRow(2002, 2048, 'Energy (Atwater Specific Factors)', 'kcal', 130),
      nutrientRow(2002, 1003, 'Protein', 'g', 2.69),
      nutrientRow(2002, 1005, 'Carbohydrate, by difference', 'g', 28.17),
    ],
    profiles: new Map(),
    commands: [],
  };

  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });

      if (normalizedSql.includes('FROM ingredient_nutrition_mappings inm') && normalizedSql.includes("inm.review_status = 'approved'")) {
        const limit = Number(params[1]);
        const approved = state.mappings.filter((mapping) => mapping.review_status === 'approved');
        const rows = [];
        for (const mapping of approved) {
          for (const nutrient of state.nutrients.filter((row) => row.fdc_id === mapping.representative_fdc_id)) {
            rows.push({
              ...mapping,
              representative_fdc_id: mapping.representative_fdc_id,
              mapping_review_status: mapping.review_status,
              nutrient_id: nutrient.nutrient_id,
              nutrient_name: nutrient.name,
              unit_name: nutrient.unit_name,
              amount: nutrient.amount,
            });
          }
        }
        return { rows: rows.slice(0, limit) };
      }

      if (normalizedSql.startsWith('INSERT INTO ingredient_nutrition_profile_candidates')) {
        const columns = [
          'profile_candidate_id',
          'ingredient_id',
          'mapping_id',
          'cluster_id',
          'representative_fdc_id',
          'basis_amount',
          'basis_unit',
          'kcal',
          'protein_g',
          'fat_g',
          'carbs_g',
          'fiber_g',
          'sugar_g',
          'sodium_mg',
          'source_nutrients_json',
          'review_status',
          'source',
          'generation_method',
          'rules_version',
        ];
        for (let index = 0; index < params.length; index += columns.length) {
          const row = {};
          columns.forEach((column, columnIndex) => {
            row[column] = params[index + columnIndex];
          });
          row.source_nutrients_json = JSON.parse(row.source_nutrients_json || '{}');
          const existing = state.profiles.get(row.mapping_id);
          state.profiles.set(row.mapping_id, {
            ...existing,
            ...row,
            review_status: existing ? existing.review_status : row.review_status,
            created_at: existing ? existing.created_at : '2026-04-24T00:00:00.000Z',
            updated_at: existing ? '2026-04-24T00:01:00.000Z' : '2026-04-24T00:00:00.000Z',
          });
        }
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function nutrientRow(fdcId, nutrientId, name, unitName, amount) {
  return {
    fdc_id: fdcId,
    nutrient_id: nutrientId,
    name,
    unit_name: unitName,
    amount,
  };
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '010_db3c_ingredient_nutrition_profile_candidates.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS ingredient_nutrition_profile_candidates'));
  assert(migration.includes('mapping_id TEXT NOT NULL REFERENCES ingredient_nutrition_mappings'));
  assert(migration.includes("review_status IN ('candidate', 'approved', 'rejected', 'needs_review')"));

  assert.deepStrictEqual(normalizeProfileCandidateOptions({ dryRun: 1, limit: 'bad' }), {
    dryRun: true,
    limit: 1000,
  });

  const directCandidates = buildIngredientNutritionProfileCandidates([
    {
      mapping_id: 'mapping:apple_raw',
      ingredient_id: 'ingredient:apple',
      cluster_id: 'cluster:apple_raw',
      representative_fdc_id: 1001,
      nutrient_id: 1008,
      nutrient_name: 'Energy',
      unit_name: 'kcal',
      amount: 52,
    },
    {
      mapping_id: 'mapping:apple_raw',
      ingredient_id: 'ingredient:apple',
      cluster_id: 'cluster:apple_raw',
      representative_fdc_id: 1001,
      nutrient_id: 1003,
      nutrient_name: 'Protein',
      unit_name: 'g',
      amount: 0.26,
    },
  ]);
  assert.strictEqual(directCandidates.length, 1);
  assert.strictEqual(directCandidates[0].profile_candidate_id, 'ingredient_nutrition_profile_candidate:mapping:apple_raw');
  assert.strictEqual(directCandidates[0].kcal, 52);
  assert.strictEqual(directCandidates[0].protein_g, 0.26);
  assert.strictEqual(directCandidates[0].basis_amount, 100);
  assert.strictEqual(directCandidates[0].basis_unit, 'g');

  const dryRunClient = makeFixtureClient();
  const dryRun = await generateIngredientNutritionProfileCandidates({
    client: dryRunClient,
    dryRun: true,
    limit: 100,
  });
  assert.strictEqual(dryRun.dry_run, true);
  assert.strictEqual(dryRun.approved_mappings_scanned, 2);
  assert.strictEqual(dryRun.candidates_built, 2);
  assert.strictEqual(dryRun.upserted, 0);
  assert.strictEqual(dryRunClient.state.profiles.size, 0, 'dry run must not write candidates');
  const apple = dryRun.candidates.find((candidate) => candidate.ingredient_id === 'ingredient:apple');
  assert.strictEqual(apple.kcal, 52);
  assert.strictEqual(apple.protein_g, 0.26);
  assert.strictEqual(apple.fat_g, 0.17);
  assert.strictEqual(apple.carbs_g, 13.81);
  assert.strictEqual(apple.fiber_g, 2.4);
  assert.strictEqual(apple.sugar_g, 10.39);
  assert.strictEqual(apple.sodium_mg, 1);
  assert.strictEqual(apple.mapping_id, 'mapping:apple_raw');
  assert.strictEqual(apple.cluster_id, 'cluster:apple_raw');
  assert.strictEqual(apple.representative_fdc_id, 1001);
  assert(!dryRun.candidates.some((candidate) => candidate.ingredient_id === 'ingredient:banana'), 'suggested mappings are not eligible');

  const rice = dryRun.candidates.find((candidate) => candidate.ingredient_id === 'ingredient:rice');
  assert.strictEqual(rice.kcal, 130, 'kcal falls back to Atwater values when nutrient 1008 is absent');

  const writeClient = makeFixtureClient();
  const firstWrite = await generateIngredientNutritionProfileCandidates({ client: writeClient, limit: 100 });
  const secondWrite = await generateIngredientNutritionProfileCandidates({ client: writeClient, limit: 100 });
  assert.strictEqual(firstWrite.upserted, 2);
  assert.strictEqual(secondWrite.upserted, 2);
  assert.strictEqual(writeClient.state.profiles.size, 2, 'profile candidate upsert is idempotent');

  const appleProfile = writeClient.state.profiles.get('mapping:apple_raw');
  appleProfile.review_status = 'approved';
  writeClient.state.nutrients = writeClient.state.nutrients.map((row) => (
    row.fdc_id === 1001 && row.nutrient_id === 1008 ? { ...row, amount: 53 } : row
  ));
  await generateIngredientNutritionProfileCandidates({ client: writeClient, limit: 100 });
  assert.strictEqual(writeClient.state.profiles.get('mapping:apple_raw').kcal, 53);
  assert.strictEqual(writeClient.state.profiles.get('mapping:apple_raw').review_status, 'approved', 'upsert preserves existing review status');

  assert(writeClient.state.commands.every((command) => !/Firestore|recipe|LLM/i.test(command.sql)), 'DB3C stays in Postgres-sidecar SQL only');

  console.log('DB3C ingredient nutrition profile tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
