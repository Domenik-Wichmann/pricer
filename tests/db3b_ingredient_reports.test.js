const assert = require('node:assert');

const {
  buildIngredientInspectionReport,
  normalizeIngredientReportOptions,
} = require('../app/functions/src');

function makeIngredient(overrides = {}) {
  return {
    ingredient_id: 'ingredient:apple',
    ingredient_key: 'apple',
    name_en: 'Apple',
    name_bg: 'ябълка',
    normalized_name: 'apple',
    food_family: 'fruit',
    default_unit: 'g',
    shopping_unit: 'piece',
    review_status: 'active',
    aliases_json: { en: ['apple'], bg: ['ябълка'], all: ['apple'] },
    ...overrides,
  };
}

function makeFixtureClient() {
  const state = {
    ingredients: [
      makeIngredient(),
      makeIngredient({
        ingredient_id: 'ingredient:apple_duplicate',
        ingredient_key: 'apple_duplicate',
        name_en: 'Apple duplicate',
        name_bg: '',
        normalized_name: 'apple',
        aliases_json: { en: ['malus'], bg: [], all: ['malus'] },
        review_status: 'needs_review',
      }),
      makeIngredient({
        ingredient_id: 'ingredient:pear',
        ingredient_key: 'pear',
        name_en: 'Pear',
        name_bg: null,
        normalized_name: 'pear',
        aliases_json: { en: ['pome'], bg: [], all: ['pome'] },
      }),
      makeIngredient({
        ingredient_id: 'ingredient:quince',
        ingredient_key: 'quince',
        name_en: 'Quince',
        name_bg: 'дюля',
        normalized_name: 'quince',
        default_unit: '',
        shopping_unit: '',
        aliases_json: { en: ['pome'], bg: [], all: ['pome'] },
      }),
      makeIngredient({
        ingredient_id: 'ingredient:milk_whole',
        ingredient_key: 'milk_whole',
        name_en: 'Whole milk',
        name_bg: 'пълномаслено мляко',
        normalized_name: 'milk_whole',
        food_family: 'dairy',
        review_status: 'draft',
        aliases_json: { en: ['whole milk'], bg: [], all: ['whole_milk'] },
      }),
    ],
    mappings: [
      { ingredient_id: 'ingredient:apple', review_status: 'approved' },
      { ingredient_id: 'ingredient:milk_whole', review_status: 'rejected' },
    ],
    commands: [],
  };

  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });
      const rows = applySqlFilters(state.ingredients, state.mappings, normalizedSql, params);
      const limit = Number(params[params.length - 1]) || 100;

      if (normalizedSql.startsWith('SELECT COUNT(*)::bigint AS total_ingredients')) {
        return { rows: [{ total_ingredients: rows.length }] };
      }
      if (normalizedSql.includes('GROUP BY i.review_status')) {
        return { rows: groupRows(rows, 'review_status') };
      }
      if (normalizedSql.includes('GROUP BY i.food_family')) {
        return { rows: groupRows(rows, 'food_family') };
      }
      if (normalizedSql.includes('HAVING COUNT(*) > 1') && normalizedSql.includes('GROUP BY i.normalized_name')) {
        const groups = groupValues(rows, 'normalized_name')
          .filter((group) => group.items.length > 1)
          .map((group) => ({
            normalized_name: group.key,
            ingredient_count: group.items.length,
            ingredient_ids: group.items.map((row) => row.ingredient_id),
            ingredient_keys: group.items.map((row) => row.ingredient_key),
            names_en: group.items.map((row) => row.name_en),
          }));
        return { rows: groups.slice(0, limit) };
      }
      if (normalizedSql.includes('normalized_alias') && normalizedSql.includes('ingredient_aliases')) {
        const aliasMap = new Map();
        rows.forEach((row) => {
          const aliases = [
            ...(row.aliases_json.all || []),
            ...(row.aliases_json.en || []),
            ...(row.aliases_json.bg || []),
          ].map((value) => String(value).toLowerCase()).filter(Boolean);
          aliases.forEach((alias) => {
            if (!aliasMap.has(alias)) aliasMap.set(alias, []);
            aliasMap.get(alias).push(row);
          });
        });
        const collisions = [...aliasMap.entries()]
          .filter(([, values]) => new Set(values.map((row) => row.ingredient_id)).size > 1)
          .map(([alias, values]) => ({
            normalized_alias: alias,
            ingredient_count: new Set(values.map((row) => row.ingredient_id)).size,
            ingredient_keys: [...new Set(values.map((row) => row.ingredient_key))].sort(),
            names_en: [...new Set(values.map((row) => row.name_en))].sort(),
          }));
        return { rows: collisions.slice(0, limit) };
      }
      if (normalizedSql.includes('SELECT i.ingredient_id')) {
        return { rows: rows.slice(0, limit) };
      }
      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function applySqlFilters(ingredients, mappings, sql, params) {
  let rows = [...ingredients];
  if (sql.includes('i.review_status = $1')) {
    rows = rows.filter((row) => row.review_status === params[0]);
  }
  if (sql.includes("i.name_bg IS NULL OR btrim(i.name_bg) = ''")) {
    rows = rows.filter((row) => !String(row.name_bg || '').trim());
  }
  if (sql.includes("i.default_unit IS NULL OR btrim(i.default_unit) = ''")) {
    rows = rows.filter((row) => !String(row.default_unit || '').trim() || !String(row.shopping_unit || '').trim());
  }
  if (sql.includes('NOT EXISTS') && sql.includes('ingredient_nutrition_mappings')) {
    rows = rows.filter((row) => !mappings.some((mapping) => (
      mapping.ingredient_id === row.ingredient_id
      && ['suggested', 'approved', 'needs_review'].includes(mapping.review_status)
    )));
  }
  return rows;
}

