const assert = require('node:assert');
const fs = require('node:fs');

const {
  RECIPE_EXTRACTION_PROMPT_VERSION,
  buildRecipeExtractionPrompt,
  extractRecipeJobToStaging,
  extractRecipeJobsToStaging,
  validateRecipeExtractionPayload,
} = require('../app/functions/src');
const { parseArgs } = require('../scripts/db5b_extract_recipe_to_staging');

function validExtraction(overrides = {}) {
  return {
    recipe: {
      proposed_recipe_key: 'chicken_rice_bowl_llm',
      title_original: 'Chicken rice bowl',
      title_en: 'Chicken Rice Bowl',
      title_bg: 'BG Chicken Rice Bowl',
      description: 'A bowl extracted from raw recipe text.',
      servings: 2,
      yield_quantity: 2,
      yield_unit: 'bowls',
      cuisine_tags: ['home_style'],
      region_tags: ['global'],
      dietary_tags: ['high_protein'],
      meal_type_tags: ['lunch'],
      feeling_tags: ['filling'],
      flavor_profile: { primary: ['savory'] },
      texture_profile: { primary: ['soft'] },
      difficulty_level: 'easy',
      budget_level: 'medium',
      prep_time_minutes: 10,
      cook_time_minutes: 20,
      rest_time_minutes: null,
      total_time_minutes: 30,
      confidence: 0.91,
      ...(overrides.recipe || {}),
    },
    ingredients: overrides.ingredients || [
      {
        raw_line: '160 g rice',
        ingredient_name_original: 'rice',
        ingredient_name_en: 'Rice',
        ingredient_name_bg: 'BG rice',
        proposed_ingredient_key: 'rice',
        quantity: 160,
        unit: 'g',
        quantity_grams: 160,
        preparation_note: null,
        optional: false,
        sort_order: 1,
        confidence: 0.96,
      },
      {
        raw_line: '2 domat',
        ingredient_name_original: 'domat',
        ingredient_name_en: 'Domat',
        ingredient_name_bg: 'BG tomato',
        proposed_ingredient_key: 'domat',
        quantity: 2,
        unit: 'piece',
        quantity_grams: 240,
        preparation_note: 'chopped',
        optional: false,
        sort_order: 2,
        confidence: 0.88,
      },
      {
        raw_line: 'pinch mystery spice',
        ingredient_name_original: 'mystery spice',
        ingredient_name_en: 'Mystery Spice',
        ingredient_name_bg: null,
        proposed_ingredient_key: 'mystery_spice',
        quantity: null,
        unit: null,
        quantity_grams: null,
        preparation_note: null,
        optional: true,
        sort_order: 3,
        confidence: 0.3,
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction_original: 'Cook rice.',
        instruction_en: 'Cook rice.',
        instruction_bg: 'BG cook rice',
        duration_minutes: 18,
        temperature_c: null,
        state_change_summary: 'rice dry to cooked',
        confidence: 0.9,
      },
    ],
    tools: [{ key: 'pot', name_en: 'Pot', name_bg: 'BG pot', confidence: 0.9, evidence_text: 'Cook rice.' }],
    methods: [{ key: 'boiling', name_en: 'Boiling', name_bg: 'BG boiling', confidence: 0.9, evidence_text: 'Cook rice.' }],
    tags: [{ tag_type: 'feeling', tag_key: 'filling', tag_value: 'Filling', confidence: 0.8, evidence_text: 'bowl' }],
    state_changes: [{ state_change_key: 'rice_dry_to_cooked', ingredient_name: 'Rice', from_state: 'dry', to_state: 'cooked', confidence: 0.8, evidence_text: 'Cook rice.' }],
    substitution_hints: [{ substitution_key: 'rice_to_potato', original_ingredient_name: 'Rice', substitute_ingredient_name: 'Potato', reason: 'Flexible starch base', confidence: 0.4, evidence_text: 'bowl' }],
    quality_signals: [{ signal_key: 'complete_steps', signal_name: 'Complete steps', signal_value: 'yes', severity: 'info', confidence: 0.8, evidence_text: 'has instructions' }],
    ...withoutRecipeAndIngredients(overrides),
  };
}

