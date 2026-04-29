const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  deleteCanonicalIngredient,
  getCanonicalIngredientById,
  getIngredientByKey,
  listIngredientsByReviewStatus,
  normalizeIngredientRecord,
  searchCanonicalIngredients,
  upsertIngredientByKey,
} = require('../app/functions/src');

function makeClient() {
  const state = { ingredients: new Map(), commands: [] };
  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });
      if (normalizedSql.startsWith('INSERT INTO ingredients')) {
        const columns = [
          'ingredient_id', 'ingredient_key', 'name_en', 'name_bg', 'canonical_name',
          'normalized_name', 'ingredient_type', 'food_family', 'default_unit',
          'shopping_unit', 'density_g_per_ml', 'grams_per_piece', 'edible_portion_factor',
          'aliases_json', 'tags_json', 'state_defaults_json', 'allergen_flags_json',
          'dietary_flags_json', 'review_status', 'source', 'generation_method', 'rules_version',
        ];
        const row = {};
        columns.forEach((column, index) => {
          row[column] = params[index];
        });
        ['aliases_json', 'tags_json', 'state_defaults_json', 'allergen_flags_json', 'dietary_flags_json']
          .forEach((column) => { row[column] = JSON.parse(row[column] || '{}'); });
        const existing = state.ingredients.get(row.ingredient_key);
        const stored = {
          ...existing,
          ...row,
          ingredient_id: existing ? existing.ingredient_id : row.ingredient_id,
          created_at: existing ? existing.created_at : '2026-04-24T00:00:00.000Z',
          updated_at: existing ? '2026-04-24T00:01:00.000Z' : '2026-04-24T00:00:00.000Z',
        };
        state.ingredients.set(stored.ingredient_key, stored);
        return { rows: [stored] };
      }
      if (normalizedSql.includes('WHERE ingredient_id =')) {
        return { rows: [...state.ingredients.values()].filter((row) => row.ingredient_id === params[0]) };
      }
      if (normalizedSql.includes('WHERE ingredient_key =')) {
        return { rows: [...state.ingredients.values()].filter((row) => row.ingredient_key === params[0]) };
      }
      if (normalizedSql.includes('WHERE normalized_name ILIKE')) {
        const needle = params[0].replaceAll('%', '').toLowerCase();
        const limit = Number(params[1]);
        return {
          rows: [...state.ingredients.values()]
            .filter((row) => row.normalized_name.includes(needle)
              || [...(row.aliases_json.en || []), ...(row.aliases_json.bg || []), ...(row.aliases_json.all || [])]
                .some((alias) => String(alias).toLowerCase().includes(needle)))
            .slice(0, limit),
        };
      }
      if (normalizedSql.includes('WHERE review_status =')) {
        return {
          rows: [...state.ingredients.values()]
            .filter((row) => row.review_status === params[0])
            .slice(0, Number(params[1])),
        };
      }
      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '009_db3a_canonical_ingredients.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS ingredients'));
  assert(migration.includes("review_status IN ('draft', 'active', 'rejected', 'needs_review')"));
  assert(!migration.includes('fdc_id'), 'ingredients must not directly carry raw USDA FDC ids');
  assert(!migration.includes('usda_foods'), 'ingredient table must not directly map raw USDA rows');

  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data', 'seeds', 'ingredients_seed.json'),
    'utf8',
  ));
  assert.strictEqual(fixture.length, 17);

  const appleRecord = normalizeIngredientRecord({
    name_en: 'Apple',
    name_bg: 'ябълка',
    aliases_json: { en: ['Malus apple'], bg: ['ябълки'] },
    review_status: 'active',
  });
  assert.strictEqual(appleRecord.ingredient_key, 'apple');
  assert.strictEqual(appleRecord.ingredient_id, 'ingredient:apple');
  assert.strictEqual(appleRecord.aliases_json.all.includes('malus_apple'), true);

  const client = makeClient();
  const first = await upsertIngredientByKey(client, appleRecord);
  const second = await upsertIngredientByKey(client, { ...appleRecord, name_en: 'Apple fruit' });
  assert.strictEqual(second.ingredient_id, first.ingredient_id, 'upsert preserves stable ids');
  assert.strictEqual(client.state.ingredients.size, 1, 'upsert by ingredient_key is idempotent');

  const byId = await getCanonicalIngredientById(client, first.ingredient_id);
  const byKey = await getIngredientByKey(client, 'apple');
  assert.strictEqual(byId.ingredient_key, 'apple');
  assert.strictEqual(byKey.ingredient_id, first.ingredient_id);
  assert.strictEqual(byKey.name_bg, 'ябълка', 'Bulgarian name is stored');

  await upsertIngredientByKey(client, {
    ingredient_key: 'chickpea',
    name_en: 'Chickpea',
    name_bg: 'нахут',
    aliases_json: { en: ['garbanzo bean'], bg: ['леблебия'] },
    review_status: 'needs_review',
  });
  const aliasMatches = await searchCanonicalIngredients(client, { query: 'garbanzo', limit: 10 });
  assert.strictEqual(aliasMatches[0].ingredient_key, 'chickpea');

  const active = await listIngredientsByReviewStatus(client, 'active');
  const needsReview = await listIngredientsByReviewStatus(client, 'needs_review');
  assert.deepStrictEqual(active.map((row) => row.ingredient_key), ['apple']);
  assert.deepStrictEqual(needsReview.map((row) => row.ingredient_key), ['chickpea']);

  assert.throws(() => deleteCanonicalIngredient(client, first.ingredient_id), /must not be deleted/);
  assert(![first.ingredient_id, byKey.ingredient_id].some((id) => /^\d+$/.test(id)), 'ingredient ids are not USDA FDC ids');

  console.log('DB3A canonical ingredient tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
