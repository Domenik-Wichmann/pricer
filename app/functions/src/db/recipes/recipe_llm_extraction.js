const {
  DEFAULT_GROK_ENDPOINT,
  DEFAULT_GROK_MODEL,
} = require('../../phase6/constants');
const {
  getIngredientByKey,
  normalizeIngredientKey,
  normalizeName,
  searchIngredients,
} = require('../ingredients/ingredient_repository');
const {
  buildRecipeExtractionPrompt,
  RECIPE_EXTRACTION_PROMPT_VERSION,
} = require('../../prompts/recipe_ingest/extract_recipe_v1');
const {
  insertStagedRecipeBundle,
} = require('./recipe_ingest_staging_repository');
const {
  parseRecipeExtractionJson,
  validateRecipeExtractionPayload,
} = require('./recipe_extraction_schema');

const DEFAULT_RECIPE_EXTRACTION_LIMIT = 10;
const DEFAULT_RECIPE_EXTRACTION_GENERATION_METHOD = 'llm_recipe_extraction_to_staging_v1';
const DEFAULT_RECIPE_EXTRACTION_RULES_VERSION = 'db5b_recipe_extraction_v1';

function isRecipeExtractionLlmConfigured(env = process.env) {
  return Boolean(env.XAI_API_KEY);
}

async function extractRecipeJobsToStaging(client, {
  jobId = null,
  status = 'pending',
  limit = DEFAULT_RECIPE_EXTRACTION_LIMIT,
  dryRun = false,
  force = false,
  recipeLlmClient = null,
  fetchImpl = fetch,
  apiKey = process.env.XAI_API_KEY,
  endpoint = DEFAULT_GROK_ENDPOINT,
  modelName = process.env.XAI_RECIPE_MODEL || process.env.XAI_GROK_MODEL || DEFAULT_GROK_MODEL,
  now = () => new Date(),
} = {}) {
  requireClient(client);
  const jobs = await fetchRecipeIngestJobs(client, { jobId, status, limit });
  const report = createExtractionReport({ dryRun, force });
  report.jobs_seen = jobs.length;

  for (const job of jobs) {
    try {
      const result = await extractRecipeJobToStaging(client, {
        job,
        dryRun,
        force,
        recipeLlmClient,
        fetchImpl,
        apiKey,
        endpoint,
        modelName,
        now,
      });
      if (result.skipped_existing) {
        report.skipped_existing += 1;
        continue;
      }
      report.jobs_extracted += 1;
      if (result.staged) report.jobs_staged += 1;
      report.ingredients_matched += result.ingredients_matched || 0;
      report.ingredients_unmatched += result.ingredients_unmatched || 0;
    } catch (error) {
      report.jobs_failed += 1;
      if (error.code === 'recipe_extraction_validation') {
        report.validation_errors += 1;
      } else if (error.code === 'recipe_extraction_llm') {
        report.llm_errors += 1;
      }
      report.errors.push({
        job_id: job.job_id,
        code: error.code || 'recipe_extraction_error',
        message: error.message,
      });
    }
  }

  return report;
}

