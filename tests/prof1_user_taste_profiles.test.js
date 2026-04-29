const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildUserTasteProfileSnapshot,
  buildUserTasteProfileSnapshots,
  classifyTasteProfileConfidence,
  listUserTasteProfileSignalSources,
  listUserTasteProfileSnapshots,
} = require('../app/functions/src');
const { parseArgs } = require('../scripts/prof1_build_user_taste_profiles');

function makeClient() {
  const state = {
    profilesById: new Map(),
    profilesByUserId: new Map(),
    preferencesById: new Map(),
    constraintsById: new Map(),
    recipesById: new Map(),
    feedbackEventsById: new Map(),
    noteSignalsById: new Map(),
    promotionHistory: [],
    stagedRecipesById: new Map(),
    stagedMethodsById: new Map(),
    tasteSnapshotsById: new Map(),
    tasteSignalSourcesById: new Map(),
    commands: [],
  };

  seedProfiles(state);
  seedRecipesAndMetadata(state);
  seedPreferencesAndConstraints(state);
  seedFeedback(state);

  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });

      if (normalizedSql === 'SELECT * FROM user_food_profiles WHERE profile_id = $1') {
        const row = state.profilesById.get(params[0]);
        return { rows: row ? [row] : [] };
      }

      if (normalizedSql === 'SELECT * FROM user_food_profiles WHERE user_id = $1') {
        const row = state.profilesByUserId.get(params[0]);
        return { rows: row ? [row] : [] };
      }

      if (normalizedSql === 'SELECT * FROM user_food_profiles ORDER BY profile_id ASC LIMIT $1') {
        return {
          rows: [...state.profilesById.values()]
            .sort((left, right) => left.profile_id.localeCompare(right.profile_id))
            .slice(0, Number(params[0])),
        };
      }

      if (normalizedSql.startsWith('SELECT * FROM user_food_preferences')) {
        return {
          rows: [...state.preferencesById.values()]
            .filter((row) => row.profile_id === params[0])
            .sort((left, right) => (
              left.preference_type.localeCompare(right.preference_type)
              || right.preference_score - left.preference_score
              || left.preference_key.localeCompare(right.preference_key)
            )),
        };
      }

      if (normalizedSql.startsWith('SELECT * FROM user_food_constraints')) {
        return {
          rows: [...state.constraintsById.values()]
            .filter((row) => row.profile_id === params[0])
            .sort((left, right) => (
              left.constraint_type.localeCompare(right.constraint_type)
              || left.target_type.localeCompare(right.target_type)
              || left.target_key.localeCompare(right.target_key)
            )),
        };
      }

      if (normalizedSql.startsWith('SELECT e.*, r.recipe_key, r.cuisine_tags_json, r.dietary_tags_json, r.meal_type_tags_json FROM recipe_feedback_events e LEFT JOIN recipes r')) {
        const rows = [...state.feedbackEventsById.values()]
          .filter((row) => row.profile_id === params[0])
          .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)) || left.feedback_id.localeCompare(right.feedback_id))
          .map((row) => ({
            ...row,
            recipe_key: state.recipesById.get(row.recipe_id)?.recipe_key || null,
            cuisine_tags_json: state.recipesById.get(row.recipe_id)?.cuisine_tags_json || [],
            dietary_tags_json: state.recipesById.get(row.recipe_id)?.dietary_tags_json || [],
            meal_type_tags_json: state.recipesById.get(row.recipe_id)?.meal_type_tags_json || [],
          }));
        return { rows };
      }

      if (normalizedSql.startsWith('SELECT s.*, e.recipe_id, e.recipe_key_snapshot, e.event_type FROM recipe_feedback_note_signals s JOIN recipe_feedback_events e')) {
        const rows = [...state.noteSignalsById.values()]
          .filter((row) => row.profile_id === params[0])
          .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)) || left.signal_id.localeCompare(right.signal_id))
          .map((row) => ({
            ...row,
            recipe_id: state.feedbackEventsById.get(row.feedback_id)?.recipe_id || null,
            recipe_key_snapshot: state.feedbackEventsById.get(row.feedback_id)?.recipe_key_snapshot || null,
            event_type: state.feedbackEventsById.get(row.feedback_id)?.event_type || null,
          }));
        return { rows };
      }

      if (normalizedSql.startsWith('SELECT ph.recipe_id, ph.staged_recipe_id, ph.created_at, ph.id AS promotion_history_id, sr.region_tags_json, sr.feeling_tags_json, sr.flavor_profile_json, sr.texture_profile_json FROM recipe_promotion_history ph JOIN recipe_ingest_staged_recipes sr')) {
        const recipeIds = params[0] || [];
        const rows = state.promotionHistory
          .filter((row) => row.decision === 'approved' && recipeIds.includes(row.recipe_id))
          .sort((left, right) => left.recipe_id.localeCompare(right.recipe_id) || String(right.created_at).localeCompare(String(left.created_at)) || right.id.localeCompare(left.id))
          .map((row) => ({
            recipe_id: row.recipe_id,
            staged_recipe_id: row.staged_recipe_id,
            created_at: row.created_at,
            promotion_history_id: row.id,
            ...state.stagedRecipesById.get(row.staged_recipe_id),
          }));
        return { rows };
      }

      if (normalizedSql.startsWith('SELECT * FROM recipe_ingest_staged_methods WHERE staged_recipe_id = ANY($1::text[])')) {
        const stagedRecipeIds = params[0] || [];
        return {
          rows: [...state.stagedMethodsById.values()]
            .filter((row) => stagedRecipeIds.includes(row.staged_recipe_id))
            .sort((left, right) => left.staged_recipe_id.localeCompare(right.staged_recipe_id) || left.method_key.localeCompare(right.method_key) || left.staged_recipe_method_id.localeCompare(right.staged_recipe_method_id)),
        };
      }

      if (normalizedSql.startsWith('SELECT COALESCE(MAX(snapshot_version), 0) AS current_version FROM user_taste_profile_snapshots')) {
        const profileId = params[0];
        const currentVersion = [...state.tasteSnapshotsById.values()]
          .filter((row) => row.profile_id === profileId)
          .reduce((max, row) => Math.max(max, Number(row.snapshot_version || 0)), 0);
        return { rows: [{ current_version: String(currentVersion) }] };
      }

      if (normalizedSql.startsWith('INSERT INTO user_taste_profile_snapshots')) {
        const row = snapshotFromParams(params);
        row.created_at = '2026-04-25T14:00:00.000Z';
        state.tasteSnapshotsById.set(row.snapshot_id, row);
        return { rows: [row] };
      }

      if (normalizedSql.startsWith('INSERT INTO user_taste_profile_signal_sources')) {
        const row = signalSourceFromParams(params);
        row.created_at = '2026-04-25T14:00:00.000Z';
        state.tasteSignalSourcesById.set(row.source_id, row);
        return { rows: [row] };
      }

      if (normalizedSql.startsWith('SELECT * FROM user_taste_profile_snapshots WHERE profile_id = $1 ORDER BY snapshot_version DESC')) {
        return {
          rows: [...state.tasteSnapshotsById.values()]
            .filter((row) => row.profile_id === params[0])
            .sort((left, right) => Number(right.snapshot_version) - Number(left.snapshot_version) || String(right.created_at).localeCompare(String(left.created_at)))
            .slice(0, Number(params[1])),
        };
      }

      if (normalizedSql.startsWith('SELECT * FROM user_taste_profile_signal_sources WHERE snapshot_id = $1 ORDER BY created_at ASC')) {
        return {
          rows: [...state.tasteSignalSourcesById.values()]
            .filter((row) => row.snapshot_id === params[0])
            .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)) || left.source_id.localeCompare(right.source_id)),
        };
      }

      if (normalizedSql.startsWith('SELECT * FROM user_taste_profile_signal_sources WHERE profile_id = $1 ORDER BY created_at DESC')) {
        return {
          rows: [...state.tasteSignalSourcesById.values()]
            .filter((row) => row.profile_id === params[0])
            .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)) || right.source_id.localeCompare(left.source_id))
            .slice(0, Number(params[1])),
        };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function seedProfiles(state) {
  for (const profile of [
    {
      profile_id: 'user_food_profile:user_family_cozy',
      user_id: 'user_family_cozy',
      household_size: 4,
      default_servings: 4,
      weekly_budget_amount: 120,
      weekly_budget_currency: 'EUR',
      preferred_language: 'en',
      max_prep_time_minutes: 30,
      max_total_time_minutes: 60,
    },
    {
      profile_id: 'user_food_profile:user_balanced_medium',
      user_id: 'user_balanced_medium',
      household_size: 2,
      default_servings: 2,
      weekly_budget_amount: 95,
      weekly_budget_currency: 'EUR',
      preferred_language: 'en',
      max_prep_time_minutes: 25,
      max_total_time_minutes: 45,
    },
    {
      profile_id: 'user_food_profile:user_power_high',
      user_id: 'user_power_high',
      household_size: 1,
      default_servings: 1,
      weekly_budget_amount: 80,
      weekly_budget_currency: 'EUR',
      preferred_language: 'en',
      max_prep_time_minutes: 20,
      max_total_time_minutes: 40,
    },
  ]) {
    state.profilesById.set(profile.profile_id, profile);
    state.profilesByUserId.set(profile.user_id, profile);
  }
}

