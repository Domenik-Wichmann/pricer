const crypto = require('node:crypto');

const DEFAULT_RECIPE_INGEST_GENERATION_METHOD = 'deterministic_fixture_recipe_ingest_staging_v1';
const DEFAULT_RECIPE_INGEST_RULES_VERSION = 'db5a_recipe_ingest_staging_v1';
const DEFAULT_RECIPE_INGEST_LIMIT = 100;
const SUPPORTED_RECIPE_INGEST_JOB_STATUSES = Object.freeze(['pending', 'extracting', 'staged', 'needs_review', 'completed', 'failed', 'cancelled']);
const SUPPORTED_STAGED_RECIPE_REVIEW_STATUSES = Object.freeze(['staged', 'needs_review', 'approved', 'rejected', 'promoted']);
const SUPPORTED_STAGED_INGREDIENT_REVIEW_STATUSES = Object.freeze(['staged', 'needs_review', 'approved', 'rejected', 'matched']);

async function createRecipeIngestJob(client, input = {}) {
  requireClient(client);
  const record = normalizeRecipeIngestJobRecord(input);
  const result = await client.query(`
    INSERT INTO recipe_ingest_jobs (
      job_id,
      source_type,
      source_name,
      source_url,
      raw_text,
      raw_json,
      language,
      status,
      generation_method,
      rules_version
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
    ON CONFLICT (job_id) DO UPDATE SET
      source_type = EXCLUDED.source_type,
      source_name = EXCLUDED.source_name,
      source_url = EXCLUDED.source_url,
      raw_text = EXCLUDED.raw_text,
      raw_json = EXCLUDED.raw_json,
      language = EXCLUDED.language,
      status = EXCLUDED.status,
      generation_method = EXCLUDED.generation_method,
      rules_version = EXCLUDED.rules_version,
      updated_at = NOW()
    RETURNING *
  `, recipeIngestJobParams(record));
  return hydrateJsonFields(result.rows[0], ['raw_json']);
}