async function extractRecipeJobToStaging(client, {
  job = null,
  jobId = null,
  dryRun = false,
  force = false,
  recipeLlmClient = null,
  fetchImpl = fetch,
  apiKey = process.env.XAI_API_KEY,
  endpoint = DEFAULT_GROK_ENDPOINT,
  modelName = process.env.XAI_RECIPE_MODEL || process.env.XAI_GROK_MODEL || DEFAULT_GROK_MODEL,
  now = () => new Date(),
} = {}) {
  requireClient(client);
  const sourceJob = job || (await fetchRecipeIngestJobs(client, { jobId, limit: 1 }))[0];
  if (!sourceJob) {
    throw new Error(`Recipe ingest job not found: ${jobId}`);
  }

  const existing = await fetchStagedRecipesForJob(client, sourceJob.job_id);
  if (existing.length > 0 && !force) {
    return {
      job: sourceJob,
      skipped_existing: true,
      staged: false,
      existing_staged_recipes: existing,
      ingredients_matched: 0,
      ingredients_unmatched: 0,
    };
  }

  const rawText = nullableString(sourceJob.raw_text);
  if (!rawText) {
    const error = validationError('Recipe ingest job raw_text is required for DB5B extraction.');
    if (!dryRun) {
      await markJobFailed(client, sourceJob, error, { modelName, now });
    }
    throw error;
  }

  if (!dryRun) {
    await updateRecipeIngestJobStatus(client, {
      jobId: sourceJob.job_id,
      status: 'extracting',
      rawJsonPatch: {
        db5b: {
          status: 'extracting',
          prompt_version: RECIPE_EXTRACTION_PROMPT_VERSION,
          model_name: modelName,
          extraction_started_at: now().toISOString(),
        },
      },
    });
  }

  const prompt = buildRecipeExtractionPrompt({
    rawText,
    language: sourceJob.language,
    sourceName: sourceJob.source_name,
    sourceUrl: sourceJob.source_url,
  });

  let llmResponse;
  let rawLlmResponse;
  try {
    llmResponse = recipeLlmClient
      ? await recipeLlmClient({ job: sourceJob, prompt })
      : await requestRecipeExtraction({
        prompt,
        fetchImpl,
        apiKey,
        endpoint,
        modelName,
      });
    rawLlmResponse = typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse);
  } catch (error) {
    const wrapped = llmError(error.message);
    if (!dryRun) {
      await markJobFailed(client, sourceJob, wrapped, { modelName, rawLlmResponse, now });
    }
    throw wrapped;
  }

  let extraction;
  try {
    extraction = validateRecipeExtractionPayload(parseRecipeExtractionJson(llmResponse));
  } catch (error) {
    if (!dryRun) {
      await markJobFailed(client, sourceJob, error, { modelName, rawLlmResponse, now });
    }
    throw error;
  }

  const ingredientMatches = await matchExtractedIngredients(client, extraction.ingredients);
  const bundle = buildStagedRecipeBundleFromExtraction({
    job: sourceJob,
    extraction,
    ingredientMatches,
    rawLlmResponse,
    modelName,
    extractedAt: now().toISOString(),
  });

  if (dryRun) {
    return {
      job: sourceJob,
      extraction,
      staged: false,
      dry_run: true,
      bundle,
      ingredients_matched: ingredientMatches.filter((match) => match.matched_ingredient_id).length,
      ingredients_unmatched: ingredientMatches.filter((match) => !match.matched_ingredient_id).length,
    };
  }

  const staged = await insertStagedRecipeBundle(client, bundle);
  return {
    job: staged.job,
    staged,
    extraction,
    skipped_existing: false,
    ingredients_matched: staged.ingredients.filter((ingredient) => ingredient.matched_ingredient_id).length,
    ingredients_unmatched: staged.ingredients.filter((ingredient) => !ingredient.matched_ingredient_id).length,
  };
}

async function requestRecipeExtraction({
  prompt,
  fetchImpl = fetch,
  apiKey = process.env.XAI_API_KEY,
  endpoint = DEFAULT_GROK_ENDPOINT,
  modelName = process.env.XAI_RECIPE_MODEL || process.env.XAI_GROK_MODEL || DEFAULT_GROK_MODEL,
} = {}) {
  if (!apiKey) {
    throw llmError('XAI_API_KEY is required for recipe extraction.');
  }
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'You extract recipe structure. Return strict JSON only.',
        },
        {
          role: 'user',
          content: JSON.stringify(prompt),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw llmError(`recipe extraction request failed with status ${response.status}`);
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw llmError('recipe extraction model response missing content');
  }
  return content;
}

async function fetchRecipeIngestJobs(client, {
  jobId = null,
  status = 'pending',
  limit = DEFAULT_RECIPE_EXTRACTION_LIMIT,
} = {}) {
  requireClient(client);
  if (jobId) {
    const result = await client.query(`
      SELECT *
      FROM recipe_ingest_jobs
      WHERE job_id = $1
      ORDER BY created_at ASC, job_id ASC
      LIMIT 1
    `, [jobId]);
    return (result.rows || []).map(hydrateRecipeIngestJobRow);
  }
  const result = await client.query(`
    SELECT *
    FROM recipe_ingest_jobs
    WHERE status = $1
    ORDER BY created_at ASC, job_id ASC
    LIMIT $2
  `, [normalizeJobStatus(status), positiveInteger(limit, DEFAULT_RECIPE_EXTRACTION_LIMIT)]);
  return (result.rows || []).map(hydrateRecipeIngestJobRow);
}

async function fetchStagedRecipesForJob(client, jobId) {
  const result = await client.query(`
    SELECT *
    FROM recipe_ingest_staged_recipes
    WHERE job_id = $1
    ORDER BY created_at ASC, staged_recipe_id ASC
  `, [requiredString(jobId, 'job_id')]);
  return (result.rows || []).map(hydrateJsonRow);
}

async function updateRecipeIngestJobStatus(client, {
  jobId,
  status,
  rawJsonPatch = {},
} = {}) {
  const result = await client.query(`
    UPDATE recipe_ingest_jobs
    SET status = $2,
        raw_json = COALESCE(raw_json, '{}'::jsonb) || $3::jsonb,
        updated_at = NOW()
    WHERE job_id = $1
    RETURNING *
  `, [requiredString(jobId, 'job_id'), normalizeJobStatus(status), JSON.stringify(normalizeObject(rawJsonPatch))]);
  return hydrateRecipeIngestJobRow(result.rows[0] || null);
}

