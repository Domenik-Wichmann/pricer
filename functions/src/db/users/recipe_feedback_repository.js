const { getRecipeById, getRecipeByKey } = require('../recipes/recipe_repository');
const { getUserFoodProfileById, getUserFoodProfileByUserId, normalizeKey } = require('./user_food_profile_repository');

const SUPPORTED_RECIPE_FEEDBACK_EVENT_TYPES = Object.freeze([
  'impression',
  'swipe_left',
  'swipe_right',
  'swipe_up',
  'saved',
  'cooked',
  'cooked_again',
  'dismissed',
]);
const SUPPORTED_RECIPE_FEEDBACK_SOURCES = Object.freeze([
  'swipe',
  'explicit',
  'note',
  'system',
]);
const SUPPORTED_RECIPE_FEEDBACK_SIGNAL_TYPES = Object.freeze([
  'taste',
  'texture',
  'timing',
  'difficulty',
  'substitution',
  'portion_size',
  'family_response',
  'price',
  'availability',
]);
const SUPPORTED_RECIPE_FEEDBACK_POLARITIES = Object.freeze([
  'positive',
  'negative',
  'neutral',
]);
const SUPPORTED_RECIPE_FEEDBACK_EXTRACTION_METHODS = Object.freeze([
  'manual_tag',
  'future_llm',
  'rule',
]);

const DEFAULT_EVENT_SCORES = Object.freeze({
  impression: Object.freeze({ sentiment_score: 0, intent_score: 0, source: 'system' }),
  swipe_left: Object.freeze({ sentiment_score: -1, intent_score: 0, source: 'swipe' }),
  swipe_right: Object.freeze({ sentiment_score: 0.5, intent_score: 0.6, source: 'swipe' }),
  swipe_up: Object.freeze({ sentiment_score: 1, intent_score: 1, source: 'swipe' }),
  saved: Object.freeze({ sentiment_score: 0.8, intent_score: 0.9, source: 'explicit' }),
  cooked: Object.freeze({ sentiment_score: 0.5, intent_score: 0.8, source: 'explicit' }),
  cooked_again: Object.freeze({ sentiment_score: 1, intent_score: 1, source: 'explicit' }),
  dismissed: Object.freeze({ sentiment_score: -0.5, intent_score: 0.1, source: 'explicit' }),
});

async function recordRecipeImpression(client, input = {}) {
  return recordRecipeFeedbackEvent(client, {
    ...input,
    eventType: 'impression',
  });
}

async function recordRecipeSwipeLeft(client, input = {}) {
  return recordRecipeFeedbackEvent(client, {
    ...input,
    eventType: 'swipe_left',
  });
}

async function recordRecipeSwipeRight(client, input = {}) {
  return recordRecipeFeedbackEvent(client, {
    ...input,
    eventType: 'swipe_right',
  });
}

async function recordRecipeSwipeUp(client, input = {}) {
  return recordRecipeFeedbackEvent(client, {
    ...input,
    eventType: 'swipe_up',
  });
}

async function recordRecipeSaved(client, input = {}) {
  return recordRecipeFeedbackEvent(client, {
    ...input,
    eventType: 'saved',
  });
}

async function recordRecipeCooked(client, input = {}) {
  return recordRecipeFeedbackEvent(client, {
    ...input,
    eventType: 'cooked',
  });
}

async function recordRecipeCookedAgain(client, input = {}) {
  return recordRecipeFeedbackEvent(client, {
    ...input,
    eventType: 'cooked_again',
  });
}

async function recordRecipeDismissed(client, input = {}) {
  return recordRecipeFeedbackEvent(client, {
    ...input,
    eventType: 'dismissed',
  });
}

async function recordRecipeFeedbackNote(client, input = {}) {
  return recordRecipeFeedbackEvent(client, {
    ...input,
    eventType: input.event_type || input.eventType || 'saved',
    source: input.source || 'note',
  });
}

