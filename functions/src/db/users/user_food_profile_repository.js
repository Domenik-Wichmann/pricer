const DEFAULT_USER_FOOD_PROFILE_GENERATION_METHOD = 'fixture_seed_v1';
const DEFAULT_USER_FOOD_PROFILE_RULES_VERSION = 'ux1_user_food_profile_rules_v1';
const SUPPORTED_USER_FOOD_PROFILE_REVIEW_STATUSES = Object.freeze([
  'draft',
  'active',
  'inactive',
  'needs_review',
]);
const SUPPORTED_USER_FOOD_CONSTRAINT_TYPES = Object.freeze([
  'allergy',
  'intolerance',
  'religious',
  'medical',
  'dislike',
  'avoid',
  'required',
]);
const SUPPORTED_USER_FOOD_TARGET_TYPES = Object.freeze([
  'ingredient',
  'ingredient_family',
  'tag',
  'cuisine',
  'nutrient',
  'product_attribute',
]);
const SUPPORTED_USER_FOOD_CONSTRAINT_SEVERITIES = Object.freeze([
  'hard',
  'soft',
  'preference',
]);
const SUPPORTED_USER_FOOD_PREFERENCE_TYPES = Object.freeze([
  'flavor',
  'texture',
  'cuisine',
  'region',
  'feeling',
  'meal_type',
  'cooking_method',
  'budget',
  'convenience',
]);
const SUPPORTED_USER_FOOD_PREFERENCE_SOURCES = Object.freeze([
  'explicit',
  'inferred',
  'swipe',
  'note',
]);

async function createUserFoodProfile(client, profile) {
  requireClient(client);
  const record = normalizeUserFoodProfileRecord(profile);
  const result = await client.query(`
    INSERT INTO user_food_profiles (
      profile_id,
      user_id,
      household_size,
      default_servings,
      weekly_budget_amount,
      weekly_budget_currency,
      preferred_language,
      cooking_skill_level,
      max_prep_time_minutes,
      max_total_time_minutes,
      meal_prep_preference,
      nutrition_goal,
      daily_calorie_target,
      protein_target_g,
      carbs_target_g,
      fat_target_g,
      fiber_target_g,
      sodium_limit_mg,
      review_status
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19
    )
    RETURNING *
  `, userFoodProfileParams(record));
  return hydrateUserFoodProfileRow(result.rows[0]);
}

async function upsertUserFoodProfileByUserId(client, profile) {
  requireClient(client);
  const record = normalizeUserFoodProfileRecord(profile);
  const result = await client.query(`
    INSERT INTO user_food_profiles (
      profile_id,
      user_id,
      household_size,
      default_servings,
      weekly_budget_amount,
      weekly_budget_currency,
      preferred_language,
      cooking_skill_level,
      max_prep_time_minutes,
      max_total_time_minutes,
      meal_prep_preference,
      nutrition_goal,
      daily_calorie_target,
      protein_target_g,
      carbs_target_g,
      fat_target_g,
      fiber_target_g,
      sodium_limit_mg,
      review_status
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19
    )
    ON CONFLICT (user_id) DO UPDATE SET
      household_size = EXCLUDED.household_size,
      default_servings = EXCLUDED.default_servings,
      weekly_budget_amount = EXCLUDED.weekly_budget_amount,
      weekly_budget_currency = EXCLUDED.weekly_budget_currency,
      preferred_language = EXCLUDED.preferred_language,
      cooking_skill_level = EXCLUDED.cooking_skill_level,
      max_prep_time_minutes = EXCLUDED.max_prep_time_minutes,
      max_total_time_minutes = EXCLUDED.max_total_time_minutes,
      meal_prep_preference = EXCLUDED.meal_prep_preference,
      nutrition_goal = EXCLUDED.nutrition_goal,
      daily_calorie_target = EXCLUDED.daily_calorie_target,
      protein_target_g = EXCLUDED.protein_target_g,
      carbs_target_g = EXCLUDED.carbs_target_g,
      fat_target_g = EXCLUDED.fat_target_g,
      fiber_target_g = EXCLUDED.fiber_target_g,
      sodium_limit_mg = EXCLUDED.sodium_limit_mg,
      review_status = EXCLUDED.review_status,
      updated_at = NOW()
    RETURNING *
  `, userFoodProfileParams(record));
  return hydrateUserFoodProfileRow(result.rows[0]);
}

