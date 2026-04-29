CREATE TABLE IF NOT EXISTS ingredient_nutrition_mappings (
  mapping_id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL,
  cluster_id TEXT NOT NULL REFERENCES usda_food_clusters(cluster_id) ON DELETE CASCADE,
  representative_fdc_id BIGINT REFERENCES usda_foods(fdc_id) ON DELETE SET NULL,
  default_for_state TEXT,
  mapping_type TEXT NOT NULL,
  confidence NUMERIC NOT NULL,
  source TEXT NOT NULL,
  review_status TEXT NOT NULL,
  notes TEXT,
  suggestion_reason_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_decision TEXT,
  review_reason TEXT,
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  source_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredient_nutrition_mappings_status_check CHECK (
    review_status IN ('suggested', 'approved', 'rejected', 'needs_review')
  ),
  CONSTRAINT ingredient_nutrition_mappings_type_check CHECK (
    mapping_type IN ('default_raw', 'default_cooked', 'alternate_state', 'product_specific', 'rejected_candidate')
  ),
  CONSTRAINT ingredient_nutrition_mappings_confidence_check CHECK (
    confidence >= 0 AND confidence <= 1
  ),
  CONSTRAINT ingredient_nutrition_mappings_ingredient_cluster_unique UNIQUE (ingredient_id, cluster_id, default_for_state)
);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_mappings_ingredient_id_idx
  ON ingredient_nutrition_mappings(ingredient_id);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_mappings_cluster_id_idx
  ON ingredient_nutrition_mappings(cluster_id);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_mappings_review_status_idx
  ON ingredient_nutrition_mappings(review_status);

CREATE TABLE IF NOT EXISTS ingredient_nutrition_mapping_review_history (
  review_event_id TEXT PRIMARY KEY,
  mapping_id TEXT NOT NULL REFERENCES ingredient_nutrition_mappings(mapping_id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL,
  cluster_id TEXT NOT NULL,
  previous_review_status TEXT,
  review_decision TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_reason TEXT,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredient_nutrition_mapping_review_history_decision_check CHECK (
    review_decision IN ('suggested', 'approved', 'rejected', 'needs_review')
  )
);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_mapping_review_history_mapping_id_idx
  ON ingredient_nutrition_mapping_review_history(mapping_id);

CREATE INDEX IF NOT EXISTS ingredient_nutrition_mapping_review_history_ingredient_id_idx
  ON ingredient_nutrition_mapping_review_history(ingredient_id);
