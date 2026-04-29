ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS usability_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS ingredient_match_rate NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nutrition_coverage_rate NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_coverage_rate NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_quality_computed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recipes_usability_status_check'
  ) THEN
    ALTER TABLE recipes
      ADD CONSTRAINT recipes_usability_status_check CHECK (
        usability_status IN (
          'draft',
          'dormant',
          'needs_ingredient_mapping',
          'needs_nutrition',
          'usable',
          'meal_plan_ready'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recipes_ingredient_match_rate_check'
  ) THEN
    ALTER TABLE recipes
      ADD CONSTRAINT recipes_ingredient_match_rate_check CHECK (
        ingredient_match_rate >= 0 AND ingredient_match_rate <= 1
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recipes_nutrition_coverage_rate_check'
  ) THEN
    ALTER TABLE recipes
      ADD CONSTRAINT recipes_nutrition_coverage_rate_check CHECK (
        nutrition_coverage_rate >= 0 AND nutrition_coverage_rate <= 1
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recipes_product_coverage_rate_check'
  ) THEN
    ALTER TABLE recipes
      ADD CONSTRAINT recipes_product_coverage_rate_check CHECK (
        product_coverage_rate >= 0 AND product_coverage_rate <= 1
      );
  END IF;
END $$;

ALTER TABLE recipe_ingredients
  ALTER COLUMN ingredient_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS matched_ingredient_id TEXT REFERENCES ingredients(ingredient_id) ON DELETE RESTRICT;

UPDATE recipe_ingredients
SET matched_ingredient_id = ingredient_id
WHERE matched_ingredient_id IS NULL
  AND ingredient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS recipes_usability_status_idx
  ON recipes(usability_status);

CREATE INDEX IF NOT EXISTS recipe_ingredients_matched_ingredient_id_idx
  ON recipe_ingredients(matched_ingredient_id);

CREATE TABLE IF NOT EXISTS ingredient_gap_candidates (
  gap_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE RESTRICT,
  raw_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  proposed_ingredient_key TEXT,
  occurrences INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredient_gap_candidates_source_type_check CHECK (source_type IN ('recipe')),
  CONSTRAINT ingredient_gap_candidates_occurrences_check CHECK (occurrences > 0),
  CONSTRAINT ingredient_gap_candidates_unique_recipe_gap UNIQUE (source_type, recipe_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS ingredient_gap_candidates_recipe_id_idx
  ON ingredient_gap_candidates(recipe_id);

CREATE INDEX IF NOT EXISTS ingredient_gap_candidates_normalized_name_idx
  ON ingredient_gap_candidates(normalized_name);

CREATE TABLE IF NOT EXISTS recipe_promotion_history (
  id TEXT PRIMARY KEY,
  staged_recipe_id TEXT NOT NULL REFERENCES recipe_ingest_staged_recipes(staged_recipe_id) ON DELETE RESTRICT,
  recipe_id TEXT REFERENCES recipes(recipe_id) ON DELETE RESTRICT,
  decision TEXT NOT NULL,
  reason TEXT,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_promotion_history_decision_check CHECK (
    decision IN ('approved', 'rejected', 'needs_review')
  )
);

CREATE INDEX IF NOT EXISTS recipe_promotion_history_staged_recipe_id_idx
  ON recipe_promotion_history(staged_recipe_id);

CREATE INDEX IF NOT EXISTS recipe_promotion_history_recipe_id_idx
  ON recipe_promotion_history(recipe_id);
