const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildIngredientNutritionMappingSuggestions,
  reviewIngredientNutritionMapping,
  suggestIngredientNutritionMappings,
} = require('../app/functions/src');

function makeCluster(overrides) {
  return {
    cluster_id: 'cluster:apple_raw',
    cluster_key: 'apple_raw',
    core_food_name: 'Apple',
    core_food_normalized: 'apple',
    parsed_shared_qualifiers_json: { state: 'raw' },
    representative_fdc_id: 1001,
    confidence: 0.94,
    review_status: 'approved',
    generation_method: 'deterministic_cluster_preview_v1',
    rules_version: 'db2_5_v1',
    source_version: 'fixture',
    ...overrides,
  };
}

function makeIngredient(overrides) {
  const ingredient = {
    ingredient_id: 'ingredient_apple',
    name_en: 'Apple',
    name_bg: null,
    aliases_json: { en: [], bg: [], all: [] },
    review_status: 'active',
    ...overrides,
  };
  if (overrides && (overrides.aliases_en || overrides.aliases_bg)) {
    ingredient.aliases_json = {
      en: overrides.aliases_en || [],
      bg: overrides.aliases_bg || [],
      all: [...(overrides.aliases_en || []), ...(overrides.aliases_bg || [])],
    };
  }
  ingredient.aliases = [
    ...(ingredient.aliases_json.en || []),
    ...(ingredient.aliases_json.bg || []),
    ...(ingredient.aliases_json.all || []),
  ];
  return ingredient;
}