async function insertStagedRecipeBundle(client, bundle = {}) {
  requireClient(client);
  const job = normalizeRecipeIngestJobRecord(bundle.job || bundle);
  const recipe = normalizeStagedRecipeRecord({
    ...(bundle.recipe || bundle.staged_recipe || {}),
    job_id: job.job_id,
  });

  await client.query('BEGIN');
  try {
    const storedJob = await createRecipeIngestJob(client, job);
    const storedRecipe = await upsertStagedRecipe(client, recipe);

    // These child inserts are additive/idempotent by deterministic row id. We do not delete
    // missing children during reseed because staging is an audit surface, not canonical truth.
    const ingredients = await upsertStagedIngredients(client, storedRecipe.staged_recipe_id, bundle.ingredients || bundle.staged_ingredients || []);
    const steps = await upsertStagedSteps(client, storedRecipe.staged_recipe_id, bundle.steps || bundle.staged_steps || []);
    const tools = await upsertStagedTools(client, storedRecipe.staged_recipe_id, bundle.tools || []);
    const methods = await upsertStagedMethods(client, storedRecipe.staged_recipe_id, bundle.methods || []);
    const tags = await upsertStagedTags(client, storedRecipe.staged_recipe_id, bundle.tags || []);
    const stateChanges = await upsertStagedStateChanges(client, storedRecipe.staged_recipe_id, bundle.state_changes || bundle.stateChanges || []);
    const substitutionHints = await upsertStagedSubstitutionHints(client, storedRecipe.staged_recipe_id, bundle.substitution_hints || bundle.substitutionHints || []);
    const qualitySignals = await upsertStagedQualitySignals(client, storedRecipe.staged_recipe_id, bundle.quality_signals || bundle.qualitySignals || []);

    await client.query('COMMIT');
    return {
      job: storedJob,
      staged_recipe: storedRecipe,
      ingredients,
      steps,
      tools,
      methods,
      tags,
      state_changes: stateChanges,
      substitution_hints: substitutionHints,
      quality_signals: qualitySignals,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function upsertStagedRecipe(client, input = {}) {
  const record = normalizeStagedRecipeRecord(input);
  const result = await client.query(`
    INSERT INTO recipe_ingest_staged_recipes (
      staged_recipe_id,
      job_id,
      proposed_recipe_key,
      title_original,
      title_en,
      title_bg,
      description,
      servings,
      yield_quantity,
      yield_unit,
      cuisine_tags_json,
      region_tags_json,
      dietary_tags_json,
      meal_type_tags_json,
      feeling_tags_json,
      flavor_profile_json,
      texture_profile_json,
      difficulty_level,
      budget_level,
      prep_time_minutes,
      cook_time_minutes,
      rest_time_minutes,
      total_time_minutes,
      review_status,
      confidence,
      extraction_json
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
      $16::jsonb, $17::jsonb, $18, $19, $20, $21, $22, $23,
      $24, $25, $26::jsonb
    )
    ON CONFLICT (staged_recipe_id) DO UPDATE SET
      proposed_recipe_key = EXCLUDED.proposed_recipe_key,
      title_original = EXCLUDED.title_original,
      title_en = EXCLUDED.title_en,
      title_bg = EXCLUDED.title_bg,
      description = EXCLUDED.description,
      servings = EXCLUDED.servings,
      yield_quantity = EXCLUDED.yield_quantity,
      yield_unit = EXCLUDED.yield_unit,
      cuisine_tags_json = EXCLUDED.cuisine_tags_json,
      region_tags_json = EXCLUDED.region_tags_json,
      dietary_tags_json = EXCLUDED.dietary_tags_json,
      meal_type_tags_json = EXCLUDED.meal_type_tags_json,
      feeling_tags_json = EXCLUDED.feeling_tags_json,
      flavor_profile_json = EXCLUDED.flavor_profile_json,
      texture_profile_json = EXCLUDED.texture_profile_json,
      difficulty_level = EXCLUDED.difficulty_level,
      budget_level = EXCLUDED.budget_level,
      prep_time_minutes = EXCLUDED.prep_time_minutes,
      cook_time_minutes = EXCLUDED.cook_time_minutes,
      rest_time_minutes = EXCLUDED.rest_time_minutes,
      total_time_minutes = EXCLUDED.total_time_minutes,
      review_status = EXCLUDED.review_status,
      confidence = EXCLUDED.confidence,
      extraction_json = EXCLUDED.extraction_json,
      updated_at = NOW()
    RETURNING *
  `, stagedRecipeParams(record));
  return hydrateStagedRecipeRow(result.rows[0]);
}

async function getStagedRecipeDetail(client, { stagedRecipeId } = {}) {
  requireClient(client);
  const id = requiredString(stagedRecipeId, 'staged_recipe_id');
  const recipeResult = await client.query(`
    SELECT
      sr.*,
      j.source_type,
      j.source_name,
      j.source_url,
      j.raw_text,
      j.raw_json,
      j.language,
      j.status AS job_status
    FROM recipe_ingest_staged_recipes sr
    JOIN recipe_ingest_jobs j
      ON j.job_id = sr.job_id
    WHERE sr.staged_recipe_id = $1
  `, [id]);
  const stagedRecipe = recipeResult.rows[0] ? hydrateStagedRecipeRow(recipeResult.rows[0]) : null;
  if (!stagedRecipe) return null;
  return {
    staged_recipe: stagedRecipe,
    job: hydrateJsonFields({
      job_id: stagedRecipe.job_id,
      source_type: stagedRecipe.source_type,
      source_name: stagedRecipe.source_name,
      source_url: stagedRecipe.source_url,
      raw_text: stagedRecipe.raw_text,
      raw_json: stagedRecipe.raw_json,
      language: stagedRecipe.language,
      status: stagedRecipe.job_status,
    }, ['raw_json']),
    ingredients: await fetchChildren(client, 'recipe_ingest_staged_ingredients', 'staged_recipe_id', id, 'sort_order ASC, staged_recipe_ingredient_id ASC', ['extraction_json']),
    steps: await fetchChildren(client, 'recipe_ingest_staged_steps', 'staged_recipe_id', id, 'step_number ASC, staged_recipe_step_id ASC', ['extraction_json']),
    tools: await fetchChildren(client, 'recipe_ingest_staged_tools', 'staged_recipe_id', id, 'tool_key ASC, staged_recipe_tool_id ASC', ['extraction_json']),
    methods: await fetchChildren(client, 'recipe_ingest_staged_methods', 'staged_recipe_id', id, 'method_key ASC, staged_recipe_method_id ASC', ['extraction_json']),
    tags: await fetchChildren(client, 'recipe_ingest_staged_tags', 'staged_recipe_id', id, 'tag_type ASC, tag_key ASC, staged_recipe_tag_id ASC', ['extraction_json']),
    state_changes: await fetchChildren(client, 'recipe_ingest_staged_state_changes', 'staged_recipe_id', id, 'state_change_key ASC, staged_recipe_state_change_id ASC', ['extraction_json']),
    substitution_hints: await fetchChildren(client, 'recipe_ingest_staged_substitution_hints', 'staged_recipe_id', id, 'substitution_key ASC, staged_recipe_substitution_hint_id ASC', ['extraction_json']),
    quality_signals: await fetchChildren(client, 'recipe_ingest_staged_quality_signals', 'staged_recipe_id', id, 'signal_key ASC, staged_recipe_quality_signal_id ASC', ['extraction_json']),
  };
}

async function listStagedRecipes(client, {
  reviewStatus = null,
  status = null,
  limit = DEFAULT_RECIPE_INGEST_LIMIT,
} = {}) {
  requireClient(client);
  const filter = buildStagedRecipeFilter({ reviewStatus, status });
  const result = await client.query(`
    SELECT
      sr.*,
      j.status AS job_status,
      j.source_type,
      j.source_name
    FROM recipe_ingest_staged_recipes sr
    JOIN recipe_ingest_jobs j
      ON j.job_id = sr.job_id
    ${filter.whereSql}
    ORDER BY sr.created_at ASC, sr.proposed_recipe_key ASC
    LIMIT $${filter.params.length + 1}
  `, [...filter.params, positiveInteger(limit, DEFAULT_RECIPE_INGEST_LIMIT)]);
  return (result.rows || []).map(hydrateStagedRecipeRow);
}

async function searchStagedRecipes(client, {
  query,
  limit = DEFAULT_RECIPE_INGEST_LIMIT,
} = {}) {
  requireClient(client);
  const search = requiredString(query, 'query');
  const result = await client.query(`
    SELECT
      sr.*,
      j.status AS job_status,
      j.source_type,
      j.source_name
    FROM recipe_ingest_staged_recipes sr
    JOIN recipe_ingest_jobs j
      ON j.job_id = sr.job_id
    WHERE sr.proposed_recipe_key ILIKE $1
       OR sr.title_original ILIKE $1
       OR sr.title_en ILIKE $1
       OR sr.title_bg ILIKE $1
    ORDER BY sr.proposed_recipe_key ASC
    LIMIT $2
  `, [`%${search}%`, positiveInteger(limit, DEFAULT_RECIPE_INGEST_LIMIT)]);
  return (result.rows || []).map(hydrateStagedRecipeRow);
}

async function updateStagedRecipeReviewStatus(client, {
  stagedRecipeId,
  reviewStatus,
} = {}) {
  requireClient(client);
  const id = requiredString(stagedRecipeId, 'staged_recipe_id');
  const status = normalizeStagedRecipeReviewStatus(reviewStatus);
  const result = await client.query(`
    UPDATE recipe_ingest_staged_recipes
    SET review_status = $1,
        updated_at = NOW()
    WHERE staged_recipe_id = $2
    RETURNING *
  `, [status, id]);
  return result.rows[0] ? hydrateStagedRecipeRow(result.rows[0]) : null;
}

function deleteRecipeIngestStaging() {
  throw new Error('Recipe ingest staging rows are append-preserving and must not be deleted.');
}

async function upsertStagedIngredients(client, stagedRecipeId, records = []) {
  const rows = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = normalizeStagedIngredientRecord(records[index], stagedRecipeId, index);
    const result = await client.query(`
      INSERT INTO recipe_ingest_staged_ingredients (
        staged_recipe_ingredient_id,
        staged_recipe_id,
        raw_line,
        ingredient_name_original,
        ingredient_name_en,
        ingredient_name_bg,
        proposed_ingredient_key,
        matched_ingredient_id,
        quantity,
        unit,
        quantity_grams,
        preparation_note,
        optional,
        sort_order,
        match_confidence,
        review_status,
        extraction_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
      ON CONFLICT (staged_recipe_ingredient_id) DO UPDATE SET
        raw_line = EXCLUDED.raw_line,
        ingredient_name_original = EXCLUDED.ingredient_name_original,
        ingredient_name_en = EXCLUDED.ingredient_name_en,
        ingredient_name_bg = EXCLUDED.ingredient_name_bg,
        proposed_ingredient_key = EXCLUDED.proposed_ingredient_key,
        matched_ingredient_id = EXCLUDED.matched_ingredient_id,
        quantity = EXCLUDED.quantity,
        unit = EXCLUDED.unit,
        quantity_grams = EXCLUDED.quantity_grams,
        preparation_note = EXCLUDED.preparation_note,
        optional = EXCLUDED.optional,
        sort_order = EXCLUDED.sort_order,
        match_confidence = EXCLUDED.match_confidence,
        review_status = EXCLUDED.review_status,
        extraction_json = EXCLUDED.extraction_json,
        updated_at = NOW()
      RETURNING *
    `, stagedIngredientParams(record));
    rows.push(hydrateJsonFields(result.rows[0], ['extraction_json']));
  }
  return rows;
}

async function upsertStagedSteps(client, stagedRecipeId, records = []) {
  const rows = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = normalizeStagedStepRecord(records[index], stagedRecipeId, index);
    const result = await client.query(`
      INSERT INTO recipe_ingest_staged_steps (
        staged_recipe_step_id,
        staged_recipe_id,
        step_number,
        instruction_original,
        instruction_en,
        instruction_bg,
        duration_minutes,
        temperature_c,
        state_change_summary,
        extraction_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      ON CONFLICT (staged_recipe_step_id) DO UPDATE SET
        step_number = EXCLUDED.step_number,
        instruction_original = EXCLUDED.instruction_original,
        instruction_en = EXCLUDED.instruction_en,
        instruction_bg = EXCLUDED.instruction_bg,
        duration_minutes = EXCLUDED.duration_minutes,
        temperature_c = EXCLUDED.temperature_c,
        state_change_summary = EXCLUDED.state_change_summary,
        extraction_json = EXCLUDED.extraction_json,
        updated_at = NOW()
      RETURNING *
    `, stagedStepParams(record));
    rows.push(hydrateJsonFields(result.rows[0], ['extraction_json']));
  }
  return rows;
}

async function upsertStagedTools(client, stagedRecipeId, records = []) {
  return upsertNamedChildren(client, {
    table: 'recipe_ingest_staged_tools',
    idField: 'staged_recipe_tool_id',
    keyField: 'tool_key',
    nameFields: ['tool_name_en', 'tool_name_bg'],
    stagedRecipeId,
    records,
    kind: 'tool',
  });
}

async function upsertStagedMethods(client, stagedRecipeId, records = []) {
  return upsertNamedChildren(client, {
    table: 'recipe_ingest_staged_methods',
    idField: 'staged_recipe_method_id',
    keyField: 'method_key',
    nameFields: ['method_name_en', 'method_name_bg'],
    stagedRecipeId,
    records,
    kind: 'method',
  });
}

async function upsertStagedTags(client, stagedRecipeId, records = []) {
  const rows = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = normalizeTagRecord(records[index], stagedRecipeId, index);
    const result = await client.query(`
      INSERT INTO recipe_ingest_staged_tags (
        staged_recipe_tag_id,
        staged_recipe_id,
        tag_type,
        tag_key,
        tag_value,
        confidence,
        evidence_text,
        extraction_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (staged_recipe_tag_id) DO UPDATE SET
        tag_type = EXCLUDED.tag_type,
        tag_key = EXCLUDED.tag_key,
        tag_value = EXCLUDED.tag_value,
        confidence = EXCLUDED.confidence,
        evidence_text = EXCLUDED.evidence_text,
        extraction_json = EXCLUDED.extraction_json
      RETURNING *
    `, [
      record.staged_recipe_tag_id,
      record.staged_recipe_id,
      record.tag_type,
      record.tag_key,
      record.tag_value,
      record.confidence,
      record.evidence_text,
      JSON.stringify(record.extraction_json),
    ]);
    rows.push(hydrateJsonFields(result.rows[0], ['extraction_json']));
  }
  return rows;
}