function seedRecipesAndMetadata(state) {
  for (const recipe of [
    {
      recipe_id: 'recipe:chicken_rice_bowl',
      recipe_key: 'chicken_rice_bowl',
      cuisine_tags_json: ['home_style'],
      dietary_tags_json: ['high_protein'],
      meal_type_tags_json: ['dinner'],
    },
    {
      recipe_id: 'recipe:tomato_cucumber_salad',
      recipe_key: 'tomato_cucumber_salad',
      cuisine_tags_json: ['bulgarian'],
      dietary_tags_json: ['vegetarian'],
      meal_type_tags_json: ['side'],
    },
    {
      recipe_id: 'recipe:spicy_pork_stew',
      recipe_key: 'spicy_pork_stew',
      cuisine_tags_json: ['home_style'],
      dietary_tags_json: [],
      meal_type_tags_json: ['dinner'],
    },
  ]) {
    state.recipesById.set(recipe.recipe_id, recipe);
  }

  const stagedRecipes = [
    {
      staged_recipe_id: 'staged_recipe:chicken_rice_bowl',
      region_tags_json: ['balkan'],
      feeling_tags_json: ['cozy', 'filling'],
      flavor_profile_json: { primary: ['savory', 'fresh'], intensity: 'medium' },
      texture_profile_json: { primary: ['tender', 'soft'] },
    },
    {
      staged_recipe_id: 'staged_recipe:tomato_cucumber_salad',
      region_tags_json: ['balkan'],
      feeling_tags_json: ['refreshing', 'light'],
      flavor_profile_json: { primary: ['fresh', 'mild'] },
      texture_profile_json: { primary: ['crisp', 'juicy'] },
    },
    {
      staged_recipe_id: 'staged_recipe:spicy_pork_stew',
      region_tags_json: ['balkan'],
      feeling_tags_json: ['bold', 'hearty'],
      flavor_profile_json: { primary: ['spicy', 'smoky'], intensity: 'high' },
      texture_profile_json: { primary: ['tender', 'brothy'] },
    },
  ];
  for (const row of stagedRecipes) {
    state.stagedRecipesById.set(row.staged_recipe_id, row);
  }

  for (const method of [
    { staged_recipe_method_id: 'method:001', staged_recipe_id: 'staged_recipe:chicken_rice_bowl', method_key: 'searing', extraction_json: {} },
    { staged_recipe_method_id: 'method:002', staged_recipe_id: 'staged_recipe:chicken_rice_bowl', method_key: 'boiling', extraction_json: {} },
    { staged_recipe_method_id: 'method:003', staged_recipe_id: 'staged_recipe:tomato_cucumber_salad', method_key: 'chopping', extraction_json: {} },
    { staged_recipe_method_id: 'method:004', staged_recipe_id: 'staged_recipe:spicy_pork_stew', method_key: 'simmering', extraction_json: {} },
  ]) {
    state.stagedMethodsById.set(method.staged_recipe_method_id, method);
  }

  state.promotionHistory.push(
    { id: 'promotion:001', recipe_id: 'recipe:chicken_rice_bowl', staged_recipe_id: 'staged_recipe:chicken_rice_bowl', decision: 'approved', created_at: '2026-04-25T13:00:00.000Z' },
    { id: 'promotion:002', recipe_id: 'recipe:tomato_cucumber_salad', staged_recipe_id: 'staged_recipe:tomato_cucumber_salad', decision: 'approved', created_at: '2026-04-25T13:01:00.000Z' },
    { id: 'promotion:003', recipe_id: 'recipe:spicy_pork_stew', staged_recipe_id: 'staged_recipe:spicy_pork_stew', decision: 'approved', created_at: '2026-04-25T13:02:00.000Z' },
  );
}

