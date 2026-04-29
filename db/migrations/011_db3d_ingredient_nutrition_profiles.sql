CREATE TABLE IF NOT EXISTS ingredient_nutrition_profiles (
  profile_id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL,
  mapping_id TEXT NOT NULL REFERENCES ingredient_nutrition_mappings(mapping_id) ON DELETE RESTRICT,
  cluster_id TEXT NOT NULL,
  representative_fdc_id BIGINT NOT NULL REFERENCES usda_foods(fdc_id) ON DELETE RESTRICT,
  default_for_state TEXT,
  mapping_type TEXT NOT NULL,
  kcal_per_100g NUMERIC,
  protein_g_per_100g NUMERIC,
  fat_g_per_100g NUMERIC,
  carbs_g_per_100g NUMERIC,
  fiber_g_per_100g NUMERIC,
  sugar_g_per_100g NUMERIC,
  sodium_mg_per_100g NUMERIC,
  source_nutrients_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_profile_candidate_id TEXT NOT NULL REFERENCES ingredient_nutrition_profile_candidates(profile_candidate_id) ON DELETE RESTRICT,
  confidence NUMERIC NOT NULL,
  review_status TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_decision TEXT,
  review_reason TEXT,
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  source_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredient_nutrition_profiles_review_status_check CHECK (
    review_status IN ('approved', 'rejected', 'needs_review', 'superseded')
  ),
  CONSTRAINT ingredient_nutrition_profiles_review_decision_check CHECK (
    review_decision IS NULL OR review_decision IN ('approved', 'rejected', 'needs_review', 'superseded')
  ),
  CONSTRAINT ingredient_nutrition_profiles_confidence_check CHECK (
    confidence >= 0 AND confidence <= 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ingredient_nutrition_profiles_active_unique_idx
  ON ingredient_nutrition_profiles(
    ingredient_id,
    mapping_type,
    COALESCE(default_for_state, '')
  )
  WHERE review_status = 'approved';

CREATE INDEX IF NOT EXISTS ingredient_nutrition_profiles_ingredient_id_idx
  ON ingredient_nutrition_profiles(ingredient_id);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_profiles_mapping_id_idx
  ON ingredient_nutrition_profiles(mapping_id);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_profiles_review_status_idx
  ON ingredient_nutrition_profiles(review_status);

CREATE TABLE IF NOT EXISTS ingredient_nutrition_profile_review_history (
  review_event_id TEXT PRIMARY KEY,
  source_profile_candidate_id TEXT NOT NULL REFERENCES ingredient_nutrition_profile_candidates(profile_candidate_id) ON DELETE RESTRICT,
  profile_id TEXT REFERENCES ingredient_nutrition_profiles(profile_id) ON DELETE SET NULL,
  superseded_profile_id TEXT REFERENCES ingredient_nutrition_profiles(profile_id) ON DELETE SET NULL,
  ingredient_id TEXT NOT NULL,
  mapping_id TEXT NOT NULL,
  cluster_id TEXT NOT NULL,
  previous_candidate_review_status TEXT,
  previous_profile_review_status TEXT,
  review_decision TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_reason TEXT,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredient_nutrition_profile_review_history_decision_check CHECK (
    review_decision IN ('approved', 'rejected', 'needs_review', 'superseded')
  )
);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_profile_review_history_candidate_idx
  ON ingredient_nutrition_profile_review_history(source_profile_candidate_id);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_profile_review_history_profile_idx
  ON ingredient_nutrition_profile_review_history(profile_id);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_profile_review_history_ingredient_idx
  ON ingredient_nutrition_profile_review_history(ingredient_id);