async function upsertStagedStateChanges(client, stagedRecipeId, records = []) {
  const rows = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = normalizeStateChangeRecord(records[index], stagedRecipeId, index);
    const result = await client.query(`
      INSERT INTO recipe_ingest_staged_state_changes (
        staged_recipe_state_change_id,
        staged_recipe_id,
        state_change_key,
        ingredient_name,
        from_state,
        to_state,
        confidence,
        evidence_text,
        extraction_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      ON CONFLICT (staged_recipe_state_change_id) DO UPDATE SET
        state_change_key = EXCLUDED.state_change_key,
        ingredient_name = EXCLUDED.ingredient_name,
        from_state = EXCLUDED.from_state,
        to_state = EXCLUDED.to_state,
        confidence = EXCLUDED.confidence,
        evidence_text = EXCLUDED.evidence_text,
        extraction_json = EXCLUDED.extraction_json
      RETURNING *
    `, [
      record.staged_recipe_state_change_id,
      record.staged_recipe_id,
      record.state_change_key,
      record.ingredient_name,
      record.from_state,
      record.to_state,
      record.confidence,
      record.evidence_text,
      JSON.stringify(record.extraction_json),
    ]);
    rows.push(hydrateJsonFields(result.rows[0], ['extraction_json']));
  }
  return rows;
}

