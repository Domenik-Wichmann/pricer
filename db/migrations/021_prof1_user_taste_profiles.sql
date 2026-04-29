CREATE TABLE IF NOT EXISTS user_taste_profile_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  snapshot_version INTEGER NOT NULL CHECK (snapshot_version > 0),
  source_event_count INTEGER NOT NULL DEFAULT 0 CHECK (source_event_count >= 0),
  source_recipe_count INTEGER NOT NULL DEFAULT 0 CHECK (source_recipe_count >= 0),
  flavor_vector_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  texture_vector_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  cuisine_vector_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  region_vector_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  feeling_vector_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  meal_type_vector_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  cooking_method_vector_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  dietary_pattern_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  disliked_patterns_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  preferred_constraints_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generation_method TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_taste_profile_snapshots_profile_version_unique UNIQUE (profile_id, snapshot_version)
);

CREATE INDEX IF NOT EXISTS user_taste_profile_snapshots_profile_created_idx
  ON user_taste_profile_snapshots(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_taste_profile_snapshots_user_created_idx
  ON user_taste_profile_snapshots(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_taste_profile_signal_sources (
  source_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES user_taste_profile_snapshots(snapshot_id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('explicit_preference', 'swipe_feedback', 'note_signal', 'recipe_metadata')),
  source_ref_id TEXT,
  signal_family TEXT NOT NULL CHECK (signal_family IN ('flavor', 'texture', 'cuisine', 'region', 'feeling', 'meal_type', 'cooking_method', 'dietary', 'dislike')),
  signal_key TEXT NOT NULL,
  signal_score NUMERIC(6, 3) NOT NULL CHECK (signal_score >= -1.0 AND signal_score <= 1.0),
  weight NUMERIC(6, 3) NOT NULL CHECK (weight >= 0.0),
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_taste_profile_signal_sources_snapshot_idx
  ON user_taste_profile_signal_sources(snapshot_id, created_at ASC);

CREATE INDEX IF NOT EXISTS user_taste_profile_signal_sources_profile_idx
  ON user_taste_profile_signal_sources(profile_id, signal_family, signal_key);