async function recordRecipeFeedbackEvent(client, input = {}) {
  requireClient(client);
  const profile = await requireResolvedProfile(client, input);
  const recipe = await requireResolvedRecipe(client, input);
  const record = normalizeRecipeFeedbackRecord(input, {
    profile,
    recipe,
  });
  const insertResult = await client.query(`
    INSERT INTO recipe_feedback_events (
      feedback_id,
      profile_id,
      user_id,
      recipe_id,
      recipe_key_snapshot,
      event_type,
      sentiment_score,
      intent_score,
      reason_tags_json,
      note_text,
      note_language,
      source,
      context_json,
      created_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9::jsonb, $10, $11, $12, $13::jsonb, $14::timestamptz
    )
    ON CONFLICT (feedback_id) DO NOTHING
    RETURNING *
  `, recipeFeedbackParams(record));
  if (insertResult.rows && insertResult.rows[0]) {
    return hydrateRecipeFeedbackEventRow(insertResult.rows[0]);
  }

  const existing = await getRecipeFeedbackById(client, record.feedback_id);
  return existing;
}

async function attachManualNoteSignals(client, input = {}) {
  requireClient(client);
  const feedback = await getRequiredRecipeFeedback(client, input.feedback_id || input.feedbackId);
  const signals = Array.isArray(input.signals) ? input.signals : [input];
  const rows = [];

  for (let index = 0; index < signals.length; index += 1) {
    const signal = normalizeRecipeFeedbackSignalRecord(signals[index], {
      feedback,
      signalIndex: index,
    });
    const insertResult = await client.query(`
      INSERT INTO recipe_feedback_note_signals (
        signal_id,
        feedback_id,
        profile_id,
        recipe_id,
        signal_type,
        signal_key,
        signal_value,
        polarity,
        confidence,
        extraction_method,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz)
      ON CONFLICT (signal_id) DO NOTHING
      RETURNING *
    `, recipeFeedbackSignalParams(signal));
    if (insertResult.rows && insertResult.rows[0]) {
      rows.push(hydrateRecipeFeedbackSignalRow(insertResult.rows[0]));
      continue;
    }
    const existing = await getRecipeFeedbackSignalById(client, signal.signal_id);
    if (existing) rows.push(existing);
  }

  return rows;
}

async function listFeedbackByProfileId(client, input = {}) {
  requireClient(client);
  const profile = await requireResolvedProfile(client, input);
  const limit = positiveInteger(input.limit, 1000);
  const result = await client.query(`
    SELECT *
    FROM recipe_feedback_events
    WHERE profile_id = $1
    ORDER BY created_at DESC, feedback_id DESC
    LIMIT $2
  `, [profile.profile_id, limit]);
  return (result.rows || []).map(hydrateRecipeFeedbackEventRow);
}

async function listFeedbackByRecipeId(client, input = {}) {
  requireClient(client);
  const recipe = await requireResolvedRecipe(client, input);
  const limit = positiveInteger(input.limit, 1000);
  const result = await client.query(`
    SELECT *
    FROM recipe_feedback_events
    WHERE recipe_id = $1
    ORDER BY created_at DESC, feedback_id DESC
    LIMIT $2
  `, [recipe.recipe_id, limit]);
  return (result.rows || []).map(hydrateRecipeFeedbackEventRow);
}

async function getLatestFeedbackForProfileAndRecipe(client, input = {}) {
  requireClient(client);
  const profile = await requireResolvedProfile(client, input);
  const recipe = await requireResolvedRecipe(client, input);
  const result = await client.query(`
    SELECT *
    FROM recipe_feedback_events
    WHERE profile_id = $1
      AND recipe_id = $2
    ORDER BY created_at DESC, feedback_id DESC
    LIMIT $3
  `, [profile.profile_id, recipe.recipe_id, 1]);
  return hydrateRecipeFeedbackEventRow((result.rows || [])[0] || null);
}

async function aggregateFeedbackSummaryByProfile(client, input = {}) {
  const profile = await requireResolvedProfile(client, input);
  const events = await listFeedbackByProfileId(client, { profileId: profile.profile_id, limit: positiveInteger(input.limit, 5000) });
  return buildRecipeFeedbackSummary(events, {
    profile_id: profile.profile_id,
    user_id: profile.user_id,
    summary_scope: 'profile',
  });
}

async function aggregateFeedbackSummaryByRecipe(client, input = {}) {
  const recipe = await requireResolvedRecipe(client, input);
  const events = await listFeedbackByRecipeId(client, { recipeId: recipe.recipe_id, limit: positiveInteger(input.limit, 5000) });
  return buildRecipeFeedbackSummary(events, {
    recipe_id: recipe.recipe_id,
    recipe_key: recipe.recipe_key,
    summary_scope: 'recipe',
  });
}