async function upsertStagedSubstitutionHints(client, stagedRecipeId, records = []) {
  const rows = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = normalizeSubstitutionHintRecord(records[index], stagedRecipeId, index);
    const result = await client.query(`
      INSERT INTO recipe_ingest_staged_substitution_hints (
        staged_recipe_substitution_hint_id,
        staged_recipe_id,
        substitution_key,
        original_ingredient_name,
        substitute_ingredient_name,
        reason,
        confidence,
        evidence_text,
        extraction_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      ON CONFLICT (staged_recipe_substitution_hint_id) DO UPDATE SET
        substitution_key = EXCLUDED.substitution_key,
        original_ingredient_name = EXCLUDED.original_ingredient_name,
        substitute_ingredient_name = EXCLUDED.substitute_ingredient_name,
        reason = EXCLUDED.reason,
        confidence = EXCLUDED.confidence,
        evidence_text = EXCLUDED.evidence_text,
        extraction_json = EXCLUDED.extraction_json
      RETURNING *
    `, [
      record.staged_recipe_substitution_hint_id,
      record.staged_recipe_id,
      record.substitution_key,
      record.original_ingredient_name,
      record.substitute_ingredient_name,
      record.reason,
      record.confidence,
      record.evidence_text,
      JSON.stringify(record.extraction_json),
    ]);
    rows.push(hydrateJsonFields(result.rows[0], ['extraction_json']));
  }
  return rows;
}

async function upsertStagedQualitySignals(client, stagedRecipeId, records = []) {
  const rows = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = normalizeQualitySignalRecord(records[index], stagedRecipeId, index);
    const result = await client.query(`
      INSERT INTO recipe_ingest_staged_quality_signals (
        staged_recipe_quality_signal_id,
        staged_recipe_id,
        signal_key,
        signal_name,
        signal_value,
        severity,
        confidence,
        evidence_text,
        extraction_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      ON CONFLICT (staged_recipe_quality_signal_id) DO UPDATE SET
        signal_key = EXCLUDED.signal_key,
        signal_name = EXCLUDED.signal_name,
        signal_value = EXCLUDED.signal_value,
        severity = EXCLUDED.severity,
        confidence = EXCLUDED.confidence,
        evidence_text = EXCLUDED.evidence_text,
        extraction_json = EXCLUDED.extraction_json
      RETURNING *
    `, [
      record.staged_recipe_quality_signal_id,
      record.staged_recipe_id,
      record.signal_key,
      record.signal_name,
      record.signal_value,
      record.severity,
      record.confidence,
      record.evidence_text,
      JSON.stringify(record.extraction_json),
    ]);
    rows.push(hydrateJsonFields(result.rows[0], ['extraction_json']));
  }
  return rows;
}

