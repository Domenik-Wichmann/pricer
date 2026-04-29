const DEFAULT_TASTE_PROFILE_BUILD_LIMIT = 100;
const DEFAULT_TASTE_PROFILE_GENERATION_METHOD = 'prof1_taste_profile_engine_v1';
const DEFAULT_TASTE_PROFILE_RULES_VERSION = 'prof1_taste_profile_rules_v1';
const SUPPORTED_TASTE_PROFILE_SOURCE_TYPES = Object.freeze([
  'explicit_preference',
  'swipe_feedback',
  'note_signal',
  'recipe_metadata',
]);
const SUPPORTED_TASTE_PROFILE_SIGNAL_FAMILIES = Object.freeze([
  'flavor',
  'texture',
  'cuisine',
  'region',
  'feeling',
  'meal_type',
  'cooking_method',
  'dietary',
  'dislike',
]);

const EXPLICIT_PREFERENCE_BASE_WEIGHT = 2.0;
const NOTE_SIGNAL_BASE_WEIGHT = 1.0;
const RECIPE_METADATA_BASE_WEIGHT = 1.0;
const FEEDBACK_EVENT_INFLUENCE = Object.freeze({
  impression: 0.0,
  swipe_left: -1.0,
  swipe_right: 0.45,
  swipe_up: 1.0,
  saved: 0.9,
  cooked: 0.8,
  cooked_again: 1.0,
  dismissed: -0.75,
});
const NOTE_SIGNAL_FAMILY_MAP = Object.freeze({
  taste: 'flavor',
  texture: 'texture',
  timing: 'dislike',
  difficulty: 'dislike',
  substitution: 'cooking_method',
  portion_size: 'feeling',
  family_response: 'feeling',
  price: 'dislike',
  availability: 'dislike',
});
const VECTOR_FAMILIES = Object.freeze([
  'flavor',
  'texture',
  'cuisine',
  'region',
  'feeling',
  'meal_type',
  'cooking_method',
]);
const CONSTRAINT_DISLIKE_TYPES = new Set(['allergy', 'intolerance', 'medical', 'dislike', 'avoid']);
const CONSTRAINT_PREFERRED_TYPES = new Set(['required', 'religious']);

async function buildUserTasteProfileSnapshots(client, options = {}) {
  requireClient(client);
  const normalized = normalizeTasteProfileBuildOptions(options);
  const targets = await fetchTasteProfileTargets(client, normalized);
  const report = {
    dry_run: normalized.dry_run,
    profiles_seen: targets.length,
    snapshots_created: 0,
    source_events_used: 0,
    source_recipes_used: 0,
    signal_sources_written: 0,
    confidence_summary: {
      low: 0,
      medium: 0,
      high: 0,
    },
    errors: [],
    snapshots: [],
  };

  for (const target of targets) {
    try {
      const result = await buildUserTasteProfileSnapshot(client, {
        profileId: target.profile_id,
        userId: target.user_id,
        dryRun: normalized.dry_run,
      });
      report.source_events_used += result.snapshot.source_event_count;
      report.source_recipes_used += result.snapshot.source_recipe_count;
      report.signal_sources_written += result.signal_sources_written;
      report.confidence_summary[result.snapshot.confidence_json.level] += 1;
      report.snapshots.push({
        profile_id: result.snapshot.profile_id,
        user_id: result.snapshot.user_id,
        snapshot_id: result.snapshot.snapshot_id || null,
        snapshot_version: result.snapshot.snapshot_version,
        source_event_count: result.snapshot.source_event_count,
        source_recipe_count: result.snapshot.source_recipe_count,
        confidence_level: result.snapshot.confidence_json.level,
        signal_source_count: result.signal_sources.length,
      });
      if (!normalized.dry_run) {
        report.snapshots_created += 1;
      }
    } catch (error) {
      report.errors.push({
        profile_id: target.profile_id,
        user_id: target.user_id,
        message: error.message,
      });
    }
  }

  return report;
}

