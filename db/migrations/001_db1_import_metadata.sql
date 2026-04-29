CREATE TABLE IF NOT EXISTS source_datasets (
  dataset_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  version TEXT,
  root_path TEXT,
  license_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_files (
  source_file_id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES source_datasets(dataset_id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  format TEXT,
  bytes BIGINT,
  row_count BIGINT,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT source_files_bytes_nonnegative CHECK (bytes IS NULL OR bytes >= 0),
  CONSTRAINT source_files_row_count_nonnegative CHECK (row_count IS NULL OR row_count >= 0)
);

CREATE INDEX IF NOT EXISTS source_files_dataset_id_idx
  ON source_files(dataset_id);

CREATE TABLE IF NOT EXISTS import_batches (
  import_batch_id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES source_datasets(dataset_id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT import_batches_status_check CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS import_batches_dataset_id_idx
  ON import_batches(dataset_id);

CREATE INDEX IF NOT EXISTS import_batches_status_idx
  ON import_batches(status);
