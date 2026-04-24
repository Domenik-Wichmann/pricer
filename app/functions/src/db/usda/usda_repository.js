function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
}

async function upsertUsdaFoodCategories(client, records) {
  requireClient(client);
  return upsertBatch(client, {
    table: 'usda_food_categories',
    columns: ['food_category_id', 'code', 'description'],
    conflictColumn: 'food_category_id',
    records,
  });
}

async function upsertUsdaMeasureUnits(client, records) {
  requireClient(client);
  return upsertBatch(client, {
    table: 'usda_measure_units',
    columns: ['measure_unit_id', 'name'],
    conflictColumn: 'measure_unit_id',
    records,
  });
}

async function upsertUsdaNutrients(client, records) {
  requireClient(client);
  return upsertBatch(client, {
    table: 'usda_nutrients',
    columns: ['nutrient_id', 'name', 'unit_name', 'nutrient_nbr', 'rank'],
    conflictColumn: 'nutrient_id',
    records,
  });
}

async function upsertUsdaFoods(client, records) {
  requireClient(client);
  return upsertBatch(client, {
    table: 'usda_foods',
    columns: ['fdc_id', 'data_type', 'description', 'food_category_id', 'publication_date', 'raw_json'],
    conflictColumn: 'fdc_id',
    jsonColumns: new Set(['raw_json']),
    records,
  });
}

async function upsertUsdaFoodNutrients(client, records) {
  requireClient(client);
  return upsertBatch(client, {
    table: 'usda_food_nutrients',
    columns: [
      'food_nutrient_id',
      'fdc_id',
      'nutrient_id',
      'amount',
      'derivation_id',
      'data_points',
      'min',
      'max',
      'median',
      'footnote',
    ],
    conflictColumn: 'food_nutrient_id',
    records,
  });
}

async function upsertUsdaFoodPortions(client, records) {
  requireClient(client);
  return upsertBatch(client, {
    table: 'usda_food_portions',
    columns: ['id', 'fdc_id', 'amount', 'measure_unit_id', 'portion_description', 'modifier', 'gram_weight'],
    conflictColumn: 'id',
    records,
  });
}

async function createUsdaImportRun(client, run) {
  requireClient(client);
  const record = normalizeUsdaImportRun(run);
  const result = await client.query(`
    INSERT INTO usda_import_runs (
      usda_import_run_id,
      import_batch_id,
      dataset_root,
      status,
      foods_imported,
      nutrients_imported,
      food_nutrients_imported,
      portions_imported,
      started_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()))
    ON CONFLICT (usda_import_run_id) DO UPDATE SET
      import_batch_id = EXCLUDED.import_batch_id,
      dataset_root = EXCLUDED.dataset_root,
      status = EXCLUDED.status,
      foods_imported = EXCLUDED.foods_imported,
      nutrients_imported = EXCLUDED.nutrients_imported,
      food_nutrients_imported = EXCLUDED.food_nutrients_imported,
      portions_imported = EXCLUDED.portions_imported,
      error_message = NULL
    RETURNING *
  `, [
    record.usda_import_run_id,
    record.import_batch_id,
    record.dataset_root,
    record.status,
    record.foods_imported,
    record.nutrients_imported,
    record.food_nutrients_imported,
    record.portions_imported,
    record.started_at,
  ]);
  return result.rows[0];
}

async function completeUsdaImportRun(client, run) {
  requireClient(client);
  const result = await client.query(`
    UPDATE usda_import_runs
    SET status = $2,
        foods_imported = $3,
        nutrients_imported = $4,
        food_nutrients_imported = $5,
        portions_imported = $6,
        completed_at = COALESCE($7::timestamptz, NOW()),
        error_message = $8
    WHERE usda_import_run_id = $1
    RETURNING *
  `, [
    requiredString(run.usda_import_run_id || run.usdaImportRunId, 'usda_import_run_id'),
    requiredString(run.status, 'status'),
    nullableNumber(run.foods_imported || run.foodsImported, 'foods_imported') || 0,
    nullableNumber(run.nutrients_imported || run.nutrientsImported, 'nutrients_imported') || 0,
    nullableNumber(run.food_nutrients_imported || run.foodNutrientsImported, 'food_nutrients_imported') || 0,
    nullableNumber(run.portions_imported || run.portionsImported, 'portions_imported') || 0,
    run.completed_at || run.completedAt || null,
    nullableString(run.error_message || run.errorMessage),
  ]);
  return result.rows[0] || null;
}

async function getUsdaFoodWithMacros(client, fdcId) {
  requireClient(client);
  const foodResult = await client.query(
    'SELECT * FROM usda_foods WHERE fdc_id = $1',
    [requiredNumber(fdcId, 'fdc_id')]
  );
  const food = foodResult.rows[0] || null;
  if (!food) {
    return null;
  }
  const nutrientsResult = await client.query(`
    SELECT fn.*, n.name, n.unit_name, n.nutrient_nbr
    FROM usda_food_nutrients fn
    JOIN usda_nutrients n ON n.nutrient_id = fn.nutrient_id
    WHERE fn.fdc_id = $1
    ORDER BY fn.nutrient_id
  `, [Number(fdcId)]);
  return {
    ...food,
    macro_nutrients: nutrientsResult.rows,
  };
}

