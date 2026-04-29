const crypto = require('node:crypto');
const fs = require('fs');
const path = require('path');

const {
  completeImportBatch,
  createImportBatch,
  insertSourceFile,
  upsertSourceDataset,
} = require('../import_metadata_repository');
const {
  USDA_MACRO_NUTRIENT_IDS,
  isUsdaMacroNutrientId,
} = require('./macro_constants');
const { readCsvRows } = require('./csv_stream');
const {
  buildUsdaDatasetId,
  resolveUsdaDatasetRoot,
  resolveUsdaFilePaths,
} = require('./usda_schema');
const {
  completeUsdaImportRun,
  createUsdaImportRun,
  normalizeFood,
  normalizeFoodCategory,
  normalizeFoodNutrient,
  normalizeFoodPortion,
  normalizeMeasureUnit,
  normalizeNutrient,
  upsertUsdaFoodCategories,
  upsertUsdaFoodNutrients,
  upsertUsdaFoodPortions,
  upsertUsdaFoods,
  upsertUsdaMeasureUnits,
  upsertUsdaNutrients,
} = require('./usda_repository');

const DEFAULT_BATCH_SIZE = 1000;

async function importUsdaMacros({
  client,
  datasetRoot,
  datasetVersion = '2025-12-18',
  importRunId,
  importBatchId,
  batchSize = DEFAULT_BATCH_SIZE,
  now = () => new Date(),
  logger = console,
} = {}) {
  requireClient(client);
  const root = resolveUsdaDatasetRoot(datasetRoot);
  const files = resolveUsdaFilePaths(root);
  assertRequiredFiles(files);

  const datasetId = buildUsdaDatasetId(datasetVersion);
  const batchId = importBatchId || `${datasetId}_macro_import_${timestampForId(now())}`;
  const runId = importRunId || `${batchId}_usda`;
  const counts = {
    foods_imported: 0,
    nutrients_imported: 0,
    food_nutrients_imported: 0,
    portions_imported: 0,
  };
  const rowStats = createRowStats();
  const validFoodIds = new Set();

  await upsertSourceDataset(client, {
    datasetId,
    sourceName: 'USDA FoodData Central',
    sourceType: 'nutrition',
    version: datasetVersion,
    rootPath: root,
    licenseNote: 'USDA FoodData Central public data; preserve raw files for source truth.',
  });

  await registerSourceFiles(client, {
    datasetId,
    root,
    files,
  });

  await createImportBatch(client, {
    importBatchId: batchId,
    datasetId,
    status: 'running',
    metadataJson: {
      import_type: 'usda_macro_only',
      macro_nutrient_ids: USDA_MACRO_NUTRIENT_IDS,
      dataset_root: root,
    },
  });

  await createUsdaImportRun(client, {
    usdaImportRunId: runId,
    importBatchId: batchId,
    datasetRoot: root,
    status: 'running',
    metadataJson: rowStats,
  });

  try {
    counts.nutrients_imported = await importCsvInBatches(files.nutrient, batchSize, {
      normalize: normalizeNutrient,
      validate: (row) => validateNutrientRow(row, rowStats),
      flush: (records) => upsertUsdaNutrients(client, records),
    });
    logger.log(`Imported USDA macro nutrients: ${counts.nutrients_imported}`);

    await importCsvInBatches(files.foodCategory, batchSize, {
      normalize: normalizeFoodCategory,
      flush: (records) => upsertUsdaFoodCategories(client, records),
    });

    await importCsvInBatches(files.measureUnit, batchSize, {
      normalize: normalizeMeasureUnit,
      flush: (records) => upsertUsdaMeasureUnits(client, records),
    });

    counts.foods_imported = await importCsvInBatches(files.food, batchSize, {
      normalize: (row) => {
        const record = normalizeFood(row);
        validFoodIds.add(record.fdc_id);
        return record;
      },
      validate: (row) => validateFoodRow(row, rowStats),
      flush: (records) => upsertUsdaFoods(client, records),
    });
    logger.log(`Imported USDA foods: ${counts.foods_imported}`);

    counts.portions_imported = await importCsvInBatches(files.foodPortion, batchSize, {
      normalize: normalizeFoodPortion,
      validate: (row) => validateFoodPortionRow(row, rowStats, validFoodIds),
      flush: (records) => upsertUsdaFoodPortions(client, records),
    });
    logger.log(`Imported USDA food portions: ${counts.portions_imported}`);

    counts.food_nutrients_imported = await importCsvInBatches(files.foodNutrient, batchSize, {
      normalize: normalizeFoodNutrient,
      validate: (row) => validateFoodNutrientRow(row, rowStats, validFoodIds),
      flush: (records) => upsertUsdaFoodNutrients(client, records),
    });
    logger.log(`Imported USDA macro food nutrients: ${counts.food_nutrients_imported}`);

    await completeUsdaImportRun(client, {
      usdaImportRunId: runId,
      status: 'completed',
      metadataJson: rowStats,
      ...counts,
    });
    await completeImportBatch(client, {
      importBatchId: batchId,
      status: 'completed',
    });
    logSkippedRowSummary(logger, rowStats);

    return {
      dataset_id: datasetId,
      import_batch_id: batchId,
      usda_import_run_id: runId,
      dataset_root: root,
      status: 'completed',
      metadata_json: rowStats,
      ...counts,
    };
  } catch (error) {
    await completeUsdaImportRun(client, {
      usdaImportRunId: runId,
      status: 'failed',
      errorMessage: error.message,
      metadataJson: rowStats,
      ...counts,
    });
    await completeImportBatch(client, {
      importBatchId: batchId,
      status: 'failed',
      errorMessage: error.message,
    });
    throw error;
  }
}

