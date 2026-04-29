CREATE TABLE IF NOT EXISTS meal_plan_requirements (
  requirement_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES meal_plans(plan_id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id),
  user_id TEXT NOT NULL,
  requirement_key TEXT NOT NULL UNIQUE,
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meal_plan_requirements_plan_id_idx
  ON meal_plan_requirements(plan_id);

CREATE INDEX IF NOT EXISTS meal_plan_requirements_profile_id_idx
  ON meal_plan_requirements(profile_id);

CREATE INDEX IF NOT EXISTS meal_plan_requirements_user_id_idx
  ON meal_plan_requirements(user_id);

CREATE TABLE IF NOT EXISTS meal_plan_requirement_items (
  requirement_item_id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL REFERENCES meal_plan_requirements(requirement_id) ON DELETE CASCADE,
  ingredient_id TEXT REFERENCES ingredients(ingredient_id) ON DELETE RESTRICT,
  ingredient_key_snapshot TEXT,
  display_name TEXT NOT NULL,
  total_quantity_grams NUMERIC,
  recipe_count INTEGER NOT NULL,
  source_recipe_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_recipe_ingredient_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  shopping_unit TEXT,
  estimated_shopping_quantity NUMERIC,
  estimated_shopping_unit TEXT,
  has_canonical_ingredient BOOLEAN NOT NULL DEFAULT FALSE,
  has_quantity_grams BOOLEAN NOT NULL DEFAULT FALSE,
  adapter_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meal_plan_requirement_items_recipe_count_check CHECK (recipe_count > 0),
  CONSTRAINT meal_plan_requirement_items_total_quantity_grams_check CHECK (
    total_quantity_grams IS NULL OR total_quantity_grams > 0
  ),
  CONSTRAINT meal_plan_requirement_items_estimated_shopping_quantity_check CHECK (
    estimated_shopping_quantity IS NULL OR estimated_shopping_quantity > 0
  ),
  CONSTRAINT meal_plan_requirement_items_adapter_status_check CHECK (
    adapter_status IN (
      'ready_for_product_mapping',
      'missing_ingredient',
      'missing_quantity',
      'needs_review'
    )
  )
);

CREATE INDEX IF NOT EXISTS meal_plan_requirement_items_requirement_id_idx
  ON meal_plan_requirement_items(requirement_id);

CREATE INDEX IF NOT EXISTS meal_plan_requirement_items_ingredient_id_idx
  ON meal_plan_requirement_items(ingredient_id);

CREATE INDEX IF NOT EXISTS meal_plan_requirement_items_adapter_status_idx
  ON meal_plan_requirement_items(adapter_status);
