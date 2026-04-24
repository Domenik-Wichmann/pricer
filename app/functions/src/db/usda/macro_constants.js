const USDA_MACRO_NUTRIENT_IDS = Object.freeze([
  1008,
  1003,
  1004,
  1005,
  1079,
  2000,
  1093,
  2047,
  2048,
]);

const USDA_MACRO_NUTRIENTS = Object.freeze({
  ENERGY_KCAL: 1008,
  PROTEIN_G: 1003,
  FAT_G: 1004,
  CARBOHYDRATE_G: 1005,
  FIBER_G: 1079,
  SUGARS_G: 2000,
  SODIUM_MG: 1093,
  ENERGY_ATWATER_GENERAL_KCAL: 2047,
  ENERGY_ATWATER_SPECIFIC_KCAL: 2048,
});

function isUsdaMacroNutrientId(value) {
  return USDA_MACRO_NUTRIENT_IDS.includes(Number(value));
}

module.exports = {
  USDA_MACRO_NUTRIENT_IDS,
  USDA_MACRO_NUTRIENTS,
  isUsdaMacroNutrientId,
};
