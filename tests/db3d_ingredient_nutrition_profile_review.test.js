const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  getIngredientNutritionProfileCandidateDetail,
  listApprovedIngredientNutritionProfiles,
  listIngredientNutritionProfileCandidatesForReview,
  reviewIngredientNutritionProfileCandidate,
  validateProfileCandidateReviewTransition,
} = require('../app/functions/src');

function makeCandidate(overrides = {}) {
  return {
    profile_candidate_id: 'candidate:apple_raw',
    ingredient_id: 'ingredient:apple',
    mapping_id: 'mapping:apple_raw',
    cluster_id: 'cluster:apple_raw',
    representative_fdc_id: 1001,
    kcal: 52,
    protein_g: 0.26,
    fat_g: 0.17,
    carbs_g: 13.81,
    fiber_g: 2.4,
    sugar_g: 10.39,
    sodium_mg: 1,
    source_nutrients_json: { 1008: { amount: 52 } },
    review_status: 'candidate',
    generation_method: 'deterministic_approved_mapping_usda_macros_v1',
    rules_version: 'db3c_ingredient_nutrition_profiles_v1',
    ...overrides,
  };
}

function makeMapping(overrides = {}) {
  return {
    mapping_id: 'mapping:apple_raw',
    ingredient_id: 'ingredient:apple',
    cluster_id: 'cluster:apple_raw',
    representative_fdc_id: 1001,
    default_for_state: 'raw',
    mapping_type: 'default_raw',
    confidence: 0.98,
    source_version: 'fixture',
    review_status: 'approved',
    ...overrides,
  };
}