async function getUserFoodProfileById(client, profileId) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM user_food_profiles WHERE profile_id = $1',
    [requiredString(profileId, 'profile_id')],
  );
  return hydrateUserFoodProfileRow(result.rows[0] || null);
}

async function getUserFoodProfileByUserId(client, userId) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM user_food_profiles WHERE user_id = $1',
    [requiredString(userId, 'user_id')],
  );
  return hydrateUserFoodProfileRow(result.rows[0] || null);
}

async function updateUserFoodNutritionTargets(client, input = {}) {
  requireClient(client);
  const profile = await resolveUserFoodProfile(client, input);
  if (!profile) {
    throw new Error('User food profile not found for nutrition target update.');
  }
  const record = normalizeNutritionTargetsInput(input);
  const result = await client.query(`
    UPDATE user_food_profiles
    SET daily_calorie_target = $2,
        protein_target_g = $3,
        carbs_target_g = $4,
        fat_target_g = $5,
        fiber_target_g = $6,
        sodium_limit_mg = $7,
        updated_at = NOW()
    WHERE profile_id = $1
    RETURNING *
  `, [
    profile.profile_id,
    record.daily_calorie_target,
    record.protein_target_g,
    record.carbs_target_g,
    record.fat_target_g,
    record.fiber_target_g,
    record.sodium_limit_mg,
  ]);
  return hydrateUserFoodProfileRow(result.rows[0] || null);
}

async function addUserFoodConstraint(client, input = {}) {
  requireClient(client);
  const profile = await requireResolvedUserFoodProfile(client, input);
  const record = normalizeUserFoodConstraintRecord(input, { profileId: profile.profile_id });
  const result = await client.query(`
    INSERT INTO user_food_constraints (
      constraint_id,
      profile_id,
      constraint_type,
      target_type,
      target_key,
      severity,
      notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (profile_id, constraint_type, target_type, target_key) DO UPDATE SET
      severity = EXCLUDED.severity,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    RETURNING *
  `, userFoodConstraintParams(record));
  return hydrateUserFoodConstraintRow(result.rows[0]);
}

async function removeUserFoodConstraint(client, input = {}) {
  requireClient(client);
  if (input.constraintId) {
    const result = await client.query(`
      DELETE FROM user_food_constraints
      WHERE constraint_id = $1
      RETURNING *
    `, [requiredString(input.constraintId, 'constraint_id')]);
    return hydrateUserFoodConstraintRow(result.rows[0] || null);
  }
  const profile = await requireResolvedUserFoodProfile(client, input);
  const constraintType = normalizeEnum(input.constraint_type || input.constraintType, {
    fieldName: 'constraint_type',
    supportedValues: SUPPORTED_USER_FOOD_CONSTRAINT_TYPES,
  });
  const targetType = normalizeEnum(input.target_type || input.targetType, {
    fieldName: 'target_type',
    supportedValues: SUPPORTED_USER_FOOD_TARGET_TYPES,
  });
  const targetKey = normalizeUserFoodKey(input.target_key || input.targetKey, 'target_key');
  const result = await client.query(`
    DELETE FROM user_food_constraints
    WHERE profile_id = $1
      AND constraint_type = $2
      AND target_type = $3
      AND target_key = $4
    RETURNING *
  `, [profile.profile_id, constraintType, targetType, targetKey]);
  return hydrateUserFoodConstraintRow(result.rows[0] || null);
}

async function listUserFoodConstraints(client, input = {}) {
  requireClient(client);
  const profile = await requireResolvedUserFoodProfile(client, input);
  const limit = positiveInteger(input.limit, 1000);
  const constraintType = nullableString(input.constraint_type || input.constraintType);
  const params = [profile.profile_id];
  let whereSql = 'WHERE profile_id = $1';
  if (constraintType) {
    params.push(normalizeEnum(constraintType, {
      fieldName: 'constraint_type',
      supportedValues: SUPPORTED_USER_FOOD_CONSTRAINT_TYPES,
    }));
    whereSql += ` AND constraint_type = $${params.length}`;
  }
  params.push(limit);
  const result = await client.query(`
    SELECT *
    FROM user_food_constraints
    ${whereSql}
    ORDER BY
      CASE severity
        WHEN 'hard' THEN 0
        WHEN 'soft' THEN 1
        ELSE 2
      END,
      constraint_type ASC,
      target_type ASC,
      target_key ASC
    LIMIT $${params.length}
  `, params);
  return (result.rows || []).map(hydrateUserFoodConstraintRow);
}