function seedPreferencesAndConstraints(state) {
  const preferences = [
    { preference_id: 'pref:001', profile_id: 'user_food_profile:user_family_cozy', preference_type: 'flavor', preference_key: 'savory', preference_score: 0.9, source: 'explicit', confidence: 1 },
    { preference_id: 'pref:002', profile_id: 'user_food_profile:user_family_cozy', preference_type: 'feeling', preference_key: 'cozy', preference_score: 0.85, source: 'explicit', confidence: 0.9 },
    { preference_id: 'pref:003', profile_id: 'user_food_profile:user_family_cozy', preference_type: 'cuisine', preference_key: 'bulgarian', preference_score: 0.6, source: 'explicit', confidence: 0.8 },
    { preference_id: 'pref:004', profile_id: 'user_food_profile:user_balanced_medium', preference_type: 'flavor', preference_key: 'fresh', preference_score: 0.7, source: 'explicit', confidence: 0.9 },
    { preference_id: 'pref:005', profile_id: 'user_food_profile:user_power_high', preference_type: 'flavor', preference_key: 'savory', preference_score: 0.75, source: 'explicit', confidence: 1 },
  ];
  for (const row of preferences) {
    state.preferencesById.set(row.preference_id, row);
  }

  const constraints = [
    { constraint_id: 'constraint:001', profile_id: 'user_food_profile:user_family_cozy', constraint_type: 'avoid', target_type: 'tag', target_key: 'spicy', severity: 'soft' },
    { constraint_id: 'constraint:002', profile_id: 'user_food_profile:user_family_cozy', constraint_type: 'required', target_type: 'tag', target_key: 'high_protein', severity: 'hard' },
  ];
  for (const row of constraints) {
    state.constraintsById.set(row.constraint_id, row);
  }
}