function makeClient() {
  const state = {
    candidates: [
      makeCandidate(),
      makeCandidate({
        profile_candidate_id: 'candidate:apple_raw_v2',
        mapping_id: 'mapping:apple_raw_v2',
        kcal: 53,
      }),
      makeCandidate({
        profile_candidate_id: 'candidate:rice_cooked',
        ingredient_id: 'ingredient:rice',
        mapping_id: 'mapping:rice_cooked',
        cluster_id: 'cluster:rice_cooked',
        representative_fdc_id: 2002,
        kcal: 130,
        protein_g: 2.69,
        review_status: 'needs_review',
      }),
    ],
    mappings: [
      makeMapping(),
      makeMapping({
        mapping_id: 'mapping:apple_raw_v2',
        default_for_state: 'raw',
        mapping_type: 'default_raw',
        confidence: 0.99,
      }),
      makeMapping({
        mapping_id: 'mapping:rice_cooked',
        ingredient_id: 'ingredient:rice',
        cluster_id: 'cluster:rice_cooked',
        representative_fdc_id: 2002,
        default_for_state: 'cooked',
        mapping_type: 'default_cooked',
        confidence: 0.91,
      }),
    ],
    ingredients: [
      { ingredient_id: 'ingredient:apple', ingredient_key: 'apple', name_en: 'Apple', name_bg: 'ябълка' },
      { ingredient_id: 'ingredient:rice', ingredient_key: 'rice', name_en: 'Rice', name_bg: 'ориз' },
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
      if (normalizedSql.startsWith('SELECT c.profile_candidate_id') && normalizedSql.includes('FROM ingredient_nutrition_profile_candidates c')) {
        return selectCandidateRows(state, normalizedSql, params);
      }
      if (normalizedSql.startsWith('SELECT * FROM ingredient_nutrition_profile_review_history')) {
        return { rows: state.history.filter((row) => row.source_profile_candidate_id === params[0]) };
      }
      if (normalizedSql.startsWith('SELECT p.* FROM ingredient_nutrition_profiles p')) {
        return selectProfileRows(state, normalizedSql, params);
      }
      if (normalizedSql.startsWith('SELECT * FROM ingredient_nutrition_profiles WHERE source_profile_candidate_id')) {
        return {
          rows: state.profiles.filter((profile) => (
            profile.source_profile_candidate_id === params[0] && profile.review_status === 'approved'
          )),
        };
      }
      if (normalizedSql.startsWith('SELECT * FROM ingredient_nutrition_profiles WHERE ingredient_id')) {
        const [ingredientId, mappingType, defaultForState] = params;
        return {
          rows: state.profiles
            .filter((profile) => (
              profile.ingredient_id === ingredientId
              && profile.mapping_type === mappingType
              && (profile.default_for_state || '') === (defaultForState || '')
              && profile.review_status === 'approved'
            ))
            .slice(0, 1),
        };
      }
      if (normalizedSql.startsWith('UPDATE ingredient_nutrition_profiles')) {
        const [profileId, reason] = params;
        const profile = state.profiles.find((row) => row.profile_id === profileId);
        if (profile) {
          profile.review_status = 'superseded';
          profile.review_decision = 'superseded';
          profile.review_reason = reason || profile.review_reason;
        }
        return { rows: profile ? [profile] : [] };
      }
      if (normalizedSql.startsWith('INSERT INTO ingredient_nutrition_profiles')) {
        const row = profileFromParams(params);
        state.profiles.push(row);
        return { rows: [row] };
      }
      if (normalizedSql.startsWith('UPDATE ingredient_nutrition_profile_candidates')) {
        const [status, candidateId] = params;
        const candidate = state.candidates.find((row) => row.profile_candidate_id === candidateId);
        if (candidate) candidate.review_status = status;
        return { rows: candidate ? [candidate] : [] };
      }
      if (normalizedSql.startsWith('INSERT INTO ingredient_nutrition_profile_review_history')) {
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
  if (sql.includes('WHERE c.profile_candidate_id = $1')) {
    candidates = candidates.filter((candidate) => candidate.profile_candidate_id === params[0]);
  } else if (sql.includes('c.review_status = $1')) {
    candidates = candidates.filter((candidate) => candidate.review_status === params[0]);
  }
  if (sql.includes('ILIKE')) {
    const needle = String(params.find((value) => String(value).startsWith('%')) || '').replaceAll('%', '').toLowerCase();
    candidates = candidates.filter((candidate) => [
      candidate.ingredient_id,
      candidate.ingredient_key,
      candidate.name_en,
      candidate.name_bg,
    ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }
  return { rows: candidates.slice(0, Number(params[params.length - 1]) || candidates.length) };
}

function selectProfileRows(state, sql, params) {
  let profiles = [...state.profiles];
  if (sql.includes('p.review_status = $1')) {
    profiles = profiles.filter((profile) => profile.review_status === params[0]);
  }
  if (sql.includes('ILIKE')) {
    const needle = String(params.find((value) => String(value).startsWith('%')) || '').replaceAll('%', '').toLowerCase();
    profiles = profiles.filter((profile) => String(profile.ingredient_id).toLowerCase().includes(needle));
  }
  return { rows: profiles.slice(0, Number(params[params.length - 1]) || profiles.length) };
}

function hydrateCandidate(state, candidate) {
  const mapping = state.mappings.find((row) => row.mapping_id === candidate.mapping_id);
  const ingredient = state.ingredients.find((row) => row.ingredient_id === candidate.ingredient_id) || {};
  return {
    ...candidate,
    default_for_state: mapping.default_for_state,
    mapping_type: mapping.mapping_type,
    confidence: mapping.confidence,
    source_version: mapping.source_version,
    ingredient_key: ingredient.ingredient_key,
    name_en: ingredient.name_en,
    name_bg: ingredient.name_bg,
  };
}

function profileFromParams(params) {
  const [
    profile_id,
    ingredient_id,
    mapping_id,
    cluster_id,
    representative_fdc_id,
    default_for_state,
    mapping_type,
    kcal_per_100g,
    protein_g_per_100g,
    fat_g_per_100g,
    carbs_g_per_100g,
    fiber_g_per_100g,
    sugar_g_per_100g,
    sodium_mg_per_100g,
    source_nutrients_json,
    source_profile_candidate_id,
    confidence,
    reviewed_by,
    reviewed_at,
    review_reason,
    generation_method,
    rules_version,
    source_version,
  ] = params;
  return {
    profile_id,
    ingredient_id,
    mapping_id,
    cluster_id,
    representative_fdc_id,
    default_for_state,
    mapping_type,
    kcal_per_100g,
    protein_g_per_100g,
    fat_g_per_100g,
    carbs_g_per_100g,
    fiber_g_per_100g,
    sugar_g_per_100g,
    sodium_mg_per_100g,
    source_nutrients_json: JSON.parse(source_nutrients_json || '{}'),
    source_profile_candidate_id,
    confidence,
    review_status: 'approved',
    reviewed_by,
    reviewed_at,
    review_decision: 'approved',
    review_reason,
    generation_method,
    rules_version,
    source_version,
  };
}

function historyFromParams(params) {
  const [
    review_event_id,
    source_profile_candidate_id,
    profile_id,
    superseded_profile_id,
    ingredient_id,
    mapping_id,
    cluster_id,
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
    source_profile_candidate_id,
    profile_id,
    superseded_profile_id,
    ingredient_id,
    mapping_id,
    cluster_id,
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
    path.join(__dirname, '..', 'db', 'migrations', '011_db3d_ingredient_nutrition_profiles.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS ingredient_nutrition_profiles'));
  assert(migration.includes('ingredient_nutrition_profile_review_history'));
  assert(migration.includes("review_status IN ('approved', 'rejected', 'needs_review', 'superseded')"));

  const listClient = makeClient();
  const candidates = await listIngredientNutritionProfileCandidatesForReview(listClient, {
    reviewStatus: 'candidate',
    limit: 10,
  });
  assert.deepStrictEqual(candidates.map((row) => row.profile_candidate_id), ['candidate:apple_raw', 'candidate:apple_raw_v2']);
  const filtered = await listIngredientNutritionProfileCandidatesForReview(listClient, {
    reviewStatus: 'candidate',
    ingredient: 'apple',
    limit: 10,
  });
  assert.strictEqual(filtered.length, 2);

  const detail = await getIngredientNutritionProfileCandidateDetail(listClient, {
    candidateId: 'candidate:apple_raw',
  });
  assert.strictEqual(detail.candidate.mapping_type, 'default_raw');
  assert.deepStrictEqual(detail.review_history, []);

  const approveClient = makeClient();
  const approved = await reviewIngredientNutritionProfileCandidate(approveClient, {
    candidateId: 'candidate:apple_raw',
    decision: 'approved',
    reviewedBy: 'fixture_reviewer',
    reviewReason: 'approved reviewed apple default',
    reviewedAt: '2026-04-24T10:00:00.000Z',
  });
  assert.strictEqual(approved.previous_candidate_review_status, 'candidate');
  assert.strictEqual(approved.profile.review_status, 'approved');
  assert.strictEqual(approved.profile.kcal_per_100g, 52);
  assert.strictEqual(approved.profile.default_for_state, 'raw');
  assert.strictEqual(approved.profile.mapping_type, 'default_raw');
  assert.strictEqual(approved.profile.source_profile_candidate_id, 'candidate:apple_raw');
  assert.strictEqual(approved.profile.confidence, 0.98);
  assert.strictEqual(approveClient.state.history.length, 1);
  assert.strictEqual(approveClient.state.history[0].review_decision, 'approved');

  await assert.rejects(
    () => reviewIngredientNutritionProfileCandidate(approveClient, {
      candidateId: 'candidate:apple_raw',
      decision: 'approved',
      reviewedBy: 'fixture_reviewer',
    }),
    /Approved ingredient nutrition profile already exists/,
  );
  await assert.rejects(
    () => reviewIngredientNutritionProfileCandidate(approveClient, {
      candidateId: 'candidate:apple_raw',
      decision: 'rejected',
      reviewedBy: 'fixture_reviewer',
    }),
    /Invalid ingredient nutrition profile candidate transition/,
  );

  const rejectClient = makeClient();
  const rejected = await reviewIngredientNutritionProfileCandidate(rejectClient, {
    candidateId: 'candidate:apple_raw',
    decision: 'rejected',
    reviewedBy: 'fixture_reviewer',
    reviewReason: 'not the right profile',
    reviewedAt: '2026-04-24T11:00:00.000Z',
  });
  assert.strictEqual(rejected.candidate.review_status, 'rejected');
  assert.strictEqual(rejectClient.state.profiles.length, 0);
  assert.strictEqual(rejectClient.state.history[0].review_decision, 'rejected');

  const needsReviewClient = makeClient();
  const needsReview = await reviewIngredientNutritionProfileCandidate(needsReviewClient, {
    candidateId: 'candidate:apple_raw',
    decision: 'needs_review',
    reviewedBy: 'fixture_reviewer',
    reviewReason: 'needs sodium check',
  });
  assert.strictEqual(needsReview.candidate.review_status, 'needs_review');
  assert.strictEqual(needsReviewClient.state.history[0].review_decision, 'needs_review');

  const supersedeClient = makeClient();
  await reviewIngredientNutritionProfileCandidate(supersedeClient, {
    candidateId: 'candidate:apple_raw',
    decision: 'approved',
    reviewedBy: 'fixture_reviewer',
    reviewedAt: '2026-04-24T12:00:00.000Z',
  });
  const superseding = await reviewIngredientNutritionProfileCandidate(supersedeClient, {
    candidateId: 'candidate:apple_raw_v2',
    decision: 'approved',
    reviewedBy: 'fixture_reviewer',
    reviewReason: 'newer profile candidate',
    reviewedAt: '2026-04-24T13:00:00.000Z',
  });
  assert.strictEqual(superseding.superseded_profile.review_status, 'superseded');
  assert.strictEqual(supersedeClient.state.profiles.filter((profile) => profile.review_status === 'approved').length, 1);
  assert.strictEqual(supersedeClient.state.profiles.find((profile) => profile.source_profile_candidate_id === 'candidate:apple_raw').review_status, 'superseded');
  assert.strictEqual(supersedeClient.state.history[1].superseded_profile_id, superseding.superseded_profile.profile_id);

  assert.throws(
    () => validateProfileCandidateReviewTransition('approved', 'rejected'),
    /Invalid ingredient nutrition profile candidate transition/,
  );

  const approvedProfiles = await listApprovedIngredientNutritionProfiles(supersedeClient, {
    reviewStatus: 'approved',
    limit: 10,
  });
  assert.strictEqual(approvedProfiles.length, 1);
  assert(supersedeClient.state.commands.every((command) => !/Firestore|recipe|LLM/i.test(command.sql)), 'DB3D must not write Firestore, recipes, or LLM paths');

  console.log('DB3D ingredient nutrition profile review tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