async function addOrUpdateUserFoodPreference(client, input = {}) {
  requireClient(client);
  const profile = await requireResolvedUserFoodProfile(client, input);
  const record = normalizeUserFoodPreferenceRecord(input, { profileId: profile.profile_id });
  const result = await client.query(`
    INSERT INTO user_food_preferences (
      preference_id,
      profile_id,
      preference_type,
      preference_key,
      preference_score,
      source,
      confidence
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (profile_id, preference_type, preference_key) DO UPDATE SET
      preference_score = EXCLUDED.preference_score,
      source = EXCLUDED.source,
      confidence = EXCLUDED.confidence,
      updated_at = NOW()
    RETURNING *
  `, userFoodPreferenceParams(record));
  return hydrateUserFoodPreferenceRow(result.rows[0]);
}

async function listUserFoodPreferences(client, input = {}) {
  requireClient(client);
  const profile = await requireResolvedUserFoodProfile(client, input);
  const limit = positiveInteger(input.limit, 1000);
  const preferenceType = nullableString(input.preference_type || input.preferenceType);
  const params = [profile.profile_id];
  let whereSql = 'WHERE profile_id = $1';
  if (preferenceType) {
    params.push(normalizeEnum(preferenceType, {
      fieldName: 'preference_type',
      supportedValues: SUPPORTED_USER_FOOD_PREFERENCE_TYPES,
    }));
    whereSql += ` AND preference_type = $${params.length}`;
  }
  params.push(limit);
  const result = await client.query(`
    SELECT *
    FROM user_food_preferences
    ${whereSql}
    ORDER BY preference_type ASC, preference_score DESC, preference_key ASC
    LIMIT $${params.length}
  `, params);
  return (result.rows || []).map(hydrateUserFoodPreferenceRow);
}

async function addOrUpdateUserEquipment(client, input = {}) {
  requireClient(client);
  const profile = await requireResolvedUserFoodProfile(client, input);
  const record = normalizeUserEquipmentRecord(input, { profileId: profile.profile_id });
  const result = await client.query(`
    INSERT INTO user_equipment (
      equipment_id,
      profile_id,
      equipment_key,
      available,
      notes
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (profile_id, equipment_key) DO UPDATE SET
      available = EXCLUDED.available,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    RETURNING *
  `, userEquipmentParams(record));
  return hydrateUserEquipmentRow(result.rows[0]);
}

async function listUserEquipment(client, input = {}) {
  requireClient(client);
  const profile = await requireResolvedUserFoodProfile(client, input);
  const limit = positiveInteger(input.limit, 1000);
  const availability = normalizeNullableBoolean(input.available);
  const params = [profile.profile_id];
  let whereSql = 'WHERE profile_id = $1';
  if (availability !== null) {
    params.push(availability);
    whereSql += ` AND available = $${params.length}`;
  }
  params.push(limit);
  const result = await client.query(`
    SELECT *
    FROM user_equipment
    ${whereSql}
    ORDER BY available DESC, equipment_key ASC
    LIMIT $${params.length}
  `, params);
  return (result.rows || []).map(hydrateUserEquipmentRow);
}

async function getUserFoodProfileBundle(client, input = {}) {
  requireClient(client);
  const profile = await resolveUserFoodProfile(client, input);
  if (!profile) return null;
  const [constraints, preferences, equipment] = await Promise.all([
    listUserFoodConstraints(client, { profileId: profile.profile_id, limit: 5000 }),
    listUserFoodPreferences(client, { profileId: profile.profile_id, limit: 5000 }),
    listUserEquipment(client, { profileId: profile.profile_id, limit: 5000 }),
  ]);
  return {
    profile,
    constraints,
    preferences,
    equipment,
  };
}