async function buildUserTasteProfileSnapshot(client, input = {}) {
  requireClient(client);
  const target = await resolveTasteProfileTarget(client, input);
  if (!target) {
    throw new Error('User food profile not found for PROF1 taste snapshot build.');
  }

  const bundle = await loadTasteProfileBundle(client, target.profile_id);
  const computed = computeUserTasteProfileSnapshot(bundle);
  const snapshotVersion = await nextTasteProfileSnapshotVersion(client, target.profile_id);
  const projectedSnapshotId = buildUserTasteProfileSnapshotId(target.profile_id, snapshotVersion);

  if (input.dryRun) {
    return {
      dry_run: true,
      snapshot: {
        ...computed.snapshot,
        snapshot_id: projectedSnapshotId,
        profile_id: target.profile_id,
        user_id: target.user_id,
        snapshot_version: snapshotVersion,
        generation_method: DEFAULT_TASTE_PROFILE_GENERATION_METHOD,
        rules_version: DEFAULT_TASTE_PROFILE_RULES_VERSION,
      },
      signal_sources: computed.signal_sources,
      signal_sources_written: 0,
    };
  }

  const snapshotRecord = {
    snapshot_id: projectedSnapshotId,
    profile_id: target.profile_id,
    user_id: target.user_id,
    snapshot_version: snapshotVersion,
    ...computed.snapshot,
    generation_method: DEFAULT_TASTE_PROFILE_GENERATION_METHOD,
    rules_version: DEFAULT_TASTE_PROFILE_RULES_VERSION,
  };

  const storedSnapshot = await insertTasteProfileSnapshot(client, snapshotRecord);
  const storedSignalSources = [];
  for (let index = 0; index < computed.signal_sources.length; index += 1) {
    const source = computed.signal_sources[index];
    const stored = await insertTasteProfileSignalSource(client, {
      source_id: buildUserTasteProfileSignalSourceId(storedSnapshot.snapshot_id, index + 1),
      snapshot_id: storedSnapshot.snapshot_id,
      profile_id: storedSnapshot.profile_id,
      ...source,
    });
    storedSignalSources.push(stored);
  }

  return {
    dry_run: false,
    snapshot: storedSnapshot,
    signal_sources: storedSignalSources,
    signal_sources_written: storedSignalSources.length,
  };
}

async function listUserTasteProfileSnapshots(client, input = {}) {
  requireClient(client);
  const target = await resolveTasteProfileTarget(client, input);
  if (!target) return [];
  const limit = positiveInteger(input.limit, DEFAULT_TASTE_PROFILE_BUILD_LIMIT);
  const result = await client.query(`
    SELECT *
    FROM user_taste_profile_snapshots
    WHERE profile_id = $1
    ORDER BY snapshot_version DESC, created_at DESC
    LIMIT $2
  `, [target.profile_id, limit]);
  return (result.rows || []).map(hydrateTasteProfileSnapshotRow);
}

async function listUserTasteProfileSignalSources(client, input = {}) {
  requireClient(client);
  const snapshotId = nullableString(input.snapshotId || input.snapshot_id);
  if (snapshotId) {
    const result = await client.query(`
      SELECT *
      FROM user_taste_profile_signal_sources
      WHERE snapshot_id = $1
      ORDER BY created_at ASC, source_id ASC
    `, [snapshotId]);
    return (result.rows || []).map(hydrateTasteProfileSignalSourceRow);
  }

  const target = await resolveTasteProfileTarget(client, input);
  if (!target) return [];
  const limit = positiveInteger(input.limit, 1000);
  const result = await client.query(`
    SELECT *
    FROM user_taste_profile_signal_sources
    WHERE profile_id = $1
    ORDER BY created_at DESC, source_id DESC
    LIMIT $2
  `, [target.profile_id, limit]);
  return (result.rows || []).map(hydrateTasteProfileSignalSourceRow);
}

async function loadTasteProfileBundle(client, profileId) {
  const [profile, preferences, constraints, feedbackEvents, noteSignals] = await Promise.all([
    fetchTasteProfileById(client, profileId),
    fetchTasteProfilePreferences(client, profileId),
    fetchTasteProfileConstraints(client, profileId),
    fetchTasteProfileFeedbackEvents(client, profileId),
    fetchTasteProfileNoteSignals(client, profileId),
  ]);

  const recipeIds = [...new Set(
    feedbackEvents
      .map((row) => nullableString(row.recipe_id))
      .filter(Boolean),
  )];
  const stagedMetadataByRecipeId = recipeIds.length > 0
    ? await fetchTasteProfileRecipeMetadata(client, recipeIds)
    : new Map();

  return {
    profile,
    preferences,
    constraints,
    feedback_events: feedbackEvents,
    note_signals: noteSignals,
    staged_metadata_by_recipe_id: stagedMetadataByRecipeId,
  };
}

