async function upsertSourceDataset(client, dataset) {
  requireClient(client);
  const record = normalizeDataset(dataset);
  const result = await client.query(`
    INSERT INTO source_datasets (
      dataset_id,
      source_name,
      source_type,
      version,
      root_path,
      license_note
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (dataset_id) DO UPDATE SET
      source_name = EXCLUDED.source_name,
      source_type = EXCLUDED.source_type,
      version = EXCLUDED.version,
      root_path = EXCLUDED.root_path,
      license_note = EXCLUDED.license_note,
      updated_at = NOW()
    RETURNING *
  `, [
    record.dataset_id,
    record.source_name,
    record.source_type,
    record.version,
    record.root_path,
    record.license_note,
  ]);
  return result.rows[0];
}

async function getSourceDataset(client, datasetId) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM source_datasets WHERE dataset_id = $1',
    [requiredString(datasetId, 'dataset_id')]
  );
  return result.rows[0] || null;
}

async function insertSourceFile(client, sourceFile) {
  requireClient(client);
  const record = normalizeSourceFile(sourceFile);
  const result = await client.query(`
    INSERT INTO source_files (
      source_file_id,
      dataset_id,
      path,
      format,
      bytes,
      row_count,
      checksum
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (source_file_id) DO UPDATE SET
      dataset_id = EXCLUDED.dataset_id,
      path = EXCLUDED.path,
      format = EXCLUDED.format,
      bytes = EXCLUDED.bytes,
      row_count = EXCLUDED.row_count,
      checksum = EXCLUDED.checksum
    RETURNING *
  `, [
    record.source_file_id,
    record.dataset_id,
    record.path,
    record.format,
    record.bytes,
    record.row_count,
    record.checksum,
  ]);
  return result.rows[0];
}

async function createImportBatch(client, batch) {
  requireClient(client);
  const record = normalizeImportBatch(batch);
  const result = await client.query(`
    INSERT INTO import_batches (
      import_batch_id,
      dataset_id,
      status,
      started_at,
      metadata_json
    )
    VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()), $5::jsonb)
    RETURNING *
  `, [
    record.import_batch_id,
    record.dataset_id,
    record.status,
    record.started_at,
    JSON.stringify(record.metadata_json),
  ]);
  return result.rows[0];
}

async function completeImportBatch(client, {
  importBatchId,
  status,
  completedAt = new Date().toISOString(),
  errorMessage = null,
} = {}) {
  requireClient(client);
  const result = await client.query(`
    UPDATE import_batches
    SET status = $2,
        completed_at = $3,
        error_message = $4
    WHERE import_batch_id = $1
    RETURNING *
  `, [
    requiredString(importBatchId, 'import_batch_id'),
    requiredString(status, 'status'),
    completedAt,
    errorMessage,
  ]);
  return result.rows[0] || null;
}

async function getImportBatch(client, importBatchId) {
  requireClient(client);
  const result = await client.query(
    'SELECT * FROM import_batches WHERE import_batch_id = $1',
    [requiredString(importBatchId, 'import_batch_id')]
  );
  return result.rows[0] || null;
}

function normalizeDataset(dataset = {}) {
  return {
    dataset_id: requiredString(dataset.dataset_id || dataset.datasetId, 'dataset_id'),
    source_name: requiredString(dataset.source_name || dataset.sourceName, 'source_name'),
    source_type: requiredString(dataset.source_type || dataset.sourceType, 'source_type'),
    version: nullableString(dataset.version),
    root_path: nullableString(dataset.root_path || dataset.rootPath),
    license_note: nullableString(dataset.license_note || dataset.licenseNote),
  };
}

function normalizeSourceFile(sourceFile = {}) {
  return {
    source_file_id: requiredString(sourceFile.source_file_id || sourceFile.sourceFileId, 'source_file_id'),
    dataset_id: requiredString(sourceFile.dataset_id || sourceFile.datasetId, 'dataset_id'),
    path: requiredString(sourceFile.path, 'path'),
    format: nullableString(sourceFile.format),
    bytes: nullableNumber(sourceFile.bytes, 'bytes'),
    row_count: nullableNumber(sourceFile.row_count || sourceFile.rowCount, 'row_count'),
    checksum: nullableString(sourceFile.checksum),
  };
}

function normalizeImportBatch(batch = {}) {
  return {
    import_batch_id: requiredString(batch.import_batch_id || batch.importBatchId, 'import_batch_id'),
    dataset_id: requiredString(batch.dataset_id || batch.datasetId, 'dataset_id'),
    status: requiredString(batch.status || 'pending', 'status'),
    started_at: batch.started_at || batch.startedAt || null,
    metadata_json: batch.metadata_json || batch.metadataJson || {},
  };
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('A Postgres client with query(sql, params) is required.');
  }
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
  completeImportBatch,
  createImportBatch,
  getImportBatch,
  getSourceDataset,
  insertSourceFile,
  normalizeDataset,
  normalizeImportBatch,
  normalizeSourceFile,
  upsertSourceDataset,
};