async function getRecipeFeedbackById(client, feedbackId) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM recipe_feedback_events WHERE feedback_id = $1',
    [requiredString(feedbackId, 'feedback_id')],
  );
  return hydrateRecipeFeedbackEventRow((result.rows || [])[0] || null);
}

async function getRecipeFeedbackSignalById(client, signalId) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM recipe_feedback_note_signals WHERE signal_id = $1',
    [requiredString(signalId, 'signal_id')],
  );
  return hydrateRecipeFeedbackSignalRow((result.rows || [])[0] || null);
}

function deleteRecipeFeedbackEvent() {
  throw new Error('Recipe feedback events are append-only user history and must not be deleted.');
}

function normalizeRecipeFeedbackRecord(input = {}, { profile, recipe } = {}) {
  const eventType = normalizeEnum(input.event_type || input.eventType, {
    fieldName: 'event_type',
    supportedValues: SUPPORTED_RECIPE_FEEDBACK_EVENT_TYPES,
  });
  const defaults = DEFAULT_EVENT_SCORES[eventType];
  const createdAt = normalizeCreatedAt(input.created_at || input.createdAt);
  const feedbackKey = input.feedback_key || input.feedbackKey;
  return {
    feedback_id: requiredString(
      input.feedback_id
      || input.feedbackId
      || buildRecipeFeedbackId({
        profileId: profile.profile_id,
        recipeId: recipe.recipe_id,
        eventType,
        feedbackKey,
        createdAt,
      }),
      'feedback_id',
    ),
    profile_id: requiredString(profile.profile_id, 'profile_id'),
    user_id: requiredString(input.user_id || input.userId || profile.user_id, 'user_id'),
    recipe_id: requiredString(recipe.recipe_id, 'recipe_id'),
    recipe_key_snapshot: requiredString(
      input.recipe_key_snapshot || input.recipeKeySnapshot || recipe.recipe_key,
      'recipe_key_snapshot',
    ),
    event_type: eventType,
    sentiment_score: nullableBoundedNumber(
      input.sentiment_score ?? input.sentimentScore ?? defaults.sentiment_score,
      'sentiment_score',
      -1,
      1,
    ),
    intent_score: nullableBoundedNumber(
      input.intent_score ?? input.intentScore ?? defaults.intent_score,
      'intent_score',
      0,
      1,
    ),
    reason_tags_json: normalizeStringArray(input.reason_tags_json || input.reasonTagsJson || input.reason_tags || input.reasonTags),
    note_text: nullableString(input.note_text || input.noteText),
    note_language: nullableString(input.note_language || input.noteLanguage),
    source: normalizeEnum(input.source || defaults.source, {
      fieldName: 'source',
      supportedValues: SUPPORTED_RECIPE_FEEDBACK_SOURCES,
    }),
    context_json: normalizeObject(input.context_json || input.contextJson),
    created_at: createdAt,
  };
}

function normalizeRecipeFeedbackSignalRecord(input = {}, { feedback, signalIndex = 0 } = {}) {
  const createdAt = normalizeCreatedAt(input.created_at || input.createdAt || feedback.created_at);
  const signalType = normalizeEnum(input.signal_type || input.signalType, {
    fieldName: 'signal_type',
    supportedValues: SUPPORTED_RECIPE_FEEDBACK_SIGNAL_TYPES,
  });
  const signalKey = normalizeSignalKey(input.signal_key || input.signalKey, 'signal_key');
  return {
    signal_id: requiredString(
      input.signal_id
      || input.signalId
      || buildRecipeFeedbackSignalId({
        feedbackId: feedback.feedback_id,
        signalType,
        signalKey,
        signalIndex,
      }),
      'signal_id',
    ),
    feedback_id: requiredString(feedback.feedback_id, 'feedback_id'),
    profile_id: requiredString(feedback.profile_id, 'profile_id'),
    recipe_id: requiredString(feedback.recipe_id, 'recipe_id'),
    signal_type: signalType,
    signal_key: signalKey,
    signal_value: nullableString(input.signal_value || input.signalValue),
    polarity: normalizeEnum(input.polarity || 'neutral', {
      fieldName: 'polarity',
      supportedValues: SUPPORTED_RECIPE_FEEDBACK_POLARITIES,
    }),
    confidence: nullableBoundedNumber(input.confidence ?? 1, 'confidence', 0, 1),
    extraction_method: normalizeEnum(input.extraction_method || input.extractionMethod || 'manual_tag', {
      fieldName: 'extraction_method',
      supportedValues: SUPPORTED_RECIPE_FEEDBACK_EXTRACTION_METHODS,
    }),
    created_at: createdAt,
  };
}

