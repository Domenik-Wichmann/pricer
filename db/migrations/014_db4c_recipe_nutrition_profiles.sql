CREATE TABLE IF NOT EXISTS recipe_nutrition_profiles (
  recipe_profile_id TEXT PRIMARY KEY,
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
  source_recipe_profile_candidate_id TEXT NOT NULL REFERENCES recipe_nutrition_profile_candidates(recipe_profile_candidate_id) ON DELETE RESTRICT,
  confidence TEXT NOT NULL,
  review_status TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_decision TEXT,
  review_reason TEXT,
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_nutrition_profiles_source_candidate_unique UNIQUE (source_recipe_profile_candidate_id),
  CONSTRAINT recipe_nutrition_profiles_confidence_check CHECK (
    confidence IN ('high', 'medium', 'low')
  ),
  CONSTRAINT recipe_nutrition_profiles_review_status_check CHECK (
    review_status IN ('approved', 'rejected', 'needs_review', 'superseded')
  ),
  CONSTRAINT recipe_nutrition_profiles_servings_check CHECK (servings > 0),
  CONSTRAINT recipe_nutrition_profiles_count_check CHECK (
    ingredient_count >= 0
    AND ingredients_with_nutrition >= 0
    AND ingredients_missing_nutrition >= 0
    AND ingredient_count = ingredients_with_nutrition + ingredients_missing_nutrition
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS recipe_nutrition_profiles_one_approved_per_recipe_idx
  ON recipe_nutrition_profiles(recipe_id)
  WHERE review_status = 'approved';

CREATE INDEX IF NOT EXISTS recipe_nutrition_profiles_recipe_id_idx
  ON recipe_nutrition_profiles(recipe_id);

CREATE INDEX IF NOT EXISTS recipe_nutrition_profiles_review_status_idx
  ON recipe_nutrition_profiles(review_status);

CREATE INDEX IF NOT EXISTS recipe_nutrition_profiles_source_candidate_idx
  ON recipe_nutrition_profiles(source_recipe_profile_candidate_id);

CREATE TABLE IF NOT EXISTS recipe_nutrition_profile_review_history (
  review_event_id TEXT PRIMARY KEY,
  source_recipe_profile_candidate_id TEXT NOT NULL REFERENCES recipe_nutrition_profile_candidates(recipe_profile_candidate_id) ON DELETE RESTRICT,
  recipe_profile_id TEXT REFERENCES recipe_nutrition_profiles(recipe_profile_id) ON DELETE SET NULL,
  superseded_recipe_profile_id TEXT REFERENCES recipe_nutrition_profiles(recipe_profile_id) ON DELETE SET NULL,
  recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE RESTRICT,
  previous_candidate_review_status TEXT,
  previous_profile_review_status TEXT,
  review_decision TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_reason TEXT,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_nutrition_profile_review_history_decision_check CHECK (
    review_decision IN ('approved', 'rejected', 'needs_review', 'superseded')
  )
);

CREATE INDEX IF NOT EXISTS recipe_nutrition_profile_review_history_candidate_idx
  ON recipe_nutrition_profile_review_history(source_recipe_profile_candidate_id);

CREATE INDEX IF NOT EXISTS recipe_nutrition_profile_review_history_recipe_id_idx
  ON recipe_nutrition_profile_review_history(recipe_id);

CREATE INDEX IF NOT EXISTS recipe_nutrition_profile_review_history_decision_idx
  ON recipe_nutrition_profile_review_history(review_decision);