function deleteUserFoodProfile() {
  throw new Error('User food profiles are append-preserving domain records and must not be deleted.');
}

function normalizeUserFoodProfileRecord(input = {}) {
  const userId = requiredString(input.user_id || input.userId, 'user_id');
  return {
    profile_id: requiredString(input.profile_id || input.profileId || buildUserFoodProfileId(userId), 'profile_id'),
    user_id: userId,
    household_size: nullablePositiveInteger(input.household_size ?? input.householdSize, 'household_size'),
    default_servings: nullablePositiveInteger(input.default_servings ?? input.defaultServings, 'default_servings'),
    weekly_budget_amount: nullableNonNegativeNumber(input.weekly_budget_amount ?? input.weeklyBudgetAmount, 'weekly_budget_amount'),
    weekly_budget_currency: nullableString(input.weekly_budget_currency || input.weeklyBudgetCurrency || 'EUR'),
    preferred_language: nullableString(input.preferred_language || input.preferredLanguage || 'en'),
    cooking_skill_level: nullableString(input.cooking_skill_level || input.cookingSkillLevel),
    max_prep_time_minutes: nullableNonNegativeInteger(input.max_prep_time_minutes ?? input.maxPrepTimeMinutes, 'max_prep_time_minutes'),
    max_total_time_minutes: nullableNonNegativeInteger(input.max_total_time_minutes ?? input.maxTotalTimeMinutes, 'max_total_time_minutes'),
    meal_prep_preference: nullableString(input.meal_prep_preference || input.mealPrepPreference),
    nutrition_goal: nullableString(input.nutrition_goal || input.nutritionGoal),
    daily_calorie_target: nullableNonNegativeNumber(input.daily_calorie_target ?? input.dailyCalorieTarget, 'daily_calorie_target'),
    protein_target_g: nullableNonNegativeNumber(input.protein_target_g ?? input.proteinTargetG, 'protein_target_g'),
    carbs_target_g: nullableNonNegativeNumber(input.carbs_target_g ?? input.carbsTargetG, 'carbs_target_g'),
    fat_target_g: nullableNonNegativeNumber(input.fat_target_g ?? input.fatTargetG, 'fat_target_g'),
    fiber_target_g: nullableNonNegativeNumber(input.fiber_target_g ?? input.fiberTargetG, 'fiber_target_g'),
    sodium_limit_mg: nullableNonNegativeNumber(input.sodium_limit_mg ?? input.sodiumLimitMg, 'sodium_limit_mg'),
    review_status: normalizeEnum(input.review_status || input.reviewStatus || 'draft', {
      fieldName: 'review_status',
      supportedValues: SUPPORTED_USER_FOOD_PROFILE_REVIEW_STATUSES,
    }),
  };
}

function normalizeNutritionTargetsInput(input = {}) {
  return {
    daily_calorie_target: nullableNonNegativeNumber(input.daily_calorie_target ?? input.dailyCalorieTarget, 'daily_calorie_target'),
    protein_target_g: nullableNonNegativeNumber(input.protein_target_g ?? input.proteinTargetG, 'protein_target_g'),
    carbs_target_g: nullableNonNegativeNumber(input.carbs_target_g ?? input.carbsTargetG, 'carbs_target_g'),
    fat_target_g: nullableNonNegativeNumber(input.fat_target_g ?? input.fatTargetG, 'fat_target_g'),
    fiber_target_g: nullableNonNegativeNumber(input.fiber_target_g ?? input.fiberTargetG, 'fiber_target_g'),
    sodium_limit_mg: nullableNonNegativeNumber(input.sodium_limit_mg ?? input.sodiumLimitMg, 'sodium_limit_mg'),
  };
}