async function markJobFailed(client, job, error, {
  modelName = null,
  rawLlmResponse = null,
  now = () => new Date(),
} = {}) {
  return updateRecipeIngestJobStatus(client, {
    jobId: job.job_id,
    status: 'failed',
    rawJsonPatch: {
      db5b: {
        status: 'failed',
        prompt_version: RECIPE_EXTRACTION_PROMPT_VERSION,
        model_name: modelName,
        raw_llm_response: rawLlmResponse || null,
        error_code: error.code || 'recipe_extraction_error',
        error_message: error.message,
        failed_at: now().toISOString(),
      },
    },
  });
}

async function matchExtractedIngredients(client, ingredients = []) {
  const matches = [];
  for (const ingredient of ingredients) {
    matches.push(await matchExtractedIngredient(client, ingredient));
  }
  return matches;
}

async function matchExtractedIngredient(client, ingredient = {}) {
  const proposedKey = normalizeIngredientKey(ingredient.proposed_ingredient_key);
  const exact = await getIngredientByKey(client, proposedKey);
  if (exact) {
    return ingredientMatch(exact, 'ingredient_key', 1);
  }

  const queries = unique([
    ingredient.ingredient_name_en,
    ingredient.ingredient_name_original,
    ingredient.ingredient_name_bg,
    proposedKey,
  ]);
  const candidates = [];
  for (const query of queries) {
    const rows = await searchIngredients(client, { query, limit: 10 });
    for (const row of rows) {
      candidates.push(row);
    }
  }

  const scored = candidates
    .map((candidate) => scoreIngredientCandidate(candidate, queries, proposedKey))
    .filter((entry) => entry.score >= 0.9)
    .sort((left, right) => right.score - left.score || String(left.ingredient_key).localeCompare(String(right.ingredient_key)));

  if (!scored[0]) {
    return {
      matched_ingredient_id: null,
      match_method: 'unmatched',
      match_confidence: null,
      matched_ingredient_key: null,
    };
  }
  return ingredientMatch(scored[0].candidate, scored[0].method, scored[0].score);
}

function scoreIngredientCandidate(candidate, queries, proposedKey) {
  const normalizedQueries = queries.map(normalizeName).filter(Boolean);
  const aliases = [
    ...arrayOf(candidate.aliases_json?.all),
    ...arrayOf(candidate.aliases_json?.en),
    ...arrayOf(candidate.aliases_json?.bg),
  ].map(normalizeName);
  if (normalizeName(candidate.ingredient_key) === proposedKey) {
    return { candidate, score: 1, method: 'ingredient_key' };
  }
  for (const query of normalizedQueries) {
    if (normalizeName(candidate.normalized_name) === query) {
      return { candidate, score: 0.96, method: 'normalized_name' };
    }
    if (normalizeName(candidate.name_en) === query || normalizeName(candidate.name_bg) === query) {
      return { candidate, score: 0.94, method: 'name' };
    }
    if (aliases.includes(query)) {
      return { candidate, score: 0.92, method: 'alias' };
    }
  }
  return { candidate, score: 0, method: 'unmatched' };
}

function ingredientMatch(ingredient, method, confidence) {
  return {
    matched_ingredient_id: ingredient.ingredient_id,
    matched_ingredient_key: ingredient.ingredient_key,
    match_method: method,
    match_confidence: confidence,
  };
}

