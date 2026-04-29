CREATE TABLE IF NOT EXISTS ingredients (
  ingredient_id TEXT PRIMARY KEY,
  ingredient_key TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_bg TEXT,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  ingredient_type TEXT NOT NULL,
  food_family TEXT NOT NULL,
  default_unit TEXT NOT NULL,
  shopping_unit TEXT NOT NULL,
  density_g_per_ml NUMERIC,
  grams_per_piece NUMERIC,
  edible_portion_factor NUMERIC,
  aliases_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_defaults_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  allergen_flags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  dietary_flags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'draft',
  source TEXT NOT NULL,
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredients_review_status_check CHECK (
    review_status IN ('draft', 'active', 'rejected', 'needs_review')
  ),
  CONSTRAINT ingredients_density_g_per_ml_check CHECK (
    density_g_per_ml IS NULL OR density_g_per_ml > 0
  ),
  CONSTRAINT ingredients_grams_per_piece_check CHECK (
    grams_per_piece IS NULL OR grams_per_piece > 0
  ),
  CONSTRAINT ingredients_edible_portion_factor_check CHECK (
    edible_portion_factor IS NULL OR (edible_portion_factor > 0 AND edible_portion_factor <= 1)
  )
);

CREATE INDEX IF NOT EXISTS ingredients_normalized_name_idx
  ON ingredients(normalized_name);

CREATE INDEX IF NOT EXISTS ingredients_review_status_idx
  ON ingredients(review_status);

CREATE INDEX IF NOT EXISTS ingredients_aliases_json_gin_idx
  ON ingredients USING GIN (aliases_json);
