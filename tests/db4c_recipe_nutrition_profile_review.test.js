const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  getRecipeNutritionProfileCandidateDetail,
  listApprovedRecipeNutritionProfiles,
  listRecipeNutritionProfileCandidatesForReview,
  reviewRecipeNutritionProfileCandidate,
  validateRecipeProfileCandidateReviewTransition,
} = require('../app/functions/src');
const { parseArgs, runCommand } = require('../scripts/db4c_review_recipe_nutrition_profile');

function makeCandidate(overrides = {}) {
  return {
    recipe_profile_candidate_id: 'recipe_candidate:chicken_rice_bowl',
    recipe_id: 'recipe:chicken_rice_bowl',
    total_kcal: 460,
    total_protein_g: 64.7,
    total_fat_g: 7.5,
    total_carbs_g: 28.2,
    total_fiber_g: 0.4,
    total_sugar_g: 0.1,
    total_sodium_mg: 149,
    per_serving_kcal: 230,
    per_serving_protein_g: 32.35,
    per_serving_fat_g: 3.75,
    per_serving_carbs_g: 14.1,
    per_serving_fiber_g: 0.2,
    per_serving_sugar_g: 0.05,
    per_serving_sodium_mg: 74.5,
    servings: 2,
    ingredient_count: 2,
    ingredients_with_nutrition: 2,
    ingredients_missing_nutrition: 0,
    missing_ingredient_ids_json: [],
    source_profile_ids_json: ['ingredient_profile:chicken', 'ingredient_profile:rice'],
    confidence: 'high',
    review_status: 'candidate',
    generation_method: 'deterministic_recipe_ingredient_profiles_v1',
    rules_version: 'db4b_recipe_nutrition_profiles_v1',
    ...overrides,
  };
}

function makeRecipe(overrides = {}) {
  return {
    recipe_id: 'recipe:chicken_rice_bowl',
    recipe_key: 'chicken_rice_bowl',
    title_en: 'Chicken rice bowl',
    title_bg: 'BG chicken rice bowl',
    canonical_title: 'Chicken rice bowl',
    normalized_title: 'chicken rice bowl',
    servings: 2,
    ...overrides,
  };
}

