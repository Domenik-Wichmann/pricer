const { spawnSync } = require('node:child_process');

const testFiles = [
  'tests/phase_1_data_backbone.test.js',
  'tests/phase_2_matching.test.js',
  'tests/phase_3_core_flow.test.js',
  'tests/phase_3_5_aggregation.test.js',
  'tests/phase_4_query_engine_and_sync.test.js',
  'tests/phase_5_flutter_app.test.js',
  'tests/phase_5_5_ui_and_growth.test.js',
  'tests/phase_5_6_localization.test.js',
  'tests/phase_6_production_pipeline.test.js',
  'tests/phase_7_demand_intelligence.test.js',
  'tests/phase_8_best_basket.test.js',
  'tests/phase_9_watchlist_intelligence.test.js',
  'tests/phase_10_monetization.test.js',
  'tests/phase_11_production_persistence.test.js',
  'tests/phase_12_search_quality.test.js',
  'tests/phase_15_hyper_rich_enrichment.test.js',
  'tests/phase_15_1_enrichment_readers.test.js',
  'tests/phase_15_2_product_api.test.js',
  'tests/phase_15_3_shopping_list_resolution.test.js',
  'tests/phase_15_4_basket_input_planner.test.js',
  'tests/phase_16_0_price_lookup.test.js',
  'tests/phase_16_1_basket_optimizer.test.js',
  'tests/phase_16_2_multi_store_optimizer.test.js',
  'tests/phase_16_3_basket_explanation.test.js',
  'tests/db1_postgres_foundation.test.js',
  'tests/phase_m0_ingredient.test.js',
  'tests/phase_m0_conversion.test.js',
  'tests/phase_m0_mapping.test.js',
];

let failed = 0;

for (const testFile of testFiles) {
  const result = spawnSync(process.execPath, [testFile], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    failed += 1;
  }
}

if (failed > 0) {
  process.exitCode = 1;
}