function seedFeedback(state) {
  const profileOneEvents = [
    buildEvent('feedback:001', 'user_food_profile:user_family_cozy', 'user_family_cozy', 'recipe:chicken_rice_bowl', 'chicken_rice_bowl', 'swipe_up', 1, 1, '2026-04-25T12:00:00.000Z'),
    buildEvent('feedback:002', 'user_food_profile:user_family_cozy', 'user_family_cozy', 'recipe:chicken_rice_bowl', 'chicken_rice_bowl', 'saved', 0.8, 0.9, '2026-04-25T12:01:00.000Z'),
    buildEvent('feedback:003', 'user_food_profile:user_family_cozy', 'user_family_cozy', 'recipe:spicy_pork_stew', 'spicy_pork_stew', 'swipe_left', -1, 0, '2026-04-25T12:02:00.000Z'),
    buildEvent('feedback:004', 'user_food_profile:user_family_cozy', 'user_family_cozy', 'recipe:tomato_cucumber_salad', 'tomato_cucumber_salad', 'impression', 0, 0, '2026-04-25T12:03:00.000Z'),
  ];
  const profileTwoEvents = Array.from({ length: 5 }, (_, index) => buildEvent(
    `feedback:100${index}`,
    'user_food_profile:user_balanced_medium',
    'user_balanced_medium',
    'recipe:tomato_cucumber_salad',
    'tomato_cucumber_salad',
    'swipe_right',
    0.5,
    0.6,
    `2026-04-25T12:1${index}:00.000Z`,
  ));
  const profileThreeEvents = Array.from({ length: 21 }, (_, index) => buildEvent(
    `feedback:200${String(index).padStart(2, '0')}`,
    'user_food_profile:user_power_high',
    'user_power_high',
    'recipe:chicken_rice_bowl',
    'chicken_rice_bowl',
    'cooked_again',
    1,
    1,
    `2026-04-25T13:${String(index).padStart(2, '0')}:00.000Z`,
  ));

  for (const row of [...profileOneEvents, ...profileTwoEvents, ...profileThreeEvents]) {
    state.feedbackEventsById.set(row.feedback_id, row);
  }

  const noteSignals = [
    {
      signal_id: 'signal:001',
      feedback_id: 'feedback:001',
      profile_id: 'user_food_profile:user_family_cozy',
      recipe_id: 'recipe:chicken_rice_bowl',
      signal_type: 'taste',
      signal_key: 'savory',
      signal_value: 'loved the savory flavor',
      polarity: 'positive',
      confidence: 0.95,
      extraction_method: 'manual_tag',
      extraction_json: {},
      created_at: '2026-04-25T12:04:00.000Z',
    },
    {
      signal_id: 'signal:002',
      feedback_id: 'feedback:003',
      profile_id: 'user_food_profile:user_family_cozy',
      recipe_id: 'recipe:spicy_pork_stew',
      signal_type: 'texture',
      signal_key: 'mushy',
      signal_value: 'texture felt mushy',
      polarity: 'negative',
      confidence: 0.9,
      extraction_method: 'manual_tag',
      extraction_json: {},
      created_at: '2026-04-25T12:05:00.000Z',
    },
    {
      signal_id: 'signal:003',
      feedback_id: 'feedback:002',
      profile_id: 'user_food_profile:user_family_cozy',
      recipe_id: 'recipe:chicken_rice_bowl',
      signal_type: 'family_response',
      signal_key: 'kids_loved_it',
      signal_value: 'kids loved it',
      polarity: 'positive',
      confidence: 0.8,
      extraction_method: 'manual_tag',
      extraction_json: {},
      created_at: '2026-04-25T12:06:00.000Z',
    },
  ];
  for (const row of noteSignals) {
    state.noteSignalsById.set(row.signal_id, row);
  }
}