function normalizeFoodCategory(row) {
  return {
    food_category_id: requiredNumber(row.id || row.food_category_id, 'food_category_id'),
    code: nullableString(row.code),
    description: requiredString(row.description, 'description'),
  };
}

function normalizeMeasureUnit(row) {
  return {
    measure_unit_id: requiredNumber(row.id || row.measure_unit_id, 'measure_unit_id'),
    name: requiredString(row.name, 'name'),
  };
}

function normalizeNutrient(row) {
  return {
    nutrient_id: requiredNumber(row.id || row.nutrient_id, 'nutrient_id'),
    name: requiredString(row.name, 'name'),
    unit_name: nullableString(row.unit_name),
    nutrient_nbr: nullableString(row.nutrient_nbr),
    rank: nullableNumber(row.rank, 'rank'),
  };
}

function normalizeFood(row) {
  return {
    fdc_id: requiredNumber(row.fdc_id, 'fdc_id'),
    data_type: nullableString(row.data_type),
    description: requiredString(row.description, 'description'),
    food_category_id: nullableString(row.food_category_id),
    publication_date: nullableString(row.publication_date),
    raw_json: row.raw_json || row,
  };
}

function normalizeFoodNutrient(row) {
  return {
    food_nutrient_id: requiredNumber(row.id || row.food_nutrient_id, 'food_nutrient_id'),
    fdc_id: requiredNumber(row.fdc_id, 'fdc_id'),
    nutrient_id: requiredNumber(row.nutrient_id, 'nutrient_id'),
    amount: nullableNumber(row.amount, 'amount'),
    derivation_id: nullableString(row.derivation_id),
    data_points: nullableNumber(row.data_points, 'data_points'),
    min: nullableNumber(row.min, 'min'),
    max: nullableNumber(row.max, 'max'),
    median: nullableNumber(row.median, 'median'),
    footnote: nullableString(row.footnote),
  };
}

function normalizeFoodPortion(row) {
  return {
    id: requiredNumber(row.id, 'id'),
    fdc_id: requiredNumber(row.fdc_id, 'fdc_id'),
    amount: nullableNumber(row.amount, 'amount'),
    measure_unit_id: nullableNumber(row.measure_unit_id, 'measure_unit_id'),
    portion_description: nullableString(row.portion_description),
    modifier: nullableString(row.modifier),
    gram_weight: nullableNumber(row.gram_weight, 'gram_weight'),
  };
}

function normalizeUsdaImportRun(run = {}) {
  return {
    usda_import_run_id: requiredString(run.usda_import_run_id || run.usdaImportRunId, 'usda_import_run_id'),
    import_batch_id: requiredString(run.import_batch_id || run.importBatchId, 'import_batch_id'),
    dataset_root: requiredString(run.dataset_root || run.datasetRoot, 'dataset_root'),
    status: requiredString(run.status || 'running', 'status'),
    foods_imported: nullableNumber(run.foods_imported || run.foodsImported, 'foods_imported') || 0,
    nutrients_imported: nullableNumber(run.nutrients_imported || run.nutrientsImported, 'nutrients_imported') || 0,
    food_nutrients_imported: nullableNumber(run.food_nutrients_imported || run.foodNutrientsImported, 'food_nutrients_imported') || 0,
    portions_imported: nullableNumber(run.portions_imported || run.portionsImported, 'portions_imported') || 0,
    started_at: run.started_at || run.startedAt || null,
  };
}

async function upsertBatch(client, {
  table,
  columns,
  conflictColumn,
  jsonColumns = new Set(),
  records,
}) {
  if (!records || records.length === 0) {
    return 0;
  }

  const placeholders = [];
  const values = [];
  records.forEach((record, rowIndex) => {
    const rowPlaceholders = columns.map((column, columnIndex) => {
      const valueIndex = rowIndex * columns.length + columnIndex + 1;
      const cast = jsonColumns.has(column) ? '::jsonb' : '';
      values.push(jsonColumns.has(column) ? JSON.stringify(record[column] || {}) : record[column]);
      return `$${valueIndex}${cast}`;
    });
    placeholders.push(`(${rowPlaceholders.join(', ')})`);
  });

  const updateColumns = columns
    .filter((column) => column !== conflictColumn)
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ');

  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (${conflictColumn}) DO UPDATE SET ${updateColumns}
  `;
  await client.query(sql, values);
  return records.length;
}

function requiredString(value, fieldName) {
  const normalized = nullableString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

function nullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function requiredNumber(value, fieldName) {
  const normalized = nullableNumber(value, fieldName);
  if (normalized === null) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

function nullableNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new Error(`${fieldName} must be numeric.`);
  }
  return normalized;
}

module.exports = {
  completeUsdaImportRun,
  createUsdaImportRun,
  getUsdaFoodWithMacros,
  normalizeFood,
  normalizeFoodCategory,
  normalizeFoodNutrient,
  normalizeFoodPortion,
  normalizeMeasureUnit,
  normalizeNutrient,
  normalizeUsdaImportRun,
  upsertUsdaFoodCategories,
  upsertUsdaFoodNutrients,
  upsertUsdaFoodPortions,
  upsertUsdaFoods,
  upsertUsdaMeasureUnits,
  upsertUsdaNutrients,
};
