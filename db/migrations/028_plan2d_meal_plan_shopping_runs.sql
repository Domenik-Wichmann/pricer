CREATE TABLE IF NOT EXISTS meal_plan_shopping_runs (
  run_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id) ON DELETE RESTRICT,
  plan_id TEXT REFERENCES meal_plans(plan_id) ON DELETE SET NULL,
  plan_key TEXT,
  requirement_id TEXT REFERENCES meal_plan_requirements(requirement_id) ON DELETE SET NULL,
  net_requirement_id TEXT REFERENCES meal_plan_net_requirements(net_requirement_id) ON DELETE SET NULL,
  candidate_set_id TEXT REFERENCES meal_plan_product_candidate_sets(candidate_set_id) ON DELETE SET NULL,
  optimized_basket_id TEXT REFERENCES meal_plan_optimized_baskets(optimized_basket_id) ON DELETE SET NULL,
  run_key TEXT NOT NULL UNIQUE,
  run_status TEXT NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meal_plan_shopping_runs_run_status_check CHECK (
    run_status IN (
      'started',
      'completed',
      'partial',
      'failed'
    )
  )
);

CREATE INDEX IF NOT EXISTS meal_plan_shopping_runs_user_id_idx
  ON meal_plan_shopping_runs(user_id);

CREATE INDEX IF NOT EXISTS meal_plan_shopping_runs_profile_id_idx
  ON meal_plan_shopping_runs(profile_id);

CREATE INDEX IF NOT EXISTS meal_plan_shopping_runs_plan_id_idx
  ON meal_plan_shopping_runs(plan_id);

CREATE INDEX IF NOT EXISTS meal_plan_shopping_runs_requirement_id_idx
  ON meal_plan_shopping_runs(requirement_id);

CREATE INDEX IF NOT EXISTS meal_plan_shopping_runs_net_requirement_id_idx
  ON meal_plan_shopping_runs(net_requirement_id);

CREATE INDEX IF NOT EXISTS meal_plan_shopping_runs_candidate_set_id_idx
  ON meal_plan_shopping_runs(candidate_set_id);

CREATE INDEX IF NOT EXISTS meal_plan_shopping_runs_optimized_basket_id_idx
  ON meal_plan_shopping_runs(optimized_basket_id);

CREATE INDEX IF NOT EXISTS meal_plan_shopping_runs_run_status_idx
  ON meal_plan_shopping_runs(run_status);
