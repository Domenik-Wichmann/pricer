CREATE TABLE IF NOT EXISTS meal_plan_net_requirements (
  net_requirement_id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL REFERENCES meal_plan_requirements(requirement_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES meal_plans(plan_id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id),
  user_id TEXT NOT NULL,
  net_requirement_key TEXT NOT NULL UNIQUE,
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meal_plan_net_requirements_requirement_id_idx
  ON meal_plan_net_requirements(requirement_id);

CREATE INDEX IF NOT EXISTS meal_plan_net_requirements_plan_id_idx
  ON meal_plan_net_requirements(plan_id);

CREATE INDEX IF NOT EXISTS meal_plan_net_requirements_profile_id_idx
  ON meal_plan_net_requirements(profile_id);

CREATE INDEX IF NOT EXISTS meal_plan_net_requirements_user_id_idx
  ON meal_plan_net_requirements(user_id);

CREATE TABLE IF NOT EXISTS meal_plan_net_requirement_items (
  net_requirement_item_id TEXT PRIMARY KEY,
  net_requirement_id TEXT NOT NULL REFERENCES meal_plan_net_requirements(net_requirement_id) ON DELETE CASCADE,
  requirement_item_id TEXT NOT NULL,
  ingredient_id TEXT REFERENCES ingredients(ingredient_id) ON DELETE RESTRICT,
  ingredient_key_snapshot TEXT,
  display_name TEXT NOT NULL,
  required_quantity_grams NUMERIC,
  inventory_applied_grams NUMERIC NOT NULL DEFAULT 0,
  net_quantity_grams NUMERIC,
  inventory_item_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_recipe_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_recipe_ingredient_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  shopping_unit TEXT,
  estimated_shopping_quantity NUMERIC,
  estimated_shopping_unit TEXT,
  inventory_status TEXT NOT NULL,
  adapter_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meal_plan_net_requirement_items_required_quantity_grams_check CHECK (
    required_quantity_grams IS NULL OR required_quantity_grams >= 0
  ),
  CONSTRAINT meal_plan_net_requirement_items_inventory_applied_grams_check CHECK (
    inventory_applied_grams >= 0
  ),
  CONSTRAINT meal_plan_net_requirement_items_net_quantity_grams_check CHECK (
    net_quantity_grams IS NULL OR net_quantity_grams >= 0
  ),
  CONSTRAINT meal_plan_net_requirement_items_estimated_shopping_quantity_check CHECK (
    estimated_shopping_quantity IS NULL OR estimated_shopping_quantity >= 0
  ),
  CONSTRAINT meal_plan_net_requirement_items_inventory_status_check CHECK (
    inventory_status IN (
      'no_inventory',
      'partially_covered',
      'fully_covered',
      'missing_ingredient',
      'missing_quantity',
      'needs_review'
    )
  ),
  CONSTRAINT meal_plan_net_requirement_items_adapter_status_check CHECK (
    adapter_status IN (
      'ready_for_product_mapping',
      'covered_by_inventory',
      'missing_ingredient',
      'missing_quantity',
      'needs_review'
    )
  )
);

CREATE INDEX IF NOT EXISTS meal_plan_net_requirement_items_net_requirement_id_idx
  ON meal_plan_net_requirement_items(net_requirement_id);

CREATE INDEX IF NOT EXISTS meal_plan_net_requirement_items_requirement_item_id_idx
  ON meal_plan_net_requirement_items(requirement_item_id);

CREATE INDEX IF NOT EXISTS meal_plan_net_requirement_items_ingredient_id_idx
  ON meal_plan_net_requirement_items(ingredient_id);

CREATE INDEX IF NOT EXISTS meal_plan_net_requirement_items_inventory_status_idx
  ON meal_plan_net_requirement_items(inventory_status);

CREATE INDEX IF NOT EXISTS meal_plan_net_requirement_items_adapter_status_idx
  ON meal_plan_net_requirement_items(adapter_status);
