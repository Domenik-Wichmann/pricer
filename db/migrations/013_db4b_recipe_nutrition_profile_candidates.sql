CREATE TABLE IF NOT EXISTS recipe_nutrition_profile_candidates (
  recipe_profile_candidate_id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE RESTRICT,
  total_kcal NUMERIC,
  total_protein_g NUMERIC,
  total_fat_g NUMERIC,
  total_carbs_g NUMERIC,
  total_fiber_g NUMERIC,
  total_sugar_g NUMERIC,
  total_sodium_mg NUMERIC,
  per_serving_kcal NUMERIC,
  per_serving_protein_g NUMERIC,
  per_serving_fat_g NUMERIC,
  per_serving_carbs_g NUMERIC,
  per_serving_fiber_g NUMERIC,
  per_serving_sugar_g NUMERIC,
  per_serving_sodium_mg NUMERIC,
  servings NUMERIC NOT NULL DEFAULT 1,
  ingredient_count INTEGER NOT NULL DEFAULT 0,
  ingredients_with_nutrition INTEGER NOT NULL DEFAULT 0,
  ingredients_missing_nutrition INTEGER NOT NULL DEFAULT 0,
  missing_ingredient_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_profile_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'candidate',
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_nutrition_profile_candidates_recipe_unique UNIQUE (recipe_id),
  CONSTRAINT recipe_nutrition_profile_candidates_confidence_check CHECK (
    confidence IN ('high', 'medium', 'low')
  ),
  CONSTRAINT recipe_nutrition_profile_candidates_review_status_check CHECK (
    review_status IN ('candidate', 'approved', 'rejected', 'needs_review')
  ),
  CONSTRAINT recipe_nutrition_profile_candidates_servings_check CHECK (servings > 0),
  CONSTRAINT recipe_nutrition_profile_candidates_count_check CHECK (
    ingredient_count >= 0
    AND ingredients_with_nutrition >= 0
    AND ingredients_missing_nutrition >= 0
    AND ingredient_count = ingredients_with_nutrition + ingredients_missing_nutrition
  )
);

CREATE INDEX IF NOT EXISTS recipe_nutrition_profile_candidates_recipe_id_idx
  ON recipe_nutrition_profile_candidates(recipe_id);

CREATE INDEX IF NOT EXISTS recipe_nutrition_profile_candidates_review_status_idx
  ON recipe_nutrition_profile_candidates(review_status);

CREATE INDEX IF NOT EXISTS recipe_nutrition_profile_candidates_confidence_idx
  ON recipe_nutrition_profile_candidates(confidence);
