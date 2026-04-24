const MEAL_SUPPORTED_LOCALES = Object.freeze(['bg', 'en']);
const MEAL_ACTIVE_STATUSES = Object.freeze(['active', 'draft', 'inactive']);
const MEAL_UNIT_TYPES = Object.freeze(['mass', 'volume', 'count', 'derived']);
const MEAL_MAPPING_TYPES = Object.freeze(['exact', 'category', 'weak']);
const MEAL_MAPPING_TYPE_PRIORITIES = Object.freeze({
  exact: 3,
  category: 2,
  weak: 1,
});
const MEAL_RUNTIME_SAFE_INGREDIENT_FIELDS = Object.freeze([
  'classification',
  'purchase_model',
  'dietary_flags',
]);
const MEAL_DEFAULT_PRICE_FALLBACK_CONFIDENCE = Object.freeze({
  exact_local_store_price: 0.95,
  other_store_product_price: 0.8,
  category_average: 0.6,
  ingredient_estimate: 0.4,
});

module.exports = {
  MEAL_ACTIVE_STATUSES,
  MEAL_DEFAULT_PRICE_FALLBACK_CONFIDENCE,
  MEAL_MAPPING_TYPES,
  MEAL_MAPPING_TYPE_PRIORITIES,
  MEAL_RUNTIME_SAFE_INGREDIENT_FIELDS,
  MEAL_SUPPORTED_LOCALES,
  MEAL_UNIT_TYPES,
};
