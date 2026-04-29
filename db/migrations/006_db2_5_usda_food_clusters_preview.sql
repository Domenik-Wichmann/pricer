CREATE TABLE IF NOT EXISTS usda_food_clusters (
  cluster_id TEXT PRIMARY KEY,
  cluster_key TEXT NOT NULL UNIQUE,
  core_food_name TEXT NOT NULL,
  core_food_normalized TEXT NOT NULL,
  food_category_hint TEXT,
  source_category_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  parsed_shared_qualifiers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  representative_fdc_id BIGINT REFERENCES usda_foods(fdc_id) ON DELETE SET NULL,
  representative_selection_reason TEXT NOT NULL,
  confidence TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending_review',
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  source_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usda_food_clusters_confidence_check CHECK (
    confidence IN ('high', 'medium', 'low')
  ),
  CONSTRAINT usda_food_clusters_review_status_check CHECK (
    review_status IN ('pending_review', 'approved', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS usda_food_clusters_review_status_idx
  ON usda_food_clusters(review_status);

CREATE INDEX IF NOT EXISTS usda_food_clusters_core_food_normalized_idx
  ON usda_food_clusters(core_food_normalized);

CREATE TABLE IF NOT EXISTS usda_food_cluster_members (
  cluster_member_id TEXT PRIMARY KEY,
  cluster_id TEXT NOT NULL REFERENCES usda_food_clusters(cluster_id) ON DELETE CASCADE,
  fdc_id BIGINT NOT NULL REFERENCES usda_foods(fdc_id) ON DELETE CASCADE,
  member_role TEXT NOT NULL,
  confidence TEXT NOT NULL,
  inclusion_reason TEXT NOT NULL,
  exclusion_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_data_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usda_food_cluster_members_role_check CHECK (
    member_role IN ('representative', 'included', 'candidate')
  ),
  CONSTRAINT usda_food_cluster_members_confidence_check CHECK (
    confidence IN ('high', 'medium', 'low')
  ),
  CONSTRAINT usda_food_cluster_members_cluster_fdc_unique UNIQUE (cluster_id, fdc_id)
);

CREATE INDEX IF NOT EXISTS usda_food_cluster_members_cluster_id_idx
  ON usda_food_cluster_members(cluster_id);

CREATE INDEX IF NOT EXISTS usda_food_cluster_members_fdc_id_idx
  ON usda_food_cluster_members(fdc_id);
