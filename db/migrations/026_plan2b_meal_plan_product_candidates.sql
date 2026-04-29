CREATE TABLE IF NOT EXISTS meal_plan_product_candidate_sets (
  candidate_set_id TEXT PRIMARY KEY,
  net_requirement_id TEXT NOT NULL REFERENCES meal_plan_net_requirements(net_requirement_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES meal_plans(plan_id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id),
  user_id TEXT NOT NULL,
  candidate_set_key TEXT NOT NULL UNIQUE,
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meal_plan_product_candidate_sets_net_requirement_id_idx
  ON meal_plan_product_candidate_sets(net_requirement_id);

CREATE INDEX IF NOT EXISTS meal_plan_product_candidate_sets_plan_id_idx
  ON meal_plan_product_candidate_sets(plan_id);

CREATE INDEX IF NOT EXISTS meal_plan_product_candidate_sets_profile_id_idx
  ON meal_plan_product_candidate_sets(profile_id);

CREATE INDEX IF NOT EXISTS meal_plan_product_candidate_sets_user_id_idx
  ON meal_plan_product_candidate_sets(user_id);

CREATE TABLE IF NOT EXISTS meal_plan_product_candidates (
  candidate_id TEXT PRIMARY KEY,
  candidate_set_id TEXT NOT NULL REFERENCES meal_plan_product_candidate_sets(candidate_set_id) ON DELETE CASCADE,
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
  product_size_quantity NUMERIC,
  product_size_unit TEXT,
  product_size_grams NUMERIC,
  required_quantity_grams NUMERIC,
  units_needed INTEGER,
  total_purchased_grams NUMERIC,
  overage_grams NUMERIC,
  unit_price NUMERIC,
  total_estimated_price NUMERIC,
  currency TEXT,
  mapping_id TEXT,
  mapping_confidence NUMERIC,
  candidate_confidence NUMERIC,
  candidate_status TEXT NOT NULL,
  selection_reason_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meal_plan_product_candidates_product_size_quantity_check CHECK (
    product_size_quantity IS NULL OR product_size_quantity > 0
  ),
  CONSTRAINT meal_plan_product_candidates_product_size_grams_check CHECK (
    product_size_grams IS NULL OR product_size_grams > 0
  ),
  CONSTRAINT meal_plan_product_candidates_required_quantity_grams_check CHECK (
    required_quantity_grams IS NULL OR required_quantity_grams >= 0
  ),
  CONSTRAINT meal_plan_product_candidates_units_needed_check CHECK (
    units_needed IS NULL OR units_needed >= 0
  ),
  CONSTRAINT meal_plan_product_candidates_total_purchased_grams_check CHECK (
    total_purchased_grams IS NULL OR total_purchased_grams >= 0
  ),
  CONSTRAINT meal_plan_product_candidates_overage_grams_check CHECK (
    overage_grams IS NULL OR overage_grams >= 0
  ),
  CONSTRAINT meal_plan_product_candidates_unit_price_check CHECK (
    unit_price IS NULL OR unit_price >= 0
  ),
  CONSTRAINT meal_plan_product_candidates_total_estimated_price_check CHECK (
    total_estimated_price IS NULL OR total_estimated_price >= 0
  ),
  CONSTRAINT meal_plan_product_candidates_mapping_confidence_check CHECK (
    mapping_confidence IS NULL OR (mapping_confidence >= 0 AND mapping_confidence <= 1)
  ),
  CONSTRAINT meal_plan_product_candidates_candidate_confidence_check CHECK (
    candidate_confidence IS NULL OR (candidate_confidence >= 0 AND candidate_confidence <= 1)
  ),
  CONSTRAINT meal_plan_product_candidates_candidate_status_check CHECK (
    candidate_status IN (
      'ready_for_optimizer',
      'missing_product_mapping',
      'missing_product_size',
      'missing_price',
      'covered_by_inventory',
      'needs_review'
    )
  )
);

CREATE INDEX IF NOT EXISTS meal_plan_product_candidates_candidate_set_id_idx
  ON meal_plan_product_candidates(candidate_set_id);

CREATE INDEX IF NOT EXISTS meal_plan_product_candidates_net_requirement_item_id_idx
  ON meal_plan_product_candidates(net_requirement_item_id);

CREATE INDEX IF NOT EXISTS meal_plan_product_candidates_ingredient_id_idx
  ON meal_plan_product_candidates(ingredient_id);

CREATE INDEX IF NOT EXISTS meal_plan_product_candidates_product_id_idx
  ON meal_plan_product_candidates(product_id);

CREATE INDEX IF NOT EXISTS meal_plan_product_candidates_candidate_status_idx
  ON meal_plan_product_candidates(candidate_status);
