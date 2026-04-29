CREATE TABLE IF NOT EXISTS recipes (
  recipe_id TEXT PRIMARY KEY,
  recipe_key TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_bg TEXT,
  canonical_title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  description TEXT,
  cuisine_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  dietary_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  meal_type_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  servings NUMERIC NOT NULL,
  yield_quantity NUMERIC,
  yield_unit TEXT,
  source TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'draft',
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipes_review_status_check CHECK (
    review_status IN ('draft', 'active', 'rejected', 'needs_review')
  ),
  CONSTRAINT recipes_servings_check CHECK (servings > 0),
  CONSTRAINT recipes_yield_quantity_check CHECK (
    yield_quantity IS NULL OR yield_quantity > 0
  )
);

CREATE INDEX IF NOT EXISTS recipes_normalized_title_idx
  ON recipes(normalized_title);

CREATE INDEX IF NOT EXISTS recipes_review_status_idx
  ON recipes(review_status);

CREATE INDEX IF NOT EXISTS recipes_cuisine_tags_json_gin_idx
  ON recipes USING GIN (cuisine_tags_json);

CREATE INDEX IF NOT EXISTS recipes_dietary_tags_json_gin_idx
  ON recipes USING GIN (dietary_tags_json);

CREATE INDEX IF NOT EXISTS recipes_meal_type_tags_json_gin_idx
  ON recipes USING GIN (meal_type_tags_json);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_ingredient_id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE RESTRICT,
  ingredient_key_snapshot TEXT NOT NULL,
  display_name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  quantity_grams NUMERIC,
  preparation_note TEXT,
  optional BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL,
  match_method TEXT NOT NULL,
  match_confidence NUMERIC NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_ingredients_sort_order_check CHECK (sort_order > 0),
  CONSTRAINT recipe_ingredients_quantity_check CHECK (
    quantity IS NULL OR quantity > 0
  ),
  CONSTRAINT recipe_ingredients_quantity_grams_check CHECK (
    quantity_grams IS NULL OR quantity_grams > 0
  ),
  CONSTRAINT recipe_ingredients_match_confidence_check CHECK (
    match_confidence >= 0 AND match_confidence <= 1
  ),
  CONSTRAINT recipe_ingredients_review_status_check CHECK (
    review_status IN ('draft', 'active', 'rejected', 'needs_review')
  ),
  CONSTRAINT recipe_ingredients_recipe_sort_unique UNIQUE (recipe_id, sort_order)
);

CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_id_idx
  ON recipe_ingredients(recipe_id);

CREATE INDEX IF NOT EXISTS recipe_ingredients_ingredient_id_idx
  ON recipe_ingredients(ingredient_id);

CREATE INDEX IF NOT EXISTS recipe_ingredients_review_status_idx
  ON recipe_ingredients(review_status);

CREATE TABLE IF NOT EXISTS recipe_steps (
  recipe_step_id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction TEXT NOT NULL,
  duration_minutes NUMERIC,
  temperature_c NUMERIC,
  equipment_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_steps_step_number_check CHECK (step_number > 0),
  CONSTRAINT recipe_steps_duration_minutes_check CHECK (
    duration_minutes IS NULL OR duration_minutes > 0
  ),
  CONSTRAINT recipe_steps_recipe_step_unique UNIQUE (recipe_id, step_number)
);

CREATE INDEX IF NOT EXISTS recipe_steps_recipe_id_idx
  ON recipe_steps(recipe_id);
