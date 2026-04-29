const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  addOrUpdateUserEquipment,
  addOrUpdateUserFoodPreference,
  addUserFoodConstraint,
  deleteUserFoodProfile,
  getUserFoodProfileBundle,
  getUserFoodProfileByUserId,
  listUserEquipment,
  listUserFoodConstraints,
  listUserFoodPreferences,
  normalizeUserFoodProfileRecord,
  removeUserFoodConstraint,
  updateUserFoodNutritionTargets,
  upsertUserFoodProfileByUserId,
} = require('../app/functions/src');
const { parseArgs, seedUserFoodProfiles } = require('../scripts/ux1_seed_user_food_profiles');

function makeClient() {
  const state = {
    profilesByUserId: new Map(),
    constraintsById: new Map(),
    preferencesById: new Map(),
    equipmentById: new Map(),
    commands: [],
  };

  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });

      if (normalizedSql.startsWith('INSERT INTO user_food_profiles')) {
        const row = userFoodProfileFromParams(params);
        const existing = state.profilesByUserId.get(row.user_id);
        const stored = {
          ...(existing || {}),
          ...row,
          profile_id: existing ? existing.profile_id : row.profile_id,
          created_at: existing ? existing.created_at : '2026-04-25T10:00:00.000Z',
          updated_at: existing ? '2026-04-25T10:05:00.000Z' : '2026-04-25T10:00:00.000Z',
        };
        state.profilesByUserId.set(stored.user_id, stored);
        return { rows: [stored] };
      }

      if (normalizedSql === 'SELECT * FROM user_food_profiles WHERE profile_id = $1') {
        return {
          rows: [...state.profilesByUserId.values()].filter((row) => row.profile_id === params[0]),
        };
      }

      if (normalizedSql === 'SELECT * FROM user_food_profiles WHERE user_id = $1') {
        return {
          rows: [...state.profilesByUserId.values()].filter((row) => row.user_id === params[0]),
        };
      }

      if (normalizedSql.startsWith('UPDATE user_food_profiles SET daily_calorie_target = $2')) {
        const profile = [...state.profilesByUserId.values()].find((row) => row.profile_id === params[0]);
        if (!profile) return { rows: [] };
        profile.daily_calorie_target = params[1];
        profile.protein_target_g = params[2];
        profile.carbs_target_g = params[3];
        profile.fat_target_g = params[4];
        profile.fiber_target_g = params[5];
        profile.sodium_limit_mg = params[6];
        profile.updated_at = '2026-04-25T10:10:00.000Z';
        return { rows: [profile] };
      }

      if (normalizedSql.startsWith('INSERT INTO user_food_constraints')) {
        const row = userFoodConstraintFromParams(params);
        const existing = [...state.constraintsById.values()].find((item) => (
          item.profile_id === row.profile_id
          && item.constraint_type === row.constraint_type
          && item.target_type === row.target_type
          && item.target_key === row.target_key
        ));
        const stored = {
          ...(existing || {}),
          ...row,
          constraint_id: existing ? existing.constraint_id : row.constraint_id,
          created_at: existing ? existing.created_at : '2026-04-25T10:00:00.000Z',
          updated_at: existing ? '2026-04-25T10:06:00.000Z' : '2026-04-25T10:00:00.000Z',
        };
        state.constraintsById.set(stored.constraint_id, stored);
        return { rows: [stored] };
      }

      if (normalizedSql.startsWith('DELETE FROM user_food_constraints WHERE constraint_id = $1')) {
        const existing = state.constraintsById.get(params[0]) || null;
        if (existing) state.constraintsById.delete(params[0]);
        return { rows: existing ? [existing] : [] };
      }

      if (normalizedSql.startsWith('DELETE FROM user_food_constraints WHERE profile_id = $1')) {
        const existing = [...state.constraintsById.values()].find((item) => (
          item.profile_id === params[0]
          && item.constraint_type === params[1]
          && item.target_type === params[2]
          && item.target_key === params[3]
        )) || null;
        if (existing) state.constraintsById.delete(existing.constraint_id);
        return { rows: existing ? [existing] : [] };
      }

      if (normalizedSql.startsWith('SELECT * FROM user_food_constraints')) {
        let rows = [...state.constraintsById.values()].filter((item) => item.profile_id === params[0]);
        const limit = Number(params[params.length - 1]);
        if (normalizedSql.includes('AND constraint_type = $2')) {
          rows = rows.filter((item) => item.constraint_type === params[1]);
        }
        rows.sort(compareConstraintRows);
        return { rows: rows.slice(0, limit) };
      }

      if (normalizedSql.startsWith('INSERT INTO user_food_preferences')) {
        const row = userFoodPreferenceFromParams(params);
        const existing = [...state.preferencesById.values()].find((item) => (
          item.profile_id === row.profile_id
          && item.preference_type === row.preference_type
          && item.preference_key === row.preference_key
        ));
        const stored = {
          ...(existing || {}),
          ...row,
          preference_id: existing ? existing.preference_id : row.preference_id,
          created_at: existing ? existing.created_at : '2026-04-25T10:00:00.000Z',
          updated_at: existing ? '2026-04-25T10:07:00.000Z' : '2026-04-25T10:00:00.000Z',
        };
        state.preferencesById.set(stored.preference_id, stored);
        return { rows: [stored] };
      }

      if (normalizedSql.startsWith('SELECT * FROM user_food_preferences')) {
        let rows = [...state.preferencesById.values()].filter((item) => item.profile_id === params[0]);
        const limit = Number(params[params.length - 1]);
        if (normalizedSql.includes('AND preference_type = $2')) {
          rows = rows.filter((item) => item.preference_type === params[1]);
        }
        rows.sort(comparePreferenceRows);
        return { rows: rows.slice(0, limit) };
      }

      if (normalizedSql.startsWith('INSERT INTO user_equipment')) {
        const row = userEquipmentFromParams(params);
        const existing = [...state.equipmentById.values()].find((item) => (
          item.profile_id === row.profile_id
          && item.equipment_key === row.equipment_key
        ));
        const stored = {
          ...(existing || {}),
          ...row,
          equipment_id: existing ? existing.equipment_id : row.equipment_id,
          created_at: existing ? existing.created_at : '2026-04-25T10:00:00.000Z',
          updated_at: existing ? '2026-04-25T10:08:00.000Z' : '2026-04-25T10:00:00.000Z',
        };
        state.equipmentById.set(stored.equipment_id, stored);
        return { rows: [stored] };
      }

      if (normalizedSql.startsWith('SELECT * FROM user_equipment')) {
        let rows = [...state.equipmentById.values()].filter((item) => item.profile_id === params[0]);
        const limit = Number(params[params.length - 1]);
        if (normalizedSql.includes('AND available = $2')) {
          rows = rows.filter((item) => item.available === params[1]);
        }
        rows.sort(compareEquipmentRows);
        return { rows: rows.slice(0, limit) };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function userFoodProfileFromParams(params) {
  const columns = [
    'profile_id',
    'user_id',
    'household_size',
    'default_servings',
    'weekly_budget_amount',
    'weekly_budget_currency',
    'preferred_language',
    'cooking_skill_level',
    'max_prep_time_minutes',
    'max_total_time_minutes',
    'meal_prep_preference',
    'nutrition_goal',
    'daily_calorie_target',
    'protein_target_g',
    'carbs_target_g',
    'fat_target_g',
    'fiber_target_g',
    'sodium_limit_mg',
    'review_status',
  ];
  return Object.fromEntries(columns.map((column, index) => [column, params[index]]));
}

function userFoodConstraintFromParams(params) {
  const columns = [
    'constraint_id',
    'profile_id',
    'constraint_type',
    'target_type',
    'target_key',
    'severity',
    'notes',
  ];
  return Object.fromEntries(columns.map((column, index) => [column, params[index]]));
}

function userFoodPreferenceFromParams(params) {
  const columns = [
    'preference_id',
    'profile_id',
    'preference_type',
    'preference_key',
    'preference_score',
    'source',
    'confidence',
  ];
  return Object.fromEntries(columns.map((column, index) => [column, params[index]]));
}

function userEquipmentFromParams(params) {
  const columns = [
    'equipment_id',
    'profile_id',
    'equipment_key',
    'available',
    'notes',
  ];
  return Object.fromEntries(columns.map((column, index) => [column, params[index]]));
}

function compareConstraintRows(left, right) {
  const severityOrder = { hard: 0, soft: 1, preference: 2 };
  return severityOrder[left.severity] - severityOrder[right.severity]
    || left.constraint_type.localeCompare(right.constraint_type)
    || left.target_type.localeCompare(right.target_type)
    || left.target_key.localeCompare(right.target_key);
}

function comparePreferenceRows(left, right) {
  return left.preference_type.localeCompare(right.preference_type)
    || right.preference_score - left.preference_score
    || left.preference_key.localeCompare(right.preference_key);
}

function compareEquipmentRows(left, right) {
  return Number(right.available) - Number(left.available)
    || left.equipment_key.localeCompare(right.equipment_key);
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '019_ux1_user_food_profiles.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS user_food_profiles'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS user_food_constraints'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS user_food_preferences'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS user_equipment'));
  assert(migration.includes("review_status IN ('draft', 'active', 'inactive', 'needs_review')"));
  assert(migration.includes("constraint_type IN ('allergy', 'intolerance', 'religious', 'medical', 'dislike', 'avoid', 'required')"));
  assert(migration.includes("preference_score >= -1.0 AND preference_score <= 1.0"));

  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data', 'seeds', 'user_food_profiles_seed.json'),
    'utf8',
  ));
  assert.equal(fixture.length, 3);

  const normalized = normalizeUserFoodProfileRecord({
    user_id: 'User Weight Loss Demo',
    household_size: 1,
    default_servings: 1,
    review_status: 'active',
  });
  assert.equal(normalized.profile_id, 'user_food_profile:user_weight_loss_demo');

  const client = makeClient();
  const first = await upsertUserFoodProfileByUserId(client, {
    user_id: 'user_weight_loss_demo',
    household_size: 1,
    default_servings: 1,
    weekly_budget_amount: 75,
    weekly_budget_currency: 'EUR',
    preferred_language: 'en',
    cooking_skill_level: 'intermediate',
    nutrition_goal: 'weight_loss',
    review_status: 'active',
  });
  const second = await upsertUserFoodProfileByUserId(client, {
    user_id: 'user_weight_loss_demo',
    household_size: 2,
    default_servings: 2,
    weekly_budget_amount: 85,
    weekly_budget_currency: 'EUR',
    preferred_language: 'bg',
    cooking_skill_level: 'advanced',
    nutrition_goal: 'maintenance',
    review_status: 'needs_review',
  });
  assert.equal(first.profile_id, second.profile_id, 'profile upsert preserves stable ids by user_id');
  assert.equal(client.state.profilesByUserId.size, 1, 'upsert by user_id is idempotent');
  assert.equal(second.household_size, 2);

  const fetched = await getUserFoodProfileByUserId(client, 'user_weight_loss_demo');
  assert.equal(fetched.profile_id, first.profile_id);

  const updatedTargets = await updateUserFoodNutritionTargets(client, {
    userId: 'user_weight_loss_demo',
    dailyCalorieTarget: 1800,
    proteinTargetG: 140,
    carbsTargetG: 150,
    fatTargetG: 55,
    fiberTargetG: 30,
    sodiumLimitMg: 2200,
  });
  assert.equal(updatedTargets.daily_calorie_target, 1800);
  assert.equal(updatedTargets.protein_target_g, 140);

  const peanutConstraint = await addUserFoodConstraint(client, {
    userId: 'user_weight_loss_demo',
    constraint_type: 'allergy',
    target_type: 'ingredient',
    target_key: 'peanut',
    severity: 'hard',
    notes: 'Hard allergy.',
  });
  await addUserFoodConstraint(client, {
    userId: 'user_weight_loss_demo',
    constraint_type: 'dislike',
    target_type: 'ingredient',
    target_key: 'mushroom',
    severity: 'soft',
  });
  await addUserFoodConstraint(client, {
    userId: 'user_weight_loss_demo',
    constraint_type: 'avoid',
    target_type: 'tag',
    target_key: 'spicy',
    severity: 'preference',
  });
  const constraints = await listUserFoodConstraints(client, { userId: 'user_weight_loss_demo' });
  assert.equal(constraints.length, 3);
  assert.equal(constraints[0].constraint_type, 'allergy');
  assert.equal(constraints[0].severity, 'hard');

  const removed = await removeUserFoodConstraint(client, { constraintId: peanutConstraint.constraint_id });
  assert.equal(removed.constraint_id, peanutConstraint.constraint_id);
  const remainingConstraints = await listUserFoodConstraints(client, { userId: 'user_weight_loss_demo' });
  assert.equal(remainingConstraints.length, 2);

  await addOrUpdateUserFoodPreference(client, {
    userId: 'user_weight_loss_demo',
    preference_type: 'flavor',
    preference_key: 'savory',
    preference_score: 0.8,
    source: 'explicit',
    confidence: 1,
  });
  await addOrUpdateUserFoodPreference(client, {
    userId: 'user_weight_loss_demo',
    preference_type: 'texture',
    preference_key: 'smooth',
    preference_score: -0.2,
    source: 'note',
    confidence: 0.7,
  });
  await addOrUpdateUserFoodPreference(client, {
    userId: 'user_weight_loss_demo',
    preference_type: 'cuisine',
    preference_key: 'mediterranean',
    preference_score: 0.7,
    source: 'explicit',
    confidence: 0.9,
  });
  const preferences = await listUserFoodPreferences(client, { userId: 'user_weight_loss_demo' });
  assert.equal(preferences.length, 3);
  assert.equal(preferences.find((row) => row.preference_type === 'flavor').preference_score, 0.8);

  await addOrUpdateUserEquipment(client, {
    userId: 'user_weight_loss_demo',
    equipment_key: 'oven',
    available: true,
  });
  await addOrUpdateUserEquipment(client, {
    userId: 'user_weight_loss_demo',
    equipment_key: 'slow_cooker',
    available: false,
    notes: 'Not available',
  });
  await addOrUpdateUserEquipment(client, {
    userId: 'user_weight_loss_demo',
    equipment_key: 'air_fryer',
    available: true,
  });
  const equipment = await listUserEquipment(client, { userId: 'user_weight_loss_demo' });
  assert.equal(equipment.length, 3);
  assert.equal(equipment[0].available, true);
  assert.equal(equipment.find((row) => row.equipment_key === 'slow_cooker').available, false);

  const bundle = await getUserFoodProfileBundle(client, { userId: 'user_weight_loss_demo' });
  assert.equal(bundle.profile.user_id, 'user_weight_loss_demo');
  assert.equal(bundle.constraints.length, 2);
  assert.equal(bundle.preferences.length, 3);
  assert.equal(bundle.equipment.length, 3);

  assert.throws(() => deleteUserFoodProfile(), /must not be deleted/);

  const seedClient = makeClient();
  const firstSeed = await seedUserFoodProfiles({ client: seedClient, seedPath: path.join(__dirname, '..', 'data', 'seeds', 'user_food_profiles_seed.json') });
  const secondSeed = await seedUserFoodProfiles({ client: seedClient, seedPath: path.join(__dirname, '..', 'data', 'seeds', 'user_food_profiles_seed.json') });
  assert.equal(firstSeed.scanned, 3);
  assert.equal(firstSeed.profiles_upserted, 3);
  assert.equal(secondSeed.profiles_upserted, 3, 'seed rerun still upserts all bundles deterministically');
  assert.equal(seedClient.state.profilesByUserId.size, 3, 'seed rerun does not duplicate profiles');
  assert.equal(seedClient.state.constraintsById.size, 6, 'seed rerun preserves unique constraint rows');
  assert.equal(seedClient.state.preferencesById.size, 9, 'seed rerun preserves unique preference rows');
  assert.equal(seedClient.state.equipmentById.size, 9, 'seed rerun preserves unique equipment rows');

  const dryRun = await seedUserFoodProfiles({
    client: makeClient(),
    dryRun: true,
    limit: 2,
    seedPath: path.join(__dirname, '..', 'data', 'seeds', 'user_food_profiles_seed.json'),
  });
  assert.equal(dryRun.dry_run, true);
  assert.equal(dryRun.scanned, 2);
  assert.equal(dryRun.profiles_upserted, 0);
  assert.equal(dryRun.bundles.length, 2);

  assert.deepEqual(parseArgs([
    '--dry-run',
    '--json',
    '--limit=20',
    '--out=tmp/ux1.json',
  ]), {
    dryRun: true,
    json: true,
    out: 'tmp/ux1.json',
    limit: 20,
  });

  assert(seedClient.state.commands.every((command) => !/firestore/i.test(command.sql)), 'UX1 must not write Firestore');
  assert(seedClient.state.commands.every((command) => !/\b(recipes|planner|watchlist|basket)\b/i.test(command.sql)), 'UX1 must not affect planner or recipe runtime domains');

  console.log('UX1 user food profile tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
