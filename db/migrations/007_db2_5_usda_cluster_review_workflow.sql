ALTER TABLE usda_food_clusters
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_decision TEXT,
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

ALTER TABLE usda_food_clusters
  DROP CONSTRAINT IF EXISTS usda_food_clusters_review_status_check;

ALTER TABLE usda_food_clusters
  ADD CONSTRAINT usda_food_clusters_review_status_check CHECK (
    review_status IN ('pending_review', 'approved', 'rejected', 'needs_split', 'needs_merge')
  );

CREATE TABLE IF NOT EXISTS usda_food_cluster_review_history (
  review_event_id TEXT PRIMARY KEY,
  cluster_id TEXT NOT NULL REFERENCES usda_food_clusters(cluster_id) ON DELETE CASCADE,
  cluster_key TEXT NOT NULL,
  previous_review_status TEXT,
  review_decision TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_reason TEXT,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usda_food_cluster_review_history_decision_check CHECK (
    review_decision IN ('pending_review', 'approved', 'rejected', 'needs_split', 'needs_merge')
  )
);

CREATE INDEX IF NOT EXISTS usda_food_cluster_review_history_cluster_id_idx
  ON usda_food_cluster_review_history(cluster_id);

CREATE INDEX IF NOT EXISTS usda_food_cluster_review_history_cluster_key_idx
  ON usda_food_cluster_review_history(cluster_key);
