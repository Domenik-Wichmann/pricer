CREATE TABLE IF NOT EXISTS meal_plans (
  plan_id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES user_food_profiles(profile_id),
  user_id text NOT NULL,
  plan_key text NOT NULL UNIQUE,
  start_date date NOT NULL,
  days integer NOT NULL CHECK (days > 0),
  meals_per_day integer NOT NULL CHECK (meals_per_day > 0 AND meals_per_day <= 4),
  target_calories_per_day numeric,
  target_protein_g numeric,
  target_carbs_g numeric,
  target_fat_g numeric,
  generation_method text NOT NULL,
  rules_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meal_plans_profile_start_idx
  ON meal_plans (profile_id, start_date DESC);

CREATE INDEX IF NOT EXISTS meal_plans_user_start_idx
  ON meal_plans (user_id, start_date DESC);

CREATE TABLE IF NOT EXISTS meal_plan_items (
  item_id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES meal_plans(plan_id) ON DELETE CASCADE,
  day_index integer NOT NULL CHECK (day_index >= 0),
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id text NOT NULL REFERENCES recipes(recipe_id),
  recipe_key_snapshot text NOT NULL,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  selection_score numeric,
  selection_reason_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, day_index, meal_type)
);

CREATE INDEX IF NOT EXISTS meal_plan_items_plan_day_idx
  ON meal_plan_items (plan_id, day_index, meal_type);

CREATE INDEX IF NOT EXISTS meal_plan_items_recipe_idx
  ON meal_plan_items (recipe_id);
