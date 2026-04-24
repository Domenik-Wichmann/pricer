const DEFAULT_BASKET_LIMITS = {
  max_item_candidates: 4,
  max_store_candidates: 4,
  max_store_combination_size: 3,
  max_store_combinations: 12,
  min_match_score: 0.1,
};

const DEFAULT_PREFERENCE_WEIGHTS = {
  price_weight: 1,
  store_weight: 0.75,
  match_weight: 0.2,
};

module.exports = {
  DEFAULT_BASKET_LIMITS,
  DEFAULT_PREFERENCE_WEIGHTS,
};