function buildEvent(feedbackId, profileId, userId, recipeId, recipeKey, eventType, sentimentScore, intentScore, createdAt) {
  return {
    feedback_id: feedbackId,
    profile_id: profileId,
    user_id: userId,
    recipe_id: recipeId,
    recipe_key_snapshot: recipeKey,
    event_type: eventType,
    sentiment_score: sentimentScore,
    intent_score: intentScore,
    reason_tags_json: [],
    note_text: null,
    note_language: 'en',
    source: 'swipe',
    context_json: {},
    created_at: createdAt,
  };
}

function snapshotFromParams(params) {
  const columns = [
    'snapshot_id',
    'profile_id',
    'user_id',
    'snapshot_version',
    'source_event_count',
    'source_recipe_count',
    'flavor_vector_json',
    'texture_vector_json',
    'cuisine_vector_json',
    'region_vector_json',
    'feeling_vector_json',
    'meal_type_vector_json',
    'cooking_method_vector_json',
    'dietary_pattern_json',
    'disliked_patterns_json',
    'preferred_constraints_json',
    'confidence_json',
    'generation_method',
    'rules_version',
  ];
  const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
  for (const key of columns.filter((column) => column.endsWith('_json'))) {
    row[key] = JSON.parse(row[key]);
  }
  return row;
}

