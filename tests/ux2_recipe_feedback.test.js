const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  attachManualNoteSignals,
  aggregateFeedbackSummaryByProfile,
  aggregateFeedbackSummaryByRecipe,
  deleteRecipeFeedbackEvent,
  getLatestFeedbackForProfileAndRecipe,
  recordRecipeCooked,
  recordRecipeCookedAgain,
  recordRecipeFeedbackNote,
  recordRecipeImpression,
  recordRecipeSaved,
  recordRecipeSwipeLeft,
  recordRecipeSwipeRight,
  recordRecipeSwipeUp,
} = require('../app/functions/src');
const { parseArgs, seedRecipeFeedback } = require('../scripts/ux2_seed_recipe_feedback');

function makeClient() {
  const state = {
    profilesById: new Map(),
    profilesByUserId: new Map(),
    recipesById: new Map(),
    recipesByKey: new Map(),
    eventsById: new Map(),
    signalsById: new Map(),
    commands: [],
  };

  seedProfile(state, {
    profile_id: 'user_food_profile:user_weight_loss_demo',
    user_id: 'user_weight_loss_demo',
  });
  seedProfile(state, {
    profile_id: 'user_food_profile:user_family_meal_demo',
    user_id: 'user_family_meal_demo',
  });
  seedProfile(state, {
    profile_id: 'user_food_profile:user_picky_low_spice_demo',
    user_id: 'user_picky_low_spice_demo',
  });

  seedRecipe(state, { recipe_id: 'recipe:chicken_rice_bowl', recipe_key: 'chicken_rice_bowl', title_en: 'Chicken Rice Bowl' });
  seedRecipe(state, { recipe_id: 'recipe:pork_potato_stew', recipe_key: 'pork_potato_stew', title_en: 'Pork Potato Stew' });
  seedRecipe(state, { recipe_id: 'recipe:green_bean_chicken_plate', recipe_key: 'green_bean_chicken_plate', title_en: 'Green Bean Chicken Plate' });
  seedRecipe(state, { recipe_id: 'recipe:beef_rice_skillet', recipe_key: 'beef_rice_skillet', title_en: 'Beef Rice Skillet' });
  seedRecipe(state, { recipe_id: 'recipe:apple_milk_bowl', recipe_key: 'apple_milk_bowl', title_en: 'Apple Milk Bowl' });

  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });

      if (normalizedSql === 'SELECT * FROM user_food_profiles WHERE profile_id = $1') {
        return { rows: state.profilesById.get(params[0]) ? [state.profilesById.get(params[0])] : [] };
      }

      if (normalizedSql === 'SELECT * FROM user_food_profiles WHERE user_id = $1') {
        return { rows: state.profilesByUserId.get(params[0]) ? [state.profilesByUserId.get(params[0])] : [] };
      }

      if (normalizedSql === 'SELECT * FROM recipes WHERE recipe_id = $1') {
        return { rows: state.recipesById.get(params[0]) ? [state.recipesById.get(params[0])] : [] };
      }

      if (normalizedSql === 'SELECT * FROM recipes WHERE recipe_key = $1') {
        return { rows: state.recipesByKey.get(params[0]) ? [state.recipesByKey.get(params[0])] : [] };
      }

      if (normalizedSql.startsWith('INSERT INTO recipe_feedback_events')) {
        const row = recipeFeedbackRowFromParams(params);
        const existing = state.eventsById.get(row.feedback_id);
        if (existing) return { rows: [] };
        const stored = {
          ...row,
          created_at: row.created_at,
        };
        state.eventsById.set(stored.feedback_id, stored);
        return { rows: [stored] };
      }

      if (normalizedSql === 'SELECT * FROM recipe_feedback_events WHERE feedback_id = $1') {
        return { rows: state.eventsById.get(params[0]) ? [state.eventsById.get(params[0])] : [] };
      }

      if (normalizedSql.startsWith('SELECT * FROM recipe_feedback_events WHERE profile_id = $1 AND recipe_id = $2')) {
        const rows = [...state.eventsById.values()]
          .filter((row) => row.profile_id === params[0] && row.recipe_id === params[1])
          .sort(compareEventRows)
          .slice(0, Number(params[2]));
        return { rows };
      }

      if (normalizedSql.startsWith('SELECT * FROM recipe_feedback_events WHERE profile_id = $1')) {
        const rows = [...state.eventsById.values()]
          .filter((row) => row.profile_id === params[0])
          .sort(compareEventRows)
          .slice(0, Number(params[1]));
        return { rows };
      }

      if (normalizedSql.startsWith('SELECT * FROM recipe_feedback_events WHERE recipe_id = $1')) {
        const rows = [...state.eventsById.values()]
          .filter((row) => row.recipe_id === params[0])
          .sort(compareEventRows)
          .slice(0, Number(params[1]));
        return { rows };
      }

      if (normalizedSql.startsWith('INSERT INTO recipe_feedback_note_signals')) {
        const row = recipeFeedbackSignalRowFromParams(params);
        const existing = state.signalsById.get(row.signal_id);
        if (existing) return { rows: [] };
        const stored = {
          ...row,
          created_at: row.created_at,
        };
        state.signalsById.set(stored.signal_id, stored);
        return { rows: [stored] };
      }

      if (normalizedSql === 'SELECT * FROM recipe_feedback_note_signals WHERE signal_id = $1') {
        return { rows: state.signalsById.get(params[0]) ? [state.signalsById.get(params[0])] : [] };
      }

      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function seedProfile(state, row) {
  state.profilesById.set(row.profile_id, row);
  state.profilesByUserId.set(row.user_id, row);
}

