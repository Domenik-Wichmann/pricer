CREATE TABLE IF NOT EXISTS ingredient_product_candidates (
  candidate_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  normalized_product_name TEXT NOT NULL,
  brand TEXT,
  size NUMERIC,
  unit TEXT,
  parsed_attributes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_ingredient_key TEXT,
  match_confidence NUMERIC,
  generation_method TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'suggested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredient_product_candidates_product_unique UNIQUE (product_id),
  CONSTRAINT ingredient_product_candidates_confidence_check CHECK (
    match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)
  ),
  CONSTRAINT ingredient_product_candidates_review_status_check CHECK (
    review_status IN ('suggested', 'approved', 'rejected', 'needs_review')
  )
);

CREATE INDEX IF NOT EXISTS ingredient_product_candidates_product_id_idx
  ON ingredient_product_candidates(product_id);

CREATE INDEX IF NOT EXISTS ingredient_product_candidates_proposed_ingredient_key_idx
  ON ingredient_product_candidates(proposed_ingredient_key);

CREATE INDEX IF NOT EXISTS ingredient_product_candidates_review_status_idx
  ON ingredient_product_candidates(review_status);

CREATE TABLE IF NOT EXISTS ingredient_product_mappings (
  mapping_id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL,
  mapping_type TEXT NOT NULL,
  confidence NUMERIC,
  review_status TEXT NOT NULL DEFAULT 'suggested',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  generation_method TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredient_product_mappings_ingredient_product_unique UNIQUE (ingredient_id, product_id),
  CONSTRAINT ingredient_product_mappings_mapping_type_check CHECK (
    mapping_type IN ('exact_match', 'close_match', 'substitute', 'rejected')
  ),
  CONSTRAINT ingredient_product_mappings_review_status_check CHECK (
    review_status IN ('suggested', 'approved', 'rejected', 'needs_review')
  ),
  CONSTRAINT ingredient_product_mappings_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS ingredient_product_mappings_ingredient_id_idx
  ON ingredient_product_mappings(ingredient_id);

CREATE INDEX IF NOT EXISTS ingredient_product_mappings_product_id_idx
  ON ingredient_product_mappings(product_id);

CREATE INDEX IF NOT EXISTS ingredient_product_mappings_review_status_idx
  ON ingredient_product_mappings(review_status);

CREATE TABLE IF NOT EXISTS ingredient_substitution_groups (
  substitution_group_id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE RESTRICT,
  substitution_type TEXT NOT NULL,
  constraints_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority_rank INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ingredient_substitution_groups_ingredient_id_idx
  ON ingredient_substitution_groups(ingredient_id);
