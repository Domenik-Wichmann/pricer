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
  });

  try {
    counts.nutrients_imported = await importCsvInBatches(files.nutrient, batchSize, {
      normalize: normalizeNutrient,
      filter: (row) => isUsdaMacroNutrientId(row.id || row.nutrient_id),
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
      normalize: normalizeFood,
      flush: (records) => upsertUsdaFoods(client, records),
    });
    logger.log(`Imported USDA foods: ${counts.foods_imported}`);

    counts.portions_imported = await importCsvInBatches(files.foodPortion, batchSize, {
      normalize: normalizeFoodPortion,
      flush: (records) => upsertUsdaFoodPortions(client, records),
    });
    logger.log(`Imported USDA food portions: ${counts.portions_imported}`);

    counts.food_nutrients_imported = await importCsvInBatches(files.foodNutrient, batchSize, {
      normalize: normalizeFoodNutrient,
      filter: (row) => isUsdaMacroNutrientId(row.nutrient_id),
      flush: (records) => upsertUsdaFoodNutrients(client, records),
    });
    logger.log(`Imported USDA macro food nutrients: ${counts.food_nutrients_imported}`);

    await completeUsdaImportRun(client, {
      usdaImportRunId: runId,
      status: 'completed',
      ...counts,
    });
    await completeImportBatch(client, {
      importBatchId: batchId,
      status: 'completed',
    });

    return {
      dataset_id: datasetId,
      import_batch_id: batchId,
      usda_import_run_id: runId,
      dataset_root: root,
      status: 'completed',
      ...counts,
    };
  } catch (error) {
    await completeUsdaImportRun(client, {
      usdaImportRunId: runId,
      status: 'failed',
      errorMessage: error.message,
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
  filter = () => true,
  flush,
}) {
  let imported = 0;
  let batch = [];

  for await (const row of readCsvRows(filePath)) {
    if (!filter(row)) {
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
  importCsvInBatches,
  importUsdaMacros,
  inspectSourceFile,
  registerSourceFiles,
};