function computeUserTasteProfileSnapshot(bundle = {}) {
  const profile = bundle.profile || {};
  const preferences = bundle.preferences || [];
  const constraints = bundle.constraints || [];
  const feedbackEvents = bundle.feedback_events || [];
  const noteSignals = bundle.note_signals || [];
  const stagedMetadataByRecipeId = bundle.staged_metadata_by_recipe_id || new Map();
  const accumulator = createVectorAccumulator();
  const dietaryAccumulator = new Map();
  const signalSources = [];

  for (const preference of preferences) {
    if (!VECTOR_FAMILIES.includes(preference.preference_type)) continue;
    const key = normalizeSignalKey(preference.preference_key);
    if (!key) continue;
    const confidence = nullableProbability(preference.confidence, 'confidence') ?? 1;
    const weight = roundNumber(EXPLICIT_PREFERENCE_BASE_WEIGHT * confidence);
    const signalScore = clampSignedScore(preference.preference_score);
    addSignalContribution(accumulator, signalSources, {
      source_type: 'explicit_preference',
      source_ref_id: preference.preference_id || null,
      signal_family: preference.preference_type,
      signal_key: key,
      signal_score: signalScore,
      weight,
      evidence_json: {
        source: preference.source || null,
        confidence,
      },
    });
  }

  for (const feedback of feedbackEvents) {
    const influence = roundNumber(feedbackEventInfluence(feedback));
    if (influence === 0) continue;
    const metadata = stagedMetadataByRecipeId.get(feedback.recipe_id) || {};
    const evidence = {
      feedback_id: feedback.feedback_id,
      event_type: feedback.event_type,
      recipe_id: feedback.recipe_id || null,
      recipe_key: feedback.recipe_key || feedback.recipe_key_snapshot || null,
      staged_recipe_id: metadata.staged_recipe_id || null,
    };

    addRecipeMetadataSignals(accumulator, signalSources, {
      family: 'cuisine',
      keys: normalizeStringArray(feedback.cuisine_tags_json),
      signalScore: influence,
      weight: RECIPE_METADATA_BASE_WEIGHT,
      sourceRefId: feedback.recipe_id,
      evidence,
    });
    addRecipeMetadataSignals(accumulator, signalSources, {
      family: 'meal_type',
      keys: normalizeStringArray(feedback.meal_type_tags_json),
      signalScore: influence,
      weight: RECIPE_METADATA_BASE_WEIGHT,
      sourceRefId: feedback.recipe_id,
      evidence,
    });
    addRecipeMetadataSignals(accumulator, signalSources, {
      family: 'region',
      keys: normalizeStringArray(metadata.region_tags_json),
      signalScore: influence,
      weight: RECIPE_METADATA_BASE_WEIGHT,
      sourceRefId: feedback.recipe_id,
      evidence,
    });
    addRecipeMetadataSignals(accumulator, signalSources, {
      family: 'feeling',
      keys: normalizeStringArray(metadata.feeling_tags_json),
      signalScore: influence,
      weight: RECIPE_METADATA_BASE_WEIGHT,
      sourceRefId: feedback.recipe_id,
      evidence,
    });
    addRecipeMetadataSignals(accumulator, signalSources, {
      family: 'flavor',
      keys: extractProfileKeys(metadata.flavor_profile_json),
      signalScore: influence,
      weight: RECIPE_METADATA_BASE_WEIGHT,
      sourceRefId: feedback.recipe_id,
      evidence,
    });
    addRecipeMetadataSignals(accumulator, signalSources, {
      family: 'texture',
      keys: extractProfileKeys(metadata.texture_profile_json),
      signalScore: influence,
      weight: RECIPE_METADATA_BASE_WEIGHT,
      sourceRefId: feedback.recipe_id,
      evidence,
    });
    addRecipeMetadataSignals(accumulator, signalSources, {
      family: 'cooking_method',
      keys: normalizeStringArray((metadata.methods || []).map((row) => row.method_key || row.key || row.name_en)),
      signalScore: influence,
      weight: RECIPE_METADATA_BASE_WEIGHT,
      sourceRefId: feedback.recipe_id,
      evidence,
    });

    for (const dietaryKey of normalizeStringArray(feedback.dietary_tags_json)) {
      addPatternContribution(dietaryAccumulator, dietaryKey, influence, RECIPE_METADATA_BASE_WEIGHT);
    }
  }

  for (const signal of noteSignals) {
    const family = NOTE_SIGNAL_FAMILY_MAP[signal.signal_type] || null;
    if (!family) continue;
    const signalKey = normalizeSignalKey(signal.signal_key || signal.signal_value || signal.signal_type);
    if (!signalKey) continue;
    const signalScore = noteSignalPolarity(signal.polarity);
    const confidence = nullableProbability(signal.confidence, 'confidence') ?? 1;
    const weight = roundNumber(NOTE_SIGNAL_BASE_WEIGHT * confidence);
    addSignalContribution(accumulator, signalSources, {
      source_type: 'note_signal',
      source_ref_id: signal.signal_id || null,
      signal_family: family,
      signal_key: signalKey,
      signal_score: signalScore,
      weight,
      evidence_json: {
        feedback_id: signal.feedback_id || null,
        recipe_id: signal.recipe_id || null,
        recipe_key_snapshot: signal.recipe_key_snapshot || null,
        signal_type: signal.signal_type,
        signal_value: signal.signal_value || null,
        polarity: signal.polarity || null,
        extraction_method: signal.extraction_method || null,
      },
    });
  }

  const sourceRecipeCount = new Set(
    feedbackEvents
      .map((row) => nullableString(row.recipe_id))
      .filter(Boolean),
  ).size;
  const confidence = buildTasteProfileConfidence(feedbackEvents.length, {
    noteSignalCount: noteSignals.length,
    preferenceCount: preferences.length,
    sourceRecipeCount,
  });

  return {
    snapshot: {
      source_event_count: feedbackEvents.length,
      source_recipe_count: sourceRecipeCount,
      flavor_vector_json: buildNormalizedVector(accumulator.flavor),
      texture_vector_json: buildNormalizedVector(accumulator.texture),
      cuisine_vector_json: buildNormalizedVector(accumulator.cuisine),
      region_vector_json: buildNormalizedVector(accumulator.region),
      feeling_vector_json: buildNormalizedVector(accumulator.feeling),
      meal_type_vector_json: buildNormalizedVector(accumulator.meal_type),
      cooking_method_vector_json: buildNormalizedVector(accumulator.cooking_method),
      dietary_pattern_json: buildDietaryPatternJson(constraints, dietaryAccumulator),
      disliked_patterns_json: buildDislikedPatternsJson(constraints, signalSources),
      preferred_constraints_json: buildPreferredConstraintsJson(profile, constraints),
      confidence_json: confidence,
    },
    signal_sources: signalSources,
  };
}

