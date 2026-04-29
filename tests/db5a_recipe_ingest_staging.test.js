const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  deleteRecipeIngestStaging,
  getStagedRecipeDetail,
  insertStagedRecipeBundle,
  listStagedRecipes,
  searchStagedRecipes,
  updateStagedRecipeReviewStatus,
} = require('../app/functions/src');
const {
  DEFAULT_FIXTURE_PATH,
  parseArgs,
  seedRecipeIngestStaging,
} = require('../scripts/db5a_seed_recipe_ingest_staging');

function makeBundle() {
  return {
    job: {
      job_id: 'recipe_ingest_job:test:chicken',
      source_type: 'fixture',
      source_name: 'test fixture',
      source_url: 'https://example.test/chicken',
      raw_text: 'Raw chicken rice bowl text is preserved exactly.',
      raw_json: { original: true, line_count: 3 },
      language: 'en',
      status: 'staged',
    },
    recipe: {
      staged_recipe_id: 'staged_recipe:test:chicken',
      proposed_recipe_key: 'chicken_rice_bowl',
      title_original: 'Chicken rice bowl',
      title_en: 'Chicken Rice Bowl',
      title_bg: 'BG Chicken Rice Bowl',
      description: 'A staged rich recipe.',
      servings: 2,
      yield_quantity: 2,
      yield_unit: 'bowls',
      cuisine_tags: ['home_style'],
      region_tags: ['global'],
      dietary_tags: ['high_protein'],
      meal_type_tags: ['lunch'],
      feeling_tags: ['filling'],
      flavor_profile: { primary: ['savory'] },
      texture_profile: { primary: ['soft', 'crisp'] },
      difficulty_level: 'easy',
      budget_level: 'medium',
      prep_time_minutes: 10,
      cook_time_minutes: 20,
      total_time_minutes: 30,
      review_status: 'staged',
      confidence: 0.91,
      extraction_json: { source: 'unit_test' },
    },
    ingredients: [
      {
        raw_line: '160 g rice',
        ingredient_name_original: 'rice',
        ingredient_name_en: 'Rice',
        ingredient_name_bg: 'BG rice',
        proposed_ingredient_key: 'rice',
        matched_ingredient_id: 'ingredient:rice',
        quantity: 160,
        unit: 'g',
        quantity_grams: 160,
        sort_order: 1,
        match_confidence: 0.98,
        review_status: 'matched',
      },
      {
        raw_line: '1 cucumber',
        ingredient_name_original: 'cucumber',
        ingredient_name_en: 'Cucumber',
        ingredient_name_bg: 'BG cucumber',
        proposed_ingredient_key: 'cucumber',
        matched_ingredient_id: null,
        quantity: 1,
        unit: 'piece',
        quantity_grams: null,
        sort_order: 2,
        match_confidence: null,
        review_status: 'needs_review',
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction_original: 'Cook rice.',
        instruction_en: 'Cook rice.',
        instruction_bg: 'BG cook rice',
        duration_minutes: 18,
        state_change_summary: 'rice dry to cooked',
      },
      {
        step_number: 2,
        instruction_original: 'Assemble bowl.',
        instruction_en: 'Assemble bowl.',
        instruction_bg: 'BG assemble',
        duration_minutes: 3,
      },
    ],
    tools: [{ key: 'pot', name_en: 'Pot', name_bg: 'BG pot', confidence: 0.95, evidence_text: 'cook rice' }],
    methods: [{ key: 'boiling', name_en: 'Boiling', name_bg: 'BG boiling', confidence: 0.92, evidence_text: 'cook rice' }],
    tags: [{ tag_type: 'feeling', tag_key: 'filling', tag_value: 'Filling', confidence: 0.9 }],
    state_changes: [{ state_change_key: 'rice_dry_to_cooked', ingredient_name: 'Rice', from_state: 'dry', to_state: 'cooked', confidence: 0.9, evidence_text: 'cook rice' }],
    substitution_hints: [{ substitution_key: 'rice_to_potato', original_ingredient_name: 'Rice', substitute_ingredient_name: 'Potato', reason: 'Flexible bowl base', confidence: 0.5, evidence_text: 'bowl' }],
    quality_signals: [{ signal_key: 'nullable_match', signal_name: 'Nullable ingredient match', signal_value: 'cucumber', severity: 'warning', confidence: 0.8, evidence_text: 'needs review' }],
  };
}