function makeFixtureClient() {
  const state = {
    clusters: [
      makeCluster(),
      makeCluster({
        cluster_id: 'cluster:rice_cooked',
        cluster_key: 'rice_cooked',
        core_food_name: 'Rice',
        core_food_normalized: 'rice',
        parsed_shared_qualifiers_json: { grain_state: 'cooked' },
        representative_fdc_id: 2002,
      }),
      makeCluster({
        cluster_id: 'cluster:garbanzo_raw',
        cluster_key: 'garbanzo_bean_raw',
        core_food_name: 'Garbanzo bean',
        core_food_normalized: 'garbanzo_bean',
        parsed_shared_qualifiers_json: { state: 'raw' },
        representative_fdc_id: 3003,
      }),
      makeCluster({
        cluster_id: 'cluster:banana_pending',
        cluster_key: 'banana_raw',
        core_food_name: 'Banana',
        core_food_normalized: 'banana',
        review_status: 'pending_review',
      }),
    ],
    ingredients: [
      makeIngredient(),
      makeIngredient({ ingredient_id: 'ingredient_rice', name_en: 'Rice' }),
      makeIngredient({
        ingredient_id: 'ingredient_chickpea',
        name_en: 'Chickpea',
        aliases_en: ['garbanzo bean', 'garbanzo'],
      }),
      makeIngredient({ ingredient_id: 'ingredient_banana', name_en: 'Banana' }),
    ],
    mappings: new Map(),
    history: [],
    commands: [],
  };

  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });

      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalizedSql)) return { rows: [] };

      if (normalizedSql.includes('FROM usda_food_clusters')) {
        const clusterKey = normalizedSql.includes('cluster_key =') ? params[1] : null;
        const limit = Number(params[params.length - 1]);
        return {
          rows: state.clusters
            .filter((cluster) => cluster.review_status === 'approved')
            .filter((cluster) => !clusterKey || cluster.cluster_key === clusterKey)
            .slice(0, limit),
        };
      }

      if (normalizedSql.includes('FROM ingredients')) {
        const hasFilter = normalizedSql.includes('ILIKE');
        const filter = hasFilter ? String(params[0]).replaceAll('%', '').toLowerCase() : null;
        const limit = Number(params[params.length - 1]);
        return {
          rows: state.ingredients
            .filter((ingredient) => ingredient.review_status !== 'rejected')
            .filter((ingredient) => !filter || [
              ingredient.ingredient_id,
              ingredient.name_en,
              ingredient.name_bg,
            ].some((value) => String(value || '').toLowerCase().includes(filter)))
            .slice(0, limit),
        };
      }

      if (normalizedSql.startsWith('INSERT INTO ingredient_nutrition_mappings')) {
        const columns = [
          'mapping_id',
          'ingredient_id',
          'cluster_id',
          'representative_fdc_id',
          'default_for_state',
          'mapping_type',
          'confidence',
          'source',
          'review_status',
          'notes',
          'suggestion_reason_json',
          'generation_method',
          'rules_version',
          'source_version',
        ];
        for (let index = 0; index < params.length; index += columns.length) {
          const row = {};
          for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
            row[columns[columnIndex]] = params[index + columnIndex];
          }
          row.suggestion_reason_json = JSON.parse(row.suggestion_reason_json || '{}');
          const key = `${row.ingredient_id}|${row.cluster_id}|${row.default_for_state || ''}`;
          const existing = state.mappings.get(key);
          if (existing && ['approved', 'rejected'].includes(existing.review_status)) {
            state.mappings.set(key, { ...existing, updated_at: new Date().toISOString() });
            continue;
          }
          state.mappings.set(key, {
            ...existing,
            ...row,
            review_status: row.review_status,
            notes: existing && existing.notes ? existing.notes : row.notes,
            created_at: existing ? existing.created_at : new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        return { rows: [] };
      }

      if (normalizedSql.includes('FROM ingredient_nutrition_mappings') && normalizedSql.includes('WHERE mapping_id =')) {
        const mapping = [...state.mappings.values()].find((row) => row.mapping_id === params[0]);
        return { rows: mapping ? [mapping] : [] };
      }

      if (normalizedSql.startsWith('UPDATE ingredient_nutrition_mappings')) {
        const [decision, reviewedBy, reviewedAt, reviewReason, mappingId] = params;
        const entry = [...state.mappings.entries()].find(([, row]) => row.mapping_id === mappingId);
        if (!entry) return { rows: [] };
        const [key, mapping] = entry;
        const updated = {
          ...mapping,
          review_status: decision,
          reviewed_by: reviewedBy,
          reviewed_at: reviewedAt,
          review_decision: decision,
          review_reason: reviewReason,
          mapping_type: decision === 'rejected' ? 'rejected_candidate' : mapping.mapping_type,
        };
        state.mappings.set(key, updated);
        return { rows: [updated] };
      }

      if (normalizedSql.startsWith('INSERT INTO ingredient_nutrition_mapping_review_history')) {
        const [
          review_event_id,
          mapping_id,
          ingredient_id,
          cluster_id,
          previous_review_status,
          review_decision,
          reviewed_by,
          reviewed_at,
          review_reason,
          review_note,
        ] = params;
        state.history.push({
          review_event_id,
          mapping_id,
          ingredient_id,
          cluster_id,
          previous_review_status,
          review_decision,
          reviewed_by,
          reviewed_at,
          review_reason,
          review_note,
        });
        return { rows: [] };
      }

      if (normalizedSql.includes('FROM ingredient_nutrition_mapping_review_history')) {
        return { rows: state.history.filter((row) => row.mapping_id === params[0]) };
      }

      throw new Error(`Unexpected SQL in fixture client: ${normalizedSql}`);
    },
  };
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '008_db2_5_ingredient_nutrition_mappings.sql'),
    'utf8',
  );
  assert(migration.includes('CREATE TABLE IF NOT EXISTS ingredient_nutrition_mappings'));
  assert(migration.includes('ingredient_nutrition_mapping_review_history'));
  assert(migration.includes("review_status IN ('suggested', 'approved', 'rejected', 'needs_review')"));
  assert(migration.includes("mapping_type IN ('default_raw', 'default_cooked', 'alternate_state', 'product_specific', 'rejected_candidate')"));

  const dryRunClient = makeFixtureClient();
  const dryRun = await suggestIngredientNutritionMappings({
    client: dryRunClient,
    dryRun: true,
    limit: 20,
  });

  assert.strictEqual(dryRun.dry_run, true);
  assert.strictEqual(dryRun.approved_clusters_scanned, 3);
  assert.strictEqual(dryRun.ingredients_scanned, 4);
  assert(dryRun.suggestions.every((suggestion) => suggestion.review_status !== 'approved'));

  const apple = dryRun.suggestions.find((suggestion) => suggestion.ingredient_id === 'ingredient_apple');
  assert(apple, 'expected exact apple ingredient match');
  assert.strictEqual(apple.cluster_id, 'cluster:apple_raw');
  assert.strictEqual(apple.default_for_state, 'raw');
  assert.strictEqual(apple.mapping_type, 'default_raw');
  assert.strictEqual(apple.suggestion_reason_json.match_type, 'exact_name');
  assert.strictEqual(apple.suggestion_reason_json.no_direct_usda_food_mapping, true);
  assert(!Object.hasOwn(apple, 'source_fdc_id'), 'suggestions must point to clusters, not raw USDA foods');

  const rice = dryRun.suggestions.find((suggestion) => suggestion.ingredient_id === 'ingredient_rice');
  assert(rice, 'expected rice ingredient match');
  assert.strictEqual(rice.default_for_state, 'cooked');
  assert.strictEqual(rice.mapping_type, 'default_cooked');

  const chickpea = dryRun.suggestions.find((suggestion) => suggestion.ingredient_id === 'ingredient_chickpea');
  assert(chickpea, 'expected alias match through garbanzo bean');
  assert.strictEqual(chickpea.suggestion_reason_json.match_type, 'alias');

  assert(!dryRun.suggestions.some((suggestion) => suggestion.ingredient_id === 'ingredient_banana'), 'pending clusters are not eligible');

  const directSuggestions = buildIngredientNutritionMappingSuggestions({
    clusters: dryRunClient.state.clusters.filter((cluster) => cluster.review_status === 'approved'),
    ingredients: dryRunClient.state.ingredients,
  });
  assert(directSuggestions.every((suggestion) => suggestion.cluster_id && !suggestion.source_fdc_id));

  const writeClient = makeFixtureClient();
  const firstWrite = await suggestIngredientNutritionMappings({ client: writeClient, limit: 20 });
  const mapSizeAfterFirstWrite = writeClient.state.mappings.size;
  const secondWrite = await suggestIngredientNutritionMappings({ client: writeClient, limit: 20 });
  assert.strictEqual(firstWrite.upserted, firstWrite.suggested_count);
  assert.strictEqual(secondWrite.upserted, secondWrite.suggested_count);
  assert.strictEqual(writeClient.state.mappings.size, mapSizeAfterFirstWrite, 'upsert must be idempotent');

  const appleMapping = [...writeClient.state.mappings.values()]
    .find((mapping) => mapping.ingredient_id === 'ingredient_apple');
  const approved = await reviewIngredientNutritionMapping(writeClient, {
    mappingId: appleMapping.mapping_id,
    decision: 'approved',
    reviewedBy: 'fixture_reviewer',
    reviewReason: 'exact name and raw state match',
    reviewNote: 'safe default raw apple nutrition',
    reviewedAt: '2026-04-24T10:00:00.000Z',
  });
  assert.strictEqual(approved.previous_review_status, 'suggested');
  assert.strictEqual(approved.mapping.review_status, 'approved');
  assert.strictEqual(writeClient.state.history.length, 1);
  assert.strictEqual(writeClient.state.history[0].review_decision, 'approved');

  await suggestIngredientNutritionMappings({ client: writeClient, limit: 20 });
  const preservedApproved = [...writeClient.state.mappings.values()]
    .find((mapping) => mapping.mapping_id === appleMapping.mapping_id);
  assert.strictEqual(preservedApproved.review_status, 'approved', 'approved mappings must not be overwritten');

  await assert.rejects(
    () => reviewIngredientNutritionMapping(writeClient, {
      mappingId: appleMapping.mapping_id,
      decision: 'rejected',
      reviewedBy: 'fixture_reviewer',
    }),
    /Invalid ingredient nutrition mapping review transition/,
  );

  const rejectClient = makeFixtureClient();
  await suggestIngredientNutritionMappings({ client: rejectClient, limit: 20 });
  const riceMapping = [...rejectClient.state.mappings.values()]
    .find((mapping) => mapping.ingredient_id === 'ingredient_rice');
  await reviewIngredientNutritionMapping(rejectClient, {
    mappingId: riceMapping.mapping_id,
    decision: 'rejected',
    reviewedBy: 'fixture_reviewer',
    reviewReason: 'fixture rejection',
    reviewedAt: '2026-04-24T11:00:00.000Z',
  });
  await suggestIngredientNutritionMappings({ client: rejectClient, limit: 20 });
  const preservedRejected = [...rejectClient.state.mappings.values()]
    .find((mapping) => mapping.mapping_id === riceMapping.mapping_id);
  assert.strictEqual(preservedRejected.review_status, 'rejected', 'rejected mappings must not be overwritten');
  assert.strictEqual(preservedRejected.mapping_type, 'rejected_candidate');

  console.log('DB2.5 ingredient nutrition mapping suggestion tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