function normalizeUserFoodConstraintRecord(input = {}, { profileId } = {}) {
  const constraintType = normalizeEnum(input.constraint_type || input.constraintType, {
    fieldName: 'constraint_type',
    supportedValues: SUPPORTED_USER_FOOD_CONSTRAINT_TYPES,
  });
  const targetType = normalizeEnum(input.target_type || input.targetType, {
    fieldName: 'target_type',
    supportedValues: SUPPORTED_USER_FOOD_TARGET_TYPES,
  });
  const targetKey = normalizeUserFoodKey(input.target_key || input.targetKey, 'target_key');
  return {
    constraint_id: requiredString(
      input.constraint_id
      || input.constraintId
      || buildUserFoodConstraintId(profileId, constraintType, targetType, targetKey),
      'constraint_id',
    ),
    profile_id: requiredString(profileId, 'profile_id'),
    constraint_type: constraintType,
    target_type: targetType,
    target_key: targetKey,
    severity: normalizeEnum(input.severity || 'hard', {
      fieldName: 'severity',
      supportedValues: SUPPORTED_USER_FOOD_CONSTRAINT_SEVERITIES,
    }),
    notes: nullableString(input.notes),
  };
}

function normalizeUserFoodPreferenceRecord(input = {}, { profileId } = {}) {
  const preferenceType = normalizeEnum(input.preference_type || input.preferenceType, {
    fieldName: 'preference_type',
    supportedValues: SUPPORTED_USER_FOOD_PREFERENCE_TYPES,
  });
  const preferenceKey = normalizeUserFoodKey(input.preference_key || input.preferenceKey, 'preference_key');
  return {
    preference_id: requiredString(
      input.preference_id
      || input.preferenceId
      || buildUserFoodPreferenceId(profileId, preferenceType, preferenceKey),
      'preference_id',
    ),
    profile_id: requiredString(profileId, 'profile_id'),
    preference_type: preferenceType,
    preference_key: preferenceKey,
    preference_score: normalizePreferenceScore(input.preference_score ?? input.preferenceScore ?? 0),
    source: normalizeEnum(input.source || 'explicit', {
      fieldName: 'source',
      supportedValues: SUPPORTED_USER_FOOD_PREFERENCE_SOURCES,
    }),
    confidence: nullableProbability(input.confidence, 'confidence'),
  };
}

function normalizeUserEquipmentRecord(input = {}, { profileId } = {}) {
  const equipmentKey = normalizeUserFoodKey(input.equipment_key || input.equipmentKey, 'equipment_key');
  return {
    equipment_id: requiredString(
      input.equipment_id
      || input.equipmentId
      || buildUserEquipmentId(profileId, equipmentKey),
      'equipment_id',
    ),
    profile_id: requiredString(profileId, 'profile_id'),
    equipment_key: equipmentKey,
    available: normalizeBoolean(input.available, true),
    notes: nullableString(input.notes),
  };
}

function userFoodProfileParams(record) {
  return [
    record.profile_id,
    record.user_id,
    record.household_size,
    record.default_servings,
    record.weekly_budget_amount,
    record.weekly_budget_currency,
    record.preferred_language,
    record.cooking_skill_level,
    record.max_prep_time_minutes,
    record.max_total_time_minutes,
    record.meal_prep_preference,
    record.nutrition_goal,
    record.daily_calorie_target,
    record.protein_target_g,
    record.carbs_target_g,
    record.fat_target_g,
    record.fiber_target_g,
    record.sodium_limit_mg,
    record.review_status,
  ];
}

function userFoodConstraintParams(record) {
  return [
    record.constraint_id,
    record.profile_id,
    record.constraint_type,
    record.target_type,
    record.target_key,
    record.severity,
    record.notes,
  ];
}

function userFoodPreferenceParams(record) {
  return [
    record.preference_id,
    record.profile_id,
    record.preference_type,
    record.preference_key,
    record.preference_score,
    record.source,
    record.confidence,
  ];
}

function userEquipmentParams(record) {
  return [
    record.equipment_id,
    record.profile_id,
    record.equipment_key,
    record.available,
    record.notes,
  ];
}

function hydrateUserFoodProfileRow(row) {
  return row ? { ...row } : null;
}

function hydrateUserFoodConstraintRow(row) {
  return row ? { ...row } : null;
}

function hydrateUserFoodPreferenceRow(row) {
  return row ? { ...row } : null;
}

function hydrateUserEquipmentRow(row) {
  return row ? { ...row } : null;
}