function makeClient() {
  const state = {
    recipes: [
      makeRecipe(),
      makeRecipe({
        recipe_id: 'recipe:tomato_salad',
        recipe_key: 'tomato_cucumber_salad',
        title_en: 'Tomato cucumber salad',
        title_bg: 'BG tomato cucumber salad',
        canonical_title: 'Tomato cucumber salad',
        normalized_title: 'tomato cucumber salad',
        servings: 1,
      }),
    ],
    candidates: [
      makeCandidate(),
      makeCandidate({
        recipe_profile_candidate_id: 'recipe_candidate:chicken_rice_bowl_v2',
        total_kcal: 470,
        per_serving_kcal: 235,
        source_profile_ids_json: ['ingredient_profile:chicken_v2', 'ingredient_profile:rice'],
      }),
      makeCandidate({
        recipe_profile_candidate_id: 'recipe_candidate:tomato_salad',
        recipe_id: 'recipe:tomato_salad',
        total_kcal: 18,
        total_protein_g: 0.9,
        total_fat_g: 0.2,
        total_carbs_g: 3.9,
        total_fiber_g: 1.2,
        total_sugar_g: 2.6,
        total_sodium_mg: 5,
        per_serving_kcal: 18,
        per_serving_protein_g: 0.9,
        per_serving_fat_g: 0.2,
        per_serving_carbs_g: 3.9,
        per_serving_fiber_g: 1.2,
        per_serving_sugar_g: 2.6,
        per_serving_sodium_mg: 5,
        servings: 1,
        ingredient_count: 2,
        ingredients_with_nutrition: 1,
        ingredients_missing_nutrition: 1,
        missing_ingredient_ids_json: ['ingredient:cucumber'],
        source_profile_ids_json: ['ingredient_profile:tomato'],
        confidence: 'low',
        review_status: 'needs_review',
      }),
    ],
    ingredients: [
      { ingredient_id: 'ingredient:chicken_breast', ingredient_key: 'chicken_breast', name_en: 'Chicken breast', name_bg: 'BG chicken breast' },
      { ingredient_id: 'ingredient:rice', ingredient_key: 'rice', name_en: 'Rice', name_bg: 'BG rice' },
      { ingredient_id: 'ingredient:tomato', ingredient_key: 'tomato', name_en: 'Tomato', name_bg: 'BG tomato' },
      { ingredient_id: 'ingredient:cucumber', ingredient_key: 'cucumber', name_en: 'Cucumber', name_bg: 'BG cucumber' },
    ],
    recipeIngredients: [
      { recipe_ingredient_id: 'ri:chicken', recipe_id: 'recipe:chicken_rice_bowl', ingredient_id: 'ingredient:chicken_breast', display_name: 'chicken breast', quantity_grams: 200, sort_order: 1 },
      { recipe_ingredient_id: 'ri:rice', recipe_id: 'recipe:chicken_rice_bowl', ingredient_id: 'ingredient:rice', display_name: 'rice', quantity_grams: 100, sort_order: 2 },
      { recipe_ingredient_id: 'ri:tomato', recipe_id: 'recipe:tomato_salad', ingredient_id: 'ingredient:tomato', display_name: 'tomato', quantity_grams: 100, sort_order: 1 },
      { recipe_ingredient_id: 'ri:cucumber', recipe_id: 'recipe:tomato_salad', ingredient_id: 'ingredient:cucumber', display_name: 'cucumber', quantity_grams: 100, sort_order: 2 },
    ],
    profiles: [],
    history: [],
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
      if (normalizedSql.startsWith('SELECT c.recipe_profile_candidate_id') && normalizedSql.includes('FROM recipe_nutrition_profile_candidates c')) {
        return selectCandidateRows(state, normalizedSql, params);
      }
      if (normalizedSql.startsWith('SELECT ri.*')) {
        return selectIngredientRows(state, params);
      }
      if (normalizedSql.startsWith('SELECT * FROM recipe_nutrition_profile_review_history')) {
        return { rows: state.history.filter((row) => row.source_recipe_profile_candidate_id === params[0]) };
      }
      if (normalizedSql.startsWith('SELECT p.* FROM recipe_nutrition_profiles p')) {
        return selectProfileRows(state, normalizedSql, params);
      }
      if (normalizedSql.startsWith('SELECT * FROM recipe_nutrition_profiles WHERE source_recipe_profile_candidate_id')) {
        return {
          rows: state.profiles.filter((profile) => profile.source_recipe_profile_candidate_id === params[0]),
        };
      }
      if (normalizedSql.startsWith('SELECT * FROM recipe_nutrition_profiles WHERE recipe_id')) {
        return {
          rows: state.profiles
            .filter((profile) => profile.recipe_id === params[0] && profile.review_status === 'approved')
            .slice(0, 1),
        };
      }
      if (normalizedSql.startsWith('UPDATE recipe_nutrition_profiles')) {
        const [profileId, reason] = params;
        const profile = state.profiles.find((row) => row.recipe_profile_id === profileId);
        if (profile) {
          profile.review_status = 'superseded';
          profile.review_decision = 'superseded';
          profile.review_reason = reason || profile.review_reason;
        }
        return { rows: profile ? [profile] : [] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_nutrition_profiles')) {
        const row = profileFromParams(params);
        state.profiles.push(row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('UPDATE recipe_nutrition_profile_candidates')) {
        const [status, candidateId] = params;
        const candidate = state.candidates.find((row) => row.recipe_profile_candidate_id === candidateId);
        if (candidate) candidate.review_status = status;
        return { rows: candidate ? [candidate] : [] };
      }
      if (normalizedSql.startsWith('INSERT INTO recipe_nutrition_profile_review_history')) {
        const row = historyFromParams(params);
        state.history.push(row);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function selectCandidateRows(state, sql, params) {
  let candidates = state.candidates.map((candidate) => hydrateCandidate(state, candidate));
  if (sql.includes('WHERE c.recipe_profile_candidate_id = $1')) {
    candidates = candidates.filter((candidate) => candidate.recipe_profile_candidate_id === params[0]);
  } else if (sql.includes('c.review_status = $1')) {
    candidates = candidates.filter((candidate) => candidate.review_status === params[0]);
  }
  if (sql.includes('ILIKE')) {
    const needle = String(params.find((value) => String(value).startsWith('%')) || '').replaceAll('%', '').toLowerCase();
    candidates = candidates.filter((candidate) => [
      candidate.recipe_id,
      candidate.recipe_key,
      candidate.title_en,
      candidate.title_bg,
      candidate.normalized_title,
    ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }
  return { rows: candidates.slice(0, Number(params[params.length - 1]) || candidates.length) };
}

function selectIngredientRows(state, params) {
  const [recipeId, candidateId] = params;
  const candidate = state.candidates.find((row) => row.recipe_profile_candidate_id === candidateId);
  const missing = new Set(candidate ? candidate.missing_ingredient_ids_json : []);
  return {
    rows: state.recipeIngredients
      .filter((line) => line.recipe_id === recipeId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((line) => {
        const ingredient = state.ingredients.find((row) => row.ingredient_id === line.ingredient_id) || {};
        return {
          ...line,
          ingredient_key: ingredient.ingredient_key,
          ingredient_name_en: ingredient.name_en,
          ingredient_name_bg: ingredient.name_bg,
          missing_nutrition: missing.has(line.ingredient_id),
        };
      }),
  };
}

function selectProfileRows(state, sql, params) {
  let profiles = [...state.profiles];
  if (sql.includes('p.review_status = $1')) {
    profiles = profiles.filter((profile) => profile.review_status === params[0]);
  }
  if (sql.includes('ILIKE')) {
    const needle = String(params.find((value) => String(value).startsWith('%')) || '').replaceAll('%', '').toLowerCase();
    profiles = profiles.filter((profile) => {
      const recipe = state.recipes.find((row) => row.recipe_id === profile.recipe_id) || {};
      return [profile.recipe_id, recipe.recipe_key, recipe.title_en, recipe.title_bg]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }
  return { rows: profiles.slice(0, Number(params[params.length - 1]) || profiles.length) };
}

function hydrateCandidate(state, candidate) {
  const recipe = state.recipes.find((row) => row.recipe_id === candidate.recipe_id) || {};
  return {
    ...candidate,
    recipe_key: recipe.recipe_key,
    title_en: recipe.title_en,
    title_bg: recipe.title_bg,
    canonical_title: recipe.canonical_title,
    normalized_title: recipe.normalized_title,
    recipe_servings: recipe.servings,
  };
}

function profileFromParams(params) {
  const [
    recipe_profile_id,
    recipe_id,
    total_kcal,
    total_protein_g,
    total_fat_g,
    total_carbs_g,
    total_fiber_g,
    total_sugar_g,
    total_sodium_mg,
    per_serving_kcal,
    per_serving_protein_g,
    per_serving_fat_g,
    per_serving_carbs_g,
    per_serving_fiber_g,
    per_serving_sugar_g,
    per_serving_sodium_mg,
    servings,
    ingredient_count,
    ingredients_with_nutrition,
    ingredients_missing_nutrition,
    missing_ingredient_ids_json,
    source_profile_ids_json,
    source_recipe_profile_candidate_id,
    confidence,
    reviewed_by,
    reviewed_at,
    review_reason,
    generation_method,
    rules_version,
  ] = params;
  return {
    recipe_profile_id,
    recipe_id,
    total_kcal,
    total_protein_g,
    total_fat_g,
    total_carbs_g,
    total_fiber_g,
    total_sugar_g,
    total_sodium_mg,
    per_serving_kcal,
    per_serving_protein_g,
    per_serving_fat_g,
    per_serving_carbs_g,
    per_serving_fiber_g,
    per_serving_sugar_g,
    per_serving_sodium_mg,
    servings,
    ingredient_count,
    ingredients_with_nutrition,
    ingredients_missing_nutrition,
    missing_ingredient_ids_json: JSON.parse(missing_ingredient_ids_json || '[]'),
    source_profile_ids_json: JSON.parse(source_profile_ids_json || '[]'),
    source_recipe_profile_candidate_id,
    confidence,
    review_status: 'approved',
    reviewed_by,
    reviewed_at,
    review_decision: 'approved',
    review_reason,
    generation_method,
    rules_version,
  };
}

function historyFromParams(params) {
  const [
    review_event_id,
    source_recipe_profile_candidate_id,
    recipe_profile_id,
    superseded_recipe_profile_id,
    recipe_id,
    previous_candidate_review_status,
    previous_profile_review_status,
    review_decision,
    reviewed_by,
    reviewed_at,
    review_reason,
    review_note,
  ] = params;
  return {
    review_event_id,
    source_recipe_profile_candidate_id,
    recipe_profile_id,
    superseded_recipe_profile_id,
    recipe_id,
    previous_candidate_review_status,
    previous_profile_review_status,
    review_decision,
    reviewed_by,
    reviewed_at,
    review_reason,
    review_note,
  };
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '014_db4c_recipe_nutrition_profiles.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS recipe_nutrition_profiles'));
  assert(migration.includes('recipe_nutrition_profile_review_history'));
  assert(migration.includes("review_status IN ('approved', 'rejected', 'needs_review', 'superseded')"));
  assert(migration.includes('source_recipe_profile_candidate_id'));
  assert(!migration.includes('fdc_id'), 'approved recipe nutrition must not directly map USDA FDC ids');

  const listClient = makeClient();
  const candidates = await listRecipeNutritionProfileCandidatesForReview(listClient, {
    reviewStatus: 'candidate',
    limit: 10,
  });
  assert.deepStrictEqual(candidates.map((row) => row.recipe_profile_candidate_id), [
    'recipe_candidate:chicken_rice_bowl',
    'recipe_candidate:chicken_rice_bowl_v2',
  ]);
  const filtered = await listRecipeNutritionProfileCandidatesForReview(listClient, {
    reviewStatus: 'candidate',
    recipe: 'chicken',
    limit: 10,
  });
  assert.strictEqual(filtered.length, 2);

  const detail = await getRecipeNutritionProfileCandidateDetail(listClient, {
    candidateId: 'recipe_candidate:tomato_salad',
  });
  assert.strictEqual(detail.recipe.recipe_key, 'tomato_cucumber_salad');
  assert.strictEqual(detail.candidate.confidence, 'low');
  assert.strictEqual(detail.ingredients.length, 2);
  assert.strictEqual(detail.ingredients[1].missing_nutrition, true);
  assert.deepStrictEqual(detail.missing_nutrition_ingredient_ids, ['ingredient:cucumber']);
  assert.deepStrictEqual(detail.review_history, []);

  const approveClient = makeClient();
  const approved = await reviewRecipeNutritionProfileCandidate(approveClient, {
    candidateId: 'recipe_candidate:chicken_rice_bowl',
    decision: 'approved',
    reviewedBy: 'fixture_reviewer',
    reviewReason: 'approved reviewed recipe profile',
    reviewedAt: '2026-04-24T10:00:00.000Z',
  });
  assert.strictEqual(approved.previous_candidate_review_status, 'candidate');
  assert.strictEqual(approved.profile.review_status, 'approved');
  assert.strictEqual(approved.profile.recipe_id, 'recipe:chicken_rice_bowl');
  assert.strictEqual(approved.profile.total_kcal, 460);
  assert.strictEqual(approved.profile.per_serving_kcal, 230);
  assert.strictEqual(approved.profile.source_recipe_profile_candidate_id, 'recipe_candidate:chicken_rice_bowl');
  assert.deepStrictEqual(approved.profile.source_profile_ids_json, ['ingredient_profile:chicken', 'ingredient_profile:rice']);
  assert.strictEqual(approveClient.state.history.length, 1);
  assert.strictEqual(approveClient.state.history[0].review_decision, 'approved');

  await assert.rejects(
    () => reviewRecipeNutritionProfileCandidate(approveClient, {
      candidateId: 'recipe_candidate:chicken_rice_bowl',
      decision: 'approved',
      reviewedBy: 'fixture_reviewer',
    }),
    /Approved recipe nutrition profile already exists/,
  );
  await assert.rejects(
    () => reviewRecipeNutritionProfileCandidate(approveClient, {
      candidateId: 'recipe_candidate:chicken_rice_bowl',
      decision: 'rejected',
      reviewedBy: 'fixture_reviewer',
    }),
    /Invalid recipe nutrition profile candidate transition/,
  );

  const rejectClient = makeClient();
  const rejected = await reviewRecipeNutritionProfileCandidate(rejectClient, {
    candidateId: 'recipe_candidate:chicken_rice_bowl',
    decision: 'rejected',
    reviewedBy: 'fixture_reviewer',
    reviewReason: 'recipe grams need correction',
    reviewedAt: '2026-04-24T11:00:00.000Z',
  });
  assert.strictEqual(rejected.candidate.review_status, 'rejected');
  assert.strictEqual(rejectClient.state.profiles.length, 0);
  assert.strictEqual(rejectClient.state.history[0].review_decision, 'rejected');

  const needsReviewClient = makeClient();
  const needsReview = await reviewRecipeNutritionProfileCandidate(needsReviewClient, {
    candidateId: 'recipe_candidate:chicken_rice_bowl',
    decision: 'needs_review',
    reviewedBy: 'fixture_reviewer',
    reviewReason: 'needs serving-size check',
  });
  assert.strictEqual(needsReview.candidate.review_status, 'needs_review');
  assert.strictEqual(needsReviewClient.state.history[0].review_decision, 'needs_review');

  const supersedeClient = makeClient();
  await reviewRecipeNutritionProfileCandidate(supersedeClient, {
    candidateId: 'recipe_candidate:chicken_rice_bowl',
    decision: 'approved',
    reviewedBy: 'fixture_reviewer',
    reviewedAt: '2026-04-24T12:00:00.000Z',
  });
  const superseding = await reviewRecipeNutritionProfileCandidate(supersedeClient, {
    candidateId: 'recipe_candidate:chicken_rice_bowl_v2',
    decision: 'approved',
    reviewedBy: 'fixture_reviewer',
    reviewReason: 'newer recipe profile candidate',
    reviewedAt: '2026-04-24T13:00:00.000Z',
  });
  assert.strictEqual(superseding.superseded_profile.review_status, 'superseded');
  assert.strictEqual(supersedeClient.state.profiles.filter((profile) => profile.review_status === 'approved').length, 1);
  assert.strictEqual(supersedeClient.state.profiles.find((profile) => profile.source_recipe_profile_candidate_id === 'recipe_candidate:chicken_rice_bowl').review_status, 'superseded');
  assert.strictEqual(supersedeClient.state.history[1].superseded_recipe_profile_id, superseding.superseded_profile.recipe_profile_id);

  assert.throws(
    () => validateRecipeProfileCandidateReviewTransition('approved', 'rejected'),
    /Invalid recipe nutrition profile candidate transition/,
  );

  const approvedProfiles = await listApprovedRecipeNutritionProfiles(supersedeClient, {
    reviewStatus: 'approved',
    limit: 10,
  });
  assert.strictEqual(approvedProfiles.length, 1);

  const commandClient = makeClient();
  const listReport = await runCommand(commandClient, { reviewStatus: 'candidate', limit: 5 });
  assert.strictEqual(listReport.action, 'list_candidates');
  const showReport = await runCommand(commandClient, { candidateId: 'recipe_candidate:tomato_salad' });
  assert.strictEqual(showReport.action, 'show_candidate');
  assert.deepStrictEqual(parseArgs([
    '--candidate-id=recipe_candidate:chicken_rice_bowl',
    '--recipe=chicken',
    '--review-status=candidate',
    '--decision=approved',
    '--reason=looks good',
    '--reviewed-by=fixture',
    '--json',
    '--out=tmp/db4c.json',
    '--limit=5',
  ]), {
    candidateId: 'recipe_candidate:chicken_rice_bowl',
    recipe: 'chicken',
    reviewStatus: 'candidate',
    decision: 'approved',
    reviewReason: 'looks good',
    reviewedBy: 'fixture',
    limit: 5,
    json: true,
    out: 'tmp/db4c.json',
    listApproved: false,
  });

  const unsafeSql = [
    ...listClient.state.commands,
    ...approveClient.state.commands,
    ...rejectClient.state.commands,
    ...needsReviewClient.state.commands,
    ...supersedeClient.state.commands,
    ...commandClient.state.commands,
  ].map((command) => command.sql).join('\n');
  assert(!/Firestore|LLM|OpenAI/i.test(unsafeSql), 'DB4C must not call Firestore or LLM paths');

  console.log('DB4C recipe nutrition profile review tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