function signalSourceFromParams(params) {
  const columns = [
    'source_id',
    'snapshot_id',
    'profile_id',
    'source_type',
    'source_ref_id',
    'signal_family',
    'signal_key',
    'signal_score',
    'weight',
    'evidence_json',
  ];
  const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
  row.evidence_json = JSON.parse(row.evidence_json);
  return row;
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '021_prof1_user_taste_profiles.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS user_taste_profile_snapshots'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS user_taste_profile_signal_sources'));
  assert(migration.includes("source_type IN ('explicit_preference', 'swipe_feedback', 'note_signal', 'recipe_metadata')"));
  assert(migration.includes("signal_family IN ('flavor', 'texture', 'cuisine', 'region', 'feeling', 'meal_type', 'cooking_method', 'dietary', 'dislike')"));

  assert.equal(classifyTasteProfileConfidence(4), 'low');
  assert.equal(classifyTasteProfileConfidence(5), 'medium');
  assert.equal(classifyTasteProfileConfidence(21), 'high');

  const singleClient = makeClient();
  const built = await buildUserTasteProfileSnapshot(singleClient, { userId: 'user_family_cozy' });
  assert.equal(built.snapshot.snapshot_version, 1);
  assert.equal(built.snapshot.source_event_count, 4);
  assert.equal(built.snapshot.confidence_json.level, 'low');
  assert(built.snapshot.flavor_vector_json.savory > 0, 'explicit preference plus positive feedback should raise savory');
  assert(built.snapshot.flavor_vector_json.spicy < 0, 'swipe_left should push spicy negative');
  assert(built.snapshot.texture_vector_json.mushy < 0, 'negative note signal should lower mushy texture affinity');
  assert(built.snapshot.feeling_vector_json.cozy > 0, 'explicit feeling preferences and liked metadata should contribute');
  assert(built.snapshot.feeling_vector_json.kids_loved_it > 0, 'positive family response note should contribute to feeling');
  assert(built.snapshot.cuisine_vector_json.bulgarian > 0, 'explicit cuisine preference should contribute');
  assert(built.snapshot.region_vector_json.balkan > 0, 'staged region metadata should contribute');
  assert(built.snapshot.cooking_method_vector_json.searing > 0, 'staged cooking methods should contribute');
  assert(built.snapshot.meal_type_vector_json.dinner > 0, 'liked recipe meal type should contribute');
  assert.deepEqual(built.snapshot.preferred_constraints_json.explicit_constraints.map((row) => row.target_key), ['high_protein']);
  assert.deepEqual(built.snapshot.disliked_patterns_json.explicit_dislikes.map((row) => row.target_key), ['spicy']);
  assert(built.signal_sources.some((row) => row.source_type === 'explicit_preference'));
  assert(built.signal_sources.some((row) => row.source_type === 'recipe_metadata'));
  assert(built.signal_sources.some((row) => row.source_type === 'note_signal'));

  for (const vector of [
    built.snapshot.flavor_vector_json,
    built.snapshot.texture_vector_json,
    built.snapshot.cuisine_vector_json,
    built.snapshot.region_vector_json,
    built.snapshot.feeling_vector_json,
    built.snapshot.meal_type_vector_json,
    built.snapshot.cooking_method_vector_json,
  ]) {
    for (const score of Object.values(vector)) {
      assert(score >= -1 && score <= 1, 'all taste vector scores stay inside the safe normalized range');
    }
  }

  const storedSnapshots = await listUserTasteProfileSnapshots(singleClient, { userId: 'user_family_cozy' });
  const storedSources = await listUserTasteProfileSignalSources(singleClient, { snapshotId: built.snapshot.snapshot_id });
  assert.equal(storedSnapshots.length, 1);
  assert.equal(storedSources.length, built.signal_sources.length, 'signal source audit rows are written for the stored snapshot');

  const appendClient = makeClient();
  await buildUserTasteProfileSnapshot(appendClient, { userId: 'user_family_cozy' });
  await buildUserTasteProfileSnapshot(appendClient, { userId: 'user_family_cozy' });
  const appendSnapshots = await listUserTasteProfileSnapshots(appendClient, { userId: 'user_family_cozy', limit: 10 });
  assert.deepEqual(appendSnapshots.map((row) => row.snapshot_version), [2, 1], 'taste snapshots append instead of overwriting');

  const reportClient = makeClient();
  const report = await buildUserTasteProfileSnapshots(reportClient, { all: true, limit: 10 });
  assert.equal(report.profiles_seen, 3);
  assert.equal(report.snapshots_created, 3);
  assert.deepEqual(report.confidence_summary, {
    low: 1,
    medium: 1,
    high: 1,
  });
  assert.equal(report.errors.length, 0);

  const dryRunClient = makeClient();
  const dryRun = await buildUserTasteProfileSnapshots(dryRunClient, {
    profileId: 'user_food_profile:user_family_cozy',
    dryRun: true,
  });
  assert.equal(dryRun.dry_run, true);
  assert.equal(dryRun.snapshots_created, 0);
  assert.equal(dryRun.signal_sources_written, 0);
  assert.equal(dryRunClient.state.tasteSnapshotsById.size, 0, 'dry-run should not write taste snapshots');
  assert.equal(dryRunClient.state.tasteSignalSourcesById.size, 0, 'dry-run should not write signal-source rows');

  assert.deepEqual(parseArgs([
    '--profile-id=user_food_profile:user_family_cozy',
    '--all',
    '--dry-run',
    '--json',
    '--out=tmp/prof1.json',
    '--limit=20',
  ]), {
    profileId: 'user_food_profile:user_family_cozy',
    userId: null,
    all: true,
    dryRun: true,
    json: true,
    out: 'tmp/prof1.json',
    limit: 20,
  });

  assert(singleClient.state.commands.every((command) => !/\bfirestore\b/i.test(command.sql)), 'PROF1 must not write Firestore');
  assert(singleClient.state.commands.every((command) => !/\bplanner\b/i.test(command.sql)), 'PROF1 must not affect planner behavior');
  assert(singleClient.state.commands.every((command) => !/\bllm\b/i.test(command.sql)), 'PROF1 must not call LLM components');
  assert(singleClient.state.commands.every((command) => !/^DELETE\b/i.test(command.sql)), 'PROF1 snapshots must stay append-only');

  console.log('PROF1 taste profile engine tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
