CREATE TABLE IF NOT EXISTS meal_plan_optimized_baskets (
  optimized_basket_id TEXT PRIMARY KEY,
  candidate_set_id TEXT NOT NULL REFERENCES meal_plan_product_candidate_sets(candidate_set_id) ON DELETE CASCADE,
  net_requirement_id TEXT NOT NULL REFERENCES meal_plan_net_requirements(net_requirement_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES meal_plans(plan_id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id),
  user_id TEXT NOT NULL,
  optimizer_run_key TEXT NOT NULL UNIQUE,
  optimizer_version TEXT NOT NULL,
  total_estimated_price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  selected_chain_id TEXT,
  selected_store_id TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  covered_requirement_count INTEGER NOT NULL DEFAULT 0,
  missing_requirement_count INTEGER NOT NULL DEFAULT 0,
  optimizer_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meal_plan_optimized_baskets_total_estimated_price_check CHECK (
    total_estimated_price >= 0
  ),
  CONSTRAINT meal_plan_optimized_baskets_item_count_check CHECK (
    item_count >= 0
  ),
  CONSTRAINT meal_plan_optimized_baskets_covered_requirement_count_check CHECK (
    covered_requirement_count >= 0
  ),
  CONSTRAINT meal_plan_optimized_baskets_missing_requirement_count_check CHECK (
    missing_requirement_count >= 0
  )
);

CREATE INDEX IF NOT EXISTS meal_plan_optimized_baskets_candidate_set_id_idx
  ON meal_plan_optimized_baskets(candidate_set_id);

CREATE INDEX IF NOT EXISTS meal_plan_optimized_baskets_net_requirement_id_idx
  ON meal_plan_optimized_baskets(net_requirement_id);

CREATE INDEX IF NOT EXISTS meal_plan_optimized_baskets_plan_id_idx
  ON meal_plan_optimized_baskets(plan_id);

CREATE INDEX IF NOT EXISTS meal_plan_optimized_baskets_profile_id_idx
  ON meal_plan_optimized_baskets(profile_id);

CREATE INDEX IF NOT EXISTS meal_plan_optimized_baskets_user_id_idx
  ON meal_plan_optimized_baskets(user_id);

CREATE TABLE IF NOT EXISTS meal_plan_optimized_basket_items (
  optimized_basket_item_id TEXT PRIMARY KEY,
  optimized_basket_id TEXT NOT NULL REFERENCES meal_plan_optimized_baskets(optimized_basket_id) ON DELETE CASCADE,
  candidate_id TEXT,
  net_requirement_item_id TEXT NOT NULL REFERENCES meal_plan_net_requirement_items(net_requirement_item_id) ON DELETE CASCADE,
  ingredient_id TEXT REFERENCES ingredients(ingredient_id) ON DELETE RESTRICT,
  ingredient_key_snapshot TEXT,
  display_name TEXT NOT NULL,
  product_id TEXT,
  product_name_snapshot TEXT,
  brand TEXT,
  chain_id TEXT,
  store_id TEXT,
  price_id TEXT,
  units_selected INTEGER,
  total_purchased_grams NUMERIC,
  required_quantity_grams NUMERIC,
  overage_grams NUMERIC,
  unit_price NUMERIC,
  total_price NUMERIC,
  currency TEXT NOT NULL,
  selection_reason_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  item_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meal_plan_optimized_basket_items_units_selected_check CHECK (
    units_selected IS NULL OR units_selected >= 0
  ),
  CONSTRAINT meal_plan_optimized_basket_items_total_purchased_grams_check CHECK (
    total_purchased_grams IS NULL OR total_purchased_grams >= 0
  ),
  CONSTRAINT meal_plan_optimized_basket_items_required_quantity_grams_check CHECK (
    required_quantity_grams IS NULL OR required_quantity_grams >= 0
  ),
  CONSTRAINT meal_plan_optimized_basket_items_overage_grams_check CHECK (
    overage_grams IS NULL OR overage_grams >= 0
  ),
  CONSTRAINT meal_plan_optimized_basket_items_unit_price_check CHECK (
    unit_price IS NULL OR unit_price >= 0
  ),
  CONSTRAINT meal_plan_optimized_basket_items_total_price_check CHECK (
    total_price IS NULL OR total_price >= 0
  ),
  CONSTRAINT meal_plan_optimized_basket_items_item_status_check CHECK (
    item_status IN (
      'selected',
      'covered_by_inventory',
      'missing_product',
      'missing_price',
      'optimizer_excluded',
      'needs_review'
    )
  )
);

CREATE INDEX IF NOT EXISTS meal_plan_optimized_basket_items_optimized_basket_id_idx
  ON meal_plan_optimized_basket_items(optimized_basket_id);

CREATE INDEX IF NOT EXISTS meal_plan_optimized_basket_items_candidate_id_idx
  ON meal_plan_optimized_basket_items(candidate_id);

CREATE INDEX IF NOT EXISTS meal_plan_optimized_basket_items_net_requirement_item_id_idx
  ON meal_plan_optimized_basket_items(net_requirement_item_id);

CREATE INDEX IF NOT EXISTS meal_plan_optimized_basket_items_ingredient_id_idx
  ON meal_plan_optimized_basket_items(ingredient_id);

CREATE INDEX IF NOT EXISTS meal_plan_optimized_basket_items_product_id_idx
  ON meal_plan_optimized_basket_items(product_id);

CREATE INDEX IF NOT EXISTS meal_plan_optimized_basket_items_item_status_idx
  ON meal_plan_optimized_basket_items(item_status);