function makeClient() {
  const state = {
    jobs: new Map(),
    recipes: new Map(),
    ingredients: new Map(),
    steps: new Map(),
    tools: new Map(),
    methods: new Map(),
    tags: new Map(),
    stateChanges: new Map(),
    substitutionHints: new Map(),
    qualitySignals: new Map(),
    commands: [],
    transactions: { begin: 0, commit: 0, rollback: 0 },
  };
  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });
      if (normalizedSql === 'BEGIN') {
        state.transactions.begin += 1;
        return { rows: [] };
      }
      if (normalizedSql === 'COMMIT') {
        state.transactions.commit += 1;
        return { rows: [] };
      }
      if (normalizedSql === 'ROLLBACK') {
        state.transactions.rollback += 1;
        return { rows: [] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_jobs')) {
        const row = jobFromParams(params);
        state.jobs.set(row.job_id, row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_staged_recipes')) {
        const row = stagedRecipeFromParams(params);
        state.recipes.set(row.staged_recipe_id, row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_staged_ingredients')) {
        const row = stagedIngredientFromParams(params);
        state.ingredients.set(row.staged_recipe_ingredient_id, row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_staged_steps')) {
        const row = stagedStepFromParams(params);
        state.steps.set(row.staged_recipe_step_id, row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_staged_tools')) {
        const row = namedChildFromParams(params, 'staged_recipe_tool_id', 'tool_key', 'tool_name_en', 'tool_name_bg');
        state.tools.set(row.staged_recipe_tool_id, row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_staged_methods')) {
        const row = namedChildFromParams(params, 'staged_recipe_method_id', 'method_key', 'method_name_en', 'method_name_bg');
        state.methods.set(row.staged_recipe_method_id, row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_staged_tags')) {
        const row = tagFromParams(params);
        state.tags.set(row.staged_recipe_tag_id, row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_staged_state_changes')) {
        const row = stateChangeFromParams(params);
        state.stateChanges.set(row.staged_recipe_state_change_id, row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_staged_substitution_hints')) {
        const row = substitutionFromParams(params);
        state.substitutionHints.set(row.staged_recipe_substitution_hint_id, row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_staged_quality_signals')) {
        const row = qualitySignalFromParams(params);
        state.qualitySignals.set(row.staged_recipe_quality_signal_id, row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('SELECT sr.*, j.source_type')) {
        return { rows: selectRecipeWithJob(state, params[0]) };
      }
      if (normalizedSql.startsWith('SELECT sr.*, j.status AS job_status')) {
        return { rows: selectStagedRecipes(state, normalizedSql, params) };
      }
      if (normalizedSql.startsWith('SELECT * FROM recipe_ingest_staged_')) {
        return { rows: selectChildren(state, normalizedSql, params[0]) };
      }
      if (normalizedSql.startsWith('UPDATE recipe_ingest_staged_recipes')) {
        const [reviewStatus, stagedRecipeId] = params;
        const row = state.recipes.get(stagedRecipeId);
        if (row) row.review_status = reviewStatus;
        return { rows: row ? [row] : [] };
      }
      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function jobFromParams(params) {
  const [job_id, source_type, source_name, source_url, raw_text, raw_json, language, status, generation_method, rules_version] = params;
  return { job_id, source_type, source_name, source_url, raw_text, raw_json: JSON.parse(raw_json), language, status, generation_method, rules_version };
}

function stagedRecipeFromParams(params) {
  const [
    staged_recipe_id, job_id, proposed_recipe_key, title_original, title_en, title_bg, description,
    servings, yield_quantity, yield_unit, cuisine_tags_json, region_tags_json, dietary_tags_json,
    meal_type_tags_json, feeling_tags_json, flavor_profile_json, texture_profile_json, difficulty_level,
    budget_level, prep_time_minutes, cook_time_minutes, rest_time_minutes, total_time_minutes,
    review_status, confidence, extraction_json,
  ] = params;
  return {
    staged_recipe_id, job_id, proposed_recipe_key, title_original, title_en, title_bg, description,
    servings, yield_quantity, yield_unit,
    cuisine_tags_json: JSON.parse(cuisine_tags_json),
    region_tags_json: JSON.parse(region_tags_json),
    dietary_tags_json: JSON.parse(dietary_tags_json),
    meal_type_tags_json: JSON.parse(meal_type_tags_json),
    feeling_tags_json: JSON.parse(feeling_tags_json),
    flavor_profile_json: JSON.parse(flavor_profile_json),
    texture_profile_json: JSON.parse(texture_profile_json),
    difficulty_level, budget_level, prep_time_minutes, cook_time_minutes, rest_time_minutes,
    total_time_minutes, review_status, confidence, extraction_json: JSON.parse(extraction_json),
    created_at: '2026-04-24T00:00:00.000Z',
  };
}

function stagedIngredientFromParams(params) {
  const [
    staged_recipe_ingredient_id, staged_recipe_id, raw_line, ingredient_name_original,
    ingredient_name_en, ingredient_name_bg, proposed_ingredient_key, matched_ingredient_id,
    quantity, unit, quantity_grams, preparation_note, optional, sort_order, match_confidence,
    review_status, extraction_json,
  ] = params;
  return {
    staged_recipe_ingredient_id, staged_recipe_id, raw_line, ingredient_name_original,
    ingredient_name_en, ingredient_name_bg, proposed_ingredient_key, matched_ingredient_id,
    quantity, unit, quantity_grams, preparation_note, optional, sort_order, match_confidence,
    review_status, extraction_json: JSON.parse(extraction_json),
  };
}

function stagedStepFromParams(params) {
  const [
    staged_recipe_step_id, staged_recipe_id, step_number, instruction_original,
    instruction_en, instruction_bg, duration_minutes, temperature_c, state_change_summary,
    extraction_json,
  ] = params;
  return { staged_recipe_step_id, staged_recipe_id, step_number, instruction_original, instruction_en, instruction_bg, duration_minutes, temperature_c, state_change_summary, extraction_json: JSON.parse(extraction_json) };
}

function namedChildFromParams(params, idField, keyField, nameEnField, nameBgField) {
  const [id, staged_recipe_id, key, name_en, name_bg, confidence, evidence_text, extraction_json] = params;
  return { [idField]: id, staged_recipe_id, [keyField]: key, [nameEnField]: name_en, [nameBgField]: name_bg, confidence, evidence_text, extraction_json: JSON.parse(extraction_json) };
}

function tagFromParams(params) {
  const [staged_recipe_tag_id, staged_recipe_id, tag_type, tag_key, tag_value, confidence, evidence_text, extraction_json] = params;
  return { staged_recipe_tag_id, staged_recipe_id, tag_type, tag_key, tag_value, confidence, evidence_text, extraction_json: JSON.parse(extraction_json) };
}

function stateChangeFromParams(params) {
  const [staged_recipe_state_change_id, staged_recipe_id, state_change_key, ingredient_name, from_state, to_state, confidence, evidence_text, extraction_json] = params;
  return { staged_recipe_state_change_id, staged_recipe_id, state_change_key, ingredient_name, from_state, to_state, confidence, evidence_text, extraction_json: JSON.parse(extraction_json) };
}

function substitutionFromParams(params) {
  const [staged_recipe_substitution_hint_id, staged_recipe_id, substitution_key, original_ingredient_name, substitute_ingredient_name, reason, confidence, evidence_text, extraction_json] = params;
  return { staged_recipe_substitution_hint_id, staged_recipe_id, substitution_key, original_ingredient_name, substitute_ingredient_name, reason, confidence, evidence_text, extraction_json: JSON.parse(extraction_json) };
}

function qualitySignalFromParams(params) {
  const [staged_recipe_quality_signal_id, staged_recipe_id, signal_key, signal_name, signal_value, severity, confidence, evidence_text, extraction_json] = params;
  return { staged_recipe_quality_signal_id, staged_recipe_id, signal_key, signal_name, signal_value, severity, confidence, evidence_text, extraction_json: JSON.parse(extraction_json) };
}

function selectRecipeWithJob(state, stagedRecipeId) {
  const recipe = state.recipes.get(stagedRecipeId);
  if (!recipe) return [];
  const job = state.jobs.get(recipe.job_id);
  return [{ ...recipe, ...job, job_status: job.status }];
}

function selectStagedRecipes(state, sql, params) {
  let rows = [...state.recipes.values()].map((recipe) => {
    const job = state.jobs.get(recipe.job_id);
    return { ...recipe, job_status: job.status, source_type: job.source_type, source_name: job.source_name };
  });
  if (sql.includes('sr.review_status = $1')) rows = rows.filter((row) => row.review_status === params[0]);
  if (sql.includes('j.status = $')) rows = rows.filter((row) => row.job_status === params.find((param) => ['staged', 'pending', 'failed', 'completed'].includes(param)));
  if (sql.includes('ILIKE')) {
    const needle = String(params[0]).replaceAll('%', '').toLowerCase();
    rows = rows.filter((row) => [row.proposed_recipe_key, row.title_original, row.title_en, row.title_bg].some((value) => String(value || '').toLowerCase().includes(needle)));
  }
  return rows.slice(0, Number(params[params.length - 1]) || rows.length);
}

function selectChildren(state, sql, stagedRecipeId) {
  const source = sql.includes('recipe_ingest_staged_ingredients') ? state.ingredients
    : sql.includes('recipe_ingest_staged_steps') ? state.steps
      : sql.includes('recipe_ingest_staged_tools') ? state.tools
        : sql.includes('recipe_ingest_staged_methods') ? state.methods
          : sql.includes('recipe_ingest_staged_tags') ? state.tags
            : sql.includes('recipe_ingest_staged_state_changes') ? state.stateChanges
              : sql.includes('recipe_ingest_staged_substitution_hints') ? state.substitutionHints
                : state.qualitySignals;
  return [...source.values()].filter((row) => row.staged_recipe_id === stagedRecipeId);
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '015_db5a_rich_recipe_ingest_staging.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS recipe_ingest_jobs'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS recipe_ingest_staged_recipes'));
  assert(migration.includes('recipe_ingest_staged_quality_signals'));
  assert(migration.includes('matched_ingredient_id TEXT REFERENCES ingredients'));
  assert(!migration.includes('CREATE TABLE IF NOT EXISTS recipes'), 'DB5A must not create canonical recipe tables');

  const client = makeClient();
  const inserted = await insertStagedRecipeBundle(client, makeBundle());
  assert.strictEqual(inserted.job.raw_text, 'Raw chicken rice bowl text is preserved exactly.');
  assert.deepStrictEqual(inserted.job.raw_json, { original: true, line_count: 3 });
  assert.strictEqual(inserted.staged_recipe.flavor_profile_json.primary[0], 'savory');
  assert.strictEqual(inserted.ingredients.length, 2);
  assert.strictEqual(inserted.ingredients[1].matched_ingredient_id, null, 'matched_ingredient_id remains nullable');
  assert.strictEqual(inserted.steps.length, 2);
  assert.strictEqual(inserted.tools.length, 1);
  assert.strictEqual(inserted.methods.length, 1);
  assert.strictEqual(inserted.tags.length, 1);
  assert.strictEqual(inserted.state_changes.length, 1);
  assert.strictEqual(inserted.substitution_hints.length, 1);
  assert.strictEqual(inserted.quality_signals.length, 1);

  const detail = await getStagedRecipeDetail(client, { stagedRecipeId: 'staged_recipe:test:chicken' });
  assert.strictEqual(detail.job.raw_text, 'Raw chicken rice bowl text is preserved exactly.');
  assert.strictEqual(detail.ingredients[0].staged_recipe_ingredient_id.startsWith('ingredient:'), true);
  assert.strictEqual(detail.ingredients.some((row) => row.staged_recipe_id === 'recipe:chicken_rice_bowl'), false, 'staging ingredients are separate from canonical recipe_ingredients');
  assert.strictEqual(detail.quality_signals[0].signal_key, 'nullable_match');

  const stagedOnly = await listStagedRecipes(client, { reviewStatus: 'staged', status: 'staged', limit: 10 });
  assert.strictEqual(stagedOnly.length, 1);
  const search = await searchStagedRecipes(client, { query: 'chicken', limit: 10 });
  assert.strictEqual(search.length, 1);
  const updated = await updateStagedRecipeReviewStatus(client, {
    stagedRecipeId: 'staged_recipe:test:chicken',
    reviewStatus: 'needs_review',
  });
  assert.strictEqual(updated.review_status, 'needs_review');
  assert.throws(() => deleteRecipeIngestStaging(), /must not be deleted/);

  const seedClient = makeClient();
  const seedReport = await seedRecipeIngestStaging(seedClient, {
    limit: 1,
    fixturePath: DEFAULT_FIXTURE_PATH,
  });
  assert.strictEqual(seedReport.jobs_seen, 1);
  assert.strictEqual(seedReport.jobs_created, 1);
  assert.strictEqual(seedReport.staged_recipes_created, 1);
  assert(seedReport.staged_ingredients_created > 0);
  const dryRunClient = makeClient();
  const dryRun = await seedRecipeIngestStaging(dryRunClient, {
    dryRun: true,
    limit: 2,
    fixturePath: DEFAULT_FIXTURE_PATH,
  });
  assert.strictEqual(dryRun.jobs_seen, 2);
  assert.strictEqual(dryRunClient.state.jobs.size, 0, 'dry run must not write staging rows');

  assert.deepStrictEqual(parseArgs(['--dry-run', '--limit=5', '--json', '--out=tmp/db5a.json']), {
    dryRun: true,
    limit: 5,
    json: true,
    out: 'tmp/db5a.json',
    fixturePath: DEFAULT_FIXTURE_PATH,
  });

  const unsafeSql = [...client.state.commands, ...seedClient.state.commands, ...dryRunClient.state.commands]
    .map((command) => command.sql)
    .join('\n');
  assert(!/INSERT INTO recipes\b|INSERT INTO recipe_ingredients\b|INSERT INTO ingredients\b/i.test(unsafeSql), 'DB5A must not write canonical recipes or create ingredients');
  assert(!/Firestore|LLM|OpenAI|meal_planner|runtime_publish|basket|shopping|product_search/i.test(unsafeSql), 'DB5A must not call Firestore, LLM, planner, or runtime paths');

  console.log('DB5A recipe ingest staging tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
