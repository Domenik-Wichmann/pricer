CREATE TABLE IF NOT EXISTS user_inventories (
  inventory_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL UNIQUE,
  inventory_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_inventories_profile_unique UNIQUE (profile_id)
);

CREATE INDEX IF NOT EXISTS user_inventories_user_id_idx
  ON user_inventories(user_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  inventory_item_id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES user_inventories(inventory_id) ON DELETE RESTRICT,
  ingredient_id TEXT REFERENCES ingredients(ingredient_id) ON DELETE RESTRICT,
  ingredient_key_snapshot TEXT,
  product_id TEXT,
  product_name_snapshot TEXT,
  quantity_grams NUMERIC,
  quantity_units NUMERIC,
  unit TEXT,
  estimated_remaining_ratio NUMERIC NOT NULL DEFAULT 1,
  storage_type TEXT NOT NULL DEFAULT 'pantry',
  perishability_class TEXT NOT NULL DEFAULT 'medium',
  estimated_expiry_date DATE,
  last_updated_source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_items_quantity_grams_check CHECK (
    quantity_grams IS NULL OR quantity_grams >= 0
  ),
  CONSTRAINT inventory_items_quantity_units_check CHECK (
    quantity_units IS NULL OR quantity_units >= 0
  ),
  CONSTRAINT inventory_items_estimated_remaining_ratio_check CHECK (
    estimated_remaining_ratio >= 0 AND estimated_remaining_ratio <= 1
  ),
  CONSTRAINT inventory_items_storage_type_check CHECK (
    storage_type IN ('pantry', 'fridge', 'freezer')
  ),
  CONSTRAINT inventory_items_perishability_class_check CHECK (
    perishability_class IN ('short', 'medium', 'long')
  ),
  CONSTRAINT inventory_items_last_updated_source_check CHECK (
    last_updated_source IN ('manual', 'receipt', 'system')
  ),
  CONSTRAINT inventory_items_identity_check CHECK (
    ingredient_id IS NOT NULL
    OR product_id IS NOT NULL
    OR product_name_snapshot IS NOT NULL
    OR ingredient_key_snapshot IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS inventory_items_inventory_id_idx
  ON inventory_items(inventory_id);

CREATE INDEX IF NOT EXISTS inventory_items_ingredient_id_idx
  ON inventory_items(ingredient_id);

CREATE INDEX IF NOT EXISTS inventory_items_product_id_idx
  ON inventory_items(product_id);

CREATE INDEX IF NOT EXISTS inventory_items_storage_type_idx
  ON inventory_items(storage_type);