function addRecipeMetadataSignals(accumulator, signalSources, {
  family,
  keys = [],
  signalScore,
  weight,
  sourceRefId,
  evidence,
} = {}) {
  for (const key of keys) {
    addSignalContribution(accumulator, signalSources, {
      source_type: 'recipe_metadata',
      source_ref_id: sourceRefId || null,
      signal_family: family,
      signal_key: key,
      signal_score: signalScore,
      weight,
      evidence_json: evidence || {},
    });
  }
}

function addSignalContribution(accumulator, signalSources, source) {
  const family = normalizeSignalFamily(source.signal_family);
  const signalKey = normalizeSignalKey(source.signal_key);
  if (!family || !signalKey) return;
  const signalScore = clampSignedScore(source.signal_score);
  const weight = normalizeWeight(source.weight);
  if (weight === 0) return;
  if (VECTOR_FAMILIES.includes(family)) {
    const familyAccumulator = accumulator[family];
    const current = familyAccumulator.get(signalKey) || { total: 0, weight: 0 };
    current.total = roundNumber(current.total + (signalScore * weight));
    current.weight = roundNumber(current.weight + weight);
    familyAccumulator.set(signalKey, current);
  }
  signalSources.push({
    source_type: normalizeSourceType(source.source_type),
    source_ref_id: nullableString(source.source_ref_id),
    signal_family: family,
    signal_key: signalKey,
    signal_score: signalScore,
    weight,
    evidence_json: normalizeJsonObject(source.evidence_json || {}),
  });
}

function createVectorAccumulator() {
  return Object.fromEntries(VECTOR_FAMILIES.map((family) => [family, new Map()]));
}

function buildNormalizedVector(familyAccumulator = new Map()) {
  const entries = [...familyAccumulator.entries()]
    .map(([key, value]) => ({
      key,
      score: value.weight > 0 ? roundNumber(value.total / value.weight) : 0,
    }))
    .filter((entry) => entry.score !== 0)
    .sort(compareSignalEntries);
  return Object.fromEntries(entries.map((entry) => [entry.key, clampSignedScore(entry.score)]));
}

function buildDietaryPatternJson(constraints = [], dietaryAccumulator = new Map()) {
  const explicitConstraints = constraints
    .filter((row) => ['religious', 'medical', 'required'].includes(row.constraint_type))
    .map((row) => ({
      constraint_type: row.constraint_type,
      target_type: row.target_type,
      target_key: row.target_key,
      severity: row.severity,
    }));
  const inferredTags = [...dietaryAccumulator.entries()]
    .map(([key, value]) => ({
      key,
      score: value.weight > 0 ? roundNumber(value.total / value.weight) : 0,
    }))
    .filter((row) => row.score !== 0)
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));
  return {
    explicit_constraints: explicitConstraints,
    inferred_tags: inferredTags,
  };
}

function buildDislikedPatternsJson(constraints = [], signalSources = []) {
  const explicitDislikes = constraints
    .filter((row) => CONSTRAINT_DISLIKE_TYPES.has(row.constraint_type))
    .map((row) => ({
      constraint_type: row.constraint_type,
      target_type: row.target_type,
      target_key: row.target_key,
      severity: row.severity,
    }));
  const negativeSignals = signalSources
    .filter((row) => row.signal_score < 0)
    .map((row) => ({
      family: row.signal_family,
      key: row.signal_key,
      score: row.signal_score,
    }))
    .sort((left, right) => left.family.localeCompare(right.family) || left.key.localeCompare(right.key));
  return {
    explicit_dislikes: explicitDislikes,
    negative_signals: dedupePatternSignals(negativeSignals),
  };
}