async function registerSourceFiles(client, {
  datasetId,
  root,
  files,
}) {
  for (const [key, filePath] of Object.entries(files)) {
    const stats = await inspectSourceFile(filePath);
    await insertSourceFile(client, {
      sourceFileId: `${datasetId}_${key}`,
      datasetId,
      path: path.relative(process.cwd(), filePath),
      format: 'csv',
      bytes: stats.bytes,
      rowCount: stats.row_count,
      checksum: stats.checksum,
    });
  }
}

async function importCsvInBatches(filePath, batchSize, {
  normalize,
  validate = () => true,
  flush,
}) {
  let imported = 0;
  let batch = [];

  for await (const row of readCsvRows(filePath)) {
    if (!validate(row)) {
      continue;
    }
    batch.push(normalize(row));
    if (batch.length >= batchSize) {
      imported += await flush(batch);
      batch = [];
    }
  }

  if (batch.length > 0) {
    imported += await flush(batch);
  }

  return imported;
}

function createRowStats() {
  return {
    invalid_food_rows: 0,
    invalid_nutrient_rows: 0,
    invalid_food_nutrient_rows: 0,
    invalid_food_portion_rows: 0,
    orphan_food_nutrient_rows: 0,
    orphan_food_portion_rows: 0,
    non_macro_nutrient_rows_skipped: 0,
    warnings: [],
    sample_invalid_rows: [],
  };
}

function validateFoodRow(row, stats) {
  const fdcId = toNumberOrNull(row.fdc_id);
  if (fdcId === null || !hasText(row.description)) {
    recordInvalidRow(stats, 'invalid_food_rows', 'food.csv', row.fdc_id || null);
    return false;
  }
  return true;
}

function validateNutrientRow(row, stats) {
  const nutrientId = toNumberOrNull(row.id || row.nutrient_id);
  if (!isUsdaMacroNutrientId(nutrientId)) {
    stats.non_macro_nutrient_rows_skipped += 1;
    return false;
  }
  if (nutrientId === null || !hasText(row.name)) {
    recordInvalidRow(stats, 'invalid_nutrient_rows', 'nutrient.csv', row.id || row.nutrient_id || null);
    return false;
  }
  return true;
}