function withoutRecipeAndIngredients(value) {
  const clone = { ...value };
  delete clone.recipe;
  delete clone.ingredients;
  return clone;
}

function makeClient() {
  const state = {
    jobs: new Map(),
    recipes: new Map(),
    stagedIngredients: new Map(),
    steps: new Map(),
    tools: new Map(),
    methods: new Map(),
    tags: new Map(),
    stateChanges: new Map(),
    substitutionHints: new Map(),
    qualitySignals: new Map(),
    ingredients: new Map(),
    commands: [],
    transactions: { begin: 0, commit: 0, rollback: 0 },
  };
  seedIngredients(state);
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
      if (normalizedSql.startsWith('SELECT * FROM recipe_ingest_jobs WHERE job_id')) {
        return { rows: state.jobs.has(params[0]) ? [state.jobs.get(params[0])] : [] };
      }
      if (normalizedSql.startsWith('SELECT * FROM recipe_ingest_jobs WHERE status')) {
        const [status, limit] = params;
        return { rows: [...state.jobs.values()].filter((job) => job.status === status).slice(0, limit) };
      }
      if (normalizedSql.startsWith('SELECT * FROM recipe_ingest_staged_recipes WHERE job_id')) {
        return { rows: [...state.recipes.values()].filter((recipe) => recipe.job_id === params[0]) };
      }
      if (normalizedSql.startsWith('UPDATE recipe_ingest_jobs')) {
        const [jobId, status, rawJsonPatch] = params;
        const row = state.jobs.get(jobId);
        if (!row) return { rows: [] };
        row.status = status;
        row.raw_json = { ...(row.raw_json || {}), ...JSON.parse(rawJsonPatch || '{}') };
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('SELECT * FROM ingredients WHERE ingredient_key')) {
        const key = params[0];
        return { rows: [...state.ingredients.values()].filter((ingredient) => ingredient.ingredient_key === key) };
      }
      if (normalizedSql.startsWith('SELECT * FROM ingredients WHERE normalized_name')) {
        return { rows: searchIngredientRows(state, params[0]).slice(0, params[1]) };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_jobs')) {
        const row = jobFromParams(params);
        state.jobs.set(row.job_id, { ...(state.jobs.get(row.job_id) || {}), ...row });
        return { rows: [state.jobs.get(row.job_id)] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_staged_recipes')) {
        const row = stagedRecipeFromParams(params);
        state.recipes.set(row.staged_recipe_id, row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_ingest_staged_ingredients')) {
        const row = stagedIngredientFromParams(params);
        state.stagedIngredients.set(row.staged_recipe_ingredient_id, row);
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
      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function addJob(client, overrides = {}) {
  const job = {
    job_id: overrides.job_id || 'recipe_ingest_job:test:llm',
    source_type: 'raw_text',
    source_name: 'unit test source',
    source_url: 'https://example.test/recipe',
    raw_text: 'Chicken rice bowl raw text stays here.',
    raw_json: { original: true },
    language: 'en',
    status: 'pending',
    generation_method: 'manual_raw_job_v1',
    rules_version: 'db5a_recipe_ingest_staging_v1',
    created_at: '2026-04-24T00:00:00.000Z',
    ...overrides,
  };
  client.state.jobs.set(job.job_id, job);
  return job;
}

function seedIngredients(state) {
  for (const ingredient of [
    ingredientRow({ ingredient_key: 'rice', name_en: 'Rice', aliases_json: { en: ['plain rice'], all: ['plain_rice'] } }),
    ingredientRow({ ingredient_key: 'tomato', name_en: 'Tomato', aliases_json: { en: ['domat'], all: ['domat'] } }),
  ]) {
    state.ingredients.set(ingredient.ingredient_id, ingredient);
  }
}

function ingredientRow(overrides) {
  const key = overrides.ingredient_key;
  return {
    ingredient_id: `ingredient:${key}`,
    ingredient_key: key,
    name_en: overrides.name_en,
    name_bg: `BG ${overrides.name_en}`,
    canonical_name: overrides.name_en,
    normalized_name: normalizeName(overrides.name_en),
    aliases_json: overrides.aliases_json || { all: [] },
    review_status: 'active',
  };
}

function searchIngredientRows(state, pattern) {
  const needle = String(pattern || '').replace(/%/g, '');
  return [...state.ingredients.values()].filter((ingredient) => {
    const aliases = [
      ...(ingredient.aliases_json.all || []),
      ...(ingredient.aliases_json.en || []),
      ...(ingredient.aliases_json.bg || []),
    ].map(normalizeName);
    return normalizeName(ingredient.normalized_name).includes(needle) ||
      normalizeName(ingredient.name_en).includes(needle) ||
      aliases.some((alias) => alias.includes(needle));
  }).sort((left, right) => left.ingredient_key.localeCompare(right.ingredient_key));
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
  const [id, staged_recipe_id, key, nameEn, nameBg, confidence, evidence_text, extraction_json] = params;
  return { [idField]: id, staged_recipe_id, [keyField]: key, [nameEnField]: nameEn, [nameBgField]: nameBg, confidence, evidence_text, extraction_json: JSON.parse(extraction_json) };
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

function normalizeName(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}0-9]+/gu, '_').replace(/^_+|_+$/g, '');
}

async function run() {
  const prompt = buildRecipeExtractionPrompt({ rawText: 'Mix and cook.', language: 'en' });
  assert.equal(prompt.prompt_version, RECIPE_EXTRACTION_PROMPT_VERSION);
  assert(prompt.hard_rules.some((rule) => /strict JSON only/i.test(rule)));

  const migration = fs.readFileSync('db/migrations/016_db5b_recipe_ingest_llm_extraction_status.sql', 'utf8');
  assert(migration.includes("'extracting'"), 'DB5B migration must allow extracting job status');

  const client = makeClient();
  const job = addJob(client);
  let llmCalls = 0;
  const result = await extractRecipeJobToStaging(client, {
    job,
    recipeLlmClient: async () => {
      llmCalls += 1;
      return JSON.stringify(validExtraction());
    },
    modelName: 'mock-recipe-model',
    now: () => new Date('2026-04-24T10:00:00.000Z'),
  });

  assert.equal(llmCalls, 1, 'valid extraction should call the mocked LLM exactly once');
  assert.equal(client.state.recipes.size, 1, 'valid extraction inserts one staged recipe');
  assert.equal(client.state.jobs.get(job.job_id).status, 'staged');
  assert.equal(client.state.jobs.get(job.job_id).raw_text, 'Chicken rice bowl raw text stays here.');
  assert.equal(client.state.jobs.get(job.job_id).raw_json.db5b.model_name, 'mock-recipe-model');
  assert.equal(result.ingredients_matched, 2, 'key and alias/name matches should both resolve');
  assert.equal(result.ingredients_unmatched, 1, 'unmatched ingredients remain staged');
  const stagedIngredients = [...client.state.stagedIngredients.values()].sort((a, b) => a.sort_order - b.sort_order);
  assert.equal(stagedIngredients[0].matched_ingredient_id, 'ingredient:rice');
  assert.equal(stagedIngredients[0].review_status, 'matched');
  assert.equal(stagedIngredients[1].matched_ingredient_id, 'ingredient:tomato');
  assert.equal(stagedIngredients[1].review_status, 'matched');
  assert.equal(stagedIngredients[2].matched_ingredient_id, null);
  assert.equal(stagedIngredients[2].review_status, 'needs_review');
  const stagedRecipe = [...client.state.recipes.values()][0];
  assert.equal(stagedRecipe.extraction_json.db5b.parsed_extraction.recipe.proposed_recipe_key, 'chicken_rice_bowl_llm');
  assert.equal(client.state.tools.size, 1);
  assert.equal(client.state.methods.size, 1);
  assert.equal(client.state.tags.size, 1);
  assert.equal(client.state.stateChanges.size, 1);
  assert.equal(client.state.substitutionHints.size, 1);
  assert.equal(client.state.qualitySignals.size, 1);

  let secondLlmCalls = 0;
  const skipped = await extractRecipeJobToStaging(client, {
    job,
    recipeLlmClient: async () => {
      secondLlmCalls += 1;
      return JSON.stringify(validExtraction());
    },
  });
  assert.equal(skipped.skipped_existing, true, 'existing staged recipe prevents duplicate staging');
  assert.equal(secondLlmCalls, 0, 'idempotent skip should avoid duplicate LLM cost');
  assert.equal(client.state.recipes.size, 1);

  const forced = await extractRecipeJobToStaging(client, {
    job,
    force: true,
    recipeLlmClient: async () => JSON.stringify(validExtraction({ recipe: { description: 'Forced restage.' } })),
  });
  assert.equal(forced.skipped_existing, false);
  assert.equal(client.state.recipes.size, 1, 'force restaging upserts deterministic staged rows safely');
  assert.equal([...client.state.recipes.values()][0].description, 'Forced restage.');

  const invalidClient = makeClient();
  const invalidJob = addJob(invalidClient, { job_id: 'recipe_ingest_job:test:invalid_json' });
  const invalidReport = await extractRecipeJobsToStaging(invalidClient, {
    jobId: invalidJob.job_id,
    recipeLlmClient: async () => '{ not json',
  });
  assert.equal(invalidReport.jobs_failed, 1);
  assert.equal(invalidReport.validation_errors, 1);
  assert.equal(invalidClient.state.jobs.get(invalidJob.job_id).status, 'failed');
  assert.equal(invalidClient.state.jobs.get(invalidJob.job_id).raw_text, invalidJob.raw_text, 'failure must preserve raw input');
  assert.match(invalidClient.state.jobs.get(invalidJob.job_id).raw_json.db5b.error_message, /valid strict JSON/);

  assert.throws(
    () => validateRecipeExtractionPayload(validExtraction({ recipe: { title_original: null, title_en: null, title_bg: null } })),
    /missing a recipe title/,
  );
  assert.throws(
    () => validateRecipeExtractionPayload(validExtraction({ ingredients: [] })),
    /at least one ingredient/,
  );

  const dryRunClient = makeClient();
  addJob(dryRunClient, { job_id: 'recipe_ingest_job:test:dry_run' });
  const dryRunReport = await extractRecipeJobsToStaging(dryRunClient, {
    status: 'pending',
    dryRun: true,
    recipeLlmClient: async () => JSON.stringify(validExtraction()),
  });
  assert.equal(dryRunReport.jobs_extracted, 1);
  assert.equal(dryRunReport.jobs_staged, 0);
  assert.equal(dryRunClient.state.recipes.size, 0, 'dry-run must not write staged rows');

  const args = parseArgs(['--job-id=recipe_ingest_job:x', '--status=failed', '--limit=7', '--dry-run', '--force', '--json', '--out=tmp/report.json']);
  assert.equal(args.jobId, 'recipe_ingest_job:x');
  assert.equal(args.status, 'failed');
  assert.equal(args.limit, 7);
  assert.equal(args.dryRun, true);
  assert.equal(args.force, true);
  assert.equal(args.json, true);
  assert.equal(args.out, 'tmp/report.json');

  const unsafeSql = [
    ...client.state.commands,
    ...invalidClient.state.commands,
    ...dryRunClient.state.commands,
  ].map((command) => command.sql).join('\n');
  assert(!/INSERT INTO recipes\b|INSERT INTO recipe_ingredients\b|INSERT INTO ingredients\b/i.test(unsafeSql), 'DB5B must not write canonical recipes or create ingredients');
  assert(!/Firestore|meal_planner|runtime_publish|basket|shopping|product_search/i.test(unsafeSql), 'DB5B must not write Firestore or runtime app paths');

  console.log('DB5B recipe LLM extraction tests passed');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