function buildPreferredConstraintsJson(profile = {}, constraints = []) {
  const explicitPreferences = constraints
    .filter((row) => CONSTRAINT_PREFERRED_TYPES.has(row.constraint_type))
    .map((row) => ({
      constraint_type: row.constraint_type,
      target_type: row.target_type,
      target_key: row.target_key,
      severity: row.severity,
    }));
  const profileBounds = compactObject({
    household_size: profile.household_size ?? null,
    default_servings: profile.default_servings ?? null,
    weekly_budget_amount: profile.weekly_budget_amount ?? null,
    weekly_budget_currency: profile.weekly_budget_currency ?? null,
    max_prep_time_minutes: profile.max_prep_time_minutes ?? null,
    max_total_time_minutes: profile.max_total_time_minutes ?? null,
    preferred_language: profile.preferred_language ?? null,
  });
  return {
    explicit_constraints: explicitPreferences,
    profile_bounds: profileBounds,
  };
}

function dedupePatternSignals(rows = []) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const key = `${row.family}:${row.key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

function buildTasteProfileConfidence(feedbackEventCount, {
  noteSignalCount = 0,
  preferenceCount = 0,
  sourceRecipeCount = 0,
} = {}) {
  return {
    level: classifyTasteProfileConfidence(feedbackEventCount),
    feedback_event_count: feedbackEventCount,
    source_recipe_count: sourceRecipeCount,
    explicit_preference_count: preferenceCount,
    note_signal_count: noteSignalCount,
  };
}

function classifyTasteProfileConfidence(feedbackEventCount) {
  const total = Number(feedbackEventCount || 0);
  if (total > 20) return 'high';
  if (total >= 5) return 'medium';
  return 'low';
}

function feedbackEventInfluence(feedback = {}) {
  const eventType = nullableString(feedback.event_type);
  if (eventType && Object.prototype.hasOwnProperty.call(FEEDBACK_EVENT_INFLUENCE, eventType)) {
    return FEEDBACK_EVENT_INFLUENCE[eventType];
  }
  const sentiment = Number(feedback.sentiment_score);
  const intent = Number(feedback.intent_score);
  if (Number.isFinite(sentiment) && Number.isFinite(intent)) {
    return clampSignedScore((sentiment * 0.7) + (intent * 0.3));
  }
  if (Number.isFinite(sentiment)) return clampSignedScore(sentiment);
  return 0;
}

function noteSignalPolarity(value) {
  const normalized = nullableString(value);
  if (normalized === 'positive') return 1;
  if (normalized === 'negative') return -1;
  return 0;
}

function extractProfileKeys(profile = {}) {
  const keys = new Set();
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return [];
  for (const [key, value] of Object.entries(profile)) {
    if (typeof value === 'string') {
      keys.add(normalizeSignalKey(`${key}_${value}`));
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') {
          keys.add(normalizeSignalKey(entry));
        }
      }
    }
  }
  return [...keys].filter(Boolean).sort();
}

async function fetchTasteProfileTargets(client, options = {}) {
  if (options.profile_id) {
    const profile = await fetchTasteProfileById(client, options.profile_id);
    return profile ? [profile] : [];
  }
  if (options.user_id) {
    const profile = await fetchTasteProfileByUserId(client, options.user_id);
    return profile ? [profile] : [];
  }
  const result = await client.query(`
    SELECT *
    FROM user_food_profiles
    ORDER BY profile_id ASC
    LIMIT $1
  `, [options.limit]);
  return result.rows || [];
}

async function resolveTasteProfileTarget(client, input = {}) {
  if (input.profileId || input.profile_id) {
    return fetchTasteProfileById(client, input.profileId || input.profile_id);
  }
  if (input.userId || input.user_id) {
    return fetchTasteProfileByUserId(client, input.userId || input.user_id);
  }
  return null;
}

async function fetchTasteProfileById(client, profileId) {
  const result = await client.query(
    'SELECT * FROM user_food_profiles WHERE profile_id = $1',
    [requiredString(profileId, 'profile_id')],
  );
  return result.rows[0] || null;
}

async function fetchTasteProfileByUserId(client, userId) {
  const result = await client.query(
    'SELECT * FROM user_food_profiles WHERE user_id = $1',
    [requiredString(userId, 'user_id')],
  );
  return result.rows[0] || null;
}

async function fetchTasteProfilePreferences(client, profileId) {
  const result = await client.query(`
    SELECT *
    FROM user_food_preferences
    WHERE profile_id = $1
    ORDER BY preference_type ASC, preference_score DESC, preference_key ASC
  `, [profileId]);
  return result.rows || [];
}

async function fetchTasteProfileConstraints(client, profileId) {
  const result = await client.query(`
    SELECT *
    FROM user_food_constraints
    WHERE profile_id = $1
    ORDER BY constraint_type ASC, target_type ASC, target_key ASC
  `, [profileId]);
  return result.rows || [];
}

async function fetchTasteProfileFeedbackEvents(client, profileId) {
  const result = await client.query(`
    SELECT
      e.*,
      r.recipe_key,
      r.cuisine_tags_json,
      r.dietary_tags_json,
      r.meal_type_tags_json
    FROM recipe_feedback_events e
    LEFT JOIN recipes r
      ON r.recipe_id = e.recipe_id
    WHERE e.profile_id = $1
    ORDER BY e.created_at ASC, e.feedback_id ASC
  `, [profileId]);
  return (result.rows || []).map((row) => hydrateJsonFields(row, [
    'reason_tags_json',
    'context_json',
    'cuisine_tags_json',
    'dietary_tags_json',
    'meal_type_tags_json',
  ]));
}

async function fetchTasteProfileNoteSignals(client, profileId) {
  const result = await client.query(`
    SELECT
      s.*,
      e.recipe_id,
      e.recipe_key_snapshot,
      e.event_type
    FROM recipe_feedback_note_signals s
    JOIN recipe_feedback_events e
      ON e.feedback_id = s.feedback_id
    WHERE s.profile_id = $1
    ORDER BY s.created_at ASC, s.signal_id ASC
  `, [profileId]);
  return (result.rows || []).map((row) => hydrateJsonFields(row, ['extraction_json']));
}

async function fetchTasteProfileRecipeMetadata(client, recipeIds = []) {
  const metadataResult = await client.query(`
    SELECT
      ph.recipe_id,
      ph.staged_recipe_id,
      ph.created_at,
      ph.id AS promotion_history_id,
      sr.region_tags_json,
      sr.feeling_tags_json,
      sr.flavor_profile_json,
      sr.texture_profile_json
    FROM recipe_promotion_history ph
    JOIN recipe_ingest_staged_recipes sr
      ON sr.staged_recipe_id = ph.staged_recipe_id
    WHERE ph.recipe_id = ANY($1::text[])
      AND ph.decision = 'approved'
    ORDER BY ph.recipe_id ASC, ph.created_at DESC, ph.id DESC
  `, [recipeIds]);

  const metadataByRecipeId = new Map();
  for (const row of metadataResult.rows || []) {
    if (metadataByRecipeId.has(row.recipe_id)) continue;
    metadataByRecipeId.set(row.recipe_id, hydrateJsonFields(row, [
      'region_tags_json',
      'feeling_tags_json',
      'flavor_profile_json',
      'texture_profile_json',
    ]));
  }

  const stagedRecipeIds = [...new Set(
    [...metadataByRecipeId.values()]
      .map((row) => nullableString(row.staged_recipe_id))
      .filter(Boolean),
  )];
  if (stagedRecipeIds.length === 0) {
    return metadataByRecipeId;
  }

  const methodsResult = await client.query(`
    SELECT *
    FROM recipe_ingest_staged_methods
    WHERE staged_recipe_id = ANY($1::text[])
    ORDER BY staged_recipe_id ASC, method_key ASC, staged_recipe_method_id ASC
  `, [stagedRecipeIds]);

  const methodsByStagedRecipeId = new Map();
  for (const row of methodsResult.rows || []) {
    const stagedRecipeId = row.staged_recipe_id;
    const list = methodsByStagedRecipeId.get(stagedRecipeId) || [];
    list.push(hydrateJsonFields(row, ['extraction_json']));
    methodsByStagedRecipeId.set(stagedRecipeId, list);
  }

  for (const [recipeId, metadata] of metadataByRecipeId.entries()) {
    metadataByRecipeId.set(recipeId, {
      ...metadata,
      methods: methodsByStagedRecipeId.get(metadata.staged_recipe_id) || [],
    });
  }
  return metadataByRecipeId;
}

async function nextTasteProfileSnapshotVersion(client, profileId) {
  const result = await client.query(`
    SELECT COALESCE(MAX(snapshot_version), 0) AS current_version
    FROM user_taste_profile_snapshots
    WHERE profile_id = $1
  `, [profileId]);
  return Number(result.rows[0]?.current_version || 0) + 1;
}

async function insertTasteProfileSnapshot(client, input = {}) {
  const record = normalizeTasteProfileSnapshotRecord(input);
  const result = await client.query(`
    INSERT INTO user_taste_profile_snapshots (
      snapshot_id,
      profile_id,
      user_id,
      snapshot_version,
      source_event_count,
      source_recipe_count,
      flavor_vector_json,
      texture_vector_json,
      cuisine_vector_json,
      region_vector_json,
      feeling_vector_json,
      meal_type_vector_json,
      cooking_method_vector_json,
      dietary_pattern_json,
      disliked_patterns_json,
      preferred_constraints_json,
      confidence_json,
      generation_method,
      rules_version
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb,
      $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18, $19
    )
    RETURNING *
  `, tasteProfileSnapshotParams(record));
  return hydrateTasteProfileSnapshotRow(result.rows[0]);
}

async function insertTasteProfileSignalSource(client, input = {}) {
  const record = normalizeTasteProfileSignalSourceRecord(input);
  const result = await client.query(`
    INSERT INTO user_taste_profile_signal_sources (
      source_id,
      snapshot_id,
      profile_id,
      source_type,
      source_ref_id,
      signal_family,
      signal_key,
      signal_score,
      weight,
      evidence_json
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    RETURNING *
  `, tasteProfileSignalSourceParams(record));
  return hydrateTasteProfileSignalSourceRow(result.rows[0]);
}

function normalizeTasteProfileBuildOptions(options = {}) {
  return {
    profile_id: nullableString(options.profileId || options.profile_id),
    user_id: nullableString(options.userId || options.user_id),
    all: Boolean(options.all),
    dry_run: Boolean(options.dryRun || options.dry_run),
    limit: positiveInteger(options.limit, DEFAULT_TASTE_PROFILE_BUILD_LIMIT),
  };
}

function normalizeTasteProfileSnapshotRecord(input = {}) {
  return {
    snapshot_id: requiredString(input.snapshot_id || input.snapshotId, 'snapshot_id'),
    profile_id: requiredString(input.profile_id || input.profileId, 'profile_id'),
    user_id: requiredString(input.user_id || input.userId, 'user_id'),
    snapshot_version: positiveInteger(input.snapshot_version || input.snapshotVersion, 1),
    source_event_count: nonNegativeInteger(input.source_event_count ?? input.sourceEventCount, 'source_event_count'),
    source_recipe_count: nonNegativeInteger(input.source_recipe_count ?? input.sourceRecipeCount, 'source_recipe_count'),
    flavor_vector_json: normalizeJsonObject(input.flavor_vector_json || input.flavorVectorJson || {}),
    texture_vector_json: normalizeJsonObject(input.texture_vector_json || input.textureVectorJson || {}),
    cuisine_vector_json: normalizeJsonObject(input.cuisine_vector_json || input.cuisineVectorJson || {}),
    region_vector_json: normalizeJsonObject(input.region_vector_json || input.regionVectorJson || {}),
    feeling_vector_json: normalizeJsonObject(input.feeling_vector_json || input.feelingVectorJson || {}),
    meal_type_vector_json: normalizeJsonObject(input.meal_type_vector_json || input.mealTypeVectorJson || {}),
    cooking_method_vector_json: normalizeJsonObject(input.cooking_method_vector_json || input.cookingMethodVectorJson || {}),
    dietary_pattern_json: normalizeJsonObject(input.dietary_pattern_json || input.dietaryPatternJson || {}),
    disliked_patterns_json: normalizeJsonObject(input.disliked_patterns_json || input.dislikedPatternsJson || {}),
    preferred_constraints_json: normalizeJsonObject(input.preferred_constraints_json || input.preferredConstraintsJson || {}),
    confidence_json: normalizeJsonObject(input.confidence_json || input.confidenceJson || {}),
    generation_method: requiredString(input.generation_method || input.generationMethod || DEFAULT_TASTE_PROFILE_GENERATION_METHOD, 'generation_method'),
    rules_version: requiredString(input.rules_version || input.rulesVersion || DEFAULT_TASTE_PROFILE_RULES_VERSION, 'rules_version'),
  };
}

function normalizeTasteProfileSignalSourceRecord(input = {}) {
  return {
    source_id: requiredString(input.source_id || input.sourceId, 'source_id'),
    snapshot_id: requiredString(input.snapshot_id || input.snapshotId, 'snapshot_id'),
    profile_id: requiredString(input.profile_id || input.profileId, 'profile_id'),
    source_type: normalizeSourceType(input.source_type || input.sourceType),
    source_ref_id: nullableString(input.source_ref_id || input.sourceRefId),
    signal_family: normalizeSignalFamily(input.signal_family || input.signalFamily),
    signal_key: requiredString(normalizeSignalKey(input.signal_key || input.signalKey), 'signal_key'),
    signal_score: clampSignedScore(input.signal_score ?? input.signalScore),
    weight: normalizeWeight(input.weight),
    evidence_json: normalizeJsonObject(input.evidence_json || input.evidenceJson || {}),
  };
}

function tasteProfileSnapshotParams(record) {
  return [
    record.snapshot_id,
    record.profile_id,
    record.user_id,
    record.snapshot_version,
    record.source_event_count,
    record.source_recipe_count,
    JSON.stringify(record.flavor_vector_json),
    JSON.stringify(record.texture_vector_json),
    JSON.stringify(record.cuisine_vector_json),
    JSON.stringify(record.region_vector_json),
    JSON.stringify(record.feeling_vector_json),
    JSON.stringify(record.meal_type_vector_json),
    JSON.stringify(record.cooking_method_vector_json),
    JSON.stringify(record.dietary_pattern_json),
    JSON.stringify(record.disliked_patterns_json),
    JSON.stringify(record.preferred_constraints_json),
    JSON.stringify(record.confidence_json),
    record.generation_method,
    record.rules_version,
  ];
}

function tasteProfileSignalSourceParams(record) {
  return [
    record.source_id,
    record.snapshot_id,
    record.profile_id,
    record.source_type,
    record.source_ref_id,
    record.signal_family,
    record.signal_key,
    record.signal_score,
    record.weight,
    JSON.stringify(record.evidence_json),
  ];
}

function hydrateTasteProfileSnapshotRow(row) {
  return hydrateJsonFields(row, [
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
  ]);
}

function hydrateTasteProfileSignalSourceRow(row) {
  return hydrateJsonFields(row, ['evidence_json']);
}

function hydrateJsonFields(row, fields = []) {
  if (!row) return null;
  const hydrated = { ...row };
  for (const field of fields) {
    hydrated[field] = parseJson(hydrated[field], field.endsWith('_json') ? {} : null);
  }
  return hydrated;
}

function addPatternContribution(accumulator, key, signalScore, weight) {
  if (!key) return;
  const current = accumulator.get(key) || { total: 0, weight: 0 };
  current.total = roundNumber(current.total + (clampSignedScore(signalScore) * normalizeWeight(weight)));
  current.weight = roundNumber(current.weight + normalizeWeight(weight));
  accumulator.set(key, current);
}

function buildUserTasteProfileSnapshotId(profileId, snapshotVersion) {
  return `taste_profile_snapshot:${normalizeSignalKey(profileId)}:${String(positiveInteger(snapshotVersion, 1)).padStart(4, '0')}`;
}

function buildUserTasteProfileSignalSourceId(snapshotId, ordinal) {
  return `taste_profile_signal:${normalizeSignalKey(snapshotId)}:${String(positiveInteger(ordinal, 1)).padStart(4, '0')}`;
}

function normalizeSourceType(value) {
  const normalized = requiredString(value, 'source_type');
  if (!SUPPORTED_TASTE_PROFILE_SOURCE_TYPES.includes(normalized)) {
    throw new Error(`Unsupported source_type: ${value}`);
  }
  return normalized;
}

function normalizeSignalFamily(value) {
  const normalized = requiredString(value, 'signal_family');
  if (!SUPPORTED_TASTE_PROFILE_SIGNAL_FAMILIES.includes(normalized)) {
    throw new Error(`Unsupported signal_family: ${value}`);
  }
  return normalized;
}

function normalizeSignalKey(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}0-9]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeSignalKey).filter(Boolean))].sort();
}

function normalizeJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

function normalizeWeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error('weight must be a non-negative number.');
  }
  return roundNumber(numeric);
}

function clampSignedScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return roundNumber(Math.max(-1, Math.min(1, numeric)));
}

function roundNumber(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function requiredString(value, fieldName) {
  const normalized = nullableString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

function positiveInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function nonNegativeInteger(value, fieldName) {
  const numeric = Number(value ?? 0);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return numeric;
}

function nullableProbability(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new Error(`${fieldName} must be between 0 and 1.`);
  }
  return roundNumber(numeric);
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''),
  );
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function compareSignalEntries(left, right) {
  return Math.abs(right.score) - Math.abs(left.score)
    || right.score - left.score
    || left.key.localeCompare(right.key);
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_TASTE_PROFILE_BUILD_LIMIT,
  DEFAULT_TASTE_PROFILE_GENERATION_METHOD,
  DEFAULT_TASTE_PROFILE_RULES_VERSION,
  FEEDBACK_EVENT_INFLUENCE,
  NOTE_SIGNAL_FAMILY_MAP,
  SUPPORTED_TASTE_PROFILE_SIGNAL_FAMILIES,
  SUPPORTED_TASTE_PROFILE_SOURCE_TYPES,
  buildTasteProfileConfidence,
  buildUserTasteProfileSignalSourceId,
  buildUserTasteProfileSnapshot,
  buildUserTasteProfileSnapshotId,
  buildUserTasteProfileSnapshots,
  classifyTasteProfileConfidence,
  computeUserTasteProfileSnapshot,
  feedbackEventInfluence,
  hydrateTasteProfileSignalSourceRow,
  hydrateTasteProfileSnapshotRow,
  listUserTasteProfileSignalSources,
  listUserTasteProfileSnapshots,
  normalizeTasteProfileBuildOptions,
  normalizeTasteProfileSignalSourceRecord,
  normalizeTasteProfileSnapshotRecord,
};