function validateFoodNutrientRow(row, stats, validFoodIds = null) {
  const nutrientId = toNumberOrNull(row.nutrient_id);
  if (!isUsdaMacroNutrientId(nutrientId)) {
    stats.non_macro_nutrient_rows_skipped += 1;
    return false;
  }
  const hasRequiredFields = toNumberOrNull(row.id || row.food_nutrient_id) !== null
    && toNumberOrNull(row.fdc_id) !== null
    && nutrientId !== null
    && toNumberOrNull(row.amount) !== null;
  if (!hasRequiredFields) {
    recordInvalidRow(stats, 'invalid_food_nutrient_rows', 'food_nutrient.csv', row.id || row.food_nutrient_id || null);
    return false;
  }
  if (validFoodIds && !validFoodIds.has(toNumberOrNull(row.fdc_id))) {
    recordInvalidRow(stats, 'orphan_food_nutrient_rows', 'food_nutrient.csv', row.id || row.food_nutrient_id || null);
    return false;
  }
  return true;
}

function validateFoodPortionRow(row, stats, validFoodIds = null) {
  const hasRequiredFields = toNumberOrNull(row.id) !== null
    && toNumberOrNull(row.fdc_id) !== null
    && toNumberOrNull(row.gram_weight) !== null;
  if (!hasRequiredFields) {
    recordInvalidRow(stats, 'invalid_food_portion_rows', 'food_portion.csv', row.id || null);
    return false;
  }
  if (validFoodIds && !validFoodIds.has(toNumberOrNull(row.fdc_id))) {
    recordInvalidRow(stats, 'orphan_food_portion_rows', 'food_portion.csv', row.id || null);
    return false;
  }
  return true;
}

function recordInvalidRow(stats, counter, fileName, sourceId) {
  stats[counter] += 1;
  if (stats.sample_invalid_rows.length < 5) {
    stats.sample_invalid_rows.push({
      file: fileName,
      source_id: sourceId,
      reason: counter,
    });
  }
}

function logSkippedRowSummary(logger, stats) {
  const skippedCount = stats.invalid_food_rows
    + stats.invalid_nutrient_rows
    + stats.invalid_food_nutrient_rows
    + stats.invalid_food_portion_rows
    + stats.orphan_food_nutrient_rows
    + stats.orphan_food_portion_rows
    + stats.non_macro_nutrient_rows_skipped;
  if (skippedCount === 0) {
    return;
  }
  logger.log('USDA import completed with skipped rows:');
  logger.log(`- invalid_food_rows: ${stats.invalid_food_rows}`);
  logger.log(`- invalid_nutrient_rows: ${stats.invalid_nutrient_rows}`);
  logger.log(`- invalid_food_nutrient_rows: ${stats.invalid_food_nutrient_rows}`);
  logger.log(`- invalid_food_portion_rows: ${stats.invalid_food_portion_rows}`);
  logger.log(`- orphan_food_nutrient_rows: ${stats.orphan_food_nutrient_rows}`);
  logger.log(`- orphan_food_portion_rows: ${stats.orphan_food_portion_rows}`);
  logger.log(`- non_macro_nutrient_rows_skipped: ${stats.non_macro_nutrient_rows_skipped}`);
}

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

async function inspectSourceFile(filePath) {
  const stat = fs.statSync(filePath);
  let rowCount = 0;
  let hasHeader = false;
  for await (const _row of readCsvRows(filePath)) {
    hasHeader = true;
    rowCount += 1;
  }

  return {
    bytes: stat.size,
    row_count: hasHeader ? rowCount : 0,
    checksum: await checksumFile(filePath),
  };
}

function assertRequiredFiles(files) {
  Object.values(files).forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Required USDA file is missing: ${filePath}`);
    }
  });
}

async function checksumFile(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function timestampForId(date) {
  return date.toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('importUsdaMacros requires a Postgres client.');
  }
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  checksumFile,
  createRowStats,
  importCsvInBatches,
  importUsdaMacros,
  inspectSourceFile,
  logSkippedRowSummary,
  registerSourceFiles,
  validateFoodNutrientRow,
  validateFoodPortionRow,
  validateFoodRow,
  validateNutrientRow,
};