function seedRecipe(state, row) {
  state.recipesById.set(row.recipe_id, row);
  state.recipesByKey.set(row.recipe_key, row);
}

function recipeFeedbackRowFromParams(params) {
  const columns = [
    'feedback_id',
    'profile_id',
    'user_id',
    'recipe_id',
    'recipe_key_snapshot',
    'event_type',
    'sentiment_score',
    'intent_score',
    'reason_tags_json',
    'note_text',
    'note_language',
    'source',
    'context_json',
    'created_at',
  ];
  const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
  row.reason_tags_json = JSON.parse(row.reason_tags_json);
  row.context_json = JSON.parse(row.context_json);
  return row;
}

function recipeFeedbackSignalRowFromParams(params) {
  const columns = [
    'signal_id',
    'feedback_id',
    'profile_id',
    'recipe_id',
    'signal_type',
    'signal_key',
    'signal_value',
    'polarity',
    'confidence',
    'extraction_method',
    'created_at',
  ];
  return Object.fromEntries(columns.map((column, index) => [column, params[index]]));
}

function compareEventRows(left, right) {
  return right.created_at.localeCompare(left.created_at)
    || right.feedback_id.localeCompare(left.feedback_id);
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '020_ux2_recipe_swipe_feedback.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS recipe_feedback_events'));
  assert(migration.includes('CREATE TABLE IF NOT EXISTS recipe_feedback_note_signals'));
  assert(migration.includes("'swipe_left'"));
  assert(migration.includes("source IN ('swipe', 'explicit', 'note', 'system')"));
  assert(migration.includes("signal_type IN ("));

  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data', 'seeds', 'recipe_feedback_seed.json'),
    'utf8',
  ));
  assert.equal(fixture.length >= 6, true);

  const client = makeClient();

  const impression = await recordRecipeImpression(client, {
    feedbackId: 'feedback_impression',
    userId: 'user_weight_loss_demo',
    recipeKey: 'chicken_rice_bowl',
    createdAt: '2026-04-25T09:00:00.000Z',
  });
  assert.equal(impression.event_type, 'impression');
  assert.equal(impression.source, 'system');

  const swipeLeft = await recordRecipeSwipeLeft(client, {
    feedbackId: 'feedback_swipe_left',
    userId: 'user_weight_loss_demo',
    recipeKey: 'pork_potato_stew',
    createdAt: '2026-04-25T09:01:00.000Z',
  });
  const swipeRight = await recordRecipeSwipeRight(client, {
    feedbackId: 'feedback_swipe_right',
    userId: 'user_weight_loss_demo',
    recipeKey: 'green_bean_chicken_plate',
    createdAt: '2026-04-25T09:02:00.000Z',
  });
  const swipeUp = await recordRecipeSwipeUp(client, {
    feedbackId: 'feedback_swipe_up',
    userId: 'user_weight_loss_demo',
    recipeKey: 'beef_rice_skillet',
    createdAt: '2026-04-25T09:03:00.000Z',
  });
  assert.equal(swipeLeft.sentiment_score, -1);
  assert.equal(swipeLeft.intent_score, 0);
  assert.equal(swipeRight.sentiment_score, 0.5);
  assert.equal(swipeRight.intent_score, 0.6);
  assert.equal(swipeUp.sentiment_score, 1);
  assert.equal(swipeUp.intent_score, 1);

  const saved = await recordRecipeSaved(client, {
    feedbackId: 'feedback_saved',
    userId: 'user_family_meal_demo',
    recipeKey: 'chicken_rice_bowl',
    createdAt: '2026-04-25T09:10:00.000Z',
  });
  const cooked = await recordRecipeCooked(client, {
    feedbackId: 'feedback_cooked',
    userId: 'user_family_meal_demo',
    recipeKey: 'pork_potato_stew',
    createdAt: '2026-04-25T09:20:00.000Z',
  });
  const cookedAgain = await recordRecipeCookedAgain(client, {
    feedbackId: 'feedback_cooked_again',
    userId: 'user_family_meal_demo',
    recipeKey: 'green_bean_chicken_plate',
    createdAt: '2026-04-25T09:30:00.000Z',
  });
  assert.equal(saved.intent_score, 0.9);
  assert.equal(cooked.sentiment_score, 0.5);
  assert.equal(cooked.intent_score, 0.8);
  assert.equal(cookedAgain.sentiment_score, 1);
  assert.equal(cookedAgain.intent_score, 1);

  const noteEvent = await recordRecipeFeedbackNote(client, {
    feedbackId: 'feedback_note',
    userId: 'user_family_meal_demo',
    recipeKey: 'pork_potato_stew',
    eventType: 'cooked',
    noteText: 'needed 10 more minutes',
    noteLanguage: 'en',
    reasonTags: ['cozy'],
    createdAt: '2026-04-25T09:40:00.000Z',
  });
  assert.equal(noteEvent.note_text, 'needed 10 more minutes');
  assert.equal(noteEvent.note_language, 'en');

  const signals = await attachManualNoteSignals(client, {
    feedbackId: noteEvent.feedback_id,
    signals: [
      {
        signalId: 'signal_timing',
        signalType: 'timing',
        signalKey: 'needed_10_more_minutes',
        signalValue: '10',
        polarity: 'negative',
        confidence: 1,
        extractionMethod: 'manual_tag',
        createdAt: '2026-04-25T09:40:00.000Z',
      },
      {
        signalId: 'signal_family',
        signalType: 'family_response',
        signalKey: 'kids_loved_it',
        signalValue: 'kids_loved_it',
        polarity: 'positive',
        confidence: 0.9,
        extractionMethod: 'manual_tag',
        createdAt: '2026-04-25T09:41:00.000Z',
      },
    ],
  });
  assert.equal(signals.length, 2);
  assert.equal(client.state.signalsById.size, 2);

  const latest = await getLatestFeedbackForProfileAndRecipe(client, {
    userId: 'user_family_meal_demo',
    recipeKey: 'pork_potato_stew',
  });
  assert.equal(latest.feedback_id, 'feedback_note');

  const profileSummary = await aggregateFeedbackSummaryByProfile(client, {
    userId: 'user_family_meal_demo',
  });
  assert.equal(profileSummary.total_events, 4);
  assert.equal(profileSummary.distinct_recipe_count, 3);
  assert.equal(profileSummary.event_counts.cooked, 2);
  assert.equal(profileSummary.event_counts.saved, 1);
  assert.equal(profileSummary.event_counts.cooked_again, 1);

  const recipeSummary = await aggregateFeedbackSummaryByRecipe(client, {
    recipeKey: 'pork_potato_stew',
  });
  assert.equal(recipeSummary.total_events, 3);
  assert.equal(recipeSummary.distinct_profile_count, 2);
  assert.equal(recipeSummary.event_counts.cooked, 2);

  assert.throws(() => deleteRecipeFeedbackEvent(), /must not be deleted/);

  const seedClient = makeClient();
  const seedPath = path.join(__dirname, '..', 'data', 'seeds', 'recipe_feedback_seed.json');
  const firstSeed = await seedRecipeFeedback({ client: seedClient, seedPath });
  const secondSeed = await seedRecipeFeedback({ client: seedClient, seedPath });
  assert.equal(firstSeed.events_seen, fixture.length);
  assert.equal(seedClient.state.eventsById.size, fixture.length, 'deterministic fixture ids keep seed reruns idempotent');
  assert.equal(seedClient.state.eventsById.size, secondSeed.events_seen);
  assert.equal(seedClient.state.signalsById.size, 3);

  const dryRun = await seedRecipeFeedback({
    client: makeClient(),
    dryRun: true,
    limit: 2,
    seedPath,
  });
  assert.equal(dryRun.events_seen, 2);
  assert.equal(dryRun.events_written, 0);
  assert.equal(dryRun.events.length, 2);

  assert.deepEqual(parseArgs([
    '--dry-run',
    '--json',
    '--limit=20',
    '--out=tmp/ux2.json',
  ]), {
    dryRun: true,
    json: true,
    out: 'tmp/ux2.json',
    limit: 20,
  });

  assert(client.state.commands.every((command) => !/firestore/i.test(command.sql)), 'UX2 must not write Firestore');
  assert(client.state.commands.every((command) => !/\bplanner\b/i.test(command.sql)), 'UX2 must not affect planner behavior');
  assert(client.state.commands.every((command) => !/INSERT INTO user_food_preferences/i.test(command.sql)), 'UX2 must not infer taste profiles yet');

  console.log('UX2 recipe feedback tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
