CREATE TABLE IF NOT EXISTS user_food_profiles (
  profile_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  household_size INTEGER,
  default_servings INTEGER,
  weekly_budget_amount NUMERIC,
  weekly_budget_currency TEXT,
  preferred_language TEXT,
  cooking_skill_level TEXT,
  max_prep_time_minutes INTEGER,
  max_total_time_minutes INTEGER,
  meal_prep_preference TEXT,
  nutrition_goal TEXT,
  daily_calorie_target NUMERIC,
  protein_target_g NUMERIC,
  carbs_target_g NUMERIC,
  fat_target_g NUMERIC,
  fiber_target_g NUMERIC,
  sodium_limit_mg NUMERIC,
  review_status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_food_profiles_household_size_check CHECK (
    household_size IS NULL OR household_size > 0
  ),
  CONSTRAINT user_food_profiles_default_servings_check CHECK (
    default_servings IS NULL OR default_servings > 0
  ),
  CONSTRAINT user_food_profiles_weekly_budget_amount_check CHECK (
    weekly_budget_amount IS NULL OR weekly_budget_amount >= 0
  ),
  CONSTRAINT user_food_profiles_max_prep_time_minutes_check CHECK (
    max_prep_time_minutes IS NULL OR max_prep_time_minutes >= 0
  ),
  CONSTRAINT user_food_profiles_max_total_time_minutes_check CHECK (
    max_total_time_minutes IS NULL OR max_total_time_minutes >= 0
  ),
  CONSTRAINT user_food_profiles_daily_calorie_target_check CHECK (
    daily_calorie_target IS NULL OR daily_calorie_target >= 0
  ),
  CONSTRAINT user_food_profiles_protein_target_g_check CHECK (
    protein_target_g IS NULL OR protein_target_g >= 0
  ),
  CONSTRAINT user_food_profiles_carbs_target_g_check CHECK (
    carbs_target_g IS NULL OR carbs_target_g >= 0
  ),
  CONSTRAINT user_food_profiles_fat_target_g_check CHECK (
    fat_target_g IS NULL OR fat_target_g >= 0
  ),
  CONSTRAINT user_food_profiles_fiber_target_g_check CHECK (
    fiber_target_g IS NULL OR fiber_target_g >= 0
  ),
  CONSTRAINT user_food_profiles_sodium_limit_mg_check CHECK (
    sodium_limit_mg IS NULL OR sodium_limit_mg >= 0
  ),
  CONSTRAINT user_food_profiles_review_status_check CHECK (
    review_status IN ('draft', 'active', 'inactive', 'needs_review')
  )
);

CREATE INDEX IF NOT EXISTS user_food_profiles_review_status_idx
  ON user_food_profiles(review_status);

CREATE TABLE IF NOT EXISTS user_food_constraints (
  constraint_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id) ON DELETE RESTRICT,
  constraint_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_key TEXT NOT NULL,
  severity TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_food_constraints_constraint_type_check CHECK (
    constraint_type IN ('allergy', 'intolerance', 'religious', 'medical', 'dislike', 'avoid', 'required')
  ),
  CONSTRAINT user_food_constraints_target_type_check CHECK (
    target_type IN ('ingredient', 'ingredient_family', 'tag', 'cuisine', 'nutrient', 'product_attribute')
  ),
  CONSTRAINT user_food_constraints_severity_check CHECK (
    severity IN ('hard', 'soft', 'preference')
  ),
  CONSTRAINT user_food_constraints_profile_target_unique UNIQUE (
    profile_id, constraint_type, target_type, target_key
  )
);

CREATE INDEX IF NOT EXISTS user_food_constraints_profile_id_idx
  ON user_food_constraints(profile_id);

CREATE INDEX IF NOT EXISTS user_food_constraints_constraint_type_idx
  ON user_food_constraints(constraint_type);

CREATE INDEX IF NOT EXISTS user_food_constraints_target_key_idx
  ON user_food_constraints(target_key);

CREATE TABLE IF NOT EXISTS user_food_preferences (
  preference_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id) ON DELETE RESTRICT,
  preference_type TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  preference_score NUMERIC NOT NULL,
  source TEXT NOT NULL,
  confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_food_preferences_preference_type_check CHECK (
    preference_type IN ('flavor', 'texture', 'cuisine', 'region', 'feeling', 'meal_type', 'cooking_method', 'budget', 'convenience')
  ),
  CONSTRAINT user_food_preferences_source_check CHECK (
    source IN ('explicit', 'inferred', 'swipe', 'note')
  ),
  CONSTRAINT user_food_preferences_score_check CHECK (
    preference_score >= -1.0 AND preference_score <= 1.0
  ),
  CONSTRAINT user_food_preferences_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1.0)
  ),
  CONSTRAINT user_food_preferences_profile_target_unique UNIQUE (
    profile_id, preference_type, preference_key
  )
);

CREATE INDEX IF NOT EXISTS user_food_preferences_profile_id_idx
  ON user_food_preferences(profile_id);

CREATE INDEX IF NOT EXISTS user_food_preferences_preference_type_idx
  ON user_food_preferences(preference_type);

CREATE TABLE IF NOT EXISTS user_equipment (
  equipment_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id) ON DELETE RESTRICT,
  equipment_key TEXT NOT NULL,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_equipment_profile_equipment_unique UNIQUE (profile_id, equipment_key)
);

CREATE INDEX IF NOT EXISTS user_equipment_profile_id_idx
  ON user_equipment(profile_id);

CREATE INDEX IF NOT EXISTS user_equipment_available_idx
  ON user_equipment(available);
