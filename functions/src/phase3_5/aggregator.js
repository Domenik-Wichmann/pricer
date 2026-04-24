const { buildCategoryDailyAggregates } = require('./category_aggregator');
const { buildProductDailyPrices } = require('./product_aggregator');

function buildDailyAggregation({ rawPriceSnapshots, targetDate }) {
  const daySnapshots = rawPriceSnapshots.filter((row) => row.snapshot_date === targetDate);

  return {
    target_date: targetDate,
    snapshot_count: daySnapshots.length,
    product_daily_prices: buildProductDailyPrices({
      snapshots: daySnapshots,
      targetDate,
    }),
    category_daily_aggregates: buildCategoryDailyAggregates({
      snapshots: daySnapshots,
      targetDate,
    }),
  };
}

module.exports = {
  buildDailyAggregation,
};