function groupRows(rows, column) {
  return groupValues(rows, column)
    .map((group) => ({ key: group.key, count: group.items.length }))
    .sort((left, right) => right.count - left.count || String(left.key).localeCompare(String(right.key)));
}

function groupValues(rows, column) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row[column])) groups.set(row[column], []);
    groups.get(row[column]).push(row);
  });
  return [...groups.entries()].map(([key, items]) => ({ key, items }));
}

async function run() {
  assert.deepStrictEqual(normalizeIngredientReportOptions({
    limit: 'bad',
    reviewStatus: '',
    missingBg: 1,
    withoutMapping: 0,
  }), {
    limit: 100,
    reviewStatus: null,
    missingBg: true,
    withoutMapping: false,
  });
  assert.throws(
    () => normalizeIngredientReportOptions({ reviewStatus: 'archived' }),
    /Unsupported ingredient review_status/,
  );

  const client = makeFixtureClient();
  const report = await buildIngredientInspectionReport({ client, limit: 10 });
  assert.strictEqual(report.total_ingredients, 5);
  assert.deepStrictEqual(report.summary_by_review_status, [
    { key: 'active', count: 3 },
    { key: 'draft', count: 1 },
    { key: 'needs_review', count: 1 },
  ]);
  assert(report.summary_by_food_family.some((row) => row.key === 'fruit' && row.count === 4));
  assert.deepStrictEqual(report.missing_bulgarian_names.map((row) => row.ingredient_key), ['apple_duplicate', 'pear']);
  assert.deepStrictEqual(report.missing_default_units.map((row) => row.ingredient_key), ['quince']);
  assert.strictEqual(report.duplicate_normalized_names[0].normalized_name, 'apple');
  assert.strictEqual(report.alias_collision_report[0].normalized_alias, 'pome');
  assert(report.ingredients_without_nutrition_mappings.some((row) => row.ingredient_key === 'pear'));
  assert(report.recommended_next_review_targets.some((target) => target.reason === 'duplicate_normalized_names'));
  assert(report.recommended_next_review_targets.some((target) => target.reason === 'alias_collisions'));

  const filteredClient = makeFixtureClient();
  const filtered = await buildIngredientInspectionReport({
    client: filteredClient,
    limit: 10,
    reviewStatus: 'active',
    missingBg: true,
    withoutMapping: true,
  });
  assert.strictEqual(filtered.filters.review_status, 'active');
  assert.strictEqual(filtered.filters.missing_bg, true);
  assert.strictEqual(filtered.filters.without_mapping, true);
  assert.deepStrictEqual(filtered.missing_bulgarian_names.map((row) => row.ingredient_key), ['pear']);
  assert(filteredClient.state.commands.every((command) => !/INSERT|UPDATE|DELETE/i.test(command.sql)), 'report must be read-only');

  console.log('DB3B ingredient report tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