function buildStagedRecipeBundleFromExtraction({
  job,
  extraction,
  ingredientMatches,
  rawLlmResponse,
  modelName,
  extractedAt,
}) {
  const extractionProvenance = {
    prompt_version: RECIPE_EXTRACTION_PROMPT_VERSION,
    model_name: modelName,
    generation_method: DEFAULT_RECIPE_EXTRACTION_GENERATION_METHOD,
    raw_llm_response: rawLlmResponse,
    parsed_extraction: extraction,
    extracted_at: extractedAt,
    ingredient_matches: ingredientMatches,
  };

  return {
    job: {
      ...job,
      status: 'staged',
      raw_json: {
        ...normalizeObject(job.raw_json),
        db5b: {
          status: 'staged',
          prompt_version: RECIPE_EXTRACTION_PROMPT_VERSION,
          model_name: modelName,
          raw_llm_response: rawLlmResponse,
          extracted_at: extractedAt,
        },
      },
      generation_method: DEFAULT_RECIPE_EXTRACTION_GENERATION_METHOD,
      rules_version: DEFAULT_RECIPE_EXTRACTION_RULES_VERSION,
    },
    recipe: {
      ...extraction.recipe,
      cuisine_tags: extraction.recipe.cuisine_tags,
      region_tags: extraction.recipe.region_tags,
      dietary_tags: extraction.recipe.dietary_tags,
      meal_type_tags: extraction.recipe.meal_type_tags,
      feeling_tags: extraction.recipe.feeling_tags,
      flavor_profile: extraction.recipe.flavor_profile,
      texture_profile: extraction.recipe.texture_profile,
      review_status: 'staged',
      extraction_json: {
        db5b: extractionProvenance,
      },
    },
    ingredients: extraction.ingredients.map((ingredient, index) => ({
      ...ingredient,
      matched_ingredient_id: ingredientMatches[index].matched_ingredient_id,
      match_confidence: ingredientMatches[index].match_confidence,
      review_status: ingredientMatches[index].matched_ingredient_id ? 'matched' : 'needs_review',
      extraction_json: {
        db5b: {
          source_ingredient: ingredient,
          match: ingredientMatches[index],
        },
      },
    })),
    steps: extraction.steps.map((step) => ({
      ...step,
      extraction_json: { db5b: { source_step: step } },
    })),
    tools: extraction.tools.map((tool) => ({
      key: tool.key,
      name_en: tool.name_en,
      name_bg: tool.name_bg,
      confidence: tool.confidence,
      evidence_text: tool.evidence_text,
      extraction_json: { db5b: { source_tool: tool } },
    })),
    methods: extraction.methods.map((method) => ({
      key: method.key,
      name_en: method.name_en,
      name_bg: method.name_bg,
      confidence: method.confidence,
      evidence_text: method.evidence_text,
      extraction_json: { db5b: { source_method: method } },
    })),
    tags: extraction.tags.map((tag) => ({
      ...tag,
      extraction_json: { db5b: { source_tag: tag } },
    })),
    state_changes: extraction.state_changes.map((stateChange) => ({
      ...stateChange,
      extraction_json: { db5b: { source_state_change: stateChange } },
    })),
    substitution_hints: extraction.substitution_hints.map((hint) => ({
      ...hint,
      extraction_json: { db5b: { source_substitution_hint: hint } },
    })),
    quality_signals: extraction.quality_signals.map((signal) => ({
      ...signal,
      extraction_json: { db5b: { source_quality_signal: signal } },
    })),
  };
}

function hydrateRecipeIngestJobRow(row) {
  if (!row) return null;
  return {
    ...row,
    raw_json: parseJson(row.raw_json, {}),
  };
}

function hydrateJsonRow(row) {
  if (!row) return null;
  const hydrated = { ...row };
  for (const [key, value] of Object.entries(hydrated)) {
    if (key.endsWith('_json')) {
      hydrated[key] = parseJson(value, key.includes('tags') ? [] : {});
    }
  }
  return hydrated;
}

function createExtractionReport({ dryRun, force }) {
  return {
    dry_run: Boolean(dryRun),
    force: Boolean(force),
    jobs_seen: 0,
    jobs_extracted: 0,
    jobs_staged: 0,
    jobs_failed: 0,
    skipped_existing: 0,
    ingredients_matched: 0,
    ingredients_unmatched: 0,
    validation_errors: 0,
    llm_errors: 0,
    errors: [],
  };
}

function normalizeJobStatus(value) {
  const status = requiredString(value, 'status').toLowerCase();
  const allowed = ['pending', 'extracting', 'staged', 'needs_review', 'completed', 'failed', 'cancelled'];
  if (!allowed.includes(status)) {
    throw new Error(`Unsupported recipe ingest job status: ${value}`);
  }
  return status;
}

function validationError(message) {
  const error = new Error(message);
  error.code = 'recipe_extraction_validation';
  return error;
}

function llmError(message) {
  const error = new Error(message);
  error.code = 'recipe_extraction_llm';
  return error;
}

function unique(values) {
  return [...new Set(values.map(nullableString).filter(Boolean))];
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  if (!value) return {};
  if (typeof value === 'string') return parseJson(value, {});
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
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

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_RECIPE_EXTRACTION_GENERATION_METHOD,
  DEFAULT_RECIPE_EXTRACTION_LIMIT,
  DEFAULT_RECIPE_EXTRACTION_RULES_VERSION,
  buildStagedRecipeBundleFromExtraction,
  extractRecipeJobToStaging,
  extractRecipeJobsToStaging,
  fetchRecipeIngestJobs,
  fetchStagedRecipesForJob,
  isRecipeExtractionLlmConfigured,
  matchExtractedIngredient,
  matchExtractedIngredients,
  requestRecipeExtraction,
  updateRecipeIngestJobStatus,
};
