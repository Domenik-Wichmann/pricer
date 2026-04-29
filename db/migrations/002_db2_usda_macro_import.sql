CREATE TABLE IF NOT EXISTS usda_food_categories (
  food_category_id INTEGER PRIMARY KEY,
  code TEXT,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usda_measure_units (
  measure_unit_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usda_nutrients (
  nutrient_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  unit_name TEXT,
  nutrient_nbr TEXT,
  rank NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usda_foods (
  fdc_id BIGINT PRIMARY KEY,
  data_type TEXT,
  description TEXT NOT NULL,
  food_category_id TEXT,
  publication_date DATE,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usda_foods_data_type_idx
  ON usda_foods(data_type);

CREATE INDEX IF NOT EXISTS usda_foods_food_category_id_idx
  ON usda_foods(food_category_id);

CREATE TABLE IF NOT EXISTS usda_food_nutrients (
  food_nutrient_id BIGINT PRIMARY KEY,
  fdc_id BIGINT NOT NULL REFERENCES usda_foods(fdc_id) ON DELETE CASCADE,
  nutrient_id INTEGER NOT NULL REFERENCES usda_nutrients(nutrient_id) ON DELETE RESTRICT,
  amount NUMERIC,
  derivation_id TEXT,
  data_points INTEGER,
  min NUMERIC,
  max NUMERIC,
  median NUMERIC,
  footnote TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usda_food_nutrients_fdc_id_idx
  ON usda_food_nutrients(fdc_id);

CREATE INDEX IF NOT EXISTS usda_food_nutrients_nutrient_id_idx
  ON usda_food_nutrients(nutrient_id);

CREATE TABLE IF NOT EXISTS usda_food_portions (
  id BIGINT PRIMARY KEY,
  fdc_id BIGINT NOT NULL REFERENCES usda_foods(fdc_id) ON DELETE CASCADE,
  amount NUMERIC,
  measure_unit_id INTEGER REFERENCES usda_measure_units(measure_unit_id) ON DELETE SET NULL,
  portion_description TEXT,
  modifier TEXT,
  gram_weight NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usda_food_portions_fdc_id_idx
  ON usda_food_portions(fdc_id);

CREATE TABLE IF NOT EXISTS usda_import_runs (
  usda_import_run_id TEXT PRIMARY KEY,
  import_batch_id TEXT NOT NULL REFERENCES import_batches(import_batch_id) ON DELETE CASCADE,
  dataset_root TEXT NOT NULL,
  status TEXT NOT NULL,
  foods_imported BIGINT NOT NULL DEFAULT 0,
  nutrients_imported BIGINT NOT NULL DEFAULT 0,
  food_nutrients_imported BIGINT NOT NULL DEFAULT 0,
  portions_imported BIGINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  CONSTRAINT usda_import_runs_status_check CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS usda_import_runs_import_batch_id_idx
  ON usda_import_runs(import_batch_id);

CREATE INDEX IF NOT EXISTS usda_import_runs_status_idx
  ON usda_import_runs(status);
