CREATE TABLE IF NOT EXISTS ingredient_nutrition_profile_candidates (
  profile_candidate_id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL,
  mapping_id TEXT NOT NULL REFERENCES ingredient_nutrition_mappings(mapping_id) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL,
  representative_fdc_id BIGINT NOT NULL REFERENCES usda_foods(fdc_id) ON DELETE RESTRICT,
  basis_amount NUMERIC NOT NULL DEFAULT 100,
  basis_unit TEXT NOT NULL DEFAULT 'g',
  kcal NUMERIC,
  protein_g NUMERIC,
  fat_g NUMERIC,
  carbs_g NUMERIC,
  fiber_g NUMERIC,
  sugar_g NUMERIC,
  sodium_mg NUMERIC,
  source_nutrients_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'candidate',
  source TEXT NOT NULL,
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredient_nutrition_profile_candidates_mapping_unique UNIQUE (mapping_id),
  CONSTRAINT ingredient_nutrition_profile_candidates_review_status_check CHECK (
    review_status IN ('candidate', 'approved', 'rejected', 'needs_review')
  ),
  CONSTRAINT ingredient_nutrition_profile_candidates_basis_check CHECK (
    basis_amount = 100 AND basis_unit = 'g'
  )
);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_profile_candidates_ingredient_id_idx
  ON ingredient_nutrition_profile_candidates(ingredient_id);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_profile_candidates_review_status_idx
  ON ingredient_nutrition_profile_candidates(review_status);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_profile_candidates_representative_fdc_id_idx
  ON ingredient_nutrition_profile_candidates(representative_fdc_id);
