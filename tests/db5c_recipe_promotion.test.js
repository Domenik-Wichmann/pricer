const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  classifyRecipeUsability,
  getRecipePromotionCandidateDetail,
  listRecipePromotionCandidates,
  reviewAndPromoteRecipe,
} = require('../app/functions/src');
const { parseArgs } = require('../scripts/db5c_review_and_promote_recipe');

function makeClient(options = {}) {
  const state = {
    jobs: new Map(),
    stagedRecipes: new Map(),
    stagedIngredients: new Map(),
    stagedSteps: new Map(),
    stagedChildren: {
      recipe_ingest_staged_tools: [],
      recipe_ingest_staged_methods: [],
      recipe_ingest_staged_tags: [],
      recipe_ingest_staged_state_changes: [],
      recipe_ingest_staged_substitution_hints: [],
      recipe_ingest_staged_quality_signals: [],
    },
    recipesByKey: new Map(),
    recipeIngredients: new Map(),
    recipeSteps: new Map(),
    ingredientGapCandidates: new Map(),
    recipePromotionHistory: [],
    approvedNutritionIngredientIds: new Set(options.approvedNutritionIngredientIds || []),
    approvedProductIngredientIds: new Set(options.approvedProductIngredientIds || []),
    commands: [],
    transactions: {
      begin: 0,
      commit: 0,
      rollback: 0,
    },
  };

  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
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

      if (normalizedSql.startsWith('SELECT sr.staged_recipe_id FROM recipe_ingest_staged_recipes sr JOIN recipe_ingest_jobs j')) {
        const jobId = params[0];
        const stagedRecipe = [...state.stagedRecipes.values()]
          .filter((row) => row.job_id === jobId)
          .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)) || left.staged_recipe_id.localeCompare(right.staged_recipe_id))[0];
        return { rows: stagedRecipe ? [{ staged_recipe_id: stagedRecipe.staged_recipe_id }] : [] };
      }

      if (normalizedSql.startsWith('SELECT sr.*, j.source_type,')) {
        const stagedRecipe = state.stagedRecipes.get(params[0]);
        if (!stagedRecipe) return { rows: [] };
        const job = state.jobs.get(stagedRecipe.job_id);
        return {
          rows: [{
            ...stagedRecipe,
            source_type: job.source_type,
            source_name: job.source_name,
            source_url: job.source_url,
            raw_text: job.raw_text,
            raw_json: job.raw_json,
            language: job.language,
            job_status: job.status,
          }],
        };
      }

      if (normalizedSql.startsWith('SELECT * FROM recipe_ingest_staged_ingredients')) {
        return {
          rows: [...state.stagedIngredients.values()]
            .filter((row) => row.staged_recipe_id === params[0])
            .sort((left, right) => left.sort_order - right.sort_order || left.staged_recipe_ingredient_id.localeCompare(right.staged_recipe_ingredient_id)),
        };
      }

      if (normalizedSql.startsWith('SELECT * FROM recipe_ingest_staged_steps')) {
        return {
          rows: [...state.stagedSteps.values()]
            .filter((row) => row.staged_recipe_id === params[0])
            .sort((left, right) => left.step_number - right.step_number || left.staged_recipe_step_id.localeCompare(right.staged_recipe_step_id)),
        };
      }

      for (const childTable of Object.keys(state.stagedChildren)) {
        if (normalizedSql.startsWith(`SELECT * FROM ${childTable}`)) {
          return {
            rows: state.stagedChildren[childTable].filter((row) => row.staged_recipe_id === params[0]),
          };
        }
      }

      if (normalizedSql.startsWith('SELECT sr.*, j.status AS job_status, j.source_type, j.source_name FROM recipe_ingest_staged_recipes sr JOIN recipe_ingest_jobs j')) {
        let rows = [...state.stagedRecipes.values()].map((row) => {
          const job = state.jobs.get(row.job_id);
          return {
            ...row,
            job_status: job?.status || null,
            source_type: job?.source_type || null,
            source_name: job?.source_name || null,
          };
        });
        const limit = Number(params[params.length - 1]);
        if (normalizedSql.includes('WHERE sr.review_status = $1')) {
          rows = rows.filter((row) => row.review_status === params[0]);
        }
        if (normalizedSql.includes('WHERE j.status = $1')) {
          rows = rows.filter((row) => (state.jobs.get(row.job_id)?.status || null) === params[0]);
        }
        if (normalizedSql.includes('sr.review_status = $1 AND j.status = $2')) {
          rows = rows.filter((row) => row.review_status === params[0] && (state.jobs.get(row.job_id)?.status || null) === params[1]);
        }
        rows.sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)) || left.proposed_recipe_key.localeCompare(right.proposed_recipe_key));
        return { rows: rows.slice(0, limit) };
      }

      if (normalizedSql.startsWith('SELECT ingredient_id FROM ingredient_nutrition_profiles')) {
        return {
          rows: (params[0] || [])
            .filter((ingredientId) => state.approvedNutritionIngredientIds.has(ingredientId))
            .map((ingredient_id) => ({ ingredient_id })),
        };
      }

      if (normalizedSql.startsWith('SELECT ingredient_id FROM ingredient_product_mappings')) {
        return {
          rows: (params[0] || [])
            .filter((ingredientId) => state.approvedProductIngredientIds.has(ingredientId))
            .map((ingredient_id) => ({ ingredient_id })),
        };
      }

      if (normalizedSql.startsWith('INSERT INTO recipes')) {
        const row = recipeFromParams(params);
        const existing = state.recipesByKey.get(row.recipe_key);
        if (existing) {
          row.recipe_id = existing.recipe_id;
          row.created_at = existing.created_at;
        }
        row.updated_at = '2026-04-25T12:00:00.000Z';
        state.recipesByKey.set(row.recipe_key, { ...(existing || {}), ...row });
        return { rows: [state.recipesByKey.get(row.recipe_key)] };
      }

      if (normalizedSql.startsWith('INSERT INTO recipe_ingredients')) {
        const row = recipeIngredientFromParams(params);
        const existing = state.recipeIngredients.get(row.recipe_ingredient_id);
        row.created_at = existing?.created_at || '2026-04-25T12:00:00.000Z';
        row.updated_at = '2026-04-25T12:00:00.000Z';
        state.recipeIngredients.set(row.recipe_ingredient_id, { ...(existing || {}), ...row });
        return { rows: [state.recipeIngredients.get(row.recipe_ingredient_id)] };
      }

      if (normalizedSql.startsWith('INSERT INTO recipe_steps')) {
        const row = recipeStepFromParams(params);
        const existing = state.recipeSteps.get(row.recipe_step_id);
        row.created_at = existing?.created_at || '2026-04-25T12:00:00.000Z';
        row.updated_at = '2026-04-25T12:00:00.000Z';
        state.recipeSteps.set(row.recipe_step_id, { ...(existing || {}), ...row });
        return { rows: [state.recipeSteps.get(row.recipe_step_id)] };
      }

      if (normalizedSql.startsWith('INSERT INTO ingredient_gap_candidates')) {
        const row = ingredientGapFromParams(params);
        const key = `recipe|${row.recipe_id}|${row.normalized_name}`;
        const existing = state.ingredientGapCandidates.get(key);
        if (existing) {
          existing.raw_name = row.raw_name;
          existing.proposed_ingredient_key = row.proposed_ingredient_key;
          existing.occurrences += 1;
          existing.updated_at = '2026-04-25T12:00:00.000Z';
          return { rows: [existing] };
        }
        row.created_at = '2026-04-25T12:00:00.000Z';
        row.updated_at = '2026-04-25T12:00:00.000Z';
        state.ingredientGapCandidates.set(key, row);
        return { rows: [row] };
      }

      if (normalizedSql.startsWith('UPDATE recipe_ingest_staged_recipes SET review_status')) {
        const stagedRecipe = state.stagedRecipes.get(params[1]);
        if (!stagedRecipe) return { rows: [] };
        stagedRecipe.review_status = params[0];
        stagedRecipe.updated_at = '2026-04-25T12:00:00.000Z';
        return { rows: [stagedRecipe] };
      }

      if (normalizedSql.startsWith('SELECT COUNT(*) AS total FROM recipe_promotion_history')) {
        const total = state.recipePromotionHistory.filter((row) => row.staged_recipe_id === params[0]).length;
        return { rows: [{ total: String(total) }] };
      }

      if (normalizedSql.startsWith('INSERT INTO recipe_promotion_history')) {
        const row = promotionHistoryFromParams(params);
        row.created_at = '2026-04-25T12:00:00.000Z';
        state.recipePromotionHistory.push(row);
        return { rows: [row] };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function addStagedRecipeBundle(client, {
  jobId = 'recipe_ingest_job:test:promotion',
  stagedRecipeId = 'staged_recipe:test:promotion',
  proposedRecipeKey = 'chicken_rice_bowl_db5c',
  reviewStatus = 'staged',
  jobStatus = 'staged',
  titleEn = 'Chicken Rice Bowl',
  titleBg = 'Пилешка оризова купа',
  description = 'A staged recipe ready for DB5C promotion.',
  servings = 2,
  ingredients = [],
  steps = [],
} = {}) {
  client.state.jobs.set(jobId, {
    job_id: jobId,
    source_type: 'raw_text',
    source_name: 'DB5C unit test source',
    source_url: 'https://example.test/db5c',
    raw_text: 'Raw recipe text that must remain preserved.',
    raw_json: { original: true },
    language: 'en',
    status: jobStatus,
    created_at: '2026-04-25T09:00:00.000Z',
  });

  client.state.stagedRecipes.set(stagedRecipeId, {
    staged_recipe_id: stagedRecipeId,
    job_id: jobId,
    proposed_recipe_key: proposedRecipeKey,
    title_original: titleEn,
    title_en: titleEn,
    title_bg: titleBg,
    description,
    servings,
    yield_quantity: 2,
    yield_unit: 'bowls',
    cuisine_tags_json: ['home_style'],
    region_tags_json: ['global'],
    dietary_tags_json: ['high_protein'],
    meal_type_tags_json: ['lunch'],
    feeling_tags_json: ['comfort'],
    flavor_profile_json: { primary: ['savory'] },
    texture_profile_json: { primary: ['soft'] },
    difficulty_level: 'easy',
    budget_level: 'medium',
    prep_time_minutes: 10,
    cook_time_minutes: 20,
    rest_time_minutes: null,
    total_time_minutes: 30,
    review_status: reviewStatus,
    confidence: 0.9,
    extraction_json: { db5b: { parsed_extraction: true } },
    created_at: '2026-04-25T09:00:00.000Z',
    updated_at: '2026-04-25T09:00:00.000Z',
  });

  for (const [index, ingredient] of ingredients.entries()) {
    const row = {
      staged_recipe_ingredient_id: ingredient.staged_recipe_ingredient_id || `${stagedRecipeId}:ingredient:${index + 1}`,
      staged_recipe_id: stagedRecipeId,
      raw_line: ingredient.raw_line || ingredient.ingredient_name_en,
      ingredient_name_original: ingredient.ingredient_name_original || ingredient.ingredient_name_en,
      ingredient_name_en: ingredient.ingredient_name_en,
      ingredient_name_bg: ingredient.ingredient_name_bg || null,
      proposed_ingredient_key: ingredient.proposed_ingredient_key,
      matched_ingredient_id: ingredient.matched_ingredient_id || null,
      quantity: ingredient.quantity ?? null,
      unit: ingredient.unit || null,
      quantity_grams: ingredient.quantity_grams ?? null,
      preparation_note: ingredient.preparation_note || null,
      optional: Boolean(ingredient.optional),
      sort_order: ingredient.sort_order || index + 1,
      match_confidence: ingredient.match_confidence ?? null,
      review_status: ingredient.review_status || (ingredient.matched_ingredient_id ? 'matched' : 'needs_review'),
      extraction_json: ingredient.extraction_json || {},
    };
    client.state.stagedIngredients.set(row.staged_recipe_ingredient_id, row);
  }

  for (const [index, step] of steps.entries()) {
    const row = {
      staged_recipe_step_id: step.staged_recipe_step_id || `${stagedRecipeId}:step:${index + 1}`,
      staged_recipe_id: stagedRecipeId,
      step_number: step.step_number || index + 1,
      instruction_original: step.instruction_original || step.instruction_en,
      instruction_en: step.instruction_en,
      instruction_bg: step.instruction_bg || null,
      duration_minutes: step.duration_minutes ?? null,
      temperature_c: step.temperature_c ?? null,
      state_change_summary: step.state_change_summary || null,
      extraction_json: step.extraction_json || {},
    };
    client.state.stagedSteps.set(row.staged_recipe_step_id, row);
  }
}

function recipeFromParams(params) {
  const [
    recipe_id,
    recipe_key,
    title_en,
    title_bg,
    canonical_title,
    normalized_title,
    description,
    cuisine_tags_json,
    dietary_tags_json,
    meal_type_tags_json,
    servings,
    yield_quantity,
    yield_unit,
    source,
    review_status,
    generation_method,
    rules_version,
    usability_status,
    ingredient_match_rate,
    nutrition_coverage_rate,
    product_coverage_rate,
  ] = params;
  return {
    recipe_id,
    recipe_key,
    title_en,
    title_bg,
    canonical_title,
    normalized_title,
    description,
    cuisine_tags_json: JSON.parse(cuisine_tags_json),
    dietary_tags_json: JSON.parse(dietary_tags_json),
    meal_type_tags_json: JSON.parse(meal_type_tags_json),
    servings,
    yield_quantity,
    yield_unit,
    source,
    review_status,
    generation_method,
    rules_version,
    usability_status,
    ingredient_match_rate,
    nutrition_coverage_rate,
    product_coverage_rate,
    last_quality_computed_at: '2026-04-25T12:00:00.000Z',
    created_at: '2026-04-25T12:00:00.000Z',
  };
}

function recipeIngredientFromParams(params) {
  const [
    recipe_ingredient_id,
    recipe_id,
    ingredient_id,
    matched_ingredient_id,
    ingredient_key_snapshot,
    display_name,
    quantity,
    unit,
    quantity_grams,
    preparation_note,
    optional,
    sort_order,
    match_method,
    match_confidence,
    review_status,
  ] = params;
  return {
    recipe_ingredient_id,
    recipe_id,
    ingredient_id,
    matched_ingredient_id,
    ingredient_key_snapshot,
    display_name,
    quantity,
    unit,
    quantity_grams,
    preparation_note,
    optional,
    sort_order,
    match_method,
    match_confidence,
    review_status,
  };
}

function recipeStepFromParams(params) {
  const [
    recipe_step_id,
    recipe_id,
    step_number,
    instruction,
    duration_minutes,
    temperature_c,
    equipment_tags_json,
  ] = params;
  return {
    recipe_step_id,
    recipe_id,
    step_number,
    instruction,
    duration_minutes,
    temperature_c,
    equipment_tags_json: JSON.parse(equipment_tags_json),
  };
}

function ingredientGapFromParams(params) {
  const [gap_id, recipe_id, raw_name, normalized_name, proposed_ingredient_key] = params;
  return {
    gap_id,
    source_type: 'recipe',
    recipe_id,
    raw_name,
    normalized_name,
    proposed_ingredient_key,
    occurrences: 1,
  };
}

function promotionHistoryFromParams(params) {
  const [id, staged_recipe_id, recipe_id, decision, reason, metrics_json] = params;
  return {
    id,
    staged_recipe_id,
    recipe_id,
    decision,
    reason,
    metrics_json: JSON.parse(metrics_json),
  };
}

async function run() {
  const client = makeClient({
    approvedNutritionIngredientIds: ['ingredient:rice', 'ingredient:chicken_breast'],
    approvedProductIngredientIds: ['ingredient:rice'],
  });

  addStagedRecipeBundle(client, {
    ingredients: [
      {
        ingredient_name_en: 'Chicken breast',
        ingredient_name_bg: 'Пилешки гърди',
        proposed_ingredient_key: 'chicken_breast',
        matched_ingredient_id: 'ingredient:chicken_breast',
        quantity: 200,
        unit: 'g',
        quantity_grams: 200,
        match_confidence: 0.98,
      },
      {
        ingredient_name_en: 'Rice',
        ingredient_name_bg: 'Ориз',
        proposed_ingredient_key: 'rice',
        matched_ingredient_id: 'ingredient:rice',
        quantity: 180,
        unit: 'g',
        quantity_grams: 180,
        match_confidence: 0.97,
      },
      {
        ingredient_name_en: 'Mystery sauce',
        ingredient_name_bg: null,
        proposed_ingredient_key: 'mystery_sauce',
        matched_ingredient_id: null,
        quantity: 2,
        unit: 'tbsp',
        quantity_grams: null,
        match_confidence: 0.22,
      },
    ],
    steps: [
      { step_number: 1, instruction_en: 'Cook the rice.', duration_minutes: 18 },
      { step_number: 2, instruction_en: 'Pan-cook the chicken and combine.', duration_minutes: 12 },
    ],
  });

  const candidates = await listRecipePromotionCandidates(client, { status: 'staged', limit: 10 });
  assert.equal(candidates.length, 1, 'staged promotion candidates should list by staged review status');

  const detail = await getRecipePromotionCandidateDetail(client, { jobId: 'recipe_ingest_job:test:promotion' });
  assert.equal(detail.metrics.total_ingredients, 3);
  assert.equal(detail.metrics.matched_ingredients, 2);
  assert.equal(detail.metrics.ingredient_match_rate, 0.6667);
  assert.equal(detail.metrics.nutrition_coverage_rate, 0.6667);
  assert.equal(detail.metrics.product_coverage_rate, 0.3333);
  assert.equal(detail.usability_status, 'needs_ingredient_mapping');

  const promoted = await reviewAndPromoteRecipe(client, {
    jobId: 'recipe_ingest_job:test:promotion',
    decision: 'approved',
    reason: 'Partial ingredient matches are still promotable in DB5C.',
  });

  assert.equal(promoted.action, 'promoted_to_canonical');
  assert.equal(promoted.recipe.recipe_key, 'chicken_rice_bowl_db5c');
  assert.equal(promoted.recipe.review_status, 'active');
  assert.equal(promoted.recipe.usability_status, 'needs_ingredient_mapping');
  assert.equal(promoted.recipe.ingredient_match_rate, 0.6667);
  assert.equal(promoted.ingredients.length, 3, 'all staged ingredients should be promoted');
  assert.equal(promoted.steps.length, 2, 'ordered staged steps should be promoted');
  assert.equal(promoted.steps[0].step_number, 1);
  assert.equal(promoted.steps[1].step_number, 2);
  assert.equal(client.state.recipesByKey.size, 1, 'promotion should create one canonical recipe');

  const unmatchedLine = [...client.state.recipeIngredients.values()].find((row) => row.ingredient_key_snapshot === 'mystery_sauce');
  assert.equal(unmatchedLine.ingredient_id, null, 'unmatched staged ingredients must remain nullable in canonical recipe_ingredients');
  assert.equal(unmatchedLine.matched_ingredient_id, null, 'matched_ingredient_id stays null for unresolved recipe lines');
  assert.equal(unmatchedLine.review_status, 'needs_review');

  assert.equal(client.state.ingredientGapCandidates.size, 1, 'promotion should create gap candidates for unmatched ingredients');
  const gapCandidate = [...client.state.ingredientGapCandidates.values()][0];
  assert.equal(gapCandidate.normalized_name, 'mystery_sauce');
  assert.equal(gapCandidate.occurrences, 1);
  assert.equal(client.state.recipePromotionHistory.length, 1);
  assert.equal(client.state.recipePromotionHistory[0].decision, 'approved');
  assert.match(client.state.recipePromotionHistory[0].id, /:0001$/);

  const repromoted = await reviewAndPromoteRecipe(client, {
    jobId: 'recipe_ingest_job:test:promotion',
    decision: 'approved',
    reason: 'Idempotent rerun check.',
  });
  assert.equal(repromoted.recipe.recipe_id, promoted.recipe.recipe_id, 'reruns must preserve stable canonical recipe ids');
  assert.equal(client.state.recipesByKey.size, 1, 'idempotent reruns must not duplicate recipes');
  assert.equal(client.state.recipeIngredients.size, 3, 'idempotent reruns must not duplicate recipe ingredient rows');
  assert.equal(client.state.recipeSteps.size, 2, 'idempotent reruns must not duplicate recipe step rows');
  assert.equal([...client.state.ingredientGapCandidates.values()][0].occurrences, 2, 'gap candidates should aggregate rerun occurrences');
  assert.equal(client.state.recipePromotionHistory.length, 2, 'each review decision must append history');
  assert.match(client.state.recipePromotionHistory[1].id, /:0002$/);

  assert.equal(
    classifyRecipeUsability({
      total_ingredients: 0,
      ingredient_match_rate: 0,
      ingredients_with_approved_nutrition: 0,
    }),
    'rejected',
  );
  assert.equal(
    classifyRecipeUsability({
      total_ingredients: 5,
      ingredient_match_rate: 0.39,
      ingredients_with_approved_nutrition: 0,
    }),
    'dormant',
  );
  assert.equal(
    classifyRecipeUsability({
      total_ingredients: 5,
      ingredient_match_rate: 0.5,
      ingredients_with_approved_nutrition: 0,
    }),
    'needs_ingredient_mapping',
  );
  assert.equal(
    classifyRecipeUsability({
      total_ingredients: 4,
      ingredient_match_rate: 0.75,
      ingredients_with_approved_nutrition: 0,
    }),
    'needs_nutrition',
  );
  assert.equal(
    classifyRecipeUsability({
      total_ingredients: 4,
      ingredient_match_rate: 0.75,
      ingredients_with_approved_nutrition: 1,
    }),
    'usable',
  );

  const invalidClient = makeClient();
  addStagedRecipeBundle(invalidClient, {
    jobId: 'recipe_ingest_job:test:invalid',
    stagedRecipeId: 'staged_recipe:test:invalid',
    proposedRecipeKey: 'invalid_no_ingredients',
    ingredients: [],
    steps: [{ step_number: 1, instruction_en: 'This recipe should fail promotion.' }],
  });
  const rejected = await reviewAndPromoteRecipe(invalidClient, {
    jobId: 'recipe_ingest_job:test:invalid',
    decision: 'approved',
    reason: 'Structurally invalid bundle.',
  });
  assert.equal(rejected.action, 'rejected_structurally_invalid');
  assert.equal(rejected.decision, 'rejected');
  assert.equal(rejected.usability_status, 'rejected');
  assert.equal(invalidClient.state.recipesByKey.size, 0, 'zero-ingredient staged recipes must not create canonical recipes');
  assert.equal(invalidClient.state.stagedRecipes.get('staged_recipe:test:invalid').review_status, 'rejected');
  assert.equal(invalidClient.state.recipePromotionHistory.length, 1);

  const needsReviewClient = makeClient();
  addStagedRecipeBundle(needsReviewClient, {
    jobId: 'recipe_ingest_job:test:needs_review',
    stagedRecipeId: 'staged_recipe:test:needs_review',
    proposedRecipeKey: 'needs_review_recipe',
    ingredients: [{ ingredient_name_en: 'Rice', proposed_ingredient_key: 'rice', matched_ingredient_id: 'ingredient:rice' }],
    steps: [{ step_number: 1, instruction_en: 'Cook rice.' }],
  });
  const needsReviewResult = await reviewAndPromoteRecipe(needsReviewClient, {
    jobId: 'recipe_ingest_job:test:needs_review',
    decision: 'needs_review',
    reason: 'Manual reviewer wants another look.',
  });
  assert.equal(needsReviewResult.decision, 'needs_review');
  assert.equal(needsReviewClient.state.recipesByKey.size, 0, 'needs_review should not promote a canonical recipe');
  assert.equal(needsReviewClient.state.recipePromotionHistory.length, 1);

  const args = parseArgs(['--job-id=recipe_ingest_job:test:promotion', '--decision=approved', '--reason=Looks good', '--json', '--out=tmp/db5c_report.json', '--limit=7']);
  assert.equal(args.jobId, 'recipe_ingest_job:test:promotion');
  assert.equal(args.decision, 'approved');
  assert.equal(args.reason, 'Looks good');
  assert.equal(args.json, true);
  assert.equal(args.out, 'tmp/db5c_report.json');
  assert.equal(args.limit, 7);

  const promotionSource = fs.readFileSync('functions/src/db/recipes/recipe_ingest_promotion_service.js', 'utf8');
  assert(!/Firestore/i.test(promotionSource), 'DB5C promotion service must not write Firestore');
  assert(!/\bLLM\b/i.test(promotionSource), 'DB5C promotion service must not call an LLM');

  const executedSql = [
    ...client.state.commands,
    ...invalidClient.state.commands,
    ...needsReviewClient.state.commands,
  ].map((command) => command.sql).join('\n');
  assert(!/INSERT INTO ingredients\b/i.test(executedSql), 'DB5C must not auto-create ingredients during promotion');
  assert(!/INSERT INTO recipe_ingest_staged_recipes\b/i.test(executedSql), 'DB5C review and promotion must not write new staged recipe bundles');

  console.log('DB5C recipe promotion tests passed');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