function buildRecipeFeedbackSummary(events = [], base = {}) {
  const eventCounts = {};
  let sentimentSum = 0;
  let sentimentCount = 0;
  let intentSum = 0;
  let intentCount = 0;
  let positiveEventCount = 0;
  let negativeEventCount = 0;
  const distinctRecipeIds = new Set();
  const distinctProfileIds = new Set();

  for (const event of events) {
    eventCounts[event.event_type] = (eventCounts[event.event_type] || 0) + 1;
    if (event.recipe_id) distinctRecipeIds.add(event.recipe_id);
    if (event.profile_id) distinctProfileIds.add(event.profile_id);
    if (typeof event.sentiment_score === 'number') {
      sentimentSum += event.sentiment_score;
      sentimentCount += 1;
      if (event.sentiment_score > 0) positiveEventCount += 1;
      if (event.sentiment_score < 0) negativeEventCount += 1;
    }
    if (typeof event.intent_score === 'number') {
      intentSum += event.intent_score;
      intentCount += 1;
    }
  }

  return {
    ...base,
    total_events: events.length,
    distinct_recipe_count: distinctRecipeIds.size,
    distinct_profile_count: distinctProfileIds.size,
    positive_event_count: positiveEventCount,
    negative_event_count: negativeEventCount,
    average_sentiment_score: sentimentCount ? roundNumber(sentimentSum / sentimentCount) : null,
    average_intent_score: intentCount ? roundNumber(intentSum / intentCount) : null,
    latest_event_at: events[0] ? events[0].created_at : null,
    event_counts: eventCounts,
  };
}

function recipeFeedbackParams(record) {
  return [
    record.feedback_id,
    record.profile_id,
    record.user_id,
    record.recipe_id,
    record.recipe_key_snapshot,
    record.event_type,
    record.sentiment_score,
    record.intent_score,
    JSON.stringify(record.reason_tags_json),
    record.note_text,
    record.note_language,
    record.source,
    JSON.stringify(record.context_json),
    record.created_at,
  ];
}

function recipeFeedbackSignalParams(record) {
  return [
    record.signal_id,
    record.feedback_id,
    record.profile_id,
    record.recipe_id,
    record.signal_type,
    record.signal_key,
    record.signal_value,
    record.polarity,
    record.confidence,
    record.extraction_method,
    record.created_at,
  ];
}

function hydrateRecipeFeedbackEventRow(row) {
  if (!row) return null;
  return {
    ...row,
    reason_tags_json: parseJson(row.reason_tags_json, []),
    context_json: parseJson(row.context_json, {}),
  };
}

function hydrateRecipeFeedbackSignalRow(row) {
  return row ? { ...row } : null;
}

function buildRecipeFeedbackId({
  profileId,
  recipeId,
  eventType,
  feedbackKey = null,
  createdAt = null,
} = {}) {
  const suffix = feedbackKey
    ? normalizeSignalKey(feedbackKey, 'feedback_key')
    : normalizeTimestampKey(createdAt || new Date().toISOString());
  return [
    'recipe_feedback',
    normalizeSignalKey(profileId, 'profile_id'),
    normalizeSignalKey(recipeId, 'recipe_id'),
    eventType,
    suffix,
  ].join(':');
}

function buildRecipeFeedbackSignalId({
  feedbackId,
  signalType,
  signalKey,
  signalIndex = 0,
} = {}) {
  return [
    'recipe_feedback_signal',
    normalizeSignalKey(feedbackId, 'feedback_id'),
    signalType,
    signalKey,
    String(signalIndex).padStart(2, '0'),
  ].join(':');
}

async function requireResolvedProfile(client, input = {}) {
  const profile = await resolveProfile(client, input);
  if (!profile) {
    throw new Error('User food profile not found.');
  }
  return profile;
}

