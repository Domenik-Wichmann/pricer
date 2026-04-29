CREATE TABLE IF NOT EXISTS recipe_ingest_jobs (
  job_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_name TEXT,
  source_url TEXT,
  raw_text TEXT,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  language TEXT,
  status TEXT NOT NULL DEFAULT 'staged',
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_ingest_jobs_status_check CHECK (
    status IN ('pending', 'staged', 'needs_review', 'completed', 'failed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS recipe_ingest_jobs_status_idx
  ON recipe_ingest_jobs(status);

CREATE INDEX IF NOT EXISTS recipe_ingest_jobs_source_type_idx
  ON recipe_ingest_jobs(source_type);

CREATE TABLE IF NOT EXISTS recipe_ingest_staged_recipes (
  staged_recipe_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES recipe_ingest_jobs(job_id) ON DELETE RESTRICT,
  proposed_recipe_key TEXT NOT NULL,
  title_original TEXT,
  title_en TEXT,
  title_bg TEXT,
  description TEXT,
  servings NUMERIC,
  yield_quantity NUMERIC,
  yield_unit TEXT,
  cuisine_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  region_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  dietary_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  meal_type_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  feeling_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  flavor_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  texture_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  difficulty_level TEXT,
  budget_level TEXT,
  prep_time_minutes NUMERIC,
  cook_time_minutes NUMERIC,
  rest_time_minutes NUMERIC,
  total_time_minutes NUMERIC,
  review_status TEXT NOT NULL DEFAULT 'staged',
  confidence NUMERIC,
  extraction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_ingest_staged_recipes_key_unique UNIQUE (proposed_recipe_key, job_id),
  CONSTRAINT recipe_ingest_staged_recipes_review_status_check CHECK (
    review_status IN ('staged', 'needs_review', 'approved', 'rejected', 'promoted')
  ),
  CONSTRAINT recipe_ingest_staged_recipes_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_recipes_job_id_idx
  ON recipe_ingest_staged_recipes(job_id);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_recipes_review_status_idx
  ON recipe_ingest_staged_recipes(review_status);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_recipes_key_idx
  ON recipe_ingest_staged_recipes(proposed_recipe_key);

CREATE TABLE IF NOT EXISTS recipe_ingest_staged_ingredients (
  staged_recipe_ingredient_id TEXT PRIMARY KEY,
  staged_recipe_id TEXT NOT NULL REFERENCES recipe_ingest_staged_recipes(staged_recipe_id) ON DELETE RESTRICT,
  raw_line TEXT,
  ingredient_name_original TEXT,
  ingredient_name_en TEXT,
  ingredient_name_bg TEXT,
  proposed_ingredient_key TEXT,
  matched_ingredient_id TEXT REFERENCES ingredients(ingredient_id) ON DELETE SET NULL,
  quantity NUMERIC,
  unit TEXT,
  quantity_grams NUMERIC,
  preparation_note TEXT,
  optional BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  match_confidence NUMERIC,
  review_status TEXT NOT NULL DEFAULT 'staged',
  extraction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_ingest_staged_ingredients_review_status_check CHECK (
    review_status IN ('staged', 'needs_review', 'approved', 'rejected', 'matched')
  ),
  CONSTRAINT recipe_ingest_staged_ingredients_match_confidence_check CHECK (
    match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_ingredients_recipe_idx
  ON recipe_ingest_staged_ingredients(staged_recipe_id);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_ingredients_matched_ingredient_idx
  ON recipe_ingest_staged_ingredients(matched_ingredient_id);

CREATE TABLE IF NOT EXISTS recipe_ingest_staged_steps (
  staged_recipe_step_id TEXT PRIMARY KEY,
  staged_recipe_id TEXT NOT NULL REFERENCES recipe_ingest_staged_recipes(staged_recipe_id) ON DELETE RESTRICT,
  step_number INTEGER NOT NULL,
  instruction_original TEXT,
  instruction_en TEXT,
  instruction_bg TEXT,
  duration_minutes NUMERIC,
  temperature_c NUMERIC,
  state_change_summary TEXT,
  extraction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_ingest_staged_steps_step_number_check CHECK (step_number > 0)
);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_steps_recipe_idx
  ON recipe_ingest_staged_steps(staged_recipe_id);

CREATE TABLE IF NOT EXISTS recipe_ingest_staged_tools (
  staged_recipe_tool_id TEXT PRIMARY KEY,
  staged_recipe_id TEXT NOT NULL REFERENCES recipe_ingest_staged_recipes(staged_recipe_id) ON DELETE RESTRICT,
  tool_key TEXT NOT NULL,
  tool_name_en TEXT,
  tool_name_bg TEXT,
  confidence NUMERIC,
  evidence_text TEXT,
  extraction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_ingest_staged_tools_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_tools_recipe_idx
  ON recipe_ingest_staged_tools(staged_recipe_id);

CREATE TABLE IF NOT EXISTS recipe_ingest_staged_methods (
  staged_recipe_method_id TEXT PRIMARY KEY,
  staged_recipe_id TEXT NOT NULL REFERENCES recipe_ingest_staged_recipes(staged_recipe_id) ON DELETE RESTRICT,
  method_key TEXT NOT NULL,
  method_name_en TEXT,
  method_name_bg TEXT,
  confidence NUMERIC,
  evidence_text TEXT,
  extraction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_ingest_staged_methods_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_methods_recipe_idx
  ON recipe_ingest_staged_methods(staged_recipe_id);

CREATE TABLE IF NOT EXISTS recipe_ingest_staged_tags (
  staged_recipe_tag_id TEXT PRIMARY KEY,
  staged_recipe_id TEXT NOT NULL REFERENCES recipe_ingest_staged_recipes(staged_recipe_id) ON DELETE RESTRICT,
  tag_type TEXT NOT NULL,
  tag_key TEXT NOT NULL,
  tag_value TEXT,
  confidence NUMERIC,
  evidence_text TEXT,
  extraction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_ingest_staged_tags_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_tags_recipe_idx
  ON recipe_ingest_staged_tags(staged_recipe_id);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_tags_type_idx
  ON recipe_ingest_staged_tags(tag_type);

CREATE TABLE IF NOT EXISTS recipe_ingest_staged_state_changes (
  staged_recipe_state_change_id TEXT PRIMARY KEY,
  staged_recipe_id TEXT NOT NULL REFERENCES recipe_ingest_staged_recipes(staged_recipe_id) ON DELETE RESTRICT,
  state_change_key TEXT NOT NULL,
  ingredient_name TEXT,
  from_state TEXT,
  to_state TEXT,
  confidence NUMERIC,
  evidence_text TEXT,
  extraction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_ingest_staged_state_changes_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_state_changes_recipe_idx
  ON recipe_ingest_staged_state_changes(staged_recipe_id);

CREATE TABLE IF NOT EXISTS recipe_ingest_staged_substitution_hints (
  staged_recipe_substitution_hint_id TEXT PRIMARY KEY,
  staged_recipe_id TEXT NOT NULL REFERENCES recipe_ingest_staged_recipes(staged_recipe_id) ON DELETE RESTRICT,
  substitution_key TEXT NOT NULL,
  original_ingredient_name TEXT,
  substitute_ingredient_name TEXT,
  reason TEXT,
  confidence NUMERIC,
  evidence_text TEXT,
  extraction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_ingest_staged_substitution_hints_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_substitution_hints_recipe_idx
  ON recipe_ingest_staged_substitution_hints(staged_recipe_id);

CREATE TABLE IF NOT EXISTS recipe_ingest_staged_quality_signals (
  staged_recipe_quality_signal_id TEXT PRIMARY KEY,
  staged_recipe_id TEXT NOT NULL REFERENCES recipe_ingest_staged_recipes(staged_recipe_id) ON DELETE RESTRICT,
  signal_key TEXT NOT NULL,
  signal_name TEXT,
  signal_value TEXT,
  severity TEXT,
  confidence NUMERIC,
  evidence_text TEXT,
  extraction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_ingest_staged_quality_signals_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS recipe_ingest_staged_quality_signals_recipe_idx
  ON recipe_ingest_staged_quality_signals(staged_recipe_id);
