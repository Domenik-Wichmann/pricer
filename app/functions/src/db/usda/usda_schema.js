const path = require('path');

const USDA_REQUIRED_FILES = Object.freeze({
  food: 'food.csv',
  nutrient: 'nutrient.csv',
  foodNutrient: 'food_nutrient.csv',
  foodPortion: 'food_portion.csv',
  measureUnit: 'measure_unit.csv',
  foodCategory: 'food_category.csv',
});

function resolveUsdaDatasetRoot(inputRoot = process.env.USDA_DATASET_ROOT) {
  if (inputRoot) {
    return path.resolve(inputRoot);
  }

  return path.resolve(
    process.cwd(),
    'datasets',
    'usda',
    'FoodData_Central_csv_2025-12-18',
    'FoodData_Central_csv_2025-12-18'
  );
}

function resolveUsdaFilePaths(datasetRoot) {
  const root = resolveUsdaDatasetRoot(datasetRoot);
  return Object.fromEntries(
    Object.entries(USDA_REQUIRED_FILES).map(([key, fileName]) => [
      key,
      path.join(root, fileName),
    ])
  );
}

function buildUsdaDatasetId(version = '2025-12-18') {
  return `usda_fdc_${version.replace(/[^0-9]+/g, '_').replace(/^_|_$/g, '')}`;
}

module.exports = {
  USDA_REQUIRED_FILES,
  buildUsdaDatasetId,
  resolveUsdaDatasetRoot,
  resolveUsdaFilePaths,
};