async function upsertNamedChildren(client, {
  table,
  idField,
  keyField,
  nameFields,
  stagedRecipeId,
  records,
  kind,
}) {
  const rows = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = normalizeNamedChildRecord(records[index], stagedRecipeId, index, {
      idField,
      keyField,
      nameFields,
      kind,
    });
    const result = await client.query(`
      INSERT INTO ${table} (
        ${idField},
        staged_recipe_id,
        ${keyField},
        ${nameFields[0]},
        ${nameFields[1]},
        confidence,
        evidence_text,
        extraction_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (${idField}) DO UPDATE SET
        ${keyField} = EXCLUDED.${keyField},
        ${nameFields[0]} = EXCLUDED.${nameFields[0]},
        ${nameFields[1]} = EXCLUDED.${nameFields[1]},
        confidence = EXCLUDED.confidence,
        evidence_text = EXCLUDED.evidence_text,
        extraction_json = EXCLUDED.extraction_json
      RETURNING *
    `, [
      record[idField],
      record.staged_recipe_id,
      record[keyField],
      record[nameFields[0]],
      record[nameFields[1]],
      record.confidence,
      record.evidence_text,
      JSON.stringify(record.extraction_json),
    ]);
    rows.push(hydrateJsonFields(result.rows[0], ['extraction_json']));
  }
  return rows;
}

async function fetchChildren(client, table, fkField, fkValue, orderSql, jsonFields = []) {
  const result = await client.query(`
    SELECT *
    FROM ${table}
    WHERE ${fkField} = $1
    ORDER BY ${orderSql}
  `, [fkValue]);
  return (result.rows || []).map((row) => hydrateJsonFields(row, jsonFields));
}