async function resolveProfile(client, input = {}) {
  if (input.profile_id || input.profileId) {
    return getUserFoodProfileById(client, input.profile_id || input.profileId);
  }
  if (input.user_id || input.userId) {
    return getUserFoodProfileByUserId(client, input.user_id || input.userId);
  }
  throw new Error('profile_id or user_id is required.');
}

async function requireResolvedRecipe(client, input = {}) {
  const recipe = await resolveRecipe(client, input);
  if (!recipe) {
    throw new Error('Recipe not found.');
  }
  return recipe;
}

async function resolveRecipe(client, input = {}) {
  if (input.recipe_id || input.recipeId) {
    return getRecipeById(client, input.recipe_id || input.recipeId);
  }
  if (input.recipe_key || input.recipeKey) {
    return getRecipeByKey(client, input.recipe_key || input.recipeKey);
  }
  throw new Error('recipe_id or recipe_key is required.');
}

async function getRequiredRecipeFeedback(client, feedbackId) {
  const feedback = await getRecipeFeedbackById(client, feedbackId);
  if (!feedback) {
    throw new Error('Recipe feedback event not found.');
  }
  return feedback;
}

function normalizeSignalKey(value, fieldName) {
  const normalized = normalizeKey(requiredString(value, fieldName));
  if (!normalized) throw new Error(`${fieldName} is required.`);
  return normalized;
}

function normalizeTimestampKey(value) {
  return String(value || '')
    .replace(/[^0-9]+/g, '')
    .trim();
}

function normalizeStringArray(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) {
    return value.map((entry) => nullableString(entry)).filter(Boolean);
  }
  if (typeof value === 'string') {
    const parsed = parseJson(value, null);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => nullableString(entry)).filter(Boolean);
    }
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return [nullableString(value)].filter(Boolean);
}

function normalizeObject(value) {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'string') {
    const parsed = parseJson(value, null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    throw new Error('context_json must be an object.');
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  throw new Error('context_json must be an object.');
}

function normalizeCreatedAt(value) {
  const normalized = nullableString(value);
  return normalized || new Date().toISOString();
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function roundNumber(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function positiveInteger(value, fallback) {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function nullableBoundedNumber(value, fieldName, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}.`);
  }
  return roundNumber(numeric);
}

function normalizeEnum(value, { fieldName, supportedValues }) {
  const normalized = requiredString(value, fieldName);
  if (!supportedValues.includes(normalized)) {
    throw new Error(`Unsupported ${fieldName}: ${normalized}`);
  }
  return normalized;
}

function requiredString(value, fieldName) {
  const normalized = nullableString(value);
  if (!normalized) throw new Error(`${fieldName} is required.`);
  return normalized;
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_EVENT_SCORES,
  SUPPORTED_RECIPE_FEEDBACK_EVENT_TYPES,
  SUPPORTED_RECIPE_FEEDBACK_EXTRACTION_METHODS,
  SUPPORTED_RECIPE_FEEDBACK_POLARITIES,
  SUPPORTED_RECIPE_FEEDBACK_SIGNAL_TYPES,
  SUPPORTED_RECIPE_FEEDBACK_SOURCES,
  aggregateFeedbackSummaryByProfile,
  aggregateFeedbackSummaryByRecipe,
  attachManualNoteSignals,
  buildRecipeFeedbackId,
  buildRecipeFeedbackSignalId,
  buildRecipeFeedbackSummary,
  deleteRecipeFeedbackEvent,
  getLatestFeedbackForProfileAndRecipe,
  getRecipeFeedbackById,
  getRecipeFeedbackSignalById,
  hydrateRecipeFeedbackEventRow,
  hydrateRecipeFeedbackSignalRow,
  listFeedbackByProfileId,
  listFeedbackByRecipeId,
  normalizeRecipeFeedbackRecord,
  normalizeRecipeFeedbackSignalRecord,
  recordRecipeCooked,
  recordRecipeCookedAgain,
  recordRecipeDismissed,
  recordRecipeFeedbackEvent,
  recordRecipeFeedbackNote,
  recordRecipeImpression,
  recordRecipeSaved,
  recordRecipeSwipeLeft,
  recordRecipeSwipeRight,
  recordRecipeSwipeUp,
};
