const {
  CLUSTERABLE_DATA_TYPES,
  buildUsdaClusterCandidate,
} = require('./cluster_candidate_parser');
const { upsertUsdaFoodClusterCandidates } = require('./cluster_candidate_repository');
const { USDA_MACRO_NUTRIENT_IDS } = require('./macro_constants');

const DEFAULT_USDA_CLUSTER_BATCH_SIZE = 500;
const DEFAULT_USDA_CLUSTER_SOURCE_VERSION = '2025-12-18';

async function generateUsdaClusterCandidatesBatch({
  client,
  batchSize = DEFAULT_USDA_CLUSTER_BATCH_SIZE,
  limit = null,
  dataTypes = null,
  dryRun = false,
  sourceVersion = DEFAULT_USDA_CLUSTER_SOURCE_VERSION,
  logger = console,
} = {}) {
  requireClient(client);
  const options = normalizeClusterBatchOptions({
    batchSize,
    limit,
    dataTypes,
    dryRun,
    sourceVersion,
  });
  const summary = {
    scanned: 0,
    eligible: 0,
    skipped_no_macro_data: 0,
    skipped_unsupported_data_type: 0,
    generated: 0,
    upserted: 0,
    errors: 0,
  };

  let afterFdcId = 0;
  while (!options.limit || summary.scanned < options.limit) {
    const remaining = options.limit ? options.limit - summary.scanned : options.batchSize;
    const pageSize = Math.min(options.batchSize, remaining);
    const foods = await fetchUsdaClusterFoodPage(client, {
      afterFdcId,
      batchSize: pageSize,
      dataTypes: options.dataTypes,
    });
    if (foods.length === 0) {
      break;
    }

    summary.scanned += foods.length;
    afterFdcId = Number(foods[foods.length - 1].fdc_id);

    const supportedFoods = [];
    for (const food of foods) {
      if (!CLUSTERABLE_DATA_TYPES.has(String(food.data_type || '').trim())) {
        summary.skipped_unsupported_data_type += 1;
        continue;
      }
      supportedFoods.push(food);
    }
    summary.eligible += supportedFoods.length;

    // Macro presence is the guardrail that keeps candidates useful for later
    // recipe nutrition work while avoiding any averages or approved mappings.
    const macroFdcIds = await loadMacroPresenceForFoods(
      client,
      supportedFoods.map((food) => food.fdc_id),
    );

    const candidates = [];
    for (const food of supportedFoods) {
      try {
        const hasMacroData = macroFdcIds.has(Number(food.fdc_id));
        if (!hasMacroData) {
          summary.skipped_no_macro_data += 1;
          continue;
        }
        const candidate = buildUsdaClusterCandidate(food, {
          hasMacroData,
          sourceVersion: options.sourceVersion,
        });
        if (candidate) {
          candidates.push(candidate);
        }
      } catch (error) {
        summary.errors += 1;
        if (logger && typeof logger.warn === 'function') {
          logger.warn(`Skipping USDA cluster candidate row ${food.fdc_id}: ${error.message}`);
        }
      }
    }

    summary.generated += candidates.length;
    if (!options.dryRun && candidates.length > 0) {
      summary.upserted += await upsertUsdaFoodClusterCandidates(client, candidates);
    }

    if (foods.length < pageSize) {
      break;
    }
  }

  return summary;
}

async function fetchUsdaClusterFoodPage(client, {
  afterFdcId = 0,
  batchSize = DEFAULT_USDA_CLUSTER_BATCH_SIZE,
  dataTypes = Array.from(CLUSTERABLE_DATA_TYPES),
} = {}) {
  requireClient(client);
  const normalizedBatchSize = positiveInteger(batchSize, DEFAULT_USDA_CLUSTER_BATCH_SIZE);
  const normalizedDataTypes = normalizeDataTypes(dataTypes);
  const result = await client.query(`
    SELECT fdc_id, data_type, description, food_category_id
    FROM usda_foods
    WHERE fdc_id > $1
      AND data_type = ANY($2::text[])
    ORDER BY fdc_id ASC
    LIMIT $3
  `, [
    Number(afterFdcId) || 0,
    normalizedDataTypes,
    normalizedBatchSize,
  ]);
  return result.rows || [];
}

async function loadMacroPresenceForFoods(client, fdcIds) {
  requireClient(client);
  const ids = Array.from(new Set((fdcIds || [])
    .map((fdcId) => Number(fdcId))
    .filter((fdcId) => Number.isFinite(fdcId))));
  if (ids.length === 0) {
    return new Set();
  }

  const result = await client.query(`
    SELECT DISTINCT fn.fdc_id
    FROM usda_food_nutrients fn
    JOIN usda_nutrients n ON n.nutrient_id = fn.nutrient_id
    WHERE fn.fdc_id = ANY($1::bigint[])
      AND n.nutrient_id = ANY($2::int[])
      AND fn.amount IS NOT NULL
  `, [ids, USDA_MACRO_NUTRIENT_IDS]);
  return new Set((result.rows || []).map((row) => Number(row.fdc_id)));
}

function normalizeClusterBatchOptions({
  batchSize,
  limit,
  dataTypes,
  dryRun,
  sourceVersion,
}) {
  return {
    batchSize: positiveInteger(batchSize, DEFAULT_USDA_CLUSTER_BATCH_SIZE),
    limit: nullablePositiveInteger(limit),
    dataTypes: normalizeDataTypes(dataTypes || Array.from(CLUSTERABLE_DATA_TYPES)),
    dryRun: Boolean(dryRun),
    sourceVersion: String(sourceVersion || DEFAULT_USDA_CLUSTER_SOURCE_VERSION),
  };
}

function normalizeDataTypes(dataTypes) {
  const values = Array.isArray(dataTypes) ? dataTypes : [dataTypes];
  const normalized = values
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(normalized.length > 0 ? normalized : Array.from(CLUSTERABLE_DATA_TYPES)));
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return fallback;
  }
  return normalized;
}

function nullablePositiveInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }
  return normalized;
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

module.exports = {
  DEFAULT_USDA_CLUSTER_BATCH_SIZE,
  DEFAULT_USDA_CLUSTER_SOURCE_VERSION,
  fetchUsdaClusterFoodPage,
  generateUsdaClusterCandidatesBatch,
  loadMacroPresenceForFoods,
  normalizeClusterBatchOptions,
};