function buildStagedRecipeFilter({ reviewStatus, status }) {
  const conditions = [];
  const params = [];
  if (reviewStatus) {
    params.push(normalizeStagedRecipeReviewStatus(reviewStatus));
    conditions.push(`sr.review_status = $${params.length}`);
  }
  if (status) {
    params.push(normalizeJobStatus(status));
    conditions.push(`j.status = $${params.length}`);
  }
  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function normalizeRecipeIngestJobRecord(input = {}) {
  const sourceType = requiredString(input.source_type || input.sourceType || 'fixture', 'source_type');
  const sourceName = nullableString(input.source_name || input.sourceName);
  const sourceUrl = nullableString(input.source_url || input.sourceUrl);
  const rawText = nullableString(input.raw_text || input.rawText);
  return {
    job_id: nullableString(input.job_id || input.jobId) || buildRecipeIngestJobId({
      sourceType,
      sourceName,
      sourceUrl,
      rawText,
      rawJson: input.raw_json || input.rawJson || {},
    }),
    source_type: sourceType,
    source_name: sourceName,
    source_url: sourceUrl,
    raw_text: rawText,
    raw_json: normalizeJsonObject(input.raw_json || input.rawJson || {}),
    language: nullableString(input.language),
    status: normalizeJobStatus(input.status || 'staged'),
    generation_method: requiredString(input.generation_method || input.generationMethod || DEFAULT_RECIPE_INGEST_GENERATION_METHOD, 'generation_method'),
    rules_version: requiredString(input.rules_version || input.rulesVersion || DEFAULT_RECIPE_INGEST_RULES_VERSION, 'rules_version'),
  };
}

function normalizeStagedRecipeRecord(input = {}) {
  const jobId = requiredString(input.job_id || input.jobId, 'job_id');
  const proposedRecipeKey = normalizeKey(input.proposed_recipe_key || input.proposedRecipeKey || input.title_en || input.title_original, 'proposed_recipe_key');
  return {
    staged_recipe_id: nullableString(input.staged_recipe_id || input.stagedRecipeId) || buildStagedRecipeId(jobId, proposedRecipeKey),
    job_id: jobId,
    proposed_recipe_key: proposedRecipeKey,
    title_original: nullableString(input.title_original || input.titleOriginal),
    title_en: nullableString(input.title_en || input.titleEn),
    title_bg: nullableString(input.title_bg || input.titleBg),
    description: nullableString(input.description),
    servings: nullableNumber(input.servings),
    yield_quantity: nullableNumber(input.yield_quantity ?? input.yieldQuantity),
    yield_unit: nullableString(input.yield_unit || input.yieldUnit),
    cuisine_tags_json: normalizeJsonArray(input.cuisine_tags_json || input.cuisineTagsJson || input.cuisine_tags || input.cuisineTags || []),
    region_tags_json: normalizeJsonArray(input.region_tags_json || input.regionTagsJson || input.region_tags || input.regionTags || []),
    dietary_tags_json: normalizeJsonArray(input.dietary_tags_json || input.dietaryTagsJson || input.dietary_tags || input.dietaryTags || []),
    meal_type_tags_json: normalizeJsonArray(input.meal_type_tags_json || input.mealTypeTagsJson || input.meal_type_tags || input.mealTypeTags || []),
    feeling_tags_json: normalizeJsonArray(input.feeling_tags_json || input.feelingTagsJson || input.feeling_tags || input.feelingTags || []),
    flavor_profile_json: normalizeJsonObject(input.flavor_profile_json || input.flavorProfileJson || input.flavor_profile || input.flavorProfile || {}),
    texture_profile_json: normalizeJsonObject(input.texture_profile_json || input.textureProfileJson || input.texture_profile || input.textureProfile || {}),
    difficulty_level: nullableString(input.difficulty_level || input.difficultyLevel),
    budget_level: nullableString(input.budget_level || input.budgetLevel),
    prep_time_minutes: nullableNumber(input.prep_time_minutes ?? input.prepTimeMinutes),
    cook_time_minutes: nullableNumber(input.cook_time_minutes ?? input.cookTimeMinutes),
    rest_time_minutes: nullableNumber(input.rest_time_minutes ?? input.restTimeMinutes),
    total_time_minutes: nullableNumber(input.total_time_minutes ?? input.totalTimeMinutes),
    review_status: normalizeStagedRecipeReviewStatus(input.review_status || input.reviewStatus || 'staged'),
    confidence: nullableConfidence(input.confidence),
    extraction_json: normalizeJsonObject(input.extraction_json || input.extractionJson || {}),
  };
}

function normalizeStagedIngredientRecord(input = {}, stagedRecipeId, index) {
  const proposedKey = normalizeKey(input.proposed_ingredient_key || input.proposedIngredientKey || input.ingredient_name_en || input.ingredient_name_original || `ingredient_${index + 1}`, 'proposed_ingredient_key');
  return {
    staged_recipe_ingredient_id: nullableString(input.staged_recipe_ingredient_id || input.stagedRecipeIngredientId) || buildChildId(stagedRecipeId, 'ingredient', proposedKey, index),
    staged_recipe_id: stagedRecipeId,
    raw_line: nullableString(input.raw_line || input.rawLine),
    ingredient_name_original: nullableString(input.ingredient_name_original || input.ingredientNameOriginal),
    ingredient_name_en: nullableString(input.ingredient_name_en || input.ingredientNameEn),
    ingredient_name_bg: nullableString(input.ingredient_name_bg || input.ingredientNameBg),
    proposed_ingredient_key: proposedKey,
    matched_ingredient_id: nullableString(input.matched_ingredient_id || input.matchedIngredientId),
    quantity: nullableNumber(input.quantity),
    unit: nullableString(input.unit),
    quantity_grams: nullableNumber(input.quantity_grams ?? input.quantityGrams),
    preparation_note: nullableString(input.preparation_note || input.preparationNote),
    optional: Boolean(input.optional),
    sort_order: Number.isInteger(Number(input.sort_order ?? input.sortOrder)) ? Number(input.sort_order ?? input.sortOrder) : index + 1,
    match_confidence: nullableConfidence(input.match_confidence ?? input.matchConfidence),
    review_status: normalizeStagedIngredientReviewStatus(input.review_status || input.reviewStatus || 'staged'),
    extraction_json: normalizeJsonObject(input.extraction_json || input.extractionJson || {}),
  };
}

function normalizeStagedStepRecord(input = {}, stagedRecipeId, index) {
  const stepNumber = positiveInteger(input.step_number ?? input.stepNumber, index + 1);
  return {
    staged_recipe_step_id: nullableString(input.staged_recipe_step_id || input.stagedRecipeStepId) || buildChildId(stagedRecipeId, 'step', `step_${stepNumber}`, index),
    staged_recipe_id: stagedRecipeId,
    step_number: stepNumber,
    instruction_original: nullableString(input.instruction_original || input.instructionOriginal),
    instruction_en: nullableString(input.instruction_en || input.instructionEn),
    instruction_bg: nullableString(input.instruction_bg || input.instructionBg),
    duration_minutes: nullableNumber(input.duration_minutes ?? input.durationMinutes),
    temperature_c: nullableNumber(input.temperature_c ?? input.temperatureC),
    state_change_summary: nullableString(input.state_change_summary || input.stateChangeSummary),
    extraction_json: normalizeJsonObject(input.extraction_json || input.extractionJson || {}),
  };
}

function normalizeNamedChildRecord(input = {}, stagedRecipeId, index, {
  idField,
  keyField,
  nameFields,
  kind,
}) {
  const key = normalizeKey(input[keyField] || input.key || input.name_en || input.name || `${kind}_${index + 1}`, keyField);
  return {
    [idField]: nullableString(input[idField] || input.id) || buildChildId(stagedRecipeId, kind, key, index),
    staged_recipe_id: stagedRecipeId,
    [keyField]: key,
    [nameFields[0]]: nullableString(input[nameFields[0]] || input.name_en || input.nameEn || input.name),
    [nameFields[1]]: nullableString(input[nameFields[1]] || input.name_bg || input.nameBg),
    confidence: nullableConfidence(input.confidence),
    evidence_text: nullableString(input.evidence_text || input.evidenceText),
    extraction_json: normalizeJsonObject(input.extraction_json || input.extractionJson || {}),
  };
}

function normalizeTagRecord(input = {}, stagedRecipeId, index) {
  const tagType = normalizeKey(input.tag_type || input.tagType || 'general', 'tag_type');
  const tagKey = normalizeKey(input.tag_key || input.tagKey || input.key || input.tag_value || input.tagValue || `tag_${index + 1}`, 'tag_key');
  return {
    staged_recipe_tag_id: nullableString(input.staged_recipe_tag_id || input.stagedRecipeTagId || input.id) || buildChildId(stagedRecipeId, `tag_${tagType}`, tagKey, index),
    staged_recipe_id: stagedRecipeId,
    tag_type: tagType,
    tag_key: tagKey,
    tag_value: nullableString(input.tag_value || input.tagValue || input.value),
    confidence: nullableConfidence(input.confidence),
    evidence_text: nullableString(input.evidence_text || input.evidenceText),
    extraction_json: normalizeJsonObject(input.extraction_json || input.extractionJson || {}),
  };
}

function normalizeStateChangeRecord(input = {}, stagedRecipeId, index) {
  const key = normalizeKey(input.state_change_key || input.stateChangeKey || `${input.ingredient_name || input.ingredientName || 'ingredient'}_${input.to_state || input.toState || index + 1}`, 'state_change_key');
  return {
    staged_recipe_state_change_id: nullableString(input.staged_recipe_state_change_id || input.stagedRecipeStateChangeId || input.id) || buildChildId(stagedRecipeId, 'state_change', key, index),
    staged_recipe_id: stagedRecipeId,
    state_change_key: key,
    ingredient_name: nullableString(input.ingredient_name || input.ingredientName),
    from_state: nullableString(input.from_state || input.fromState),
    to_state: nullableString(input.to_state || input.toState),
    confidence: nullableConfidence(input.confidence),
    evidence_text: nullableString(input.evidence_text || input.evidenceText),
    extraction_json: normalizeJsonObject(input.extraction_json || input.extractionJson || {}),
  };
}

function normalizeSubstitutionHintRecord(input = {}, stagedRecipeId, index) {
  const key = normalizeKey(input.substitution_key || input.substitutionKey || `${input.original_ingredient_name || input.originalIngredientName || 'ingredient'}_${input.substitute_ingredient_name || input.substituteIngredientName || index + 1}`, 'substitution_key');
  return {
    staged_recipe_substitution_hint_id: nullableString(input.staged_recipe_substitution_hint_id || input.stagedRecipeSubstitutionHintId || input.id) || buildChildId(stagedRecipeId, 'substitution', key, index),
    staged_recipe_id: stagedRecipeId,
    substitution_key: key,
    original_ingredient_name: nullableString(input.original_ingredient_name || input.originalIngredientName),
    substitute_ingredient_name: nullableString(input.substitute_ingredient_name || input.substituteIngredientName),
    reason: nullableString(input.reason),
    confidence: nullableConfidence(input.confidence),
    evidence_text: nullableString(input.evidence_text || input.evidenceText),
    extraction_json: normalizeJsonObject(input.extraction_json || input.extractionJson || {}),
  };
}

function normalizeQualitySignalRecord(input = {}, stagedRecipeId, index) {
  const key = normalizeKey(input.signal_key || input.signalKey || input.signal_name || input.signalName || `quality_${index + 1}`, 'signal_key');
  return {
    staged_recipe_quality_signal_id: nullableString(input.staged_recipe_quality_signal_id || input.stagedRecipeQualitySignalId || input.id) || buildChildId(stagedRecipeId, 'quality', key, index),
    staged_recipe_id: stagedRecipeId,
    signal_key: key,
    signal_name: nullableString(input.signal_name || input.signalName || input.name),
    signal_value: nullableString(input.signal_value || input.signalValue || input.value),
    severity: nullableString(input.severity),
    confidence: nullableConfidence(input.confidence),
    evidence_text: nullableString(input.evidence_text || input.evidenceText),
    extraction_json: normalizeJsonObject(input.extraction_json || input.extractionJson || {}),
  };
}

function recipeIngestJobParams(record) {
  return [
    record.job_id,
    record.source_type,
    record.source_name,
    record.source_url,
    record.raw_text,
    JSON.stringify(record.raw_json),
    record.language,
    record.status,
    record.generation_method,
    record.rules_version,
  ];
}

function stagedRecipeParams(record) {
  return [
    record.staged_recipe_id,
    record.job_id,
    record.proposed_recipe_key,
    record.title_original,
    record.title_en,
    record.title_bg,
    record.description,
    record.servings,
    record.yield_quantity,
    record.yield_unit,
    JSON.stringify(record.cuisine_tags_json),
    JSON.stringify(record.region_tags_json),
    JSON.stringify(record.dietary_tags_json),
    JSON.stringify(record.meal_type_tags_json),
    JSON.stringify(record.feeling_tags_json),
    JSON.stringify(record.flavor_profile_json),
    JSON.stringify(record.texture_profile_json),
    record.difficulty_level,
    record.budget_level,
    record.prep_time_minutes,
    record.cook_time_minutes,
    record.rest_time_minutes,
    record.total_time_minutes,
    record.review_status,
    record.confidence,
    JSON.stringify(record.extraction_json),
  ];
}

function stagedIngredientParams(record) {
  return [
    record.staged_recipe_ingredient_id,
    record.staged_recipe_id,
    record.raw_line,
    record.ingredient_name_original,
    record.ingredient_name_en,
    record.ingredient_name_bg,
    record.proposed_ingredient_key,
    record.matched_ingredient_id,
    record.quantity,
    record.unit,
    record.quantity_grams,
    record.preparation_note,
    record.optional,
    record.sort_order,
    record.match_confidence,
    record.review_status,
    JSON.stringify(record.extraction_json),
  ];
}

function stagedStepParams(record) {
  return [
    record.staged_recipe_step_id,
    record.staged_recipe_id,
    record.step_number,
    record.instruction_original,
    record.instruction_en,
    record.instruction_bg,
    record.duration_minutes,
    record.temperature_c,
    record.state_change_summary,
    JSON.stringify(record.extraction_json),
  ];
}

function hydrateStagedRecipeRow(row) {
  return hydrateJsonFields(row, [
    'cuisine_tags_json',
    'region_tags_json',
    'dietary_tags_json',
    'meal_type_tags_json',
    'feeling_tags_json',
    'flavor_profile_json',
    'texture_profile_json',
    'extraction_json',
    'raw_json',
  ]);
}

function hydrateJsonFields(row, jsonFields = []) {
  if (!row) return null;
  const hydrated = { ...row };
  for (const field of jsonFields) {
    hydrated[field] = parseJson(hydrated[field], field.endsWith('_json') && field.includes('tags') ? [] : {});
  }
  return hydrated;
}

function buildRecipeIngestJobId({ sourceType, sourceName, sourceUrl, rawText, rawJson }) {
  return `recipe_ingest_job:${slugify(sourceType)}:${stableHash([sourceName, sourceUrl, rawText, JSON.stringify(rawJson || {})].join('|'))}`;
}

function buildStagedRecipeId(jobId, proposedRecipeKey) {
  return `staged_recipe:${slugify(jobId)}:${slugify(proposedRecipeKey)}`;
}

function buildChildId(stagedRecipeId, kind, key, index) {
  return `${kind}:${slugify(stagedRecipeId)}:${slugify(key)}:${index + 1}`;
}

function normalizeKey(value, fieldName) {
  const normalized = slugify(value);
  if (!normalized) throw new Error(`${fieldName} is required.`);
  return normalized;
}

function normalizeJobStatus(value) {
  const normalized = requiredString(value, 'status').toLowerCase();
  if (!SUPPORTED_RECIPE_INGEST_JOB_STATUSES.includes(normalized)) {
    throw new Error(`Unsupported recipe ingest job status: ${value}`);
  }
  return normalized;
}

function normalizeStagedRecipeReviewStatus(value) {
  const normalized = requiredString(value, 'review_status').toLowerCase();
  if (!SUPPORTED_STAGED_RECIPE_REVIEW_STATUSES.includes(normalized)) {
    throw new Error(`Unsupported staged recipe review_status: ${value}`);
  }
  return normalized;
}

function normalizeStagedIngredientReviewStatus(value) {
  const normalized = requiredString(value, 'review_status').toLowerCase();
  if (!SUPPORTED_STAGED_INGREDIENT_REVIEW_STATUSES.includes(normalized)) {
    throw new Error(`Unsupported staged ingredient review_status: ${value}`);
  }
  return normalized;
}

function normalizeJsonObject(value) {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'string') {
    const parsed = parseJson(value, null);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeJsonArray(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    const parsed = parseJson(value, null);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return [String(value)].filter(Boolean);
}

function nullableConfidence(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    throw new Error(`confidence must be between 0 and 1: ${value}`);
  }
  return normalized;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
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

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function stableHash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_RECIPE_INGEST_GENERATION_METHOD,
  DEFAULT_RECIPE_INGEST_LIMIT,
  DEFAULT_RECIPE_INGEST_RULES_VERSION,
  SUPPORTED_RECIPE_INGEST_JOB_STATUSES,
  SUPPORTED_STAGED_INGREDIENT_REVIEW_STATUSES,
  SUPPORTED_STAGED_RECIPE_REVIEW_STATUSES,
  buildChildId,
  buildRecipeIngestJobId,
  buildStagedRecipeId,
  createRecipeIngestJob,
  deleteRecipeIngestStaging,
  getStagedRecipeDetail,
  insertStagedRecipeBundle,
  listStagedRecipes,
  normalizeRecipeIngestJobRecord,
  normalizeStagedIngredientRecord,
  normalizeStagedRecipeRecord,
  normalizeStagedStepRecord,
  searchStagedRecipes,
  updateStagedRecipeReviewStatus,
  upsertStagedIngredients,
  upsertStagedMethods,
  upsertStagedQualitySignals,
  upsertStagedRecipe,
  upsertStagedStateChanges,
  upsertStagedSteps,
  upsertStagedSubstitutionHints,
  upsertStagedTags,
  upsertStagedTools,
};
