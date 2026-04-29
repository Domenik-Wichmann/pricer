CREATE TABLE IF NOT EXISTS recipe_feedback_events (
  feedback_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE RESTRICT,
  recipe_key_snapshot TEXT NOT NULL,
  event_type TEXT NOT NULL,
  sentiment_score NUMERIC,
  intent_score NUMERIC,
  reason_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  note_text TEXT,
  note_language TEXT,
  source TEXT NOT NULL,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_feedback_events_event_type_check CHECK (
    event_type IN (
      'impression',
      'swipe_left',
      'swipe_right',
      'swipe_up',
      'saved',
      'cooked',
      'cooked_again',
      'dismissed'
    )
  ),
  CONSTRAINT recipe_feedback_events_sentiment_score_check CHECK (
    sentiment_score IS NULL OR (sentiment_score >= -1.0 AND sentiment_score <= 1.0)
  ),
  CONSTRAINT recipe_feedback_events_intent_score_check CHECK (
    intent_score IS NULL OR (intent_score >= 0.0 AND intent_score <= 1.0)
  ),
  CONSTRAINT recipe_feedback_events_source_check CHECK (
    source IN ('swipe', 'explicit', 'note', 'system')
  ),
  CONSTRAINT recipe_feedback_events_reason_tags_json_check CHECK (
    jsonb_typeof(reason_tags_json) = 'array'
  ),
  CONSTRAINT recipe_feedback_events_context_json_check CHECK (
    jsonb_typeof(context_json) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS recipe_feedback_events_profile_id_idx
  ON recipe_feedback_events(profile_id);

CREATE INDEX IF NOT EXISTS recipe_feedback_events_user_id_idx
  ON recipe_feedback_events(user_id);

CREATE INDEX IF NOT EXISTS recipe_feedback_events_recipe_id_idx
  ON recipe_feedback_events(recipe_id);

CREATE INDEX IF NOT EXISTS recipe_feedback_events_event_type_idx
  ON recipe_feedback_events(event_type);

CREATE INDEX IF NOT EXISTS recipe_feedback_events_created_at_idx
  ON recipe_feedback_events(created_at DESC);

CREATE TABLE IF NOT EXISTS recipe_feedback_note_signals (
  signal_id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES recipe_feedback_events(feedback_id) ON DELETE RESTRICT,
  profile_id TEXT NOT NULL REFERENCES user_food_profiles(profile_id) ON DELETE RESTRICT,
  recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE RESTRICT,
  signal_type TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  signal_value TEXT,
  polarity TEXT NOT NULL,
  confidence NUMERIC,
  extraction_method TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_feedback_note_signals_signal_type_check CHECK (
    signal_type IN (
      'taste',
      'texture',
      'timing',
      'difficulty',
      'substitution',
      'portion_size',
      'family_response',
      'price',
      'availability'
    )
  ),
  CONSTRAINT recipe_feedback_note_signals_polarity_check CHECK (
    polarity IN ('positive', 'negative', 'neutral')
  ),
  CONSTRAINT recipe_feedback_note_signals_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0)
  ),
  CONSTRAINT recipe_feedback_note_signals_extraction_method_check CHECK (
    extraction_method IN ('manual_tag', 'future_llm', 'rule')
  )
);

CREATE INDEX IF NOT EXISTS recipe_feedback_note_signals_feedback_id_idx
  ON recipe_feedback_note_signals(feedback_id);

CREATE INDEX IF NOT EXISTS recipe_feedback_note_signals_profile_id_idx
  ON recipe_feedback_note_signals(profile_id);

CREATE INDEX IF NOT EXISTS recipe_feedback_note_signals_recipe_id_idx
  ON recipe_feedback_note_signals(recipe_id);

CREATE INDEX IF NOT EXISTS recipe_feedback_note_signals_signal_type_idx
  ON recipe_feedback_note_signals(signal_type);