async function resolveUserFoodProfile(client, input = {}) {
  if (input.profile_id || input.profileId) {
    return getUserFoodProfileById(client, input.profile_id || input.profileId);
  }
  if (input.user_id || input.userId) {
    return getUserFoodProfileByUserId(client, input.user_id || input.userId);
  }
  throw new Error('profile_id or user_id is required.');
}

async function requireResolvedUserFoodProfile(client, input = {}) {
  const profile = await resolveUserFoodProfile(client, input);
  if (!profile) {
    throw new Error('User food profile not found.');
  }
  return profile;
}

function buildUserFoodProfileId(userId) {
  return `user_food_profile:${normalizeUserFoodKey(userId, 'user_id')}`;
}

function buildUserFoodConstraintId(profileId, constraintType, targetType, targetKey) {
  return [
    'user_food_constraint',
    normalizeUserFoodKey(profileId, 'profile_id'),
    constraintType,
    targetType,
    targetKey,
  ].join(':');
}

function buildUserFoodPreferenceId(profileId, preferenceType, preferenceKey) {
  return [
    'user_food_preference',
    normalizeUserFoodKey(profileId, 'profile_id'),
    preferenceType,
    preferenceKey,
  ].join(':');
}

function buildUserEquipmentId(profileId, equipmentKey) {
  return [
    'user_equipment',
    normalizeUserFoodKey(profileId, 'profile_id'),
    equipmentKey,
  ].join(':');
}

function normalizeUserFoodKey(value, fieldName) {
  const normalized = normalizeKey(requiredString(value, fieldName));
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}0-9]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizePreferenceScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < -1 || numeric > 1) {
    throw new Error('preference_score must be between -1.0 and 1.0.');
  }
  return Math.round(numeric * 1000) / 1000;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new Error('Boolean value expected.');
}

function normalizeNullableBoolean(value) {
  if (value === undefined || value === null || value === '') return null;
  return normalizeBoolean(value);
}

function normalizeEnum(value, { fieldName, supportedValues }) {
  const normalized = requiredString(value, fieldName);
  if (!supportedValues.includes(normalized)) {
    throw new Error(`Unsupported ${fieldName}: ${normalized}`);
  }
  return normalized;
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function requiredString(value, fieldName) {
  const normalized = nullableString(value);
  if (!normalized) throw new Error(`${fieldName} is required.`);
  return normalized;
}

function positiveInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function nullablePositiveInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number.parseInt(value, 10);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return numeric;
}

function nullableNonNegativeInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number.parseInt(value, 10);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return numeric;
}

function nullableNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }
  return numeric;
}

function nullableProbability(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new Error(`${fieldName} must be between 0 and 1.`);
  }
  return Math.round(numeric * 1000) / 1000;
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_USER_FOOD_PROFILE_GENERATION_METHOD,
  DEFAULT_USER_FOOD_PROFILE_RULES_VERSION,
  SUPPORTED_USER_FOOD_PROFILE_REVIEW_STATUSES,
  SUPPORTED_USER_FOOD_CONSTRAINT_TYPES,
  SUPPORTED_USER_FOOD_TARGET_TYPES,
  SUPPORTED_USER_FOOD_CONSTRAINT_SEVERITIES,
  SUPPORTED_USER_FOOD_PREFERENCE_TYPES,
  SUPPORTED_USER_FOOD_PREFERENCE_SOURCES,
  addOrUpdateUserEquipment,
  addOrUpdateUserFoodPreference,
  addUserFoodConstraint,
  buildUserEquipmentId,
  buildUserFoodConstraintId,
  buildUserFoodPreferenceId,
  buildUserFoodProfileId,
  createUserFoodProfile,
  deleteUserFoodProfile,
  getUserFoodProfileBundle,
  getUserFoodProfileById,
  getUserFoodProfileByUserId,
  listUserEquipment,
  listUserFoodConstraints,
  listUserFoodPreferences,
  normalizeKey,
  normalizeUserEquipmentRecord,
  normalizeUserFoodConstraintRecord,
  normalizeUserFoodPreferenceRecord,
  normalizeUserFoodProfileRecord,
  removeUserFoodConstraint,
  updateUserFoodNutritionTargets,
  upsertUserFoodProfileByUserId,
};
