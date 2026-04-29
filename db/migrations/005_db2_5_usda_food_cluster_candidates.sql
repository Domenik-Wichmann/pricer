CREATE TABLE IF NOT EXISTS usda_food_cluster_candidates (
  candidate_id TEXT PRIMARY KEY,
  candidate_key TEXT NOT NULL,
  core_food_name TEXT NOT NULL,
  core_food_normalized TEXT NOT NULL,
  source_fdc_id BIGINT NOT NULL REFERENCES usda_foods(fdc_id) ON DELETE CASCADE,
  source_description TEXT NOT NULL,
  source_data_type TEXT NOT NULL,
  source_food_category_id TEXT,
  parsed_qualifiers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  hard_boundary_signature TEXT NOT NULL,
  representative_score NUMERIC NOT NULL DEFAULT 0,
  representative_score_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence TEXT NOT NULL,
  review_status TEXT NOT NULL,
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  source_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usda_food_cluster_candidates_confidence_check CHECK (
    confidence IN ('high', 'medium', 'low')
  ),
  CONSTRAINT usda_food_cluster_candidates_review_status_check CHECK (
    review_status IN ('candidate', 'needs_review', 'approved', 'rejected')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS usda_food_cluster_candidates_source_fdc_id_idx
  ON usda_food_cluster_candidates(source_fdc_id);

CREATE INDEX IF NOT EXISTS usda_food_cluster_candidates_candidate_key_idx
  ON usda_food_cluster_candidates(candidate_key);

CREATE INDEX IF NOT EXISTS usda_food_cluster_candidates_review_status_idx
  ON usda_food_cluster_candidates(review_status);
